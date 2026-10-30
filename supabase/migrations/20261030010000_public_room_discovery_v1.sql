-- Public discovery is opt-in; historical and new legacy rooms stay private.
-- STAGING FIRST: verify private-code join, existing RLS, and multi-player race
-- before applying this migration to Production.
alter table public.game_rooms
  add column if not exists is_public boolean not null default false;

create index if not exists game_rooms_public_waiting_v1_idx
  on public.game_rooms (mode, created_at desc)
  where is_public and status = 'waiting';

-- Existing duel UPDATE RLS permits room members to update a joined room.
-- Prevent direct authenticated INSERT/UPDATE from toggling visibility, including
-- attempts from the guest participant. Owner-controlled create wrappers execute
-- as their definer and are the only supported way to opt in at creation time.
create or replace function private.guard_room_visibility_v1()
returns trigger language plpgsql set search_path = ''
as $
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.is_public is true then
        raise exception 'ROOM_VISIBILITY_RPC_REQUIRED';
      end if;
    elsif new.is_public is distinct from old.is_public then
      raise exception 'ROOM_VISIBILITY_RPC_REQUIRED';
    end if;
  end if;
  return new;
end;
$;
drop trigger if exists game_rooms_visibility_guard_v1 on public.game_rooms;
create trigger game_rooms_visibility_guard_v1
  before insert or update of is_public on public.game_rooms
  for each row execute function private.guard_room_visibility_v1();

-- Previous wide SELECT policy exposed every WAITING private room to any
-- authenticated user. Joined-room SELECT policy remains untouched.
drop policy if exists "Authenticated users can view waiting or joined rooms"
  on public.game_rooms;

-- An explicit code is a capability to discover a room's ID, not its details.
-- Participant reads still go through existing joined-room SELECT RLS.
create or replace function public.find_room_by_code_v1(p_room_code text, p_mode text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mode not in ('duel','group') or p_room_code is null
     or upper(trim(p_room_code)) !~ '^[A-Z0-9]{6}$' then
    raise exception 'ROOM_CODE_INVALID';
  end if;
  select * into v_room from public.game_rooms r
  where r.room_code = upper(trim(p_room_code)) and r.mode = p_mode
    and (r.status = 'waiting' or r.host_user_id = auth.uid()
         or exists (select 1 from public.room_players rp
                    where rp.room_id = r.id and rp.user_id = auth.uid()));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return v_room.id;
end;
$$;

-- Existing RPC signatures are preserved; wrapper toggles visibility only
-- after the original authenticated create + host membership succeeds.
create or replace function public.create_discoverable_duel_room_v1(
  p_use_items boolean default true, p_is_public boolean default false)
returns public.game_rooms language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_room := public.create_duel_room_v2(coalesce(p_use_items,true));
  if coalesce(p_is_public,false) then
    update public.game_rooms set is_public = true
    where id = v_room.id and host_user_id = auth.uid()
    returning * into v_room;
  end if;
  return v_room;
end;
$$;

create or replace function public.create_discoverable_group_room_v1(
  p_max_players integer default 6,
  p_min_players integer default 3,
  p_finish_rank_limit integer default 3,
  p_is_public boolean default false)
returns public.game_rooms language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_room := public.create_group_room(p_max_players,p_min_players,p_finish_rank_limit);
  if coalesce(p_is_public,false) then
    update public.game_rooms set is_public = true
    where id = v_room.id and host_user_id = auth.uid()
    returning * into v_room;
  end if;
  return v_room;
end;
$$;

-- Minimal discovery projection, not a game_rooms SELECT *.
-- Do not return room_code, participant UUID, progress, or secret fields.
create or replace function public.list_public_waiting_rooms_v1(p_mode text default null)
returns table (
  room_id uuid, mode text, host_nickname text,
  current_players bigint, max_players integer,
  use_items boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mode is not null and p_mode not in ('duel','group') then
    raise exception 'ROOM_MODE_INVALID';
  end if;
  return query
    select r.id, r.mode, coalesce(p.nickname,'탐험가')::text,
      (select count(*) from public.room_players rp where rp.room_id = r.id),
      r.max_players, coalesce(r.use_items,false), r.created_at
    from public.game_rooms r
    left join public.profiles p on p.id = r.host_user_id
    where r.is_public is true and r.status = 'waiting'
      and r.mode in ('duel','group')
      and (p_mode is null or r.mode = p_mode)
      and (select count(*) from public.room_players rp
           where rp.room_id = r.id) < r.max_players
    order by r.created_at desc
    limit 50;
end;
$$;

-- Public join is only a guarded adapter. Existing room-specific join RPCs
-- retain the row locks, full checks, and transactional capacity protection.
create or replace function public.join_public_room_v1(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms
  where id = p_room_id and is_public is true and status = 'waiting';
  if not found then raise exception 'PUBLIC_ROOM_NOT_JOINABLE'; end if;
  if v_room.mode = 'duel' then
    perform public.join_duel_room_v2(v_room.room_code);
  elsif v_room.mode = 'group' then
    perform public.join_group_room(v_room.id);
  else
    raise exception 'ROOM_MODE_INVALID';
  end if;
  return v_room.id;
end;
$$;

revoke all on function public.find_room_by_code_v1(text,text) from public, anon, authenticated;
revoke all on function public.create_discoverable_duel_room_v1(boolean,boolean) from public, anon, authenticated;
revoke all on function public.create_discoverable_group_room_v1(integer,integer,integer,boolean) from public, anon, authenticated;
revoke all on function public.list_public_waiting_rooms_v1(text) from public, anon, authenticated;
revoke all on function public.join_public_room_v1(uuid) from public, anon, authenticated;

grant execute on function public.find_room_by_code_v1(text,text) to authenticated;
grant execute on function public.create_discoverable_duel_room_v1(boolean,boolean) to authenticated;
grant execute on function public.create_discoverable_group_room_v1(integer,integer,integer,boolean) to authenticated;
grant execute on function public.list_public_waiting_rooms_v1(text) to authenticated;
grant execute on function public.join_public_room_v1(uuid) to authenticated;
