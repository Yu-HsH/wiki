-- CLI-generated migration filename verified on disposable GitHub Actions 2026-11-09 UTC.
-- Local PostgreSQL pgTAP 32/32 PASS. Production migration requires separate approval.
--
-- A rematch is a NEW private waiting room. Never recycle a finished room ID:
-- existing rankings, XP, move events and achievement ledgers remain immutable.
create table private.room_rematches_v1 (
  source_room_id uuid primary key references public.game_rooms(id) on delete cascade,
  next_room_id uuid not null unique references public.game_rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint room_rematches_distinct_ids_v1 check (source_room_id <> next_room_id)
);
alter table private.room_rematches_v1 enable row level security;
revoke all on private.room_rematches_v1 from public, anon, authenticated;

-- All room creation is delegated to the EXISTING authoritative creation RPCs.
-- Row-locking the source prevents duplicate rooms during double clicks or
-- concurrent browser sessions, and the unique primary key is the final guard.
create function public.create_rematch_room_v1(p_source_room_id uuid)
returns uuid language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_source public.game_rooms;
  v_link private.room_rematches_v1;
  v_next public.game_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_source_room_id is null then raise exception 'REMATCH_SOURCE_REQUIRED'; end if;

  select * into v_source from public.game_rooms
  where id = p_source_room_id for update;
  if not found then raise exception 'REMATCH_SOURCE_NOT_FOUND'; end if;
  if v_source.status <> 'finished' then raise exception 'REMATCH_SOURCE_NOT_FINISHED'; end if;
  if v_source.host_user_id is distinct from auth.uid() or not exists (
    select 1 from public.room_players p
    where p.room_id = v_source.id and p.user_id = auth.uid()
  ) then raise exception 'REMATCH_HOST_REQUIRED'; end if;

  select * into v_link from private.room_rematches_v1
  where source_room_id = v_source.id;
  if found then
    select * into v_next from public.game_rooms where id = v_link.next_room_id;
    if v_next.status = 'waiting' and exists (
      select 1 from public.room_players p
      where p.room_id = v_next.id and p.user_id = v_next.host_user_id
    ) then return v_next.id; end if;
    -- Never create a competing room if players already started the new match.
    if v_next.status in ('starting','playing','grace_period','finished') then
      raise exception 'REMATCH_ALREADY_STARTED';
    end if;
    -- The new room was cancelled or abandoned before it started.
    delete from private.room_rematches_v1 where source_room_id = v_source.id;
  end if;

  if v_source.mode = 'duel' then
    v_next := public.create_duel_room_v2(coalesce(v_source.use_items,true));
  elsif v_source.mode = 'group' then
    v_next := public.create_group_room(v_source.max_players,3,3);
  else
    raise exception 'REMATCH_MODE_INVALID';
  end if;
  -- Original room privacy is intentionally NOT copied: rematches are always
  -- invitation-only, requiring membership in the previous finished room.
  insert into private.room_rematches_v1(source_room_id,next_room_id,created_by)
  values (v_source.id,v_next.id,auth.uid());
  return v_next.id;
end;
$function$;

-- Read the offer only if the caller belonged to the FINISHED source match.
-- Does not reveal the successor's code, membership or private table contents.
create function public.get_rematch_room_v1(p_source_room_id uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $function$
declare v_room_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.game_rooms r
    join public.room_players p on p.room_id = r.id
    where r.id = p_source_room_id and r.status = 'finished'
      and p.user_id = auth.uid()
  ) then raise exception 'REMATCH_SOURCE_NOT_PARTICIPANT'; end if;
  select next.id into v_room_id
  from private.room_rematches_v1 link
  join public.game_rooms next on next.id = link.next_room_id
  where link.source_room_id = p_source_room_id and next.status = 'waiting'
    and exists (select 1 from public.room_players hp
                where hp.room_id = next.id and hp.user_id = next.host_user_id);
  return v_room_id;
end;
$function$;

-- Even if an unrelated user guesses the six-character private room code,
-- normal join_duel_room_v2 / join_group_room inserts are rejected by this
-- defensive trigger, not merely by the new convenience RPC.
create function private.guard_rematch_membership_v1()
returns trigger language plpgsql volatile security definer set search_path = ''
as $function$
declare v_source uuid;
begin
  select source_room_id into v_source
  from private.room_rematches_v1 where next_room_id = new.room_id;
  if not found then return new; end if;

  if auth.uid() is null or new.user_id is distinct from auth.uid() or not exists (
    select 1 from public.room_players prior_member
    where prior_member.room_id = v_source and prior_member.user_id = new.user_id
  ) then raise exception 'REMATCH_MEMBERS_ONLY'; end if;
  return new;
end;
$function$;
create trigger room_players_rematch_membership_v1
  before insert on public.room_players
  for each row execute function private.guard_rematch_membership_v1();

-- Guests explicitly accept the host's offer. Joining is not forced; READY
-- and submitted targets remain empty. If already joined this call is idempotent.
create function public.join_rematch_room_v1(p_source_room_id uuid)
returns uuid language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_source public.game_rooms;
  v_next public.game_rooms;
  v_next_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_source from public.game_rooms where id = p_source_room_id;
  if not found or v_source.status <> 'finished' then
    raise exception 'REMATCH_SOURCE_NOT_FINISHED';
  end if;
  if not exists (
    select 1 from public.room_players p
    where p.room_id = p_source_room_id and p.user_id = auth.uid()
  ) then raise exception 'REMATCH_MEMBERS_ONLY'; end if;

  select link.next_room_id into v_next_id from private.room_rematches_v1 link
  where link.source_room_id = p_source_room_id;
  if v_next_id is null then raise exception 'REMATCH_NOT_READY'; end if;
  select * into v_next from public.game_rooms where id = v_next_id for update;
  if not found or v_next.status <> 'waiting' then
    raise exception 'REMATCH_NOT_WAITING';
  end if;
  if exists (select 1 from public.room_players p
             where p.room_id = v_next.id and p.user_id = auth.uid()) then
    return v_next.id;
  end if;
  if v_next.mode = 'duel' then
    perform public.join_duel_room_v2(v_next.room_code);
  elsif v_next.mode = 'group' then
    perform public.join_group_room(v_next.id);
  else
    raise exception 'REMATCH_MODE_INVALID';
  end if;
  return v_next.id;
end;
$function$;

revoke all on function public.create_rematch_room_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_rematch_room_v1(uuid) from public, anon, authenticated;
revoke all on function public.join_rematch_room_v1(uuid) from public, anon, authenticated;
grant execute on function public.create_rematch_room_v1(uuid) to authenticated;
grant execute on function public.get_rematch_room_v1(uuid) to authenticated;
grant execute on function public.join_rematch_room_v1(uuid) to authenticated;
revoke all on function private.guard_rematch_membership_v1() from public, anon, authenticated;
