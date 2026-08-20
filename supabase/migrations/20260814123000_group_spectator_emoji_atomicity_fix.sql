-- Wiki Race 2.0 Packet 13 Hardening follow-up.
-- Keep the existing RPC name and arguments, but return JSONB so an expired
-- spectator request can commit its authoritative finalization as a domain
-- rejection instead of raising after the finalizer.

begin;

drop function if exists public.send_group_spectator_emoji_v13(uuid, text);

create function public.send_group_spectator_emoji_v13(
  p_room_id uuid,
  p_preset_id text
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
  v_last_sent_at timestamptz;
  v_now timestamptz;
  v_event public.room_events;
  v_finalized boolean := false;
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

  -- A finished room is an already-finalized domain rejection. It must return
  -- normally so the caller can commit the state observed by this request.
  if v_room.status = 'finished' then
    return jsonb_build_object(
      'accepted', false,
      'code', 'SPECTATOR_ROOM_EXPIRED',
      'finalized', false,
      'room', to_jsonb(v_room),
      'room_status', v_room.status,
      'state_version', v_room.state_version,
      'event_id', null::uuid
    );
  end if;

  v_now := clock_timestamp();
  if v_room.status in ('playing', 'grace_period')
     and v_room.game_deadline_at is not null
     and v_now >= least(
       v_room.game_deadline_at,
       coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
     ) then
    v_room := private.finalize_group_room_v13(p_room_id, v_now);
    v_finalized := true;
    return jsonb_build_object(
      'accepted', false,
      'code', 'SPECTATOR_ROOM_EXPIRED',
      'finalized', v_finalized,
      'room', to_jsonb(v_room),
      'room_status', v_room.status,
      'state_version', v_room.state_version,
      'event_id', null::uuid
    );
  end if;

  if v_room.status not in ('playing', 'grace_period')
     or v_room.game_deadline_at is null then
    raise exception 'SPECTATOR_ROOM_NOT_ACTIVE';
  end if;

  if p_preset_id not in ('cheer', 'wow', 'hurry', 'clap', 'gg') then
    raise exception 'SPECTATOR_PRESET_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text || ':' || v_user_id::text, 0)
  );

  -- The room lock is held for the whole RPC, but the deadline is checked
  -- again after the per-user lock so a request cannot cross the boundary
  -- while waiting for its rate-limit lock.
  v_now := clock_timestamp();
  if v_now >= least(
    v_room.game_deadline_at,
    coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
  ) then
    v_room := private.finalize_group_room_v13(p_room_id, v_now);
    v_finalized := true;
    return jsonb_build_object(
      'accepted', false,
      'code', 'SPECTATOR_ROOM_EXPIRED',
      'finalized', v_finalized,
      'room', to_jsonb(v_room),
      'room_status', v_room.status,
      'state_version', v_room.state_version,
      'event_id', null::uuid
    );
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

  return jsonb_build_object(
    'accepted', true,
    'code', 'ACCEPTED',
    'event_id', v_event.id,
    'event', to_jsonb(v_event)
  );
end;
$$;

revoke all on function public.send_group_spectator_emoji_v13(uuid, text) from public;
revoke all on function public.send_group_spectator_emoji_v13(uuid, text) from anon;
grant execute on function public.send_group_spectator_emoji_v13(uuid, text) to authenticated;
grant execute on function public.send_group_spectator_emoji_v13(uuid, text) to service_role;

commit;
