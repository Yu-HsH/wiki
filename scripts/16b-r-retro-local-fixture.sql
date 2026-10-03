-- 16b-r 로컬 검증용 fixture — 16b 이전처럼 해금 없이 쌓인 기록을 만든다. **로컬 전용. 실행기가 ROLLBACK 한다.**
-- 실행기: node scripts/16b-r-retro-local-run.mjs (fixture → dry-run 파일 → apply 파일 ×2 → ROLLBACK)
--
-- 사용자 (uuid 접두 016e):
--   R1  싱글 완주 3 + 오늘 코스 10일 + legacy(run_id 없음) 2 + 수동 XP 150  → 첫 도착 · 오늘도 탐험 I · 이어지는 발걸음 I
--   R2  서로 다른 문서 100곳 싱글 완주 + 같은 코스 6회 단축 + 아이콘·칭호 장착 → 넓어진 세계 I · 더 나은 길 I · 첫 도착 · 준비된 탐험가
--   R3  R4를 12일에 걸쳐 12승 (비아이템, 이동 이벤트 있음)  → 첫 도착 · 맞수 I · 승부사 I · 순수한 승부 I
--   R4  12패                                                 → 맞수 I (첫 도착 없음 — 진 경기는 정상 완주가 아니다)
--   R5  R6을 하루에 7승 — **이동 이벤트 없음 → 제외 대상** (판정 8을 1:1에도 적용, 2026-10-03)
--   R5..R12  8인 그룹 1판(이동 이벤트 있음), R12는 기권     → 7명 여덟 명의 원정대 · 첫 도착 / R12는 없음
--   R13 legacy 싱글 + 이동 이벤트 없는 그룹 완주            → 아무것도 없음 (그룹 1판 제외 대상)
-- 기대: 해금 26 · XP 780 · 11명 · 제외 1:1 7 · 제외 그룹 1 · 그중 여전히 세는 결과 8

begin;
set local role postgres;

alter table public.game_records disable trigger trg_record_single_result_achievements;
alter table public.game_records disable trigger trg_grant_single_result_xp;
alter table public.match_history disable trigger trg_record_duel_result_achievements;
alter table public.match_history disable trigger trg_grant_duel_result_xp;
alter table public.game_rooms disable trigger trg_record_group_result_achievements;
alter table public.game_rooms disable trigger trg_grant_group_result_xp;
alter table public.user_profile_equipment disable trigger trg_record_equipment_achievements;

create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-016e-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.uid(n), 'authenticated', 'authenticated', 'rr-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 13) n;
insert into public.profiles (id, username, nickname, synthetic_email)
select pg_temp.uid(n), 'rr-' || lpad(n::text, 2, '0'), 'RR ' || n, 'rr-' || n || '@local.test'
  from generate_series(1, 13) n;

-- 싱글 완주 1건: 완료 run + 결과 행 + 이동 이벤트(시작 → 목표). run_id가 없으면 legacy 행만.
create function pg_temp.single(p_user uuid, p_start text, p_target text, p_target_title text,
                               p_clicks integer, p_at timestamptz, p_legacy boolean default false)
returns void language plpgsql as $$
declare
  v_run uuid := case when p_legacy then null else gen_random_uuid() end;
begin
  if not p_legacy then
    insert into public.single_game_runs (
      id, user_id, status, start_page_id, start_revision_id, start_title_snapshot,
      target_page_id, target_revision_id, target_title_snapshot,
      current_page_id, current_revision_id, current_title_snapshot,
      move_count, path_page_ids, path_revision_ids, path_title_snapshots,
      started_at, finished_at, created_at
    ) values (
      v_run, p_user, 'completed', p_start, '1', p_start, p_target, '1', p_target_title,
      p_target, '1', p_target_title, p_clicks, array[p_start, p_target], array['1', '1'],
      array[p_start, p_target_title], p_at - interval '1 minute', p_at, p_at - interval '1 minute'
    );
    insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
                                         event_type, from_page_id, to_page_id, move_delta, version_before, version_after,
                                         server_timestamp)
    values ('single', v_run, p_user, p_user, gen_random_uuid(), gen_random_uuid(),
            'NORMAL_LINK', p_start, p_target, 1, 0, 1, p_at);
  end if;
  insert into public.game_records (
    run_id, user_id, player_name, start_title, target_title, elapsed_seconds,
    click_count, path_titles, start_page_id, target_page_id, start_revision_id,
    target_revision_id, result_status, created_at
  ) values (
    v_run, p_user, 'RR', p_start, p_target_title, 60, p_clicks, array[p_start, p_target_title],
    p_start, p_target, '1', '1', 'completed', p_at
  );
end;
$$;

-- 끝난 1:1 1건 (방 + 결과). p_events면 승자의 완주 이동 이벤트 1개 (서버 권위 이후 기록).
create function pg_temp.duel(p_winner uuid, p_loser uuid, p_at timestamptz, p_events boolean default true) returns void
language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  if p_events then
    insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
                                         event_type, from_page_id, to_page_id, move_delta, version_before, version_after,
                                         server_timestamp)
    values ('duel', v_room, p_winner, p_winner, gen_random_uuid(), gen_random_uuid(),
            'NORMAL_LINK', 'rr-f', 'rr-duel-t', 1, 0, 1, p_at);
  end if;
  insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players,
                                 use_items, game_starts_at, finished_at, finished_reason)
  values (v_room, 'RR' || substr(replace(v_room::text, '-', ''), 1, 8), p_winner, 'finished', 'duel', 2, 2,
          false, p_at - interval '1 minute', p_at, 'normal_finish');
  insert into public.match_history (room_id, winner_user_id, loser_user_id, duration_seconds,
                                    result_status, result_reason, finalized_at)
  values (v_room, p_winner, p_loser, 60, 'completed', 'normal_finish', p_at);
end;
$$;

-- R1: 첫 도착 + 오늘 코스 10일 + legacy 2
select pg_temp.single(pg_temp.uid(1), 'rr-s', 'rr-t' || n, 'RR 목표 ' || n, 3, now() - n * interval '1 hour')
  from generate_series(1, 3) n;
insert into public.daily_challenges (challenge_date, target_title)
select (now() at time zone 'Asia/Seoul')::date - d - 100, 'RR 오늘 ' || d from generate_series(1, 10) d;
select pg_temp.single(pg_temp.uid(1), 'rr-s', 'rr-d' || d, 'RR 오늘 ' || d, 4,
                      (((now() at time zone 'Asia/Seoul')::date - d - 100)::timestamp + interval '12 hours') at time zone 'Asia/Seoul')
  from generate_series(1, 10) d;
select pg_temp.single(pg_temp.uid(1), 'rr-s', 'rr-legacy', 'RR legacy', 1, now() - interval '200 days', true)
  from generate_series(1, 2);
select public.grant_xp_v1(pg_temp.uid(1), 'admin_adjustment', gen_random_uuid(), 150, 150);

-- R2: 문서 100곳 (시작 rr-s + 목표 99곳 + 단축 코스 목표 1곳 = 101) · 같은 코스 6회 단축 · 장착
select pg_temp.single(pg_temp.uid(2), 'rr-s', 'rr-v' || n, 'RR 방문 ' || n, 5, now() - interval '30 days' + n * interval '1 minute')
  from generate_series(1, 99) n;
select pg_temp.single(pg_temp.uid(2), 'rr-s', 'rr-course', 'RR 코스', 10 - n, now() - interval '10 days' + n * interval '1 hour')
  from generate_series(0, 6) n;
insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
values (pg_temp.uid(2), 'title_daily_steps_1', 'admin') on conflict do nothing;
insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
values (pg_temp.uid(2), 'profile_icon', 1, 'icon_default_book'),
       (pg_temp.uid(2), 'title', 1, 'title_daily_steps_1');

-- R3 > R4: 12일에 걸쳐 12승. R5 > R6: 하루에 7승.
select pg_temp.duel(pg_temp.uid(3), pg_temp.uid(4), now() - d * interval '1 day') from generate_series(1, 12) d;
select pg_temp.duel(pg_temp.uid(5), pg_temp.uid(6), date_trunc('day', now() - interval '40 days') + n * interval '10 minutes', false)
  from generate_series(1, 7) n;

-- R5..R12: 8인 그룹 1판(완주자마다 이동 이벤트 1개), R12 기권
with room as (
  insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players,
                                 use_items, finish_rank_limit, game_starts_at, finished_at, finished_reason)
  values (gen_random_uuid(), 'RRGROUP1', pg_temp.uid(5), 'finished', 'group', 3, 8,
          false, 3, now() - interval '50 days', now() - interval '50 days' + interval '10 minutes', 'all_resolved')
  returning id, finished_at
)
insert into public.group_match_results (room_id, user_id, rank, is_winner, move_count, finished_at,
                                        result_status, retire_reason, retired_at, finalized_at)
select room.id, pg_temp.uid(n),
       case when n < 12 then n - 4 end, n = 5, 3,
       case when n < 12 then room.finished_at - interval '1 minute' end,
       case when n < 12 then 'finished' else 'retired' end,
       case when n = 12 then 'forfeited' end,
       case when n = 12 then room.finished_at - interval '5 minutes' end,
       room.finished_at
  from room, generate_series(5, 12) n;
insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
                                     event_type, from_page_id, to_page_id, move_delta, version_before, version_after,
                                     server_timestamp)
select 'group', room.id, pg_temp.uid(n), pg_temp.uid(n), gen_random_uuid(), gen_random_uuid(),
       'NORMAL_LINK', 'rr-g', 'rr-group-t', 1, 0, 1, room.finished_at - interval '1 minute'
  from public.game_rooms room, generate_series(5, 11) n
 where room.room_code = 'RRGROUP1';

-- R13: 이동 이벤트 없는 그룹 완주 (서버 권위 이전 기록 모양) — 제외 대상
with room as (
  insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players,
                                 use_items, finish_rank_limit, game_starts_at, finished_at, finished_reason)
  values (gen_random_uuid(), 'RRGROUP0', pg_temp.uid(13), 'finished', 'group', 3, 8,
          false, 3, now() - interval '90 days', now() - interval '90 days' + interval '10 minutes', 'all_resolved')
  returning id, finished_at
)
insert into public.group_match_results (room_id, user_id, rank, is_winner, move_count, finished_at,
                                        result_status, finalized_at)
select room.id, pg_temp.uid(13), 1, true, 2, room.finished_at, 'finished', room.finished_at from room;

-- R13: legacy만
select pg_temp.single(pg_temp.uid(13), 'rr-s', 'rr-legacy', 'RR legacy', 1, now() - interval '300 days', true);

alter table public.game_records enable trigger trg_record_single_result_achievements;
alter table public.game_records enable trigger trg_grant_single_result_xp;
alter table public.match_history enable trigger trg_record_duel_result_achievements;
alter table public.match_history enable trigger trg_grant_duel_result_xp;
alter table public.game_rooms enable trigger trg_record_group_result_achievements;
alter table public.game_rooms enable trigger trg_grant_group_result_xp;
alter table public.user_profile_equipment enable trigger trg_record_equipment_achievements;

-- 실행기가 이 뒤에 dry-run 파일 → apply 파일 → apply 파일을 붙이고 ROLLBACK 한다.
