begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated','e-feedback-'||seat||'@example.com','{}','{}'
from unnest(array[
  'e4500000-0000-4000-8000-000000000001'::uuid,
  'e4500000-0000-4000-8000-000000000002'::uuid,
  'e4500000-0000-4000-8000-000000000003'::uuid
]) with ordinality as ids(id,seat);
insert into public.profiles(id,username,nickname,synthetic_email)
select id,'e-feedback-'||right(id::text,1),'Feedback '||right(id::text,1),email
from auth.users where id::text like 'e4500000-0000-4000-8000-00000000000%';
insert into public.wiki_pages(page_id,canonical_title)
values ('e-feedback-start','Feedback Start'), ('e-feedback-link','Feedback Link'), ('e-feedback-goal','Feedback Goal');
insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot)
values
  ('e4500000-0000-4000-8000-000000000010','e-feedback-start','1','Feedback Start'),
  ('e4500000-0000-4000-8000-000000000020','e-feedback-link','1','Feedback Link'),
  ('e4500000-0000-4000-8000-000000000030','e-feedback-goal','1','Feedback Goal');
insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,ordinal)
values ('e4500000-0000-4000-8000-000000000010','e-feedback-link','1','Feedback Link',0);

create function pg_temp.actor(seat integer) returns text language sql as $$
  select set_config('request.jwt.claim.sub','e4500000-0000-4000-8000-00000000000'||seat,true)
$$;
create temp table feedback_room(id uuid, code text);
grant select on feedback_room to authenticated;
create function pg_temp.command(op text, input jsonb, request_id uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.act_duel_v4((select id from feedback_room),request_id,op,input)
$$;
create function pg_temp.feedback() returns jsonb language sql as $$
  select public.get_duel_v4_state((select id from feedback_room))->'itemFeedback'
$$;

-- Open the existing fence within this rollback-only isolated test.
update private.pr63_drain_gate set entry_open=true where singleton;
insert into duel_v4.admission select id,clock_timestamp()+interval '10 minutes'
from public.profiles where username in ('e-feedback-1','e-feedback-2');
select pg_temp.actor(1);
insert into feedback_room
select room,public.get_duel_v4_state(room)->>'code' from (select public.create_duel_v4_room(gen_random_uuid()) room) f;
select pg_temp.command('target','{"snapshotId":"e4500000-0000-4000-8000-000000000030"}');
select pg_temp.actor(2);
select public.join_duel_v4_room((select code from feedback_room));
select pg_temp.actor(1);
select pg_temp.command('start','{"snapshotId":"e4500000-0000-4000-8000-000000000010"}');
update duel_v4.grants set item_id=case when user_id=auth.uid() then 'thief' else 'shield' end
where room_id=(select id from feedback_room);
select is(pg_temp.feedback(),'[]'::jsonb,'initial state has no feedback');
select ok(not has_function_privilege('anon','public.get_duel_v4_state(uuid)','EXECUTE'),'anonymous state remains private');
select ok(not has_function_privilege('authenticated','duel_v4.recent_item_feedback(uuid,uuid,timestamptz)','EXECUTE'),
  'authenticated clients cannot request another actor projection');
select pg_temp.actor(3);
set local role authenticated;
select throws_ok($$ select public.get_duel_v4_state((select id from feedback_room)) $$,
  '42501','DUEL_V4_MEMBER_REQUIRED','a nonparticipant cannot fetch state or item feedback');
reset role;

-- Retry in a subtransaction only when the random draw is the opposite of
-- the case under test. The real command and its receipt are exercised.
create function pg_temp.theft(want text, request_id uuid) returns jsonb language plpgsql as $$
declare output jsonb;
begin
  for seed in 1..16 loop
    begin
      perform setseed(seed::double precision/17);
      output := pg_temp.command('item',jsonb_build_object('grantId',(
        select id from duel_v4.grants where room_id=(select id from feedback_room)
          and user_id=auth.uid() and item_id='thief' and consumed_at is null
      )),request_id);
      if output->>'code' = want then return output; end if;
      if output->>'code' not in ('THIEF_EMPTY','THIEF_STOLEN') then
        raise exception 'Unexpected theft result %', output;
      end if;
      raise exception using errcode='P0450', message='retry fixture draw';
    exception when sqlstate 'P0450' then null;
    end;
  end loop;
  raise exception 'No deterministic theft draw for %', want;
end
$$;

select pg_temp.actor(1);
select is(pg_temp.theft('THIEF_EMPTY','e4500000-0000-4000-8000-000000000101')->>'code',
  'THIEF_EMPTY','empty theft still resolves with its existing receipt');
select pg_temp.actor(2);
select is(pg_temp.feedback(),'[]'::jsonb,'empty theft never alerts its target');
select pg_temp.actor(1);
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select id,auth.uid(),1,'thief',clock_timestamp() from feedback_room;
select is(pg_temp.theft('THIEF_STOLEN','e4500000-0000-4000-8000-000000000102')->>'code',
  'THIEF_STOLEN','successful theft still resolves with its existing receipt');
select is(pg_temp.command(receipt.operation,receipt.input,receipt.request_id),receipt.result,'same theft request repeats the original receipt')
from duel_v4.receipts receipt where request_id='e4500000-0000-4000-8000-000000000102';
select is(pg_temp.feedback(),'[]'::jsonb,'attacker never receives the victim message');
select pg_temp.actor(2);
select is(jsonb_path_query_array(pg_temp.feedback(),'$[*].kind'),'["item_stolen"]'::jsonb,
  'theft victim gets one event after a repeated action');
select is((select count(*)::int from jsonb_object_keys(pg_temp.feedback()->0)),3,'event contains ID, kind and expiration only');
create temp table feedback_seen as select pg_temp.feedback() as payload;
select is(pg_temp.feedback(),(select payload from feedback_seen),'a fresh state request returns the same event ID for reconnect');
select is(jsonb_array_length(duel_v4.recent_item_feedback((select id from feedback_room),auth.uid(),clock_timestamp()+interval '31 seconds')),
  0,'theft feedback expires outside the recovery window');

select pg_temp.actor(1);
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select id,auth.uid(),2,'trap',clock_timestamp() from feedback_room;
select is(pg_temp.command('item',jsonb_build_object('grantId',g.id,'destinationPageId','e-feedback-link',
  'expectedTargetSnapshotId','e4500000-0000-4000-8000-000000000010','expectedTargetProgressVersion',0))->>'code',
  'TRAP_INSTALLED','trap installation still resolves normally')
from duel_v4.grants g where g.room_id=(select id from feedback_room) and g.item_id='trap';
select is(pg_temp.feedback(),'[]'::jsonb,'installation alone never produces a trigger message');
select pg_temp.actor(2);
select is(pg_temp.command('move','{"snapshotId":"e4500000-0000-4000-8000-000000000020","fromSnapshotId":"e4500000-0000-4000-8000-000000000010","expectedProgressVersion":0}',
  'e4500000-0000-4000-8000-000000000103')->>'code','TRAP_STOPPED','normal trap still stops the real move');
select is(jsonb_path_query_array(pg_temp.feedback(),'$[*].kind'),'["item_stolen"]'::jsonb,
  'trap target never sees the installer message');
select pg_temp.actor(1);
select is(jsonb_path_query_array(pg_temp.feedback(),'$[*].kind'),'["trap_triggered"]'::jsonb,
  'only the installer receives the neutral trigger confirmation');
create temp table trap_seen as select pg_temp.feedback() as payload;
select pg_temp.actor(2);
select is(pg_temp.command(receipt.operation,receipt.input,receipt.request_id),receipt.result,'same trap move repeats its original receipt')
from duel_v4.receipts receipt where request_id='e4500000-0000-4000-8000-000000000103';
select pg_temp.actor(1);
select is(pg_temp.feedback(),(select payload from trap_seen),'retry and reconnect leave one stable trap event');
select is(jsonb_array_length(duel_v4.recent_item_feedback((select id from feedback_room),auth.uid(),clock_timestamp()+interval '31 seconds')),
  0,'trap feedback expires outside the recovery window');
select is(public.get_duel_v4_state(public.create_duel_v4_room(gen_random_uuid()))->'itemFeedback','[]'::jsonb,
  'the same actor starts with no feedback when reading a different room');

select * from finish();
rollback;
