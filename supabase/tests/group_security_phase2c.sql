-- 로컬 전용 Phase 2C 회귀 테스트.
-- 운영 데이터·운영 키를 사용하지 않으며 전체를 하나의 트랜잭션으로 롤백한다.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create temporary table phase2c_test_rooms (
  name text primary key,
  room_id uuid not null
);

grant all on phase2c_test_rooms to public;

create or replace function pg_temp.try_forge_group_player(
  p_room_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.room_players
  set rank = 99,
      has_finished = true,
      player_status = 'finished'
  where room_id = p_room_id
    and user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
exception
  when insufficient_privilege then
    return 0;
end;
$$;

create or replace function pg_temp.try_update_player_progress(
  p_room_id uuid,
  p_user_id uuid,
  p_title text
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.room_players
  set current_title = p_title,
      move_count = 1,
      is_ready = true
  where room_id = p_room_id
    and user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
exception
  when insufficient_privilege then
    return 0;
end;
$$;

create or replace function pg_temp.try_delete_player(
  p_room_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  delete from public.room_players
  where room_id = p_room_id
    and user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
exception
  when insufficient_privilege then
    return 0;
end;
$$;

create or replace function pg_temp.try_forge_group_room(p_room_id uuid)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.game_rooms
  set status = 'finished',
      group_target_title = 'Forged',
      finished_count = 99,
      winner_user_ids = array[auth.uid()]
  where id = p_room_id;
  get diagnostics v_count = row_count;
  return v_count;
exception
  when insufficient_privilege then
    return 0;
end;
$$;

create or replace function pg_temp.try_update_room_status(
  p_room_id uuid,
  p_status text
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.game_rooms
  set status = p_status
  where id = p_room_id;
  get diagnostics v_count = row_count;
  return v_count;
exception
  when insufficient_privilege then
    return 0;
end;
$$;

create or replace function pg_temp.try_delete_room(p_room_id uuid)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  delete from public.game_rooms
  where id = p_room_id;
  get diagnostics v_count = row_count;
  return v_count;
exception
  when insufficient_privilege then
    return 0;
end;
$$;

do $$
declare
  v_ordinal integer;
  v_user_id uuid;
begin
  for v_ordinal in 1..9 loop
    v_user_id := (
      '00000000-0000-0000-0002-' || lpad(v_ordinal::text, 12, '0')
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
      'phase2c-' || v_ordinal::text || '@local.test',
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    );

    insert into public.profiles (
      id,
      username,
      nickname,
      synthetic_email
    )
    values (
      v_user_id,
      'phase2c-' || v_ordinal::text,
      'Phase 2C ' || v_ordinal::text,
      'phase2c-' || v_ordinal::text || '@local.test'
    );
  end loop;
end;
$$;

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_group_room(integer, integer, integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.join_group_room(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.submit_group_target(uuid, text, text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.set_group_ready(uuid, boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.apply_group_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.leave_group_waiting_room(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.finalize_group_records(uuid)',
    'EXECUTE'
  ),
  'authenticated can execute the V2 group mutation and lifecycle RPCs'
);

select ok(
  to_regprocedure('public.update_group_progress(uuid,text,integer,text[],integer)') is null
  and to_regprocedure('public.finish_group_player(uuid,integer,integer,text,text[])') is null,
  'legacy progress and finish RPCs are unavailable after V2 cutover'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_group_room(integer, integer, integer)',
    'EXECUTE'
  )
  and not has_function_privilege('anon', 'public.join_group_room(uuid)', 'EXECUTE')
  and not has_function_privilege(
    'anon',
    'public.submit_group_target(uuid, text, text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.set_group_ready(uuid, boolean)',
    'EXECUTE'
  )
  and to_regprocedure('public.update_group_progress(uuid,text,integer,text[],integer)') is null
  and not has_function_privilege(
    'anon',
    'public.leave_group_waiting_room(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.finalize_group_records(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute Phase 2C group RPCs'
);

select ok(
  has_table_privilege('authenticated', 'public.group_match_history', 'SELECT')
  and not has_table_privilege('authenticated', 'public.group_match_history', 'INSERT')
  and not has_table_privilege('authenticated', 'public.group_match_history', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.group_match_history', 'DELETE')
  and not has_table_privilege('authenticated', 'public.user_profile_stats', 'INSERT')
  and not has_table_privilege('authenticated', 'public.user_profile_stats', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.user_profile_stats', 'DELETE'),
  'history and profile stats expose no authenticated DML privilege'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000001';

insert into phase2c_test_rooms (name, room_id)
select 'capacity', id
from public.create_group_room(3, 3, 3);

select is(
  (
    select mode
    from public.game_rooms
    where id = (select room_id from phase2c_test_rooms where name = 'capacity')
  ),
  'group',
  'create_group_room always creates group mode'
);

select is(
  (
    select count(*)::integer
    from public.room_players
    where room_id = (select room_id from phase2c_test_rooms where name = 'capacity')
      and user_id = '00000000-0000-0000-0002-000000000001'::uuid
      and role = 'host'
      and player_status = 'waiting'
      and not is_ready
  ),
  1,
  'create_group_room atomically creates the authenticated host player'
);

select throws_ok(
  $$
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
      'forged-group',
      '00000000-0000-0000-0002-000000000001'::uuid,
      'waiting',
      'group',
      2,
      2,
      2
    )
  $$,
  '42501',
  'permission denied for table game_rooms',
  'authenticated cannot bypass create_group_room with direct group insert'
);

select is(
  pg_temp.try_delete_room(
    (select room_id from phase2c_test_rooms where name = 'capacity')
  ),
  0,
  'group host cannot directly delete a room'
);

select is(
  pg_temp.try_delete_player(
    (select room_id from phase2c_test_rooms where name = 'capacity'),
    '00000000-0000-0000-0002-000000000001'::uuid
  ),
  0,
  'group host cannot bypass the waiting-room leave RPC with direct delete'
);

select throws_ok(
  format(
    'insert into public.room_events (room_id, user_id, event_type, payload) values (%L::uuid, %L::uuid, %L, %L::jsonb)',
    (select room_id::text from phase2c_test_rooms where name = 'capacity'),
    '00000000-0000-0000-0002-000000000001',
    'forged_group_event',
    '{}'
  ),
  '42501',
  'new row violates row-level security policy for table "room_events"',
  'group participant cannot insert arbitrary room events directly'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000002';

select lives_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'capacity')
  ),
  'join_group_room admits a waiting authenticated player'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000003';

select lives_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'capacity')
  ),
  'third player joins the three-player capacity room'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000004';

select throws_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'capacity')
  ),
  'P0001',
  'GROUP_ROOM_FULL',
  'join_group_room rejects max_players overflow'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000001';

insert into phase2c_test_rooms (name, room_id)
select 'lifecycle', id
from public.create_group_room(3, 3, 3);

select throws_ok(
  format(
    'select public.set_group_ready(%L::uuid, true)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'P0001',
  'submit a target before becoming ready',
  'ready=true requires a submitted target'
);

select lives_ok(
  format(
    'select public.submit_group_target(%L::uuid, %L, %L)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle'),
    'seoul',
    'Seoul'
  ),
  'host can submit a target while waiting'
);

select lives_ok(
  format(
    'select public.set_group_ready(%L::uuid, true)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'host can become ready after target submission'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000002';

select lives_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'second player joins the lifecycle room'
);

select lives_ok(
  format(
    'select public.submit_group_target(%L::uuid, %L, %L)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle'),
    'busan',
    'Busan'
  ),
  'second player can submit a distinct target'
);

select lives_ok(
  format(
    'select public.set_group_ready(%L::uuid, true)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'second player can become ready'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000003';

select lives_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'third player joins the lifecycle room'
);

select lives_ok(
  format(
    'select public.submit_group_target(%L::uuid, %L, %L)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle'),
    'jeju',
    'Jeju'
  ),
  'third player can submit a distinct target'
);

select lives_ok(
  format(
    'select public.set_group_ready(%L::uuid, true)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'third player can become ready'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000001';

select is(
  (
    select status
    from public.start_group_room_game(
      (select room_id from phase2c_test_rooms where name = 'lifecycle')
    )
  ),
  'starting',
  'existing lifecycle RPC starts a room prepared through Phase 2C RPCs'
);

select throws_ok(
  format(
    'select public.submit_group_target(%L::uuid, %L, %L)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle'),
    'changed',
    'Changed Target'
  ),
  'P0001',
  'group target can only be submitted in a waiting room',
  'target submission is rejected after start'
);

select throws_ok(
  format(
    'select public.set_group_ready(%L::uuid, false)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'P0001',
  'ready state can only change in a waiting group room',
  'ready state changes are rejected after start'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000004';

select throws_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle')
  ),
  'P0001',
  'GROUP_ROOM_NOT_WAITING',
  'join_group_room rejects a non-waiting room'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000002';

select is(
  (
    select status
    from public.activate_group_room_game(
      (select room_id from phase2c_test_rooms where name = 'lifecycle')
    )
  ),
  'playing',
  'a participant can activate the RPC-created group room'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000001';

select throws_ok(
  format(
    'select public.update_group_progress(%L::uuid, %L, 1, array[%L, %L]::text[], 0)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle'),
    'Korea',
    'Start',
    'Korea'
  ),
  '42883',
  null,
  'legacy progress RPC is unavailable after the V2 cutover'
);

select is(
  pg_temp.try_forge_group_player(
    (select room_id from phase2c_test_rooms where name = 'lifecycle'),
    '00000000-0000-0000-0002-000000000001'::uuid
  ),
  0,
  'group player cannot directly change own official result fields'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000002';

select is(
  pg_temp.try_update_player_progress(
    (select room_id from phase2c_test_rooms where name = 'lifecycle'),
    '00000000-0000-0000-0002-000000000001'::uuid,
    'Forged'
  ),
  0,
  'a group player cannot directly manipulate another player row'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000001';

select is(
  pg_temp.try_forge_group_room(
    (select room_id from phase2c_test_rooms where name = 'lifecycle')
  ),
  0,
  'group participants cannot directly change room lifecycle or winner fields'
);

select throws_ok(
  format(
    'select public.finish_group_player(%L::uuid, 10, 1, %L, array[%L]::text[])',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle'),
    'Target',
    'Target'
  ),
  '42883',
  null,
  'legacy finish RPC is unavailable after the V2 cutover'
);

select is(
  (select count(*)::integer from public.group_match_results
   where room_id = (select room_id from phase2c_test_rooms where name = 'lifecycle')),
  0,
  'legacy finish rejection creates no group result'
);

select is(
  (select count(*)::integer from public.group_match_history
   where room_id = (select room_id from phase2c_test_rooms where name = 'lifecycle')),
  0,
  'legacy finish rejection creates no group history'
);

select throws_ok(
  format(
    'insert into public.group_match_history (room_id, user_id, rank) values (%L::uuid, %L::uuid, 1)',
    (select room_id::text from phase2c_test_rooms where name = 'lifecycle'),
    '00000000-0000-0000-0002-000000000002'
  ),
  '42501',
  'permission denied for table group_match_history',
  'authenticated cannot forge group history directly'
);

select throws_ok(
  $$
    update public.user_profile_stats
    set group_first_count = 999
    where user_id = '00000000-0000-0000-0002-000000000002'::uuid
  $$,
  '42501',
  'permission denied for table user_profile_stats',
  'authenticated cannot forge profile stats directly'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000004';

insert into phase2c_test_rooms (name, room_id)
select 'host-transfer', id
from public.create_group_room(3, 3, 3);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000005';
select lives_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'host-transfer')
  ),
  'first guest joins host-transfer room'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000006';
select lives_ok(
  format(
    'select public.join_group_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'host-transfer')
  ),
  'second guest joins host-transfer room'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000004';
select lives_ok(
  format(
    'select public.leave_group_waiting_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'host-transfer')
  ),
  'waiting host can leave through the dedicated RPC'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000005';

select ok(
  exists (
    select 1
    from public.game_rooms room
    join public.room_players player
      on player.room_id = room.id
     and player.user_id = room.host_user_id
     and player.role = 'host'
    where room.id = (select room_id from phase2c_test_rooms where name = 'host-transfer')
      and room.host_user_id = (
        select remaining.user_id
        from public.room_players remaining
        where remaining.room_id = room.id
        order by remaining.created_at asc, remaining.id asc
        limit 1
      )
  ),
  'waiting host leave transfers ownership to the stable oldest remaining row'
);

select is(
  (
    select count(*)::integer
    from public.room_players
    where room_id = (select room_id from phase2c_test_rooms where name = 'host-transfer')
      and role = 'host'
  ),
  1,
  'host transfer leaves exactly one host player'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000007';

insert into phase2c_test_rooms (name, room_id)
select 'last-leave', id
from public.create_group_room(3, 3, 3);

select lives_ok(
  format(
    'select public.leave_group_waiting_room(%L::uuid)',
    (select room_id::text from phase2c_test_rooms where name = 'last-leave')
  ),
  'last waiting participant can leave through the dedicated RPC'
);

set local role postgres;

select is(
  (
    select count(*)::integer
    from public.game_rooms
    where id = (select room_id from phase2c_test_rooms where name = 'last-leave')
  ),
  0,
  'last waiting participant leave deletes the empty room'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0002-000000000001';

select throws_ok(
  $$insert into public.game_rooms (room_code, host_user_id, status, mode, max_players, min_players)
    values ('phase2c-forged', auth.uid(), 'waiting', 'duel', 2, 2)$$,
  '42501',
  'permission denied for table game_rooms',
  'authenticated cannot directly insert duel or group rooms after cutover'
);

select throws_ok(
  format(
    'insert into public.room_players (room_id, user_id, role, nickname_snapshot) values (%L::uuid, auth.uid(), %L, %L)',
    (select room_id::text from phase2c_test_rooms where name = 'capacity'),
    'guest',
    'Forged player'
  ),
  '42501',
  'permission denied for table room_players',
  'authenticated cannot directly insert room players after cutover'
);

select is(
  pg_temp.try_update_player_progress(
    (select room_id from phase2c_test_rooms where name = 'capacity'),
    '00000000-0000-0000-0002-000000000001'::uuid,
    'Forged'
  ),
  0,
  'authenticated cannot directly update room_players after cutover'
);

select is(
  pg_temp.try_delete_room(
    (select room_id from phase2c_test_rooms where name = 'capacity')
  ),
  0,
  'authenticated cannot directly delete game_rooms after cutover'
);

select throws_ok(
  format(
    'insert into public.group_match_results (room_id, user_id) values (%L::uuid, auth.uid())',
    (select room_id::text from phase2c_test_rooms where name = 'capacity')
  ),
  '42501',
  'permission denied for table group_match_results',
  'authenticated cannot directly insert group results'
);

select throws_ok(
  format(
    'insert into public.match_history (room_id, winner_user_id) values (%L::uuid, auth.uid())',
    (select room_id::text from phase2c_test_rooms where name = 'capacity')
  ),
  '42501',
  'permission denied for table match_history',
  'authenticated cannot directly insert match history'
);

set local role postgres;

select * from finish();

rollback;
