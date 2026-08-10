-- 그룹게임 1차 보안 하드닝
-- 운영 DB에는 적용하지 않고 로컬 Supabase에서만 검증한다.
-- 기존 그룹게임 규칙과 RPC 시그니처/반환 형식은 유지한다.

begin;

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
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  if v_room.host_user_id is distinct from auth.uid() then
    raise exception '방장만 게임을 시작할 수 있습니다.';
  end if;

  if v_room.mode <> 'group' then
    raise exception '단체모드 방이 아닙니다.';
  end if;

  if v_room.status <> 'waiting' then
    raise exception '대기 중인 방만 시작할 수 있습니다.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count < v_room.min_players then
    raise exception '최소 인원이 부족합니다.';
  end if;

  select count(*)
  into v_ready_count
  from public.room_players
  where room_id = p_room_id
    and is_ready = true
    and submitted_target_title is not null
    and length(trim(submitted_target_title)) > 0;

  if v_ready_count <> v_player_count then
    raise exception '모든 참가자가 목표 문서를 선택하고 준비해야 합니다.';
  end if;

  select array_agg(submitted_target_title order by random())
  into v_titles
  from (
    select distinct submitted_target_title
    from public.room_players
    where room_id = p_room_id
      and submitted_target_title is not null
      and length(trim(submitted_target_title)) > 0
  ) s;

  if coalesce(array_length(v_titles, 1), 0) < 2 then
    raise exception '서로 다른 목표 문서가 최소 2개 필요합니다.';
  end if;

  v_start_title := v_titles[1];
  v_target_title := v_titles[2];

  update public.game_rooms
  set
    status = 'starting',
    group_start_title = v_start_title,
    group_target_title = v_target_title,
    started_at = now(),
    finished_at = null,
    finished_count = 0,
    winner_user_ids = '{}'
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
    updated_at = now()
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
  v_room public.game_rooms;
  v_player public.room_players;
  v_rank integer;
  v_finished_count integer;
  v_is_winner boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
  into v_room
  from public.game_rooms gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  if v_room.mode <> 'group' then
    raise exception '단체모드 방이 아닙니다.';
  end if;

  if v_room.status not in ('starting', 'playing') then
    raise exception '진행 중인 방이 아닙니다.';
  end if;

  select *
  into v_player
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.user_id = auth.uid()
  for update;

  if not found then
    raise exception '참가자 정보를 찾을 수 없습니다.';
  end if;

  if v_player.has_finished = true then
    return query
    select
      p_room_id,
      auth.uid(),
      v_player.rank,
      true,
      v_room.status;
    return;
  end if;

  select count(*) + 1
  into v_rank
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.has_finished = true;

  v_is_winner := v_rank <= v_room.finish_rank_limit;

  update public.room_players rp
  set
    has_finished = true,
    finished_at = now(),
    rank = v_rank,
    elapsed_seconds = p_elapsed_seconds,
    move_count = p_move_count,
    current_title = p_current_title,
    path_titles = coalesce(p_path_titles, '{}'),
    updated_at = now()
  where rp.room_id = p_room_id
    and rp.user_id = auth.uid();

  insert into public.group_match_results (
    room_id,
    user_id,
    nickname_snapshot,
    profile_image_snapshot,
    rank,
    is_winner,
    start_title,
    target_title,
    current_title,
    move_count,
    elapsed_seconds,
    path_titles,
    finished_at
  )
  select
    rp.room_id,
    rp.user_id,
    rp.nickname_snapshot,
    rp.profile_image_snapshot,
    v_rank,
    v_is_winner,
    rp.start_title,
    rp.target_title,
    p_current_title,
    p_move_count,
    p_elapsed_seconds,
    coalesce(p_path_titles, '{}'),
    now()
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.user_id = auth.uid()
  on conflict (room_id, user_id)
  do update set
    rank = excluded.rank,
    is_winner = excluded.is_winner,
    current_title = excluded.current_title,
    move_count = excluded.move_count,
    elapsed_seconds = excluded.elapsed_seconds,
    path_titles = excluded.path_titles,
    finished_at = excluded.finished_at;

  insert into public.room_events (room_id, user_id, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'player_finish',
    jsonb_build_object(
      'rank', v_rank,
      'elapsed_seconds', p_elapsed_seconds,
      'move_count', p_move_count
    )
  );

  select count(*)
  into v_finished_count
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.has_finished = true;

  if v_finished_count >= v_room.finish_rank_limit then
    update public.game_rooms gr
    set
      status = 'finished',
      finished_at = now(),
      finished_count = v_finished_count,
      winner_user_ids = (
        select array_agg(rp.user_id order by rp.rank asc)
        from public.room_players rp
        where rp.room_id = p_room_id
          and rp.rank is not null
          and rp.rank <= v_room.finish_rank_limit
      )
    where gr.id = p_room_id
    returning *
    into v_room;

    insert into public.room_events (room_id, user_id, event_type, payload)
    values (
      p_room_id,
      auth.uid(),
      'game_end',
      jsonb_build_object('finished_count', v_finished_count)
    );
  else
    update public.game_rooms gr
    set finished_count = v_finished_count
    where gr.id = p_room_id
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

-- 보안 정의 함수에서 객체 탐색 경로를 비워 search_path 공격 가능성을 줄인다.
alter function public.can_join_room(uuid) set search_path = '';
alter function public.is_room_member(uuid) set search_path = '';
alter function public.is_room_participant(uuid) set search_path = '';
alter function public.set_updated_at() set search_path = '';

-- 함수 재정의 후에도 역할별 실행 권한을 명시적으로 유지한다.
revoke execute on function public.start_group_room_game(uuid) from public, anon;
grant execute on function public.start_group_room_game(uuid) to authenticated, service_role;

revoke execute on function public.finish_group_player(uuid, integer, integer, text, text[]) from public, anon;
grant execute on function public.finish_group_player(uuid, integer, integer, text, text[]) to authenticated, service_role;

revoke execute on function public.can_join_room(uuid) from public, anon;
grant execute on function public.can_join_room(uuid) to authenticated, service_role;

revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated, service_role;

revoke execute on function public.is_room_participant(uuid) from public, anon;
grant execute on function public.is_room_participant(uuid) to authenticated, service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

-- 기준 스키마에서 동일한 updated_at 트리거가 중복 정의되어 하나만 유지한다.
drop trigger if exists set_room_players_updated_at on public.room_players;

-- 그룹게임 테이블의 고수준 DDL 권한만 회수한다.
revoke truncate, references, trigger, maintain
  on table
    public.game_rooms,
    public.room_players,
    public.group_match_results,
    public.room_events,
    public.group_match_history,
    public.user_profile_stats
  from anon, authenticated;

-- ALTER DEFAULT PRIVILEGES는 전체 public 함수/테이블의 기존 앱 흐름에 영향을 주므로
-- 이번 단계에서는 변경하지 않는다. 후속 단계에서 기능별 기본 권한을 분리해 검토한다.

commit;
