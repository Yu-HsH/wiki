begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select is((select count(*)::int from private.duel_recovery_approvals_v1),4,'exactly four fixed approvals installed');
select is((select array_agg(case_id order by case_id) from private.duel_recovery_approvals_v1),array['D01','D02','D28','D32'],'only reviewed cases installed');
select ok(not has_function_privilege('anon','public.admin_recover_legacy_duel_v1(uuid,uuid,text,text)','EXECUTE'),'anon cannot recover');
select ok(not has_function_privilege('authenticated','public.admin_recover_legacy_duel_v1(uuid,uuid,text,text)','EXECUTE'),'member cannot recover');
select ok(not has_function_privilege('service_role','public.admin_recover_legacy_duel_v1(uuid,uuid,text,text)','EXECUTE'),'service key cannot recover');
select ok(not has_table_privilege('authenticated','private.duel_recovery_approvals_v1','SELECT'),'member cannot inspect approvals');
select ok(not has_table_privilege('service_role','private.duel_recovery_approvals_v1','UPDATE'),'service cannot enroll another room');
select ok(not has_function_privilege('authenticated','private.duel_recovery_fingerprint_v1(uuid)','EXECUTE'),'member cannot inspect state hash');

-- Synthetic substitutes exist only inside this rollback. The installed four
-- production hashes above are never changed outside test transactions.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('67000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated','drain-'||i||'@local.test','{}','{}',now(),now() from generate_series(1,2)i;
insert into public.profiles(id,username,nickname,synthetic_email)
select ('67000000-0000-4000-8000-00000000000'||i)::uuid,'qa_drain_v1_'||i,'Drain QA','drain-'||i||'@local.test' from generate_series(1,2)i;
create temp table recovery_cases(case_id text,id uuid,request_id uuid,fingerprint text,response jsonb);
insert into recovery_cases select case_id,extensions.gen_random_uuid(),extensions.gen_random_uuid(),null,null from private.duel_recovery_approvals_v1;
update private.duel_release_control_v1 set entry_open=true,required_protocol='';
insert into public.game_rooms(id,room_code,host_user_id,mode,status,created_at,min_players,max_players)
select id,substr(md5(id::text),1,6),'67000000-0000-4000-8000-000000000001','duel',
case when case_id in('D01','D02') then 'starting' else 'playing' end,clock_timestamp()-interval '90 days',2,2 from recovery_cases;
insert into public.room_players(room_id,user_id,role,nickname_snapshot,player_status,created_at,updated_at,last_seen_at)
select id,'67000000-0000-4000-8000-000000000001','host','Drain QA','playing',clock_timestamp()-interval '90 days',clock_timestamp()-interval '60 days',clock_timestamp()-interval '90 days' from recovery_cases;
insert into public.room_players(room_id,user_id,role,nickname_snapshot,player_status,created_at,updated_at,last_seen_at)
select id,'67000000-0000-4000-8000-000000000002','guest','Drain QA','playing',clock_timestamp()-interval '90 days',clock_timestamp()-interval '60 days',clock_timestamp()-interval '90 days' from recovery_cases where case_id in('D01','D02');
update recovery_cases set fingerprint=private.duel_recovery_fingerprint_v1(id);
update private.duel_recovery_approvals_v1 a set room_key=encode(sha256(convert_to(c.id::text,'UTF8')),'hex'),fingerprint=c.fingerprint,observed_at=clock_timestamp() from recovery_cases c where c.case_id=a.case_id;
-- Roll fixture mutations back inside a subtransaction, then record TAP outside
-- it. Rolling back a SAVEPOINT containing TAP would also rewind its counter.
create function pg_temp.recovery_probe(p_case text,p_probe text) returns text language plpgsql as $$
declare c record; observed text;
begin
 select * into strict c from pg_temp.recovery_cases where case_id=p_case;
 begin
  if p_probe='control' then delete from private.duel_release_control_v1;
  elsif p_probe='heartbeat' then
   perform set_config('request.jwt.claim.sub','67000000-0000-4000-8000-000000000001',true);
   perform public.heartbeat_duel_v2(c.id);
  elsif p_probe='event' then
   insert into public.room_events(room_id,user_id,event_type,payload,created_at)
   values(c.id,'67000000-0000-4000-8000-000000000001','recovery_test','{}',clock_timestamp()-interval '60 days');
  elsif p_probe='roster' then delete from public.room_players where room_id=c.id and role='guest';
  elsif p_probe='settled' then insert into public.match_history(room_id,duration_seconds,result_status,result_reason) values(c.id,0,'cancelled','disconnect_cancelled');
  elsif p_probe='outcome' then update public.match_history set duration_seconds=1 where room_id=c.id;
  else raise exception 'UNKNOWN_TEST_PROBE'; end if;
  perform public.admin_recover_legacy_duel_v1(c.id,c.request_id,c.fingerprint,'local test approval');
  observed:='UNEXPECTED_SUCCESS';raise sqlstate 'ZD088';
 exception when sqlstate 'ZD088' then null;when others then observed:=sqlerrm;end;
 return observed;
end; $$;
select throws_ok($q$select public.admin_recover_legacy_duel_v1(id,request_id,fingerprint,'local test approval') from recovery_cases where case_id='D01'$q$,'P0001','RECOVERY_GATE_MUST_BE_CLOSED','open gate blocks recovery');
update private.duel_release_control_v1 set entry_open=false,search_enabled=false;
select is(pg_temp.recovery_probe('D01','control'),'RECOVERY_GATE_REQUIRED','missing control row fails closed');
select throws_ok($q$select public.admin_recover_legacy_duel_v1(extensions.gen_random_uuid(),extensions.gen_random_uuid(),repeat('a',64),'local test approval')$q$,'P0001','RECOVERY_NOT_APPROVED','unknown room rejected');
select throws_ok($q$select public.admin_recover_legacy_duel_v1(id,request_id,repeat('a',64),'local test approval') from recovery_cases where case_id='D01'$q$,'P0001','RECOVERY_APPROVAL_MISMATCH','caller cannot replace approved fingerprint');
select is(pg_temp.recovery_probe('D28','heartbeat'),'RECOVERY_RECENT_ACTIVITY','normal heartbeat protects returned participant');
select is(pg_temp.recovery_probe('D01','event'),'RECOVERY_STATE_CHANGED','even old timestamp new event changes approved fingerprint');
select is(pg_temp.recovery_probe('D01','roster'),'RECOVERY_ROSTER_CONDITION','changed roster rejected');
select is(pg_temp.recovery_probe('D02','settled'),'RECOVERY_ALREADY_SETTLED','existing result is never overwritten');
create temp table ledger_before as select (select count(*) from public.xp_ledger) xp,(select count(*) from public.user_achievement_unlocks) unlocks;
update recovery_cases set response=public.admin_recover_legacy_duel_v1(id,request_id,fingerprint,'local test approval');
select is((select count(*)::int from public.game_rooms where id in(select id from recovery_cases) and status='finished' and finished_reason='cancelled' and winner_user_id is null),4,'all four cancel without winner');
select is((select count(*)::int from public.match_history where room_id in(select id from recovery_cases) and result_status='cancelled' and winner_user_id is null and loser_user_id is null),4,'one normal cancelled result per room');
select is((select count(*) from public.xp_ledger),(select xp from ledger_before),'no XP rows');
select is((select count(*) from public.user_achievement_unlocks),(select unlocks from ledger_before),'no achievement awards');
select ok((select bool_and(response=public.admin_recover_legacy_duel_v1(id,request_id,fingerprint,'local test approval')) from recovery_cases),'same request returns exact stored response');
select ok((select bool_and(response=public.admin_recover_legacy_duel_v1(id,extensions.gen_random_uuid(),fingerprint,'second audited retry')) from recovery_cases),'new request ID returns same outcome with audit');
select is((select count(*)::int from private.duel_recovery_requests_v1 where room_id in(select id from recovery_cases)),8,'every distinct request audited');
select throws_ok($q$select public.admin_recover_legacy_duel_v1(id,request_id,fingerprint,'different approval text') from recovery_cases where case_id='D01'$q$,'P0001','RECOVERY_REQUEST_CONFLICT','request ID payload conflict rejected');
update private.duel_release_control_v1 set entry_open=true,search_enabled=true;
select ok((select bool_and(response=public.admin_recover_legacy_duel_v1(id,request_id,fingerprint,'local test approval')) from recovery_cases),'completed receipt replay remains identical after reopening');
select set_config('request.jwt.claim.sub','67000000-0000-4000-8000-000000000001',true);
select lives_ok($q$select public.leave_duel_room_v2(id,extensions.gen_random_uuid()) from recovery_cases where case_id='D01'$q$,'normal participant finished-room leave remains allowed');
select ok((select response=public.admin_recover_legacy_duel_v1(id,request_id,fingerprint,'local test approval') from recovery_cases where case_id='D01'),'normal finished request bookkeeping does not break recovery replay');
select is(pg_temp.recovery_probe('D01','outcome'),'RECOVERY_RECEIPT_DRIFT','changed settlement is never silently accepted');
select * from finish();
rollback;
