-- Wiki Race 2.0 그룹 온라인 대전 Phase 2C
-- 안전한 그룹 write RPC를 먼저 제공한 뒤 shared table 정책을 mode별로 분리한다.
-- 운영 DB에는 이 작업에서 적용하지 않고 로컬 Supabase에서만 검증한다.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 서버가 확정한 group_match_results만 history/stat의 원본으로 사용한다.
create or replace function private.sync_group_records(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_affected_user_ids uuid[];
  v_history_count integer;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'room not found';
  end if;

  if v_room.mode <> 'group' then
    raise exception 'room is not a group game';
  end if;

  if v_room.status <> 'finished' then
    raise exception 'group records can only be finalized after the room finishes';
  end if;

  select coalesce(array_agg(distinct affected.user_id), '{}'::uuid[])
  into v_affected_user_ids
  from (
    select user_id
    from public.group_match_results
    where room_id = p_room_id
    union
    select user_id
    from public.group_match_history
    where room_id = p_room_id
  ) affected
  where affected.user_id is not null;

  -- 이전 client write나 재호출로 남은 비권위 row를 제거한다.
  delete from public.group_match_history history
  where history.room_id = p_room_id
    and not exists (
      select 1
      from public.group_match_results result
      where result.room_id = p_room_id
        and result.user_id = history.user_id
        and result.result_status = 'finished'
        and result.rank is not null
    );

  insert into public.group_match_history (
    room_id,
    user_id,
    rank,
    elapsed_seconds,
    move_count
  )
  select
    result.room_id,
    result.user_id,
    result.rank,
    result.elapsed_seconds,
    result.move_count
  from public.group_match_results result
  where result.room_id = p_room_id
    and result.user_id is not null
    and result.result_status = 'finished'
    and result.rank is not null
  on conflict (room_id, user_id)
  do update set
    rank = excluded.rank,
    elapsed_seconds = excluded.elapsed_seconds,
    move_count = excluded.move_count;

  -- 누적 증가 대신 전체 authoritative history를 다시 집계해 멱등성을 보장한다.
  insert into public.user_profile_stats as stats (
    user_id,
    group_first_count,
    group_second_count,
    group_third_count,
    updated_at
  )
  select
    affected.user_id,
    count(history.id) filter (where history.rank = 1)::integer,
    count(history.id) filter (where history.rank = 2)::integer,
    count(history.id) filter (where history.rank = 3)::integer,
    now()
  from unnest(v_affected_user_ids) as affected(user_id)
  left join public.group_match_history history
    on history.user_id = affected.user_id
  group by affected.user_id
  on conflict (user_id)
  do update set
    group_first_count = excluded.group_first_count,
    group_second_count = excluded.group_second_count,
    group_third_count = excluded.group_third_count,
    updated_at = excluded.updated_at
  where (
    stats.group_first_count,
    stats.group_second_count,
    stats.group_third_count
  ) is distinct from (
    excluded.group_first_count,
    excluded.group_second_count,
    excluded.group_third_count
  );

  select count(*)::integer
  into v_history_count
  from public.group_match_history
  where room_id = p_room_id;

  return v_history_count;
end;
$$;

revoke all on function private.sync_group_records(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.finalize_group_records(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  if not found then
    raise exception 'room not found';
  end if;

  if v_room.mode <> 'group' then
    raise exception 'room is not a group game';
  end if;

  if not exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  ) then
    raise exception 'only room participants can finalize group records';
  end if;

  return private.sync_group_records(p_room_id);
end;
$$;

-- lifecycle RPC가 어떤 경로로 room을 끝내도 기록 최종화가 누락되지 않게 한다.
create or replace function private.finalize_group_records_on_room_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'group'
     and new.status = 'finished'
     and old.status is distinct from 'finished' then
    perform private.sync_group_records(new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.finalize_group_records_on_room_finished()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_finalize_group_records on public.game_rooms;
create trigger trg_finalize_group_records
after update of status on public.game_rooms
for each row
execute function private.finalize_group_records_on_room_finished();

-- 대기실 참가자 삭제 시 host orphan과 빈 방을 DB 불변식으로 방지한다.
create or replace function private.reconcile_group_waiting_room_after_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_next_host public.room_players;
begin
  select *
  into v_room
  from public.game_rooms
  where id = old.room_id
  for update;

  if not found or v_room.mode <> 'group' or v_room.status <> 'waiting' then
    return old;
  end if;

  select *
  into v_next_host
  from public.room_players
  where room_id = old.room_id
  order by created_at asc, id asc
  limit 1
  for update;

  if not found then
    delete from public.game_rooms
    where id = old.room_id;
    return old;
  end if;

  if v_room.host_user_id = old.user_id then
    update public.room_players
    set role = case when id = v_next_host.id then 'host' else 'guest' end
    where room_id = old.room_id;

    update public.game_rooms
    set host_user_id = v_next_host.user_id
    where id = old.room_id;
  end if;

  return old;
end;
$$;

revoke all on function private.reconcile_group_waiting_room_after_leave()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reconcile_group_waiting_room_after_leave
  on public.room_players;
create trigger trg_reconcile_group_waiting_room_after_leave
after delete on public.room_players
for each row
execute function private.reconcile_group_waiting_room_after_leave();

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
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_min_players < 2
     or p_max_players < p_min_players
     or p_max_players > 30 then
    raise exception 'invalid group player limits';
  end if;

  if p_finish_rank_limit < 1
     or p_finish_rank_limit > least(p_max_players, 10) then
    raise exception 'invalid finish rank limit';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'profile required';
  end if;

  for v_attempt in 1..5 loop
    begin
      v_room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

      insert into public.game_rooms (
        room_code,
        host_user_id,
        status,
        mode,
        max_players,
        min_players,
        finish_rank_limit
      )
      values (
        v_room_code,
        v_user_id,
        'waiting',
        'group',
        p_max_players,
        p_min_players,
        p_finish_rank_limit
      )
      returning * into v_room;

      exit;
    exception
      when unique_violation then
        if v_attempt = 5 then
          raise;
        end if;
    end;
  end loop;

  insert into public.room_players (
    room_id,
    user_id,
    role,
    nickname_snapshot,
    profile_image_snapshot,
    is_ready,
    move_count,
    has_finished,
    path_titles,
    player_status
  )
  values (
    v_room.id,
    v_user_id,
    'host',
    v_profile.nickname,
    v_profile.profile_image_url,
    false,
    0,
    false,
    '{}'::text[],
    'waiting'
  );

  return v_room;
end;
$$;

create or replace function public.join_group_room(p_room_id uuid)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_room public.game_rooms;
  v_player public.room_players;
  v_player_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'room not found';
  end if;

  if v_room.mode <> 'group' then
    raise exception 'room is not a group game';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'only a waiting room can be joined';
  end if;

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = v_user_id;

  if found then
    return v_player;
  end if;

  select count(*)::integer
  into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count >= v_room.max_players then
    raise exception 'room is full';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'profile required';
  end if;

  insert into public.room_players (
    room_id,
    user_id,
    role,
    nickname_snapshot,
    profile_image_snapshot,
    is_ready,
    move_count,
    has_finished,
    path_titles,
    player_status
  )
  values (
    p_room_id,
    v_user_id,
    'guest',
    v_profile.nickname,
    v_profile.profile_image_url,
    false,
    0,
    false,
    '{}'::text[],
    'waiting'
  )
  returning * into v_player;

  return v_player;
end;
$$;

create or replace function public.submit_group_target(
  p_room_id uuid,
  p_submitted_keyword text,
  p_submitted_target_title text
)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
  v_target_title text := nullif(trim(p_submitted_target_title), '');
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_target_title is null then
    raise exception 'target title required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'room not found';
  end if;

  if v_room.mode <> 'group' or v_room.status <> 'waiting' then
    raise exception 'group target can only be submitted in a waiting room';
  end if;

  update public.room_players
  set
    submitted_keyword = coalesce(nullif(trim(p_submitted_keyword), ''), v_target_title),
    submitted_target_title = v_target_title,
    updated_at = now()
  where room_id = p_room_id
    and user_id = v_user_id
    and player_status = 'waiting'
  returning * into v_player;

  if not found then
    raise exception 'waiting player not found';
  end if;

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    v_user_id,
    'submit_keyword',
    jsonb_build_object(
      'rawKeyword', p_submitted_keyword,
      'selectedTitle', v_target_title
    )
  );

  return v_player;
end;
$$;

create or replace function public.set_group_ready(
  p_room_id uuid,
  p_is_ready boolean
)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_is_ready is null then
    raise exception 'ready state required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'room not found';
  end if;

  if v_room.mode <> 'group' or v_room.status <> 'waiting' then
    raise exception 'ready state can only change in a waiting group room';
  end if;

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = v_user_id
  for update;

  if not found or v_player.player_status <> 'waiting' then
    raise exception 'waiting player not found';
  end if;

  if p_is_ready
     and nullif(trim(v_player.submitted_target_title), '') is null then
    raise exception 'submit a target before becoming ready';
  end if;

  update public.room_players
  set
    is_ready = p_is_ready,
    updated_at = now()
  where id = v_player.id
  returning * into v_player;

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    v_user_id,
    'ready_toggle',
    jsonb_build_object('isReady', p_is_ready)
  );

  return v_player;
end;
$$;

create or replace function public.update_group_progress(
  p_room_id uuid,
  p_current_title text,
  p_move_count integer,
  p_path_titles text[],
  p_expected_move_count integer default null
)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
  v_current_title text := nullif(trim(p_current_title), '');
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_current_title is null then
    raise exception 'current title required';
  end if;

  if p_move_count is null or p_move_count < 0 then
    raise exception 'move count must be non-negative';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'room not found';
  end if;

  if v_room.mode <> 'group'
     or v_room.status not in ('playing', 'grace_period') then
    raise exception 'group progress can only change while the game is active';
  end if;

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'player not found';
  end if;

  if v_player.player_status <> 'playing' or v_player.has_finished then
    raise exception 'player is not in a playable state';
  end if;

  if p_expected_move_count is not null
     and v_player.move_count is distinct from p_expected_move_count then
    return null;
  end if;

  update public.room_players
  set
    current_title = v_current_title,
    move_count = p_move_count,
    path_titles = coalesce(p_path_titles, '{}'::text[]),
    last_seen_at = now(),
    updated_at = now()
  where id = v_player.id
  returning * into v_player;

  return v_player;
end;
$$;

create or replace function public.leave_group_waiting_room(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'room not found';
  end if;

  if v_room.mode <> 'group' or v_room.status <> 'waiting' then
    raise exception 'only a waiting group room can use this leave operation';
  end if;

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'player not found';
  end if;

  delete from public.room_players
  where id = v_player.id;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  if not found then
    return null;
  end if;

  return v_room;
end;
$$;

-- 새 SECURITY DEFINER 함수는 PUBLIC/anon 기본 실행 권한을 반드시 회수한다.
revoke execute on function public.create_group_room(integer, integer, integer)
  from public, anon;
grant execute on function public.create_group_room(integer, integer, integer)
  to authenticated, service_role;

revoke execute on function public.join_group_room(uuid)
  from public, anon;
grant execute on function public.join_group_room(uuid)
  to authenticated, service_role;

revoke execute on function public.submit_group_target(uuid, text, text)
  from public, anon;
grant execute on function public.submit_group_target(uuid, text, text)
  to authenticated, service_role;

revoke execute on function public.set_group_ready(uuid, boolean)
  from public, anon;
grant execute on function public.set_group_ready(uuid, boolean)
  to authenticated, service_role;

revoke execute on function public.update_group_progress(uuid, text, integer, text[], integer)
  from public, anon;
grant execute on function public.update_group_progress(uuid, text, integer, text[], integer)
  to authenticated, service_role;

revoke execute on function public.leave_group_waiting_room(uuid)
  from public, anon;
grant execute on function public.leave_group_waiting_room(uuid)
  to authenticated, service_role;

revoke execute on function public.finalize_group_records(uuid)
  from public, anon;
grant execute on function public.finalize_group_records(uuid)
  to authenticated, service_role;

-- 기록·통계 테이블은 SELECT만 Data API에 남기고 write는 서버 함수로 한정한다.
alter table public.group_match_history enable row level security;
alter table public.user_profile_stats enable row level security;

revoke all on table public.group_match_history from anon;
revoke insert, update, delete on table public.group_match_history from authenticated;
grant select on table public.group_match_history to authenticated;

revoke all on table public.user_profile_stats from anon;
revoke insert, update, delete on table public.user_profile_stats from authenticated;
grant select on table public.user_profile_stats to authenticated;

revoke insert, update, delete on table public.group_match_results
  from anon, authenticated;

drop policy if exists "Users can view their own group history"
  on public.group_match_history;
drop policy if exists "Authenticated users can view group history"
  on public.group_match_history;
create policy "Authenticated users can view group history"
on public.group_match_history
for select
to authenticated
using (true);

drop policy if exists "Users can view their own profile stats"
  on public.user_profile_stats;
create policy "Users can view their own profile stats"
on public.user_profile_stats
for select
to authenticated
using ((select auth.uid()) = user_id);

-- shared table의 direct write는 duel에만 보존하고 group은 RPC 전용으로 만든다.
drop policy if exists "Authenticated users can create rooms" on public.game_rooms;
drop policy if exists "Players can update joined rooms" on public.game_rooms;
drop policy if exists "Host can delete own room" on public.game_rooms;

create policy "Authenticated users can create duel rooms"
on public.game_rooms
for insert
to authenticated
with check (
  (select auth.uid()) = host_user_id
  and mode = 'duel'
);

create policy "Duel players can update joined rooms"
on public.game_rooms
for update
to authenticated
using (
  mode = 'duel'
  and (
    (select auth.uid()) = host_user_id
    or public.is_room_participant(id)
  )
)
with check (
  mode = 'duel'
  and (
    (select auth.uid()) = host_user_id
    or public.is_room_participant(id)
  )
);

create policy "Host can delete own duel room"
on public.game_rooms
for delete
to authenticated
using (
  mode = 'duel'
  and (select auth.uid()) = host_user_id
);

drop policy if exists "Authenticated users can join room_players"
  on public.room_players;
drop policy if exists "Users can update their own player row"
  on public.room_players;
drop policy if exists "Users can delete their own player row"
  on public.room_players;

create policy "Authenticated users can join duel room_players"
on public.room_players
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.game_rooms room
    where room.id = room_players.room_id
      and room.mode = 'duel'
      and public.can_join_room(room.id)
  )
);

create policy "Users can update their own duel player row"
on public.room_players
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.game_rooms room
    where room.id = room_players.room_id
      and room.mode = 'duel'
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.game_rooms room
    where room.id = room_players.room_id
      and room.mode = 'duel'
  )
);

create policy "Users can delete their own duel player row"
on public.room_players
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.game_rooms room
    where room.id = room_players.room_id
      and room.mode = 'duel'
  )
);

drop policy if exists "Players can insert their own room events"
  on public.room_events;
create policy "Duel players can insert their own room events"
on public.room_events
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.game_rooms room
    where room.id = room_events.room_id
      and room.mode = 'duel'
  )
  and exists (
    select 1
    from public.room_players player
    where player.room_id = room_events.room_id
      and player.user_id = (select auth.uid())
  )
);

-- migration 적용 전에 이미 끝난 로컬/운영 그룹 방이 있으면 authoritative 기록으로 정리한다.
do $$
declare
  v_room_id uuid;
begin
  for v_room_id in
    select id
    from public.game_rooms
    where mode = 'group'
      and status = 'finished'
  loop
    perform private.sync_group_records(v_room_id);
  end loop;
end;
$$;

commit;
