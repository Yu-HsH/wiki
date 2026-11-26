-- Focused E1-E3 contract checks. All fixtures and test-only grants roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  not has_function_privilege('anon','public.send_duel_v4_kion_v1(uuid,uuid,text)','EXECUTE') and
  not has_function_privilege('anon','public.get_duel_v4_kion_v1(uuid)','EXECUTE') and
  not has_function_privilege('anon','public.send_group_items_lobby_kion_v1(uuid,uuid,text)','EXECUTE') and
  not has_function_privilege('anon','public.get_group_items_lobby_kion_v1(uuid)','EXECUTE') and
  not has_function_privilege('anon','public.get_group_items_spectator_document_v1(uuid,uuid,jsonb,uuid)','EXECUTE'),
  'E public contracts do not grant execution to anon');
select ok(not has_table_privilege('authenticated','duel_v4.kion_requests','SELECT')
  and not has_table_privilege('authenticated','ink_product_events.lobby_kion_requests_v1','SELECT'),
  'request IDs stay private');
select ok(not has_table_privilege('authenticated','duel_v4_events.kion_v1','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','ink_product_events.lobby_kion_v1','INSERT,UPDATE,DELETE'),
  'browser roles cannot forge deliveries');
select is((select count(*)::int from pg_publication_tables where pubname='supabase_realtime'
  and (schemaname,tablename) in (('duel_v4_events','kion_v1'),('ink_product_events','lobby_kion_v1'))),2,
  'both recipient tables are registered for realtime');
select ok(not has_schema_privilege('ink_product_owner','public','CREATE') and not exists (
  select from pg_auth_members where roleid='ink_product_owner'::regrole and member='postgres'::regrole and grantor='postgres'::regrole
), 'borrowed S5 migration privileges were restored');

-- Allow fixture room creation only until this test rolls back.
update private.pr63_drain_gate set entry_open=true where singleton;

do $duel$
declare
  a uuid:=gen_random_uuid();
  b uuid:=gen_random_uuid();
  room uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid();
  first jsonb;
  readback jsonb;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  select actor,'authenticated','authenticated',actor::text||'@example.invalid','{}','{}' from unnest(array[a,b]) actor;
  insert into public.profiles(id,username,nickname,synthetic_email)
  select actor,'fixture_'||substr(actor::text,1,8),'탐험가',actor::text||'@example.invalid' from unnest(array[a,b]) actor
  on conflict(id) do nothing;
  insert into duel_v4.rooms(id,host_id,creation_request) values(room,a,gen_random_uuid());
  insert into duel_v4.members(room_id,user_id,seat) values(room,a,1),(room,b,2);

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  set local role authenticated;
  assert public.send_duel_v4_kion_v1(room,gen_random_uuid(),'hello')->>'code'='SENDER_NOT_ACTIVE','outsider send denied';
  assert public.get_duel_v4_kion_v1(room)='[]','outsider reconnect gets no events';
  reset role;

  perform set_config('request.jwt.claim.sub',a::text,true);
  set local role authenticated;
  assert public.send_duel_v4_kion_v1(room,gen_random_uuid(),'custom')->>'code'='EMOTE_INVALID','unapproved ID denied';
  first:=public.send_duel_v4_kion_v1(room,request,'hello');
  assert first->>'accepted'='true','lobby send succeeds';
  assert public.send_duel_v4_kion_v1(room,request,'hello')=first,'same request reuses original event';
  assert public.send_duel_v4_kion_v1(room,request,'go')->>'code'='EMOTE_INVALID','changed request intent denied';
  assert public.send_duel_v4_kion_v1(room,gen_random_uuid(),'go')->>'code'='EMOTE_RATE_LIMIT','other request during cooldown denied';
  assert (select count(*) from duel_v4_events.kion_v1 where room_id=room)=1,'sender sees only own projection';
  reset role;

  perform set_config('request.jwt.claim.sub',b::text,true);
  set local role authenticated;
  readback:=public.get_duel_v4_kion_v1(room);
  assert jsonb_array_length(readback)=1 and readback->0->>'id'=first->'event'->>'id','recipient reconnect gets same event ID';
  assert readback->0->>'recipient_id'=b::text and readback->0->>'sender_participant_id'=a::text,'recipient and sender scoped';
  assert public.send_duel_v4_kion_v1(room,gen_random_uuid(),'good')->>'accepted'='true','opponent can send back independently';
  reset role;
  assert (select version from duel_v4.rooms where id=room)=1,'reaction does not change game version';
  update duel_v4.rooms set started_at=clock_timestamp() where id=room;
  update duel_v4.members set last_seen_at=clock_timestamp() where room_id=room;
  update duel_v4.kion_requests set sent_at=clock_timestamp()-interval '7 seconds' where room_id=room;
  update duel_v4_events.kion_v1 set sent_at=clock_timestamp()-interval '7 seconds' where room_id=room;
  perform set_config('request.jwt.claim.sub',a::text,true);
  set local role authenticated;
  assert public.get_duel_v4_kion_v1(room)='[]','expired reaction is not returned';
  assert public.send_duel_v4_kion_v1(room,request,'hello')->'event'='null','retry after expiry is not republished';
  assert public.send_duel_v4_kion_v1(room,gen_random_uuid(),'wow')->>'accepted'='true','match send succeeds';
  reset role;
  update duel_v4.members set last_seen_at=clock_timestamp()-interval '61 seconds' where room_id=room and user_id=b;
  set local role authenticated;
  assert public.send_duel_v4_kion_v1(room,gen_random_uuid(),'wait')->>'code'='SENDER_NOT_ACTIVE','elapsed disconnect blocks input without finalizing';
  reset role;
  update duel_v4.rooms set finished_at=clock_timestamp() where id=room;
  set local role authenticated;
  assert public.send_duel_v4_kion_v1(room,gen_random_uuid(),'gg')->>'code'='SENDER_NOT_ACTIVE','results send denied';
  assert public.get_duel_v4_kion_v1(room)='[]','results backfill denied';
  assert (select count(*) from duel_v4_events.kion_v1 where room_id=room)=0,'results recipient RLS closed';
  reset role;
end $duel$;
select pass('v4 lobby and match use participant-only delivery, replay, expiry, and existing room boundaries');

do $group$
declare
  binding jsonb:=jsonb_build_object('namespace','ink-s4-product','schemaVersion','candidate-v3',
    'rulesVersion','ink-s5-test-v1','catalogVersion','ink-s5-test-v1','modePolicyVersion','wikipedia-s5-test-v1',
    'policyDigest',repeat('e',64));
  actors uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  outsider uuid:=gen_random_uuid();
  start_doc uuid:=gen_random_uuid();
  middle_doc uuid:=gen_random_uuid();
  goal_doc uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid();
  room uuid;
  room_code text;
  room_version text;
  match_session uuid;
  target_id uuid;
  third_id uuid;
  first jsonb;
  reply jsonb;
  i integer;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  select actor,'authenticated','authenticated',actor::text||'@example.invalid','{}','{}' from unnest(actors) actor;
  insert into public.profiles(id,username,nickname,synthetic_email)
  select actor,'fixture_'||substr(actor::text,1,8),'탐험가',actor::text||'@example.invalid' from unnest(actors) actor
  on conflict(id) do nothing;
  execute format('grant ink_product_owner to %I with inherit false',session_user);
  execute format('grant ink_product_owner to %I with set true',session_user);
  set local role ink_product_owner;
  insert into ink_product.wiki_snapshots(id,page_id,revision_id,canonical_title,wiki_snapshot_id)
    values(start_doc,'1011','2011','나무',gen_random_uuid()),
      (middle_doc,'1012','2012','숲길',gen_random_uuid()),(goal_doc,'1013','2013','별',gen_random_uuid());
  insert into ink_product.wiki_links(snapshot_id,page_id,canonical_title,aliases)
    values(start_doc,'1012','숲길','{}'),(start_doc,'1013','별','{}'),
      (middle_doc,'1013','별','{}'),(goal_doc,'1011','나무','{}');
  insert into ink_product.wiki_documents(snapshot_id,document_html,document_digest)
    select id,html,encode(sha256(convert_to(html,'UTF8')),'hex') from
      (values(start_doc,'<p>첫 문서</p>'),(middle_doc,'<p>새 문서</p>'),(goal_doc,'<p>목표 문서</p>')) content(id,html);
  insert into ink_product.policies values(binding,3,8,1500,start_doc,goal_doc);
  insert into ink_product.wiki_course_pages values(binding,'1011',start_doc),(binding,'1012',middle_doc),(binding,'1013',goal_doc);
  insert into ink_product.s5_phase1_policies_v1 values(binding,'s5-phase1-20261113-v1');
  insert into ink_product.s5_phase2_policies_v1 values(binding);
  insert into ink_product.s5_phase3_policies_v1 values(binding);
  insert into ink_product.entry_policy_v1 values('review',binding,true,1,'group-3-8-20m-third-120s-v1') on conflict(channel) do update set binding=excluded.binding,admission_enabled=excluded.admission_enabled;

  perform set_config('request.jwt.claim.sub',actors[1]::text,true);
  reply:=public.act_group_items_product_room_v1('create',null,gen_random_uuid(),null,binding,'{}');
  assert reply->>'ok'='true','lobby fixture created';
  room:=(reply->>'roomId')::uuid;
  select code into room_code from ink_product.rooms where id=room;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  set local role authenticated;
  assert public.send_group_items_lobby_kion_v1(room,gen_random_uuid(),'hello')->>'code'='SENDER_NOT_ACTIVE','not joined cannot send';
  assert public.get_group_items_lobby_kion_v1(room)='[]','not joined cannot recover';
  set local role ink_product_owner;

  for i in 2..3 loop
    perform set_config('request.jwt.claim.sub',actors[i]::text,true);
    reply:=public.act_group_items_product_room_v1('join',null,gen_random_uuid(),null,binding,jsonb_build_object('roomCode',room_code));
    assert reply->>'ok'='true','lobby fixture joined';
  end loop;
  perform set_config('request.jwt.claim.sub',actors[1]::text,true);
  set local role authenticated;
  first:=public.send_group_items_lobby_kion_v1(room,request,'ready');
  assert first->>'accepted'='true','waiting participant can send';
  assert public.send_group_items_lobby_kion_v1(room,request,'ready')=first,'lobby retries keep event ID';
  assert public.send_group_items_lobby_kion_v1(room,gen_random_uuid(),'hello')->>'code'='EMOTE_RATE_LIMIT','lobby cooldown enforced';
  set local role ink_product_owner;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actors[2])::text,true);
  set local role authenticated;
  reply:=public.get_group_items_lobby_kion_v1(room);
  assert jsonb_array_length(reply)=1 and reply->0->>'id'=first->'event'->>'id','recipient restores same event using bundled JWT claims';
  assert (select count(*) from ink_product_events.lobby_kion_v1 where room_id=room)=1,'only one recipient row visible';
  set local role ink_product_owner;
  perform set_config('request.jwt.claim.sub',actors[3]::text,true);
  select version::text into room_version from ink_product.rooms where id=room;
  reply:=public.act_group_items_product_room_v1('leave',room,gen_random_uuid(),room_version,binding,'{}');
  assert reply->>'ok'='true','lobby leave fixture';
  set local role authenticated;
  assert public.get_group_items_lobby_kion_v1(room)='[]','leaver backfill blocked';
  assert (select count(*) from ink_product_events.lobby_kion_v1 where room_id=room)=0,'leaver realtime row inaccessible';
  set local role ink_product_owner;
  reply:=public.act_group_items_product_room_v1('join',null,gen_random_uuid(),null,binding,jsonb_build_object('roomCode',room_code));
  assert reply->>'ok'='true','rejoin fixture';
  for i in 1..3 loop
    perform set_config('request.jwt.claim.sub',actors[i]::text,true);
    select version::text into room_version from ink_product.rooms where id=room;
    reply:=public.act_group_items_product_room_v1('ready',room,gen_random_uuid(),room_version,binding,'{}');
    assert reply->>'ok'='true','ready fixture';
  end loop;
  set local role authenticated;
  assert public.send_group_items_lobby_kion_v1(room,gen_random_uuid(),'go')->>'accepted'='true','ready participant can send back';
  set local role ink_product_owner;
  perform set_config('request.jwt.claim.sub',actors[1]::text,true);
  select version::text into room_version from ink_product.rooms where id=room;
  reply:=public.act_group_items_product_room_v1('start',room,gen_random_uuid(),room_version,binding,'{}');
  assert reply->>'ok'='true','match fixture started';
  select session_id into match_session from ink_product.rooms where id=room;
  select participant_id into target_id from ink_product.members where room_id=room and actor_id=actors[2];
  select participant_id into third_id from ink_product.members where room_id=room and actor_id=actors[3];
  set local role authenticated;
  assert public.get_group_items_lobby_kion_v1(room)='[]','lobby reactions not read during match';
  assert public.get_group_items_kion_v1(room)='[]','existing race stream has no lobby events';
  assert public.send_group_items_lobby_kion_v1(room,gen_random_uuid(),'go')->>'code'='SENDER_NOT_ACTIVE','lobby RPC rejects match phase';
  assert public.send_group_items_kion_v1(room,'go')->>'code'='EMOTE_RATE_LIMIT','cooldown continues across start';
  begin
    perform public.get_group_items_spectator_document_v1(room,match_session,binding,target_id);
    raise exception 'active viewer must not spectate';
  exception when insufficient_privilege then null; end;
  set local role ink_product_owner;

  reply:=public.act_group_items_product_v1(room,match_session,binding,gen_random_uuid(),'normal_link',
    jsonb_build_object('targetPageId','1013','expectedPageId','1011','expectedRevisionId','2011',
      'expectedSnapshotId',start_doc,'expectedProgressVersion','0'));
  assert reply->'body'->>'code'='MOVED','viewer officially finishes';
  set local role authenticated;
  reply:=public.get_group_items_spectator_document_v1(room,match_session,binding,target_id);
  assert (reply-'activeParticipantIds') = jsonb_build_object('roomId',room,'sessionId',match_session,'participantId',target_id,'pageId','1011',
    'revisionId','2011','canonicalTitle','나무','documentHtml','<p>첫 문서</p>'),'finished viewer gets bounded current document';
  assert jsonb_array_length(reply->'activeParticipantIds')=2 and reply->'activeParticipantIds' ? target_id::text
      and reply->'activeParticipantIds' ? third_id::text,'only actively racing opponents appear in selector';
  assert public.get_group_items_spectator_document_v1(room,match_session,binding,null)
    = reply-array['participantId','pageId','revisionId','canonicalTitle','documentHtml'],
    'list mode exposes eligibility but no document';
  begin
    perform public.get_group_items_spectator_document_v1(room,match_session,'{}',target_id);
    raise exception 'wrong policy binding must not resolve';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_group_items_spectator_document_v1(room,gen_random_uuid(),binding,target_id);
    raise exception 'cross-session target must not resolve';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_group_items_spectator_document_v1(room,match_session,binding,gen_random_uuid());
    raise exception 'other room target must not resolve';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.get_group_items_spectator_document_v1(room,match_session,binding,target_id);
    raise exception 'nonmember must not spectate';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',actors[2]::text,true);
  reply:=public.act_group_items_product_v1(room,match_session,binding,gen_random_uuid(),'normal_link',
    jsonb_build_object('targetPageId','1012','expectedPageId','1011','expectedRevisionId','2011',
      'expectedSnapshotId',start_doc,'expectedProgressVersion','0'));
  assert reply->'body'->>'code'='MOVED','target moves';
  perform set_config('request.jwt.claim.sub',actors[1]::text,true);
  assert public.get_group_items_spectator_document_v1(room,match_session,binding,target_id)->>'documentHtml'='<p>새 문서</p>',
    'reconnect reads latest pinned revision';
  assert public.get_group_items_spectator_document_v1(room,match_session,binding,third_id)->>'canonicalTitle'='나무',
    'spectator can switch to another active target';
  set local role ink_product_owner;
  select version::text into room_version from ink_product.rooms where id=room;
  perform set_config('request.jwt.claim.sub',actors[3]::text,true);
  set local role authenticated;
  reply:=public.act_group_items_product_room_v1('leave',room,gen_random_uuid(),room_version,binding,'{}');
  assert reply->>'ok'='true','third participant officially forfeits';
  begin
    perform public.get_group_items_spectator_document_v1(room,match_session,binding,target_id);
    raise exception 'forfeited viewer must not spectate';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',actors[2]::text,true);
  reply:=public.act_group_items_product_v1(room,match_session,binding,gen_random_uuid(),'normal_link',
    jsonb_build_object('targetPageId','1013','expectedPageId','1012','expectedRevisionId','2012',
      'expectedSnapshotId',middle_doc,'expectedProgressVersion','1'));
  assert reply->'body'->>'code'='MOVED','remaining player officially finishes';
  perform set_config('request.jwt.claim.sub',actors[1]::text,true);
  assert public.get_group_items_product_room_v1(room,binding)->>'phase'='finished','underlying match concluded';
  begin
    perform public.get_group_items_spectator_document_v1(room,match_session,binding,null);
    raise exception 'ended match must not reveal any spectator targets';
  exception when insufficient_privilege then null; end;
  reset role;
end $group$;
select pass('S5 lobby sender, recipient, ready, leave and match transition boundaries');
select pass('S5 spectator gets only current pinned documents from the same match after a real recorded finish');

select * from finish();
rollback;
