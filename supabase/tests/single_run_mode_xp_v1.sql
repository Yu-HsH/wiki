-- Local RPC/XP integration tests. All fixtures roll back; never run on production.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local role postgres;

-- U1..U6 have profiles. U7 is an auth user without a profile (grant_xp_v1
-- answers AUTH_REQUIRED for it).
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-06b0-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'rm-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 7) as n
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
select ('00000000-0000-0000-06b0-00000000000' || n)::uuid, 'rm-' || n, 'RM ' || n, 'rm-' || n || '@local.test'
  from generate_series(1, 6) as n
on conflict (id) do nothing;

insert into public.wiki_pages(page_id, canonical_title)
values ('rm-a', 'RM A'), ('rm-b', 'RM B'), ('rm-c', 'RM C'), ('rm-t', 'RM Target'), ('rm-d', 'RM Daily')
on conflict (page_id) do nothing;

insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-06b1-000000000001', 'rm-a', '1', 'RM A'),
  ('00000000-0000-0000-06b1-000000000002', 'rm-b', '1', 'RM B'),
  ('00000000-0000-0000-06b1-000000000003', 'rm-c', '1', 'RM C'),
  ('00000000-0000-0000-06b1-000000000004', 'rm-t', '1', 'RM Target'),
  ('00000000-0000-0000-06b1-000000000005', 'rm-d', '1', 'RM Daily')
on conflict (page_id, revision_id) do nothing;

insert into public.wiki_snapshot_links(
  snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal
)
values
  ('00000000-0000-0000-06b1-000000000001', 'rm-t', '1', 'RM Target', 'RM Target', 0),
  ('00000000-0000-0000-06b1-000000000001', 'rm-d', '1', 'RM Daily', 'RM Daily', 1),
  ('00000000-0000-0000-06b1-000000000002', 'rm-t', '1', 'RM Target', 'RM Target', 0),
  ('00000000-0000-0000-06b1-000000000002', 'rm-d', '1', 'RM Daily', 'RM Daily', 1),
  ('00000000-0000-0000-06b1-000000000003', 'rm-t', '1', 'RM Target', 'RM Target', 0),
  ('00000000-0000-0000-06b1-000000000003', 'rm-d', '1', 'RM Daily', 'RM Daily', 1)
on conflict (snapshot_id, target_page_id) do nothing;

-- Today's course (KST) is 'RM Daily'. Any local row for today is replaced
-- inside this rolled-back transaction.
delete from public.daily_challenges
 where challenge_date = (now() at time zone 'Asia/Seoul')::date;
insert into public.daily_challenges (challenge_date, target_title)
values ((now() at time zone 'Asia/Seoul')::date, 'RM Daily');


create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-06b0-00000000000' || n)::uuid $$;
create function pg_temp.play(p_mode text, p_start text, p_target text) returns jsonb language plpgsql as $$
declare r public.single_game_runs; response jsonb;
begin
  r := public.create_single_game_run(gen_random_uuid(), p_start, '1',
    (select canonical_title from public.wiki_pages where page_id=p_start), p_target, '1',
    (select canonical_title from public.wiki_pages where page_id=p_target), p_mode);
  response := public.apply_single_move_v2(r.id, gen_random_uuid(), null, 0, p_target);
  return response;
end;
$$;
create function pg_temp.record_id(response jsonb) returns uuid language sql as $$
  select id from public.game_records where run_id=(response->'run'->>'id')::uuid
$$;
create function pg_temp.gameplay(record_id uuid) returns integer language sql as $$
  select coalesce(sum(amount),0)::integer from public.xp_ledger where source_id=record_id and xp_class='gameplay'
$$;
create temp table rm_result(key text primary key, response jsonb);
select set_config('request.jwt.claim.sub',pg_temp.uid(1)::text,true);

insert into rm_result values ('random',pg_temp.play('random','rm-a','rm-t'));
insert into rm_result values ('random-repeat',pg_temp.play('random','rm-a','rm-t'));
insert into rm_result values ('custom',pg_temp.play('custom','rm-a','rm-t'));
insert into rm_result values ('custom-repeat',pg_temp.play('custom','rm-a','rm-t'));
insert into rm_result values ('daily',pg_temp.play('daily','rm-a','rm-d'));
insert into rm_result values ('daily-repeat',pg_temp.play('daily','rm-b','rm-d'));
insert into rm_result values ('custom-daily-target',pg_temp.play('custom','rm-c','rm-d'));
select is(response->'run'->>'run_mode', split_part(key,'-',1), key || ' mode is stored on run')
from rm_result where key in ('random','custom','daily');
select is((select run_mode from public.game_records where id=pg_temp.record_id(response)), key, key || ' result mode preserved')
from rm_result where key in ('random','custom','daily');
select is(pg_temp.gameplay(pg_temp.record_id(response)), expected, key || ' XP')
from rm_result join (values ('random',20),('random-repeat',20),('custom',15),('custom-repeat',0),('daily',25),('daily-repeat',0),('custom-daily-target',15)) rule(key,expected) using(key);
select is((select source_type from public.xp_ledger where source_id=pg_temp.record_id(response) and xp_class='gameplay'), 'single_random_finish', 'random source is gameplay')
from rm_result where key='random';
select is((select daily_challenge_date from public.game_records where id=pg_temp.record_id(response)), (now() at time zone 'Asia/Seoul')::date, 'daily course date preserved')
from rm_result where key='daily';

-- Re-grant and duplicate move request cannot create a second ledger row.
select public.grant_result_xp_v1('single',pg_temp.record_id(response)) from rm_result where key='random';
select public.grant_result_xp_v1('single',pg_temp.record_id(response)) from rm_result where key='random';
select is((select count(*)::integer from public.xp_ledger where source_id=pg_temp.record_id(response) and xp_class='gameplay'),1,'same result pays once') from rm_result where key='random';
select public.apply_single_move_v2(r.id,e.request_id,e.correlation_id,0,'rm-t')
from rm_result result join public.single_game_runs r on r.id=(result.response->'run'->>'id')::uuid
join public.game_move_events e on e.game_id=r.id where result.key='random';
select is((select count(*)::integer from public.game_records where run_id=(response->'run'->>'id')::uuid),1,'duplicate request keeps one result') from rm_result where key='random';
select is(pg_temp.gameplay(pg_temp.record_id(response)),20,'duplicate request keeps 20 XP') from rm_result where key='random';

-- Repeating create with a different mode cannot rewrite a finished run.
select is((public.create_single_game_run((response->'run'->>'id')::uuid,'rm-a','1','RM A','rm-t','1','RM Target','custom')).run_mode,'random','duplicate create preserves mode')
from rm_result where key='random';
select throws_ok($$select public.create_single_game_run(gen_random_uuid(),'rm-a','1','RM A','rm-t','1','RM Target','daily')$$,'P0001','DAILY_COURSE_MISMATCH','fake daily rejected');
select throws_ok($$select public.create_single_game_run(gen_random_uuid(),'rm-a','1','RM A','rm-t','1','RM Target','other')$$,'P0001','RUN_MODE_REQUIRED','invalid mode rejected');
select throws_ok($$select public.create_single_game_run(gen_random_uuid(),'rm-a','1','RM A','rm-t','1','RM Target',null)$$,'P0001','RUN_MODE_REQUIRED','explicit NULL mode rejected');

-- Old RPC has no mode; its pre-existing XP behaviour remains available.
select set_config('request.jwt.claim.sub',pg_temp.uid(2)::text,true);
create temp table rm_legacy as select public.create_single_game_run(gen_random_uuid(),'rm-a','1','RM A','rm-t','1','RM Target') as run;
select is((run).run_mode,null::text,'old seven-argument create remains legacy NULL') from rm_legacy;
insert into rm_result select 'legacy',public.apply_single_move_v2((run).id,gen_random_uuid(),null,0,'rm-t') from rm_legacy;
select is(pg_temp.gameplay(pg_temp.record_id(response)),15,'legacy custom still pays 15') from rm_result where key='legacy';

-- Guest finishes through the real hash-authenticated RPC and stores no game_records/XP.
insert into public.single_game_runs(id,guest_token_hash,start_page_id,start_revision_id,start_title_snapshot,target_page_id,target_revision_id,target_title_snapshot,current_page_id,current_revision_id,current_title_snapshot,path_page_ids,path_revision_ids,path_title_snapshots,run_mode)
values ('00000000-0000-0000-06b2-000000000001',repeat('a',64),'rm-a','1','RM A','rm-t','1','RM Target','rm-a','1','RM A',array['rm-a'],array['1'],array['RM A'],'random');
select is(public.apply_guest_single_move_v2('00000000-0000-0000-06b2-000000000001',repeat('a',64),gen_random_uuid(),null,0,'rm-t','RM Target','NORMAL_LINK')->'run'->>'status','completed','guest completes');
select is((select count(*)::integer from public.game_records where run_id='00000000-0000-0000-06b2-000000000001'),0,'guest has no persistent result');
select is((select count(*)::integer from public.xp_ledger where user_id is null),0,'guest has no XP ledger');
select ok(not has_function_privilege('anon','public.create_single_game_run(uuid,text,text,text,text,text,text,text)','EXECUTE'),'anon cannot create member run');
select ok(has_function_privilege('authenticated','public.create_single_game_run(uuid,text,text,text,text,text,text,text)','EXECUTE'),'authenticated can create member run');
select ok(not has_column_privilege('authenticated','public.single_game_runs','run_mode','UPDATE'),'client cannot change persisted mode');
select * from finish();
rollback;
