-- Supabase CLI generated filename in isolated Actions runner (2026-11-09 02:21:38 UTC).
-- Local pgTAP verified. Production application requires separate explicit approval.
-- Idle public waiting rooms expire after 2h without authenticated host pulse.
-- Do NOT use status='finished': group finished triggers award XP/achievements.

alter table public.game_rooms drop constraint if exists game_rooms_status_check;
alter table public.game_rooms add constraint game_rooms_status_check
  check (status in ('waiting', 'starting', 'playing', 'grace_period', 'finished', 'expired'));

create or replace function private.public_waiting_room_live_v1(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $func$
  select exists (
    select 1 from public.game_rooms r
    join public.room_players hp on hp.room_id=r.id and hp.user_id=r.host_user_id
    where r.id=p_room_id and r.is_public is true and r.status='waiting'
      and hp.last_seen_at >= now() - interval '2 hours'
  );
$func$;
revoke all on function private.public_waiting_room_live_v1(uuid) from public, anon, authenticated;

create or replace function private.expire_stale_public_waiting_rooms_v1(p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path = ''
as $func$
declare v_count integer := 0;
begin
  -- Room-row locks serialize cleanup with heartbeat, public join and code join.
  with stale as (
    select r.id from public.game_rooms r
    where r.is_public is true and r.status='waiting'
      and not exists (
        select 1 from public.room_players hp
        where hp.room_id=r.id and hp.user_id=r.host_user_id
          and hp.last_seen_at >= now() - interval '2 hours'
      )
    order by r.created_at asc
    limit least(greatest(coalesce(p_limit, 1), 1), 100)
    for update of r skip locked
  )
  update public.game_rooms r set
    status='expired', finished_at=now(), finished_reason='cancelled',
    state_version=r.state_version+1
  from stale where r.id=stale.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$func$;
revoke all on function private.expire_stale_public_waiting_rooms_v1(integer) from public, anon, authenticated;

create or replace function public.heartbeat_public_waiting_room_v1(p_room_id uuid)
returns boolean language plpgsql volatile security definer set search_path = ''
as $func$
declare v_room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then return false; end if;
  if v_room.host_user_id is distinct from auth.uid() then
    raise exception 'PUBLIC_ROOM_HOST_ONLY';
  end if;
  if v_room.is_public is not true or v_room.status <> 'waiting' then return false; end if;
  if not private.public_waiting_room_live_v1(p_room_id) then
    -- Exception would roll back the expiry change; return false instead.
    update public.game_rooms set
      status='expired', finished_at=now(), finished_reason='cancelled',
      state_version=state_version+1
    where id=p_room_id and status='waiting' and is_public is true;
    return false;
  end if;
  update public.room_players set last_seen_at=now()
  where room_id=p_room_id and user_id=auth.uid();
  return found;
end;
$func$;
revoke all on function public.heartbeat_public_waiting_room_v1(uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_public_waiting_room_v1(uuid) to authenticated;

-- Existing live RPC bodies copied verbatim except for liveness checks.
CREATE OR REPLACE FUNCTION public.list_public_waiting_rooms_v1(p_mode text DEFAULT NULL::text)
 RETURNS TABLE(room_id uuid, mode text, host_nickname text, current_players bigint, max_players integer, use_items boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mode is not null and p_mode not in ('duel','group') then
    raise exception 'ROOM_MODE_INVALID';
  end if;
  perform private.expire_stale_public_waiting_rooms_v1(100);
  return query
    select r.id, r.mode, coalesce(p.nickname,'탐험가')::text,
      (select count(*) from public.room_players rp where rp.room_id = r.id),
      r.max_players, coalesce(r.use_items,false), r.created_at
    from public.game_rooms r
    left join public.profiles p on p.id = r.host_user_id
    where r.is_public is true and r.status = 'waiting'
      and private.public_waiting_room_live_v1(r.id)
      -- A waiting room without its host is abandoned, not joinable.
      and exists (
        select 1 from public.room_players hp
        where hp.room_id = r.id and hp.user_id = r.host_user_id
      )
      and r.mode in ('duel','group')
      and (p_mode is null or r.mode = p_mode)
      and (select count(*) from public.room_players rp
           where rp.room_id = r.id) < r.max_players
    order by r.created_at desc
    limit 50;
end;
$function$;


CREATE OR REPLACE FUNCTION public.join_public_room_v1(p_room_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms
  where id = p_room_id and is_public is true and status = 'waiting'
    and exists (
      select 1 from public.room_players hp
      where hp.room_id = public.game_rooms.id
        and hp.user_id = public.game_rooms.host_user_id
    )
  for update;
  if not found then raise exception 'PUBLIC_ROOM_NOT_JOINABLE'; end if;
  if not private.public_waiting_room_live_v1(v_room.id) then raise exception 'PUBLIC_ROOM_EXPIRED'; end if;
  if v_room.mode = 'duel' then
    perform public.join_duel_room_v2(v_room.room_code);
  elsif v_room.mode = 'group' then
    perform public.join_group_room(v_room.id);
  else
    raise exception 'ROOM_MODE_INVALID';
  end if;
  return v_room.id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.find_room_by_code_v1(p_room_code text, p_mode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mode not in ('duel','group') or p_room_code is null
     or upper(trim(p_room_code)) !~ '^[A-Z0-9]{6}$' then
    raise exception 'ROOM_CODE_INVALID';
  end if;
  select * into v_room from public.game_rooms r
  where r.room_code = upper(trim(p_room_code)) and r.mode = p_mode
    and ((r.status = 'waiting' and (r.is_public is not true or private.public_waiting_room_live_v1(r.id)))
         or r.host_user_id = auth.uid()
         or exists (select 1 from public.room_players rp
                    where rp.room_id = r.id and rp.user_id = auth.uid()));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return v_room.id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.join_duel_room_v2(p_room_code text)
 RETURNS room_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_room public.game_rooms;
  v_profile public.profiles;
  v_player public.room_players;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_room from public.game_rooms where room_code = upper(trim(p_room_code)) and mode = 'duel' and status = 'waiting' for update;
  if not found then raise exception 'DUEL_ROOM_NOT_JOINABLE'; end if;
  if v_room.is_public is true and not private.public_waiting_room_live_v1(v_room.id) then raise exception 'PUBLIC_ROOM_EXPIRED'; end if;
  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = auth.uid()) then
    select * into v_player from public.room_players where room_id = v_room.id and user_id = auth.uid();
    return v_player;
  end if;
  if (select count(*) from public.room_players where room_id = v_room.id) >= v_room.max_players then raise exception 'DUEL_ROOM_FULL'; end if;
  insert into public.room_players(room_id, user_id, role, nickname_snapshot, profile_image_snapshot, is_ready, player_status)
  values (v_room.id, auth.uid(), 'guest', v_profile.nickname, v_profile.profile_image_url, false, 'waiting') returning * into v_player;
  return v_player;
end;
$function$;


CREATE OR REPLACE FUNCTION public.join_group_room(p_room_id uuid)
 RETURNS room_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_room.is_public is true and not private.public_waiting_room_live_v1(v_room.id) then raise exception 'PUBLIC_ROOM_EXPIRED'; end if;
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
$function$;


revoke all on function public.list_public_waiting_rooms_v1(text) from public, anon, authenticated;
grant execute on function public.list_public_waiting_rooms_v1(text) to authenticated;
