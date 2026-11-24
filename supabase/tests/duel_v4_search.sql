begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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
create function pg_temp.submit(request uuid, query text, override_hash text default null) returns jsonb language sql as $$
  select public.submit_duel_v4_search(room,window_id,request,query,coalesce(override_hash,hash)) from fixture
$$;

select pg_temp.actor(1);
with created as (select public.create_duel_v4_room(gen_random_uuid()) as room)
insert into fixture(room,code) select room,public.get_duel_v4_state(room)->>'code' from created;
select pg_temp.actor(2);
select public.join_duel_v4_room(code) from fixture;
select pg_temp.actor(1);
select pg_temp.action('target','{"snapshotId":"c4100000-0000-4000-8000-0000000000c1"}');
select pg_temp.action('start','{"snapshotId":"c4100000-0000-4000-8000-0000000000a1"}');

select ok(not has_function_privilege('anon','public.get_duel_v4_search_source(uuid,uuid)','EXECUTE'),'anonymous search source denied');
select ok(not has_function_privilege('authenticated','public.store_duel_v4_search_document(uuid,uuid,uuid,uuid,text,text[])','EXECUTE'),
  'only service can supply pinned text');
select ok(not has_table_privilege('authenticated','duel_v4.search_documents','SELECT,INSERT,UPDATE'),'private body requires authorized RPC');
select is((select review_enabled from duel_v4.catalog where item_id='search'),true,'search enters the review supply pool');
update duel_v4.grants set item_id='search',base_tier='enhanced' where user_id=auth.uid() and room_id=(select room from fixture);
update fixture set grant_id=(select id from duel_v4.grants where user_id=auth.uid() and room_id=fixture.room);
select is(pg_temp.action('item',jsonb_build_object('grantId',grant_id))->>'code','SEARCH_OPENED','opening search uses existing item authority') from fixture;
update fixture set window_id=(pg_temp.current_state()#>>'{search,id}')::uuid;
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),1,'draft preserves grant');
select is(pg_temp.current_state()#>>'{search,remaining}','3','enhanced draft exposes its validated allowance');
select is(public.get_duel_v4_search_source(room,window_id)->>'pageId','v4sa','source comes from current locked page') from fixture;
select pg_temp.actor(2);
select is(public.get_duel_v4_search_source(room,window_id)->>'ok','false','opponent cannot prepare private permit') from fixture;
select pg_temp.actor(3);
select throws_ok($$select pg_temp.submit(gen_random_uuid(), 'a', repeat('0',64))$$,
  '42501','DUEL_V4_MEMBER_REQUIRED','outsider cannot execute submit');
select pg_temp.actor(1);
select is(public.store_duel_v4_search_document(room,window_id,auth.uid(),'c4100000-0000-4000-8000-0000000000b1',
  '<p>Wrong revision</p>',array['wrong'])->>'ok','false','pinned identity required') from fixture;
update fixture set hash=public.store_duel_v4_search_document(room,window_id,auth.uid(),'c4100000-0000-4000-8000-0000000000a1',
  '<p>x.y X.Y x1y</p>',array['x.y X.Y x1y'])->>'documentHash';
select matches(hash,'^[a-f0-9]{64}$','DB hashes trusted body') from fixture;
select is(pg_temp.submit(gen_random_uuid(),'x.y',repeat('0',64))->>'code','SEARCH_SOURCE_CHANGED','hash mismatch rejected');
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),1,'stale request keeps grant');

update fixture set reply=pg_temp.submit('c4100000-0000-4000-8000-0000000000d1','x.y');
select is(reply->>'code','SEARCH_SUBMITTED','first query consumes search') from fixture;
select is(pg_temp.current_state()#>>'{search,lastResult,count}','2','literal case-insensitive matches come from pinned text nodes');
select is(jsonb_array_length(pg_temp.current_state()->'inventory'),0,'first query spends the item once');
select is(pg_temp.submit('c4100000-0000-4000-8000-0000000000d1','x.y'),reply,'identical retry returns same receipt') from fixture;
select throws_ok($$select pg_temp.submit('c4100000-0000-4000-8000-0000000000d1','different')$$,
  '22023','REQUEST_ID_REUSED','request payload conflict denied');
select is(pg_temp.submit(gen_random_uuid(),'no match')->>'ok','true','zero matches still use an allowance');
select is(pg_temp.current_state()#>>'{search,lastResult,count}','0','server reports zero matches');
select is(pg_temp.submit(gen_random_uuid(),'x.y')->>'ok','true','enhanced third query allowed');
select is(pg_temp.submit(gen_random_uuid(),'x.y')->>'code','SEARCH_USED','fourth query rejected');
update duel_v4.search_windows set started_at=clock_timestamp()-interval '16 seconds' where id=(select window_id from fixture);
insert into duel_v4.grants(room_id,user_id,slot,item_id,base_tier,granted_at)
select room,auth.uid(),1,'search','weakened',clock_timestamp() from fixture;
select pg_temp.action('item',jsonb_build_object('grantId',g.id)) from duel_v4.grants g where user_id=auth.uid() and item_id='search' and consumed_at is null;
update fixture set window_id=(pg_temp.current_state()#>>'{search,id}')::uuid;
select is(pg_temp.submit(gen_random_uuid(),'x.y')->>'ok','true','weakened search submits');
select is(pg_temp.current_state()#>>'{search,lastResult,count}',null,'weakened count hidden for two seconds');
update duel_v4.search_windows set available_at=clock_timestamp()-interval '1 second' where id=(select window_id from fixture);
select is(pg_temp.current_state()#>>'{search,lastResult,count}','2','server reveals delayed count');
select pg_temp.action('move','{"snapshotId":"c4100000-0000-4000-8000-0000000000b1","fromSnapshotId":"c4100000-0000-4000-8000-0000000000a1","expectedProgressVersion":0}');
select is(public.get_duel_v4_search_source(room,window_id)->>'ok','false','moving invalidates the source') from fixture;

select * from finish();
rollback;
