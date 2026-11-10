-- REVIEW ONLY: PR-2 room emotes API. NOT an applied migration.
-- Before merging: run "supabase migration new room_emotes_v1" against the
-- checked-out repo, copy this SQL to the CLI-generated file, then verify in an
-- isolated local Supabase stack. Do not apply to Production from this draft.
--
-- Deliberately independent of PR #55 (client Kion asset/UI catalogue).

begin;

-- This table is an internal, non-realtime cooldown ledger. Never grant access
-- to browser roles or register it in the publication.
create table if not exists private.room_emote_rate_limits (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_sent_at timestamptz not null,
  primary key (room_id, user_id)
);

alter table private.room_emote_rate_limits enable row level security;
revoke all on table private.room_emote_rate_limits from public, anon, authenticated;

-- Keep the current Production read-only event contract. Only a server-owned
-- RPC may create room_emote events; existing room event SELECT/RLS stays as-is.
revoke insert, update, delete on table public.room_events from anon, authenticated;

create or replace function public.send_room_emote_v1(
  p_room_id uuid,
  p_emote_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player_status text;
  v_now timestamptz;
  v_rate_timestamp timestamptz;
  v_event public.room_events;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- In particular, never accept sender user_id, arbitrary payload or event_type
  -- from the caller. Whitelist IDs shared with Kion PR-1.
  if p_emote_id is null
     or p_emote_id not in (
       'hello', 'ready', 'go', 'good', 'wait',
       'hurry', 'wow', 'lol', 'sad', 'gg'
     ) then
    return jsonb_build_object('accepted', false, 'code', 'EMOTE_INVALID');
  end if;

  -- FOR SHARE keeps the room state consistent until this transaction commits,
  -- but permits simultaneous sends from different users.
  select * into v_room
  from public.game_rooms
  where id = p_room_id and mode in ('duel', 'group')
  for share;

  if not found then
    return jsonb_build_object('accepted', false, 'code', 'ROOM_NOT_AVAILABLE');
  end if;

  select player_status into v_player_status
  from public.room_players
  where room_id = p_room_id and user_id = v_user_id
  for share;

  if not found then
    -- Do not reveal whether an inaccessible room exists.
    return jsonb_build_object('accepted', false, 'code', 'ROOM_NOT_AVAILABLE');
  end if;

  -- A room cancelled before the match may still contain waiting player rows.
  -- Do not allow a post-game emote from someone who never entered the match.
  if v_room.status = 'finished' then
    if v_player_status not in ('playing', 'finished', 'retired') then
      return jsonb_build_object('accepted', false, 'code', 'SENDER_NOT_ACTIVE');
    end if;
  elsif v_player_status not in ('waiting', 'playing', 'finished') then
    return jsonb_build_object('accepted', false, 'code', 'SENDER_NOT_ACTIVE');
  end if;

  v_now := clock_timestamp();

  if v_room.status in ('playing', 'grace_period')
     and v_room.mode = 'group'
     and (
       v_room.game_deadline_at is null or
       v_now >= least(
         v_room.game_deadline_at,
         coalesce(v_room.grace_ends_at, v_room.game_deadline_at)
       )
     ) then
    -- No side-effectful room finalization here; existing lifecycle owns it.
    return jsonb_build_object('accepted', false, 'code', 'ROOM_EXPIRED');
  end if;

  if v_room.status = 'finished' then
    -- Result-screen GG is supported briefly, not indefinitely.
    if v_room.finished_at is null
       or v_now > v_room.finished_at + interval '2 minutes' then
      return jsonb_build_object('accepted', false, 'code', 'ROOM_EXPIRED');
    end if;
  elsif v_room.status not in ('waiting', 'starting', 'playing', 'grace_period') then
    return jsonb_build_object('accepted', false, 'code', 'ROOM_EXPIRED');
  end if;

  -- Public waiting rooms can be stale before the expiry housekeeping runs.
  -- Never let the emote endpoint silently revive such a room.
  if v_room.status = 'waiting' and v_room.is_public is true
     and not private.public_waiting_room_live_v1(p_room_id) then
    return jsonb_build_object('accepted', false, 'code', 'ROOM_EXPIRED');
  end if;

  -- INSERT .. ON CONFLICT is atomic for two tabs racing with the same user.
  -- An unsuccessful conflict update returns no row and consumes no cooldown.
  insert into private.room_emote_rate_limits(room_id, user_id, last_sent_at)
  values (p_room_id, v_user_id, v_now)
  on conflict (room_id, user_id)
  do update set last_sent_at = excluded.last_sent_at
  where private.room_emote_rate_limits.last_sent_at
        <= excluded.last_sent_at - interval '3 seconds'
  returning last_sent_at into v_rate_timestamp;

  if v_rate_timestamp is null then
    return jsonb_build_object(
      'accepted', false, 'code', 'EMOTE_RATE_LIMIT', 'cooldown_seconds', 3
    );
  end if;

  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id, v_user_id, 'room_emote',
    jsonb_build_object('emoteId', p_emote_id, 'serverSentAt', v_now)
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

revoke all on function public.send_room_emote_v1(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.send_room_emote_v1(uuid, text)
  to authenticated;

commit;
