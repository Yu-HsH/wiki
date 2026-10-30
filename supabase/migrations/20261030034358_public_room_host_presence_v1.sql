-- Release hotfix: prevent empty-host waiting rooms from appearing as joinable.
-- Existing rooms and players are deliberately left untouched.
-- Stage after diagnosing current production roster; no data deletion.
-- Both duel and group share these adapters.
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
$$;

create or replace function public.join_public_room_v1(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
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
