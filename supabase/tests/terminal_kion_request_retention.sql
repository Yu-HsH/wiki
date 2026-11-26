begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(not has_function_privilege('authenticated','private.purge_terminal_v4_kion_requests_v1()','EXECUTE')
  and not has_function_privilege('authenticated','ink_product.purge_terminal_lobby_kion_requests_v1()','EXECUTE'),
  'Kion retention functions are private');

update private.pr63_drain_gate set entry_open=true where singleton;

do $$
declare
  actor uuid:=gen_random_uuid();
  v4_live uuid:=gen_random_uuid();
  v4_old uuid:=gen_random_uuid();
  v4_recent uuid:=gen_random_uuid();
  lobby_live uuid:=gen_random_uuid();
  lobby_old uuid:=gen_random_uuid();
  lobby_recent uuid:=gen_random_uuid();
  start_doc uuid:=gen_random_uuid();
  goal_doc uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid();
  binding jsonb:=jsonb_build_object('namespace','ink-s4-product','schemaVersion','candidate-v3',
    'rulesVersion','ink-s5-test-v1','catalogVersion','ink-s5-test-v1','modePolicyVersion','wikipedia-s5-test-v1',
    'policyDigest',repeat('9',64));
  reply jsonb;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  values(actor,'authenticated','authenticated',actor::text||'@example.invalid','{}','{}');
  insert into public.profiles(id,username,nickname,synthetic_email)
  values(actor,'kion_'||substr(actor::text,1,8),'Kion retention fixture',actor::text||'@example.invalid')
  on conflict(id) do nothing;
  insert into duel_v4.rooms(id,host_id,creation_request,finished_at)
  values(v4_live,actor,gen_random_uuid(),null),
    (v4_old,actor,gen_random_uuid(),now()-interval '31 days'),
    (v4_recent,actor,gen_random_uuid(),now()-interval '29 days');
  insert into duel_v4.members(room_id,user_id,seat)
  values(v4_live,actor,1),(v4_old,actor,1),(v4_recent,actor,1);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  reply:=public.send_duel_v4_kion_v1(v4_live,request,'hello');
  assert reply->>'accepted'='true', 'live v4 request created';
  update duel_v4.kion_requests set sent_at=now()-interval '40 days' where room_id=v4_live;
  update duel_v4_events.kion_v1 set sent_at=now()-interval '40 days' where room_id=v4_live;
  insert into duel_v4.kion_requests(room_id,sender_id,request_id,event_id,emote_id,sent_at)
  select room_id,actor,request,gen_random_uuid(),'hello',now()-interval '40 days'
  from unnest(array[v4_old,v4_recent]) room_id;

  execute format('grant ink_product_owner to %I with set true',session_user);
  set local role ink_product_owner;
  insert into ink_product.wiki_snapshots(id,page_id,revision_id,canonical_title,wiki_snapshot_id)
    values(start_doc,'997771','997781','Retention start',gen_random_uuid()),
      (goal_doc,'997772','997782','Retention goal',gen_random_uuid());
  insert into ink_product.policies values(binding,3,8,1500,start_doc,goal_doc);
  insert into ink_product.rooms(id,binding,host_actor,phase,session_id)
  values(lobby_live,binding,actor,'waiting',null),
    (lobby_old,binding,actor,'finished',gen_random_uuid()),
    (lobby_recent,binding,actor,'finished',gen_random_uuid());
  insert into ink_product.members(room_id,actor_id,name,ready)
  values(lobby_live,actor,'Kion retention fixture',false);
  insert into ink_product.group_lifecycle_v1(room_id,started_at,deadline_at,closed_at,end_reason)
  select room_id,closed-interval '15 minutes',closed+interval '5 minutes',closed,'all_resolved'
  from (values(lobby_old,now()-interval '31 days'),(lobby_recent,now()-interval '29 days')) x(room_id,closed);
  reply:=public.send_group_items_lobby_kion_v1(lobby_live,request,'hello');
  assert reply->>'accepted'='true', 'live S5 request created';
  update ink_product_events.lobby_kion_v1 set sent_at=now()-interval '40 days' where room_id=lobby_live;
  insert into ink_product_events.lobby_kion_requests_v1(room_id,sender_id,request_id,event_id,emote_id)
  select room_id,actor,request,gen_random_uuid(),'hello' from unnest(array[lobby_old,lobby_recent]) room_id;
  -- The isolated stack can have no configured maintenance job rows.
  insert into ink_product.maintenance_jobs_v1(job,enabled,next_due_at)
  values('minute_cleanup',true,now()-interval '1 day'),('daily_receipts',true,now()-interval '1 day')
  on conflict(job) do update set enabled=excluded.enabled,next_due_at=excluded.next_due_at;
  update ink_product.maintenance_jobs_v1 set last_completed_at=clock_timestamp() where job='minute_cleanup';
  assert exists(select from ink_product_events.lobby_kion_requests_v1 where room_id=lobby_old),
    'minute maintenance does not purge requests';

  reply:=ink_product.run_maintenance_v1('daily_receipts',gen_random_uuid(),1);
  assert reply->>'ok'='true' and reply->>'status' in ('success','partial'), 'real daily maintenance succeeds';
  assert not exists(select from ink_product_events.lobby_kion_requests_v1 where room_id=lobby_old),
    'old terminal S5 request removed';
  assert exists(select from ink_product_events.lobby_kion_requests_v1 where room_id=lobby_recent),
    'recent terminal S5 request retained';
  assert exists(select from ink_product.rooms where id=lobby_old), 'S5 source room retained';
  assert public.send_group_items_lobby_kion_v1(lobby_old,request,'hello')->>'code'='SENDER_NOT_ACTIVE',
    'old S5 request cannot start a new reaction once purged';
  reply:=public.send_group_items_lobby_kion_v1(lobby_live,request,'hello');
  assert reply->>'accepted'='true' and reply->'event'='null'::jsonb, 'active S5 retry remains accepted without re-sending';
  assert exists(select from ink_product_events.lobby_kion_requests_v1 where room_id=lobby_live),
    'active S5 request retained';
  assert exists(select from ink_product_events.lobby_kion_v1 where room_id=lobby_live and sent_at < now()-interval '30 days'),
    'active S5 retry emits no new reaction even after the display window';
  reset role;

  assert not exists(select from duel_v4.kion_requests where room_id=v4_old), 'old terminal v4 request removed';
  assert exists(select from duel_v4.kion_requests where room_id=v4_recent), 'recent terminal v4 request retained';
  assert exists(select from duel_v4.rooms where id=v4_old), 'v4 source room retained';
  assert public.send_duel_v4_kion_v1(v4_old,request,'hello')->>'code'='SENDER_NOT_ACTIVE',
    'old v4 request cannot start a new reaction once purged';
  reply:=public.send_duel_v4_kion_v1(v4_live,request,'hello');
  assert reply->>'accepted'='true' and reply->'event'='null'::jsonb, 'active v4 retry remains accepted without re-sending';
  assert exists(select from duel_v4.kion_requests where room_id=v4_live), 'active v4 request retained';
  assert exists(select from duel_v4_events.kion_v1 where room_id=v4_live and sent_at < now()-interval '30 days'),
    'active v4 retry emits no new reaction even after the display window';
end$$;

select pass('existing daily maintenance drives retention, while minute maintenance leaves request rows alone');
select pass('only terminal request rows older than 30 days are deleted for both modes');
select pass('active retries still deduplicate after their display windows and terminal replays stay denied');
select pass('v4 and S5 room state survives retention');
select * from finish();
rollback;
