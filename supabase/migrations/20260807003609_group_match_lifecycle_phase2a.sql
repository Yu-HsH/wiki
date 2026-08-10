-- Wiki Race 2.0 그룹 온라인 대전 Phase 2A
-- 운영 DB에는 적용하지 않고 로컬 Supabase reset으로만 검증한다.

begin;

-- 1. 그룹 경기 수명주기 컬럼
alter table public.game_rooms
  add column if not exists game_duration_seconds integer not null default 900,
  add column if not exists grace_duration_seconds integer not null default 180,
  add column if not exists game_starts_at timestamptz,
  add column if not exists game_deadline_at timestamptz,
  add column if not exists grace_started_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists finished_reason text;

alter table public.game_rooms
  drop constraint if exists game_rooms_status_check;

alter table public.game_rooms
  add constraint game_rooms_status_check
    check (status = any (array['waiting', 'starting', 'playing', 'grace_period', 'finished']::text[])),
  add constraint game_rooms_game_duration_seconds_check
    check (game_duration_seconds > 0),
  add constraint game_rooms_grace_duration_seconds_check
    check (grace_duration_seconds > 0),
  add constraint game_rooms_grace_timing_check
    check (grace_ends_at is null or grace_started_at is not null),
  add constraint game_rooms_deadline_timing_check
    check (game_deadline_at is null or game_starts_at is not null),
  add constraint game_rooms_finished_reason_check
    check (finished_reason is null or finished_reason = any (
      array['all_resolved', 'time_limit', 'grace_timeout', 'cancelled']::text[]
    ));

-- 2. 참가자 상태 컬럼과 기존 데이터 백필
alter table public.room_players
  add column if not exists player_status text not null default 'waiting',
  add column if not exists disconnected_at timestamptz,
  add column if not exists retired_at timestamptz,
  add column if not exists retire_reason text;

update public.room_players rp
set player_status = case
  when rp.has_finished then 'finished'
  when gr.status in ('starting', 'playing', 'grace_period') then 'playing'
  else 'waiting'
end
from public.game_rooms gr
where gr.id = rp.room_id;

alter table public.room_players
  add constraint room_players_player_status_check
    check (player_status = any (
      array['waiting', 'playing', 'disconnected', 'finished', 'retired']::text[]
    )),
  add constraint room_players_retire_reason_check
    check (retire_reason is null or retire_reason = any (
      array['time_limit', 'grace_timeout', 'forfeited', 'left', 'disconnected_timeout']::text[]
    )),
  add constraint room_players_finished_status_check
    check (player_status <> 'finished' or has_finished = true),
  add constraint room_players_retired_status_check
    check (player_status <> 'retired' or (
      has_finished = false
      and rank is null
      and retired_at is not null
      and retire_reason is not null
    ));

-- 3. 정상 완주와 RETIRE를 모두 표현할 수 있는 결과 컬럼
alter table public.group_match_results
  add column if not exists result_status text,
  add column if not exists retire_reason text,
  add column if not exists retired_at timestamptz,
  add column if not exists finalized_at timestamptz;

update public.group_match_results
set
  result_status = 'finished',
  finalized_at = coalesce(finished_at, created_at)
where result_status is null;

alter table public.group_match_results
  alter column result_status set not null,
  alter column finalized_at set not null;

alter table public.group_match_results
  add constraint group_match_results_result_status_check
    check (result_status = any (array['finished', 'retired']::text[])),
  add constraint group_match_results_retire_reason_check
    check (retire_reason is null or retire_reason = any (
      array['time_limit', 'grace_timeout', 'forfeited', 'left', 'disconnected_timeout']::text[]
    )),
  add constraint group_match_results_finished_shape_check
    check (result_status <> 'finished' or (
      rank is not null
      and retire_reason is null
      and retired_at is null
    )),
  add constraint group_match_results_retired_shape_check
    check (result_status <> 'retired' or (
      rank is null
      and is_winner = false
      and finished_at is null
      and retire_reason is not null
      and retired_at is not null
    ));

-- 4. 그룹 경기 시작: 카운트다운만 시작하고 실제 경기 시각은 활성화 RPC가 설정한다.
create or replace function public.start_group_room_game(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_player_count integer;
  v_ready_count integer;
  v_titles text[];
  v_start_title text;
  v_target_title text;
  v_now timestamptz;
begin
  if auth.uid() is null then
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

  if v_room.host_user_id is distinct from auth.uid() then
    raise exception 'only the room host can start the game';
  end if;

  if v_room.mode <> 'group' then
    raise exception 'room is not a group game';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'only a waiting room can be started';
  end if;

  select count(*)
  into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count < v_room.min_players then
    raise exception 'minimum player count has not been reached';
  end if;

  select count(*)
  into v_ready_count
  from public.room_players
  where room_id = p_room_id
    and is_ready = true
    and submitted_target_title is not null
    and length(trim(submitted_target_title)) > 0;

  if v_ready_count <> v_player_count then
    raise exception 'all players must select a target and be ready';
  end if;

  select array_agg(submitted_target_title order by random())
  into v_titles
  from (
    select distinct submitted_target_title
    from public.room_players
    where room_id = p_room_id
      and submitted_target_title is not null
      and length(trim(submitted_target_title)) > 0
  ) targets;

  if coalesce(array_length(v_titles, 1), 0) < 2 then
    raise exception 'at least two different target documents are required';
  end if;

  v_now := now();
  v_start_title := v_titles[1];
  v_target_title := v_titles[2];

  update public.game_rooms
  set
    status = 'starting',
    group_start_title = v_start_title,
    group_target_title = v_target_title,
    started_at = v_now,
    finished_at = null,
    finished_count = 0,
    winner_user_ids = '{}',
    game_starts_at = null,
    game_deadline_at = null,
    grace_started_at = null,
    grace_ends_at = null,
    finished_reason = null
  where id = p_room_id
  returning *
  into v_room;

  update public.room_players
  set
    start_title = v_start_title,
    target_title = v_target_title,
    current_title = v_start_title,
    move_count = 0,
    has_finished = false,
    finished_at = null,
    rank = null,
    elapsed_seconds = null,
    path_titles = array[v_start_title],
    player_status = 'waiting',
    retired_at = null,
    retire_reason = null,
    disconnected_at = null,
    updated_at = v_now
  where room_id = p_room_id;

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'start_group_game',
    jsonb_build_object(
      'start_title', v_start_title,
      'target_title', v_target_title
    )
  );

  return v_room;
end;
$$;

-- 5. 카운트다운 종료 후 실제 경기 시간을 한 번만 시작한다.
create or replace function public.activate_group_room_game(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_now timestamptz;
begin
  if auth.uid() is null then
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

  if not exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  ) then
    raise exception 'only room participants can activate the game';
  end if;

  if v_room.status in ('playing', 'grace_period', 'finished') then
    return v_room;
  end if;

  if v_room.status <> 'starting' then
    raise exception 'only a starting group game can be activated';
  end if;

  v_now := now();

  update public.game_rooms
  set
    status = 'playing',
    game_starts_at = v_now,
    game_deadline_at = v_now + (v_room.game_duration_seconds * interval '1 second'),
    grace_started_at = null,
    grace_ends_at = null,
    finished_reason = null
  where id = p_room_id
  returning *
  into v_room;

  update public.room_players
  set
    player_status = 'playing',
    updated_at = v_now
  where room_id = p_room_id
    and player_status = 'waiting';

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'group_game_activated',
    jsonb_build_object(
      'game_starts_at', v_room.game_starts_at,
      'game_deadline_at', v_room.game_deadline_at
    )
  );

  return v_room;
end;
$$;

-- 6. 제한시간·유예시간 만료 및 전체 결과 확정 처리.
-- 반환 형식: 처리 후 game_rooms 한 행. 만료 전이면 변경 없이 현재 행을 반환한다.
create or replace function public.finalize_group_room_if_expired(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_now timestamptz;
  v_expiry_at timestamptz;
  v_finished_reason text;
  v_finished_count integer;
  v_total_count integer;
  v_resolved_count integer;
  v_winner_user_ids uuid[];
begin
  if auth.uid() is null then
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

  if not exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  ) then
    raise exception 'only room participants can finalize the game';
  end if;

  if v_room.status = 'finished' then
    return v_room;
  end if;

  select
    count(*)::integer,
    count(*) filter (where player_status in ('finished', 'retired'))::integer,
    count(*) filter (where player_status = 'finished')::integer
  into v_total_count, v_resolved_count, v_finished_count
  from public.room_players
  where room_id = p_room_id;

  -- 대기실에서 참가자 행이 모두 정리된 경우를 제외하고, 전원 결과 확정은 즉시 종료한다.
  if v_total_count > 0 and v_resolved_count = v_total_count then
    v_now := now();

    select coalesce(
      array_agg(rp.user_id order by rp.rank)
        filter (where rp.rank is not null and rp.rank <= v_room.finish_rank_limit),
      '{}'::uuid[]
    )
    into v_winner_user_ids
    from public.room_players rp
    where rp.room_id = p_room_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = v_now,
      finished_count = v_finished_count,
      winner_user_ids = v_winner_user_ids,
      finished_reason = 'all_resolved'
    where id = p_room_id
    returning *
    into v_room;

    insert into public.room_events (room_id, user_id, event_type, payload)
    values (
      p_room_id,
      auth.uid(),
      'game_end',
      jsonb_build_object(
        'finished_count', v_finished_count,
        'finished_reason', 'all_resolved'
      )
    );

    return v_room;
  end if;

  if v_room.status not in ('starting', 'playing', 'grace_period')
     or v_room.game_deadline_at is null then
    return v_room;
  end if;

  v_now := now();
  v_expiry_at := case
    when v_room.grace_ends_at is not null
      and v_room.grace_ends_at < v_room.game_deadline_at
      then v_room.grace_ends_at
    else v_room.game_deadline_at
  end;

  if v_now < v_expiry_at then
    return v_room;
  end if;

  if v_room.grace_ends_at is not null
     and v_room.grace_ends_at < v_room.game_deadline_at
     and v_now >= v_room.grace_ends_at then
    v_finished_reason := 'grace_timeout';
  else
    v_finished_reason := 'time_limit';
  end if;

  update public.room_players
  set
    player_status = 'retired',
    has_finished = false,
    rank = null,
    finished_at = null,
    retired_at = v_now,
    retire_reason = case
      when player_status = 'disconnected' then 'disconnected_timeout'
      else v_finished_reason
    end,
    updated_at = v_now
  where room_id = p_room_id
    and player_status in ('playing', 'disconnected');

  insert into public.group_match_results (
    room_id,
    user_id,
    nickname_snapshot,
    profile_image_snapshot,
    result_status,
    rank,
    is_winner,
    start_title,
    target_title,
    current_title,
    move_count,
    elapsed_seconds,
    path_titles,
    finished_at,
    retire_reason,
    retired_at,
    finalized_at
  )
  select
    rp.room_id,
    rp.user_id,
    rp.nickname_snapshot,
    rp.profile_image_snapshot,
    'retired',
    null,
    false,
    rp.start_title,
    rp.target_title,
    rp.current_title,
    rp.move_count,
    rp.elapsed_seconds,
    rp.path_titles,
    null,
    rp.retire_reason,
    rp.retired_at,
    v_now
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.player_status = 'retired'
    and rp.retired_at = v_now
  on conflict (room_id, user_id)
  do update set
    result_status = excluded.result_status,
    rank = excluded.rank,
    is_winner = excluded.is_winner,
    finished_at = excluded.finished_at,
    retire_reason = excluded.retire_reason,
    retired_at = excluded.retired_at,
    finalized_at = excluded.finalized_at
  where public.group_match_results.result_status <> 'finished';

  insert into public.room_events (room_id, user_id, event_type, payload)
  select
    p_room_id,
    rp.user_id,
    'player_retired',
    jsonb_build_object('retire_reason', rp.retire_reason)
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.player_status = 'retired'
    and rp.retired_at = v_now;

  select count(*) filter (where player_status = 'finished')::integer
  into v_finished_count
  from public.room_players
  where room_id = p_room_id;

  select coalesce(
    array_agg(rp.user_id order by rp.rank)
      filter (where rp.rank is not null and rp.rank <= v_room.finish_rank_limit),
    '{}'::uuid[]
  )
  into v_winner_user_ids
  from public.room_players rp
  where rp.room_id = p_room_id;

  update public.game_rooms
  set
    status = 'finished',
    finished_at = v_now,
    finished_count = v_finished_count,
    winner_user_ids = v_winner_user_ids,
    finished_reason = v_finished_reason
  where id = p_room_id
  returning *
  into v_room;

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'game_end',
    jsonb_build_object(
      'finished_count', v_finished_count,
      'finished_reason', v_finished_reason
    )
  );

  return v_room;
end;
$$;

-- 7. 완주: 서버 목표·경과시간을 사용하고, 3등부터 유예시간을 시작한다.
create or replace function public.finish_group_player(
  p_room_id uuid,
  p_elapsed_seconds integer,
  p_move_count integer,
  p_current_title text,
  p_path_titles text[]
)
returns table (
  result_room_id uuid,
  result_user_id uuid,
  result_rank integer,
  result_is_winner boolean,
  result_room_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_before public.game_rooms;
  v_room public.game_rooms;
  v_finalized_room public.game_rooms;
  v_player_before public.room_players;
  v_player public.room_players;
  v_rank integer;
  v_finished_count integer;
  v_total_count integer;
  v_resolved_count integer;
  v_is_winner boolean;
  v_elapsed_seconds integer;
  v_move_count integer;
  v_now timestamptz;
  v_grace_ends_at timestamptz;
  v_winner_user_ids uuid[];
  v_finalizer_finished_room boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- 완주 직전에 만료를 먼저 확정해 시간 경계를 서버 기준으로 처리한다.
  select *
  into v_room_before
  from public.game_rooms
  where id = p_room_id
  for update;

  select *
  into v_player_before
  from public.room_players
  where room_id = p_room_id
    and user_id = auth.uid()
  for update;

  select *
  into v_finalized_room
  from public.finalize_group_room_if_expired(p_room_id);

  v_finalizer_finished_room :=
    v_room_before.status in ('starting', 'playing', 'grace_period')
    and v_player_before.player_status = 'playing'
    and v_finalized_room.status = 'finished'
    and v_finalized_room.finished_reason in ('time_limit', 'grace_timeout');

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

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'player not found';
  end if;

  -- 종료 후에도 이미 완주한 참가자의 재호출은 기존 결과를 반환한다.
  if v_finalizer_finished_room
     and v_player.player_status = 'retired'
     and v_room.status = 'finished' then
    return query
    select
      p_room_id,
      auth.uid(),
      null::integer,
      false,
      v_room.status;
    return;
  end if;

  if v_player.player_status = 'finished' or v_player.has_finished = true then
    return query
    select
      p_room_id,
      auth.uid(),
      v_player.rank,
      v_player.rank is not null and v_player.rank <= v_room.finish_rank_limit,
      v_room.status;
    return;
  end if;

  if v_player.player_status = 'retired' then
    raise exception 'retired players cannot finish';
  end if;

  if v_room.status not in ('playing', 'grace_period') then
    raise exception 'the group game is not active';
  end if;

  if v_player.player_status <> 'playing' then
    raise exception 'player is not in a playable state';
  end if;

  if p_current_title is distinct from v_room.group_target_title then
    raise exception 'current title does not match the server target';
  end if;

  if v_room.game_starts_at is null then
    raise exception 'the game has not been activated';
  end if;

  v_now := now();
  v_elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer
  );
  v_move_count := greatest(coalesce(p_move_count, 0), 0);

  select count(*)::integer
  into v_rank
  from public.room_players
  where room_id = p_room_id
    and player_status = 'finished';
  v_rank := v_rank + 1;
  v_is_winner := v_rank <= v_room.finish_rank_limit;

  update public.room_players
  set
    player_status = 'finished',
    has_finished = true,
    finished_at = v_now,
    retired_at = null,
    retire_reason = null,
    disconnected_at = null,
    rank = v_rank,
    elapsed_seconds = v_elapsed_seconds,
    move_count = v_move_count,
    current_title = p_current_title,
    path_titles = coalesce(p_path_titles, '{}'),
    updated_at = v_now
  where room_id = p_room_id
    and user_id = auth.uid();

  insert into public.group_match_results (
    room_id,
    user_id,
    nickname_snapshot,
    profile_image_snapshot,
    result_status,
    rank,
    is_winner,
    start_title,
    target_title,
    current_title,
    move_count,
    elapsed_seconds,
    path_titles,
    finished_at,
    retire_reason,
    retired_at,
    finalized_at
  )
  values (
    p_room_id,
    auth.uid(),
    v_player.nickname_snapshot,
    v_player.profile_image_snapshot,
    'finished',
    v_rank,
    v_is_winner,
    v_player.start_title,
    v_room.group_target_title,
    p_current_title,
    v_move_count,
    v_elapsed_seconds,
    coalesce(p_path_titles, '{}'),
    v_now,
    null,
    null,
    v_now
  )
  on conflict (room_id, user_id)
  do update set
    result_status = excluded.result_status,
    rank = excluded.rank,
    is_winner = excluded.is_winner,
    current_title = excluded.current_title,
    move_count = excluded.move_count,
    elapsed_seconds = excluded.elapsed_seconds,
    path_titles = excluded.path_titles,
    finished_at = excluded.finished_at,
    retire_reason = null,
    retired_at = null,
    finalized_at = excluded.finalized_at
  where public.group_match_results.result_status <> 'retired';

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'player_finish',
    jsonb_build_object(
      'rank', v_rank,
      'elapsed_seconds', v_elapsed_seconds,
      'move_count', v_move_count
    )
  );

  select
    count(*)::integer,
    count(*) filter (where player_status in ('finished', 'retired'))::integer,
    count(*) filter (where player_status = 'finished')::integer
  into v_total_count, v_resolved_count, v_finished_count
  from public.room_players
  where room_id = p_room_id;

  if v_total_count > 0 and v_resolved_count = v_total_count then
    select coalesce(
      array_agg(rp.user_id order by rp.rank)
        filter (where rp.rank is not null and rp.rank <= v_room.finish_rank_limit),
      '{}'::uuid[]
    )
    into v_winner_user_ids
    from public.room_players rp
    where rp.room_id = p_room_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = v_now,
      finished_count = v_finished_count,
      winner_user_ids = v_winner_user_ids,
      finished_reason = 'all_resolved'
    where id = p_room_id
    returning *
    into v_room;

    insert into public.room_events (room_id, user_id, event_type, payload)
    values (
      p_room_id,
      auth.uid(),
      'game_end',
      jsonb_build_object(
        'finished_count', v_finished_count,
        'finished_reason', 'all_resolved'
      )
    );
  elsif v_rank = v_room.finish_rank_limit
        and v_room.status = 'playing'
        and v_room.grace_started_at is null then
    v_grace_ends_at := least(
      v_now + (v_room.grace_duration_seconds * interval '1 second'),
      v_room.game_deadline_at
    );

    update public.game_rooms
    set
      status = 'grace_period',
      grace_started_at = v_now,
      grace_ends_at = v_grace_ends_at,
      finished_count = v_finished_count
    where id = p_room_id
    returning *
    into v_room;

    insert into public.room_events (room_id, user_id, event_type, payload)
    values (
      p_room_id,
      auth.uid(),
      'grace_started',
      jsonb_build_object(
        'grace_started_at', v_room.grace_started_at,
        'grace_ends_at', v_room.grace_ends_at
      )
    );
  else
    update public.game_rooms
    set finished_count = v_finished_count
    where id = p_room_id
    returning *
    into v_room;
  end if;

  return query
  select
    p_room_id,
    auth.uid(),
    v_rank,
    v_is_winner,
    v_room.status;
end;
$$;

-- 8. 대기실 퇴장 또는 경기 중 RETIRE.
-- 반환 형식: 처리 후 game_rooms 한 행. finished/retired 재호출은 현재 행을 반환한다.
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
  v_room public.game_rooms;
  v_player public.room_players;
  v_now timestamptz;
  v_finished_count integer;
  v_total_count integer;
  v_resolved_count integer;
  v_winner_user_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_retire_reason not in ('left', 'forfeited') then
    raise exception 'retire reason must be left or forfeited';
  end if;

  perform public.finalize_group_room_if_expired(p_room_id);

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

  select *
  into v_player
  from public.room_players
  where room_id = p_room_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'player not found';
  end if;

  if v_room.status = 'finished'
     or v_player.player_status in ('finished', 'retired') then
    return v_room;
  end if;

  if v_room.status = 'waiting' then
    -- 기존 대기실 퇴장 동작을 유지한다. 방장 양도·방 삭제는 이 RPC에서 결정하지 않는다.
    delete from public.room_players
    where id = v_player.id;
    return v_room;
  end if;

  if v_room.status not in ('starting', 'playing', 'grace_period') then
    return v_room;
  end if;

  v_now := now();

  update public.room_players
  set
    player_status = 'retired',
    has_finished = false,
    rank = null,
    finished_at = null,
    elapsed_seconds = null,
    retired_at = v_now,
    retire_reason = p_retire_reason,
    updated_at = v_now
  where id = v_player.id;

  insert into public.group_match_results (
    room_id,
    user_id,
    nickname_snapshot,
    profile_image_snapshot,
    result_status,
    rank,
    is_winner,
    start_title,
    target_title,
    current_title,
    move_count,
    elapsed_seconds,
    path_titles,
    finished_at,
    retire_reason,
    retired_at,
    finalized_at
  )
  values (
    p_room_id,
    v_player.user_id,
    v_player.nickname_snapshot,
    v_player.profile_image_snapshot,
    'retired',
    null,
    false,
    v_player.start_title,
    v_player.target_title,
    v_player.current_title,
    v_player.move_count,
    null,
    v_player.path_titles,
    null,
    p_retire_reason,
    v_now,
    v_now
  )
  on conflict (room_id, user_id)
  do update set
    result_status = excluded.result_status,
    rank = excluded.rank,
    is_winner = excluded.is_winner,
    finished_at = null,
    retire_reason = excluded.retire_reason,
    retired_at = excluded.retired_at,
    finalized_at = excluded.finalized_at
  where public.group_match_results.result_status <> 'finished';

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'player_retired',
    jsonb_build_object('retire_reason', p_retire_reason)
  );

  select
    count(*)::integer,
    count(*) filter (where player_status in ('finished', 'retired'))::integer,
    count(*) filter (where player_status = 'finished')::integer
  into v_total_count, v_resolved_count, v_finished_count
  from public.room_players
  where room_id = p_room_id;

  if v_total_count > 0 and v_resolved_count = v_total_count then
    select coalesce(
      array_agg(rp.user_id order by rp.rank)
        filter (where rp.rank is not null and rp.rank <= v_room.finish_rank_limit),
      '{}'::uuid[]
    )
    into v_winner_user_ids
    from public.room_players rp
    where rp.room_id = p_room_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = v_now,
      finished_count = v_finished_count,
      winner_user_ids = v_winner_user_ids,
      finished_reason = 'all_resolved'
    where id = p_room_id
    returning *
    into v_room;

    insert into public.room_events (room_id, user_id, event_type, payload)
    values (
      p_room_id,
      auth.uid(),
      'game_end',
      jsonb_build_object(
        'finished_count', v_finished_count,
        'finished_reason', 'all_resolved'
      )
    );
  else
    update public.game_rooms
    set finished_count = v_finished_count
    where id = p_room_id
    returning *
    into v_room;
  end if;

  return v_room;
end;
$$;

-- Phase 1 권한 정책을 새 함수에도 동일하게 명시한다.
revoke execute on function public.start_group_room_game(uuid) from public, anon;
grant execute on function public.start_group_room_game(uuid) to authenticated, service_role;

revoke execute on function public.activate_group_room_game(uuid) from public, anon;
grant execute on function public.activate_group_room_game(uuid) to authenticated, service_role;

revoke execute on function public.finalize_group_room_if_expired(uuid) from public, anon;
grant execute on function public.finalize_group_room_if_expired(uuid) to authenticated, service_role;

revoke execute on function public.finish_group_player(uuid, integer, integer, text, text[]) from public, anon;
grant execute on function public.finish_group_player(uuid, integer, integer, text, text[]) to authenticated, service_role;

revoke execute on function public.leave_group_player(uuid, text) from public, anon;
grant execute on function public.leave_group_player(uuid, text) to authenticated, service_role;

commit;
