begin;
create extension if not exists pgtap with schema extensions;
select plan(91);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select ('c4000000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated',
  'duel-v4-tap-'||n||'@example.com','{}','{}' from generate_series(1,3) n;
insert into public.profiles(id,username,nickname,synthetic_email)
select ('c4000000-0000-4000-8000-00000000000'||n)::uuid,'duelv4tap'||n,'Duel V4 '||n,
  'duel-v4-tap-'||n||'@example.com' from generate_series(1,3) n;
insert into public.wiki_pages(page_id,canonical_title) values ('v4a','Duel V4 Start'),('v4b','Duel V4 Middle'),('v4c','Duel V4 Goal');
insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot)
values ('c4000000-0000-4000-8000-0000000000a1','v4a','a1','Duel V4 Start'),
  ('c4000000-0000-4000-8000-0000000000b1','v4b','b1','Duel V4 Middle'),
  ('c4000000-0000-4000-8000-0000000000c1','v4c','c1','Duel V4 Goal');
insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,ordinal)
values ('c4000000-0000-4000-8000-0000000000a1','v4b','b1','Duel V4 Middle',0),
  ('c4000000-0000-4000-8000-0000000000b1','v4c','c1','Duel V4 Goal',0);

create function pg_temp.actor(seat integer) returns text language sql as $$
  select set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-00000000000'||seat,true)
$$;
create temp table fixture(room uuid, code text);
create temp table replies(label text primary key,result jsonb);
create function pg_temp.action(operation text, input jsonb default '{}', request uuid default gen_random_uuid()) returns jsonb
language sql as $$ select public.act_duel_v4((select room from fixture),request,operation,input) $$;
select pg_temp.actor(1);
select is(public.get_duel_v4_entry()->>'available','false','v4 is closed by default');
select throws_ok($$ select public.create_duel_v4_room(gen_random_uuid()) $$,
  '42501','DUEL_V4_ENTRY_CLOSED','creation needs server admission');
select ok(not has_function_privilege('anon','public.get_duel_v4_state(uuid)','EXECUTE'),'anonymous state denied');
select ok(not has_schema_privilege('authenticated','duel_v4','USAGE'),'authoritative schema stays private');
select ok(not has_table_privilege('authenticated','duel_v4_events.signals','INSERT,UPDATE,DELETE'),'signals are read-only');
select ok(exists(select from pg_publication_tables where pubname='supabase_realtime' and schemaname='duel_v4_events' and tablename='signals'),'signals are published');
select is((select count(*)::int from duel_v4.catalog),17,'catalog retains all S5 IDs');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname='duel_item_grants_slot_index_check')) like '%<= 4%','v3 five slots preserved');

insert into duel_v4.admission select id,clock_timestamp()+interval '1 hour' from public.profiles where username in ('duelv4tap1','duelv4tap2');
with created as (select public.create_duel_v4_room('c4000000-0000-4000-8000-000000000010') as room)
insert into fixture select room,public.get_duel_v4_state(room)->>'code' from created;
select is(public.create_duel_v4_room('c4000000-0000-4000-8000-000000000010'),(select room from fixture),'create request is idempotent');
select is(pg_temp.action('target','{"snapshotId":"c4000000-0000-4000-8000-0000000000c1"}')->>'code','TARGET_SAVED','host target stored');
select is(pg_temp.action('start','{"snapshotId":"c4000000-0000-4000-8000-0000000000a1"}')->>'code','DUEL_V4_START_NOT_READY','two players required');

select pg_temp.actor(3);
select throws_ok($$ select public.get_duel_v4_state((select room from fixture)) $$,
  '42501','DUEL_V4_MEMBER_REQUIRED','unrelated authenticated actor denied');
select throws_ok($$ select public.join_duel_v4_room((select code from fixture)) $$,
  '42501','DUEL_V4_ENTRY_CLOSED','unadmitted actor cannot join by code');
set local role authenticated;
select is((select count(*)::int from duel_v4_events.signals),0,'outsider gets zero signal rows');
reset role;

select pg_temp.actor(2);
select is(public.join_duel_v4_room((select code from fixture)),(select room from fixture),'second player joins by code');
select is(pg_temp.action('target','{"snapshotId":"c4000000-0000-4000-8000-0000000000c1"}')->>'code',
  'DUEL_V4_HOST_ENTRY_REQUIRED','guest cannot choose target');
set local role authenticated;
select is((select count(*)::int from duel_v4_events.signals),1,'guest sees only their signal row');
reset role;

select pg_temp.actor(1);
select is(pg_temp.action('start','{"snapshotId":"c4000000-0000-4000-8000-0000000000c1"}')->>'code','START_EQUALS_TARGET','distinct start required');
select is(pg_temp.action('start','{"snapshotId":"c4000000-0000-4000-8000-0000000000a1"}')->>'code','STARTED','host starts without ready requirement');
select is((select count(*)::int from duel_v4.grants where supply_round=0),2,'initial grant one per player');
select is(jsonb_array_length(public.get_duel_v4_state((select room from fixture))->'inventory'),1,'state exposes only own grant');
select is((select count(*)::int from public.duel_item_grants where room_id in (select result_room_id from duel_v4.rooms)),0,'v4 creates no v3 grants');
select is(pg_temp.action('move','{"snapshotId":"c4000000-0000-4000-8000-0000000000c1","fromSnapshotId":"c4000000-0000-4000-8000-0000000000a1","expectedProgressVersion":0}')->>'code',
  'INVALID_WIKI_LINK','arbitrary goal move denied');

-- Advance via the public state RPC. Editing the local fixture clock avoids
-- waiting through four boundaries during the deterministic SQL suite.
update duel_v4.rooms set started_at=clock_timestamp()-interval '20 seconds';
select public.get_duel_v4_state((select room from fixture))->>'version' as observed_version;
select is((select count(*)::int from duel_v4.grants where supply_round=1),2,'20 seconds supplies each player');
select public.get_duel_v4_state((select room from fixture))->>'version' as observed_version;
select is((select count(*)::int from duel_v4.grants where supply_round=1),2,'same boundary does not duplicate grants');
update duel_v4.rooms set started_at=clock_timestamp()-interval '45 seconds';
select public.get_duel_v4_state((select room from fixture))->>'version' as observed_version;
select is((select count(*)::int from duel_v4.grants where supply_round=2),0,'45 seconds skips full bags');
select is((select supply_round from duel_v4.rooms),2::bigint,'45 seconds records the skipped boundary');

update duel_v4.grants set item_id='ink' where slot=1 and user_id='c4000000-0000-4000-8000-000000000001';
update duel_v4.grants set item_id='parry' where slot=1 and user_id='c4000000-0000-4000-8000-000000000002';
update duel_v4.grants set item_id='shield' where slot=2 and user_id='c4000000-0000-4000-8000-000000000001';
update duel_v4.grants set item_id='ink' where slot=2 and user_id='c4000000-0000-4000-8000-000000000002';

insert into replies select 'attack',pg_temp.action('item',jsonb_build_object('grantId',id),
  'c4000000-0000-4000-8000-000000000011') from duel_v4.grants where item_id='ink' and slot=1;
select is((select result->>'code' from replies where label='attack'),'ATTACK_WARNING','ink triggers a warning');
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants where item_id='ink' and slot=1)),
  'c4000000-0000-4000-8000-000000000011'),(select result from replies where label='attack'),'identical request returns same receipt');
select throws_ok($$ select pg_temp.action('forfeit','{}','c4000000-0000-4000-8000-000000000011') $$,
  '22023','REQUEST_ID_REUSED','a request ID cannot change operation');
select is((select target_id from duel_v4.attacks),'c4000000-0000-4000-8000-000000000002'::uuid,'server selects sole opponent');

select pg_temp.actor(2);
select is(jsonb_array_length(public.get_duel_v4_state((select room from fixture))->'warnings'),1,'recipient receives warning');
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants where item_id='parry'),
  'attackId',(select id from duel_v4.attacks)))->>'code','PARRY_REFLECTED','parry applies inside authoritative deadline');
select is((select user_id from duel_v4.effects where kind='ink'),'c4000000-0000-4000-8000-000000000001'::uuid,'normal parry reflects to attacker');

select pg_temp.actor(1);
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants where item_id='shield')))->>'code',
  'SHIELD_ACTIVE','guard arms on the server');
select pg_temp.actor(2);
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants where item_id='ink' and slot=2)))->>'code',
  'ATTACK_WARNING','other player attacks a protected target');
update duel_v4.attacks set due_at=clock_timestamp()-interval '1 microsecond' where resolved_at is null;
select public.get_duel_v4_state((select room from fixture))->>'version' as observed_version;
select is((select outcome from duel_v4.attacks where actor_id='c4000000-0000-4000-8000-000000000002'),
  'blocked','due attack consumes protection');
select is((select count(*)::int from duel_v4.effects where kind='shield' and ended_at is null),0,'guard blocks only once');

update duel_v4.rooms set started_at=clock_timestamp()-interval '70 seconds';
select public.get_duel_v4_state((select room from fixture))->>'version' as observed_version;
select is((select count(*)::int from duel_v4.grants where supply_round=3),2,'70 seconds replenishes each consumed slot');
update duel_v4.rooms set started_at=clock_timestamp()-interval '95 seconds';
select public.get_duel_v4_state((select room from fixture))->>'version' as observed_version;
select is((select supply_round from duel_v4.rooms),4::bigint,'95 seconds advances the next boundary');
select is((select max(n)::int from (select count(*) n from duel_v4.grants where consumed_at is null group by user_id) count_by_user),2,'max two live items');

update duel_v4.grants set item_id='enhancement' where supply_round=4 and user_id='c4000000-0000-4000-8000-000000000002';
update duel_v4.grants set item_id='weakening' where supply_round=4 and user_id='c4000000-0000-4000-8000-000000000001';
select pg_temp.actor(2);
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants where item_id='enhancement' and supply_round=4),
  'targetGrantId',(select id from duel_v4.grants where supply_round=3 and user_id=auth.uid())))->>'code','ITEM_ENHANCED',
  'enhancement binds to the selected held item');
select is(duel_v4.tier(g),'enhanced','effective tier is computed on read') from duel_v4.grants g
  where supply_round=3 and user_id=auth.uid();
select pg_temp.actor(1);
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants where item_id='weakening' and supply_round=4)))->>'code',
  'ITEM_WEAKENED','weakening affects the sole opponent');
select is(duel_v4.tier(g),'normal','opposing modifiers cancel on the same grant') from duel_v4.grants g
  where supply_round=3 and user_id='c4000000-0000-4000-8000-000000000002';

insert into public.wiki_pages(page_id,canonical_title)
select 'v4-extra-'||n, 'Duel V4 Extra '||n from generate_series(1,4) n;
insert into public.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot)
select page_id,'1',canonical_title from public.wiki_pages where page_id like 'v4-extra-%';
insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,ordinal)
select 'c4000000-0000-4000-8000-0000000000a1','v4-extra-'||n,'1','Duel V4 Extra '||n,n from generate_series(1,4) n;
select pg_temp.actor(2);
update duel_v4.grants set item_id='censor' where supply_round=3 and user_id=auth.uid();
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants
  where supply_round=3 and user_id=auth.uid() and consumed_at is null)))->>'code',
  'ATTACK_WARNING','censor uses the same defense window');
update duel_v4.attacks set due_at=clock_timestamp()-interval '1 microsecond' where resolved_at is null;
select pg_temp.actor(1);
select is(jsonb_array_length(public.get_duel_v4_state((select room from fixture))->'censoredTitles'),3,'normal censor leaves at least two exits');
select is(pg_temp.action('move',jsonb_build_object('snapshotId',s.id,'fromSnapshotId','c4000000-0000-4000-8000-0000000000a1',
  'expectedProgressVersion',0))->>'code','LINK_CENSORED','server rejects a censored navigation') from public.wiki_page_snapshots s
  where s.page_id=(select e.blocked_page_ids[1] from duel_v4.effects e where e.kind='censor');
update duel_v4.effects set ended_at=clock_timestamp() where kind='censor';
select is(jsonb_array_length(public.get_duel_v4_state((select room from fixture))->'censoredTitles'),0,'closed censor clears projected links');

select pg_temp.actor(1);
select duel_v4.apply_thunder((select room from fixture),auth.uid(),'normal',false,clock_timestamp());
select is(pg_temp.action('move','{"snapshotId":"c4000000-0000-4000-8000-0000000000b1","fromSnapshotId":"c4000000-0000-4000-8000-0000000000a1","expectedProgressVersion":0}')->>'code',
  'STUNNED','thunder stun prevents navigation');
select duel_v4.apply_thunder((select room from fixture),auth.uid(),'enhanced',true,clock_timestamp());
select ok((select expires_at-starts_at<=interval '5 seconds' from duel_v4.effects where kind='stun' and ended_at is null),
  'chain has a five second cap');
select is((select expires_at-starts_at from duel_v4.effects where kind='thunder_seal'),interval '3 seconds','self penalty has a three second seal');
update duel_v4.effects set ended_at=clock_timestamp() where kind in ('stun','thunder_seal') and ended_at is null;
select ok(not exists(select from duel_v4.effects where kind='stun' and ended_at is null),'closed stun is no longer active');

select is(pg_temp.action('move','{"snapshotId":"c4000000-0000-4000-8000-0000000000b1","fromSnapshotId":"c4000000-0000-4000-8000-0000000000a1","expectedProgressVersion":0}')->>'code',
  'MOVED','verified link moves to middle page');
select is(pg_temp.action('move','{"snapshotId":"c4000000-0000-4000-8000-0000000000c1","fromSnapshotId":"c4000000-0000-4000-8000-0000000000b1","expectedProgressVersion":1}')->>'code',
  'MOVED','verified goal link completes match');
select is(public.get_duel_v4_state((select room from fixture))->>'finishReason','normal_finish','server finishes on first goal arrival');
select is(public.get_duel_v4_state((select room from fixture))->>'xp','50','winner uses normal duel XP grant');
select is((select count(*)::int from public.match_history where room_id=(select result_room_id from duel_v4.rooms)),1,'one compatible history row');
select is((select count(*)::int from public.game_move_events where game_id=(select result_room_id from duel_v4.rooms)),2,'path is projected to duel records');
insert into replies select 'rematch',pg_temp.action('rematch');
select is((select result->>'code' from replies where label='rematch'),'REMATCH_CREATED','winner creates separate rematch');
select pg_temp.actor(2);
select is(public.get_duel_v4_state((select room from fixture))->>'xp','25','loser uses normal duel XP grant');
select is(pg_temp.action('rematch')->>'code','REMATCH_JOINED','loser can join the same rematch');
select is((select count(*)::int from duel_v4.grants where room_id=(select (result->>'roomId')::uuid from replies where label='rematch')),0,'rematch inventory starts empty');

update fixture set room=(select (result->>'roomId')::uuid from replies where label='rematch');
select pg_temp.actor(1);
select is(pg_temp.action('start','{"snapshotId":"c4000000-0000-4000-8000-0000000000a1"}')->>'code','STARTED','rematch starts with fresh inventory');
update duel_v4.grants set item_id='lost_link',weakened=true where room_id=(select room from fixture) and user_id=auth.uid();
update duel_v4.grants set item_id='shield',base_tier='enhanced' where room_id=(select room from fixture) and user_id<>auth.uid();
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants
  where room_id=(select room from fixture) and user_id=auth.uid())))->>'code','ATTACK_WARNING','lost link schedules verified forced movement');
update duel_v4.attacks set due_at=clock_timestamp()-interval '1 microsecond'
where room_id=(select room from fixture) and resolved_at is null;
select pg_temp.actor(2);
select public.get_duel_v4_state((select room from fixture))->>'version' as new_version;
select ok(snapshot_id not in ('c4000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-0000000000c1'),
  'forced move leaves the start and cannot land on the goal') from duel_v4.members where room_id=(select room from fixture) and user_id=auth.uid();
select is(move_count,0,'weakened forced movement adds no move') from duel_v4.members where room_id=(select room from fixture) and user_id=auth.uid();
select is(progress_version,1::bigint,'forced movement still invalidates the document frame')
  from duel_v4.members where room_id=(select room from fixture) and user_id=auth.uid();

select pg_temp.actor(1);
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),1,'thief',clock_timestamp() from fixture;
create function pg_temp.seed_for(want_success boolean) returns void language plpgsql as $$
begin
  for i in 1..10 loop
    perform setseed(i::double precision/10);
    if (random()<0.5)=want_success then
      perform setseed(i::double precision/10);
      return;
    end if;
  end loop;
  raise exception 'No deterministic draw for fixture';
end $$;
select pg_temp.seed_for(true);
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants
  where room_id=(select room from fixture) and user_id=auth.uid() and consumed_at is null)))->>'code','THIEF_STOLEN',
  'successful theft transfers the sole opponent grant');
select ok(stolen_from is not null,'transfer points to the original grant')
  from duel_v4.grants where room_id=(select room from fixture) and user_id=auth.uid() and consumed_at is null;
select is(duel_v4.tier(g),'enhanced','transfer preserves the effective tier') from duel_v4.grants g
  where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
select is((select count(*)::int from duel_v4.grants where room_id=(select room from fixture) and user_id<>auth.uid()
  and consumed_at is null),0,'transferred item is no longer usable by opponent');

insert into duel_v4.grants(room_id,user_id,slot,item_id,base_tier,granted_at)
select room,auth.uid(),2,'cannon','enhanced',clock_timestamp() from fixture;
select pg_temp.seed_for(true);
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants
  where room_id=(select room from fixture) and user_id=auth.uid() and item_id='cannon' and consumed_at is null)))->>'code',
  'CANNON_LANDED','approved review cannon succeeds on the winning draw');
select is((select count(distinct snapshot_id)::int from duel_v4.members where room_id=(select room from fixture)),
  1,'cannon lands at the sole opponent document');
select is((select expires_at-starts_at from duel_v4.effects where room_id=(select room from fixture)
  and kind='cannon_stun' and user_id<>auth.uid()),interval '2 seconds','enhanced cannon stuns the opponent');
select ok(finished_at is null,'cannon cannot award a win') from duel_v4.rooms where id=(select room from fixture);
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),2,'cannon',clock_timestamp() from fixture;
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants
  where room_id=(select room from fixture) and user_id=auth.uid() and item_id='cannon' and consumed_at is null)))->>'code',
  'CANNON_DESTINATION_UNAVAILABLE','same-document cannon rejected without consumption');
update duel_v4.members set snapshot_id='c4000000-0000-4000-8000-0000000000a1'
where room_id=(select room from fixture) and user_id<>auth.uid();
select pg_temp.seed_for(false);
select is(pg_temp.action('item',jsonb_build_object('grantId',(select id from duel_v4.grants
  where room_id=(select room from fixture) and user_id=auth.uid() and item_id='cannon' and consumed_at is null)))->>'code',
  'CANNON_RETURNED','failed cannon uses the retained grant and returns to start');
select is(snapshot_id,'c4000000-0000-4000-8000-0000000000a1'::uuid,'failed cannon lands at the common start')
  from duel_v4.members where room_id=(select room from fixture) and user_id=auth.uid();

update duel_v4.effects set ended_at=clock_timestamp() where room_id=(select room from fixture) and kind='cannon_stun';
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),2,'trap',clock_timestamp() from fixture;
select is(jsonb_array_length(public.get_duel_v4_state((select room from fixture))->'trapOptions'),5,
  'trap holder sees choices backed by the opponent document');
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id,'destinationPageId','v4b',
  'expectedTargetSnapshotId','c4000000-0000-4000-8000-0000000000a1','expectedTargetProgressVersion',0))->>'code',
  'TRAP_SELECTION_STALE','stale opponent frame does not consume trap')
  from duel_v4.grants g where g.room_id=(select room from fixture) and g.item_id='trap' and g.consumed_at is null;
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id,'destinationPageId','v4b',
  'expectedTargetSnapshotId','c4000000-0000-4000-8000-0000000000a1','expectedTargetProgressVersion',1))->>'code',
  'TRAP_INSTALLED','exact opponent document and link arm trap')
  from duel_v4.grants g where g.room_id=(select room from fixture) and g.item_id='trap' and g.consumed_at is null;
select pg_temp.actor(2);
select is(jsonb_array_length(public.get_duel_v4_state((select room from fixture))->'trapOptions'),0,'opponent does not see an armed trap');
select is(pg_temp.action('move','{"snapshotId":"c4000000-0000-4000-8000-0000000000b1","fromSnapshotId":"c4000000-0000-4000-8000-0000000000a1","expectedProgressVersion":1}')->>'code',
  'TRAP_STOPPED','server stops the normal trap link');
select is(snapshot_id,'c4000000-0000-4000-8000-0000000000a1'::uuid,'trap trigger does not advance the victim')
  from duel_v4.members where room_id=(select room from fixture) and user_id=auth.uid();
select is((select expires_at-starts_at from duel_v4.effects where room_id=(select room from fixture)
  and kind='trap_stun' and user_id=auth.uid()),interval '3 seconds','normal trap has the S5 stun duration');

select pg_temp.actor(1);
update duel_v4.members set last_seen_at=clock_timestamp()-interval '61 seconds'
where room_id=(select room from fixture) and user_id<>auth.uid();
insert into replies select 'timeout',public.get_duel_v4_state(room) from fixture;
select is(result->>'finishReason','forfeit','expired reconnect grace resolves on server')
  from replies where label='timeout';
select is(result->>'winnerId',auth.uid()::text,'connected actor wins the forfeited match')
  from replies where label='timeout';
select is(result->>'xp','30','forfeit winner receives 30 XP') from replies where label='timeout';
select pg_temp.actor(2);
select is(public.get_duel_v4_state((select room from fixture))->>'xp','0','forfeit loser receives no XP');
select is((select count(*)::int from public.match_history where room_id=(select result_room_id from duel_v4.rooms
  where id=(select room from fixture))),1,'repeat reads do not create a second result');

select * from finish();
rollback;
