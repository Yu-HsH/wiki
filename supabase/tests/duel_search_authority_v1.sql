-- Isolated local only. All fixtures roll back; no remote DB command is used.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('65000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated','search-'||i||'@local.test','{}','{}',now(),now() from generate_series(1,3) i;
insert into public.profiles(id,username,nickname,synthetic_email)
select ('65000000-0000-4000-8000-00000000000'||i)::uuid,'qa_search_v1_'||i,'Search QA '||i,'search-'||i||'@local.test' from generate_series(1,3) i;
insert into public.wiki_pages(page_id,canonical_title) values('search-v1-A','Search A'),('search-v1-B','Search B');
insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values('65000000-0000-4000-8000-0000000000a1','search-v1-A','search-rev-A','Search A'),('65000000-0000-4000-8000-0000000000b1','search-v1-B','search-rev-B','Search B');
create function pg_temp.fixture() returns jsonb language plpgsql as $$
declare r uuid:=extensions.gen_random_uuid(); g uuid; result jsonb;
begin
 insert into public.game_rooms(id,room_code,host_user_id,status,mode,min_players,max_players,use_items,game_starts_at) values(r,upper(substr(replace(r::text,'-',''),1,6)),'65000000-0000-4000-8000-000000000001','playing','duel',2,2,true,clock_timestamp()-interval '1 second');
 insert into public.room_players(room_id,user_id,role,nickname_snapshot,player_status,current_title,current_page_id,current_revision_id,target_page_id,path_titles,path_page_ids,path_revision_ids)
 select r,('65000000-0000-4000-8000-00000000000'||i)::uuid,case when i=1 then 'host' else 'guest' end,'Search QA','playing','Search A','search-v1-A','search-rev-A','search-v1-B',array['Search A'],array['search-v1-A'],array['search-rev-A'] from generate_series(1,2)i;
 insert into public.duel_item_grants(room_id,user_id,slot_index,slot_role,item_id) values(r,'65000000-0000-4000-8000-000000000001',3,'search','search_once') returning id into g;
 perform set_config('request.jwt.claim.sub','65000000-0000-4000-8000-000000000001',true);
 result:=public.use_duel_item_v3(r,g,extensions.gen_random_uuid(),extensions.gen_random_uuid());
 if not coalesce((result->>'ok')::boolean,false) then raise exception 'activation failed %',result; end if;
 return jsonb_build_object('room',r,'event',result->>'item_event_id','grant',g);
end; $$;
create temp table cases(name text primary key,data jsonb);
insert into cases select n,pg_temp.fixture() from unnest(array['normal','expiry','move','finish']) n;
select is((select count(*)::int from private.duel_search_sessions_v1 where room_id in(select(data->>'room')::uuid from cases)),4,'activation captures one server session per search item');
select is((extract(epoch from(s.expires_at-e.server_timestamp))*1000)::int,15000,'existing 15-second absolute item window is preserved') from private.duel_search_sessions_v1 s join public.duel_item_events e on e.id=s.item_event_id where s.item_event_id=(select(data->>'event')::uuid from cases where name='normal');
select is(s.expires_at,e.effect_expires_at,'search success cannot extend the original server item expiry') from private.duel_search_sessions_v1 s join public.duel_item_events e on e.id=s.item_event_id where s.item_event_id=(select(data->>'event')::uuid from cases where name='normal');
select ok(not has_table_privilege('authenticated','private.duel_search_documents_v1','INSERT'),'members cannot poison authoritative documents');
select ok(not has_table_privilege('authenticated','private.duel_search_sessions_v1','UPDATE'),'members cannot reset consumed state');
select ok(not has_function_privilege('authenticated','public.commit_duel_search_v1(uuid,uuid,uuid,uuid,text,text,integer)','EXECUTE'),'members cannot claim their own successful count');
select ok(not has_function_privilege('anon','public.get_duel_search_source_v1(uuid,uuid)','EXECUTE'),'anonymous source read denied');
select public.put_duel_search_document_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001',repeat('a',64),'<p>Hello hello</p>','["Hello hello"]') from cases where name='normal';
select is(public.get_duel_search_source_v1((data->>'room')::uuid,(data->>'event')::uuid)->>'document_html','<p>Hello hello</p>','prepared body is the server-owned exact cached body') from cases where name='normal';
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000101','',repeat('a',64),0)->>'code','INVALID_SEARCH_REQUEST','empty request never consumes') from cases where name='normal';
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000102','missing',repeat('a',64),0)->>'code','SEARCH_NOT_FOUND','not found remains unconsumed') from cases where name='normal';
select is((select count(*)::int from private.duel_search_sessions_v1 where consumed_at is not null),0,'no successful consumption yet');
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000103','hello',repeat('b',64),2)->>'code','SEARCH_DOCUMENT_MISMATCH','forged body binding rejected') from cases where name='normal';
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000104','hello',repeat('a',64),2)->>'code','SEARCH_FOUND','normal success accepted') from cases where name='normal';
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000104','hello',repeat('a',64),2)->>'code','SEARCH_FOUND','identical lost-response retry remains idempotent') from cases where name='normal';
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000104','other',repeat('a',64),1)->>'code','SEARCH_REQUEST_CONFLICT','same request ID cannot authorize a new query') from cases where name='normal';
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000105','hello',repeat('a',64),2)->>'code','SEARCH_USED','new request after state tampering cannot obtain second success') from cases where name='normal';
select is((select count(*)::int from private.duel_search_sessions_v1 where consumed_at is not null),1,'exactly one session consumption');
select ok(not(metadata?'searchSuccessfulUses'),'original activation event remains append-only') from public.duel_item_events where id=(select(data->>'event')::uuid from cases where name='normal');
select is((public.get_duel_search_source_v1((data->>'room')::uuid,(data->>'event')::uuid)->>'consumed')::boolean,true,'reload read preserves consumed state') from cases where name='normal';
select set_config('request.jwt.claim.sub','65000000-0000-4000-8000-000000000002',true);
select is(public.get_duel_search_source_v1((data->>'room')::uuid,(data->>'event')::uuid)->>'code','SEARCH_NOT_OWNED','other participant cannot take actor permit') from cases where name='normal';
select set_config('request.jwt.claim.sub','65000000-0000-4000-8000-000000000001',true);
update private.duel_search_sessions_v1 set expires_at=clock_timestamp()-interval '1 second' where item_event_id=(select(data->>'event')::uuid from cases where name='expiry');
select is(public.commit_duel_search_v1((data->>'room')::uuid,(data->>'event')::uuid,'65000000-0000-4000-8000-000000000001',extensions.gen_random_uuid(),'hello',repeat('a',64),1)->>'code','SEARCH_EXPIRED','expired permit rejected before consumption') from cases where name='expiry';
update public.room_players set current_page_id='search-v1-B',current_revision_id='search-rev-B' where room_id=(select(data->>'room')::uuid from cases where name='move') and role='host';
select is(public.get_duel_search_source_v1((data->>'room')::uuid,(data->>'event')::uuid)->>'code','SEARCH_SOURCE_CHANGED','move invalidates the original revision') from cases where name='move';
update public.game_rooms set status='finished' where id=(select(data->>'room')::uuid from cases where name='finish');
select is(public.get_duel_search_source_v1((data->>'room')::uuid,(data->>'event')::uuid)->>'code','GAME_NOT_ACTIVE','match end invalidates search') from cases where name='finish';
select * from finish();
rollback;
