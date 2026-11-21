begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select ('c4100000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated',
  'duel-search-v4-tap-'||n||'@example.com','{}','{}' from generate_series(1,3) n;
insert into public.profiles(id,username,nickname,synthetic_email)
select ('c4100000-0000-4000-8000-00000000000'||n)::uuid,'v4srchtap'||n,'V4 Search '||n,
  'duel-search-v4-tap-'||n||'@example.com' from generate_series(1,3) n;
insert into duel_v4.admission select id,clock_timestamp()+interval '1 hour'
  from public.profiles where username in ('v4srchtap1','v4srchtap2');
insert into public.wiki_pages(page_id,canonical_title) values ('v4sa','V4 Search Start'),('v4sb','V4 Search Link'),('v4sc','V4 Search Goal');
insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot)
values ('c4100000-0000-4000-8000-0000000000a1','v4sa','a1','V4 Search Start'),
  ('c4100000-0000-4000-8000-0000000000b1','v4sb','b1','V4 Search Link'),
  ('c4100000-0000-4000-8000-0000000000c1','v4sc','c1','V4 Search Goal');
insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,ordinal)
values ('c4100000-0000-4000-8000-0000000000a1','v4sb','b1','V4 Search Link',0);

create function pg_temp.actor(seat integer) returns text language sql as $$
  select set_config('request.jwt.claim.sub','c4100000-0000-4000-8000-00000000000'||seat,true)
$$;
create temp table fixture(room uuid,code text, window_id uuid, hash text, grant_id uuid, reply jsonb);
create function pg_temp.action(operation text, input jsonb) returns jsonb language sql as $$
  select public.act_duel_v4(room,gen_random_uuid(),operation,input) from fixture
$$;
create function pg_temp.current_state() returns jsonb language sql as $$
  select public.get_duel_v4_state(room) from fixture
$$;

select pg_temp.actor(1);
with created as (select public.create_duel_v4_room(gen_random_uuid()) as room)
insert into fixture(room,code) select room,public.get_duel_v4_state(room)->>'code' from created;
select pg_temp.actor(2);
select public.join_duel_v4_room(code) from fixture;
select pg_temp.actor(1);
select pg_temp.action('target','{"snapshotId":"c4100000-0000-4000-8000-0000000000c1"}');
select pg_temp.action('start','{"snapshotId":"c4100000-0000-4000-8000-0000000000a1"}');


create function pg_temp.seed_for(want_success boolean) returns void language plpgsql as $$
begin
  for i in 1..10 loop
    perform setseed(i::double precision/10);
    if (random()<0.5)=want_success then
      perform setseed(i::double precision/10);
      return;
    end if;
  end loop;
  raise exception 'No matching fixture seed';
end $$;

select pg_temp.actor(1);
select ok((select bool_and(review_enabled) and count(*)=17 from duel_v4.catalog),'all 17 items enter the review draw');
select ok(not has_table_privilege('authenticated','duel_v4.reward_candidates','SELECT,INSERT,UPDATE'),'queue is private');
select ok(not has_function_privilege('anon','public.resolve_duel_v4_reward(uuid,uuid,uuid,boolean,uuid,text)','EXECUTE'),
  'anonymous reward write denied');
update duel_v4.grants set item_id='roulette',base_tier='normal'
where (room_id,user_id)=((select room from fixture),auth.uid());
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),2,'shield',clock_timestamp() from fixture;
update fixture set grant_id=(select id from duel_v4.grants where room_id=fixture.room and user_id=auth.uid() and item_id='roulette');
select pg_temp.seed_for(true);
update fixture set reply=public.act_duel_v4(room,'c4100000-0000-4000-8000-000000000081','item',jsonb_build_object('grantId',grant_id));
select is(reply->>'code','ROULETTE_WON','normal success uses roulette once') from fixture;
select is(public.act_duel_v4(room,'c4100000-0000-4000-8000-000000000081','item',jsonb_build_object('grantId',grant_id)),reply,
  'duplicate roulette returns original receipt') from fixture;
select is((select count(distinct item_id)::int from duel_v4.reward_candidates where room_id=(select room from fixture)),2,'two distinct reward draws');
select is((select count(*)::int from duel_v4.reward_candidates where room_id=(select room from fixture) and tier='enhanced'),2,
  'normal success draws enhanced rewards');
select is((select count(delivered_grant)::int from duel_v4.reward_candidates where room_id=(select room from fixture)),1,
  'one free slot receives the first offer');
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),2,'reward delivery retains two-slot cap');
update fixture set window_id=(pg_temp.current_state()#>>'{reward,id}')::uuid,hash=pg_temp.current_state()#>>'{reward,inventoryToken}';
select pg_temp.actor(2);
select is(public.resolve_duel_v4_reward(room,window_id,gen_random_uuid(),false)->>'code','REWARD_UNAVAILABLE',
  'opponent cannot discard another recipient reward') from fixture;
select pg_temp.actor(1);
select throws_ok($$select public.resolve_duel_v4_reward(room,window_id,gen_random_uuid(),false,null,'unexpected') from fixture$$,
  '22023','INVALID_REWARD_INPUT','discard rejects any inventory token');
insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at)
select room,auth.uid(),'trap_stun','normal',clock_timestamp(),clock_timestamp()+interval '3 seconds' from fixture;
select is(public.resolve_duel_v4_reward(room,window_id,gen_random_uuid(),false)->>'code','ITEM_SEALED',
  'S5 stun prevents reward actions') from fixture;
update duel_v4.effects set ended_at=clock_timestamp() where (room_id,user_id)=((select room from fixture),auth.uid()) and kind='trap_stun';
select is(public.resolve_duel_v4_reward(room,window_id,gen_random_uuid(),true,null,hash)->>'code','INVENTORY_FULL',
  'full bag must explicitly replace a held grant') from fixture;
select is(public.resolve_duel_v4_reward(room,window_id,gen_random_uuid(),true,null,repeat('0',32))->>'code','STALE_INVENTORY',
  'stale inventory cannot accept a reward') from fixture;
select is(public.resolve_duel_v4_reward(room,window_id,gen_random_uuid(),true,
  (select id from duel_v4.grants where room_id=fixture.room and user_id=auth.uid() and slot=2 and consumed_at is null),hash)->>'code',
  'REWARD_CLAIMED','recipient can replace slot with head reward') from fixture;
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),2,'replacement retains cap');

update duel_v4.grants set item_id='roulette',base_tier='enhanced' where room_id=(select room from fixture)
  and user_id=auth.uid() and slot=1 and consumed_at is null;
select pg_temp.seed_for(true);
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id))->>'code','ROULETTE_BOOSTED',
  'enhanced success executes effective children in same action')
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.slot=1 and g.consumed_at is null;
select ok(count(*) between 1 and 2 and count(distinct g.item_id)=count(*) and bool_and(g.consumed_at is not null),
  'one or two distinct automatic items are consumed')
  from duel_v4.roulette_automatic_effects a join duel_v4.grants g on g.id=a.grant_id where a.room_id=(select room from fixture);
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),2,'virtual effects leave no extra slots');
select is(public.resolve_duel_v4_reward(room,(pg_temp.current_state()#>>'{reward,id}')::uuid,gen_random_uuid(),false)->>'code',
  'REWARD_DISCARDED','recipient may discard current head') from fixture;

update duel_v4.grants set item_id='roulette',base_tier='weakened' where room_id=(select room from fixture)
  and user_id=auth.uid() and slot=1 and consumed_at is null;
select pg_temp.seed_for(false);
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id))->>'code','ROULETTE_FAILED','weakened failure retains common success threshold')
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.slot=1 and g.consumed_at is null;
select is(pg_temp.current_state()->>'rouletteSupplyWeakened','true','failure schedules next real supply penalty');
select is(pg_temp.current_state()#>>'{inventory,0,tier}','weakened','failure weakens held item');
update duel_v4.rooms set started_at=clock_timestamp()-interval '20 seconds' where id=(select room from fixture);
select is(pg_temp.current_state()->>'rouletteSupplyWeakened','false','actual supply clears penalty');
select is((select base_tier from duel_v4.grants where room_id=(select room from fixture) and user_id=auth.uid() and supply_round=1),
  'weakened','first actual natural grant holds penalty');

with created as (select public.create_duel_v4_room(gen_random_uuid()) as new_room)
update fixture set room=new_room,code=public.get_duel_v4_state(new_room)->>'code' from created;
select pg_temp.actor(2);
select public.join_duel_v4_room(code) from fixture;
select pg_temp.actor(1);
select pg_temp.action('target','{"snapshotId":"c4100000-0000-4000-8000-0000000000c1"}');
select pg_temp.action('start','{"snapshotId":"c4100000-0000-4000-8000-0000000000a1"}');
update duel_v4.grants set item_id='shield',base_tier='enhanced' where room_id=(select room from fixture) and user_id=auth.uid();
update duel_v4.grants set item_id='ink' where room_id=(select room from fixture) and user_id<>auth.uid();
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id))->>'code','SHIELD_ACTIVE','enhanced guard arms')
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
select pg_temp.actor(2);
select pg_temp.action('item',jsonb_build_object('grantId',g.id))
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
update duel_v4.attacks set due_at=clock_timestamp()-interval '1 microsecond' where room_id=(select room from fixture);
select pg_temp.actor(1);
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),1,'blocked attack delivers one normal enhanced-shield reward');
select is((select tier from duel_v4.reward_candidates where room_id=(select room from fixture)),'normal','shield reward is normal');
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),1,'reread cannot duplicate shield reward');

insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_title_snapshot,ordinal)
select 'c4100000-0000-4000-8000-0000000000a1','v4s-extra-'||n,'V4 Extra '||n,n from generate_series(1,4) n;
update duel_v4.grants set item_id='link_index',base_tier='enhanced' where room_id=(select room from fixture)
  and user_id=auth.uid() and consumed_at is null;
update fixture set grant_id=(select id from duel_v4.grants where room_id=fixture.room and user_id=auth.uid() and consumed_at is null);
select is(pg_temp.action('item',jsonb_build_object('grantId',grant_id))->>'code','LINK_SECTIONS_UNAVAILABLE','enhanced index requires trusted sections') from fixture;
select is(public.store_duel_v4_prepared_document(room,grant_id,auth.uid(),'c4100000-0000-4000-8000-0000000000a1',
  '<h2>Links</h2><p>Link</p>',array['Links','Link'],'{"V4 Search Link":"Links"}')->>'sectionsReady','true','authorized cache stores sections') from fixture;
select is(pg_temp.action('item',jsonb_build_object('grantId',grant_id))->>'code','LINK_INDEX_OPEN','enhanced index opens on prepared snapshot') from fixture;
select is(jsonb_array_length(pg_temp.current_state()#>'{linkIndex,entries}'),5,'enhanced index lists all links');
select is(entry->>'section','Links','enhanced index includes prepared source section')
  from jsonb_array_elements(pg_temp.current_state()#>'{linkIndex,entries}') entry where entry->>'pageId'='v4sb';
update duel_v4.effects set ended_at=clock_timestamp() where kind='link_index' and room_id=(select room from fixture);
insert into duel_v4.grants(room_id,user_id,slot,item_id,base_tier,granted_at)
select room,auth.uid(),1,'link_index','weakened',clock_timestamp() from fixture;
select pg_temp.action('item',jsonb_build_object('grantId',g.id))
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
select is(jsonb_array_length(pg_temp.current_state()#>'{linkIndex,entries}'),3,'weakened index hides half with two minimum visible');
update fixture set reply=pg_temp.current_state()#>'{linkIndex,entries}';
select is(pg_temp.current_state()#>'{linkIndex,entries}',reply,'mask is persistent across state reloads') from fixture;
select is((pg_temp.current_state()#>'{linkIndex,entries}') -> 0 ->> 'section',null,'weakened index has no section labels');
select pg_temp.action('move','{"snapshotId":"c4100000-0000-4000-8000-0000000000b1","fromSnapshotId":"c4100000-0000-4000-8000-0000000000a1","expectedProgressVersion":0}');
select is(pg_temp.current_state()->>'linkIndex',null,'moving dismisses index');

insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),1,'undo',clock_timestamp() from fixture;
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id))->>'code','UNDONE','undo follows the previous verified move')
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
select is(pg_temp.current_state()#>>'{players,0,page,pageId}','v4sa','undo restores the previous document');
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),1,'bookmark',clock_timestamp() from fixture;
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id))->>'code','BOOKMARK_SAVED','bookmark captures current frame')
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
select is(pg_temp.current_state()#>>'{bookmark,uses}','5','normal bookmark starts with five moves');
select is(pg_temp.action('move','{"snapshotId":"c4100000-0000-4000-8000-0000000000b1","fromSnapshotId":"c4100000-0000-4000-8000-0000000000a1","expectedProgressVersion":2}')->>'code',
  'MOVED','player leaves the bookmarked frame');
select is(pg_temp.current_state()#>>'{bookmark,uses}','4','verified move reduces bookmark uses');
select is(pg_temp.action('bookmark','{}')->>'code','BOOKMARK_RETURNED','bookmark return is decided on server');
select is(pg_temp.current_state()#>>'{players,0,page,pageId}','v4sa','bookmark restores the saved frame');

select pg_temp.actor(2);
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),1,'ink',clock_timestamp() from fixture;
select pg_temp.action('item',jsonb_build_object('grantId',g.id))
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
update duel_v4.attacks set due_at=clock_timestamp()-interval '1 microsecond' where room_id=(select room from fixture) and resolved_at is null;
select pg_temp.actor(1);
select ok(exists(select from jsonb_array_elements(pg_temp.current_state()->'effects') e where e->>'kind'='ink'),
  'landed ink is visible before correction');
insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),1,'correction',clock_timestamp() from fixture;
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id))->>'code','EFFECT_CLEARED','correction removes the active effect')
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
select ok(not exists(select from jsonb_array_elements(pg_temp.current_state()->'effects') e where e->>'kind'='ink'),
  'ink no longer affects the corrected player');
select is((select expires_at-starts_at from duel_v4.effects where room_id=(select room from fixture)
  and user_id=auth.uid() and kind='shield' and ended_at is null),interval '1 second','correction grants a short protection');

insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
select room,auth.uid(),1,'thunder',clock_timestamp() from fixture;
select pg_temp.seed_for(true);
select is(pg_temp.action('item',jsonb_build_object('grantId',g.id))->>'code','ATTACK_WARNING','thunder success queues the opponent')
from duel_v4.grants g where g.room_id=(select room from fixture) and g.user_id=auth.uid() and g.consumed_at is null;
select is((select target_id from duel_v4.attacks where room_id=(select room from fixture) and item_id='thunder'),
  'c4100000-0000-4000-8000-000000000002'::uuid,'thunder warning targets opponent');
update duel_v4.attacks set due_at=clock_timestamp()-interval '1 microsecond' where room_id=(select room from fixture) and resolved_at is null;
select pg_temp.actor(2);
select ok(exists(select from jsonb_array_elements(pg_temp.current_state()->'effects') e where e->>'kind'='stun'),
  'thunder resolves to opponent stun');
select is(pg_temp.action('move','{"snapshotId":"c4100000-0000-4000-8000-0000000000b1","fromSnapshotId":"c4100000-0000-4000-8000-0000000000a1","expectedProgressVersion":0}')->>'code',
  'STUNNED','thunder really blocks normal movement');

select * from finish();
rollback;
