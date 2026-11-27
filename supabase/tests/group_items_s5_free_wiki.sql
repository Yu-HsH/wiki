-- Run the migration and this fixture in a transaction on an isolated database.
create temp table qa_free_players as select gen_random_uuid() actor,n from generate_series(1,3) g(n);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated',actor::text||'@example.invalid','{}','{}',now(),now() from qa_free_players;
insert into public.profiles(id,username,nickname,synthetic_email)
select actor,'s5qa_'||left(replace(actor::text,'-',''),12),'QA '||n,actor::text||'@example.invalid' from qa_free_players on conflict(id) do nothing;
insert into public.wiki_pages(page_id,canonical_title)
values('98830001','검증 세종 시대'),('98830002','검증 광합성'),('98830003','검증 자유 링크'),('98830004','검증 미연결 문서');
insert into public.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot)
select page_id,page_id||'1',canonical_title from public.wiki_pages where page_id in('98830001','98830002','98830004');
insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_title_snapshot,ordinal)
select id,'98830003','검증 자유 링크',0 from public.wiki_page_snapshots where page_id in('98830001','98830002');
grant select on qa_free_players to ink_product_owner;
grant insert on public.wiki_page_snapshots,public.wiki_snapshot_links to ink_product_owner;
create policy qa_free_fixture on public.wiki_page_snapshots for insert to ink_product_owner with check (true);
create policy qa_free_fixture on public.wiki_snapshot_links for insert to ink_product_owner with check (true);
grant ink_product_owner to postgres with set true;
set local role ink_product_owner;

do $qa$
declare
  b jsonb;
  users uuid[]:=(select array_agg(actor order by n) from qa_free_players);
  r ink_product.rooms;
  a ink_product.wiki_snapshots;
  g ink_product.wiki_snapshots;
  viewer ink_product.members;
  m ink_product_engine.ink_members_v1;
  opponent ink_product_engine.ink_members_v1;
  lost_grant uuid;
  item_payload jsonb;
  v text;
  room_id uuid;
  fixed_id uuid;
  sid uuid;
  move_snap uuid;
  doc uuid;
  req uuid:=gen_random_uuid();
  reply jsonb;
  frame jsonb;
  i int;
begin
  select binding into strict b from ink_product.entry_policy_v1 where channel='production';
  perform set_config('request.jwt.claim.sub',users[1]::text,true);
  assert public.get_group_items_entry_v1('production')->>'freeWiki'='true';
  reply:=public.act_group_items_product_room_v1('create',null,req,null,b,'{"freeWiki":true}');
  assert reply->>'ok'='true',reply::text;
  room_id:=(reply->>'roomId')::uuid;
  assert (public.act_group_items_product_room_v1('create',null,req,null,b,'{"freeWiki":true}'))=reply;
  fixed_id:=(public.act_group_items_product_room_v1('create',null,gen_random_uuid(),null,b,'{}')->>'roomId')::uuid;
  assert (select not free_wiki from ink_product.rooms where id=fixed_id);
  select * into strict r from ink_product.rooms where id=room_id;
  assert r.free_wiki;
  for i in 1..3 loop
    perform set_config('request.jwt.claim.sub',users[i]::text,true);
    if i>1 then
      reply:=public.act_group_items_product_room_v1('join',null,gen_random_uuid(),null,b,jsonb_build_object('roomCode',r.code));
      assert reply->>'ok'='true',reply::text;
    end if;
    select version::text into v from ink_product.rooms where id=r.id;
    doc:=(select id from public.wiki_page_snapshots where page_id=case when i=2 then '98830002' else '98830001' end);
    reply:=public.act_group_items_product_room_v1('candidate',r.id,gen_random_uuid(),v,b,jsonb_build_object('snapshotId',doc));
    assert reply->>'ok'='true',reply::text;
    select version::text into v from ink_product.rooms where id=r.id;
    reply:=public.act_group_items_product_room_v1('ready',r.id,gen_random_uuid(),v,b,'{}');
    assert reply->>'ok'='true',reply::text;
  end loop;
  perform set_config('request.jwt.claim.sub',users[1]::text,true);
  select version::text into v from ink_product.rooms where id=r.id;
  reply:=public.act_group_items_product_room_v1('start_scheduled',r.id,gen_random_uuid(),v,b,'{}');
  assert reply->>'ok'='true',reply::text;
  assert (select count(*) from ink_product.free_wiki_pages_v1 f where f.room_id=r.id)=2;
  update ink_product.rooms set scheduled_start_at=clock_timestamp()-interval '1 second' where id=r.id;
  reply:=public.get_group_items_product_room_v1(r.id,b);
  assert reply->>'phase'='playing',reply::text;
  sid:=(reply->>'sessionId')::uuid;
  select w.* into strict a from ink_product.rooms c join ink_product.wiki_snapshots w on w.id=c.selected_start_snapshot_id where c.id=r.id;
  select w.* into strict g from ink_product.rooms c join ink_product.wiki_snapshots w on w.id=c.selected_goal_snapshot_id where c.id=r.id;
  assert a.id<>g.id and g.page_id not in(select ink_product.course_exits(sid,a.page_id,a.revision_id));
  select * into strict m from ink_product_engine.ink_members_v1 where session_id=sid and user_id=users[1];
  assert cardinality(ink_product_engine.ink_s5_lost_link_candidates_v1(m,clock_timestamp()))=0,'cold document has no v4-style cached landing';
  select * into strict opponent from ink_product_engine.ink_members_v1 where session_id=sid and user_id=users[2];
  update ink_product_engine.ink_grants_v1 set item_id='lost_link',base_tier='normal'
    where session_id=sid and owner_participant_id=m.participant_id and consumed_at is null returning grant_id into lost_grant;
  item_payload:=jsonb_build_object('grantId',lost_grant,'expectedInventoryVersion',m.inventory_version::text,
    'targetParticipantId',opponent.participant_id);
  reply:=public.act_group_items_product_v1(r.id,sid,b,gen_random_uuid(),'lost_link',item_payload)->'body';
  assert reply->>'code'='LOST_LINK_NO_ELIGIBLE_DESTINATION',reply::text;
  assert (select consumed_at is null from ink_product_engine.ink_grants_v1 where session_id=sid and grant_id=lost_grant);
  raise notice 'PASS disconnected candidates start, legacy create remains fixed, cold lost-link has no landing';
  insert into public.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot)
    values('98830003','988300031','검증 자유 링크') returning id into move_snap;
  insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_title_snapshot,ordinal)
    values(move_snap,g.page_id,g.canonical_title,0);
  reply:=public.act_group_items_product_v1(r.id,sid,b,gen_random_uuid(),'lost_link',item_payload)->'body';
  assert reply->>'ok'='true',reply::text;
  perform pg_sleep(1.7);
  perform public.get_group_items_product_state_v1(r.id,sid,b);
  assert (select current_page_id='98830003' from ink_product_engine.ink_members_v1 where session_id=sid and user_id=users[2]);
  raise notice 'PASS cached landing uses a verified outgoing link only';
  select * into strict viewer from ink_product.members where ink_product.members.room_id=r.id and actor_id=users[1];
  frame:=jsonb_build_object('pageId',a.page_id,'revisionId',a.revision_id,'snapshotId',a.id,'progressVersion',viewer.progress_version::text);
  reply:=public.get_group_items_product_document_v1(r.id,sid,b,frame);
  assert reply#>>'{body,links,0,pageId}'='98830003',reply::text;
  frame:=jsonb_build_object('expectedPageId',a.page_id,'expectedRevisionId',a.revision_id,'expectedSnapshotId',a.id,
    'expectedProgressVersion',viewer.progress_version::text);
  doc:=(select id from public.wiki_page_snapshots where page_id='98830004');
  reply:=public.act_group_items_product_v1(r.id,sid,b,gen_random_uuid(),'normal_link',
    frame||jsonb_build_object('targetPageId','98830004','targetSnapshotId',doc))->'body';
  assert reply->>'code'='LINK_NOT_VERIFIED',reply::text;
  reply:=public.act_group_items_product_v1(r.id,sid,b,gen_random_uuid(),'normal_link',
    frame||jsonb_build_object('targetPageId','98830003','targetSnapshotId',move_snap))->'body';
  assert reply->>'code'='MOVED' and reply->>'pageId'='98830003',reply::text;
  select * into strict viewer from ink_product.members where ink_product.members.room_id=r.id and actor_id=users[1];
  assert viewer.snapshot_id=(ink_product.course_document(sid,'98830003')).id;
  assert public.prepare_s5_wiki_document_v1(r.id,users[1],move_snap,'<p>Free</p>',array['Free'],'{}');
  assert exists(select from ink_product_engine.ink_s5_search_documents_v1 s where s.snapshot_id=viewer.snapshot_id);
  assert not has_function_privilege('authenticated','public.prepare_s5_wiki_document_v1(uuid,uuid,uuid,text,text[],jsonb)','EXECUTE');
  frame:=jsonb_build_object('expectedPageId','98830003','expectedRevisionId','988300031','expectedSnapshotId',viewer.snapshot_id,
    'expectedProgressVersion',viewer.progress_version::text);
  reply:=public.act_group_items_product_v1(r.id,sid,b,gen_random_uuid(),'normal_link',
    frame||jsonb_build_object('targetPageId',g.page_id,'targetSnapshotId',ink_product.s5_wiki_public_id_v1(g.id)))->'body';
  assert reply->>'code'='MOVED',reply::text;
  assert (public.get_group_items_product_room_v1(r.id,null))->>'sessionId'=sid::text;
  raise notice 'PASS out-of-course link accepted, unrelated link denied, item index, exact goal and resume';
end
$qa$;
