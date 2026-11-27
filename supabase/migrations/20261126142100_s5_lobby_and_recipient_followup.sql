-- Restore the migration role and schema ACL after editing the existing S5 owner objects.
create temp table _s5_followup_role on commit drop as
select inherit_option,set_option from pg_auth_members
where roleid='ink_product_owner'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
create temp table _s5_followup_schema on commit drop as
select has_schema_privilege('ink_product_owner','public','CREATE') as had_create;
grant ink_product_owner to postgres with inherit true;
grant ink_product_owner to postgres with set true;

-- Candidate pairs are locked to snapshots already in the room's immutable graph.
alter table ink_product.rooms
  add column scheduled_start_at timestamptz,
  add column selected_start_snapshot_id uuid references ink_product.wiki_snapshots(id),
  add column selected_goal_snapshot_id uuid references ink_product.wiki_snapshots(id),
  add constraint s5_selected_pair_complete check (
    (selected_start_snapshot_id is null and selected_goal_snapshot_id is null)
    or (selected_start_snapshot_id is not null and selected_goal_snapshot_id is not null
      and selected_start_snapshot_id<>selected_goal_snapshot_id));
alter table ink_product.members
  add column target_candidate_id uuid references ink_product.wiki_snapshots(id);

create function ink_product.s5_public_profile_v1(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('profileId',id,'nickname',nickname)
  from public.profiles where id=p_actor
$$;
revoke all on function ink_product.s5_public_profile_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function ink_product.s5_public_profile_v1(uuid) to ink_product_owner;
grant create on schema public to ink_product_owner;
set local role ink_product_owner;

create or replace function ink_product.course_is_goal(p_session uuid,p_page text,p_revision text)
returns boolean language sql stable strict set search_path='' as $$
  select exists (
    select from ink_product.rooms r join ink_product.policies p using(binding)
    join ink_product.wiki_snapshots s on s.id=coalesce(r.selected_goal_snapshot_id,p.goal_snapshot_id)
    where r.session_id=p_session and (s.page_id,s.revision_id)=(p_page,p_revision)
  )
$$;

-- Initialize the same engine and round-zero supply at the reserved instant.
-- The previous immediate path remains available to older clients.

CREATE OR REPLACE FUNCTION ink_product.start_match_v1(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE r ink_product.rooms; p ink_product.policies; session uuid := gen_random_uuid(); receipt uuid := gen_random_uuid(); count_players integer;
  started timestamptz; engine_binding jsonb := ink_product_engine.ink_s3_binding_v1(); init jsonb;
  worker constant uuid := 'a3500000-0000-4000-9000-000000000007';
BEGIN
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room AND phase='waiting' FOR UPDATE;
  SELECT * INTO STRICT p FROM ink_product.policies WHERE binding=r.binding;
  started := coalesce(r.scheduled_start_at, clock_timestamp());
  IF started>clock_timestamp() THEN RAISE EXCEPTION 'PRODUCT_MATCH_STARTING'; END IF;
  p.start_snapshot_id := coalesce(r.selected_start_snapshot_id, p.start_snapshot_id);
  p.goal_snapshot_id := coalesce(r.selected_goal_snapshot_id, p.goal_snapshot_id);
  IF NOT ink_product.is_next_v1(p_room) THEN
    PERFORM ink_product.start_match_v1_pre_next(p_room); RETURN;
  END IF;
  SELECT count(*) INTO count_players FROM ink_product.members WHERE room_id=r.id AND status='waiting';
  IF p.minimum_players<>3 OR p.maximum_players<>8 OR count_players NOT BETWEEN 3 AND 8
    OR (SELECT count(*) FROM ink_product.members WHERE room_id=r.id AND status='waiting' AND ready)<>count_players
    OR (SELECT count(*) FROM ink_product.wiki_course_pages WHERE binding=r.binding
      AND snapshot_id IN(p.start_snapshot_id,p.goal_snapshot_id))<>2
    THEN RAISE EXCEPTION 'S5_GROUP_START_UNAVAILABLE'; END IF;

  init := jsonb_build_object('operation','s4_product_init','variant','baseline','roomId',r.id,
    'clientBindingDigest',ink_product_engine.ink_s4_client_binding_v1()->>'policyDigest','productBindingDigest',r.binding->>'policyDigest');
  INSERT INTO ink_product_engine.ink_sessions_v1 VALUES (session,'group_items','playing',engine_binding->>'schemaVersion',
    engine_binding->>'rulesVersion',engine_binding->>'catalogVersion',engine_binding->>'modePolicyVersion',
    decode(engine_binding->>'policyDigest','hex'),started,0,1,false,receipt,sha256(convert_to(init::text,'UTF8')),init);
  INSERT INTO ink_product_engine.ink_members_v1(session_id,participant_id,user_id,owner_epoch,member_role,player_status,
    inventory_version,progress_version,recipient_event_seq,current_page_id,current_revision_id,move_count)
    SELECT session,participant_id,actor_id,owner_epoch,'player','playing',0,0,0,s.page_id,s.revision_id,0
      FROM ink_product.members CROSS JOIN ink_product.wiki_snapshots s
      WHERE room_id=r.id AND status='waiting' AND s.id=p.start_snapshot_id;
  INSERT INTO ink_product_engine.ink_s3_sessions_v1 VALUES (session,decode(engine_binding->>'policyDigest','hex'),
    's3-fixture-0-20-25','s3-fixture-forest-v1',ink_product_engine.ink_s3_pool_digest_v1(),sha256(convert_to(gen_random_uuid()::text,'UTF8')));
  UPDATE ink_product.members SET status='playing',snapshot_id=p.start_snapshot_id WHERE room_id=r.id AND status='waiting';
  UPDATE ink_product.rooms SET session_id=session,phase='playing',version=version+1 WHERE id=r.id;
  INSERT INTO ink_product.group_lifecycle_v1(room_id,started_at,deadline_at)
    VALUES(r.id,started,started+interval '20 minutes');
  IF ink_product_engine.ink_s3_tick_v1(session,started,receipt,true)<>count_players THEN RAISE EXCEPTION 'PRODUCT_ROUND_ZERO_INCOMPLETE'; END IF;
  IF NOT ink_product_engine.ink_s5_enabled_v1(session) THEN
  INSERT INTO ink_product_engine.ink_grants_v1(session_id,grant_id,owner_participant_id,owner_epoch,item_id,base_tier,slot_index,granted_at)
    SELECT session,gen_random_uuid(),participant_id,owner_epoch,
      CASE name WHEN '참가자 1' THEN 'ink' WHEN '참가자 2' THEN 'parry' ELSE 'shield' END,'normal',1,started
    FROM ink_product.members WHERE room_id=r.id AND status='playing';
  UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1 WHERE session_id=session;
  END IF;
  PERFORM ink_product_engine.ink_s3_record_v1(session,receipt,'worker',worker,receipt,'s4_product_init',init,started,
    jsonb_build_object('ok',true,'code','PRODUCT_INITIALIZED','receiptId',receipt));
END $function$;

alter function public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb)
  rename to act_group_items_product_room_before_followup;
alter function public.get_group_items_product_room_v1(uuid,jsonb) rename to get_group_items_product_room_before_followup;
alter function public.get_group_items_product_state_v1(uuid,uuid,jsonb) rename to get_group_items_product_state_before_followup;
revoke all on function public.act_group_items_product_room_before_followup(text,uuid,uuid,text,jsonb,jsonb),
  public.get_group_items_product_room_before_followup(uuid,jsonb),
  public.get_group_items_product_state_before_followup(uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;

create function public.act_group_items_product_room_v1(
  p_operation text,p_room uuid,p_request uuid,p_expected_version text,p_binding jsonb,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=ink_product.request_actor_v1();
  r ink_product.rooms;
  m ink_product.members;
  policy ink_product.policies;
  previous ink_product.room_receipts;
  command jsonb:=jsonb_build_array(p_operation,p_room,p_expected_version,p_binding,p_payload);
  reply jsonb;
  code text;
  candidate uuid;
  from_id uuid;
  goal_id uuid;
begin
  if actor is null or p_request is null then raise insufficient_privilege using message='PRODUCT_ROOM_UNAVAILABLE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wiki-s4-product-room:'||actor::text,0));
  select * into previous from ink_product.room_receipts where actor_id=actor and request_id=p_request;
  if found then
    if previous.command is distinct from command then
      raise invalid_parameter_value using message='PRODUCT_REQUEST_REUSED';
    end if;
    return previous.response;
  end if;
  if p_operation='join' then
    select * into r from ink_product.rooms
    where binding=p_binding and phase='waiting' and rooms.code=p_payload->>'roomCode' for update;
  elsif p_room is not null then
    select * into r from ink_product.rooms where id=p_room and binding=p_binding for update;
  end if;

  if r.phase='waiting' and r.scheduled_start_at is not null then
    if p_operation='join' then
      if exists(select from ink_product.members where room_id=r.id and actor_id=actor and status='waiting') then
        return public.act_group_items_product_room_before_followup(p_operation,p_room,p_request,p_expected_version,p_binding,p_payload);
      end if;
    elsif not exists(select from ink_product.members where room_id=r.id and actor_id=actor and status='waiting') then
      raise insufficient_privilege using message='PRODUCT_ROOM_UNAVAILABLE';
    end if;
    return jsonb_build_object('ok',false,'code','PRODUCT_MATCH_STARTING','protocol','s4-product-v1',
      'testOnly',false,'operation',p_operation,'roomId',p_room,'actorId',actor,'binding',p_binding,'requestId',p_request);
  end if;
  if p_operation is null or p_operation not in ('unready','candidate','start_scheduled') then
    reply := public.act_group_items_product_room_before_followup(p_operation,p_room,p_request,p_expected_version,p_binding,p_payload);
    if p_operation='leave' and r.phase='waiting' and reply->>'ok'='true' then
      update ink_product.members set target_candidate_id=null where room_id=r.id and actor_id=actor;
    end if;
    return reply;
  end if;

  select * into m from ink_product.members where room_id=r.id and actor_id=actor and status='waiting';
  select * into policy from ink_product.policies where binding=r.binding;
  if m.actor_id is null or r.binding->>'schemaVersion' is distinct from 'candidate-v3' then
    raise insufficient_privilege using message='PRODUCT_ROOM_UNAVAILABLE';
  end if;

  if r.phase<>'waiting' then
    code := 'PRODUCT_ROOM_PHASE';
  elsif r.version::text is distinct from p_expected_version then
    code := 'PRODUCT_ROOM_STALE';
  elsif p_operation='candidate' then
    if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-'snapshotId'<>'{}'::jsonb
      or not (p_payload ? 'snapshotId')
      or (p_payload->>'snapshotId' is not null and p_payload->>'snapshotId'
        !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') then
      code := 'PRODUCT_INVALID_REQUEST';
    else
      candidate := (p_payload->>'snapshotId')::uuid;
      if candidate is not null and not exists (
        select from ink_product.wiki_course_pages w join ink_product.wiki_documents d on d.snapshot_id=w.snapshot_id
        where w.binding=r.binding and w.snapshot_id=candidate
      ) then
        code := 'PRODUCT_CANDIDATE_UNAVAILABLE';
      elsif m.target_candidate_id is distinct from candidate then
        update ink_product.members set target_candidate_id=candidate,ready=false
          where room_id=r.id and actor_id=actor;
        update ink_product.rooms set version=version+1 where id=r.id;
      end if;
    end if;
  elsif p_payload is distinct from '{}'::jsonb then
    code := 'PRODUCT_INVALID_REQUEST';
  elsif p_operation='unready' then
    if m.ready then
      update ink_product.members set ready=false where room_id=r.id and actor_id=actor;
      update ink_product.rooms set version=version+1 where id=r.id;
    end if;
  elsif r.host_actor<>actor or not (
    select count(*)>=policy.minimum_players and bool_and(ready)
    from ink_product.members where room_id=r.id and status='waiting'
  ) then
    code := 'PRODUCT_START_UNAVAILABLE';
  else
    if exists(select from ink_product.members where room_id=r.id and status='waiting' and target_candidate_id is not null) then
      with recursive picks as (
        select distinct target_candidate_id as snapshot_id from ink_product.members
        where room_id=r.id and status='waiting' and target_candidate_id is not null
      ), reachable(origin_id, destination_id) as (
        select snapshot_id,snapshot_id from picks
        union
        select q.origin_id,w.snapshot_id
        from reachable q join ink_product.wiki_links l on l.snapshot_id=q.destination_id
        join ink_product.wiki_course_pages w on w.binding=r.binding and w.page_id=l.page_id
        join ink_product.wiki_snapshots s on s.id=w.snapshot_id and s.canonical_title=l.canonical_title
      )
      select q.origin_id,q.destination_id into from_id,goal_id
      from reachable q join picks p on p.snapshot_id=q.destination_id
      where q.origin_id<>q.destination_id order by random() limit 1;
      if not found then code := 'PRODUCT_CANDIDATE_PAIR_REQUIRED'; end if;
    end if;
    if code is null then
      update ink_product.rooms set scheduled_start_at=clock_timestamp()+interval '4 seconds',
        selected_start_snapshot_id=from_id,selected_goal_snapshot_id=goal_id,version=version+1 where id=r.id;
    end if;
  end if;

  reply := jsonb_build_object('ok',code is null,'code',coalesce(code,'OK'),'protocol','s4-product-v1',
    'testOnly',false,'operation',p_operation,'roomId',r.id,'actorId',actor,'binding',p_binding,'requestId',p_request);
  insert into ink_product.room_receipts values(actor,p_request,command,reply);
  return reply;
end $$;

create function public.get_group_items_product_room_v1(p_room uuid,p_binding jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  body jsonb;
  r ink_product.rooms;
  policy ink_product.policies;
  people jsonb;
  candidates jsonb;
  start_doc jsonb;
  goal_doc jsonb;
  followup_actions jsonb:='[]'::jsonb;
begin
  -- The original reader verifies room, actor and participant scope before enrichment.
  body := public.get_group_items_product_room_before_followup(p_room,p_binding);
  select * into strict r from ink_product.rooms where id=p_room;
  if r.binding->>'schemaVersion' is distinct from 'candidate-v3' then return body; end if;
  if r.phase='waiting' and r.scheduled_start_at is not null then
    select * into strict r from ink_product.rooms where id=p_room for update;
    if r.phase='waiting' and r.scheduled_start_at<=clock_timestamp() then
      begin
        perform ink_product.start_match_v1(r.id);
      exception when sqlstate '55000' then
        -- The existing production drain fence can close between reservation and start.
        if sqlerrm<>'PR63_ENTRY_PAUSED' then raise; end if;
        update ink_product.rooms set scheduled_start_at=null,selected_start_snapshot_id=null,
          selected_goal_snapshot_id=null,version=version+1 where id=r.id;
      end;
      select * into strict r from ink_product.rooms where id=p_room;
    end if;
    body := public.get_group_items_product_room_before_followup(p_room,p_binding);
  end if;

  select * into strict policy from ink_product.policies where binding=r.binding;
  select jsonb_build_object('snapshotId',id,'pageId',page_id,'revisionId',revision_id,'title',canonical_title)
    into strict start_doc from ink_product.wiki_snapshots where id=coalesce(r.selected_start_snapshot_id,policy.start_snapshot_id);
  select jsonb_build_object('snapshotId',id,'pageId',page_id,'revisionId',revision_id,'title',canonical_title)
    into strict goal_doc from ink_product.wiki_snapshots where id=coalesce(r.selected_goal_snapshot_id,policy.goal_snapshot_id);
  select coalesce(jsonb_agg((p.row || jsonb_build_object('host',m.actor_id=r.host_actor,'candidateId',m.target_candidate_id)
    || coalesce(ink_product.s5_public_profile_v1(m.actor_id),'{}'::jsonb)) order by p.ordinal),'[]'::jsonb)
  into people from jsonb_array_elements(body->'players') with ordinality p(row,ordinal)
  join ink_product.members m on m.room_id=r.id and m.participant_id=(p.row->>'participantId')::uuid;
  if r.phase='waiting' and r.scheduled_start_at is null then
    select coalesce(jsonb_agg(jsonb_build_object('snapshotId',s.id,'title',s.canonical_title)
      order by s.canonical_title,s.id),'[]'::jsonb) into candidates
    from ink_product.wiki_course_pages w join ink_product.wiki_snapshots s on s.id=w.snapshot_id
    join ink_product.wiki_documents d on d.snapshot_id=s.id where w.binding=r.binding;
    followup_actions := '["candidate","unready"]'::jsonb
      || case when body->'actions' ? 'start' then '["start_scheduled"]'::jsonb else '[]'::jsonb end;
  elsif r.phase='waiting' then
    body := body || jsonb_build_object('actions','[]'::jsonb);
  end if;
  return body || jsonb_build_object('players',people,'startDocument',start_doc,'target',goal_doc,
    'courseCandidates',candidates,'followupActions',followup_actions,
    'scheduledStartAt',r.scheduled_start_at,'serverObservedAt',clock_timestamp());
end $$;

create function public.get_group_items_product_state_v1(p_room uuid,p_session uuid,p_binding jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  response jsonb:=public.get_group_items_product_state_before_followup(p_room,p_session,p_binding);
  body jsonb:=response->'body';
  recipient uuid:=(response#>>'{scope,participantId}')::uuid;
  epoch bigint:=(response#>>'{scope,ownerEpoch}')::bigint;
  now_at timestamptz:=clock_timestamp();
  grant_id uuid;
  feedback jsonb;
begin
  if body->>'code' is distinct from 'STATE' or p_binding->>'schemaVersion' is distinct from 'candidate-v3' then
    return response;
  end if;
  if body#>>'{supply,outcome}'='granted' then
    select g.grant_id into grant_id from ink_product_engine.ink_grants_v1 g
    where g.session_id=p_session and g.owner_participant_id=recipient and g.owner_epoch=epoch
      and g.source_round=(body#>>'{supply,round}')::bigint;
    body := jsonb_set(body,'{supply,grantId}',coalesce(to_jsonb(grant_id),'null'::jsonb));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'itemId',q.item_id,'tier',q.tier,
    'outcome',q.outcome,'at',q.happened_at) order by q.happened_at,q.id),'[]'::jsonb) into feedback
  from (
    select 'thief:'||g.grant_id::text as id,'item_stolen' as kind,x.item_id,x.base_tier as tier,
      'transferred' as outcome,g.consumed_at as happened_at
    from ink_product_engine.ink_grants_v1 g join ink_product_engine.ink_s5_joker_candidates_v1 x
      on x.session_id=g.session_id and x.source_grant_id=g.grant_id and x.offer_id=g.consumed_receipt_id
    where g.session_id=p_session and g.owner_participant_id=recipient and g.owner_epoch=epoch
      and g.consumed_at>now_at-interval '30 seconds' and x.participant_id<>recipient
    union all
    select 'trap:'||t.trap_id::text,'trap_triggered','trap',t.tier,t.close_reason,t.closed_at
    from ink_product_engine.ink_s4_traps_v1 t join ink_product_engine.ink_grants_v1 g
      on g.session_id=t.session_id and g.grant_id=t.source_grant_id
    where g.session_id=p_session and g.owner_participant_id=recipient and g.owner_epoch=epoch
      and t.closed_at>now_at-interval '30 seconds' and t.close_reason in ('triggered','blocked')
    order by happened_at desc limit 24
  ) q;
  return jsonb_set(response,'{body}',body || jsonb_build_object('itemFeedback',feedback));
end $$;

revoke all on function public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb),
  public.get_group_items_product_room_v1(uuid,jsonb),public.get_group_items_product_state_v1(uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb),
  public.get_group_items_product_room_v1(uuid,jsonb),public.get_group_items_product_state_v1(uuid,uuid,jsonb)
  to authenticated;

reset role;
do $restore$
declare prior record;
begin
  if not (select had_create from pg_temp._s5_followup_schema) then
    revoke create on schema public from ink_product_owner;
  end if;
  select * into prior from pg_temp._s5_followup_role;
  if not found then
    revoke ink_product_owner from postgres granted by current_user;
  else
    execute format('grant ink_product_owner to postgres with inherit %s',prior.inherit_option);
    execute format('grant ink_product_owner to postgres with set %s',prior.set_option);
  end if;
end $restore$;

notify pgrst, 'reload schema';
