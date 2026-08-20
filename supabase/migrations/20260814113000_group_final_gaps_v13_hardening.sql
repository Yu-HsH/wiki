-- Wiki Race 2.0 Packet 13 hardening.
-- Forward-only follow-up migration. The original Packet 13 migration stays intact.

begin;

-- host_user_id is the active group host reference, not a separate historical
-- creator field. A finished room may legitimately have no active members, so
-- the active host reference must be nullable. Duel rooms continue to require
-- a host through the non-group check below and their RPCs still write a host.
alter table public.game_rooms
  alter column host_user_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_rooms_non_group_host_required_v13_check'
      and conrelid = 'public.game_rooms'::regclass
  ) then
    alter table public.game_rooms
      add constraint game_rooms_non_group_host_required_v13_check
      check (mode = 'group' or host_user_id is not null)
      not valid;
  end if;
end;
$$;

-- Waiting rows are the only historical group rows safe to normalize to the
-- final group rules. Playing/finished rows are left untouched and reported by
-- the preflight query in supabase/tests/group_final_gaps_v13_hardening_preflight.sql.
update public.game_rooms
set
  min_players = 3,
  max_players = greatest(3, least(max_players, 8)),
  finish_rank_limit = 3,
  use_items = false,
  game_duration_seconds = 1200,
  grace_duration_seconds = 120
where mode = 'group'
  and status = 'waiting';

-- Validate only when no historical group row violates the Packet 13 shape.
-- New rows remain protected by the NOT VALID constraint even when old history
-- needs an explicit operational decision.
do $$
declare
  v_invalid_group_rows bigint;
  v_constraint_validated boolean;
begin
  select convalidated
  into v_constraint_validated
  from pg_constraint
  where conname = 'game_rooms_group_limits_v13_check'
    and conrelid = 'public.game_rooms'::regclass;

  select count(*)
  into v_invalid_group_rows
  from public.game_rooms
  where mode = 'group'
    and not (
      min_players between 3 and 8
      and max_players between min_players and 8
      and finish_rank_limit = 3
      and use_items = false
    );

  if coalesce(v_constraint_validated, false) = false
     and v_invalid_group_rows = 0 then
    execute 'alter table public.game_rooms validate constraint game_rooms_group_limits_v13_check';
  end if;
end;
$$;

-- The hardening migration also introduces a non-group host invariant. Validate
-- it when existing duel/other-mode rows already satisfy the condition.
do $$
declare
  v_invalid_non_group_rows bigint;
  v_constraint_validated boolean;
begin
  select convalidated
  into v_constraint_validated
  from pg_constraint
  where conname = 'game_rooms_non_group_host_required_v13_check'
    and conrelid = 'public.game_rooms'::regclass;

  select count(*)
  into v_invalid_non_group_rows
  from public.game_rooms
  where mode <> 'group'
    and host_user_id is null;

  if coalesce(v_constraint_validated, false) = false
     and v_invalid_non_group_rows = 0 then
    execute 'alter table public.game_rooms validate constraint game_rooms_non_group_host_required_v13_check';
  end if;
end;
$$;

-- Keep one active host when a member remains. Retired rows are result
-- projections, not active members. If no non-retired member remains, clear the
-- active host reference instead of preserving a stale user id.
create or replace function private.reconcile_group_host_v13(
  p_room_id uuid,
  p_departing_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_candidate public.room_players;
  v_previous_host uuid;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    return;
  end if;

  if p_departing_user_id is null then
    if v_room.host_user_id is not null then
      return;
    end if;
  elsif v_room.host_user_id is distinct from p_departing_user_id then
    return;
  end if;

  v_previous_host := v_room.host_user_id;

  select *
  into v_candidate
  from public.room_players
  where room_id = p_room_id
    and user_id is distinct from p_departing_user_id
    and player_status <> 'retired'
  order by created_at asc, id asc
  limit 1
  for update;

  if not found then
    update public.room_players
    set role = 'guest', updated_at = now()
    where room_id = p_room_id;

    update public.game_rooms
    set host_user_id = null,
        state_version = state_version + 1
    where id = p_room_id;

    if v_previous_host is not null then
      insert into public.room_events(room_id, user_id, event_type, payload)
      values (
        p_room_id,
        p_departing_user_id,
        'host_cleared',
        jsonb_build_object(
          'previousHostUserId', v_previous_host,
          'reason', 'no_active_members'
        )
      );
    end if;
    return;
  end if;

  update public.room_players
  set role = case when user_id = v_candidate.user_id then 'host' else 'guest' end,
      updated_at = now()
  where room_id = p_room_id;

  update public.game_rooms
  set host_user_id = v_candidate.user_id,
      state_version = state_version + 1
  where id = p_room_id;

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id,
    p_departing_user_id,
    'host_transferred',
    jsonb_build_object(
      'previousHostUserId', v_previous_host,
      'nextHostUserId', v_candidate.user_id,
      'selection', 'created_at,id'
    )
  );
end;
$$;

revoke all on function private.reconcile_group_host_v13(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Repair only non-waiting rooms whose active host reference is already
-- missing or points at a retired/non-member row. Waiting-room last-leave
-- deletion remains owned by the existing Phase 2C trigger.
do $$
declare
  v_room record;
begin
  for v_room in
    select room.id, room.host_user_id
    from public.game_rooms room
    where room.mode = 'group'
      and room.status <> 'waiting'
      and (
        (
          room.host_user_id is null
          and exists (
            select 1 from public.room_players player
            where player.room_id = room.id
              and player.player_status <> 'retired'
          )
        )
        or (
          room.host_user_id is not null
          and not exists (
            select 1 from public.room_players player
            where player.room_id = room.id
              and player.user_id = room.host_user_id
              and player.player_status <> 'retired'
          )
        )
      )
  loop
    perform private.reconcile_group_host_v13(v_room.id, v_room.host_user_id);
  end loop;
end;
$$;

-- Group-only expiry must reject another mode before any group finalization
-- helper can mutate the room.
create or replace function public.finalize_group_room_if_expired(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'GROUP_ROOM_NOT_FOUND';
  end if;

  if v_room.mode <> 'group' then
    raise exception 'NOT_A_GROUP';
  end if;

  if not exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  ) then
    raise exception 'NOT_A_PARTICIPANT';
  end if;

  return private.finalize_group_room_v13(p_room_id, clock_timestamp());
end;
$$;

-- Spectator emoji requests participate in the same locked deadline finalizer
-- path as moves and explicit leave. The rate ledger is touched only after the
-- latest room state proves the request is still inside the effective deadline.
create or replace function public.send_group_spectator_emoji_v13(
  p_room_id uuid,
  p_preset_id text
)
returns public.room_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
  v_last_sent_at timestamptz;
  v_now timestamptz;
  v_event public.room_events;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'GROUP_ROOM_NOT_FOUND';
  end if;
  if v_room.mode <> 'group' then
    raise exception 'NOT_A_GROUP';
  end if;

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = v_user_id
  for update;

  if not found or v_player.player_status <> 'finished' then
    raise exception 'SPECTATOR_FINISH_REQUIRED';
  end if;

  v_now := clock_timestamp();
  if v_room.status in ('playing', 'grace_period')
     and v_room.game_deadline_at is not null
     and v_now >= least(
       v_room.game_deadline_at,
       coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
     ) then
    v_room := private.finalize_group_room_v13(p_room_id, v_now);
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;
  v_now := clock_timestamp();

  if v_room.status = 'finished' then
    raise exception 'SPECTATOR_ROOM_EXPIRED';
  end if;
  if v_room.status not in ('playing', 'grace_period')
     or v_room.game_deadline_at is null then
    raise exception 'SPECTATOR_ROOM_NOT_ACTIVE';
  end if;
  if v_now >= least(
    v_room.game_deadline_at,
    coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
  ) then
    v_room := private.finalize_group_room_v13(p_room_id, v_now);
    raise exception 'SPECTATOR_ROOM_EXPIRED';
  end if;

  if p_preset_id not in ('cheer', 'wow', 'hurry', 'clap', 'gg') then
    raise exception 'SPECTATOR_PRESET_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text || ':' || v_user_id::text, 0)
  );

  -- Recheck after waiting for the per-user lock so a request cannot cross the
  -- deadline while another emoji request is holding the rate-limit lock.
  v_now := clock_timestamp();
  if v_now >= least(
    v_room.game_deadline_at,
    coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
  ) then
    v_room := private.finalize_group_room_v13(p_room_id, v_now);
    raise exception 'SPECTATOR_ROOM_EXPIRED';
  end if;

  select last_sent_at
  into v_last_sent_at
  from public.group_spectator_emoji_rate_limits
  where room_id = p_room_id
    and user_id = v_user_id
  for update;

  if v_last_sent_at is not null
     and v_last_sent_at > v_now - interval '3 seconds' then
    raise exception 'SPECTATOR_EMOJI_RATE_LIMIT';
  end if;

  insert into public.group_spectator_emoji_rate_limits(room_id, user_id, last_sent_at)
  values (p_room_id, v_user_id, v_now)
  on conflict (room_id, user_id)
  do update set last_sent_at = excluded.last_sent_at;

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id,
    v_user_id,
    'group_spectator_emoji',
    jsonb_build_object('presetId', p_preset_id, 'serverSentAt', v_now)
  )
  returning * into v_event;
  return v_event;
end;
$$;

revoke all on function public.finalize_group_room_if_expired(uuid)
  from public, anon;
grant execute on function public.finalize_group_room_if_expired(uuid)
  to authenticated, service_role;
revoke all on function public.send_group_spectator_emoji_v13(uuid, text)
  from public, anon;
grant execute on function public.send_group_spectator_emoji_v13(uuid, text)
  to authenticated, service_role;

commit;
