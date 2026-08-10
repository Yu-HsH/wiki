-- 로컬 전용 Phase 2A 회귀 테스트.
-- 운영 데이터·운영 키를 사용하지 않으며 전체를 하나의 트랜잭션으로 롤백한다.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create temporary table phase2a_test_rooms (
  name text primary key,
  room_id uuid not null
);

create temporary table phase2a_test_players (
  room_id uuid not null,
  ordinal integer not null,
  user_id uuid not null,
  primary key (room_id, ordinal)
);

grant select on phase2a_test_rooms, phase2a_test_players to public;

create or replace function pg_temp.create_phase2a_fixture(
  p_player_count integer,
  p_user_offset integer,
  p_game_duration_seconds integer default 900,
  p_grace_duration_seconds integer default 180
)
returns uuid
language plpgsql
as $$
declare
  v_room_id uuid := gen_random_uuid();
  v_user_id uuid;
  v_ordinal integer;
begin
  -- game_rooms.host_user_id와 이후 FK를 만족하도록 로컬 auth 사용자부터 만든다.
  for v_ordinal in 1..p_player_count loop
    v_user_id := (
      '00000000-0000-0000-0001-' || lpad((p_user_offset + v_ordinal)::text, 12, '0')
    )::uuid;

    insert into auth.users (
      id,
      aud,
      role,
      email,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      'authenticated',
      'authenticated',
      'phase2a-' || v_user_id::text || '@local.test',
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
    on conflict (id) do nothing;
  end loop;

  insert into public.game_rooms (
    id,
    room_code,
    host_user_id,
    status,
    mode,
    max_players,
    min_players,
    finish_rank_limit,
    game_duration_seconds,
    grace_duration_seconds,
    use_items
  )
  values (
    v_room_id,
    'phase2a-' || replace(v_room_id::text, '-', ''),
    ('00000000-0000-0000-0001-' || lpad((p_user_offset + 1)::text, 12, '0'))::uuid,
    'waiting',
    'group',
    p_player_count,
    2,
    3,
    p_game_duration_seconds,
    p_grace_duration_seconds,
    false
  );

  for v_ordinal in 1..p_player_count loop
    v_user_id := (
      '00000000-0000-0000-0001-' || lpad((p_user_offset + v_ordinal)::text, 12, '0')
    )::uuid;

    insert into auth.users (
      id,
      aud,
      role,
      email,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      'authenticated',
      'authenticated',
      'phase2a-' || v_user_id::text || '@local.test',
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
    on conflict (id) do nothing;

    insert into public.profiles (
      id,
      username,
      nickname,
      synthetic_email
    )
    values (
      v_user_id,
      'phase2a-' || v_user_id::text,
      'Phase 2A ' || v_ordinal::text,
      'phase2a-' || v_user_id::text || '@local.test'
    )
    on conflict (id) do nothing;

    insert into public.room_players (
      room_id,
      user_id,
      role,
      nickname_snapshot,
      is_ready,
      submitted_target_title
    )
    values (
      v_room_id,
      v_user_id,
      case when v_ordinal = 1 then 'host' else 'guest' end,
      'phase2a-player-' || v_user_id::text,
      true,
      case when mod(v_ordinal, 2) = 0 then 'Target B' else 'Target A' end
    );

    insert into phase2a_test_players (room_id, ordinal, user_id)
    values (v_room_id, v_ordinal, v_user_id);
  end loop;

  return v_room_id;
end;
$$;

create or replace function pg_temp.run_start(p_room_name text)
returns void
language plpgsql
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id
  from pg_temp.phase2a_test_rooms
  where name = p_room_name;
  perform public.start_group_room_game(v_room_id);
end;
$$;

create or replace function pg_temp.run_activate(p_room_name text)
returns void
language plpgsql
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id
  from pg_temp.phase2a_test_rooms
  where name = p_room_name;
  perform public.activate_group_room_game(v_room_id);
end;
$$;

create or replace function pg_temp.run_finish(
  p_room_name text,
  p_elapsed_seconds integer,
  p_move_count integer,
  p_path_label text
)
returns void
language plpgsql
as $$
declare
  v_room_id uuid;
  v_target_title text;
begin
  select room_id into v_room_id
  from pg_temp.phase2a_test_rooms
  where name = p_room_name;

  select group_target_title into v_target_title
  from public.game_rooms
  where id = v_room_id;

  perform public.finish_group_player(
    v_room_id,
    p_elapsed_seconds,
    p_move_count,
    v_target_title,
    array[p_path_label]
  );
end;
$$;

create or replace function pg_temp.run_finalize(p_room_name text)
returns void
language plpgsql
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id
  from pg_temp.phase2a_test_rooms
  where name = p_room_name;
  perform public.finalize_group_room_if_expired(v_room_id);
end;
$$;

create or replace function pg_temp.run_leave(p_room_name text, p_reason text)
returns void
language plpgsql
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id
  from pg_temp.phase2a_test_rooms
  where name = p_room_name;
  perform public.leave_group_player(v_room_id, p_reason);
end;
$$;

grant execute on function pg_temp.run_start(text) to public;
grant execute on function pg_temp.run_activate(text) to public;
grant execute on function pg_temp.run_finish(text, integer, integer, text) to public;
grant execute on function pg_temp.run_finalize(text) to public;
grant execute on function pg_temp.run_leave(text, text) to public;

insert into phase2a_test_rooms (name, room_id)
values
  ('four', pg_temp.create_phase2a_fixture(4, 0)),
  ('six', pg_temp.create_phase2a_fixture(6, 100)),
  ('deadline', pg_temp.create_phase2a_fixture(4, 200)),
  ('late_finish', pg_temp.create_phase2a_fixture(4, 800)),
  ('target', pg_temp.create_phase2a_fixture(2, 300)),
  ('waiting', pg_temp.create_phase2a_fixture(2, 400)),
  ('leave', pg_temp.create_phase2a_fixture(2, 500)),
  ('rls_a', pg_temp.create_phase2a_fixture(2, 600)),
  ('rls_b', pg_temp.create_phase2a_fixture(2, 700));

-- 스키마·권한·Realtime 회귀
select ok(
  (select count(*) = 7
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'game_rooms'
     and column_name = any (array[
       'game_duration_seconds',
       'grace_duration_seconds',
       'game_starts_at',
       'game_deadline_at',
       'grace_started_at',
       'grace_ends_at',
       'finished_reason'
     ])),
  'game_rooms Phase 2A columns exist'
);

select ok(
  (select count(*) = 4
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'room_players'
     and column_name = any (array[
       'player_status',
       'disconnected_at',
       'retired_at',
       'retire_reason'
     ])),
  'room_players lifecycle columns exist'
);

select ok(
  (select count(*) = 4
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'group_match_results'
     and column_name = any (array[
       'result_status',
       'retire_reason',
       'retired_at',
       'finalized_at'
     ])),
  'group_match_results lifecycle columns exist'
);

select ok(
  has_function_privilege('authenticated', 'public.activate_group_room_game(uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.activate_group_room_game(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.activate_group_room_game(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.finalize_group_room_if_expired(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.leave_group_player(uuid, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.leave_group_player(uuid, text)', 'EXECUTE'),
  'Phase 2A RPC execute privileges are restricted'
);

select ok(
  (select count(*) = 4
   from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename = any (array[
       'game_rooms', 'room_players', 'group_match_results', 'room_events'
     ])),
  'existing Realtime publication still contains all group tables'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'trg_room_players_updated_at'
      and not tgisinternal
  ),
  'Phase 1 room_players updated_at trigger remains'
);

-- 4인 경기: start → activate → 3등 유예 → 4등 완주 → 전원 종료
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000001';

select is(
  (select status from public.start_group_room_game((select room_id from phase2a_test_rooms where name = 'four'))),
  'starting',
  'host can start a group room'
);

select ok(
  (select game_starts_at is null and game_deadline_at is null and status = 'starting'
   from public.game_rooms
   where id = (select room_id from phase2a_test_rooms where name = 'four')),
  'start only enters countdown state'
);

select is(
  (select status from public.activate_group_room_game((select room_id from phase2a_test_rooms where name = 'four'))),
  'playing',
  'a participant can activate the group room'
);

select ok(
  (select game_starts_at is not null
      and game_deadline_at between now() + interval '899 seconds' and now() + interval '901 seconds'
      and not exists (
        select 1 from room_players
        where room_id = (select room_id from phase2a_test_rooms where name = 'four')
          and player_status <> 'playing'
      )
   from public.game_rooms
   where id = (select room_id from phase2a_test_rooms where name = 'four')),
  'activation sets server start/deadline and playing participant state'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000002';

select is(
  (select status from public.activate_group_room_game((select room_id from phase2a_test_rooms where name = 'four'))),
  'playing',
  'repeated activation is idempotent'
);

select is(
  (select count(*)::integer
   from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'four')
     and event_type = 'group_game_activated'),
  1,
  'activation event is emitted once'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000001';

do $$ begin
  perform pg_temp.run_finish('four', 999, 1, 'phase2a-start');
end $$;

select is(
  (select finished_count from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'four')),
  1,
  'finished_count is one after the first four-player finisher'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000002';

do $$ begin
  perform pg_temp.run_finish('four', 998, 2, 'phase2a-start');
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000003';

do $$ begin
  perform pg_temp.run_finish('four', 997, 3, 'phase2a-start');
end $$;

select is(
  (select status from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'four')),
  'grace_period',
  'third finish starts grace_period instead of ending the room'
);

select is(
  (select finished_count from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'four')),
  3,
  'finished_count is three while the four-player room is in grace_period'
);

select ok(
  (select grace_ends_at <= grace_started_at + interval '180 seconds'
      and grace_ends_at >= grace_started_at
   from public.game_rooms
   where id = (select room_id from phase2a_test_rooms where name = 'four')),
  'grace period is capped at the configured duration'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000004';

do $$ begin
  perform pg_temp.run_finish('four', 1, 4, 'phase2a-start');
end $$;

select is(
  (select rank from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'four')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'four') and ordinal = 4)),
  4,
  'fourth finisher receives rank four'
);

select is(
  (select is_winner from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'four')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'four') and ordinal = 4)),
  false,
  'fourth finisher is not a winner'
);

select is(
  (select status from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'four')),
  'finished',
  'all four finishes end the room'
);

select is(
  (select finished_reason from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'four')),
  'all_resolved',
  'all resolved is recorded as the finish reason'
);

select is(
  (select count(*)::integer from public.group_match_results where room_id = (select room_id from phase2a_test_rooms where name = 'four')),
  4,
  'four finish results are present'
);

select is(
  (select count(*)::integer from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'four')
     and event_type = 'game_end'),
  1,
  'game_end is emitted once for the four-player room'
);

select ok(
  (select winner_user_ids = ARRAY[
      (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'four') and ordinal = 1),
      (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'four') and ordinal = 2),
      (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'four') and ordinal = 3)
    ]::uuid[]
   from public.game_rooms
   where id = (select room_id from phase2a_test_rooms where name = 'four')),
  'winner_user_ids contains exactly the first through third finishers'
);

select is(
  (select result_rank from public.finish_group_player(
    (select room_id from phase2a_test_rooms where name = 'four'),
    0,
    0,
    (select group_target_title from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'four')),
    array['duplicate']
  )),
  4,
  'duplicate finish returns the existing rank'
);

select is(
  (select count(*)::integer from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'four')
     and event_type = 'player_finish'),
  4,
  'duplicate finish does not emit a duplicate event'
);

select is(
  (select count(*)::integer from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'four')
     and event_type = 'grace_started'),
  1,
  'grace_started is emitted exactly once'
);

-- 6인 경기: 유예 만료 시 한 명을 RETIRE 처리한다.
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000101';
do $$ begin
  perform pg_temp.run_start('six');
  perform pg_temp.run_activate('six');
  perform pg_temp.run_finish('six', 1, 1, 'one');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000102';
do $$ begin perform pg_temp.run_finish('six', 2, 2, 'two'); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000103';
do $$ begin perform pg_temp.run_finish('six', 3, 3, 'three'); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000104';
do $$ begin perform pg_temp.run_finish('six', 4, 4, 'four'); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000105';
do $$ begin perform pg_temp.run_finish('six', 5, 5, 'five'); end $$;

set local role postgres;
update public.game_rooms
set grace_ends_at = now() - interval '1 second'
where id = (select room_id from phase2a_test_rooms where name = 'six');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000106';
do $$ begin perform pg_temp.run_finalize('six'); end $$;

select is(
  (select player_status
   from public.room_players
   where room_id = (select room_id from phase2a_test_rooms where name = 'six')
     and user_id = (
       select user_id
       from phase2a_test_players
       where room_id = (select room_id from phase2a_test_rooms where name = 'six')
         and ordinal = 6
     )),
  'retired',
  'grace expiry retires the unfinished player'
);

select is(
  (select retire_reason
   from public.room_players
   where room_id = (select room_id from phase2a_test_rooms where name = 'six')
     and user_id = (
       select user_id
       from phase2a_test_players
       where room_id = (select room_id from phase2a_test_rooms where name = 'six')
         and ordinal = 6
     )),
  'grace_timeout',
  'grace expiry records grace_timeout'
);

select ok(
  (select result_status = 'retired' and rank is null and is_winner = false and finished_at is null
      and retire_reason = 'grace_timeout' and retired_at is not null and finalized_at is not null
   from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'six')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'six') and ordinal = 6)),
  'RETIRE result preserves null rank and finalization metadata'
);

select is(
  (select count(*)::integer from public.group_match_results where room_id = (select room_id from phase2a_test_rooms where name = 'six')),
  6,
  'six-player room has one result per participant'
);

select is(
  (select finished_reason from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'six')),
  'grace_timeout',
  'six-player room finishes because grace expired'
);

select is(
  (select finished_count from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'six')),
  5,
  'finished_count counts only normal finishers'
);

select ok(
  (select count(*) filter (where player_status = 'finished') = 5
      and count(*) filter (where player_status = 'retired') = 1
   from public.room_players
   where room_id = (select room_id from phase2a_test_rooms where name = 'six')),
  'six-player final result has five finishers and one retired player'
);

select is(
  (select count(*)::integer from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'six') and event_type = 'game_end'),
  1,
  'finalizer game_end is idempotent'
);

do $$ begin perform pg_temp.run_finalize('six'); end $$;
select is(
  (select count(*)::integer from public.group_match_results where room_id = (select room_id from phase2a_test_rooms where name = 'six')),
  6,
  'repeated finalization does not duplicate results'
);

-- 전체 제한시간 만료와 목표 문서 검증
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000201';
do $$ begin
  perform pg_temp.run_start('deadline');
  perform pg_temp.run_activate('deadline');
  perform pg_temp.run_finish('deadline', 1, 1, 'one');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000202';
do $$ begin perform pg_temp.run_finish('deadline', 2, 2, 'two'); end $$;

set local role postgres;
update public.game_rooms
set game_deadline_at = now() - interval '1 second'
where id = (select room_id from phase2a_test_rooms where name = 'deadline');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000203';
do $$ begin perform pg_temp.run_finalize('deadline'); end $$;

select is(
  (select finished_reason from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'deadline')),
  'time_limit',
  'deadline expiry records time_limit'
);

select is(
  (select count(*)::integer from public.room_players where room_id = (select room_id from phase2a_test_rooms where name = 'deadline') and player_status = 'retired'),
  2,
  'deadline expiry retires all unfinished players'
);

-- A finish call immediately after deadline expiry must preserve finalizer changes.
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000801';
do $$ begin
  perform pg_temp.run_start('late_finish');
  perform pg_temp.run_activate('late_finish');
end $$;

set local role postgres;
update public.game_rooms
set game_deadline_at = now() - interval '1 second'
where id = (select room_id from phase2a_test_rooms where name = 'late_finish');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000801';

select ok(
  (select result_room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
      and result_user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish') and ordinal = 1)
      and result_rank is null
      and result_is_winner = false
      and result_room_status = 'finished'
   from public.finish_group_player(
     (select room_id from phase2a_test_rooms where name = 'late_finish'),
     0,
     0,
     (select group_target_title from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'late_finish')),
     array['late-finish']
   )),
  'late finish returns the existing result shape without recording a finish'
);

select is(
  (select status from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'late_finish')),
  'finished',
  'late finish leaves the room finished'
);

select is(
  (select player_status from public.room_players
   where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish') and ordinal = 1)),
  'retired',
  'late finish leaves the player retired'
);

select is(
  (select result_status from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish') and ordinal = 1)),
  'retired',
  'late finish preserves the retired result status'
);

select ok(
  (select rank is null and is_winner = false
   from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish') and ordinal = 1)),
  'late finish preserves null rank and a false winner flag'
);

select is(
  (select count(*)::integer from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
     and result_status = 'finished'),
  0,
  'late finish does not create a finished result'
);

select is(
  (select count(*)::integer from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
     and event_type = 'game_end'),
  1,
  'late finish emits one game_end event through the finalizer'
);

select throws_ok(
  format(
    'select * from public.finish_group_player(%L::uuid, 0, 0, %L, null::text[])',
    (select room_id::text from phase2a_test_rooms where name = 'late_finish'),
    (select group_target_title from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'late_finish'))
  ),
  'P0001',
  'retired players cannot finish',
  'repeated late finish keeps the pre-existing retired-player policy'
);

select ok(
  (select result_status = 'retired'
      and rank is null
      and is_winner = false
      and finished_at is null
      and retire_reason = 'time_limit'
      and retired_at is not null
      and finalized_at is not null
   from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish') and ordinal = 1)),
  'repeated late finish does not corrupt the retired result'
);

select is(
  (select count(*)::integer from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'late_finish')
     and event_type = 'game_end'),
  1,
  'repeated late finish does not duplicate game_end'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000301';
do $$ begin
  perform pg_temp.run_start('target');
  perform pg_temp.run_activate('target');
end $$;

select throws_ok(
  format(
    'select * from public.finish_group_player(%L::uuid, 0, 0, %L, null::text[])',
    (select room_id::text from phase2a_test_rooms where name = 'target'),
    'not-the-server-target'
  ),
  'P0001',
  null,
  'finish rejects a client title different from the server target'
);

select is(
  (select count(*)::integer from public.group_match_results where room_id = (select room_id from phase2a_test_rooms where name = 'target')),
  0,
  'rejected target does not create a result'
);

-- waiting 퇴장과 경기 중 leave/forfeited
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000402';
do $$ begin perform pg_temp.run_leave('waiting', 'left'); end $$;

select is(
  (select count(*)::integer from public.room_players
   where room_id = (select room_id from phase2a_test_rooms where name = 'waiting')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'waiting') and ordinal = 2)),
  0,
  'waiting leave keeps the existing row deletion behavior'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000501';
do $$ begin
  perform pg_temp.run_start('leave');
  perform pg_temp.run_activate('leave');
  perform pg_temp.run_leave('leave', 'forfeited');
end $$;

select ok(
  (select player_status = 'retired' and rank is null and has_finished = false and retire_reason = 'forfeited'
   from public.room_players
   where room_id = (select room_id from phase2a_test_rooms where name = 'leave')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'leave') and ordinal = 1)),
  'in-game forfeited player is retained as retired'
);

select is(
  (select result_status from public.group_match_results
   where room_id = (select room_id from phase2a_test_rooms where name = 'leave')
     and user_id = (select user_id from phase2a_test_players where room_id = (select room_id from phase2a_test_rooms where name = 'leave') and ordinal = 1)),
  'retired',
  'in-game leave creates a retired result'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000502';
do $$ begin perform pg_temp.run_leave('leave', 'left'); end $$;
do $$ begin perform pg_temp.run_leave('leave', 'left'); end $$;

select is(
  (select finished_reason from public.game_rooms where id = (select room_id from phase2a_test_rooms where name = 'leave')),
  'all_resolved',
  'all retired participants finish a room immediately'
);

select is(
  (select count(*)::integer from public.room_events
   where room_id = (select room_id from phase2a_test_rooms where name = 'leave') and event_type = 'game_end'),
  1,
  'repeated leave does not duplicate game_end'
);

-- 비참가자와 익명 호출 차단
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000009999';

select throws_ok(
  format('select * from public.activate_group_room_game(%L::uuid)', (select room_id::text from phase2a_test_rooms where name = 'target')),
  'P0001',
  null,
  'authenticated non-participant cannot activate'
);

select throws_ok(
  format('select * from public.finalize_group_room_if_expired(%L::uuid)', (select room_id::text from phase2a_test_rooms where name = 'target')),
  'P0001',
  null,
  'authenticated non-participant cannot finalize'
);

select throws_ok(
  format('select * from public.leave_group_player(%L::uuid, ''left'')', (select room_id::text from phase2a_test_rooms where name = 'target')),
  'P0001',
  null,
  'authenticated non-participant cannot leave'
);

select is(
  has_function_privilege('anon', 'public.activate_group_room_game(uuid)', 'EXECUTE'),
  false,
  'anon cannot call activate RPC'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0001-000000000601';

select is(
  (select count(*)::integer from public.room_players where room_id = (select room_id from phase2a_test_rooms where name = 'rls_a')),
  2,
  'participant can read players in own room'
);

select is(
  (select count(*)::integer from public.room_players where room_id = (select room_id from phase2a_test_rooms where name = 'rls_b')),
  0,
  'participant cannot read players in another room'
);

set local role postgres;
select * from finish();
rollback;
