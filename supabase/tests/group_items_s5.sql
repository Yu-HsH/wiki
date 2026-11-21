-- Run against a clean local database after applying the migrations.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);

DO $smoke$
DECLARE
  binding jsonb := jsonb_build_object(
    'namespace', 'ink-s4-product', 'schemaVersion', 'candidate-v3',
    'rulesVersion', 'ink-s5-test-v1', 'catalogVersion', 'ink-s5-test-v1',
    'modePolicyVersion', 'wikipedia-s5-test-v1', 'policyDigest', repeat('a', 64));
  actors uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  outsider uuid := gen_random_uuid();
  start_doc uuid := gen_random_uuid();
  goal_doc uuid := gen_random_uuid();
  request uuid := gen_random_uuid();
  room uuid;
  session uuid;
  started timestamptz;
  room_code text;
  room_version text;
  result jsonb;
  replay jsonb;
  payload jsonb;
  picked ink_product_engine.ink_grants_v1;
  member ink_product_engine.ink_members_v1;
  clock_before timestamptz;
  clock_future timestamptz;
  idx integer;
BEGIN
  ASSERT NOT EXISTS (SELECT FROM ink_product.entry_policy_v1), 'no entry policy seeded';
  ASSERT NOT (SELECT new_rooms_enabled FROM ink_product_engine.s5_transition_control_v1), 'v2 gate defaults off';
  ASSERT NOT has_schema_privilege('authenticated', 'ink_product_engine', 'USAGE'), 'engine is private';
  ASSERT NOT has_table_privilege('authenticated', 'ink_product.rooms', 'SELECT,INSERT,UPDATE,DELETE'),
    'room rows must go through the RPC';
  ASSERT NOT has_function_privilege('anon', 'public.get_group_items_product_room_v1(uuid,jsonb)', 'EXECUTE'),
    'anon may not call room RPC';
  ASSERT NOT has_function_privilege('anon', 'public.get_group_items_entry_v1(text)', 'EXECUTE'),
    'S5 entry RPC must not be available to anonymous callers';
  ASSERT has_function_privilege('authenticated', 'public.get_group_items_entry_v1(text)', 'EXECUTE'),
    'signed-in players can execute the entry RPC';
  ASSERT NOT has_function_privilege('authenticated', 'ink_product.request_actor_v1()', 'EXECUTE'),
    'JWT claim helper must remain private to the S5 owner';
  ASSERT NOT has_schema_privilege('ink_product_owner', 'auth', 'USAGE'),
    'S5 does not borrow managed Auth schema privileges';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_class c,
      LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles grantee ON grantee.oid=acl.grantee
    WHERE c.oid='public.profiles'::regclass AND grantee.rolname='ink_product_owner'
      AND acl.privilege_type='REFERENCES'
  ), 'temporary profiles REFERENCES grant must be removed after S5 DDL';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles owner_role ON owner_role.oid=m.roleid
      JOIN pg_roles member_role ON member_role.oid=m.member
    WHERE owner_role.rolname='ink_product_owner' AND member_role.rolname=current_user
      AND m.grantor=(SELECT oid FROM pg_roles WHERE rolname=current_user)
  ), 'temporary owner membership must leave no self-granted row';
  ASSERT NOT has_function_privilege('authenticated', 'ink_product.run_due_batch_v1(uuid,integer)', 'EXECUTE'),
    'player cannot act as worker';

  INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    SELECT actor,'authenticated','authenticated',actor::text||'@example.invalid','{}','{}',now(),now()
    FROM unnest(actors) AS a(actor);
  INSERT INTO public.profiles (id,username,nickname,synthetic_email)
    SELECT actor,'s5_'||substr(replace(actor::text,'-',''),1,12),'S5 player '||position,actor::text||'@example.invalid'
    FROM unnest(actors) WITH ORDINALITY AS a(actor,position) ON CONFLICT (id) DO NOTHING;

  -- The deployed migrator cannot write S5-owned tables. Borrow only SET
  -- inside this rolled-back fixture, after checking the deployed ACL above.
  EXECUTE format('GRANT ink_product_owner TO %I WITH INHERIT FALSE', session_user);
  EXECUTE format('GRANT ink_product_owner TO %I WITH SET TRUE', session_user);
  SET LOCAL ROLE ink_product_owner;

  INSERT INTO ink_product.wiki_snapshots (id,page_id,revision_id,canonical_title,wiki_snapshot_id)
    VALUES (start_doc,'11','101','시작',gen_random_uuid()),(goal_doc,'22','102','목표',gen_random_uuid());
  INSERT INTO ink_product.wiki_links (snapshot_id,page_id,canonical_title,aliases)
    VALUES (start_doc,'22','목표','{}'),(goal_doc,'11','시작','{}');
  INSERT INTO ink_product.wiki_documents (snapshot_id,document_html,document_digest)
    SELECT document_id,html,encode(sha256(convert_to(html,'UTF8')),'hex')
    FROM (VALUES (start_doc,'<p>시작</p>'),(goal_doc,'<p>목표</p>')) AS documents(document_id,html);
  INSERT INTO ink_product.policies VALUES (binding,3,8,1500,start_doc,goal_doc);
  INSERT INTO ink_product.wiki_course_pages VALUES (binding,'11',start_doc),(binding,'22',goal_doc);
  INSERT INTO ink_product.s5_phase1_policies_v1 VALUES (binding,'s5-phase1-20261113-v1');
  INSERT INTO ink_product.s5_phase2_policies_v1 VALUES (binding);
  INSERT INTO ink_product.s5_phase3_policies_v1 VALUES (binding);
  INSERT INTO ink_product.entry_policy_v1 VALUES ('review',binding,false,1,'group-3-8-20m-third-120s-v1');

  PERFORM set_config('request.jwt.claim.sub', actors[1]::text, true);
  SET LOCAL ROLE authenticated;
  result := public.get_group_items_entry_v1('review');
  SET LOCAL ROLE ink_product_owner;
  ASSERT result->>'available' = 'true' AND result->>'admissionEnabled' = 'false',
    'signed-in entry reads claims without direct Auth schema access';
  result := public.act_group_items_product_room_v1('create',NULL,gen_random_uuid(),NULL,binding,'{}');
  ASSERT result->>'code' = 'PRODUCT_NEW_MATCHES_DISABLED', 'closed entry rejects create';
  UPDATE ink_product.entry_policy_v1 SET admission_enabled = true WHERE channel = 'review';
  result := public.act_group_items_product_room_v1('create',NULL,request,NULL,binding,'{}');
  ASSERT result->>'ok' = 'true', 'host can create review room';
  replay := public.act_group_items_product_room_v1('create',NULL,request,NULL,binding,'{}');
  ASSERT replay = result AND (SELECT count(*) FROM ink_product.rooms) = 1, 'create retries reuse one room';
  room := (result->>'roomId')::uuid;
  SELECT code INTO room_code FROM ink_product.rooms WHERE id=room;

  FOR idx IN 1..3 LOOP
    PERFORM set_config('request.jwt.claim.sub', actors[idx]::text, true);
    IF idx > 1 THEN
      result := public.act_group_items_product_room_v1('join',NULL,gen_random_uuid(),NULL,
        binding,jsonb_build_object('roomCode',room_code));
      ASSERT result->>'ok' = 'true', 'review room join';
    END IF;
    SELECT version::text INTO room_version FROM ink_product.rooms WHERE id=room;
    result := public.act_group_items_product_room_v1('ready',room,gen_random_uuid(),room_version,binding,'{}');
    ASSERT result->>'ok' = 'true', 'review room ready';
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', actors[1]::text, true);
  SELECT version::text INTO room_version FROM ink_product.rooms WHERE id=room;
  result := public.act_group_items_product_room_v1('start',room,gen_random_uuid(),room_version,binding,'{}');
  ASSERT result->>'ok' = 'true', 'review room started';
  SELECT session_id INTO session FROM ink_product.rooms WHERE id=room;
  SELECT started_at INTO started FROM ink_product_engine.ink_sessions_v1 WHERE session_id=session;
  ASSERT (SELECT count(*) FROM ink_product_engine.ink_grants_v1 WHERE session_id=session AND source_round=0)=3,
    'start awards one draw for every player';
  ASSERT (SELECT count(DISTINCT owner_participant_id) FROM ink_product_engine.ink_grants_v1
    WHERE session_id=session AND source_round=0)=3, 'start has one grant per participant';
  ASSERT (SELECT bool_and(item_id IN ('ink','censor','trap','lost_link','bookmark','undo','search','link_index',
    'parry','shield','correction','thunder','thief','roulette','cannon','enhancement','weakening'))
    FROM ink_product_engine.ink_grants_v1 WHERE session_id=session), 'draw uses the S5 catalogue';
  ASSERT public.get_group_items_product_room_v1(room,NULL)->'binding' = binding, 'resume discovers the same binding';
  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  BEGIN
    PERFORM public.get_group_items_product_room_v1(room,NULL);
    RAISE EXCEPTION 'nonmember resume should fail';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  ASSERT ink_product_engine.ink_s5_phase2_due_v1(session,started,started+interval '19.999 seconds')=0, 'no early supply';
  ASSERT ink_product_engine.ink_s5_phase2_due_v1(session,started,started+interval '20 seconds')=1, 'first supply at 20s';
  ASSERT ink_product_engine.ink_s5_phase2_due_v1(session,started,started+interval '44.999 seconds')=1, '25s period';
  ASSERT ink_product_engine.ink_s5_phase2_due_v1(session,started,started+interval '45 seconds')=2, 'second supply at 45s';
  ASSERT ink_product_engine.ink_s5_phase2_due_v1(session,started,started+interval '70 seconds')=3, 'third supply at 70s';
  ASSERT ink_product_engine.ink_s5_phase2_due_v1(session,started,started+interval '95 seconds')=4, 'fourth supply remains scheduled';

  SELECT * INTO STRICT member FROM ink_product_engine.ink_members_v1
    WHERE session_id=session AND user_id=actors[1];
  SELECT * INTO STRICT picked FROM ink_product_engine.ink_grants_v1
    WHERE session_id=session AND owner_participant_id=member.participant_id;
  ASSERT picked.consumed_at IS NULL, 'initial draw stays available after reconnect';
  -- Fix one draw only after validating the random catalogue, to exercise a deterministic use.
  UPDATE ink_product_engine.ink_grants_v1 SET item_id='shield'
    WHERE session_id=session AND grant_id=picked.grant_id;
  payload := jsonb_build_object('grantId',picked.grant_id,'expectedInventoryVersion',member.inventory_version::text);
  PERFORM set_config('request.jwt.claim.sub', actors[1]::text, true);
  request := gen_random_uuid();
  result := public.act_group_items_product_v1(room,session,binding,request,'protect',payload);
  replay := public.act_group_items_product_v1(room,session,binding,request,'protect',payload);
  ASSERT result->'body'->>'ok' = 'true' AND replay = result, 'replayed item use reuses its receipt';
  ASSERT (SELECT consumed_at IS NOT NULL FROM ink_product_engine.ink_grants_v1
      WHERE session_id=session AND grant_id=picked.grant_id), 'item was consumed';
  result := public.act_group_items_product_v1(room,session,binding,gen_random_uuid(),'protect',payload);
  ASSERT result->'body'->>'ok' = 'false', 'second use with stale inventory is rejected';

  -- The rejected transaction must still write a server-side LOG entry.
  -- Deliberately manipulate one synthetic receipt *inside a caught subtransaction*:
  -- the future timestamps are rolled back before the normal supply smoke resumes.
  SELECT authority_received_at INTO STRICT clock_before
    FROM ink_product_engine.ink_receipts_v1
    WHERE session_id=session AND request_id=request;
  clock_future:=pg_catalog.clock_timestamp()+interval '2 minutes';
  BEGIN
    UPDATE ink_product_engine.ink_receipts_v1
      SET authority_received_at=clock_future,committed_at=clock_future
      WHERE session_id=session AND request_id=request;
    ASSERT FOUND, 'clock fixture must update one actual receipt';
    result := public.act_group_items_product_v1(room,session,binding,gen_random_uuid(),'protect',payload);
    ASSERT result->'body'->>'code'='AUTHORITY_TIME_REGRESSION',
      'future synthetic receipt must keep strict time guard';
    RAISE EXCEPTION 'S5_EXPECTED_CLOCK_PROBE_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'S5_EXPECTED_CLOCK_PROBE_ROLLBACK' THEN RAISE; END IF;
  END;
  ASSERT (SELECT authority_received_at FROM ink_product_engine.ink_receipts_v1
          WHERE session_id=session AND request_id=request)=clock_before,
    'rollback must restore the original receipt timestamp';

  -- Move the fixture start back and issue only the authenticated *read* RPC.
  -- No player item click or standalone C worker should be needed for due
  -- supplies while a player is connected and polling their own room.
  UPDATE ink_product_engine.ink_sessions_v1 SET started_at=started-interval '96 seconds'
    WHERE session_id=session;
  SET LOCAL ROLE authenticated;
  result := public.get_group_items_product_state_v1(room,session,binding);
  SET LOCAL ROLE ink_product_owner;
  ASSERT result->'body'->>'code' = 'STATE', 'state is readable after automatic due processing';
  ASSERT (SELECT count(*) FROM ink_product_engine.ink_supply_rounds_v1
      WHERE session_id=session AND closed_through_round BETWEEN 1 AND 4)=12,
    'four overdue rounds are settled on read for three players';
  ASSERT ink_product_engine.ink_s3_tick_v1(session,clock_timestamp(),gen_random_uuid(),false)=0,
    'same supply boundary cannot issue twice';
  ASSERT EXISTS (SELECT FROM ink_product.worker_schedule_v1 WHERE room_id=room AND expired_through IS NOT NULL),
    'online advance updates the worker watermark';
  ASSERT (SELECT bool_and(active=2) FROM (
    SELECT count(*) AS active FROM ink_product_engine.ink_grants_v1
    WHERE session_id=session AND consumed_at IS NULL GROUP BY owner_participant_id) AS slots), 'two-slot cap';
  RESET ROLE;
  EXECUTE format('REVOKE ink_product_owner FROM %I GRANTED BY CURRENT_USER', session_user);
  ASSERT NOT pg_has_role(session_user, 'ink_product_owner','SET'), 'fixture membership is revoked';
  ASSERT NOT EXISTS (SELECT FROM public.game_rooms WHERE id=room), 'item room is absent from regular rooms';
  RAISE NOTICE 'PASS S5 gate, ACL, three players, start draw, retry, resume, periodic supply, two-slot cap and mode isolation';
END
$smoke$;

SELECT pass('S5 item room and supply contract');
SELECT * FROM finish();
ROLLBACK;
