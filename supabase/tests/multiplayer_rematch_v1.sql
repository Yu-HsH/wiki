-- DISPOSABLE LOCAL SUPABASE ONLY. Never execute on linked/production.
-- Exercises REAL server-side rematch creation, membership and join contracts.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
set local role postgres;
set local request.headers = '{"x-wiki-duel-protocol":"search-authority-v1"}';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',email,'{}','{}',now(),now()
from (values
 ('00000000-0000-0000-0b41-000000000001'::uuid,'rematch-host@local.test'),
 ('00000000-0000-0000-0b41-000000000002'::uuid,'rematch-guest@local.test'),
 ('00000000-0000-0000-0b41-000000000003'::uuid,'rematch-third@local.test'),
 ('00000000-0000-0000-0b41-000000000004'::uuid,'rematch-outsider@local.test')
) as v(id,email)
on conflict(id) do nothing;

insert into public.profiles(id,username,nickname,synthetic_email) values
('00000000-0000-0000-0b41-000000000001','rematch-host','Rematch Host','rematch-host@local.test'),
('00000000-0000-0000-0b41-000000000002','rematch-guest','Rematch Guest','rematch-guest@local.test'),
('00000000-0000-0000-0b41-000000000003','rematch-third','Rematch Third','rematch-third@local.test'),
('00000000-0000-0000-0b41-000000000004','rematch-outsider','Rematch Outsider','rematch-outsider@local.test')
on conflict(id) do nothing;

-- Source room rows intentionally start FINISHED. INSERT (not UPDATE) avoids
-- generating simulated results/XP via normal match-finalization triggers.
insert into public.game_rooms
(id,room_code,host_user_id,mode,status,min_players,max_players,finish_rank_limit,use_items,finished_at)
values
('00000000-0000-0000-0b42-000000000001','RMD001','00000000-0000-0000-0b41-000000000001','duel','finished',2,2,3,true,now()),
('00000000-0000-0000-0b42-000000000002','RMG002','00000000-0000-0000-0b41-000000000001','group','finished',3,3,3,false,now()),
('00000000-0000-0000-0b42-000000000003','RMW003','00000000-0000-0000-0b41-000000000001','duel','waiting',2,2,3,true,null);

insert into public.room_players(room_id,user_id,role,nickname_snapshot,is_ready)
values
('00000000-0000-0000-0b42-000000000001','00000000-0000-0000-0b41-000000000001','host','Rematch Host',false),
('00000000-0000-0000-0b42-000000000001','00000000-0000-0000-0b41-000000000002','guest','Rematch Guest',false),
('00000000-0000-0000-0b42-000000000002','00000000-0000-0000-0b41-000000000001','host','Rematch Host',false),
('00000000-0000-0000-0b42-000000000002','00000000-0000-0000-0b41-000000000002','guest','Rematch Guest',false),
('00000000-0000-0000-0b42-000000000002','00000000-0000-0000-0b41-000000000003','guest','Rematch Third',false),
('00000000-0000-0000-0b42-000000000003','00000000-0000-0000-0b41-000000000001','host','Rematch Host',false);

create temporary table rematch_baseline as
select (select count(*) from public.xp_ledger) xp,
       (select count(*) from public.match_history) duel_results,
       (select count(*) from public.group_match_results) group_results,
       (select count(*) from public.game_move_events) move_events;

select ok(not has_function_privilege('anon','public.create_rematch_room_v1(uuid)','execute')
          and has_function_privilege('authenticated','public.create_rematch_room_v1(uuid)','execute'),
          'Only authenticated users may create rematches');
select ok(not has_function_privilege('anon','public.join_rematch_room_v1(uuid)','execute')
          and has_function_privilege('authenticated','public.join_rematch_room_v1(uuid)','execute'),
          'Only authenticated users may accept rematches');
select ok(not has_table_privilege('authenticated','private.room_rematches_v1','SELECT'),
          'Private rematch mapping is not exposed to clients');

-- Guests and outsiders cannot create even though they were in previous matches.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0b41-000000000002';
select throws_ok($$ select public.create_rematch_room_v1('00000000-0000-0000-0b42-000000000001') $$,
  'P0001','REMATCH_HOST_REQUIRED','Previous guest cannot create duel rematch');
select throws_ok($$ select public.join_rematch_room_v1('00000000-0000-0000-0b42-000000000001') $$,
  'P0001','REMATCH_NOT_READY','No invite exists before host creates it');
set local request.jwt.claim.sub = '00000000-0000-0000-0b41-000000000004';
select throws_ok($$ select public.create_rematch_room_v1('00000000-0000-0000-0b42-000000000001') $$,
  'P0001','REMATCH_HOST_REQUIRED','Outsider cannot create a rematch');
select throws_ok($$ select public.get_rematch_room_v1('00000000-0000-0000-0b42-000000000001') $$,
  'P0001','REMATCH_SOURCE_NOT_PARTICIPANT','Outsider cannot discover private rematch');

set local request.jwt.claim.sub = '00000000-0000-0000-0b41-000000000001';
select throws_ok($$ select public.create_rematch_room_v1('00000000-0000-0000-0b42-000000000003') $$,
  'P0001','REMATCH_SOURCE_NOT_FINISHED','Cannot rematch an active waiting room');
select lives_ok($$ select public.create_rematch_room_v1('00000000-0000-0000-0b42-000000000001') $$,
  'Host creates the private duel successor');
select is(
  public.create_rematch_room_v1('00000000-0000-0000-0b42-000000000001'),
  public.get_rematch_room_v1('00000000-0000-0000-0b42-000000000001'),
  'Repeated duel creation returns the SAME room id');
select lives_ok($$ select public.create_rematch_room_v1('00000000-0000-0000-0b42-000000000002') $$,
  'Host creates the private group successor');

set local role postgres;
select is((select count(*)::integer from private.room_rematches_v1),2,
  'Exactly one successor per finished source, for both modes');
select is((select count(*)::integer from public.game_rooms r
  join private.room_rematches_v1 link on link.next_room_id=r.id
  where r.status='waiting' and r.is_public=false),2,
  'Both successors are private and waiting');
select is((select count(*)::integer from public.game_rooms r
  join private.room_rematches_v1 link on link.next_room_id=r.id
  where r.started_at is null and r.finished_at is null
    and r.group_start_title is null and r.group_target_title is null),2,
  'Successors have no carried-over start/goal/finish data');
select is((select count(*)::integer from public.room_players p
  join private.room_rematches_v1 link on link.next_room_id=p.room_id
  where p.user_id='00000000-0000-0000-0b41-000000000001'::uuid
    and p.role='host' and p.is_ready=false and p.move_count=0
    and p.current_title is null and p.has_finished=false),2,
  'New host is unready with zero progress');
select is((select status from public.game_rooms where room_code='RMD001'),'finished',
  'First duel room remains finished');
select is((select status from public.game_rooms where room_code='RMG002'),'finished',
  'First group room remains finished');

-- Attacker guessing either six-character successor code is stopped by the
-- room_players BEFORE INSERT trigger, even when calling legacy join RPCs.
-- The postgres fixture stores the values as session-local settings only;
-- authenticated callers still have no access to the private mapping table.
select set_config('rematch.qa_duel_code', (
  select r.room_code from public.game_rooms r
  join private.room_rematches_v1 link on link.next_room_id=r.id
  where link.source_room_id='00000000-0000-0000-0b42-000000000001'::uuid), true);
select set_config('rematch.qa_group_id', (
  select next_room_id::text from private.room_rematches_v1
  where source_room_id='00000000-0000-0000-0b42-000000000002'::uuid), true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0b41-000000000004';
select throws_ok(
  'select public.join_duel_room_v2(current_setting(''rematch.qa_duel_code''))',
  'P0001','REMATCH_MEMBERS_ONLY','Uninvited user cannot join duel by guessed code');
select throws_ok(
  'select public.join_group_room(current_setting(''rematch.qa_group_id'')::uuid)',
  'P0001','REMATCH_MEMBERS_ONLY','Uninvited user cannot join group by guessed id');
select throws_ok($$ select public.join_rematch_room_v1('00000000-0000-0000-0b42-000000000002') $$,
  'P0001','REMATCH_MEMBERS_ONLY','Outsider cannot use invitation-only group join API');

set local request.jwt.claim.sub = '00000000-0000-0000-0b41-000000000002';
select ok(public.get_rematch_room_v1('00000000-0000-0000-0b42-000000000001') is not null,
  'Former guest can discover duel invitation');
select lives_ok($$ select public.join_rematch_room_v1('00000000-0000-0000-0b42-000000000001') $$,
  'Former guest explicitly joins duel room');
select lives_ok($$ select public.join_rematch_room_v1('00000000-0000-0000-0b42-000000000001') $$,
  'Duplicate duel join is harmless');
select lives_ok($$ select public.join_rematch_room_v1('00000000-0000-0000-0b42-000000000002') $$,
  'Former guest joins group room');
set local request.jwt.claim.sub = '00000000-0000-0000-0b41-000000000003';
select lives_ok($$ select public.join_rematch_room_v1('00000000-0000-0000-0b42-000000000002') $$,
  'Third former participant joins group room');
set local role postgres;
select is((select count(*)::integer from public.room_players p
  join private.room_rematches_v1 l on l.next_room_id=p.room_id
  where l.source_room_id='00000000-0000-0000-0b42-000000000001'::uuid),2,
  'Duel successor has exactly two players after duplicate join');
select is((select count(*)::integer from public.room_players p
  join private.room_rematches_v1 l on l.next_room_id=p.room_id
  where l.source_room_id='00000000-0000-0000-0b42-000000000002'::uuid),3,
  'Group successor has exactly three invited players');
select is((select count(*)::integer from public.room_players p
  join private.room_rematches_v1 l on l.next_room_id=p.room_id
  where p.is_ready or p.move_count<>0 or p.start_title is not null
  or p.current_title is not null or p.submitted_target_title is not null),0,
  'All participants begin next round without inherited READY, targets or moves');

select is((select count(*) from public.xp_ledger),(select xp from rematch_baseline),
  'Rematch creation and invitations do not award XP');
select is((select count(*) from public.match_history),(select duel_results from rematch_baseline),
  'Rematch does not modify or create duel result history');
select is((select count(*) from public.group_match_results),(select group_results from rematch_baseline),
  'Rematch does not modify or create group result history');
select is((select count(*) from public.game_move_events),(select move_events from rematch_baseline),
  'Rematch does not generate movement events');

select * from finish();
rollback;
