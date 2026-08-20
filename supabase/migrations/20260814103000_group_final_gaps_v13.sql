-- Wiki Race 2.0 Packet 13: group final gaps.
-- Forward-only additive migration. Historical migrations stay unchanged.

begin;

-- Group rules are scoped to group rooms so duel constraints remain untouched.
alter table public.game_rooms
  alter column game_duration_seconds set default 1200,
  alter column grace_duration_seconds set default 120;

update public.game_rooms
set
  game_duration_seconds = 1200,
  grace_duration_seconds = 120,
  use_items = false
where mode = 'group'
  and status = 'waiting';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_rooms_group_limits_v13_check'
      and conrelid = 'public.game_rooms'::regclass
  ) then
    alter table public.game_rooms
      add constraint game_rooms_group_limits_v13_check
      check (
        mode <> 'group'
        or (
          min_players between 3 and 8
          and max_players between min_players and 8
          and finish_rank_limit = 3
          and use_items = false
        )
      ) not valid;
  end if;
end;
$$;

-- This table is only an atomic server-side rate-limit ledger. It is not a
-- client-readable chat or inventory table and is deliberately not published
-- to Realtime.
create table if not exists public.group_spectator_emoji_rate_limits (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_sent_at timestamptz not null,
  primary key (room_id, user_id)
);

alter table public.group_spectator_emoji_rate_limits enable row level security;
revoke all on table public.group_spectator_emoji_rate_limits
  from public, anon, authenticated, service_role;

-- A deterministic host candidate is shared by waiting-room triggers and the
-- in-game/finished spectator leave RPC. Entry order remains the only priority
-- rule, with id as a stable tie breaker.
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
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found or v_room.host_user_id is distinct from p_departing_user_id then
    return;
  end if;

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
    -- No new host is invented when no participant remains. The legacy
    -- not-null host column is left untouched until the room is removed.
    update public.room_players
    set role = 'guest', updated_at = now()
    where room_id = p_room_id;
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
      'previousHostUserId', p_departing_user_id,
      'nextHostUserId', v_candidate.user_id,
      'selection', 'created_at,id'
    )
  );
end;
$$;

revoke all on function private.reconcile_group_host_v13(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Shared final-state helper. It is called only while the room row is locked by
-- one of the public lifecycle RPCs, so game_end is emitted once.
create or replace function private.finish_group_room_v13(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_total integer;
  v_resolved integer;
  v_finished integer;
  v_winners uuid[];
begin
  select * into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found or v_room.status = 'finished' then
    return v_room;
  end if;

  select
    count(*)::integer,
    count(*) filter (where player_status in ('finished', 'retired'))::integer,
    count(*) filter (where player_status = 'finished')::integer
  into v_total, v_resolved, v_finished
  from public.room_players
  where room_id = p_room_id;

  if v_total = 0 or v_total <> v_resolved then
    return v_room;
  end if;

  select coalesce(
    array_agg(user_id order by rank)
      filter (where rank is not null and rank <= v_room.finish_rank_limit),
    '{}'::uuid[]
  )
  into v_winners
  from public.room_players
  where room_id = p_room_id;

  update public.game_rooms
  set status = 'finished',
      finished_at = coalesce(finished_at, now()),
      finished_count = v_finished,
      winner_user_ids = v_winners,
      finished_reason = 'all_resolved',
      state_version = state_version + 1
  where id = p_room_id
  returning * into v_room;

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id,
    null,
    'game_end',
    jsonb_build_object(
      'finished_count', v_finished,
      'finished_reason', 'all_resolved'
    )
  );

  perform private.sync_group_records(p_room_id);
  return v_room;
end;
$$;

revoke all on function private.finish_group_room_v13(uuid)
  from public, anon, authenticated, service_role;

-- Create only valid group rooms. Group items are explicitly disabled.
create or replace function public.create_group_room(
  p_max_players integer default 6,
  p_min_players integer default 3,
  p_finish_rank_limit integer default 3
)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_room public.game_rooms;
  v_room_code text;
  v_attempt integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_min_players <> 3
     or p_max_players < p_min_players
     or p_max_players > 8
     or p_finish_rank_limit <> 3 then
    raise exception 'GROUP_PLAYER_LIMIT_INVALID';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;

  for v_attempt in 1..5 loop
    begin
      v_room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      insert into public.game_rooms(
        room_code, host_user_id, status, mode, max_players, min_players,
        finish_rank_limit, use_items, game_duration_seconds,
        grace_duration_seconds
      )
      values (
        v_room_code, v_user_id, 'waiting', 'group', p_max_players, p_min_players,
        3, false, 1200, 120
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.room_players(
    room_id, user_id, role, nickname_snapshot, profile_image_snapshot,
    is_ready, move_count, has_finished, path_titles, player_status
  )
  values (
    v_room.id, v_user_id, 'host', v_profile.nickname,
    v_profile.profile_image_url, false, 0, false, '{}', 'waiting'
  );

  return v_room;
end;
$$;

-- Keep join capacity authoritative even if a pre-Packet-13 room row is seen.
create or replace function public.join_group_room(p_room_id uuid)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_profile public.profiles;
  v_player public.room_players;
  v_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_room
  from public.game_rooms
  where id = p_room_id
  for update;
  if not found or v_room.mode <> 'group' then raise exception 'GROUP_ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'waiting' then raise exception 'GROUP_ROOM_NOT_WAITING'; end if;
  if v_room.min_players < 3 or v_room.max_players > 8 then
    raise exception 'GROUP_PLAYER_LIMIT_INVALID';
  end if;

  select * into v_player
  from public.room_players
  where room_id = p_room_id and user_id = v_user_id;
  if found then return v_player; end if;

  select count(*)::integer into v_count
  from public.room_players where room_id = p_room_id;
  if v_count >= v_room.max_players then raise exception 'GROUP_ROOM_FULL'; end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;

  insert into public.room_players(
    room_id, user_id, role, nickname_snapshot, profile_image_snapshot,
    is_ready, move_count, has_finished, path_titles, player_status
  )
  values (
    p_room_id, v_user_id, 'guest', v_profile.nickname,
    v_profile.profile_image_url, false, 0, false, '{}', 'waiting'
  )
  returning * into v_player;
  update public.game_rooms set state_version = state_version + 1 where id = p_room_id;
  return v_player;
end;
$$;

-- V2 start projection with the group-only no-item rule and fixed capacity.
create or replace function public.start_group_room_game_v2(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_start public.room_players;
  v_target public.room_players;
  v_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'group' then raise exception 'GROUP_ROOM_NOT_FOUND'; end if;
  if v_room.host_user_id is distinct from v_user_id then raise exception 'HOST_REQUIRED'; end if;
  if v_room.status <> 'waiting' then raise exception 'GROUP_ROOM_NOT_WAITING'; end if;
  if v_room.min_players <> 3 or v_room.max_players not between 3 and 8 then
    raise exception 'GROUP_PLAYER_LIMIT_INVALID';
  end if;
  if v_room.use_items then raise exception 'GROUP_ITEMS_DISABLED'; end if;

  select count(*)::integer into v_count from public.room_players where room_id = p_room_id;
  if v_count < 3 or v_count > 8 then raise exception 'GROUP_PLAYER_COUNT_INVALID'; end if;
  if exists (
    select 1 from public.room_players
    where room_id = p_room_id
      and (not is_ready or submitted_target_page_id is null)
  ) then raise exception 'GROUP_ALL_PLAYERS_NOT_READY'; end if;

  select * into v_start
  from public.room_players
  where room_id = p_room_id
  order by md5(id::text || p_room_id::text)
  limit 1;
  select * into v_target
  from public.room_players
  where room_id = p_room_id
    and submitted_target_page_id is distinct from v_start.submitted_target_page_id
  order by md5(id::text || p_room_id::text || 'target')
  limit 1;
  if v_target.id is null then raise exception 'GROUP_TARGETS_NOT_DISTINCT'; end if;

  update public.game_rooms
  set status = 'starting',
      group_start_title = v_start.submitted_target_title,
      group_target_title = v_target.submitted_target_title,
      group_start_page_id = v_start.submitted_target_page_id,
      group_start_revision_id = v_start.submitted_target_revision_id,
      group_target_page_id = v_target.submitted_target_page_id,
      group_target_revision_id = v_target.submitted_target_revision_id,
      started_at = now(),
      game_starts_at = null,
      game_deadline_at = null,
      grace_started_at = null,
      grace_ends_at = null,
      finished_at = null,
      finished_count = 0,
      winner_user_ids = '{}',
      finished_reason = null,
      use_items = false,
      game_duration_seconds = 1200,
      grace_duration_seconds = 120,
      state_version = state_version + 1
  where id = p_room_id
  returning * into v_room;

  update public.room_players
  set start_title = v_room.group_start_title,
      target_title = v_room.group_target_title,
      start_page_id = v_room.group_start_page_id,
      start_revision_id = v_room.group_start_revision_id,
      target_page_id = v_room.group_target_page_id,
      target_revision_id = v_room.group_target_revision_id,
      current_title = v_room.group_start_title,
      current_page_id = v_room.group_start_page_id,
      current_revision_id = v_room.group_start_revision_id,
      move_count = 0,
      progress_version = 1,
      has_finished = false,
      finished_at = null,
      rank = null,
      elapsed_seconds = null,
      path_titles = array[v_room.group_start_title],
      path_page_ids = array[v_room.group_start_page_id],
      path_revision_ids = array[v_room.group_start_revision_id],
      player_status = 'waiting',
      retired_at = null,
      retire_reason = null,
      disconnected_at = null,
      updated_at = now()
  where room_id = p_room_id;
  return v_room;
end;
$$;

create or replace function public.activate_group_room_game(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'group' then raise exception 'GROUP_ROOM_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  ) then raise exception 'NOT_A_PARTICIPANT'; end if;
  if v_room.status in ('playing', 'grace_period', 'finished') then return v_room; end if;
  if v_room.status <> 'starting' then raise exception 'GROUP_NOT_STARTING'; end if;

  update public.game_rooms
  set status = 'playing',
      game_duration_seconds = 1200,
      grace_duration_seconds = 120,
      game_starts_at = v_now,
      game_deadline_at = v_now + interval '1200 seconds',
      grace_started_at = null,
      grace_ends_at = null,
      finished_reason = null,
      state_version = state_version + 1
  where id = p_room_id
  returning * into v_room;

  update public.room_players
  set player_status = 'playing', updated_at = v_now
  where room_id = p_room_id and player_status = 'waiting';

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id, auth.uid(), 'group_game_activated',
    jsonb_build_object(
      'game_starts_at', v_room.game_starts_at,
      'game_deadline_at', v_room.game_deadline_at,
      'game_duration_seconds', 1200,
      'grace_duration_seconds', 120
    )
  );
  return v_room;
end;
$$;

-- Hard deadline and grace deadline share one server-time finalizer.
create or replace function private.finalize_group_room_v13(
  p_room_id uuid,
  p_now timestamptz default now()
)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_end_at timestamptz;
  v_reason text;
  v_finished integer;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then return v_room; end if;

  v_room := private.finish_group_room_v13(p_room_id);
  if v_room.status = 'finished' then return v_room; end if;
  if v_room.status not in ('starting', 'playing', 'grace_period')
     or v_room.game_deadline_at is null then
    return v_room;
  end if;

  v_end_at := case
    when v_room.grace_ends_at is null then v_room.game_deadline_at
    else least(v_room.game_deadline_at, v_room.grace_ends_at)
  end;
  if p_now < v_end_at then return v_room; end if;

  v_reason := case
    when v_room.grace_ends_at is not null
      and v_room.grace_ends_at < v_room.game_deadline_at
      and p_now >= v_room.grace_ends_at then 'grace_timeout'
    else 'time_limit'
  end;

  update public.room_players
  set player_status = 'retired',
      has_finished = false,
      rank = null,
      finished_at = null,
      elapsed_seconds = null,
      retired_at = p_now,
      retire_reason = case
        when player_status = 'disconnected' then 'disconnected_timeout'
        else v_reason
      end,
      updated_at = p_now
  where room_id = p_room_id
    and player_status in ('playing', 'disconnected');

  insert into public.group_match_results(
    room_id, user_id, nickname_snapshot, profile_image_snapshot,
    result_status, rank, is_winner, start_title, target_title, current_title,
    move_count, elapsed_seconds, path_titles, finished_at,
    retire_reason, retired_at, finalized_at
  )
  select
    room_id, user_id, nickname_snapshot, profile_image_snapshot,
    'retired', null, false, start_title, target_title, current_title,
    move_count, null, path_titles, null, retire_reason, retired_at, p_now
  from public.room_players
  where room_id = p_room_id
    and player_status = 'retired'
    and retired_at = p_now
  on conflict (room_id, user_id) do update
  set result_status = excluded.result_status,
      rank = null,
      is_winner = false,
      finished_at = null,
      retire_reason = excluded.retire_reason,
      retired_at = excluded.retired_at,
      finalized_at = excluded.finalized_at
  where public.group_match_results.result_status <> 'finished';

  insert into public.room_events(room_id, user_id, event_type, payload)
  select p_room_id, user_id, 'player_retired',
    jsonb_build_object('retire_reason', retire_reason)
  from public.room_players
  where room_id = p_room_id
    and player_status = 'retired'
    and retired_at = p_now;

  perform private.reconcile_group_host_v13(
    p_room_id,
    (select user_id from public.room_players
     where room_id = p_room_id and retired_at = p_now
       and role = 'host' limit 1)
  );

  select count(*)::integer into v_finished
  from public.room_players
  where room_id = p_room_id and player_status = 'finished';

  update public.game_rooms
  set status = 'finished',
      finished_at = p_now,
      finished_count = v_finished,
      winner_user_ids = coalesce((
        select array_agg(user_id order by rank)
        filter (where rank is not null and rank <= v_room.finish_rank_limit)
        from public.room_players where room_id = p_room_id
      ), '{}'::uuid[]),
      finished_reason = v_reason,
      state_version = state_version + 1
  where id = p_room_id
  returning * into v_room;

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id, null, 'game_end',
    jsonb_build_object('finished_count', v_finished, 'finished_reason', v_reason)
  );
  perform private.sync_group_records(p_room_id);
  return v_room;
end;
$$;

create or replace function public.finalize_group_room_if_expired(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  ) then raise exception 'NOT_A_PARTICIPANT'; end if;
  return private.finalize_group_room_v13(p_room_id, now());
end;
$$;

-- The only group progress mutation. A deadline is checked before any link is
-- accepted, so a late finish cannot win a race with the timeout finalizer.
create or replace function public.apply_group_move_v2(
  p_room_id uuid,
  p_request_id uuid,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_to_page_id text default null,
  p_to_revision_id text default null,
  p_to_title_snapshot text default null,
  p_clicked_raw_title text default null,
  p_event_type text default 'NORMAL_LINK',
  p_item_event_id uuid default null,
  p_undone_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
  v_link public.wiki_snapshot_links;
  v_previous public.game_move_events;
  v_response jsonb;
  v_from_id text;
  v_from_revision text;
  v_from_title text;
  v_to_id text := p_to_page_id;
  v_to_revision text := p_to_revision_id;
  v_to_title text := p_to_title_snapshot;
  v_delta integer := 1;
  v_version bigint;
  v_move_count integer;
  v_status text := 'playing';
  v_rank integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select response into v_response
  from public.game_mutation_requests
  where scope = 'group' and game_id = p_room_id
    and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;

  select * into v_room
  from public.game_rooms
  where id = p_room_id and mode = 'group'
  for update;
  if not found then raise exception 'GROUP_ROOM_NOT_FOUND'; end if;

  select * into v_player
  from public.room_players
  where room_id = p_room_id and user_id = v_user_id
  for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_room.status in ('playing', 'grace_period')
     and v_room.game_deadline_at is not null
     and v_now >= least(
       v_room.game_deadline_at,
       coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
     ) then
    v_room := private.finalize_group_room_v13(p_room_id, v_now);
    select * into v_player from public.room_players
    where room_id = p_room_id and user_id = v_user_id;
    v_response := jsonb_build_object(
      'ok', false, 'code', 'GAME_NOT_ACTIVE',
      'room', to_jsonb(v_room), 'player', to_jsonb(v_player)
    );
    insert into public.game_mutation_requests(
      scope, game_id, actor_user_id, request_id, operation, response
    ) values ('group', p_room_id, v_user_id, p_request_id,
      'apply_group_move_v2', v_response);
    return v_response;
  end if;

  if v_room.status not in ('playing', 'grace_period')
     or v_player.player_status <> 'playing' then
    v_response := jsonb_build_object(
      'ok', false, 'code', 'GAME_NOT_ACTIVE',
      'room', to_jsonb(v_room), 'player', to_jsonb(v_player)
    );
    insert into public.game_mutation_requests(
      scope, game_id, actor_user_id, request_id, operation, response
    ) values ('group', p_room_id, v_user_id, p_request_id,
      'apply_group_move_v2', v_response);
    return v_response;
  end if;

  if p_expected_version is distinct from v_player.progress_version then
    v_response := jsonb_build_object(
      'ok', false, 'code', 'STATE_VERSION_CONFLICT',
      'room', to_jsonb(v_room), 'player', to_jsonb(v_player)
    );
    insert into public.game_mutation_requests(
      scope, game_id, actor_user_id, request_id, operation, response
    ) values ('group', p_room_id, v_user_id, p_request_id,
      'apply_group_move_v2', v_response);
    return v_response;
  end if;

  v_from_id := v_player.current_page_id;
  v_from_revision := v_player.current_revision_id;
  v_from_title := v_player.current_title;

  if p_event_type = 'UNDO' then
    select candidate.* into v_previous
    from public.game_move_events candidate
    where candidate.scope = 'group'
      and candidate.game_id = p_room_id
      and candidate.actor_user_id = v_user_id
      and candidate.event_type <> 'UNDO'
      and not exists (
        select 1 from public.game_move_events undo_event
        where undo_event.scope = 'group'
          and undo_event.game_id = p_room_id
          and undo_event.actor_user_id = v_user_id
          and undo_event.undone_event_id = candidate.id
      )
    order by candidate.server_timestamp desc, candidate.id desc
    limit 1;
    if not found or coalesce(array_length(v_player.path_page_ids, 1), 0) < 2 then
      v_response := jsonb_build_object(
        'ok', false, 'code', 'UNDO_UNAVAILABLE',
        'room', to_jsonb(v_room), 'player', to_jsonb(v_player)
      );
      insert into public.game_mutation_requests(
        scope, game_id, actor_user_id, request_id, operation, response
      ) values ('group', p_room_id, v_user_id, p_request_id,
        'apply_group_move_v2', v_response);
      return v_response;
    end if;
    v_to_id := v_previous.from_page_id;
    v_to_revision := v_previous.from_revision_id;
    v_to_title := v_previous.from_title_snapshot;
    v_delta := case when v_previous.event_type = 'FORCED_LINK' then -1 else 1 end;
    p_undone_event_id := v_previous.id;
  elsif p_event_type = 'NORMAL_LINK' then
    select link.* into v_link
    from public.wiki_page_snapshots snapshot
    join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
    where snapshot.page_id = v_player.current_page_id
      and snapshot.revision_id = v_player.current_revision_id
      and link.target_page_id = p_to_page_id
    limit 1;
    if not found then
      v_response := jsonb_build_object(
        'ok', false, 'code', 'LINK_NOT_ALLOWED',
        'room', to_jsonb(v_room), 'player', to_jsonb(v_player)
      );
      insert into public.game_mutation_requests(
        scope, game_id, actor_user_id, request_id, operation, response
      ) values ('group', p_room_id, v_user_id, p_request_id,
        'apply_group_move_v2', v_response);
      return v_response;
    end if;
    v_to_id := v_link.target_page_id;
    v_to_revision := private.resolve_wiki_revision(
      v_link.target_page_id, v_link.target_revision_id
    );
    v_to_title := v_link.target_title_snapshot;
  else
    raise exception 'UNSUPPORTED_EVENT_TYPE';
  end if;

  if nullif(v_to_id, '') is null or nullif(v_to_title, '') is null then
    raise exception 'MOVE_TARGET_REQUIRED';
  end if;

  v_version := v_player.progress_version + 1;
  v_move_count := greatest(0, v_player.move_count + v_delta);
  if p_event_type = 'UNDO' then
    v_player.path_page_ids := v_player.path_page_ids[1:greatest(1, array_length(v_player.path_page_ids, 1) - 1)];
    v_player.path_revision_ids := v_player.path_revision_ids[1:greatest(1, array_length(v_player.path_revision_ids, 1) - 1)];
    v_player.path_titles := v_player.path_titles[1:greatest(1, array_length(v_player.path_titles, 1) - 1)];
  else
    v_player.path_page_ids := array_append(v_player.path_page_ids, v_to_id);
    v_player.path_revision_ids := array_append(v_player.path_revision_ids, coalesce(v_to_revision, ''));
    v_player.path_titles := array_append(v_player.path_titles, v_to_title);
  end if;

  if v_to_id = v_player.target_page_id then
    select count(*) + 1 into v_rank
    from public.room_players
    where room_id = p_room_id and player_status = 'finished';
    v_status := 'finished';
  end if;

  update public.room_players
  set current_page_id = v_to_id,
      current_revision_id = coalesce(v_to_revision, current_revision_id),
      current_title = v_to_title,
      move_count = v_move_count,
      progress_version = v_version,
      path_page_ids = v_player.path_page_ids,
      path_revision_ids = v_player.path_revision_ids,
      path_titles = v_player.path_titles,
      player_status = v_status,
      has_finished = (v_status = 'finished'),
      finished_at = case when v_status = 'finished' then v_now else null end,
      rank = case when v_status = 'finished' then v_rank else null end,
      elapsed_seconds = case when v_status = 'finished'
        then greatest(0, floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer)
        else null end,
      updated_at = v_now,
      last_seen_at = v_now,
      heartbeat_at = v_now
  where id = v_player.id
  returning * into v_player;

  update public.game_rooms
  set finished_count = (
        select count(*) from public.room_players
        where room_id = p_room_id and player_status = 'finished'
      ),
      state_version = state_version + 1
  where id = p_room_id
  returning * into v_room;

  insert into public.game_move_events(
    scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
    event_type, from_page_id, from_revision_id, from_title_snapshot,
    to_page_id, to_revision_id, to_title_snapshot, clicked_raw_title,
    move_delta, move_count_after, version_before, version_after,
    item_event_id, undone_event_id, metadata
  ) values (
    'group', p_room_id, v_user_id, v_user_id, p_request_id,
    coalesce(p_correlation_id, p_request_id), p_event_type,
    v_from_id, v_from_revision, v_from_title, v_to_id, v_to_revision,
    v_to_title, p_clicked_raw_title, v_delta, v_move_count,
    v_version - 1, v_version, p_item_event_id, p_undone_event_id,
    jsonb_build_object('room_state_version', v_room.state_version, 'status', v_status)
  ) returning * into v_previous;

  if v_status = 'finished' then
    insert into public.group_match_results(
      room_id, user_id, nickname_snapshot, profile_image_snapshot,
      result_status, rank, is_winner, start_title, target_title, current_title,
      move_count, elapsed_seconds, path_titles, finished_at, finalized_at
    ) values (
      p_room_id, v_user_id, v_player.nickname_snapshot,
      v_player.profile_image_snapshot, 'finished', v_rank,
      v_rank <= v_room.finish_rank_limit, v_player.start_title,
      v_player.target_title, v_player.current_title, v_player.move_count,
      v_player.elapsed_seconds, v_player.path_titles, v_now, v_now
    ) on conflict (room_id, user_id) do update
    set result_status = 'finished', rank = excluded.rank,
        is_winner = excluded.is_winner, current_title = excluded.current_title,
        move_count = excluded.move_count, elapsed_seconds = excluded.elapsed_seconds,
        path_titles = excluded.path_titles, finished_at = excluded.finished_at,
        finalized_at = excluded.finalized_at
    where public.group_match_results.result_status <> 'finished';

    insert into public.room_events(room_id, user_id, event_type, payload)
    values (
      p_room_id, v_user_id, 'player_finish',
      jsonb_build_object('rank', v_rank, 'elapsed_seconds', v_player.elapsed_seconds,
        'move_count', v_player.move_count)
    );

    if v_rank = v_room.finish_rank_limit
       and v_room.status = 'playing'
       and v_room.grace_started_at is null then
      update public.game_rooms
      set status = 'grace_period',
          grace_started_at = v_now,
          grace_ends_at = least(v_now + interval '120 seconds', game_deadline_at),
          state_version = state_version + 1
      where id = p_room_id
      returning * into v_room;
      insert into public.room_events(room_id, user_id, event_type, payload)
      values (
        p_room_id, v_user_id, 'grace_started',
        jsonb_build_object('grace_started_at', v_room.grace_started_at,
          'grace_ends_at', v_room.grace_ends_at)
      );
    end if;
  end if;

  v_room := private.finish_group_room_v13(p_room_id);
  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = v_user_id;
  v_response := jsonb_build_object(
    'ok', true, 'code', 'APPLIED', 'room', to_jsonb(v_room),
    'player', to_jsonb(v_player), 'event', to_jsonb(v_previous)
  );
  insert into public.game_mutation_requests(
    scope, game_id, actor_user_id, request_id, operation, response
  ) values ('group', p_room_id, v_user_id, p_request_id,
    'apply_group_move_v2', v_response);
  return v_response;
end;
$$;

-- RETIRE/leave is also the atomic host-transfer path. Finished spectators are
-- removed from room membership on explicit leave, while group results remain.
create or replace function public.leave_group_player(
  p_room_id uuid,
  p_retire_reason text
)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_retire_reason not in ('left', 'forfeited') then
    raise exception 'RETIRE_REASON_INVALID';
  end if;

  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'group' then raise exception 'GROUP_ROOM_NOT_FOUND'; end if;
  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = v_user_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_room.status = 'waiting' then
    delete from public.room_players where id = v_player.id;
    perform private.reconcile_group_host_v13(p_room_id, v_user_id);
    select * into v_room from public.game_rooms where id = p_room_id;
    return v_room;
  end if;

  if v_player.player_status = 'finished' then
    delete from public.room_players where id = v_player.id;
    perform private.reconcile_group_host_v13(p_room_id, v_user_id);
    select * into v_room from public.game_rooms where id = p_room_id;
    if v_room.status <> 'finished' then
      v_room := private.finish_group_room_v13(p_room_id);
    end if;
    return v_room;
  end if;

  if v_player.player_status = 'retired' or v_room.status = 'finished' then
    return v_room;
  end if;

  if v_room.status in ('starting', 'playing', 'grace_period')
     and v_room.game_deadline_at is not null
     and v_now >= least(
       v_room.game_deadline_at,
       coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
     ) then
    return private.finalize_group_room_v13(p_room_id, v_now);
  end if;

  if v_room.status not in ('starting', 'playing', 'grace_period') then
    return v_room;
  end if;

  update public.room_players
  set player_status = 'retired',
      has_finished = false,
      rank = null,
      finished_at = null,
      elapsed_seconds = null,
      retired_at = v_now,
      retire_reason = p_retire_reason,
      updated_at = v_now
  where id = v_player.id;

  insert into public.group_match_results(
    room_id, user_id, nickname_snapshot, profile_image_snapshot,
    result_status, rank, is_winner, start_title, target_title, current_title,
    move_count, elapsed_seconds, path_titles, finished_at,
    retire_reason, retired_at, finalized_at
  ) values (
    p_room_id, v_user_id, v_player.nickname_snapshot,
    v_player.profile_image_snapshot, 'retired', null, false,
    v_player.start_title, v_player.target_title, v_player.current_title,
    v_player.move_count, null, v_player.path_titles, null,
    p_retire_reason, v_now, v_now
  ) on conflict (room_id, user_id) do update
  set result_status = 'retired', rank = null, is_winner = false,
      finished_at = null, retire_reason = excluded.retire_reason,
      retired_at = excluded.retired_at, finalized_at = excluded.finalized_at
  where public.group_match_results.result_status <> 'finished';

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (p_room_id, v_user_id, 'player_retired',
    jsonb_build_object('retire_reason', p_retire_reason));

  perform private.reconcile_group_host_v13(p_room_id, v_user_id);
  v_room := private.finish_group_room_v13(p_room_id);
  if v_room.status <> 'finished' then
    update public.game_rooms
    set finished_count = (
          select count(*) from public.room_players
          where room_id = p_room_id and player_status = 'finished'
        ),
        state_version = state_version + 1
    where id = p_room_id
    returning * into v_room;
  end if;
  return v_room;
end;
$$;

-- Preset reactions are the only spectator communication surface. Payloads do
-- not accept user text, and direct room_events INSERT remains blocked for group
-- clients by the V2 cutover policies.
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
  v_now timestamptz := now();
  v_event public.room_events;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_preset_id not in ('cheer', 'wow', 'hurry', 'clap', 'gg') then
    raise exception 'SPECTATOR_PRESET_INVALID';
  end if;

  select * into v_room from public.game_rooms
  where id = p_room_id and mode = 'group' for update;
  if not found then raise exception 'GROUP_ROOM_NOT_FOUND'; end if;
  if v_room.status not in ('playing', 'grace_period') then
    raise exception 'SPECTATOR_ROOM_NOT_ACTIVE';
  end if;

  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = v_user_id for update;
  if not found or v_player.player_status <> 'finished' then
    raise exception 'SPECTATOR_FINISH_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text || ':' || v_user_id::text, 0)
  );
  select last_sent_at into v_last_sent_at
  from public.group_spectator_emoji_rate_limits
  where room_id = p_room_id and user_id = v_user_id
  for update;
  if v_last_sent_at is not null and v_last_sent_at > v_now - interval '3 seconds' then
    raise exception 'SPECTATOR_EMOJI_RATE_LIMIT';
  end if;

  insert into public.group_spectator_emoji_rate_limits(room_id, user_id, last_sent_at)
  values (p_room_id, v_user_id, v_now)
  on conflict (room_id, user_id) do update set last_sent_at = excluded.last_sent_at;

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id, v_user_id, 'group_spectator_emoji',
    jsonb_build_object('presetId', p_preset_id, 'serverSentAt', v_now)
  )
  returning * into v_event;
  return v_event;
end;
$$;

-- SECURITY DEFINER is required for the guarded room_events insert. Keep the
-- browser role limited to these explicit RPCs.
revoke all on function public.create_group_room(integer, integer, integer)
  from public, anon;
grant execute on function public.create_group_room(integer, integer, integer)
  to authenticated, service_role;
revoke all on function public.join_group_room(uuid) from public, anon;
grant execute on function public.join_group_room(uuid) to authenticated, service_role;
revoke all on function public.start_group_room_game_v2(uuid) from public, anon;
grant execute on function public.start_group_room_game_v2(uuid) to authenticated, service_role;
revoke all on function public.activate_group_room_game(uuid) from public, anon;
grant execute on function public.activate_group_room_game(uuid) to authenticated, service_role;
revoke all on function public.finalize_group_room_if_expired(uuid) from public, anon;
grant execute on function public.finalize_group_room_if_expired(uuid) to authenticated, service_role;
revoke all on function public.apply_group_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.apply_group_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid)
  to authenticated, service_role;
revoke all on function public.leave_group_player(uuid, text) from public, anon;
grant execute on function public.leave_group_player(uuid, text) to authenticated, service_role;
revoke all on function public.send_group_spectator_emoji_v13(uuid, text)
  from public, anon;
grant execute on function public.send_group_spectator_emoji_v13(uuid, text)
  to authenticated, service_role;

commit;
