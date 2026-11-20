-- Group item races. Recovered from the S5 product engine and its continued supply revision.
-- The review and production entry policy tables start empty. New room admission starts disabled.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ink_product_owner')THEN CREATE ROLE ink_product_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;ELSIF EXISTS(SELECT FROM pg_roles WHERE rolname='ink_product_owner'AND(rolsuper OR rolcanlogin OR rolinherit OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='ink_product_owner')THEN RAISE EXCEPTION 'ROLE_CONTRACT_MISMATCH ink_product_owner';END IF;
IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ink_product_worker')THEN CREATE ROLE ink_product_worker NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;ELSIF EXISTS(SELECT FROM pg_roles WHERE rolname='ink_product_worker'AND(rolsuper OR rolcanlogin OR rolinherit OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='ink_product_worker')THEN RAISE EXCEPTION 'ROLE_CONTRACT_MISMATCH ink_product_worker';END IF;
IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='wiki_s5_worker')THEN CREATE ROLE wiki_s5_worker NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;ELSIF EXISTS(SELECT FROM pg_roles WHERE rolname='wiki_s5_worker'AND(rolsuper OR rolcanlogin OR rolinherit OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='wiki_s5_worker')THEN RAISE EXCEPTION 'ROLE_CONTRACT_MISMATCH wiki_s5_worker';END IF;
END $roles$;

-- On PostgreSQL 17 a non-superuser CREATEROLE migrator gets ADMIN, but SET
-- FALSE, on a role it creates. ALTER ... OWNER requires the SET option.
-- Borrow SET access only for this transaction, without inheriting any owner
-- permissions. Revoke only the membership that this migrator grants itself;
-- the unrelated supabase_admin bootstrap membership must remain unchanged.
DO $owner_membership$
BEGIN
  IF NOT pg_has_role(current_user, 'ink_product_owner', 'SET') THEN
    -- PostgreSQL 17 accepts one role-membership option per GRANT statement.
    EXECUTE format('GRANT ink_product_owner TO %I WITH INHERIT FALSE', current_user);
    EXECUTE format('GRANT ink_product_owner TO %I WITH SET TRUE', current_user);
    IF NOT pg_has_role(current_user, 'ink_product_owner', 'SET') THEN
      RAISE EXCEPTION 'S5_MIGRATION_OWNER_SET_UNAVAILABLE';
    END IF;
    PERFORM set_config('wiki_s5_migration.temporary_owner_set', 'yes', true);
  END IF;
END $owner_membership$;

SET LOCAL check_function_bodies=false;
GRANT CREATE,USAGE ON SCHEMA public TO ink_product_owner;
GRANT EXECUTE ON FUNCTION public.grant_xp_v1(uuid,text,uuid,integer,integer,text) TO ink_product_owner;
CREATE FUNCTION public.act_group_items_product_room_v1(p_operation text, p_room uuid, p_request uuid, p_expected_version text, p_binding jsonb, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  actor uuid := ink_product.request_actor_v1(); r ink_product.rooms; m ink_product.members; policy ink_product.policies;
  old ink_product.room_receipts; command jsonb; response jsonb; code text; result_room uuid := p_room;
BEGIN
  SELECT * INTO policy FROM ink_product.policies WHERE binding=p_binding;
  IF actor IS NULL OR policy.binding IS NULL OR p_request IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_ROOM_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  command := jsonb_build_array(p_operation,p_room,p_expected_version,p_binding,p_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended('wiki-s4-product-room:'||actor::text,0));
  SELECT * INTO old FROM ink_product.room_receipts WHERE actor_id=actor AND request_id=p_request;
  IF FOUND THEN
    IF old.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'PRODUCT_REQUEST_REUSED' USING ERRCODE='22023'; END IF;
    RETURN old.response;
  END IF;

  <<operation>> BEGIN
    -- The original immutable receipt above wins over policy retirement.
    -- New rooms use a server-issued tuple; existing rooms keep their own tuple.
    IF p_operation='create' AND NOT EXISTS(SELECT FROM ink_product.entry_policy_v1 WHERE binding=p_binding) THEN
      code:='PRODUCT_POLICY_RETIRED'; EXIT operation;
    END IF;
    -- Admission stops new actors as well as new rooms. Existing members and original receipts survive.
    IF p_operation IN ('create','rematch','join') AND p_binding->>'schemaVersion'='candidate-v3'
      AND NOT EXISTS(SELECT FROM ink_product.entry_policy_v1 WHERE binding=p_binding AND admission_enabled FOR SHARE) THEN
      IF p_operation<>'join' OR NOT EXISTS(SELECT FROM ink_product.rooms old_room JOIN ink_product.members existing
        ON existing.room_id=old_room.id WHERE old_room.binding=p_binding AND old_room.phase='waiting'
        AND old_room.code=p_payload->>'roomCode' AND existing.actor_id=actor AND existing.status='waiting') THEN
        code:='PRODUCT_NEW_MATCHES_DISABLED'; EXIT operation;
      END IF;
    END IF;
    -- Gate new v2 rooms after looking up the immutable original request receipt.
    -- Existing v1 rematches and existing match commands keep their original path.
    IF p_operation IN ('create','rematch') AND p_binding->>'schemaVersion'='candidate-v2' THEN
      IF NOT (SELECT new_rooms_enabled FROM ink_product_engine.s5_transition_control_v1 WHERE singleton FOR SHARE) THEN
        code := 'PRODUCT_NEW_MATCHES_DISABLED'; EXIT operation;
      END IF;
    END IF;
    IF p_operation IN ('create','join') THEN
      IF p_room IS NOT NULL OR p_expected_version IS NOT NULL THEN code := 'PRODUCT_INVALID_REQUEST'; EXIT operation; END IF;
    ELSIF p_operation IN ('ready','start','leave','rematch') THEN
      IF p_payload IS DISTINCT FROM '{}'::jsonb THEN code := 'PRODUCT_INVALID_REQUEST'; EXIT operation; END IF;
      SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND binding=p_binding FOR UPDATE;
      SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=actor;
      IF m.actor_id IS NULL OR (r.phase='waiting' AND m.status='left') THEN
        RAISE EXCEPTION 'PRODUCT_ROOM_UNAVAILABLE' USING ERRCODE='42501';
      END IF;
      IF r.version::text IS DISTINCT FROM p_expected_version THEN code := 'PRODUCT_ROOM_STALE'; EXIT operation; END IF;
    ELSE code := 'PRODUCT_INVALID_REQUEST'; EXIT operation;
    END IF;

    CASE p_operation
      WHEN 'create' THEN
        IF p_payload IS DISTINCT FROM '{}'::jsonb THEN code := 'PRODUCT_INVALID_REQUEST'; EXIT operation; END IF;
        INSERT INTO ink_product.rooms(binding,host_actor) VALUES (p_binding,actor) RETURNING id INTO result_room;
        INSERT INTO ink_product.members(room_id,actor_id,name) VALUES (result_room,actor,'참가자 1');
      WHEN 'join' THEN
        IF NOT coalesce(jsonb_typeof(p_payload)='object' AND p_payload-'roomCode'='{}'::jsonb AND
            p_payload->>'roomCode' ~ '^[0-9A-F]{12}$',false) THEN code := 'PRODUCT_INVALID_REQUEST'; EXIT operation; END IF;
        SELECT * INTO r FROM ink_product.rooms WHERE binding=p_binding AND phase='waiting' AND rooms.code=p_payload->>'roomCode' FOR UPDATE;
        IF r.id IS NULL OR (p_binding->>'schemaVersion'='candidate-v3' AND NOT EXISTS
          (SELECT FROM ink_product.members WHERE room_id=r.id AND status='waiting')) THEN
          code := 'PRODUCT_ROOM_UNAVAILABLE'; EXIT operation;
        END IF;
        result_room := r.id;
        SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=actor;
        IF m.status IS DISTINCT FROM 'waiting' THEN
          IF (SELECT count(*) FROM ink_product.members WHERE room_id=r.id AND status='waiting')>=policy.maximum_players THEN
            code := 'PRODUCT_ROOM_FULL'; EXIT operation;
          END IF;
          INSERT INTO ink_product.members(room_id,actor_id,name) SELECT r.id,actor,'참가자 '||(count(*)+1)::text
          FROM ink_product.members WHERE room_id=r.id ON CONFLICT (room_id,actor_id)
          DO UPDATE SET status='waiting',ready=false,owner_epoch=ink_product.members.owner_epoch+1;
          UPDATE ink_product.rooms SET version=version+1 WHERE id=r.id;
        END IF;
      WHEN 'ready' THEN
        IF r.phase<>'waiting' THEN code := 'PRODUCT_ROOM_PHASE'; EXIT operation; END IF;
        IF NOT m.ready THEN
          UPDATE ink_product.members SET ready=true WHERE room_id=r.id AND actor_id=actor;
          UPDATE ink_product.rooms SET version=version+1 WHERE id=r.id;
        END IF;
      WHEN 'start' THEN
        IF r.phase<>'waiting' OR r.host_actor<>actor OR NOT (SELECT count(*)>=policy.minimum_players AND bool_and(ready)
            FROM ink_product.members WHERE room_id=r.id AND status='waiting') THEN
          code := 'PRODUCT_START_UNAVAILABLE'; EXIT operation;
        END IF;
        IF to_regprocedure('ink_product.start_match_v1(uuid)') IS NULL OR
           to_regprocedure('ink_product.forfeit_match_v1(uuid,uuid)') IS NULL OR
           to_regprocedure('ink_product.read_match_state_v1(uuid,uuid)') IS NULL OR
           to_regprocedure('ink_product.apply_match_command_v1(uuid,uuid,uuid,text,jsonb,ink_product.wiki_links)') IS NULL THEN
          code := 'PRODUCT_MATCH_ENGINE_UNAVAILABLE'; EXIT operation;
        END IF;
        EXECUTE 'SELECT ink_product.start_match_v1($1)' USING r.id;
        IF NOT EXISTS (SELECT FROM ink_product.rooms WHERE id=r.id AND phase='playing' AND session_id IS NOT NULL)
           OR EXISTS (SELECT FROM ink_product.members WHERE room_id=r.id AND status<>'left' AND
              (status<>'playing' OR snapshot_id IS DISTINCT FROM policy.start_snapshot_id)) THEN
          RAISE EXCEPTION 'PRODUCT_MATCH_NOT_INITIALIZED';
        END IF;
      WHEN 'leave' THEN
        IF r.phase='playing' AND m.status='playing' THEN
          IF to_regprocedure('ink_product.forfeit_match_v1(uuid,uuid)') IS NULL THEN code := 'PRODUCT_MATCH_ENGINE_UNAVAILABLE'; EXIT operation; END IF;
          EXECUTE 'SELECT ink_product.forfeit_match_v1($1,$2)' USING r.id,actor;
          IF NOT EXISTS (SELECT FROM ink_product.members WHERE room_id=r.id AND actor_id=actor AND status='left') THEN
            RAISE EXCEPTION 'PRODUCT_FORFEIT_NOT_RECORDED';
          END IF;
        ELSIF r.phase='waiting' THEN
          UPDATE ink_product.members SET status='left',ready=false WHERE room_id=r.id AND actor_id=actor;
          UPDATE ink_product.rooms SET version=version+1, host_actor=coalesce((SELECT actor_id FROM ink_product.members
            WHERE room_id=r.id AND status='waiting' ORDER BY CASE WHEN r.binding->>'schemaVersion'='candidate-v3' THEN
              coalesce(admission_order,substring(name from '^참가자 ([0-9]{1,9})$')::bigint) END NULLS LAST,participant_id LIMIT 1),actor)
          WHERE id=r.id AND host_actor=actor;
          IF NOT FOUND THEN UPDATE ink_product.rooms SET version=version+1 WHERE id=r.id; END IF;
        ELSE code := 'PRODUCT_ROOM_PHASE'; EXIT operation;
        END IF;
      WHEN 'rematch' THEN
        IF r.phase<>'finished' OR r.host_actor<>actor THEN code := 'PRODUCT_REMATCH_UNAVAILABLE'; EXIT operation; END IF;
        SELECT id INTO result_room FROM ink_product.rooms WHERE previous_room_id=r.id;
        IF result_room IS NULL THEN
          INSERT INTO ink_product.rooms(binding,host_actor,previous_room_id) VALUES (r.binding,actor,r.id) RETURNING id INTO result_room;
          INSERT INTO ink_product.members(room_id,actor_id,name) VALUES (result_room,actor,m.name);
        END IF;
    END CASE;
  END operation;
  response := jsonb_build_object('ok',code IS NULL,'code',coalesce(code,'OK'),'actorId',actor,'requestId',p_request,
    'operation',p_operation,'roomId',result_room,'binding',p_binding,'protocol','s4-product-v1','testOnly',false);
  IF p_operation='rematch' AND code IS NULL THEN response := response || jsonb_build_object('previousRoomId',p_room); END IF;
  INSERT INTO ink_product.room_receipts VALUES (actor,p_request,command,response);
  RETURN response;
END $function$
;
ALTER FUNCTION act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb) OWNER TO ink_product_owner;
CREATE FUNCTION public.get_group_items_product_receipt_v1(p_room uuid, p_session uuid, p_binding jsonb, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r ink_product.rooms; m ink_product.members; saved jsonb;
BEGIN
  SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND session_id=p_session AND binding=p_binding;
  SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=ink_product.request_actor_v1();
  IF m.actor_id IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'PRODUCT_MATCH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  SELECT response INTO saved FROM ink_product.match_receipts
    WHERE room_id=r.id AND actor_id=m.actor_id AND owner_epoch=m.owner_epoch AND request_id=p_request;
  RETURN jsonb_build_object('scope',ink_product.match_scope(r,m),'body',coalesce(saved,'{"code":"REQUEST_NOT_OBSERVED"}'));
END $function$
;
ALTER FUNCTION get_group_items_product_receipt_v1(uuid,uuid,jsonb,uuid) OWNER TO ink_product_owner;
CREATE FUNCTION public.get_group_items_product_state_v1(p_room uuid, p_session uuid, p_binding jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r ink_product.rooms; m ink_product.members; body jsonb;
BEGIN
  SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND session_id=p_session AND binding=p_binding;
  SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=ink_product.request_actor_v1();
  IF m.actor_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_MATCH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF r.phase='finished' OR m.status IN ('finished','left') THEN
    body := '{"ok":true,"code":"SESSION_TERMINAL","readOnly":true,"canAct":false}';
  ELSE
    IF m.status<>'playing' OR to_regprocedure('ink_product.read_match_state_v1(uuid,uuid)') IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_MATCH_ENGINE_UNAVAILABLE' USING ERRCODE='55000';
    END IF;
    EXECUTE 'SELECT ink_product.read_match_state_v1($1,$2)' INTO body USING r.id,m.actor_id;
    IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body->>'code' IS DISTINCT FROM 'STATE' THEN
      RAISE EXCEPTION 'PRODUCT_INVALID_ENGINE_STATE';
    END IF;
    -- State polling is also a server-authoritative wake-up path for *active*
    -- matches. Presence was just refreshed by read_match_state_v1; an idle
    -- browser must not need to click/use an item to receive due supplies.
    IF ink_product.advance_due_room_v1(r.id) THEN
      SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND session_id=p_session AND binding=p_binding;
      SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=ink_product.request_actor_v1();
      IF r.phase='finished' OR m.status IN ('finished','left') THEN
        body := '{"ok":true,"code":"SESSION_TERMINAL","readOnly":true,"canAct":false}';
      ELSE
        EXECUTE 'SELECT ink_product.read_match_state_v1($1,$2)' INTO body USING r.id,m.actor_id;
        IF body->>'code' IS DISTINCT FROM 'STATE' THEN RAISE EXCEPTION 'PRODUCT_INVALID_ENGINE_STATE'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('scope',ink_product.match_scope(r,m),'body',body || jsonb_build_object(
    'binding',r.binding,'sessionId',r.session_id,'testOnly',false));
END $function$
;
ALTER FUNCTION get_group_items_product_state_v1(uuid,uuid,jsonb) OWNER TO ink_product_owner;
CREATE FUNCTION public.get_group_items_product_document_v1(p_room uuid, p_session uuid, p_binding jsonb, p_frame jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r ink_product.rooms; m ink_product.members; s ink_product.wiki_snapshots; descriptor jsonb; edges jsonb; html text;
BEGIN
  SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND session_id=p_session AND binding=p_binding AND phase='playing';
  SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=ink_product.request_actor_v1() AND status='playing';
  IF m.actor_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_DOCUMENT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT s FROM ink_product.wiki_snapshots WHERE id=m.snapshot_id;
  descriptor := jsonb_build_object('pageId',s.page_id,'revisionId',s.revision_id,'snapshotId',s.id,'progressVersion',m.progress_version::text);
  IF descriptor IS DISTINCT FROM p_frame THEN RAISE EXCEPTION 'STALE_DOCUMENT' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('pageId',page_id,'canonicalTitle',canonical_title,'aliases',aliases)
    ORDER BY page_id),'[]') INTO edges FROM ink_product.wiki_links WHERE snapshot_id=s.id AND page_id IN (SELECT ink_product.course_exits(r.session_id,s.page_id,s.revision_id));
  SELECT document_html INTO STRICT html FROM ink_product.wiki_documents WHERE snapshot_id=s.id;
  RETURN jsonb_build_object('scope',ink_product.match_scope(r,m),'body',descriptor || jsonb_build_object(
    'wikiSnapshotId',s.wiki_snapshot_id,'canonicalTitle',s.canonical_title,'links',edges,'documentHtml',html));
END $function$
;
ALTER FUNCTION get_group_items_product_document_v1(uuid,uuid,jsonb,jsonb) OWNER TO ink_product_owner;
CREATE FUNCTION public.act_group_items_product_v1(p_room uuid, p_session uuid, p_binding jsonb, p_request uuid, p_operation text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r ink_product.rooms; m ink_product.members; old ink_product.match_receipts;
  receipt uuid := gen_random_uuid(); command jsonb := jsonb_build_array(p_operation,p_payload); body jsonb;
  verified ink_product.wiki_links;
BEGIN
  SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND session_id=p_session AND binding=p_binding FOR UPDATE;
  SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=ink_product.request_actor_v1() FOR UPDATE;
  IF m.actor_id IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'PRODUCT_MATCH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT FROM ink_product.receipt_retention_v1 t WHERE t.room_id=r.id)THEN
    RETURN jsonb_build_object('scope',ink_product.match_scope(r,m),'body',jsonb_build_object('ok',false,'code','RECEIPT_EXPIRED','requestId',p_request,'operation',p_operation));
  END IF;
  SELECT * INTO old FROM ink_product.match_receipts
    WHERE room_id=r.id AND actor_id=m.actor_id AND owner_epoch=m.owner_epoch AND request_id=p_request;
  IF FOUND THEN
    IF old.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'PRODUCT_REQUEST_REUSED' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('scope',ink_product.match_scope(r,m),'body',old.response);
  END IF;
  IF r.phase<>'playing' OR m.status<>'playing' THEN RAISE EXCEPTION 'PRODUCT_MATCH_READ_ONLY' USING ERRCODE='42501'; END IF;
  IF (p_operation IN('reward_claim','reward_discard')AND NOT ink_product_engine.ink_s5_phase2_enabled_v1(r.session_id))OR p_operation IS NULL OR p_operation NOT IN ('normal_link','attack','parry','protect','bookmark_install','bookmark_return',
      'censor','correction','undo','trap_options','trap_install','lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim','reward_claim','reward_discard')
      OR (p_operation IN ('lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim','reward_claim','reward_discard') AND NOT ink_product_engine.ink_s5_enabled_v1(r.session_id))
      OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PRODUCT_INVALID_COMMAND' USING ERRCODE='22023';
  END IF;
  IF p_operation='normal_link' THEN
    BEGIN
      verified := ink_product.lock_verified_link(r.id,r.session_id,m.actor_id,r.binding,p_payload);
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM NOT IN ('STALE_DOCUMENT','LINK_NOT_VERIFIED') THEN RAISE; END IF;
      body := jsonb_build_object('ok',false,'code',SQLERRM);
    END;
  END IF;
  IF body IS NULL THEN
    IF to_regprocedure('ink_product.apply_match_command_v1(uuid,uuid,uuid,text,jsonb,ink_product.wiki_links)') IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_MATCH_ENGINE_UNAVAILABLE' USING ERRCODE='55000';
    END IF;
    EXECUTE 'SELECT ink_product.apply_match_command_v1($1,$2,$3,$4,$5,$6)' INTO body
      USING r.id,m.actor_id,receipt,p_operation,p_payload,verified;
    IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR jsonb_typeof(body->'ok') IS DISTINCT FROM 'boolean' OR
        coalesce(body->>'code','')='' THEN RAISE EXCEPTION 'PRODUCT_INVALID_ENGINE_RECEIPT'; END IF;
  END IF;
  body := body || jsonb_build_object('requestId',p_request,'receiptId',receipt,'operation',p_operation);
  INSERT INTO ink_product.match_receipts VALUES (r.id,m.actor_id,m.owner_epoch,p_request,command,body);
  RETURN jsonb_build_object('scope',ink_product.match_scope(r,m),'body',body);
END $function$
;
ALTER FUNCTION act_group_items_product_v1(uuid,uuid,jsonb,uuid,text,jsonb) OWNER TO ink_product_owner;
CREATE FUNCTION public.get_group_items_entry_v1(p_channel text DEFAULT 'production'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p ink_product.entry_policy_v1; limits ink_product.policies;
BEGIN
 IF ink_product.request_actor_v1() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM ink_product.entry_policy_v1 WHERE channel=p_channel;
 IF p.channel IS NULL THEN RETURN jsonb_build_object('available',false,'admissionEnabled',false); END IF;
 SELECT * INTO STRICT limits FROM ink_product.policies WHERE binding=p.binding;
 RETURN jsonb_build_object('available',true,'admissionEnabled',p.admission_enabled,'binding',p.binding,
  'policyRevision',p.revision::text,'lifecycleContract',p.lifecycle_contract,'minimumPlayers',limits.minimum_players,
  'maximumPlayers',limits.maximum_players,'maximumSeconds',1200,'thirdFinishGraceSeconds',120,
  'kionDefault',false,'unresolvedPolicy','TEST_ONLY_REVIEW_REQUIRED');
END $function$
;
ALTER FUNCTION get_group_items_entry_v1(text) OWNER TO ink_product_owner;
CREATE FUNCTION public.get_group_items_history_v1(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=ink_product.request_actor_v1(); entries jsonb; summary jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_LIMIT' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.ended_at DESC),'[]') INTO entries
 FROM (SELECT room_id,mode,binding,result_status,rank,xp,move_count,elapsed_seconds,ended_at FROM ink_product.result_projection_v1
  WHERE actor_id=actor ORDER BY ended_at DESC,room_id LIMIT p_limit) t;
 SELECT jsonb_build_object('finished',count(*) FILTER(WHERE result_status='finished'),
  'retired',count(*) FILTER(WHERE result_status='retired'),'xp',coalesce(sum(xp),0),
  'achievementEligibility','awaiting_policy') INTO summary FROM ink_product.result_projection_v1 WHERE actor_id=actor;
 RETURN jsonb_build_object('mode','group_items','summary',summary,'entries',entries);
END $function$
;
ALTER FUNCTION get_group_items_history_v1(integer) OWNER TO ink_product_owner;
CREATE FUNCTION public.get_group_items_product_room_v1(p_room uuid, p_binding jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  r ink_product.rooms; m ink_product.members; policy ink_product.policies; goal ink_product.wiki_snapshots;
  actor uuid := ink_product.request_actor_v1(); actions jsonb := '[]'; people jsonb; ranks jsonb := '[]'; role_name text := 'player';
BEGIN
  SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND (binding=p_binding OR p_binding IS NULL);
  SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=actor;
  IF m.actor_id IS NULL OR (r.phase='waiting' AND m.status='left') OR NOT (r.phase='waiting' OR NOT ink_product.is_next_v1(r.id) OR EXISTS(SELECT FROM ink_product_engine.ink_members_v1 engine_member
       WHERE engine_member.session_id=r.session_id AND engine_member.participant_id=m.participant_id AND engine_member.user_id=m.actor_id)) THEN
    RAISE EXCEPTION 'PRODUCT_ROOM_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT policy FROM ink_product.policies WHERE binding=r.binding;
  SELECT * INTO STRICT goal FROM ink_product.wiki_snapshots WHERE id=policy.goal_snapshot_id;
  IF r.phase='waiting' THEN
    actions := '["ready","leave"]';
    IF r.host_actor=actor AND (SELECT count(*) >= policy.minimum_players AND bool_and(ready)
        FROM ink_product.members WHERE room_id=r.id AND status='waiting') THEN
      actions := actions || '["start"]';
    END IF;
  ELSIF r.phase='playing' THEN
    IF m.status='playing' THEN actions := '["leave"]'; ELSE role_name := 'spectator'; END IF;
  ELSIF r.phase='finished' THEN
    IF r.host_actor=actor THEN actions := '["rematch"]'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('participantId',p.participant_id,'name',p.name,
      'rank',f.rank,'status',p.status,'xp',CASE WHEN p.actor_id=actor THEN f.xp END) ORDER BY f.rank), '[]') INTO ranks
    FROM ink_product.results f JOIN ink_product.members p USING (room_id,participant_id) WHERE f.room_id=r.id;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('participantId',p.participant_id,'name',p.name,'ready',p.ready,
    'currentTitle',s.canonical_title) ORDER BY p.participant_id), '[]') INTO people
  FROM ink_product.members p LEFT JOIN ink_product.wiki_snapshots s ON s.id=p.snapshot_id
  WHERE p.room_id=r.id AND (r.phase<>'waiting' OR p.status='waiting')
    AND (r.phase='waiting' OR NOT ink_product.is_next_v1(r.id) OR EXISTS(SELECT FROM ink_product_engine.ink_members_v1 engine_member
      WHERE engine_member.session_id=r.session_id AND engine_member.participant_id=p.participant_id));
  RETURN ink_product.match_scope(r,m) || jsonb_build_object('mode','group_items','testOnly',false,'roomId',r.id,
    'roomCode',r.code,'phase',r.phase,'role',role_name,'version',r.version::text,'players',people,'actions',actions,
    'tupleClass',CASE r.binding->>'schemaVersion' WHEN 'candidate-v1' THEN 'legacy-v1' WHEN 'candidate-v2' THEN 'rc-v2'
      WHEN 'candidate-v3' THEN 'group-rc-v3' ELSE 'registered-legacy' END,
    'minimumPlayers',policy.minimum_players,'maximumPlayers',policy.maximum_players,
    'lifecycle',(SELECT to_jsonb(l)-'room_id' FROM ink_product.group_lifecycle_v1 l WHERE l.room_id=r.id),
    'warningWindowMs',policy.warning_window_ms,'target',jsonb_build_object('pageId',goal.page_id,
    'revisionId',goal.revision_id,'title',goal.canonical_title),'results',ranks)||CASE WHEN ink_product_engine.ink_s5_phase2_enabled_v1(r.session_id)THEN jsonb_build_object('phase2Policy',true,'serverObservedAt',clock_timestamp())ELSE '{}'::jsonb END;
END $function$
;
ALTER FUNCTION get_group_items_product_room_v1(uuid,jsonb) OWNER TO ink_product_owner;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET LOCAL client_encoding = 'UTF8';
SET LOCAL standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', true);
SET LOCAL check_function_bodies = false;
SET LOCAL xmloption = content;
SET LOCAL client_min_messages = warning;

-- S5-only Postgres Changes. Register as the migration/publication owner
-- before handing the tables to the unprivileged S5 function owner.
-- The application never reads these tables through PostgREST; the schema is
-- intentionally absent from the exposed API schemas.
CREATE SCHEMA ink_product_events;
CREATE TABLE ink_product_events.signals_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(room_id, recipient_id)
);
CREATE TABLE ink_product_events.emotes_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  sender_participant_id uuid NOT NULL,
  emote_id text NOT NULL CHECK (emote_id IN (
    'hello','ready','go','good','wait','hurry','wow','lol','sad','gg'
  )),
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(room_id, recipient_id, sender_participant_id)
);
CREATE TABLE ink_product_events.emote_limits_v1 (
  room_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  last_sent_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, sender_id)
);
ALTER TABLE ink_product_events.signals_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ink_product_events.emotes_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY s5_signal_recipient ON ink_product_events.signals_v1
  FOR SELECT TO authenticated USING (recipient_id = coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid);
CREATE POLICY s5_emote_recipient ON ink_product_events.emotes_v1
  FOR SELECT TO authenticated USING (recipient_id = coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid);
DO $s5_publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE
      ink_product_events.signals_v1, ink_product_events.emotes_v1;
  END IF;
END $s5_publication$;
REVOKE ALL ON SCHEMA ink_product_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE
  ink_product_events.signals_v1,
  ink_product_events.emotes_v1,
  ink_product_events.emote_limits_v1
FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA ink_product_events TO authenticated;
GRANT SELECT ON TABLE ink_product_events.signals_v1, ink_product_events.emotes_v1 TO authenticated;
ALTER SCHEMA ink_product_events OWNER TO ink_product_owner;
ALTER TABLE ink_product_events.signals_v1 OWNER TO ink_product_owner;
ALTER TABLE ink_product_events.emotes_v1 OWNER TO ink_product_owner;
ALTER TABLE ink_product_events.emote_limits_v1 OWNER TO ink_product_owner;

--
-- Name: ink_product; Type: SCHEMA; Schema: -; Owner: ink_product_owner
--

CREATE SCHEMA ink_product;

-- auth.uid() requires USAGE on Supabase's managed auth schema. A custom
-- SECURITY DEFINER owner cannot receive that USAGE from the migration role.
-- Read the same JWT request settings directly, without widening auth access.
-- Only internal owner-executed S5 functions may call this helper.
CREATE FUNCTION ink_product.request_actor_v1() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$;


ALTER SCHEMA ink_product OWNER TO ink_product_owner;
ALTER FUNCTION ink_product.request_actor_v1() OWNER TO ink_product_owner;

--
-- Name: ink_product_engine; Type: SCHEMA; Schema: -; Owner: ink_product_owner
--

CREATE SCHEMA ink_product_engine;


ALTER SCHEMA ink_product_engine OWNER TO ink_product_owner;

-- PostgreSQL 17 does not inherit CREATE on a schema owned by another role
-- when the migration's temporary role membership uses INHERIT FALSE.
-- Finish the S5-only dump as the target schema owner. The one external FK
-- needs REFERENCES on profiles during DDL, not while the game is running.
GRANT REFERENCES ON TABLE public.profiles TO ink_product_owner;
SET LOCAL ROLE ink_product_owner;

--
-- Name: admission_order_v1(); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.admission_order_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
 BEGIN
  IF NOT ink_product.is_next_v1(NEW.room_id) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.status='waiting' THEN RETURN NEW; END IF; END IF;
  -- Product room mutation already owns this room lock; ordinals serialize per room.
  PERFORM 1 FROM ink_product.rooms WHERE id=NEW.room_id FOR UPDATE;
  SELECT coalesce(max(coalesce(admission_order,substring(name from '^참가자 ([0-9]{1,9})$')::bigint)),0)+1
   INTO NEW.admission_order FROM ink_product.members WHERE room_id=NEW.room_id;
  RETURN NEW;
 END $_$;


ALTER FUNCTION ink_product.admission_order_v1() OWNER TO ink_product_owner;

--
-- Name: advance_due_v1(); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.advance_due_v1() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; p jsonb; n integer := 0; now_at timestamptz := clock_timestamp();
  worker constant uuid := 'a3500000-0000-4000-9000-000000000007';
BEGIN
  FOR r IN SELECT * FROM ink_product.rooms WHERE phase='playing' ORDER BY id FOR UPDATE SKIP LOCKED LOOP
    IF EXISTS (SELECT FROM ink_product_engine.ink_attack_children_v1 c JOIN ink_product_engine.ink_attack_roots_v1 a USING(session_id,root_id)
      WHERE c.session_id=r.session_id AND c.state='pending' AND a.due_at<=now_at) OR
      EXISTS (SELECT FROM ink_product_engine.ink_members_v1 m JOIN ink_product_engine.ink_s3_presence_v1 v USING(session_id,participant_id,owner_epoch)
        JOIN ink_product_engine.ink_sessions_v1 s USING(session_id) WHERE m.session_id=r.session_id AND m.player_status='playing'
        AND v.observed_at>now_at-interval '10 seconds' AND NOT EXISTS (SELECT FROM ink_product_engine.ink_supply_rounds_v1 d
          WHERE d.session_id=m.session_id AND d.recipient_participant_id=m.participant_id AND d.recipient_epoch=m.owner_epoch
            AND d.closed_through_round>=ink_product_engine.ink_s3_due_round_v1(s.started_at,now_at))) THEN
      p := ink_product_engine.ink_s4_dispatch_v1(r.session_id,gen_random_uuid(),ink_product_engine.ink_s4_client_binding_v1(),
        'worker',worker,'advance','{}');
      IF p->>'code'<>'ADVANCED' THEN RAISE EXCEPTION 'PRODUCT_WORKER_REJECTED: %',p->>'code'; END IF;
      PERFORM ink_product.invalidate_room(r.id);
      n := n+1;
    END IF;
    PERFORM ink_product.finish_if_terminal_v1(r.id);
  END LOOP;
  RETURN n;
END $$;


ALTER FUNCTION ink_product.advance_due_v1() OWNER TO ink_product_owner;

SET LOCAL default_tablespace = '';

SET LOCAL default_table_access_method = heap;

--
-- Name: wiki_links; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.wiki_links (
    snapshot_id uuid NOT NULL,
    page_id text NOT NULL,
    canonical_title text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT wiki_links_canonical_title_check CHECK ((btrim(canonical_title) <> ''::text)),
    CONSTRAINT wiki_links_page_id_check CHECK ((page_id ~ '^[1-9][0-9]{0,18}$'::text))
);

ALTER TABLE ONLY ink_product.wiki_links FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.wiki_links OWNER TO ink_product_owner;

--
-- Name: apply_match_command_v1(uuid, uuid, uuid, text, jsonb, ink_product.wiki_links); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.apply_match_command_v1(p_room uuid, p_actor uuid, p_receipt uuid, p_operation text, p_payload jsonb, verified ink_product.wiki_links) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; b jsonb; internal_payload jsonb := p_payload; e ink_product_engine.ink_members_v1;
  next_document ink_product.wiki_snapshots; options jsonb;
BEGIN
  IF p_actor IS DISTINCT FROM ink_product.request_actor_v1() THEN RAISE EXCEPTION 'PRODUCT_ACTOR_MISMATCH'; END IF;
  IF ink_product.is_next_v1(p_room) AND ink_product.checkpoint_v1(p_room) THEN
    RETURN jsonb_build_object('ok',false,'code','MATCH_FINISHED','receiptId',p_receipt);
  END IF;
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room AND phase='playing' FOR UPDATE;
  IF p_operation='normal_link' THEN
    IF verified.page_id IS NULL OR verified.page_id IS DISTINCT FROM p_payload->>'targetPageId' THEN RAISE EXCEPTION 'PRODUCT_LINK_UNVERIFIED'; END IF;
    internal_payload := p_payload-'expectedSnapshotId';
  END IF;
  b := ink_product_engine.ink_s4_dispatch_v1(r.session_id,p_receipt,ink_product_engine.ink_s4_client_binding_v1(),
    'player',p_actor,p_operation,internal_payload);
  IF b->>'receiptId' IS DISTINCT FROM p_receipt::text THEN RAISE EXCEPTION 'PRODUCT_ENGINE_RECEIPT_MISSING: %', b->>'code'; END IF;
  IF b->>'code'='MOVED' THEN
    SELECT * INTO STRICT e FROM ink_product_engine.ink_members_v1 WHERE session_id=r.session_id AND user_id=p_actor;
    next_document := ink_product.course_document(r.session_id,e.current_page_id);
    IF next_document.id IS NULL OR next_document.revision_id IS DISTINCT FROM e.current_revision_id THEN
      RAISE EXCEPTION 'PRODUCT_SNAPSHOT_UNAVAILABLE';
    END IF;
    b := b || jsonb_build_object('pageId',next_document.page_id,'revisionId',next_document.revision_id,'snapshotId',next_document.id);
    UPDATE ink_product.members SET snapshot_id=next_document.id,progress_version=e.progress_version,
      status=CASE WHEN e.player_status='finished' THEN 'finished' ELSE 'playing' END WHERE room_id=r.id AND actor_id=p_actor;
    UPDATE ink_product.rooms SET version=version+1 WHERE id=r.id;
    PERFORM CASE WHEN ink_product.is_next_v1(r.id) THEN ink_product.checkpoint_v1(r.id) ELSE ink_product.finish_if_terminal_v1(r.id) END;
  ELSE
    PERFORM ink_product.invalidate_room(r.id);
  END IF;
  IF ink_product.is_next_v1(r.id) THEN PERFORM ink_product.checkpoint_v1(r.id); END IF;
  RETURN b;
END $$;


ALTER FUNCTION ink_product.apply_match_command_v1(p_room uuid, p_actor uuid, p_receipt uuid, p_operation text, p_payload jsonb, verified ink_product.wiki_links) OWNER TO ink_product_owner;

--
-- Name: authority_now_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.authority_now_v1(p_session uuid) RETURNS timestamp with time zone
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT clock_timestamp() $$;


ALTER FUNCTION ink_product.authority_now_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: can_read_product_topic(text); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.can_read_product_topic(p_topic text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT FROM ink_product.members m JOIN ink_product.rooms r ON r.id=m.room_id
    WHERE m.actor_id=ink_product.request_actor_v1() AND (r.phase<>'waiting' OR m.status<>'left')
      AND (r.phase='waiting' OR NOT ink_product.is_next_v1(r.id) OR EXISTS(SELECT FROM ink_product_engine.ink_members_v1 engine_member
       WHERE engine_member.session_id=r.session_id AND engine_member.participant_id=m.participant_id AND engine_member.user_id=m.actor_id))
      AND p_topic='group-items-product:'||r.id::text||':'||m.actor_id::text
  )
$$;


ALTER FUNCTION ink_product.can_read_product_topic(p_topic text) OWNER TO ink_product_owner;

--
-- Name: checkpoint_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.checkpoint_v1(p_room uuid) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; l ink_product.group_lifecycle_v1; t timestamptz; third_at timestamptz;
 reason text; cutoff timestamptz; worker constant uuid:='a3500000-0000-4000-9000-000000000007'; reply jsonb;
BEGIN
 SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room FOR UPDATE;
 IF NOT ink_product.is_next_v1(p_room) THEN RETURN false; END IF;
 IF r.phase<>'playing' THEN RETURN r.phase='finished'; END IF;
 SELECT * INTO STRICT l FROM ink_product.group_lifecycle_v1 WHERE room_id=p_room FOR UPDATE;
 t:=ink_product.authority_now_v1(r.session_id);
 -- Settle only attacks logically due before the authoritative end boundary.
 reply:=ink_product_engine.ink_s4_dispatch_v1(r.session_id,gen_random_uuid(),ink_product_engine.ink_s4_client_binding_v1(),
   'worker',worker,'advance','{}');
 IF reply->>'code'<>'ADVANCED' THEN RAISE EXCEPTION 'S5_CHECKPOINT_DISPATCH: %',reply->>'code'; END IF;
 -- Forced moves can complete another participant; synchronize every member.
 UPDATE ink_product.members p SET snapshot_id=d.id,progress_version=e.progress_version,
   status=CASE e.player_status WHEN 'finished' THEN 'finished' WHEN 'retired' THEN 'left' ELSE 'playing' END
 FROM ink_product_engine.ink_members_v1 e,ink_product.wiki_snapshots d,ink_product.wiki_course_pages c
 WHERE p.room_id=r.id AND e.session_id=r.session_id AND e.participant_id=p.participant_id
   AND c.binding=r.binding AND c.page_id=e.current_page_id AND c.snapshot_id=d.id
   AND (p.snapshot_id,p.progress_version,p.status) IS DISTINCT FROM
     (d.id,e.progress_version,CASE e.player_status WHEN 'finished' THEN 'finished' WHEN 'retired' THEN 'left' ELSE 'playing' END);
 SELECT finished_at INTO third_at FROM ink_product_engine.ink_members_v1
 WHERE session_id=r.session_id AND player_status='finished' ORDER BY finished_at,participant_id OFFSET 2 LIMIT 1;
 IF l.third_finished_at IS NULL AND third_at IS NOT NULL THEN
   UPDATE ink_product.group_lifecycle_v1 SET third_finished_at=third_at,
     grace_ends_at=least(third_at+interval '2 minutes',deadline_at) WHERE room_id=r.id RETURNING * INTO l;
 END IF;
 cutoff:=least(l.deadline_at,coalesce(l.grace_ends_at,l.deadline_at));
 -- Same priority and strict boundary as private.finalize_group_room_v13.
 IF NOT EXISTS(SELECT FROM ink_product_engine.ink_members_v1 WHERE session_id=r.session_id AND player_status='playing') THEN
   reason:='all_resolved';
 ELSIF t>=cutoff THEN
   reason:=CASE WHEN l.grace_ends_at<l.deadline_at THEN 'grace_timeout' ELSE 'time_limit' END;
   UPDATE ink_product_engine.ink_members_v1 SET player_status='retired' WHERE session_id=r.session_id AND player_status='playing';
   UPDATE ink_product.members SET status='left' WHERE room_id=r.id AND status='playing';
 ELSE RETURN false;
 END IF;
 UPDATE ink_product.group_lifecycle_v1 SET closed_at=t,end_reason=reason WHERE room_id=r.id;
 RETURN ink_product.finish_if_terminal_v1(r.id);
END $$;


ALTER FUNCTION ink_product.checkpoint_v1(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: close_expired_v2(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.close_expired_v2(p_session uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE t timestamptz:=ink_product.dispatch_now_v1(p_session); receipt uuid:=gen_random_uuid();
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1(p_session)AND EXISTS(SELECT FROM ink_product_engine.ink_s5_phase2_rewards_v1 WHERE session_id=p_session AND closed_at IS NULL AND expires_at<=t)THEN
  PERFORM ink_product_engine.ink_s3_record_v1(p_session,receipt,'worker','a3500000-0000-4000-9000-000000000007',receipt,'expire_rewards','{}',t,jsonb_build_object('ok',true,'code','REWARDS_EXPIRED','receiptId',receipt));
  PERFORM ink_product_engine.ink_s5_phase2_expire_rewards_v1(p_session,t,receipt,false);receipt:=gen_random_uuid();END IF;
 IF NOT EXISTS(SELECT FROM ink_product.rooms WHERE session_id=p_session AND phase='playing') THEN RETURN; END IF;
 IF EXISTS(SELECT FROM ink_product_engine.ink_s4_effects_v1 WHERE session_id=p_session AND closed_at IS NULL AND expires_at<=t)
 OR EXISTS(SELECT FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session AND closed_at IS NULL AND expires_at<=t) THEN
  PERFORM ink_product_engine.ink_s3_record_v1(p_session,receipt,'worker','a3500000-0000-4000-9000-000000000007',receipt,
   'expire_effects','{}',t,jsonb_build_object('ok',true,'code','EFFECTS_EXPIRED','receiptId',receipt));
  UPDATE ink_product_engine.ink_s4_effects_v1 SET closed_at=expires_at,closed_receipt_id=receipt
   WHERE session_id=p_session AND closed_at IS NULL AND expires_at<=t;
  UPDATE ink_product_engine.ink_rights_v1 SET closed_at=expires_at,close_reason='expired'
   WHERE session_id=p_session AND closed_at IS NULL AND expires_at<=t;
 END IF;
END $$;


ALTER FUNCTION ink_product.close_expired_v2(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: wiki_snapshots; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.wiki_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id text NOT NULL,
    revision_id text NOT NULL,
    canonical_title text NOT NULL,
    wiki_snapshot_id uuid NOT NULL,
    CONSTRAINT wiki_snapshots_canonical_title_check CHECK ((btrim(canonical_title) <> ''::text)),
    CONSTRAINT wiki_snapshots_page_id_check CHECK ((page_id ~ '^[1-9][0-9]{0,18}$'::text)),
    CONSTRAINT wiki_snapshots_revision_id_check CHECK ((revision_id ~ '^[1-9][0-9]{0,18}$'::text))
);

ALTER TABLE ONLY ink_product.wiki_snapshots FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.wiki_snapshots OWNER TO ink_product_owner;

--
-- Name: course_document(uuid, text); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.course_document(p_session uuid, p_page text) RETURNS ink_product.wiki_snapshots
    LANGUAGE sql STABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT s.* FROM ink_product.rooms r JOIN ink_product.wiki_course_pages p ON p.binding=r.binding
  JOIN ink_product.wiki_snapshots s ON s.id=p.snapshot_id AND s.page_id=p.page_id
  WHERE r.session_id=p_session AND p.page_id=p_page
$$;


ALTER FUNCTION ink_product.course_document(p_session uuid, p_page text) OWNER TO ink_product_owner;

--
-- Name: course_exits(uuid, text, text); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.course_exits(p_session uuid, p_page text, p_revision text) RETURNS SETOF text
    LANGUAGE sql STABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT l.page_id FROM ink_product.rooms r
  JOIN ink_product.wiki_course_pages source ON source.binding=r.binding AND source.page_id=p_page
  JOIN ink_product.wiki_snapshots s ON s.id=source.snapshot_id AND s.page_id=source.page_id AND s.revision_id=p_revision
  JOIN ink_product.wiki_links l ON l.snapshot_id=s.id
  JOIN ink_product.wiki_course_pages destination ON destination.binding=r.binding AND destination.page_id=l.page_id
  JOIN ink_product.wiki_snapshots target ON target.id=destination.snapshot_id AND target.page_id=l.page_id
    AND target.canonical_title=l.canonical_title
  WHERE r.session_id=p_session
$$;


ALTER FUNCTION ink_product.course_exits(p_session uuid, p_page text, p_revision text) OWNER TO ink_product_owner;

--
-- Name: course_is_goal(uuid, text, text); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.course_is_goal(p_session uuid, p_page text, p_revision text) RETURNS boolean
    LANGUAGE sql STABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT FROM ink_product.rooms r JOIN ink_product.policies p USING(binding)
    JOIN ink_product.wiki_snapshots s ON s.id=p.goal_snapshot_id
    WHERE r.session_id=p_session AND (s.page_id,s.revision_id)=(p_page,p_revision))
$$;


ALTER FUNCTION ink_product.course_is_goal(p_session uuid, p_page text, p_revision text) OWNER TO ink_product_owner;

--
-- Name: dispatch_now_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.dispatch_now_v1(p_session uuid) RETURNS timestamp with time zone
    LANGUAGE sql
    SET search_path TO ''
    AS $$
 SELECT least(ink_product.authority_now_v1(p_session),coalesce(ink_product.end_at_v1(p_session)-interval '1 microsecond','infinity'))
$$;


ALTER FUNCTION ink_product.dispatch_now_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: end_at_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.end_at_v1(p_session uuid) RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT least(l.deadline_at,coalesce(l.grace_ends_at,l.deadline_at))
 FROM ink_product.group_lifecycle_v1 l JOIN ink_product.rooms r ON r.id=l.room_id WHERE r.session_id=p_session
$$;


ALTER FUNCTION ink_product.end_at_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: finish_if_terminal_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.finish_if_terminal_v1(p_room uuid) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; x record; grant_reply jsonb; kind text; amount integer; pending record; close_receipt uuid:=gen_random_uuid(); t timestamptz;
BEGIN
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room FOR UPDATE;
  IF NOT ink_product.is_next_v1(p_room) THEN RETURN ink_product.finish_if_terminal_v1_pre_next(p_room); END IF;
  t:=ink_product.authority_now_v1(r.session_id);
  IF r.phase<>'playing' OR EXISTS(SELECT FROM ink_product.members WHERE room_id=r.id AND status='playing') THEN RETURN false; END IF;
  -- Terminal targets never receive new damage. Preserve due_at and original attack receipts.
  UPDATE ink_product_engine.ink_sessions_v1 SET lifecycle_state='finished' WHERE session_id=r.session_id;
  PERFORM ink_product_engine.ink_s3_record_v1(r.session_id,close_receipt,'worker',
    'a3500000-0000-4000-9000-000000000007',close_receipt,'group_terminal','{}',t,
    jsonb_build_object('ok',true,'code','GROUP_TERMINAL','receiptId',close_receipt));
  FOR pending IN SELECT c.child_id,a.due_at FROM ink_product_engine.ink_attack_children_v1 c
    JOIN ink_product_engine.ink_attack_roots_v1 a USING(session_id,root_id)
    WHERE c.session_id=r.session_id AND c.state='pending' ORDER BY a.due_at,a.acceptance_seq,c.child_id LOOP
    PERFORM ink_product_engine.ink_s4_resolve_v1(r.session_id,pending.child_id,pending.due_at,false,close_receipt);
  END LOOP;
  -- A worker can finalize several overlapping player sets in one transaction.
  -- Serialize NEW-policy XP finalization before taking any profile locks.
  IF ink_product_engine.ink_s5_phase2_enabled_v1(r.session_id)THEN PERFORM pg_advisory_xact_lock(hashtextextended('s5-phase2-xp-finalization-v1',0));END IF;
  FOR x IN SELECT e.user_id,e.participant_id,e.player_status,
    row_number() OVER (ORDER BY e.finished_at NULLS LAST,e.participant_id)::integer AS rank
    FROM ink_product_engine.ink_members_v1 e WHERE e.session_id=r.session_id ORDER BY e.user_id
  LOOP
    kind := CASE WHEN x.player_status='retired' THEN 'group_retire'
      WHEN x.rank<=3 THEN (ARRAY['group_rank_1','group_rank_2','group_rank_3'])[x.rank] ELSE 'group_rank_other' END;
    amount := CASE WHEN x.player_status='retired' THEN 0 WHEN x.rank<=3 THEN (ARRAY[70,55,45])[x.rank] ELSE 35 END;
    INSERT INTO ink_product.results(room_id,participant_id,rank,xp) VALUES (r.id,x.participant_id,x.rank,amount);
    grant_reply := public.grant_xp_v1(x.user_id,kind,x.participant_id,amount,amount,NULL);
    IF grant_reply->>'ok' IS DISTINCT FROM 'true' OR grant_reply->>'granted' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'PRODUCT_XP_NOT_POSTED';
    END IF;
  END LOOP;
  IF ink_product_engine.ink_s5_enabled_v1(r.session_id) THEN
    UPDATE ink_product_engine.ink_rights_v1 AS right_row SET closed_at=clock_timestamp(),close_reason='terminal'
      WHERE right_row.session_id=r.session_id AND right_row.kind='protection'
        AND right_row.expires_at='infinity' AND right_row.closed_at IS NULL;
  END IF;
  UPDATE ink_product_engine.ink_sessions_v1 SET lifecycle_state='finished',state_revision=state_revision+1 WHERE session_id=r.session_id;
  UPDATE ink_product.rooms SET phase='finished',version=version+1 WHERE id=r.id;
  IF ink_product_engine.ink_s5_phase2_enabled_v1(r.session_id)THEN
   PERFORM ink_product_engine.ink_s5_phase2_expire_rewards_v1(r.session_id,t,close_receipt,true);
   UPDATE ink_product_engine.ink_s4_traps_v1 SET closed_at=greatest(installed_at,t),close_reason='expired',closed_receipt_id=close_receipt WHERE session_id=r.session_id AND phase2_contract AND closed_at IS NULL;
  END IF;
  RETURN true;
END $$;


ALTER FUNCTION ink_product.finish_if_terminal_v1(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: finish_if_terminal_v1_pre_next(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.finish_if_terminal_v1_pre_next(p_room uuid) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; x record; grant_reply jsonb; kind text; amount integer;
BEGIN
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room FOR UPDATE;
  IF r.phase<>'playing' OR EXISTS(SELECT FROM ink_product.members WHERE room_id=r.id AND status='playing')
    OR EXISTS(SELECT FROM ink_product_engine.ink_attack_children_v1 WHERE session_id=r.session_id AND state='pending') THEN RETURN false; END IF;
  FOR x IN SELECT e.user_id,e.participant_id,e.player_status,
    row_number() OVER (ORDER BY e.finished_at NULLS LAST,e.participant_id)::integer AS rank
    FROM ink_product_engine.ink_members_v1 e WHERE e.session_id=r.session_id ORDER BY e.user_id
  LOOP
    kind := CASE WHEN x.player_status='retired' THEN 'group_retire'
      ELSE (ARRAY['group_rank_1','group_rank_2','group_rank_3'])[x.rank] END;
    amount := CASE WHEN x.player_status='retired' THEN 0 ELSE (ARRAY[70,55,45])[x.rank] END;
    INSERT INTO ink_product.results(room_id,participant_id,rank,xp) VALUES (r.id,x.participant_id,x.rank,amount);
    grant_reply := public.grant_xp_v1(x.user_id,kind,x.participant_id,amount,amount,NULL);
    IF grant_reply->>'ok' IS DISTINCT FROM 'true' OR grant_reply->>'granted' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'PRODUCT_XP_NOT_POSTED';
    END IF;
  END LOOP;
  IF ink_product_engine.ink_s5_enabled_v1(r.session_id) THEN
    UPDATE ink_product_engine.ink_rights_v1 AS right_row SET closed_at=clock_timestamp(),close_reason='terminal'
      WHERE right_row.session_id=r.session_id AND right_row.kind='protection'
        AND right_row.expires_at='infinity' AND right_row.closed_at IS NULL;
  END IF;
  UPDATE ink_product_engine.ink_sessions_v1 SET lifecycle_state='finished',state_revision=state_revision+1 WHERE session_id=r.session_id;
  UPDATE ink_product.rooms SET phase='finished',version=version+1 WHERE id=r.id;
  RETURN true;
END $$;


ALTER FUNCTION ink_product.finish_if_terminal_v1_pre_next(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: fixed_page_v1(text, boolean); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.fixed_page_v1(value text, to_engine boolean) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN to_engine THEN engine_page ELSE product_page END
  FROM (VALUES ('11','forest'),('22','tree'),('33','ecosystem'),('44','goal')) map(product_page,engine_page)
  WHERE value=CASE WHEN to_engine THEN product_page ELSE engine_page END
$$;


ALTER FUNCTION ink_product.fixed_page_v1(value text, to_engine boolean) OWNER TO ink_product_owner;

--
-- Name: fixed_supply_draw_v1(uuid, uuid, bigint, bytea); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.fixed_supply_draw_v1(p_session uuid, p_participant uuid, p_round bigint, p_draw bytea) RETURNS text
    LANGUAGE sql STABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN ink_product_engine.ink_s5_enabled_v1(p_session) THEN
    (ARRAY['ink','parry','shield','bookmark','undo','censor','correction','trap','lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon'])[1+ink_product_engine.ink_s5_draw_v1(p_session,p_participant,'supply/'||p_round,17)]
    ELSE CASE p_round
    WHEN 0 THEN CASE m.name WHEN '참가자 1' THEN 'censor' WHEN '참가자 2' THEN 'correction' ELSE 'trap' END
    WHEN 1 THEN CASE m.name WHEN '참가자 1' THEN 'bookmark' WHEN '참가자 2' THEN 'undo' ELSE 'ink' END
    ELSE (ARRAY['ink','parry','shield','bookmark','undo','censor','correction','trap'])[1+get_byte(p_draw,0)%8] END
  END
  FROM ink_product.rooms r JOIN ink_product.members m ON m.room_id=r.id
  WHERE r.session_id=p_session AND m.participant_id=p_participant
$$;


ALTER FUNCTION ink_product.fixed_supply_draw_v1(p_session uuid, p_participant uuid, p_round bigint, p_draw bytea) OWNER TO ink_product_owner;

--
-- Name: forfeit_match_v1(uuid, uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.forfeit_match_v1(p_room uuid, p_actor uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms;
BEGIN
  IF p_actor IS DISTINCT FROM ink_product.request_actor_v1() THEN RAISE EXCEPTION 'PRODUCT_ACTOR_MISMATCH'; END IF;
  IF ink_product.is_next_v1(p_room) AND ink_product.checkpoint_v1(p_room) THEN RETURN; END IF;
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room AND phase='playing' FOR UPDATE;
  UPDATE ink_product_engine.ink_members_v1 SET player_status='retired' WHERE session_id=r.session_id AND user_id=p_actor AND player_status='playing';
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_FORFEIT_UNAVAILABLE'; END IF;
  UPDATE ink_product.members SET status='left' WHERE room_id=r.id AND actor_id=p_actor AND status='playing';
  UPDATE ink_product.rooms SET version=version+1 WHERE id=r.id;
  PERFORM CASE WHEN ink_product.is_next_v1(r.id) THEN ink_product.checkpoint_v1(r.id) ELSE ink_product.finish_if_terminal_v1(r.id) END;
END $$;


ALTER FUNCTION ink_product.forfeit_match_v1(p_room uuid, p_actor uuid) OWNER TO ink_product_owner;

--
-- Name: freeze_reference(); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.freeze_reference() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  RAISE EXCEPTION 'PRODUCT_REFERENCE_IMMUTABLE' USING ERRCODE='22023';
END $$;


ALTER FUNCTION ink_product.freeze_reference() OWNER TO ink_product_owner;

--
-- Name: guard_room_update(); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.guard_room_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF (NEW.id,NEW.binding,NEW.previous_room_id) IS DISTINCT FROM (OLD.id,OLD.binding,OLD.previous_room_id) OR
     (OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id) OR
     NEW.version<OLD.version OR
     (NEW.phase<>OLD.phase AND (NEW.version=OLD.version OR NOT (
        (OLD.phase='waiting' AND NEW.phase='playing') OR (OLD.phase='playing' AND NEW.phase='finished')
     ))) THEN RAISE EXCEPTION 'PRODUCT_ROOM_BINDING_IMMUTABLE' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION ink_product.guard_room_update() OWNER TO ink_product_owner;

--
-- Name: has_due_v2(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.has_due_v2(p_room uuid) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; t timestamptz; watermark timestamptz;
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1((SELECT session_id FROM ink_product.rooms WHERE id=p_room)) AND EXISTS(SELECT FROM ink_product_engine.ink_s5_phase2_rewards_v1 q JOIN ink_product.rooms phase2_room ON phase2_room.session_id=q.session_id WHERE phase2_room.id=p_room AND q.closed_at IS NULL AND q.expires_at<=ink_product.authority_now_v1(phase2_room.session_id))THEN RETURN true;END IF;
 SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room;
 IF r.phase<>'playing' THEN RETURN false; END IF;
 t:=ink_product.authority_now_v1(r.session_id);
 SELECT expired_through INTO watermark FROM ink_product.worker_schedule_v1 WHERE room_id=r.id;
 RETURN (ink_product.is_next_v1(r.id) AND (t>=ink_product.end_at_v1(r.session_id) OR NOT EXISTS
  (SELECT FROM ink_product_engine.ink_members_v1 WHERE session_id=r.session_id AND player_status='playing')))
 OR EXISTS(SELECT FROM ink_product_engine.ink_attack_children_v1 c JOIN ink_product_engine.ink_attack_roots_v1 a USING(session_id,root_id)
   WHERE c.session_id=r.session_id AND c.state='pending' AND a.due_at<=t)
 OR EXISTS(SELECT FROM ink_product_engine.ink_members_v1 m LEFT JOIN ink_product_engine.ink_s3_presence_v1 v USING(session_id,participant_id,owner_epoch)
   JOIN ink_product_engine.ink_sessions_v1 s USING(session_id) WHERE m.session_id=r.session_id AND m.player_status='playing'
   AND(ink_product_engine.ink_s5_phase2_enabled_v1(r.session_id)OR v.observed_at>t-interval '10 seconds') AND NOT EXISTS(SELECT FROM ink_product_engine.ink_supply_rounds_v1 d
    WHERE d.session_id=m.session_id AND d.recipient_participant_id=m.participant_id AND d.recipient_epoch=m.owner_epoch
    AND d.closed_through_round>=ink_product_engine.ink_s5_phase2_due_v1(r.session_id,s.started_at,t)))
 OR EXISTS(SELECT FROM ink_product_engine.ink_s4_traps_v1 WHERE session_id=r.session_id AND closed_at IS NULL AND expires_at<=t)
 OR EXISTS(SELECT FROM ink_product_engine.ink_s4_effects_v1 WHERE session_id=r.session_id AND closed_at IS NULL AND expires_at<=t)
 OR EXISTS(SELECT FROM ink_product_engine.ink_rights_v1 WHERE session_id=r.session_id AND closed_at IS NULL AND expires_at<=t)
 OR EXISTS(SELECT FROM ink_product_engine.ink_effects_v1 WHERE session_id=r.session_id AND expires_at<=t AND expires_at>coalesce(watermark,'-infinity'));
END $$;


ALTER FUNCTION ink_product.has_due_v2(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: invalidate_room(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.invalidate_room(p_room uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $signal$
BEGIN
  -- A hint, not authoritative state. The receiver fetches the room/state RPC.
  -- UPSERT coalesces pending hints, and no client has write permission.
  INSERT INTO ink_product_events.signals_v1 AS current_signal(room_id, recipient_id)
  SELECT r.id, m.actor_id
  FROM ink_product.members m JOIN ink_product.rooms r ON r.id=m.room_id
  WHERE r.id=p_room AND (r.phase<>'waiting' OR m.status<>'left') AND (r.phase='waiting' OR NOT ink_product.is_next_v1(r.id) OR EXISTS(SELECT FROM ink_product_engine.ink_members_v1 engine_member
       WHERE engine_member.session_id=r.session_id AND engine_member.participant_id=m.participant_id AND engine_member.user_id=m.actor_id))
  ON CONFLICT (room_id, recipient_id) DO UPDATE
    SET version = current_signal.version + 1,
        changed_at = clock_timestamp();
END
$signal$;


ALTER FUNCTION ink_product.invalidate_room(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: is_next_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.is_next_v1(p_room uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM ink_product.rooms WHERE id=p_room AND binding->>'schemaVersion'='candidate-v3')
$$;


ALTER FUNCTION ink_product.is_next_v1(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: lock_verified_link(uuid, uuid, uuid, jsonb, jsonb); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.lock_verified_link(p_room uuid, p_session uuid, p_actor uuid, p_binding jsonb, p_payload jsonb) RETURNS ink_product.wiki_links
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; m ink_product.members; s ink_product.wiki_snapshots; edge ink_product.wiki_links;
BEGIN
  SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND session_id=p_session AND binding=p_binding AND phase='playing' FOR UPDATE;
  SELECT * INTO m FROM ink_product.members WHERE room_id=r.id AND actor_id=p_actor AND status='playing' FOR UPDATE;
  IF m.actor_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_DOCUMENT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT s FROM ink_product.wiki_snapshots WHERE id=m.snapshot_id;
  IF jsonb_build_object('expectedPageId',s.page_id,'expectedRevisionId',s.revision_id,'expectedSnapshotId',s.id,
      'expectedProgressVersion',m.progress_version::text) IS DISTINCT FROM (p_payload-'targetPageId') THEN
    RAISE EXCEPTION 'STALE_DOCUMENT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO edge FROM ink_product.wiki_links WHERE snapshot_id=s.id AND page_id=p_payload->>'targetPageId' AND page_id<>s.page_id;
  IF edge.page_id IS NULL OR edge.page_id NOT IN (SELECT ink_product.course_exits(r.session_id,s.page_id,s.revision_id)) THEN RAISE EXCEPTION 'LINK_NOT_VERIFIED' USING ERRCODE='22023'; END IF;
  RETURN edge;
END $$;


ALTER FUNCTION ink_product.lock_verified_link(p_room uuid, p_session uuid, p_actor uuid, p_binding jsonb, p_payload jsonb) OWNER TO ink_product_owner;

--
-- Name: members; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.members (
    room_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    participant_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    ready boolean DEFAULT false NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    owner_epoch bigint DEFAULT 1 NOT NULL,
    snapshot_id uuid,
    progress_version bigint DEFAULT 0 NOT NULL,
    admission_order bigint,
    CONSTRAINT members_admission_order_check CHECK ((admission_order > 0)),
    CONSTRAINT members_owner_epoch_check CHECK ((owner_epoch > 0)),
    CONSTRAINT members_progress_version_check CHECK ((progress_version >= 0)),
    CONSTRAINT members_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'playing'::text, 'finished'::text, 'left'::text])))
);

ALTER TABLE ONLY ink_product.members FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.members OWNER TO ink_product_owner;

--
-- Name: rooms; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text DEFAULT upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 12)) NOT NULL,
    binding jsonb NOT NULL,
    host_actor uuid NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    phase text DEFAULT 'waiting'::text NOT NULL,
    session_id uuid,
    previous_room_id uuid,
    CONSTRAINT rooms_check CHECK (((phase = 'waiting'::text) = (session_id IS NULL))),
    CONSTRAINT rooms_phase_check CHECK ((phase = ANY (ARRAY['waiting'::text, 'playing'::text, 'finished'::text]))),
    CONSTRAINT rooms_session_id_check CHECK ((session_id <> ALL (ARRAY['a3500000-0000-4000-9000-000000009801'::uuid, 'a3500000-0000-4000-9000-000000009802'::uuid]))),
    CONSTRAINT rooms_version_check CHECK ((version >= 0))
);

ALTER TABLE ONLY ink_product.rooms FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.rooms OWNER TO ink_product_owner;

--
-- Name: match_scope(ink_product.rooms, ink_product.members); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.match_scope(r ink_product.rooms, m ink_product.members) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object('actorId', m.actor_id, 'sessionId', r.session_id, 'participantId', m.participant_id,
    'ownerEpoch', m.owner_epoch::text, 'protocol','s4-product-v1', 'binding',r.binding)
$$;


ALTER FUNCTION ink_product.match_scope(r ink_product.rooms, m ink_product.members) OWNER TO ink_product_owner;

--
-- Name: project_result_v1(); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.project_result_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
 IF NOT ink_product.is_next_v1(NEW.room_id) THEN RETURN NEW; END IF;
 INSERT INTO ink_product.result_projection_v1(room_id,actor_id,participant_id,binding,result_status,rank,xp,move_count,elapsed_seconds,ended_at)
 SELECT r.id,m.actor_id,m.participant_id,r.binding,CASE e.player_status WHEN 'finished' THEN 'finished' ELSE 'retired' END,
   CASE WHEN e.player_status='finished' THEN NEW.rank END,NEW.xp,e.move_count,
   CASE WHEN e.player_status='finished' THEN extract(epoch FROM(e.finished_at-l.started_at)) END,l.closed_at
 FROM ink_product.rooms r JOIN ink_product.members m ON m.room_id=r.id
 JOIN ink_product_engine.ink_members_v1 e ON e.session_id=r.session_id AND e.participant_id=m.participant_id
 JOIN ink_product.group_lifecycle_v1 l ON l.room_id=r.id
 WHERE r.id=NEW.room_id AND m.participant_id=NEW.participant_id
 ON CONFLICT DO NOTHING;
 INSERT INTO ink_product.achievement_outbox_v1(participant_id) VALUES(NEW.participant_id) ON CONFLICT DO NOTHING;
 -- XP is already posted once by finish_if_terminal_v1. Projection never grants XP or rewards.
 RETURN NEW;
END $$;


ALTER FUNCTION ink_product.project_result_v1() OWNER TO ink_product_owner;

--
-- Name: publish_wiki_snapshot(text, text, text, uuid, jsonb); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.publish_wiki_snapshot(p_page text, p_revision text, p_title text, p_wiki_snapshot uuid, p_links jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE target ink_product.wiki_snapshots; snapshot uuid; expected jsonb; existing jsonb;
BEGIN
  IF jsonb_typeof(p_links) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT FROM jsonb_to_recordset(p_links) AS l("pageId" text,"canonicalTitle" text,aliases text[])
    WHERE l."pageId" IS NULL OR l."pageId"=p_page OR l."canonicalTitle" IS NULL OR l.aliases IS NULL
      OR array_position(l.aliases,NULL) IS NOT NULL
  ) OR (SELECT count(*) FROM jsonb_to_recordset(p_links) AS l("pageId" text)) <> (
    SELECT count(DISTINCT l."pageId") FROM jsonb_to_recordset(p_links) AS l("pageId" text)
  ) THEN RAISE EXCEPTION 'INVALID_PRODUCT_WIKI_LINKS' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_array(l."pageId",l."canonicalTitle",l.aliases) ORDER BY l."pageId"),'[]')
    INTO expected FROM jsonb_to_recordset(p_links) AS l("pageId" text,"canonicalTitle" text,aliases text[]);
  INSERT INTO ink_product.wiki_snapshots(page_id,revision_id,canonical_title,wiki_snapshot_id)
    VALUES (p_page,p_revision,p_title,p_wiki_snapshot) ON CONFLICT (page_id,revision_id) DO NOTHING RETURNING id INTO snapshot;
  IF snapshot IS NOT NULL THEN
    INSERT INTO ink_product.wiki_links(snapshot_id,page_id,canonical_title,aliases)
      SELECT snapshot,l."pageId",l."canonicalTitle",l.aliases FROM jsonb_to_recordset(p_links) AS l("pageId" text,"canonicalTitle" text,aliases text[]);
    RETURN snapshot;
  END IF;
  SELECT * INTO STRICT target FROM ink_product.wiki_snapshots WHERE page_id=p_page AND revision_id=p_revision;
  SELECT coalesce(jsonb_agg(jsonb_build_array(page_id,canonical_title,aliases) ORDER BY page_id),'[]') INTO existing
    FROM ink_product.wiki_links WHERE snapshot_id=target.id;
  IF (target.canonical_title,target.wiki_snapshot_id,existing) IS DISTINCT FROM (p_title,p_wiki_snapshot,expected) THEN
    RAISE EXCEPTION 'PRODUCT_WIKI_SNAPSHOT_CHANGED' USING ERRCODE='22023';
  END IF;
  RETURN target.id;
END $$;


ALTER FUNCTION ink_product.publish_wiki_snapshot(p_page text, p_revision text, p_title text, p_wiki_snapshot uuid, p_links jsonb) OWNER TO ink_product_owner;

--
-- Name: purge_receipts_v1(integer); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.purge_receipts_v1(p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE r record;now_at timestamptz:=clock_timestamp();n integer:=0;engine_count bigint;product_count bigint;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_RETENTION_LIMIT' USING ERRCODE='22023';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('s5-receipt-retention-v1',0))THEN RETURN jsonb_build_object('ok',true,'code','BUSY','processed',0);END IF;
 FOR r IN SELECT rm.id,rm.session_id,l.closed_at FROM ink_product.rooms rm
  JOIN ink_product.s5_phase5_policies_v1 p USING(binding)JOIN ink_product.group_lifecycle_v1 l ON l.room_id=rm.id
  JOIN ink_product_engine.ink_sessions_v1 s ON s.session_id=rm.session_id
  WHERE rm.phase='finished'AND s.lifecycle_state='finished'AND l.closed_at<=now_at-interval '30 days'
  AND NOT EXISTS(SELECT FROM ink_product.receipt_retention_v1 q WHERE q.room_id=rm.id)
  AND NOT EXISTS(SELECT FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=rm.session_id AND m.player_status='playing')
  AND NOT EXISTS(SELECT FROM ink_product_engine.ink_attack_children_v1 c WHERE c.session_id=rm.session_id AND c.state='pending')
  AND(SELECT count(*)FROM ink_product.result_projection_v1 z WHERE z.room_id=rm.id)=(SELECT count(*)FROM ink_product.members m WHERE m.room_id=rm.id)
  ORDER BY l.closed_at,rm.id LIMIT p_limit FOR UPDATE OF rm SKIP LOCKED LOOP
  SELECT count(*)INTO engine_count FROM ink_product_engine.ink_receipts_v1 WHERE session_id=r.session_id;
  SELECT count(*)INTO product_count FROM ink_product.match_receipts WHERE room_id=r.id;
  INSERT INTO ink_product.finished_move_archive_v1 SELECT r.id,r.session_id,coalesce(jsonb_agg(to_jsonb(m)-ARRAY['receipt_id','root_id','right_id','consumed_grant_id']ORDER BY m.logical_at,m.actor_participant_id,m.version_after),'[]')FROM ink_product_engine.ink_moves_v1 m WHERE m.session_id=r.session_id;
  -- Terminal identity/progress remains for old result/F5/topic contracts.
  UPDATE ink_product_engine.ink_members_v1 SET current_ink_effect_id=NULL WHERE session_id=r.session_id;
  DELETE FROM ink_product.match_receipts WHERE room_id=r.id;
  DELETE FROM ink_product_engine.ink_moves_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_effects_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_consumptions_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s3_presence_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_modifier_uses_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s4_effects_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_navigation_windows_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_lost_link_frames_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_roulette_supply_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_roulette_child_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_modifier_units_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_phase1_auto_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_phase1_thunder_chains_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_phase2_rewards_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_phase2_search_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_phase3_shield_rewards_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_bookmark_rights_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_attack_children_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_rights_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_modifiers_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s4_traps_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_s5_joker_candidates_v1 WHERE session_id=r.session_id;
DELETE FROM ink_product_engine.ink_attack_roots_v1 WHERE session_id=r.session_id;
  -- The old mutually referencing supply/grant rows are removed in one statement.
  -- No constraints are dropped or disabled.
  WITH supply AS(DELETE FROM ink_product_engine.ink_supply_rounds_v1 WHERE session_id=r.session_id RETURNING grant_id)
  DELETE FROM ink_product_engine.ink_grants_v1 WHERE session_id=r.session_id;
  DELETE FROM ink_product_engine.ink_s3_sessions_v1 WHERE session_id=r.session_id;
  DELETE FROM ink_product_engine.ink_receipts_v1 WHERE session_id=r.session_id;
  INSERT INTO ink_product.receipt_retention_v1 VALUES(r.id,r.session_id,r.closed_at,now_at,engine_count,product_count);
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'code','RECEIPTS_PURGED','processed',n);
END $$;


ALTER FUNCTION ink_product.purge_receipts_v1(p_limit integer) OWNER TO ink_product_owner;

--
-- Name: read_match_state_v1(uuid, uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.read_match_state_v1(p_room uuid, p_actor uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN EXISTS (SELECT FROM ink_product.rooms r WHERE r.id=p_room
      AND r.binding->>'schemaVersion' IN ('candidate-v2','candidate-v3')
      AND r.binding->>'rulesVersion'='ink-s5-test-v1'
      AND r.binding->>'catalogVersion'='ink-s5-test-v1'
      AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
    THEN ink_product.read_match_state_v1_grant(p_room,p_actor) ELSE ink_product.read_match_state_v1_legacy(p_room,p_actor) END
$$;


ALTER FUNCTION ink_product.read_match_state_v1(p_room uuid, p_actor uuid) OWNER TO ink_product_owner;

--
-- Name: read_match_state_v1_grant(uuid, uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.read_match_state_v1_grant(p_room uuid, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; m ink_product.members; s ink_product.wiki_snapshots; b jsonb; key text; effects jsonb; w jsonb; e ink_product_engine.ink_members_v1; now_at timestamptz := clock_timestamp();
BEGIN
  IF p_actor IS DISTINCT FROM ink_product.request_actor_v1() THEN RAISE EXCEPTION 'PRODUCT_ACTOR_MISMATCH'; END IF;
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room AND phase='playing';
  SELECT * INTO STRICT m FROM ink_product.members WHERE room_id=r.id AND actor_id=p_actor AND status='playing';
  SELECT * INTO STRICT s FROM ink_product.wiki_snapshots WHERE id=m.snapshot_id;
  INSERT INTO ink_product_engine.ink_s3_presence_v1 VALUES (r.session_id,m.participant_id,m.owner_epoch,clock_timestamp())
    ON CONFLICT (session_id,participant_id,owner_epoch) DO UPDATE SET observed_at=EXCLUDED.observed_at
    WHERE ink_product_engine.ink_s3_presence_v1.observed_at<EXCLUDED.observed_at-interval '2 seconds';
  b := ink_product_engine.get_group_item_s4_state_v1(r.session_id,ink_product_engine.ink_s4_client_binding_v1(),0);
  b := jsonb_set(b,'{self}',(b->'self') || jsonb_build_object('currentPageId',s.page_id,'currentRevisionId',s.revision_id,'currentSnapshotId',s.id));
  IF ink_product_engine.ink_s5_enabled_v1(r.session_id) THEN
    SELECT * INTO STRICT e FROM ink_product_engine.ink_members_v1 WHERE session_id=r.session_id AND user_id=p_actor;
    b := jsonb_set(b,'{inventory}',(SELECT coalesce(jsonb_agg(i.value || jsonb_build_object('baseTier',g.base_tier,
        'modifierKinds',ink_product_engine.ink_s5_grant_modifiers_v2(r.session_id,g.grant_id),
        'effectiveTier',ink_product_engine.ink_s5_grant_tier_v2(r.session_id,g.grant_id,g.base_tier)) ORDER BY i.ordinality),'[]')
      FROM jsonb_array_elements(b->'inventory') WITH ORDINALITY AS i(value,ordinality)
      JOIN ink_product_engine.ink_grants_v1 g ON g.session_id=r.session_id AND g.grant_id=(i.value->>'grantId')::uuid));
    b := jsonb_set(b,'{results}',(SELECT coalesce(jsonb_agg(i.value || jsonb_build_object('defenseKind',CASE
        WHEN c.outcome='reflected' OR (c.outcome='blocked' AND c.resolution_receipt_id=c.parry_attempt_receipt_id) THEN 'parry'
        WHEN c.outcome IN ('blocked','reflection_blocked') THEN 'protection' END) ORDER BY i.ordinality),'[]')
      FROM jsonb_array_elements(b->'results') WITH ORDINALITY AS i(value,ordinality)
      JOIN ink_product_engine.ink_attack_children_v1 c ON c.session_id=r.session_id AND c.child_id=(i.value->>'childId')::uuid));
    b := b || jsonb_build_object('s5TestOnly',true,'s5ModifierPolicy','grant-v2','modifiers',ink_product_engine.ink_s5_modifier_state_v1(e,now_at))
      || jsonb_build_object('lastForcedMove',(SELECT jsonb_build_object('moveId',mv.move_id,'operation',mv.operation,
        'receiptStep',mv.receipt_step,'pageId',mv.to_page_id,'revisionId',mv.to_revision_id,'progressVersion',mv.version_after::text)
        FROM ink_product_engine.ink_moves_v1 mv WHERE (mv.session_id,mv.actor_participant_id,mv.actor_epoch,mv.version_after)=
          (r.session_id,e.participant_id,e.owner_epoch,e.progress_version) AND mv.operation IN ('lost_link','cannon')))
      || ink_product_engine.ink_s5_navigation_state_v1(r.session_id,e,now_at)
      || ink_product_engine.ink_s5_joker_state_v1(r.session_id,e);
  END IF;
  IF ink_product_engine.ink_s5_phase2_enabled_v1(r.session_id)THEN b:=b||jsonb_build_object('phase2Policy',true,'search',ink_product_engine.ink_s5_phase2_search_state_v1(e,now_at));END IF;
  RETURN b;
END $$;


ALTER FUNCTION ink_product.read_match_state_v1_grant(p_room uuid, p_actor uuid) OWNER TO ink_product_owner;

--
-- Name: read_match_state_v1_legacy(uuid, uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.read_match_state_v1_legacy(p_room uuid, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; m ink_product.members; s ink_product.wiki_snapshots; b jsonb; key text; effects jsonb; w jsonb; e ink_product_engine.ink_members_v1; now_at timestamptz := clock_timestamp();
BEGIN
  IF p_actor IS DISTINCT FROM ink_product.request_actor_v1() THEN RAISE EXCEPTION 'PRODUCT_ACTOR_MISMATCH'; END IF;
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room AND phase='playing';
  SELECT * INTO STRICT m FROM ink_product.members WHERE room_id=r.id AND actor_id=p_actor AND status='playing';
  SELECT * INTO STRICT s FROM ink_product.wiki_snapshots WHERE id=m.snapshot_id;
  INSERT INTO ink_product_engine.ink_s3_presence_v1 VALUES (r.session_id,m.participant_id,m.owner_epoch,clock_timestamp())
    ON CONFLICT (session_id,participant_id,owner_epoch) DO UPDATE SET observed_at=EXCLUDED.observed_at
    WHERE ink_product_engine.ink_s3_presence_v1.observed_at<EXCLUDED.observed_at-interval '2 seconds';
  b := ink_product_engine.get_group_item_s4_state_v1(r.session_id,ink_product_engine.ink_s4_client_binding_v1(),0);
  b := jsonb_set(b,'{self}',(b->'self') || jsonb_build_object('currentPageId',s.page_id,'currentRevisionId',s.revision_id,'currentSnapshotId',s.id));
  IF ink_product_engine.ink_s5_enabled_v1(r.session_id) THEN
    SELECT * INTO STRICT e FROM ink_product_engine.ink_members_v1 WHERE session_id=r.session_id AND user_id=p_actor;
    b := jsonb_set(b,'{inventory}',(SELECT coalesce(jsonb_agg(i.value || jsonb_build_object('baseTier',g.base_tier) ORDER BY i.ordinality),'[]')
      FROM jsonb_array_elements(b->'inventory') WITH ORDINALITY AS i(value,ordinality)
      JOIN ink_product_engine.ink_grants_v1 g ON g.session_id=r.session_id AND g.grant_id=(i.value->>'grantId')::uuid));
    b := jsonb_set(b,'{results}',(SELECT coalesce(jsonb_agg(i.value || jsonb_build_object('defenseKind',CASE
        WHEN c.outcome='reflected' OR (c.outcome='blocked' AND c.resolution_receipt_id=c.parry_attempt_receipt_id) THEN 'parry'
        WHEN c.outcome IN ('blocked','reflection_blocked') THEN 'protection' END) ORDER BY i.ordinality),'[]')
      FROM jsonb_array_elements(b->'results') WITH ORDINALITY AS i(value,ordinality)
      JOIN ink_product_engine.ink_attack_children_v1 c ON c.session_id=r.session_id AND c.child_id=(i.value->>'childId')::uuid));
    b := b || jsonb_build_object('s5TestOnly',true,'modifiers',ink_product_engine.ink_s5_modifier_state_v1(e,now_at))
      || jsonb_build_object('lastForcedMove',(SELECT jsonb_build_object('moveId',mv.move_id,'operation',mv.operation,
        'pageId',mv.to_page_id,'revisionId',mv.to_revision_id,'progressVersion',mv.version_after::text)
        FROM ink_product_engine.ink_moves_v1 mv WHERE (mv.session_id,mv.actor_participant_id,mv.actor_epoch,mv.version_after)=
          (r.session_id,e.participant_id,e.owner_epoch,e.progress_version) AND mv.operation IN ('lost_link','cannon')))
      || ink_product_engine.ink_s5_navigation_state_v1(r.session_id,e,now_at)
      || ink_product_engine.ink_s5_joker_state_v1(r.session_id,e);
  END IF;
  RETURN b;
END $$;


ALTER FUNCTION ink_product.read_match_state_v1_legacy(p_room uuid, p_actor uuid) OWNER TO ink_product_owner;

--
-- Name: retention_eligible_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.retention_eligible_v1(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM ink_product.rooms r JOIN ink_product.s5_phase5_policies_v1 p USING(binding)JOIN ink_product.group_lifecycle_v1 l ON l.room_id=r.id WHERE r.session_id=p_session AND r.phase='finished'AND l.closed_at<=clock_timestamp()-interval '30 days')
$$;


ALTER FUNCTION ink_product.retention_eligible_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: room_version_changed(); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.room_version_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM ink_product.invalidate_room(NEW.id);
  RETURN NULL;
END $$;


ALTER FUNCTION ink_product.room_version_changed() OWNER TO ink_product_owner;

--
-- Name: run_due_batch_v1(uuid, integer); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.run_due_batch_v1(p_worker uuid, p_limit integer DEFAULT 32) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; x jsonb; n integer:=0; errors integer:=0; room_lag bigint; lag_ms bigint:=0;
 started timestamptz:=clock_timestamp(); worker constant uuid:='a3500000-0000-4000-9000-000000000007'; state text;
BEGIN
 IF p_worker IS NULL OR p_limit NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'INVALID_WORKER_BATCH' USING ERRCODE='22023'; END IF;
 INSERT INTO ink_product.worker_health_v1(worker_id,last_started_at,last_completed_at) VALUES(p_worker,started,started) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM ink_product.worker_health_v1 WHERE worker_id=p_worker FOR UPDATE;
 UPDATE ink_product.worker_health_v1 SET last_sqlstate=NULL WHERE worker_id=p_worker;
 FOR r IN SELECT rm.* FROM ink_product.rooms rm LEFT JOIN ink_product.worker_schedule_v1 q ON q.room_id=rm.id
   WHERE rm.phase='playing' AND ink_product.has_due_v2(rm.id) ORDER BY coalesce(q.last_polled_at,'-infinity'),rm.id LIMIT p_limit FOR UPDATE OF rm SKIP LOCKED LOOP
  BEGIN
   SELECT greatest(0,ceil(extract(epoch FROM(ink_product.authority_now_v1(r.session_id)-min(a.due_at)))*1000))::bigint INTO room_lag
    FROM ink_product_engine.ink_attack_roots_v1 a JOIN ink_product_engine.ink_attack_children_v1 c USING(session_id,root_id)
    WHERE a.session_id=r.session_id AND c.state='pending' AND a.due_at<=ink_product.authority_now_v1(r.session_id);
   lag_ms:=greatest(lag_ms,coalesce(room_lag,0),
    coalesce(ceil(extract(epoch FROM(ink_product.authority_now_v1(r.session_id)-ink_product.end_at_v1(r.session_id)))*1000)::bigint,0));
   IF ink_product.is_next_v1(r.id) THEN PERFORM ink_product.checkpoint_v1(r.id);
   ELSE
    x:=ink_product_engine.ink_s4_dispatch_v1(r.session_id,gen_random_uuid(),ink_product_engine.ink_s4_client_binding_v1(),'worker',worker,'advance','{}');
    IF x->>'code'<>'ADVANCED' THEN RAISE EXCEPTION 'WORKER_DISPATCH_FAILED'; END IF;
    PERFORM ink_product.finish_if_terminal_v1(r.id);
   END IF;
   PERFORM ink_product.close_expired_v2(r.session_id); PERFORM ink_product.invalidate_room(r.id); n:=n+1;
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE;errors:=errors+1;
   UPDATE ink_product.worker_health_v1 SET last_sqlstate=state WHERE worker_id=p_worker;
  END;
  -- Failed rooms also rotate, so an isolated bad room cannot starve later rooms.
  INSERT INTO ink_product.worker_schedule_v1(room_id,last_polled_at,expired_through) VALUES(r.id,clock_timestamp(),ink_product.dispatch_now_v1(r.session_id))
   ON CONFLICT(room_id) DO UPDATE SET last_polled_at=EXCLUDED.last_polled_at,expired_through=CASE WHEN errors=0 THEN EXCLUDED.expired_through ELSE ink_product.worker_schedule_v1.expired_through END;
 END LOOP;
 UPDATE ink_product.worker_health_v1 SET last_started_at=started,last_completed_at=clock_timestamp(),runs=runs+1,
  rooms_processed=rooms_processed+n,error_count=error_count+errors,last_run_errors=errors,last_due_lag_ms=lag_ms WHERE worker_id=p_worker;
 RETURN jsonb_build_object('ok',errors=0,'processed',n,'errors',errors,'dueLagMs',lag_ms);
END $$;


ALTER FUNCTION ink_product.run_due_batch_v1(p_worker uuid, p_limit integer) OWNER TO ink_product_owner;

-- An authenticated, scoped state read can settle the *same* room's due work.
-- This keeps the online match responsive without enabling the deferred C
-- operational worker or sweeping unrelated rooms on every client heartbeat.
CREATE FUNCTION ink_product.advance_due_room_v1(p_room uuid) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; result jsonb;
  worker constant uuid := 'a3500000-0000-4000-9000-000000000007';
BEGIN
  IF NOT ink_product.has_due_v2(p_room) THEN RETURN false; END IF;
  SELECT * INTO r FROM ink_product.rooms WHERE id=p_room AND phase='playing'
    FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR NOT ink_product.has_due_v2(p_room) THEN RETURN false; END IF;
  IF ink_product.is_next_v1(r.id) THEN
    PERFORM ink_product.checkpoint_v1(r.id);
  ELSE
    result := ink_product_engine.ink_s4_dispatch_v1(r.session_id, gen_random_uuid(),
      ink_product_engine.ink_s4_client_binding_v1(), 'worker', worker, 'advance', '{}'::jsonb);
    IF result->>'code' IS DISTINCT FROM 'ADVANCED' THEN
      RAISE EXCEPTION 'PRODUCT_ONLINE_ADVANCE_FAILED: %', result->>'code';
    END IF;
    PERFORM ink_product.finish_if_terminal_v1(r.id);
  END IF;
  PERFORM ink_product.close_expired_v2(r.session_id);
  -- Keep the expired-effect watermark consistent with run_due_batch_v1;
  -- otherwise an already-expired effect can make every heartbeat look due.
  INSERT INTO ink_product.worker_schedule_v1(room_id,last_polled_at,expired_through)
    VALUES (r.id, clock_timestamp(), ink_product.dispatch_now_v1(r.session_id))
    ON CONFLICT (room_id) DO UPDATE SET last_polled_at=EXCLUDED.last_polled_at,
      expired_through=EXCLUDED.expired_through;
  PERFORM ink_product.invalidate_room(r.id);
  RETURN true;
END $$;
ALTER FUNCTION ink_product.advance_due_room_v1(uuid) OWNER TO ink_product_owner;
REVOKE ALL ON FUNCTION ink_product.advance_due_room_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

--
-- Name: start_match_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.start_match_v1(p_room uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; p ink_product.policies; session uuid := gen_random_uuid(); receipt uuid := gen_random_uuid(); count_players integer;
  started timestamptz := clock_timestamp(); engine_binding jsonb := ink_product_engine.ink_s3_binding_v1(); init jsonb;
  worker constant uuid := 'a3500000-0000-4000-9000-000000000007';
BEGIN
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room AND phase='waiting' FOR UPDATE;
  SELECT * INTO STRICT p FROM ink_product.policies WHERE binding=r.binding;
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
END $$;


ALTER FUNCTION ink_product.start_match_v1(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: start_match_v1_pre_next(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.start_match_v1_pre_next(p_room uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r ink_product.rooms; p ink_product.policies; session uuid := gen_random_uuid(); receipt uuid := gen_random_uuid();
  started timestamptz := clock_timestamp(); engine_binding jsonb := ink_product_engine.ink_s3_binding_v1(); init jsonb;
  worker constant uuid := 'a3500000-0000-4000-9000-000000000007';
BEGIN
  SELECT * INTO STRICT r FROM ink_product.rooms WHERE id=p_room AND phase='waiting' FOR UPDATE;
  SELECT * INTO STRICT p FROM ink_product.policies WHERE binding=r.binding;
  IF NOT ((p.binding->>'modePolicyVersion'='wikipedia-three-review-v1' AND p.warning_window_ms=2000)
     OR (p.binding->>'modePolicyVersion'='wikipedia-s5-test-v1' AND p.binding->>'rulesVersion'='ink-s5-test-v1'
       AND p.binding->>'catalogVersion'='ink-s5-test-v1' AND p.warning_window_ms IN (1500,2000)))
     OR p.minimum_players<>3 OR p.maximum_players<>3
     OR (SELECT count(*) FROM ink_product.wiki_course_pages WHERE binding=r.binding
           AND snapshot_id IN (p.start_snapshot_id,p.goal_snapshot_id))<>2
  THEN RAISE EXCEPTION 'PRODUCT_WIKIPEDIA_COURSE_MISMATCH'; END IF;
  IF (SELECT count(*) FROM ink_product.members WHERE room_id=r.id AND status='waiting' AND ready)<>3 OR
     (SELECT count(DISTINCT name) FROM ink_product.members WHERE room_id=r.id AND status='waiting'
      AND name IN ('참가자 1','참가자 2','참가자 3'))<>3 THEN RAISE EXCEPTION 'PRODUCT_PARTICIPANTS_UNBOUND'; END IF;

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
  IF ink_product_engine.ink_s3_tick_v1(session,started,receipt,true)<>3 THEN RAISE EXCEPTION 'PRODUCT_ROUND_ZERO_INCOMPLETE'; END IF;
  IF NOT ink_product_engine.ink_s5_enabled_v1(session) THEN
  INSERT INTO ink_product_engine.ink_grants_v1(session_id,grant_id,owner_participant_id,owner_epoch,item_id,base_tier,slot_index,granted_at)
    SELECT session,gen_random_uuid(),participant_id,owner_epoch,
      CASE name WHEN '참가자 1' THEN 'ink' WHEN '참가자 2' THEN 'parry' ELSE 'shield' END,'normal',1,started
    FROM ink_product.members WHERE room_id=r.id AND status='playing';
  UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1 WHERE session_id=session;
  END IF;
  PERFORM ink_product_engine.ink_s3_record_v1(session,receipt,'worker',worker,receipt,'s4_product_init',init,started,
    jsonb_build_object('ok',true,'code','PRODUCT_INITIALIZED','receiptId',receipt));
END $$;


ALTER FUNCTION ink_product.start_match_v1_pre_next(p_room uuid) OWNER TO ink_product_owner;

--
-- Name: worker_healthcheck_v1(uuid); Type: FUNCTION; Schema: ink_product; Owner: ink_product_owner
--

CREATE FUNCTION ink_product.worker_healthcheck_v1(p_worker uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT jsonb_build_object('healthy',last_completed_at>clock_timestamp()-interval '10 seconds' AND last_run_errors=0,
  'lastCompletedAt',last_completed_at,'runs',runs,'errors',error_count,'lastRunErrors',last_run_errors,'lastSqlstate',last_sqlstate,'dueLagMs',last_due_lag_ms)
 FROM ink_product.worker_health_v1 WHERE worker_id=p_worker
$$;


ALTER FUNCTION ink_product.worker_healthcheck_v1(p_worker uuid) OWNER TO ink_product_owner;

--
-- Name: get_group_item_s4_state_v1(uuid, jsonb, bigint); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.get_group_item_s4_state_v1(p_session uuid, p_binding jsonb, p_since bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    SET row_security TO 'on'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE
  v_actor uuid;
  v_reply jsonb;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_binding jsonb := ink_product_engine.ink_s3_binding_v1();
BEGIN
  BEGIN
    v_actor := ink_product.request_actor_v1();
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE');
  END;
  IF v_actor IS NULL OR p_session IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE');
  END IF;
  IF p_since<0 THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_CURSOR'); END IF;
  SELECT CASE
    WHEN p_binding IS DISTINCT FROM ink_product_engine.ink_s4_client_binding_v1() THEN pg_catalog.jsonb_build_object('ok',false,'code','BINDING_MISMATCH')
    WHEN s.lifecycle_state<>'playing' OR m.player_status<>'playing' THEN
      pg_catalog.jsonb_build_object('ok',true,'code','SESSION_TERMINAL','sessionId',s.session_id,'binding',ink_product_engine.ink_s4_client_binding_v1(),
        'lifecycleState',s.lifecycle_state,'memberStatus',m.player_status,'readOnly',true,'canAct',false)
    ELSE pg_catalog.jsonb_build_object('ok',true,'code','STATE','sessionId',s.session_id,'binding',ink_product_engine.ink_s4_client_binding_v1(),
      'lifecycleState',s.lifecycle_state,'serverObservedAt',v_now,'stateRevision',s.state_revision::text,
      'delivery','state_only','readOnly',false,'canAct',true,'testOnly',true,
      'self',pg_catalog.jsonb_build_object('participantId',m.participant_id,'ownerEpoch',m.owner_epoch::text,
        'status',m.player_status,'inventoryVersion',m.inventory_version::text,'progressVersion',m.progress_version::text,
        'recipientEventSeq',m.recipient_event_seq::text,'currentPageId',m.current_page_id,
        'currentRevisionId',m.current_revision_id,'moveCount',m.move_count),
      'inventory',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('grantId',g.grant_id,'slotIndex',g.slot_index,'itemId',g.item_id)
          ORDER BY g.slot_index)
        FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=s.session_id AND g.owner_participant_id=m.participant_id
          AND g.owner_epoch=m.owner_epoch AND g.consumed_at IS NULL),'[]'::jsonb),
      'supply',(SELECT pg_catalog.jsonb_build_object('lastClosedRound',d.closed_through_round::text,
          'round',d.selected_round::text,'outcome',d.outcome,'logicalDueAt',d.logical_due_at)
        FROM ink_product_engine.ink_supply_rounds_v1 d WHERE d.session_id=s.session_id
          AND d.recipient_participant_id=m.participant_id AND d.recipient_epoch=m.owner_epoch
        ORDER BY d.closed_through_round DESC LIMIT 1),
      'bookmark',(SELECT pg_catalog.jsonb_build_object('rightId',k.right_id,'pageId',k.origin_page_id,
          'revisionId',k.origin_revision_id,'remainingNormalMoves',k.remaining_moves)
        FROM ink_product_engine.ink_bookmark_rights_v1 k WHERE k.session_id=s.session_id AND k.actor_participant_id=m.participant_id
          AND k.actor_epoch=m.owner_epoch AND k.closed_at IS NULL),
      'targets',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('participantId',t.participant_id,'eligible',t.player_status='playing')
          ORDER BY t.participant_id)
        FROM ink_product_engine.ink_members_v1 t WHERE t.session_id=s.session_id
          AND t.participant_id<>m.participant_id AND t.member_role='player'),'[]'::jsonb),
      'itemEffects',coalesce((SELECT jsonb_agg(jsonb_build_object('effectId',e.effect_id,'kind',e.kind,'startsAt',e.starts_at,
        'expiresAt',e.expires_at,'payload',e.payload) ORDER BY e.effect_id) FROM ink_product_engine.ink_s4_effects_v1 e
        WHERE e.session_id=s.session_id AND e.participant_id=m.participant_id AND e.owner_epoch=m.owner_epoch
          AND e.closed_at IS NULL AND e.starts_at<=v_now AND v_now<e.expires_at AND
          (e.progress_version IS NULL OR (e.progress_version,e.page_id,e.revision_id)=(m.progress_version,m.current_page_id,m.current_revision_id))),'[]'::jsonb),
      'trapArmed',EXISTS(SELECT 1 FROM ink_product_engine.ink_s4_traps_v1 t WHERE t.session_id=s.session_id
        AND t.participant_id=m.participant_id AND t.owner_epoch=m.owner_epoch AND t.progress_version=m.progress_version
        AND t.closed_at IS NULL AND t.installed_at<=v_now AND v_now<t.expires_at),
      'warnings',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('childId',c.child_id,'rootId',r.root_id,
          'sourceParticipantId',r.source_participant_id,'itemId',(SELECT g.item_id FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=r.session_id AND g.grant_id=r.grant_id),'dueAt',r.due_at,'tier',r.effective_tier,'status','pending',
          'eventSeq',c.warning_event_seq::text,'acceptanceSeq',r.acceptance_seq::text,
          'canParry',p.grant_id IS NOT NULL AND c.parry_attempt_receipt_id IS NULL,
          'parryGrantId',CASE WHEN c.parry_attempt_receipt_id IS NULL THEN p.grant_id ELSE NULL END)
          ORDER BY r.due_at,r.acceptance_seq)
        FROM ink_product_engine.ink_attack_children_v1 c JOIN ink_product_engine.ink_attack_roots_v1 r USING (session_id,root_id)
        LEFT JOIN LATERAL (
          SELECT g.grant_id FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=s.session_id
            AND g.owner_participant_id=m.participant_id AND g.owner_epoch=m.owner_epoch
            AND g.item_id='parry' AND g.consumed_at IS NULL ORDER BY g.slot_index LIMIT 1
        ) p ON true
        WHERE c.session_id=s.session_id AND c.target_participant_id=m.participant_id AND c.target_epoch=m.owner_epoch
          AND c.state='pending' AND r.accepted_at<=v_now AND v_now<r.due_at),'[]'::jsonb),
      'effects',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('effectId',e.effect_id,'childId',e.child_id,
          'kind',e.kind,'tier',e.tier,'startsAt',e.starts_at,'expiresAt',e.expires_at,
          'eventSeq',(CASE WHEN c.target_participant_id=m.participant_id THEN c.target_result_event_seq ELSE c.source_result_event_seq END)::text,
          'visiblePulseCount',CASE WHEN v_now>=e.starts_at+interval '360 milliseconds' THEN 3
            WHEN v_now>=e.starts_at+interval '180 milliseconds' THEN 2 ELSE 1 END))
        FROM ink_product_engine.ink_effects_v1 e JOIN ink_product_engine.ink_attack_children_v1 c USING (session_id,child_id)
        WHERE e.session_id=s.session_id AND e.effect_id=m.current_ink_effect_id
          AND e.recipient_participant_id=m.participant_id AND e.recipient_epoch=m.owner_epoch
          AND e.starts_at<=v_now AND v_now<e.expires_at),'[]'::jsonb),
      'protection',(
        SELECT pg_catalog.jsonb_build_object('rightId',p.right_id,'startsAt',p.installed_at,'expiresAt',p.expires_at)
        FROM ink_product_engine.ink_rights_v1 p WHERE p.session_id=s.session_id AND p.owner_participant_id=m.participant_id
          AND p.owner_epoch=m.owner_epoch AND p.kind='protection' AND p.closed_at IS NULL
          AND p.installed_at<=v_now AND v_now<p.expires_at AND p.remaining_charges=1),
      'results',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('eventSeq',x.seq::text,'childId',x.child_id,
          'rootId',x.root_id,'acceptanceSeq',x.acceptance_seq::text,'outcome',x.outcome,
          'sourceParticipantId',x.source_participant_id,'targetParticipantId',x.target_participant_id,
          'resolvedAt',x.resolved_logical_at,'effectId',x.effect_id,'itemId',x.item_id) ORDER BY x.seq)
        FROM (
          SELECT q.* FROM (
            SELECT c.child_id,c.root_id,r.acceptance_seq,c.outcome,c.resolved_logical_at,e.effect_id,
              r.source_participant_id,c.target_participant_id,g.item_id,
              CASE WHEN c.target_participant_id=m.participant_id THEN c.target_result_event_seq
                ELSE c.source_result_event_seq END AS seq
            FROM ink_product_engine.ink_attack_children_v1 c JOIN ink_product_engine.ink_attack_roots_v1 r USING (session_id,root_id)
            JOIN ink_product_engine.ink_grants_v1 g ON g.session_id=r.session_id AND g.grant_id=r.grant_id
            LEFT JOIN ink_product_engine.ink_effects_v1 e ON e.session_id=c.session_id AND e.child_id=c.child_id
              AND e.recipient_participant_id=m.participant_id AND e.recipient_epoch=m.owner_epoch
            WHERE c.session_id=s.session_id AND c.state='resolved' AND c.resolved_logical_at<=v_now
              AND ((c.target_participant_id=m.participant_id AND c.target_epoch=m.owner_epoch)
                OR (r.source_participant_id=m.participant_id AND r.source_epoch=m.owner_epoch))
          ) q WHERE q.seq>p_since ORDER BY q.seq DESC LIMIT 32
        ) x),'[]'::jsonb))
    END INTO v_reply
  FROM ink_product_engine.ink_sessions_v1 s JOIN ink_product_engine.ink_members_v1 m USING (session_id)
  WHERE s.session_id=p_session AND ink_product_engine.ink_s4_matches_v1(s) AND m.user_id=v_actor AND m.member_role='player';
  RETURN coalesce(v_reply,pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE'));
END;
$$;


ALTER FUNCTION ink_product_engine.get_group_item_s4_state_v1(p_session uuid, p_binding jsonb, p_since bigint) OWNER TO ink_product_owner;

--
-- Name: ink_s2_next_event_v1(uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s2_next_event_v1(p_session uuid, p_participant uuid) RETURNS bigint
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  UPDATE ink_product_engine.ink_members_v1
    SET recipient_event_seq=recipient_event_seq+1
    WHERE session_id=p_session AND participant_id=p_participant
    RETURNING recipient_event_seq
$$;


ALTER FUNCTION ink_product_engine.ink_s2_next_event_v1(p_session uuid, p_participant uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s2_resolve_v1(uuid, uuid, timestamp with time zone, boolean, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s2_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_child ink_product_engine.ink_attack_children_v1%ROWTYPE;
  v_root ink_product_engine.ink_attack_roots_v1%ROWTYPE;
  v_recipient ink_product_engine.ink_members_v1%ROWTYPE;
  v_outcome text;
  v_protection uuid;
  v_old_effect uuid;
  v_old_expiry timestamptz;
  v_effect uuid;
  v_target_seq bigint;
  v_source_seq bigint;
BEGIN
  SELECT * INTO STRICT v_child FROM ink_product_engine.ink_attack_children_v1
    WHERE session_id=p_session AND child_id=p_child AND state='pending';
  SELECT * INTO STRICT v_root FROM ink_product_engine.ink_attack_roots_v1
    WHERE session_id=p_session AND root_id=v_child.root_id;
  IF EXISTS (SELECT 1 FROM ink_product_engine.ink_sessions_v1
               WHERE session_id=p_session AND lifecycle_state='finished')
     OR NOT EXISTS (SELECT 1 FROM ink_product_engine.ink_members_v1
       WHERE session_id=p_session AND participant_id=v_child.target_participant_id
         AND owner_epoch=v_child.target_epoch AND player_status='playing') THEN
    v_outcome := 'void_terminal';
  ELSE
    SELECT * INTO v_recipient FROM ink_product_engine.ink_members_v1
      WHERE session_id=p_session
        AND participant_id=(CASE WHEN p_reflect THEN v_root.source_participant_id ELSE v_child.target_participant_id END)
        AND owner_epoch=(CASE WHEN p_reflect THEN v_root.source_epoch ELSE v_child.target_epoch END)
        AND player_status='playing';
    IF NOT FOUND THEN
      v_outcome := 'void_source_terminal';
    ELSE
      SELECT right_id INTO v_protection FROM ink_product_engine.ink_rights_v1
        WHERE session_id=p_session AND owner_participant_id=v_recipient.participant_id
          AND owner_epoch=v_recipient.owner_epoch AND kind='protection' AND closed_at IS NULL
          AND remaining_charges=1 AND installed_at<=p_at AND p_at<expires_at;
      IF v_protection IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_protection,p_at,p_receipt,v_root.root_id);
        v_outcome := CASE WHEN p_reflect THEN 'reflection_blocked' ELSE 'blocked' END;
      ELSE
        v_effect := pg_catalog.gen_random_uuid();
        SELECT effect_id,expires_at INTO v_old_effect,v_old_expiry FROM ink_product_engine.ink_effects_v1
          WHERE session_id=p_session AND effect_id=v_recipient.current_ink_effect_id
            AND starts_at<=p_at AND p_at<expires_at;
        INSERT INTO ink_product_engine.ink_effects_v1
          (session_id,effect_id,child_id,recipient_participant_id,recipient_epoch,kind,tier,
           starts_at,expires_at,replaces_effect_id,created_receipt_id)
        VALUES (p_session,v_effect,p_child,v_recipient.participant_id,v_recipient.owner_epoch,'ink',
          (CASE WHEN p_reflect THEN coalesce(v_child.reflection_tier,v_root.effective_tier) ELSE v_root.effective_tier END),p_at,greatest(v_old_expiry,p_at+
            CASE (CASE WHEN p_reflect THEN coalesce(v_child.reflection_tier,v_root.effective_tier) ELSE v_root.effective_tier END) WHEN 'enhanced' THEN interval '9 seconds'
              WHEN 'weakened' THEN interval '3 seconds' ELSE interval '6 seconds' END),
          v_old_effect,p_receipt);
        UPDATE ink_product_engine.ink_members_v1 SET current_ink_effect_id=v_effect
          WHERE session_id=p_session AND participant_id=v_recipient.participant_id;
        v_outcome := CASE WHEN p_reflect THEN 'reflected' ELSE 'hit' END;
      END IF;
    END IF;
  END IF;
  v_target_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_child.target_participant_id);
  v_source_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_root.source_participant_id);
  UPDATE ink_product_engine.ink_attack_children_v1
    SET state='resolved', outcome=v_outcome, resolved_logical_at=p_at,
        resolution_receipt_id=p_receipt, target_result_event_seq=v_target_seq, source_result_event_seq=v_source_seq
    WHERE session_id=p_session AND child_id=p_child AND state='pending';
  RETURN v_outcome;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s2_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_fixture_id_v1(uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_fixture_id_v1(p_session uuid) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$ SELECT p_session NOT IN ('a3500000-0000-4000-9000-000000009801','a3500000-0000-4000-9000-000000009802','a3500000-0000-4000-9000-000000009701','a3500000-0000-4000-9000-000000009702') $$;


ALTER FUNCTION ink_product_engine.ink_s4_fixture_id_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_enabled_v1(uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_enabled_v1(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT FROM ink_product.rooms r WHERE r.session_id=p_session
    AND r.binding->>'rulesVersion'='ink-s5-test-v1'
    AND r.binding->>'catalogVersion'='ink-s5-test-v1'
    AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
$$;


ALTER FUNCTION ink_product_engine.ink_s5_enabled_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_enabled_v1(uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_enabled_v1(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM ink_product.rooms r JOIN ink_product.s5_phase2_policies_v1 p USING(binding) WHERE r.session_id=p_session AND r.binding->>'schemaVersion'='candidate-v3')$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_enabled_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: ink_grants_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_grants_v1 (
    session_id uuid NOT NULL,
    grant_id uuid NOT NULL,
    owner_participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    item_id text NOT NULL,
    base_tier text NOT NULL,
    slot_index smallint,
    granted_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    consumed_receipt_id uuid,
    source_round bigint,
    CONSTRAINT ink_grants_s4_round_scope_v1 CHECK ((ink_product_engine.ink_s4_fixture_id_v1(session_id) OR ((source_round IS NOT NULL) = (session_id IS NOT NULL)))),
    CONSTRAINT ink_grants_s5_item_gate CHECK (((item_id = ANY (ARRAY['ink'::text, 'parry'::text, 'shield'::text])) OR ((item_id = 'bookmark'::text) AND (source_round IS NOT NULL) AND (session_id IS NOT NULL)) OR (ink_product_engine.ink_s4_fixture_id_v1(session_id) AND (item_id = ANY (ARRAY['bookmark'::text, 'undo'::text, 'censor'::text, 'correction'::text, 'trap'::text]))) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (item_id = ANY (ARRAY['lost_link'::text, 'search'::text, 'link_index'::text, 'enhancement'::text, 'weakening'::text, 'thunder'::text, 'thief'::text, 'roulette'::text, 'cannon'::text]))))),
    CONSTRAINT ink_grants_s5_tier CHECK (((base_tier = 'normal'::text) OR (ink_product_engine.ink_s4_fixture_id_v1(session_id) AND (source_round IS NULL) AND (item_id = ANY (ARRAY['bookmark'::text, 'trap'::text])) AND (base_tier = ANY (ARRAY['enhanced'::text, 'weakened'::text]))) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (base_tier = ANY (ARRAY['enhanced'::text, 'weakened'::text]))))),
    CONSTRAINT ink_grants_v1_check CHECK ((isfinite(consumed_at) AND (consumed_at >= granted_at))),
    CONSTRAINT ink_grants_v1_check1 CHECK ((((consumed_at IS NULL) AND (slot_index IS NOT NULL) AND (slot_index = ANY (ARRAY[0, 1]))) OR ((consumed_at IS NOT NULL) AND (slot_index IS NULL)))),
    CONSTRAINT ink_grants_v1_check2 CHECK (((consumed_at IS NULL) = (consumed_receipt_id IS NULL))),
    CONSTRAINT ink_grants_v1_granted_at_check CHECK (isfinite(granted_at)),
    CONSTRAINT phase2_supply_round CHECK ((((source_round >= 0) AND (source_round <= 3)) OR (ink_product_engine.ink_s5_phase2_enabled_v1(session_id) AND ((source_round >= 0) AND (source_round <= 48)))))
);

ALTER TABLE ONLY ink_product_engine.ink_grants_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_grants_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s2_spend_grant_v1(ink_product_engine.ink_grants_v1, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s2_spend_grant_v1(p_grant ink_product_engine.ink_grants_v1, p_at timestamp with time zone, p_receipt uuid, p_root uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE ink_product_engine.ink_grants_v1
     SET consumed_at=p_at, consumed_receipt_id=p_receipt, slot_index=NULL
   WHERE session_id=p_grant.session_id AND grant_id=p_grant.grant_id AND consumed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'S2 grant was already spent'; END IF;
  INSERT INTO ink_product_engine.ink_consumptions_v1
    (session_id, consumption_id, receipt_id, root_id, grant_id, kind, unit_index, amount)
  VALUES (p_grant.session_id,pg_catalog.gen_random_uuid(),p_receipt,p_root,p_grant.grant_id,'grant',1,1);
  UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1
   WHERE session_id=p_grant.session_id AND participant_id=p_grant.owner_participant_id;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s2_spend_grant_v1(p_grant ink_product_engine.ink_grants_v1, p_at timestamp with time zone, p_receipt uuid, p_root uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s2_spend_right_v1(uuid, uuid, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s2_spend_right_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_kind text;
BEGIN
  UPDATE ink_product_engine.ink_rights_v1
     SET remaining_charges=0, closed_at=p_at, close_reason='consumed'
   WHERE session_id=p_session AND right_id=p_right AND closed_at IS NULL AND remaining_charges=1
     AND installed_at<=p_at AND (expires_at IS NULL OR p_at<expires_at)
  RETURNING kind INTO STRICT v_kind;
  INSERT INTO ink_product_engine.ink_consumptions_v1
    (session_id,consumption_id,receipt_id,root_id,right_id,kind,unit_index,amount)
  VALUES (p_session,pg_catalog.gen_random_uuid(),p_receipt,p_root,p_right,v_kind||'_charge',1,1);
  IF v_kind='protection' AND ink_product_engine.ink_s5_enabled_v1(p_session) THEN
    PERFORM ink_product_engine.ink_s5_shield_bonus_v1(p_session,p_right,p_at,p_receipt,p_root);
  END IF;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s2_spend_right_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s3_assert_supply_v1(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_assert_supply_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=p_session
      AND m.user_id=ink_product.request_actor_v1() AND m.member_role='player' AND m.player_status='playing'
      AND coalesce((SELECT max(r.closed_through_round) FROM ink_product_engine.ink_supply_rounds_v1 r
        WHERE r.session_id=p_session AND r.recipient_participant_id=m.participant_id AND r.recipient_epoch=m.owner_epoch),-1)
        < ink_product_engine.ink_s5_phase2_due_v1(p_session,p_started,p_at)
  ) THEN RAISE EXCEPTION 'NEED_SUPPLY_TICK'; END IF;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s3_assert_supply_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s3_binding_v1(); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_binding_v1() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT '{"namespace":"ink-s3-isolated","schemaVersion":"s3-test-v1","rulesVersion":"ink-s3-time-supply-test-v1","catalogVersion":"ink-four-fixture-v1","modePolicyVersion":"group-ink-s3-test-v1","policyDigest":"43d5c3dc047fddfbbf89023c49cb3f62883f338a7d7eaf1dc7acb6f985b17051"}'::jsonb $$;


ALTER FUNCTION ink_product_engine.ink_s3_binding_v1() OWNER TO ink_product_owner;

--
-- Name: ink_s3_direct_link_v1(text, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_direct_link_v1(p_from text, p_to text) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT CASE p_from
    WHEN 'forest' THEN p_to IN ('tree','ecosystem','goal')
    WHEN 'tree' THEN p_to IN ('forest','goal','ecosystem')
    WHEN 'ecosystem' THEN p_to IN ('forest','tree','goal')
    WHEN 'goal' THEN p_to IN ('tree','forest')
    ELSE false END
$$;


ALTER FUNCTION ink_product_engine.ink_s3_direct_link_v1(p_from text, p_to text) OWNER TO ink_product_owner;

--
-- Name: ink_s3_due_round_v1(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_due_round_v1(p_started timestamp with time zone, p_at timestamp with time zone) RETURNS bigint
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN p_at<p_started THEN -1
              WHEN p_at<p_started+interval '20 seconds' THEN 0
              ELSE least(3,1+pg_catalog.floor(extract(epoch FROM (p_at-p_started-interval '20 seconds'))/25)::bigint) END
$$;


ALTER FUNCTION ink_product_engine.ink_s3_due_round_v1(p_started timestamp with time zone, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s3_install_bookmark_v1(uuid, uuid, bigint, bigint, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_install_bookmark_v1(p_session uuid, p_grant uuid, p_expected_inventory bigint, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_grant ink_product_engine.ink_grants_v1%ROWTYPE;
  v_right uuid;
  v_event_seq bigint;
BEGIN
  v_session := ink_product_engine.ink_s3_lock_v1(p_session,p_authority_at);
  SELECT * INTO STRICT v_member FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
    AND user_id=ink_product.request_actor_v1() AND member_role='player' AND player_status='playing';
  PERFORM ink_product_engine.ink_s3_assert_supply_v1(p_session,v_session.started_at,p_authority_at);
  IF p_receipt IS NULL THEN RAISE EXCEPTION 'Missing S3 receipt context'; END IF;
  IF p_expected_inventory IS DISTINCT FROM v_member.inventory_version THEN
    RETURN pg_catalog.jsonb_build_object('code','STALE_INVENTORY');
  END IF;
  IF p_expected_progress IS DISTINCT FROM v_member.progress_version THEN
    RETURN pg_catalog.jsonb_build_object('code','STALE_PROGRESS');
  END IF;
  IF ((ink_product.course_document(p_session,v_member.current_page_id)).revision_id IS DISTINCT FROM v_member.current_revision_id) THEN
    RETURN pg_catalog.jsonb_build_object('code','UNSUPPORTED_DOCUMENT');
  END IF;
  SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_session AND grant_id=p_grant
    AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
    AND item_id='bookmark' AND base_tier='normal' AND consumed_at IS NULL;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('code','BOOKMARK_GRANT_NOT_OWNED'); END IF;

  -- Reuse the S2 once-only grant consumption and inventory version change.
  PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,p_authority_at,p_receipt,NULL);
  UPDATE ink_product_engine.ink_bookmark_rights_v1 SET closed_at=p_authority_at,close_reason='replaced'
    WHERE session_id=p_session AND actor_participant_id=v_member.participant_id
      AND actor_epoch=v_member.owner_epoch AND closed_at IS NULL;
  v_right := pg_catalog.gen_random_uuid();
  INSERT INTO ink_product_engine.ink_bookmark_rights_v1(
    session_id,right_id,actor_participant_id,actor_epoch,source_grant_id,installed_receipt_id,
    origin_page_id,origin_revision_id,remaining_moves,installed_at
  ) VALUES (p_session,v_right,v_member.participant_id,v_member.owner_epoch,p_grant,p_receipt,
    v_member.current_page_id,v_member.current_revision_id,5,p_authority_at);
  v_event_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
  RETURN pg_catalog.jsonb_build_object('code','BOOKMARK_INSTALLED','rightId',v_right,'eventSeq',v_event_seq::text);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s3_install_bookmark_v1(p_session uuid, p_grant uuid, p_expected_inventory bigint, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_sessions_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_sessions_v1 (
    session_id uuid NOT NULL,
    mode text NOT NULL,
    lifecycle_state text NOT NULL,
    schema_version text NOT NULL,
    rules_version text NOT NULL,
    catalog_version text NOT NULL,
    mode_policy_version text NOT NULL,
    policy_digest bytea NOT NULL,
    started_at timestamp with time zone,
    state_revision bigint NOT NULL,
    next_acceptance_seq bigint NOT NULL,
    test_only boolean NOT NULL,
    init_request_id uuid NOT NULL,
    init_fingerprint bytea NOT NULL,
    init_canonical_payload jsonb NOT NULL,
    CONSTRAINT ink_sessions_v1_catalog_version_check CHECK ((btrim(catalog_version) <> ''::text)),
    CONSTRAINT ink_sessions_v1_check CHECK (((lifecycle_state <> 'waiting'::text) OR (started_at IS NULL))),
    CONSTRAINT ink_sessions_v1_check1 CHECK (((lifecycle_state <> 'playing'::text) OR (started_at IS NOT NULL))),
    CONSTRAINT ink_sessions_v1_init_canonical_payload_check CHECK ((jsonb_typeof(init_canonical_payload) = 'object'::text)),
    CONSTRAINT ink_sessions_v1_init_fingerprint_check CHECK ((octet_length(init_fingerprint) = 32)),
    CONSTRAINT ink_sessions_v1_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['waiting'::text, 'playing'::text, 'finished'::text]))),
    CONSTRAINT ink_sessions_v1_mode_check CHECK ((mode = 'group_items'::text)),
    CONSTRAINT ink_sessions_v1_mode_policy_version_check CHECK ((btrim(mode_policy_version) <> ''::text)),
    CONSTRAINT ink_sessions_v1_next_acceptance_seq_check CHECK ((next_acceptance_seq >= 1)),
    CONSTRAINT ink_sessions_v1_policy_digest_check CHECK ((octet_length(policy_digest) = 32)),
    CONSTRAINT ink_sessions_v1_rules_version_check CHECK ((btrim(rules_version) <> ''::text)),
    CONSTRAINT ink_sessions_v1_schema_version_check CHECK ((btrim(schema_version) <> ''::text)),
    CONSTRAINT ink_sessions_v1_started_at_check CHECK (isfinite(started_at)),
    CONSTRAINT ink_sessions_v1_state_revision_check CHECK ((state_revision >= 0)),
    CONSTRAINT ink_sessions_v1_test_only_check CHECK ((NOT test_only))
);

ALTER TABLE ONLY ink_product_engine.ink_sessions_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_sessions_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s3_lock_v1(uuid, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_lock_v1(p_session uuid, p_authority_at timestamp with time zone) RETURNS ink_product_engine.ink_sessions_v1
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed'
      OR p_authority_at IS NULL OR NOT pg_catalog.isfinite(p_authority_at)
      OR p_authority_at>pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid S3 authority context';
  END IF;
  SELECT s.* INTO STRICT v_session FROM ink_product_engine.ink_sessions_v1 s
    JOIN ink_product_engine.ink_s3_sessions_v1 enabled USING(session_id)
    WHERE s.session_id=p_session AND NOT s.test_only AND s.mode='group_items' AND s.lifecycle_state='playing'
      AND s.schema_version='s3-test-v1' AND s.rules_version='ink-s3-time-supply-test-v1'
      AND s.catalog_version='ink-four-fixture-v1' AND s.mode_policy_version='group-ink-s3-test-v1'
      AND s.policy_digest=enabled.binding_digest
    FOR UPDATE OF s;
  IF v_session.started_at IS NULL OR p_authority_at<v_session.started_at
      OR EXISTS (SELECT 1 FROM ink_product_engine.ink_receipts_v1 WHERE session_id=p_session AND authority_received_at>p_authority_at) THEN
    RAISE EXCEPTION 'S3 authority time regression';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ink_product_engine.ink_attack_children_v1 c
    JOIN ink_product_engine.ink_attack_roots_v1 r USING(session_id,root_id)
    WHERE c.session_id=p_session AND c.state='pending' AND r.due_at<=p_authority_at
  ) THEN RAISE EXCEPTION 'NEED_SETTLEMENT'; END IF;
  RETURN v_session;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s3_lock_v1(p_session uuid, p_authority_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s3_move_v1(uuid, text, text, uuid, bigint, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_move_v1(p_session uuid, p_operation text, p_target_page text, p_right uuid, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_right ink_product_engine.ink_bookmark_rights_v1%ROWTYPE;
  v_page text;
  v_revision text;
  v_move uuid;
  v_event_seq bigint;
BEGIN
  v_session := ink_product_engine.ink_s3_lock_v1(p_session,p_authority_at);
  SELECT * INTO STRICT v_member FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
    AND user_id=ink_product.request_actor_v1() AND member_role='player' AND player_status='playing';
  PERFORM ink_product_engine.ink_s3_assert_supply_v1(p_session,v_session.started_at,p_authority_at);
  IF p_receipt IS NULL THEN RAISE EXCEPTION 'Missing S3 receipt context'; END IF;
  IF p_expected_progress IS DISTINCT FROM v_member.progress_version THEN
    RETURN pg_catalog.jsonb_build_object('code','STALE_PROGRESS');
  END IF;
  IF ((ink_product.course_document(p_session,v_member.current_page_id)).revision_id IS DISTINCT FROM v_member.current_revision_id) THEN
    RETURN pg_catalog.jsonb_build_object('code','UNSUPPORTED_DOCUMENT');
  END IF;

  IF p_operation='normal_link' AND p_right IS NULL THEN
    IF (p_target_page IN (SELECT ink_product.course_exits(p_session,v_member.current_page_id,v_member.current_revision_id))) IS NOT TRUE THEN
      RETURN pg_catalog.jsonb_build_object('code','NOT_A_DOCUMENT_LINK');
    END IF;
    v_page := p_target_page;
  ELSIF p_operation='bookmark_return' AND p_target_page IS NULL THEN
    SELECT * INTO v_right FROM ink_product_engine.ink_bookmark_rights_v1 WHERE session_id=p_session
      AND right_id=p_right AND actor_participant_id=v_member.participant_id
      AND actor_epoch=v_member.owner_epoch AND closed_at IS NULL;
    IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('code','BOOKMARK_RIGHT_NOT_OWNED'); END IF;
    -- Compare canonical IDs. The outer dispatcher saves this rejection receipt.
    IF v_right.origin_page_id=v_member.current_page_id THEN
      RETURN pg_catalog.jsonb_build_object('code','BOOKMARK_ALREADY_HERE','rightId',p_right);
    END IF;
    IF v_right.origin_revision_id IS DISTINCT FROM (ink_product.course_document(p_session,v_right.origin_page_id)).revision_id THEN
      RETURN pg_catalog.jsonb_build_object('code','UNSUPPORTED_DOCUMENT');
    END IF;
    v_page := v_right.origin_page_id;
  ELSE
    RETURN pg_catalog.jsonb_build_object('code','UNSUPPORTED_OPERATION');
  END IF;

  v_revision := (ink_product.course_document(p_session,v_page)).revision_id;
  IF v_revision IS NULL THEN RAISE EXCEPTION 'PRODUCT_SNAPSHOT_UNAVAILABLE'; END IF;
  v_move := pg_catalog.gen_random_uuid();
  INSERT INTO ink_product_engine.ink_moves_v1(
    session_id,move_id,actor_participant_id,actor_epoch,receipt_id,operation,bookmark_right_id,
    from_page_id,from_revision_id,to_page_id,to_revision_id,version_before,version_after,move_count_after,logical_at
  ) VALUES (p_session,v_move,v_member.participant_id,v_member.owner_epoch,p_receipt,p_operation,p_right,
    v_member.current_page_id,v_member.current_revision_id,v_page,v_revision,v_member.progress_version,
    v_member.progress_version+1,v_member.move_count+1,p_authority_at);

  UPDATE ink_product_engine.ink_members_v1 SET current_page_id=v_page,current_revision_id=v_revision,
    progress_version=progress_version+1,move_count=move_count+1,
    player_status=CASE WHEN ink_product.course_is_goal(p_session,v_page,v_revision) THEN 'finished' ELSE player_status END,
    finished_at=CASE WHEN ink_product.course_is_goal(p_session,v_page,v_revision) THEN p_authority_at ELSE finished_at END
    WHERE session_id=p_session AND participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch;

  IF p_operation='bookmark_return' THEN
    UPDATE ink_product_engine.ink_bookmark_rights_v1 SET closed_at=p_authority_at,close_reason='returned'
      WHERE session_id=p_session AND right_id=p_right AND closed_at IS NULL;
  ELSE
    -- The fifth accepted link leaves 0 moves but a live right. The sixth closes it.
    UPDATE ink_product_engine.ink_bookmark_rights_v1
      SET closed_at=CASE WHEN remaining_moves=0 THEN p_authority_at END,
          close_reason=CASE WHEN remaining_moves=0 THEN 'expired' END,
          remaining_moves=greatest(0,remaining_moves-1)
      WHERE session_id=p_session AND actor_participant_id=v_member.participant_id
        AND actor_epoch=v_member.owner_epoch AND closed_at IS NULL;
  END IF;
  v_event_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
  RETURN pg_catalog.jsonb_build_object('code','MOVED','moveId',v_move,'pageId',v_page,
    'revisionId',v_revision,'movementKind',CASE WHEN p_operation='normal_link' THEN 'normal' ELSE 'forced' END,
    'progressVersion',(v_member.progress_version+1)::text,'moveCount',v_member.move_count+1,'eventSeq',v_event_seq::text);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s3_move_v1(p_session uuid, p_operation text, p_target_page text, p_right uuid, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s3_pool_digest_v1(); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_pool_digest_v1() RETURNS bytea
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT pg_catalog.sha256(pg_catalog.convert_to('ink,parry,shield,bookmark,undo,censor,correction,trap','UTF8')) $$;


ALTER FUNCTION ink_product_engine.ink_s3_pool_digest_v1() OWNER TO ink_product_owner;

--
-- Name: ink_s3_record_v1(uuid, uuid, text, uuid, uuid, text, jsonb, timestamp with time zone, jsonb); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_record_v1(p_session uuid, p_receipt uuid, p_scope text, p_actor uuid, p_request uuid, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_reply jsonb) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  INSERT INTO ink_product_engine.ink_receipts_v1 (
    session_id,receipt_id,principal_scope,principal_id,request_id,operation,canonical_payload,
    payload_fingerprint,binding_digest,authority_received_at,outcome_code,private_response,committed_at
  ) VALUES (p_session,p_receipt,p_scope,p_actor,p_request,p_operation,p_payload,
    pg_catalog.sha256(pg_catalog.convert_to(p_payload::text,'UTF8')),
    pg_catalog.decode(ink_product_engine.ink_s3_binding_v1()->>'policyDigest','hex'),
    p_at,p_reply->>'code',p_reply,greatest(p_at,pg_catalog.clock_timestamp()))
$$;


ALTER FUNCTION ink_product_engine.ink_s3_record_v1(p_session uuid, p_receipt uuid, p_scope text, p_actor uuid, p_request uuid, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_reply jsonb) OWNER TO ink_product_owner;

--
-- Name: ink_s3_supply_latest_v1(uuid, uuid, timestamp with time zone, bigint, bigint[], bigint, text, bytea, bytea, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_supply_latest_v1(p_session uuid, p_recipient uuid, p_authority_at timestamp with time zone, p_through_round bigint, p_eligible_rounds bigint[], p_draw_round bigint, p_item text, p_pool_digest bytea, p_draw_commitment bytea, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_pool_digest bytea;
  v_last_closed bigint;
  v_round bigint;
  v_due timestamptz;
  v_slot smallint;
  v_grant uuid;
  v_outcome text;
  v_event_seq bigint;
BEGIN
  v_session := ink_product_engine.ink_s3_lock_v1(p_session,p_authority_at);
  SELECT * INTO STRICT v_member FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
    AND participant_id=p_recipient AND member_role='player' AND player_status='playing';
  SELECT pool_digest INTO STRICT v_pool_digest FROM ink_product_engine.ink_s3_sessions_v1 WHERE session_id=p_session;
  IF p_receipt IS NULL OR p_through_round IS NULL OR p_through_round<0
      OR p_through_round>ink_product_engine.ink_s5_phase2_due_v1(p_session,v_session.started_at,p_authority_at)
      OR p_pool_digest IS DISTINCT FROM v_pool_digest OR p_eligible_rounds IS NULL
      OR pg_catalog.cardinality(p_eligible_rounds)>256
      OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_eligible_rounds) AS t(n)
                   WHERE n IS NULL OR n<0 OR n>p_through_round) THEN
    RAISE EXCEPTION 'Invalid S3 supply authority';
  END IF;
  SELECT coalesce(max(closed_through_round),-1) INTO v_last_closed FROM ink_product_engine.ink_supply_rounds_v1
    WHERE session_id=p_session AND recipient_participant_id=p_recipient AND recipient_epoch=v_member.owner_epoch;
  IF p_through_round<=v_last_closed THEN
    RETURN pg_catalog.jsonb_build_object('code','ROUND_ALREADY_CLOSED');
  END IF;
  SELECT max(n) INTO v_round FROM pg_catalog.unnest(p_eligible_rounds) AS t(n) WHERE n>v_last_closed;
  IF v_round IS NULL THEN
    v_outcome := 'ineligible';
  ELSE
    v_due := CASE WHEN v_round=0 THEN v_session.started_at
      ELSE v_session.started_at+interval '20 seconds'+(v_round-1)*interval '25 seconds' END;
    SELECT slots.slot::smallint INTO v_slot FROM (VALUES (0),(1)) slots(slot)
      WHERE NOT EXISTS (
        SELECT 1 FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=p_session
          AND g.owner_participant_id=p_recipient AND g.owner_epoch=v_member.owner_epoch
          AND g.slot_index=slots.slot AND g.consumed_at IS NULL
      ) ORDER BY slots.slot LIMIT 1;
    IF v_slot IS NULL THEN
      v_outcome := 'discarded_full';
    ELSE
      IF p_draw_round IS DISTINCT FROM v_round OR p_item IS NULL
          OR (p_item NOT IN ('ink','parry','shield','bookmark','undo','censor','correction','trap') AND NOT
          (ink_product_engine.ink_s5_enabled_v1(p_session) AND p_item IN ('lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon')))
          OR pg_catalog.octet_length(p_draw_commitment) IS DISTINCT FROM 32 THEN
        RAISE EXCEPTION 'Missing trusted S3 draw for selected round';
      END IF;
      v_grant := pg_catalog.gen_random_uuid();
      INSERT INTO ink_product_engine.ink_grants_v1 (
        session_id,grant_id,owner_participant_id,owner_epoch,item_id,base_tier,slot_index,granted_at,source_round
      ) VALUES (p_session,v_grant,p_recipient,v_member.owner_epoch,p_item,'normal',v_slot,p_authority_at,v_round);
      UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1
        WHERE session_id=p_session AND participant_id=p_recipient AND owner_epoch=v_member.owner_epoch;
      v_outcome := 'granted';
    END IF;
    v_event_seq := ink_product_engine.ink_s2_next_event_v1(p_session,p_recipient);
  END IF;
  INSERT INTO ink_product_engine.ink_supply_rounds_v1 (
    session_id,recipient_participant_id,recipient_epoch,closed_through_round,selected_round,logical_due_at,
    decision_at,outcome,pool_digest,private_draw_commitment,selected_item_id,grant_id,receipt_id,event_seq
  ) VALUES (p_session,p_recipient,v_member.owner_epoch,p_through_round,v_round,v_due,p_authority_at,v_outcome,
    v_pool_digest,CASE WHEN v_grant IS NOT NULL THEN p_draw_commitment END,
    CASE WHEN v_grant IS NOT NULL THEN p_item END,v_grant,p_receipt,v_event_seq);
  RETURN pg_catalog.jsonb_build_object('code','SUPPLY_DECIDED','outcome',v_outcome,
    'round',v_round::text,'closedThroughRound',p_through_round::text,'logicalDueAt',v_due,
    'grantId',v_grant,'eventSeq',v_event_seq::text);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s3_supply_latest_v1(p_session uuid, p_recipient uuid, p_authority_at timestamp with time zone, p_through_round bigint, p_eligible_rounds bigint[], p_draw_round bigint, p_item text, p_pool_digest bytea, p_draw_commitment bytea, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s3_tick_v1(uuid, timestamp with time zone, uuid, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s3_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_config ink_product_engine.ink_s3_sessions_v1%ROWTYPE;
  v_member record;
  v_round bigint;
  v_draw bytea;
  v_item text;
  v_count integer := 0;
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1(p_session)THEN RETURN ink_product_engine.ink_s5_phase2_tick_v1(p_session,p_at,p_receipt,p_initial);END IF;
  v_session := ink_product_engine.ink_s3_lock_v1(p_session,p_at);
  v_round := ink_product_engine.ink_s3_due_round_v1(v_session.started_at,p_at);
  IF p_initial AND v_round<>0 THEN RAISE EXCEPTION 'S3 start must decide round zero'; END IF;
  SELECT * INTO STRICT v_config FROM ink_product_engine.ink_s3_sessions_v1 WHERE session_id=p_session;
  IF v_config.pool_digest IS DISTINCT FROM ink_product_engine.ink_s3_pool_digest_v1() THEN
    RAISE EXCEPTION 'Unexpected S3 pool';
  END IF;
  FOR v_member IN
    SELECT m.participant_id,m.owner_epoch FROM ink_product_engine.ink_members_v1 m
    LEFT JOIN ink_product_engine.ink_s3_presence_v1 p USING(session_id,participant_id,owner_epoch)
    WHERE m.session_id=p_session AND m.member_role='player' AND m.player_status='playing'
      AND (p_initial OR (p.observed_at<=p_at AND p_at<p.observed_at+interval '10 seconds'))
      AND NOT EXISTS (SELECT 1 FROM ink_product_engine.ink_supply_rounds_v1 d WHERE d.session_id=m.session_id
        AND d.recipient_participant_id=m.participant_id AND d.recipient_epoch=m.owner_epoch
        AND d.closed_through_round>=v_round)
    ORDER BY m.participant_id
  LOOP
    v_draw := NULL;
    v_item := NULL;
    IF (SELECT count(*) FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=p_session
      AND g.owner_participant_id=v_member.participant_id AND g.owner_epoch=v_member.owner_epoch
      AND g.consumed_at IS NULL)<2 THEN
      v_draw := pg_catalog.sha256(v_config.private_rng_seed || pg_catalog.convert_to(
        'wiki-ink-s3-supply-v1:'||p_session::text||':'||v_member.participant_id::text||':'||
        v_member.owner_epoch::text||':'||v_round::text,'UTF8'));
      v_item := ink_product.fixed_supply_draw_v1(p_session,v_member.participant_id,v_round,v_draw);
    END IF;
    PERFORM ink_product_engine.ink_s3_supply_latest_v1(p_session,v_member.participant_id,p_at,v_round,
      ARRAY[v_round],v_round,v_item,v_config.pool_digest,v_draw,p_receipt);
    v_count := v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s3_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean) OWNER TO ink_product_owner;

--
-- Name: ink_members_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_members_v1 (
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    member_role text NOT NULL,
    player_status text NOT NULL,
    inventory_version bigint NOT NULL,
    progress_version bigint NOT NULL,
    recipient_event_seq bigint NOT NULL,
    current_page_id text NOT NULL,
    current_revision_id text NOT NULL,
    move_count integer NOT NULL,
    finished_at timestamp with time zone,
    current_ink_effect_id uuid,
    CONSTRAINT ink_members_v1_check CHECK (((player_status = 'finished'::text) = (finished_at IS NOT NULL))),
    CONSTRAINT ink_members_v1_current_page_id_check CHECK ((btrim(current_page_id) <> ''::text)),
    CONSTRAINT ink_members_v1_current_revision_id_check CHECK ((btrim(current_revision_id) <> ''::text)),
    CONSTRAINT ink_members_v1_finished_at_check CHECK (isfinite(finished_at)),
    CONSTRAINT ink_members_v1_inventory_version_check CHECK ((inventory_version >= 0)),
    CONSTRAINT ink_members_v1_member_role_check CHECK ((member_role = ANY (ARRAY['player'::text, 'spectator'::text]))),
    CONSTRAINT ink_members_v1_move_count_check CHECK ((move_count >= 0)),
    CONSTRAINT ink_members_v1_owner_epoch_check CHECK ((owner_epoch > 0)),
    CONSTRAINT ink_members_v1_player_status_check CHECK ((player_status = ANY (ARRAY['waiting'::text, 'playing'::text, 'finished'::text, 'retired'::text]))),
    CONSTRAINT ink_members_v1_progress_version_check CHECK ((progress_version >= 0)),
    CONSTRAINT ink_members_v1_recipient_event_seq_check CHECK ((recipient_event_seq >= 0))
);

ALTER TABLE ONLY ink_product_engine.ink_members_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_members_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s4_apply_v1(uuid, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_apply_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN EXISTS (SELECT FROM ink_product.rooms r WHERE r.session_id=p_session
      AND r.binding->>'schemaVersion' IN ('candidate-v2','candidate-v3')
      AND r.binding->>'rulesVersion'='ink-s5-test-v1'
      AND r.binding->>'catalogVersion'='ink-s5-test-v1'
      AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
    THEN ink_product_engine.ink_s4_apply_v1_grant(p_session,p_member,p_operation,p_payload,p_at,p_receipt) ELSE ink_product_engine.ink_s4_apply_v1_legacy(p_session,p_member,p_operation,p_payload,p_at,p_receipt) END
$$;


ALTER FUNCTION ink_product_engine.ink_s4_apply_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_apply_v1_grant(uuid, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_apply_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE v_grant ink_product_engine.ink_grants_v1%ROWTYPE; v_item text; v_tier text; v_enhance uuid; v_weaken uuid;
  v_result jsonb; v_root uuid;
BEGIN
  IF jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
    OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$'
  THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT'); END IF;
  IF (p_payload->>'expectedInventoryVersion')::bigint IS DISTINCT FROM p_member.inventory_version THEN
    RETURN jsonb_build_object('accepted',false,'code','STALE_INVENTORY'); END IF;
  v_item := CASE p_operation WHEN 'bookmark_install' THEN 'bookmark' WHEN 'trap_options' THEN 'trap'
    WHEN 'trap_install' THEN 'trap' ELSE p_operation END;
  SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_session AND grant_id=(p_payload->>'grantId')::uuid
    AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch AND consumed_at IS NULL
    AND item_id=v_item;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','GRANT_NOT_AVAILABLE'); END IF;
  v_tier := v_grant.base_tier;
  IF p_operation<>'trap_options' THEN
    SELECT right_id INTO v_enhance FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
      AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch
      AND kind='enhancement' AND closed_at IS NULL AND remaining_charges=1 AND installed_at<=p_at AND (expires_at IS NULL OR p_at<expires_at);
    SELECT right_id INTO v_weaken FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
      AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch
      AND kind='weakening' AND closed_at IS NULL AND remaining_charges=1 AND installed_at<=p_at AND (expires_at IS NULL OR p_at<expires_at);
    IF (v_enhance IS NULL)<>(v_weaken IS NULL) THEN
      IF v_tier<>'normal' THEN RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_MODIFIER_TRANSITION'); END IF;
      v_tier := CASE WHEN v_enhance IS NOT NULL THEN 'enhanced' ELSE 'weakened' END;
    END IF;
  END IF;
  IF ink_product_engine.ink_s5_enabled_v1(p_session) THEN
    v_tier := ink_product_engine.ink_s5_grant_tier_v2(p_session,v_grant.grant_id,v_tier);
  END IF;
  CASE p_operation
    WHEN 'censor','correction' THEN v_result := ink_product_engine.ink_s4_attack_defense_v1(p_session,p_member,p_operation,p_payload,p_at,p_receipt,v_tier);
    WHEN 'bookmark_install','undo' THEN v_result := ink_product_engine.ink_s4_navigation_v1(p_session,p_member,p_operation,p_payload,p_at,p_receipt,v_tier);
    WHEN 'trap_options','trap_install' THEN v_result := ink_product_engine.ink_s4_trap_v1(p_session,p_member,p_operation,p_payload,p_at,p_receipt,v_tier);
    ELSE RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_OPERATION');
  END CASE;
  IF v_result->'accepted'='true'::jsonb AND p_operation<>'trap_options' THEN
    v_root := (v_result->>'rootId')::uuid;
    PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,p_at,p_receipt,v_root);
    IF v_enhance IS NOT NULL THEN PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_enhance,p_at,p_receipt,v_root); END IF;
    IF v_weaken IS NOT NULL THEN PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_weaken,p_at,p_receipt,v_root); END IF;
    IF p_operation='correction' AND v_tier='enhanced' AND v_result->>'code'='CORRECTION_APPLIED' THEN
      v_result := v_result || jsonb_build_object('bonus',
        ink_product_engine.ink_s5_defense_bonus_v1(p_member,p_receipt,p_at,p_receipt,'correction:bonus'),'s5TestOnly',true);
    END IF;
    v_result := v_result || jsonb_build_object('effectiveTier',v_tier);
  END IF;
  RETURN v_result;
END
$_$;


ALTER FUNCTION ink_product_engine.ink_s4_apply_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_apply_v1_legacy(uuid, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_apply_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE v_grant ink_product_engine.ink_grants_v1%ROWTYPE; v_item text; v_tier text; v_enhance uuid; v_weaken uuid;
  v_result jsonb; v_root uuid;
  v_s5_enhancement uuid; v_s5_weakening uuid;
BEGIN
  IF jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
    OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$'
  THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT'); END IF;
  IF (p_payload->>'expectedInventoryVersion')::bigint IS DISTINCT FROM p_member.inventory_version THEN
    RETURN jsonb_build_object('accepted',false,'code','STALE_INVENTORY'); END IF;
  v_item := CASE p_operation WHEN 'bookmark_install' THEN 'bookmark' WHEN 'trap_options' THEN 'trap'
    WHEN 'trap_install' THEN 'trap' ELSE p_operation END;
  SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_session AND grant_id=(p_payload->>'grantId')::uuid
    AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch AND consumed_at IS NULL
    AND item_id=v_item;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','GRANT_NOT_AVAILABLE'); END IF;
  v_tier := v_grant.base_tier;
  IF p_operation<>'trap_options' THEN
    SELECT right_id INTO v_enhance FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
      AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch
      AND kind='enhancement' AND closed_at IS NULL AND remaining_charges=1 AND installed_at<=p_at AND (expires_at IS NULL OR p_at<expires_at);
    SELECT right_id INTO v_weaken FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
      AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch
      AND kind='weakening' AND closed_at IS NULL AND remaining_charges=1 AND installed_at<=p_at AND (expires_at IS NULL OR p_at<expires_at);
    IF (v_enhance IS NULL)<>(v_weaken IS NULL) THEN
      IF v_tier<>'normal' THEN RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_MODIFIER_TRANSITION'); END IF;
      v_tier := CASE WHEN v_enhance IS NOT NULL THEN 'enhanced' ELSE 'weakened' END;
    END IF;
  END IF;
  IF p_operation<>'trap_options' AND ink_product_engine.ink_s5_enabled_v1(p_session) THEN
    v_s5_enhancement := ink_product_engine.ink_s5_modifier_id_v1(p_member,'enhancement',p_at);
    v_s5_weakening := ink_product_engine.ink_s5_modifier_id_v1(p_member,'weakening',p_at);
    v_tier := ink_product_engine.ink_s5_tier_v1(v_tier,v_s5_enhancement,v_s5_weakening);
    IF v_tier IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_MODIFIER_TRANSITION'); END IF;
  END IF;
  CASE p_operation
    WHEN 'censor','correction' THEN v_result := ink_product_engine.ink_s4_attack_defense_v1(p_session,p_member,p_operation,p_payload,p_at,p_receipt,v_tier);
    WHEN 'bookmark_install','undo' THEN v_result := ink_product_engine.ink_s4_navigation_v1(p_session,p_member,p_operation,p_payload,p_at,p_receipt,v_tier);
    WHEN 'trap_options','trap_install' THEN v_result := ink_product_engine.ink_s4_trap_v1(p_session,p_member,p_operation,p_payload,p_at,p_receipt,v_tier);
    ELSE RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_OPERATION');
  END CASE;
  IF v_result->'accepted'='true'::jsonb AND p_operation<>'trap_options' THEN
    v_root := (v_result->>'rootId')::uuid;
    PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,p_at,p_receipt,v_root);
    IF v_enhance IS NOT NULL THEN PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_enhance,p_at,p_receipt,v_root); END IF;
    IF v_weaken IS NOT NULL THEN PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_weaken,p_at,p_receipt,v_root); END IF;
    IF v_s5_enhancement IS NOT NULL OR v_s5_weakening IS NOT NULL THEN
      PERFORM ink_product_engine.ink_s5_debit_modifiers_v1(p_session,p_receipt,ARRAY[v_s5_enhancement,v_s5_weakening]);
    END IF;
    IF p_operation='correction' AND v_tier='enhanced' AND v_result->>'code'='CORRECTION_APPLIED' THEN
      v_result := v_result || jsonb_build_object('bonus',
        ink_product_engine.ink_s5_defense_bonus_v1(p_member,p_receipt,p_at,p_receipt,'correction:bonus'),'s5TestOnly',true);
    END IF;
    v_result := v_result || jsonb_build_object('effectiveTier',v_tier);
  END IF;
  RETURN v_result;
END
$_$;


ALTER FUNCTION ink_product_engine.ink_s4_apply_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_attack_defense_v1(uuid, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_attack_defense_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_target ink_product_engine.ink_members_v1%ROWTYPE;
  v_grant ink_product_engine.ink_grants_v1%ROWTYPE;
  v_grant_id uuid;
  v_effect_id uuid;
  v_effect_is_ink boolean;
  v_target_id uuid;
  v_root uuid;
  v_child uuid;
  v_due timestamptz;
  v_right uuid;
  v_seq bigint;
BEGIN
  IF p_session IS NULL OR NOT ink_product_engine.ink_s4_fixture_id_v1(p_session)
      OR p_at IS NULL OR NOT pg_catalog.isfinite(p_at) OR p_at>pg_catalog.clock_timestamp()
      OR p_receipt IS NULL OR (p_member).session_id IS DISTINCT FROM p_session THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_S4_CONTEXT');
  END IF;
  SELECT s.* INTO v_session FROM ink_product_engine.ink_sessions_v1 s
    WHERE s.session_id=p_session AND NOT s.test_only AND s.mode='group_items' AND s.lifecycle_state='playing'
      AND s.schema_version='s3-test-v1' AND s.started_at<=p_at FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('accepted',false,'code','SESSION_NOT_AVAILABLE'); END IF;
  SELECT m.* INTO v_member FROM ink_product_engine.ink_members_v1 m
    WHERE m.session_id=p_session AND m.participant_id=(p_member).participant_id AND m.owner_epoch=(p_member).owner_epoch
      AND m.user_id=ink_product.request_actor_v1() AND m.member_role='player' AND m.player_status='playing';
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('accepted',false,'code','PARTICIPANT_READ_ONLY'); END IF;
  IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string' THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_INPUT');
  END IF;
  BEGIN
    v_grant_id := (p_payload->>'grantId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_INPUT');
  END;
  SELECT g.* INTO v_grant FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=p_session
    AND g.grant_id=v_grant_id AND g.owner_participant_id=v_member.participant_id
    AND g.owner_epoch=v_member.owner_epoch AND g.consumed_at IS NULL AND (g.base_tier='normal' OR ink_product_engine.ink_s5_enabled_v1(p_session));
  IF NOT FOUND OR v_grant.item_id IS DISTINCT FROM p_operation THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','GRANT_NOT_OWNED');
  END IF;

  IF p_operation='censor' THEN
    IF p_tier IS NULL OR p_tier NOT IN ('normal','enhanced','weakened') THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_CENSOR_TIER');
    END IF;
    IF p_payload-ARRAY['grantId','expectedInventoryVersion','targetParticipantIds']<>'{}'::jsonb
        OR pg_catalog.jsonb_typeof(p_payload->'targetParticipantIds') IS DISTINCT FROM 'array' THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_TARGETS');
    END IF;
    IF pg_catalog.jsonb_array_length(p_payload->'targetParticipantIds')<>1
        OR pg_catalog.jsonb_typeof(p_payload#>'{targetParticipantIds,0}') IS DISTINCT FROM 'string' THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_CENSOR_TARGET_COUNT');
    END IF;
    BEGIN
      v_target_id := (p_payload#>>'{targetParticipantIds,0}')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_TARGETS');
    END;
    SELECT m.* INTO v_target FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=p_session
      AND m.participant_id=v_target_id AND m.participant_id<>v_member.participant_id
      AND m.member_role='player' AND m.player_status='playing';
    IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_TARGETS'); END IF;
    IF ((ink_product.course_document(p_session,v_target.current_page_id)).revision_id IS DISTINCT FROM v_target.current_revision_id) THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_CENSOR_DOCUMENT');
    END IF;
    v_root := pg_catalog.gen_random_uuid();
    v_child := pg_catalog.gen_random_uuid();
    v_due := p_at+ink_product_engine.ink_s5_warning_window_v1(p_session);
    INSERT INTO ink_product_engine.ink_attack_roots_v1(session_id,root_id,source_participant_id,source_epoch,grant_id,
      acceptance_seq,accepted_at,due_at,base_tier,effective_tier,acceptance_receipt_id)
    VALUES(p_session,v_root,v_member.participant_id,v_member.owner_epoch,v_grant_id,
      v_session.next_acceptance_seq,p_at,v_due,v_grant.base_tier,p_tier,p_receipt);
    UPDATE ink_product_engine.ink_sessions_v1 SET next_acceptance_seq=next_acceptance_seq+1 WHERE session_id=p_session;
    INSERT INTO ink_product_engine.ink_attack_children_v1(session_id,child_id,root_id,target_participant_id,target_epoch,state,warning_event_seq)
    VALUES(p_session,v_child,v_root,v_target.participant_id,v_target.owner_epoch,'pending',
      ink_product_engine.ink_s2_next_event_v1(p_session,v_target.participant_id));
    RETURN pg_catalog.jsonb_build_object('accepted',true,'code','ATTACK_ACCEPTED','rootId',v_root,'dueAt',v_due,
      'acceptanceSeq',v_session.next_acceptance_seq::text,'tier',p_tier,'itemId','censor',
      'children',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('childId',v_child,'targetParticipantId',v_target.participant_id)));
  ELSIF p_operation='correction' THEN
    IF p_tier IS DISTINCT FROM 'normal' AND NOT coalesce(
      ink_product_engine.ink_s5_enabled_v1(p_session) AND p_tier IN ('enhanced','weakened'),false) THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_CORRECTION_TIER');
    END IF;
    IF p_payload-ARRAY['grantId','expectedInventoryVersion']<>'{}'::jsonb THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_INPUT');
    END IF;
    SELECT active.effect_id,active.is_ink INTO v_effect_id,v_effect_is_ink
    FROM (
      SELECT e.effect_id,e.starts_at,false AS is_ink
      FROM ink_product_engine.ink_s4_effects_v1 e
      WHERE e.session_id=p_session
        AND e.participant_id=v_member.participant_id AND e.owner_epoch=v_member.owner_epoch
        AND e.starts_at<=p_at AND p_at<e.expires_at AND e.closed_at IS NULL
        AND e.kind IN ('stun','censor','thunder_seal')
        AND (e.progress_version IS NULL OR (e.progress_version,e.page_id,e.revision_id)=
            (v_member.progress_version,v_member.current_page_id,v_member.current_revision_id))
        AND (e.kind<>'thunder_seal' OR (e.payload->>'sealStartsAt')::timestamptz<=p_at)
      UNION ALL
      -- The current S2 ink effect follows its owner. Its ledger row has no document frame.
      SELECT e.effect_id,e.starts_at,true AS is_ink
      FROM ink_product_engine.ink_effects_v1 e
      WHERE e.session_id=p_session AND e.effect_id=v_member.current_ink_effect_id
        AND e.recipient_participant_id=v_member.participant_id AND e.recipient_epoch=v_member.owner_epoch
        AND e.kind='ink' AND e.starts_at<=p_at AND p_at<e.expires_at
    ) active
    ORDER BY active.starts_at DESC,active.effect_id DESC,active.is_ink DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','CORRECTION_EFFECT_NOT_AVAILABLE');
    END IF;
    IF EXISTS (SELECT 1 FROM ink_product_engine.ink_rights_v1 r WHERE r.session_id=p_session
      AND r.owner_participant_id=v_member.participant_id AND r.kind='protection' AND r.closed_at IS NULL
      AND (r.owner_epoch<>v_member.owner_epoch OR r.installed_at>p_at OR p_at<r.expires_at)) THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_CORRECTION_PROTECTION_OVERLAP');
    END IF;
    -- Q09 TEST_ONLY: the eligible but failed roll uses the item without granting protection.
    IF p_tier='weakened' AND ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'correction:weakened',100)>=60 THEN
      RETURN jsonb_build_object('accepted',true,'code','CORRECTION_CHANCE_FAILED','s5TestOnly',true);
    END IF;
    IF v_effect_is_ink THEN
      UPDATE ink_product_engine.ink_members_v1 SET current_ink_effect_id=NULL WHERE session_id=p_session
        AND participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch AND current_ink_effect_id=v_effect_id;
    ELSE
      UPDATE ink_product_engine.ink_s4_effects_v1 SET closed_at=p_at,closed_receipt_id=p_receipt
        WHERE session_id=p_session AND effect_id=v_effect_id AND participant_id=v_member.participant_id
          AND owner_epoch=v_member.owner_epoch AND closed_at IS NULL;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'S4 correction candidate changed under session lock'; END IF;
    IF NOT v_effect_is_ink AND ink_product_engine.ink_s5_enabled_v1(p_session) THEN
      PERFORM ink_product_engine.ink_s5_close_thunder_v1(p_session,(SELECT e FROM ink_product_engine.ink_s4_effects_v1 e
        WHERE e.session_id=p_session AND e.effect_id=v_effect_id),p_at,p_receipt);
    END IF;
    UPDATE ink_product_engine.ink_rights_v1 SET closed_at=expires_at,close_reason='expired' WHERE session_id=p_session
      AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
      AND kind='protection' AND closed_at IS NULL AND expires_at<=p_at;
    v_right := pg_catalog.gen_random_uuid();
    INSERT INTO ink_product_engine.ink_rights_v1(session_id,right_id,owner_participant_id,owner_epoch,kind,
      source_grant_id,right_version,installed_at,expires_at,remaining_charges)
    VALUES(p_session,v_right,v_member.participant_id,v_member.owner_epoch,'protection',
      v_grant_id,1,p_at,p_at+interval '1 second',1);
    v_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
    RETURN pg_catalog.jsonb_build_object('accepted',true,'code','CORRECTION_APPLIED','closedEffectId',v_effect_id,
      'protectionRightId',v_right,'protectionExpiresAt',p_at+interval '1 second','eventSeq',v_seq::text);
  END IF;
  RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_OPERATION');
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s4_attack_defense_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) OWNER TO ink_product_owner;

--
-- Name: ink_s4_censored_v1(uuid, ink_product_engine.ink_members_v1, text, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_censored_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM ink_product_engine.ink_s4_effects_v1 e
    WHERE ink_product_engine.ink_s4_fixture_id_v1(p_session)
      AND e.session_id=p_session AND (p_member).session_id=p_session
      AND e.participant_id=(p_member).participant_id AND e.owner_epoch=(p_member).owner_epoch AND e.kind='censor'
      AND e.progress_version=(p_member).progress_version AND e.page_id=(p_member).current_page_id
      AND e.revision_id=(p_member).current_revision_id
      AND e.starts_at<=p_at AND p_at<e.expires_at AND (e.closed_at IS NULL OR p_at<e.closed_at)
      AND CASE WHEN p_at<(e.payload->>'phase2At')::timestamptz OR e.payload->>'phase2At' IS NULL
        THEN (e.payload->'phase1') ? p_destination ELSE (e.payload->'phase2') ? p_destination END
  )
$$;


ALTER FUNCTION ink_product_engine.ink_s4_censored_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s4_client_binding_v1(); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_client_binding_v1() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT ink_product_engine.ink_s3_binding_v1() || jsonb_build_object('namespace','ink-s4-isolated',
  'catalogVersion','ink-s4-first-effects-test-v1',
  'policyDigest',encode(sha256(convert_to('s4-test-v2:20261109:fixed-forest:censor-shortage:correction-latest:bookmark-573:undo-head:trap-normal-weak:single-charge:receipt-s4','UTF8')),'hex')) $$;


ALTER FUNCTION ink_product_engine.ink_s4_client_binding_v1() OWNER TO ink_product_owner;

--
-- Name: ink_s4_dispatch_v1(uuid, uuid, jsonb, text, uuid, text, jsonb); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_dispatch_v1(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN EXISTS (SELECT FROM ink_product.rooms r WHERE r.session_id=p_session
      AND r.binding->>'schemaVersion' IN ('candidate-v2','candidate-v3')
      AND r.binding->>'rulesVersion'='ink-s5-test-v1'
      AND r.binding->>'catalogVersion'='ink-s5-test-v1'
      AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
    THEN ink_product_engine.ink_s4_dispatch_v1_grant(p_session,p_request,p_binding,p_scope,p_actor,p_operation,p_payload) ELSE ink_product_engine.ink_s4_dispatch_v1_legacy(p_session,p_request,p_binding,p_scope,p_actor,p_operation,p_payload) END
$$;


ALTER FUNCTION ink_product_engine.ink_s4_dispatch_v1(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) OWNER TO ink_product_owner;

--
-- Name: ink_s4_dispatch_v1_grant(uuid, uuid, jsonb, text, uuid, text, jsonb); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_dispatch_v1_grant(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_previous ink_product_engine.ink_receipts_v1%ROWTYPE;
  v_grant ink_product_engine.ink_grants_v1%ROWTYPE;
  v_child ink_product_engine.ink_attack_children_v1%ROWTYPE;
  v_payload jsonb;
  v_receipt uuid := p_request;
  v_now timestamptz;
  v_due_at timestamptz;
  v_item text;
  v_grant_id uuid;
  v_child_id uuid;
  v_targets uuid[];
  v_target uuid;
  v_target_epoch bigint;
  v_expected_inventory bigint;
  v_root uuid;
  v_enhancement uuid;
  v_weakening uuid;
  v_tier text;
  v_code text;
  v_s4_accepted boolean := false;
  v_trap text;
  v_detail jsonb := '{}'::jsonb;
  v_children jsonb := '[]'::jsonb;
  v_response jsonb;
  v_due record;
  v_closed_count integer := 0;
  v_revision bigint;
  v_supply_count integer := 0;
  v_progress bigint;
  v_requested_right uuid;
  v_due_at_input boolean;
  v_after_expiry boolean;
  v_prior_action text;
  v_order_code text;
BEGIN
  IF p_session IS NULL OR p_request IS NULL OR p_actor IS NULL
      OR p_scope IS NULL OR p_scope NOT IN ('player','worker') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE');
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_ISOLATION');
  END IF;

  SELECT s.* INTO v_session FROM ink_product_engine.ink_sessions_v1 s
    WHERE s.session_id=p_session AND ink_product_engine.ink_s4_matches_v1(s)
      AND (p_scope='worker' OR EXISTS (
        SELECT 1 FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=s.session_id
          AND m.user_id=p_actor AND m.member_role='player'))
    FOR UPDATE OF s;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE'); END IF;
  v_now := ink_product.dispatch_now_v1(p_session);
  IF p_binding IS DISTINCT FROM ink_product_engine.ink_s4_client_binding_v1() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','BINDING_MISMATCH');
  END IF;
  IF p_operation IS NULL OR pg_catalog.btrim(p_operation)='' OR pg_catalog.length(p_operation)>32 OR p_payload IS NULL
      OR pg_catalog.octet_length(p_payload::text)>8192 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_INPUT');
  END IF;

  v_payload := pg_catalog.jsonb_build_object('operation',p_operation,'payload',p_payload);
  SELECT * INTO v_previous FROM ink_product_engine.ink_receipts_v1
    WHERE session_id=p_session AND principal_scope=p_scope AND principal_id=p_actor AND request_id=p_request;
  IF FOUND THEN
    IF v_previous.canonical_payload IS DISTINCT FROM v_payload
      OR v_previous.payload_fingerprint IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(v_payload::text,'UTF8'))
      OR v_previous.binding_digest IS DISTINCT FROM v_session.policy_digest THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'code','REQUEST_PAYLOAD_CONFLICT');
    END IF;
    RETURN v_previous.private_response;
  END IF;
  IF NOT pg_catalog.isfinite(v_now) OR EXISTS (
    SELECT 1 FROM ink_product_engine.ink_receipts_v1 WHERE session_id=p_session AND authority_received_at>v_now
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','AUTHORITY_TIME_REGRESSION');
  END IF;

  IF (p_scope='player' AND p_operation NOT IN ('attack','parry','protect','resume','normal_link','bookmark_install','bookmark_return','censor','correction','undo','trap_options','trap_install','lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim','reward_claim','reward_discard'))
      OR (p_scope='worker' AND (p_operation<>'advance' OR p_payload<>'{}'::jsonb)) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_OPERATION');
  END IF;

  IF p_operation='resume' AND p_payload IS DISTINCT FROM '{}'::jsonb THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_INPUT');
  END IF;

  -- Use due_at for logical resolution even if the worker wakes late. Root order is immutable.
  FOR v_due IN
    SELECT c.child_id,r.due_at FROM ink_product_engine.ink_attack_children_v1 c
      JOIN ink_product_engine.ink_attack_roots_v1 r USING (session_id,root_id)
    WHERE c.session_id=p_session AND c.state='pending' AND r.due_at<=v_now
    ORDER BY r.due_at,r.acceptance_seq,c.target_participant_id
  LOOP
    PERFORM ink_product_engine.ink_s4_resolve_v1(p_session,v_due.child_id,v_due.due_at,false,v_receipt);
    v_closed_count := v_closed_count+1;
  END LOOP;

  PERFORM ink_product_engine.ink_s4_expire_traps_v1(p_session,v_now,v_receipt);

  -- Record the authenticated caller's presence only after identity, replay and due settlement.
  IF v_session.lifecycle_state='playing' THEN
    IF p_scope='player' THEN
      INSERT INTO ink_product_engine.ink_s3_presence_v1(session_id,participant_id,owner_epoch,observed_at)
      SELECT session_id,participant_id,owner_epoch,v_now FROM ink_product_engine.ink_members_v1
        WHERE session_id=p_session AND user_id=p_actor AND member_role='player' AND player_status='playing'
      ON CONFLICT (session_id,participant_id,owner_epoch) DO UPDATE SET observed_at=EXCLUDED.observed_at;
    END IF;
    v_supply_count := ink_product_engine.ink_s3_tick_v1(p_session,v_now,v_receipt,false);
  END IF;

  <<input>>
  BEGIN
    IF p_scope='worker' THEN
      v_code := 'ADVANCED';
      v_detail := pg_catalog.jsonb_build_object('settledCount',v_closed_count,'supplyDecisions',v_supply_count);
      EXIT input;
    END IF;
    SELECT * INTO STRICT v_member FROM ink_product_engine.ink_members_v1
      WHERE session_id=p_session AND user_id=p_actor AND member_role='player';
    IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END IF;

    -- P6 adds only the verified supply boundary to the existing post-expiry allowance.
    SELECT EXISTS (SELECT 1 FROM ink_product_engine.ink_attack_children_v1 c
      JOIN ink_product_engine.ink_attack_roots_v1 r USING(session_id,root_id)
      WHERE c.session_id=p_session AND r.due_at=v_now AND c.resolved_logical_at=v_now) INTO v_due_at_input;
    v_after_expiry := p_operation IN ('parry','protect') OR (
      p_operation IN ('attack','bookmark_install','bookmark_return') AND EXISTS (
        SELECT 1 FROM ink_product_engine.ink_supply_rounds_v1 d WHERE d.session_id=p_session
          AND d.selected_round>0 AND d.logical_due_at=v_now AND d.decision_at=v_now
      ));
    SELECT operation INTO v_prior_action FROM ink_product_engine.ink_receipts_v1
      WHERE session_id=p_session AND principal_scope='player' AND authority_received_at=v_now
        AND outcome_code IN ('ATTACK_ACCEPTED','PARRY_ACCEPTED','PARRY_FAILED','PROTECTION_ACTIVE',
          'PARRY_CLOSED','MOVED','BOOKMARK_INSTALLED','CORRECTION_APPLIED','TRAP_INSTALLED','TRAP_STOPPED')
      ORDER BY committed_at DESC,receipt_id DESC LIMIT 1;
    IF v_prior_action IS NOT NULL AND NOT (v_prior_action IN ('attack','censor') AND p_operation IN ('attack','censor'))
        AND NOT (v_due_at_input AND v_after_expiry) THEN
      v_order_code := 'UNSUPPORTED_SAME_TIMESTAMP_ORDER';
    ELSIF v_due_at_input AND NOT v_after_expiry THEN
      v_order_code := 'UNSUPPORTED_SAME_TIME_NEW_ACTION';
    END IF;

    IF p_operation NOT IN ('correction','resume') AND EXISTS (
      SELECT 1 FROM ink_product_engine.ink_s4_effects_v1 WHERE session_id=p_session AND participant_id=v_member.participant_id
      AND owner_epoch=v_member.owner_epoch AND kind='stun' AND closed_at IS NULL AND starts_at<=v_now AND v_now<expires_at
      AND (progress_version IS NULL OR (progress_version,page_id,revision_id)=
        (v_member.progress_version,v_member.current_page_id,v_member.current_revision_id))
    ) THEN v_code := 'STUNNED'; EXIT input; END IF;
    IF p_operation NOT IN ('normal_link','correction','resume','trap_options')
      AND ink_product_engine.ink_s5_enabled_v1(p_session) AND ink_product_engine.ink_s5_is_sealed_v1(v_member,v_now)
    THEN v_code := 'ITEM_SEALED'; EXIT input; END IF;
    IF p_operation IN('reward_claim','reward_discard')AND ink_product_engine.ink_s5_phase2_enabled_v1(p_session)THEN
      v_detail:=ink_product_engine.ink_s5_phase2_reward_v1(v_member,p_operation,p_payload,v_now,v_receipt);
      v_s4_accepted:=(v_detail->>'accepted')::boolean;v_code:=v_detail->>'code';v_detail:=v_detail-ARRAY['accepted','code'];EXIT input;END IF;
    IF p_operation IN ('lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN v_code := 'PARTICIPANT_READ_ONLY'; EXIT input; END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;
      BEGIN
        v_detail := ink_product_engine.ink_s5_apply_v1(v_member,p_operation,p_payload,v_now,v_receipt);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_s4_accepted := (v_detail->>'accepted')::boolean;
      v_code := v_detail->>'code'; v_detail := v_detail-ARRAY['accepted','code']; EXIT input;
    END IF;
    IF p_operation IN ('censor','correction','undo','trap_options','trap_install','bookmark_install') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN v_code := 'PARTICIPANT_READ_ONLY'; EXIT input; END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;
      BEGIN
        v_detail := ink_product_engine.ink_s4_apply_v1(p_session,v_member,p_operation,p_payload,v_now,v_receipt);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_s4_accepted := coalesce((v_detail->>'accepted')::boolean,false);
      v_code := v_detail->>'code'; v_detail := v_detail-ARRAY['accepted','code']; EXIT input;
    END IF;
    IF p_operation IN ('resume','normal_link','bookmark_return') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN
        v_code := 'PARTICIPANT_READ_ONLY'; EXIT input;
      END IF;
      IF p_operation='resume' THEN
        v_code := 'RESUMED';
        EXIT input;
      END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;

      -- A move names a candidate only. The authoritative current page and revision remain on the member row.
      IF pg_catalog.jsonb_typeof(p_payload->'expectedProgressVersion') IS DISTINCT FROM 'string'
        OR (p_payload->>'expectedProgressVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END IF;
      BEGIN
        v_progress := (p_payload->>'expectedProgressVersion')::bigint;
        IF p_operation='normal_link' THEN
          IF p_payload-ARRAY['expectedProgressVersion','expectedPageId','expectedRevisionId','targetPageId']<>'{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'expectedPageId') IS DISTINCT FROM 'string'
            OR pg_catalog.jsonb_typeof(p_payload->'expectedRevisionId') IS DISTINCT FROM 'string'
            OR pg_catalog.jsonb_typeof(p_payload->'targetPageId') IS DISTINCT FROM 'string' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          IF (p_payload->>'expectedPageId',p_payload->>'expectedRevisionId') IS DISTINCT FROM
             (v_member.current_page_id,v_member.current_revision_id) THEN
            v_code := 'STALE_DOCUMENT'; EXIT input;
          END IF;
          IF v_progress IS DISTINCT FROM v_member.progress_version THEN v_code := 'STALE_PROGRESS'; EXIT input; END IF;
          IF ((p_payload->>'targetPageId') IN (SELECT ink_product.course_exits(p_session,v_member.current_page_id,v_member.current_revision_id))) IS TRUE THEN
            IF ink_product_engine.ink_s5_trap_sealed_v1(p_session,v_member,p_payload->>'targetPageId',v_now) THEN
              v_code := 'TRAP_SEALED_LINK'; EXIT input;
            END IF;
            IF ink_product_engine.ink_s4_censored_v1(p_session,v_member,p_payload->>'targetPageId',v_now) THEN
              v_code := 'CENSORED_LINK'; EXIT input;
            END IF;
            v_trap := ink_product_engine.ink_s4_trap_hit_v1(p_session,v_member,p_payload->>'targetPageId',v_now,v_receipt);
            IF v_trap='sealed' THEN
              SELECT jsonb_build_object('trapOutcome','sealed','sealEffectId',e.effect_id) INTO STRICT v_detail
              FROM ink_product_engine.ink_s4_effects_v1 e
              WHERE e.session_id=p_session AND e.kind='trap_seal' AND e.opened_receipt_id=v_receipt;
              v_code := 'TRAP_STOPPED'; EXIT input;
            END IF;
            IF v_trap='stopped' THEN v_code := 'TRAP_STOPPED'; EXIT input; END IF;
          END IF;
          v_detail := ink_product_engine.ink_s3_move_v1(p_session,'normal_link',p_payload->>'targetPageId',NULL,
            v_progress,v_now,v_receipt);
          IF v_trap IN ('blocked','arrival') THEN
            IF v_detail->>'code'<>'MOVED' THEN RAISE EXCEPTION 'S4 trap movement must roll back'; END IF;
            v_detail := v_detail || jsonb_build_object('trapOutcome',v_trap);
            IF v_trap='arrival' THEN
              v_detail := v_detail || jsonb_build_object('stunEventSeq',ink_product_engine.ink_s4_trap_arrival_v1(p_session,v_member,v_now,v_receipt)::text);
            END IF;
          END IF;
        ELSIF p_operation='bookmark_return' THEN
          IF p_payload-ARRAY['expectedProgressVersion','rightId']<>'{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'rightId') IS DISTINCT FROM 'string' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          v_requested_right := (p_payload->>'rightId')::uuid;
          v_detail := ink_product_engine.ink_s3_move_v1(p_session,'bookmark_return',NULL,v_requested_right,
            v_progress,v_now,v_receipt);
        END IF;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_code := v_detail->>'code';
      v_detail := v_detail-'code';
      EXIT input;
    END IF;

    -- Version-scoped combat admission mirrors S2 and shares settlement and debit helpers.
    IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string' THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END IF;
    BEGIN
      v_grant_id := (p_payload->>'grantId')::uuid;
      IF p_operation='parry' THEN
        IF p_payload - ARRAY['grantId','childId'] <> '{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'childId') IS DISTINCT FROM 'string' THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
        v_child_id := (p_payload->>'childId')::uuid;
      ELSE
        IF pg_catalog.jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
            OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
        v_expected_inventory := (p_payload->>'expectedInventoryVersion')::bigint;
        IF p_operation='attack' THEN
          IF p_payload - ARRAY['grantId','expectedInventoryVersion','targetParticipantIds'] <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(p_payload->'targetParticipantIds') IS DISTINCT FROM 'array' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          IF pg_catalog.jsonb_array_length(p_payload->'targetParticipantIds') NOT BETWEEN 1 AND 2
             OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_payload->'targetParticipantIds') AS e(value)
                         WHERE pg_catalog.jsonb_typeof(e.value) <> 'string') THEN
            v_code := 'INVALID_TARGETS'; EXIT input;
          END IF;
          SELECT pg_catalog.array_agg(value::uuid ORDER BY position) INTO v_targets
            FROM pg_catalog.jsonb_array_elements_text(p_payload->'targetParticipantIds') WITH ORDINALITY AS e(value,position);
        ELSIF p_payload - ARRAY['grantId','expectedInventoryVersion'] <> '{}'::jsonb THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END;

    IF p_operation='parry' THEN
      SELECT c.* INTO v_child FROM ink_product_engine.ink_attack_children_v1 c
        WHERE c.session_id=p_session AND c.child_id=v_child_id
          AND c.target_participant_id=v_member.participant_id AND c.target_epoch=v_member.owner_epoch;
      IF NOT FOUND THEN v_code := 'WARNING_NOT_OWNED'; EXIT input; END IF;
      IF v_child.state<>'pending' THEN v_code := 'PARRY_CLOSED'; EXIT input; END IF;
      IF v_child.parry_attempt_receipt_id IS NOT NULL THEN v_code := 'PARRY_ALREADY_ATTEMPTED'; EXIT input; END IF;
    END IF;
    IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN
      v_code := 'PARTICIPANT_READ_ONLY'; EXIT input;
    END IF;

    IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;

    IF p_operation<>'parry' AND v_member.inventory_version<>v_expected_inventory THEN
      v_code := 'STALE_INVENTORY'; EXIT input;
    END IF;
    v_item := CASE p_operation WHEN 'attack' THEN 'ink' WHEN 'parry' THEN 'parry' ELSE 'shield' END;
    SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1
      WHERE session_id=p_session AND grant_id=v_grant_id AND owner_participant_id=v_member.participant_id
        AND owner_epoch=v_member.owner_epoch AND consumed_at IS NULL;
    IF NOT FOUND THEN v_code := 'GRANT_NOT_OWNED'; EXIT input; END IF;
    IF v_grant.item_id<>v_item THEN v_code := 'WRONG_ITEM_KIND'; EXIT input; END IF;

    IF p_operation IN ('parry','protect') AND ink_product_engine.ink_s5_enabled_v1(p_session) THEN
      v_tier := ink_product_engine.ink_s5_grant_tier_v2(p_session,v_grant.grant_id,v_grant.base_tier);
      IF p_operation='parry' AND v_tier='enhanced' AND NOT EXISTS (
        SELECT FROM ink_product_engine.ink_attack_roots_v1 root
        JOIN ink_product_engine.ink_grants_v1 g USING(session_id,grant_id)
        WHERE (root.session_id,root.root_id)=(p_session,v_child.root_id) AND g.item_id IN ('ink','censor','thunder')
      ) THEN v_code := 'S5_REFLECTION_TIER_UNAVAILABLE'; EXIT input; END IF;
    END IF;
    IF p_operation='attack' THEN
      IF (SELECT count(DISTINCT target) FROM pg_catalog.unnest(v_targets) AS a(target)) <> pg_catalog.cardinality(v_targets)
         OR v_member.participant_id=ANY(v_targets)
         OR (SELECT count(*) FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
             AND participant_id=ANY(v_targets) AND member_role='player' AND player_status='playing') <> pg_catalog.cardinality(v_targets) THEN
        v_code := 'INVALID_TARGETS'; EXIT input;
      END IF;

      SELECT right_id INTO v_enhancement FROM ink_product_engine.ink_rights_v1
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
          AND kind='enhancement' AND closed_at IS NULL AND installed_at<=v_now AND remaining_charges=1;
      SELECT right_id INTO v_weakening FROM ink_product_engine.ink_rights_v1
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
          AND kind='weakening' AND closed_at IS NULL AND installed_at<=v_now AND remaining_charges=1;
      v_tier := CASE WHEN v_enhancement IS NOT NULL AND v_weakening IS NULL THEN 'enhanced'
                     WHEN v_weakening IS NOT NULL AND v_enhancement IS NULL THEN 'weakened'
                     ELSE v_grant.base_tier END;
      IF ink_product_engine.ink_s5_enabled_v1(p_session) THEN
        v_tier := ink_product_engine.ink_s5_grant_tier_v2(p_session,v_grant.grant_id,v_tier);
      END IF;
      v_root := pg_catalog.gen_random_uuid();
      v_due_at := v_now+ink_product_engine.ink_s5_warning_window_v1(p_session);
      INSERT INTO ink_product_engine.ink_attack_roots_v1 (
        session_id,root_id,source_participant_id,source_epoch,grant_id,acceptance_seq,
        accepted_at,due_at,base_tier,effective_tier,acceptance_receipt_id
      ) VALUES (p_session,v_root,v_member.participant_id,v_member.owner_epoch,v_grant_id,
        v_session.next_acceptance_seq,v_now,v_due_at,v_grant.base_tier,v_tier,v_receipt);
      UPDATE ink_product_engine.ink_sessions_v1 SET next_acceptance_seq=next_acceptance_seq+1 WHERE session_id=p_session;
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,v_root);
      IF v_enhancement IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_enhancement,v_now,v_receipt,v_root);
      END IF;
      IF v_weakening IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_weakening,v_now,v_receipt,v_root);
      END IF;
      FOREACH v_target IN ARRAY v_targets LOOP
        SELECT owner_epoch INTO STRICT v_target_epoch FROM ink_product_engine.ink_members_v1
          WHERE session_id=p_session AND participant_id=v_target;
        v_child_id := pg_catalog.gen_random_uuid();
        INSERT INTO ink_product_engine.ink_attack_children_v1
          (session_id,child_id,root_id,target_participant_id,target_epoch,state,warning_event_seq)
        VALUES (p_session,v_child_id,v_root,v_target,v_target_epoch,'pending',
          ink_product_engine.ink_s2_next_event_v1(p_session,v_target));
        v_children := v_children || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'childId',v_child_id,'targetParticipantId',v_target));
      END LOOP;
      v_code := 'ATTACK_ACCEPTED';
      v_detail := pg_catalog.jsonb_build_object('rootId',v_root,'children',v_children,'dueAt',v_due_at,
        'acceptanceSeq',v_session.next_acceptance_seq::text,'tier',v_tier);
    ELSIF p_operation='parry' THEN
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,v_child.root_id);
      UPDATE ink_product_engine.ink_attack_children_v1 SET parry_attempt_receipt_id=v_receipt,
        reflection_tier=CASE WHEN v_tier='enhanced' THEN 'enhanced' END
        WHERE session_id=p_session AND child_id=v_child_id;
      v_detail := pg_catalog.jsonb_build_object('childId',v_child_id);
      IF v_tier='weakened' THEN
        PERFORM ink_product_engine.ink_s5_parry_block_v1(p_session,v_child,v_now,v_receipt);
        v_code := 'PARRY_ACCEPTED';
        v_detail := v_detail || jsonb_build_object('outcome','blocked','effectiveTier','weakened');
      ELSIF v_session.init_canonical_payload->>'variant'='parry_failure' THEN
        PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
        v_code := 'PARRY_FAILED';
      ELSE
        v_code := 'PARRY_ACCEPTED';
        v_detail := v_detail || pg_catalog.jsonb_build_object('outcome',
          ink_product_engine.ink_s4_resolve_v1(p_session,v_child_id,v_now,true,v_receipt));
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
        AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
        AND kind='protection' AND closed_at IS NULL AND remaining_charges=1 AND v_now<expires_at) THEN
        v_code := 'UNSUPPORTED_PROTECTION_REPLACEMENT'; EXIT input;
      END IF;
      UPDATE ink_product_engine.ink_rights_v1 SET closed_at=expires_at,close_reason='expired'
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id
          AND kind='protection' AND closed_at IS NULL AND expires_at<=v_now;
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,NULL);
      INSERT INTO ink_product_engine.ink_rights_v1 (session_id,right_id,owner_participant_id,owner_epoch,kind,
        source_grant_id,right_version,installed_at,expires_at,remaining_charges)
      VALUES (p_session,pg_catalog.gen_random_uuid(),v_member.participant_id,v_member.owner_epoch,'protection',
        v_grant_id,1,v_now,CASE WHEN v_tier='enhanced' THEN 'infinity'::timestamptz
        ELSE v_now+CASE WHEN v_tier='weakened' THEN interval '4 seconds' ELSE interval '8 seconds' END END,1);
      v_code := 'PROTECTION_ACTIVE';
    END IF;
  END input;

  UPDATE ink_product_engine.ink_sessions_v1 SET state_revision=state_revision+1
    WHERE session_id=p_session RETURNING state_revision INTO STRICT v_revision;
  v_response := pg_catalog.jsonb_build_object(
    'ok',v_s4_accepted OR v_code IN ('ATTACK_ACCEPTED','PARRY_ACCEPTED','PARRY_FAILED','PROTECTION_ACTIVE','ADVANCED','RESUMED','MOVED','BOOKMARK_INSTALLED'),
    'code',v_code,'operation',p_operation,'requestId',p_request,'receiptId',v_receipt,
    'authorityReceivedAt',v_now,'stateRevision',v_revision::text) || v_detail;
  PERFORM ink_product_engine.ink_s3_record_v1(p_session,v_receipt,p_scope,p_actor,p_request,p_operation,v_payload,v_now,v_response);
  RETURN v_response;
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s4_dispatch_v1_grant(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) OWNER TO ink_product_owner;

--
-- Name: ink_s4_dispatch_v1_legacy(uuid, uuid, jsonb, text, uuid, text, jsonb); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_dispatch_v1_legacy(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_previous ink_product_engine.ink_receipts_v1%ROWTYPE;
  v_grant ink_product_engine.ink_grants_v1%ROWTYPE;
  v_child ink_product_engine.ink_attack_children_v1%ROWTYPE;
  v_payload jsonb;
  v_receipt uuid := p_request;
  v_now timestamptz;
  v_due_at timestamptz;
  v_item text;
  v_grant_id uuid;
  v_child_id uuid;
  v_targets uuid[];
  v_target uuid;
  v_target_epoch bigint;
  v_expected_inventory bigint;
  v_root uuid;
  v_enhancement uuid;
  v_weakening uuid;
  v_tier text;
  v_code text;
  v_s4_accepted boolean := false;
  v_trap text;
  v_detail jsonb := '{}'::jsonb;
  v_children jsonb := '[]'::jsonb;
  v_response jsonb;
  v_due record;
  v_closed_count integer := 0;
  v_revision bigint;
  v_supply_count integer := 0;
  v_progress bigint;
  v_requested_right uuid;
  v_due_at_input boolean;
  v_after_expiry boolean;
  v_prior_action text;
  v_order_code text;
  v_s5_enhancement uuid;
  v_s5_weakening uuid;
BEGIN
  IF p_session IS NULL OR p_request IS NULL OR p_actor IS NULL
      OR p_scope IS NULL OR p_scope NOT IN ('player','worker') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE');
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_ISOLATION');
  END IF;

  SELECT s.* INTO v_session FROM ink_product_engine.ink_sessions_v1 s
    WHERE s.session_id=p_session AND ink_product_engine.ink_s4_matches_v1(s)
      AND (p_scope='worker' OR EXISTS (
        SELECT 1 FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=s.session_id
          AND m.user_id=p_actor AND m.member_role='player'))
    FOR UPDATE OF s;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE'); END IF;
  v_now := pg_catalog.clock_timestamp();
  IF p_binding IS DISTINCT FROM ink_product_engine.ink_s4_client_binding_v1() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','BINDING_MISMATCH');
  END IF;
  IF p_operation IS NULL OR pg_catalog.btrim(p_operation)='' OR pg_catalog.length(p_operation)>32 OR p_payload IS NULL
      OR pg_catalog.octet_length(p_payload::text)>8192 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_INPUT');
  END IF;

  v_payload := pg_catalog.jsonb_build_object('operation',p_operation,'payload',p_payload);
  SELECT * INTO v_previous FROM ink_product_engine.ink_receipts_v1
    WHERE session_id=p_session AND principal_scope=p_scope AND principal_id=p_actor AND request_id=p_request;
  IF FOUND THEN
    IF v_previous.canonical_payload IS DISTINCT FROM v_payload
      OR v_previous.payload_fingerprint IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(v_payload::text,'UTF8'))
      OR v_previous.binding_digest IS DISTINCT FROM v_session.policy_digest THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'code','REQUEST_PAYLOAD_CONFLICT');
    END IF;
    RETURN v_previous.private_response;
  END IF;
  IF NOT pg_catalog.isfinite(v_now) OR EXISTS (
    SELECT 1 FROM ink_product_engine.ink_receipts_v1 WHERE session_id=p_session AND authority_received_at>v_now
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','AUTHORITY_TIME_REGRESSION');
  END IF;

  IF (p_scope='player' AND p_operation NOT IN ('attack','parry','protect','resume','normal_link','bookmark_install','bookmark_return','censor','correction','undo','trap_options','trap_install','lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim'))
      OR (p_scope='worker' AND (p_operation<>'advance' OR p_payload<>'{}'::jsonb)) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_OPERATION');
  END IF;

  IF p_operation='resume' AND p_payload IS DISTINCT FROM '{}'::jsonb THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_INPUT');
  END IF;

  -- Use due_at for logical resolution even if the worker wakes late. Root order is immutable.
  FOR v_due IN
    SELECT c.child_id,r.due_at FROM ink_product_engine.ink_attack_children_v1 c
      JOIN ink_product_engine.ink_attack_roots_v1 r USING (session_id,root_id)
    WHERE c.session_id=p_session AND c.state='pending' AND r.due_at<=v_now
    ORDER BY r.due_at,r.acceptance_seq,c.target_participant_id
  LOOP
    PERFORM ink_product_engine.ink_s4_resolve_v1(p_session,v_due.child_id,v_due.due_at,false,v_receipt);
    v_closed_count := v_closed_count+1;
  END LOOP;

  PERFORM ink_product_engine.ink_s4_expire_traps_v1(p_session,v_now,v_receipt);

  -- Record the authenticated caller's presence only after identity, replay and due settlement.
  IF v_session.lifecycle_state='playing' THEN
    IF p_scope='player' THEN
      INSERT INTO ink_product_engine.ink_s3_presence_v1(session_id,participant_id,owner_epoch,observed_at)
      SELECT session_id,participant_id,owner_epoch,v_now FROM ink_product_engine.ink_members_v1
        WHERE session_id=p_session AND user_id=p_actor AND member_role='player' AND player_status='playing'
      ON CONFLICT (session_id,participant_id,owner_epoch) DO UPDATE SET observed_at=EXCLUDED.observed_at;
    END IF;
    v_supply_count := ink_product_engine.ink_s3_tick_v1(p_session,v_now,v_receipt,false);
  END IF;

  <<input>>
  BEGIN
    IF p_scope='worker' THEN
      v_code := 'ADVANCED';
      v_detail := pg_catalog.jsonb_build_object('settledCount',v_closed_count,'supplyDecisions',v_supply_count);
      EXIT input;
    END IF;
    SELECT * INTO STRICT v_member FROM ink_product_engine.ink_members_v1
      WHERE session_id=p_session AND user_id=p_actor AND member_role='player';
    IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END IF;

    -- P6 adds only the verified supply boundary to the existing post-expiry allowance.
    SELECT EXISTS (SELECT 1 FROM ink_product_engine.ink_attack_children_v1 c
      JOIN ink_product_engine.ink_attack_roots_v1 r USING(session_id,root_id)
      WHERE c.session_id=p_session AND r.due_at=v_now AND c.resolved_logical_at=v_now) INTO v_due_at_input;
    v_after_expiry := p_operation IN ('parry','protect') OR (
      p_operation IN ('attack','bookmark_install','bookmark_return') AND EXISTS (
        SELECT 1 FROM ink_product_engine.ink_supply_rounds_v1 d WHERE d.session_id=p_session
          AND d.selected_round>0 AND d.logical_due_at=v_now AND d.decision_at=v_now
      ));
    SELECT operation INTO v_prior_action FROM ink_product_engine.ink_receipts_v1
      WHERE session_id=p_session AND principal_scope='player' AND authority_received_at=v_now
        AND outcome_code IN ('ATTACK_ACCEPTED','PARRY_ACCEPTED','PARRY_FAILED','PROTECTION_ACTIVE',
          'PARRY_CLOSED','MOVED','BOOKMARK_INSTALLED','CORRECTION_APPLIED','TRAP_INSTALLED','TRAP_STOPPED')
      ORDER BY committed_at DESC,receipt_id DESC LIMIT 1;
    IF v_prior_action IS NOT NULL AND NOT (v_prior_action IN ('attack','censor') AND p_operation IN ('attack','censor'))
        AND NOT (v_due_at_input AND v_after_expiry) THEN
      v_order_code := 'UNSUPPORTED_SAME_TIMESTAMP_ORDER';
    ELSIF v_due_at_input AND NOT v_after_expiry THEN
      v_order_code := 'UNSUPPORTED_SAME_TIME_NEW_ACTION';
    END IF;

    IF p_operation NOT IN ('correction','resume') AND EXISTS (
      SELECT 1 FROM ink_product_engine.ink_s4_effects_v1 WHERE session_id=p_session AND participant_id=v_member.participant_id
      AND owner_epoch=v_member.owner_epoch AND kind='stun' AND closed_at IS NULL AND starts_at<=v_now AND v_now<expires_at
      AND (progress_version IS NULL OR (progress_version,page_id,revision_id)=
        (v_member.progress_version,v_member.current_page_id,v_member.current_revision_id))
    ) THEN v_code := 'STUNNED'; EXIT input; END IF;
    IF p_operation NOT IN ('normal_link','correction','resume','trap_options')
      AND ink_product_engine.ink_s5_enabled_v1(p_session) AND ink_product_engine.ink_s5_is_sealed_v1(v_member,v_now)
    THEN v_code := 'ITEM_SEALED'; EXIT input; END IF;
    IF p_operation IN ('lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN v_code := 'PARTICIPANT_READ_ONLY'; EXIT input; END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;
      BEGIN
        v_detail := ink_product_engine.ink_s5_apply_v1(v_member,p_operation,p_payload,v_now,v_receipt);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_s4_accepted := (v_detail->>'accepted')::boolean;
      v_code := v_detail->>'code'; v_detail := v_detail-ARRAY['accepted','code']; EXIT input;
    END IF;
    IF p_operation IN ('censor','correction','undo','trap_options','trap_install','bookmark_install') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN v_code := 'PARTICIPANT_READ_ONLY'; EXIT input; END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;
      BEGIN
        v_detail := ink_product_engine.ink_s4_apply_v1(p_session,v_member,p_operation,p_payload,v_now,v_receipt);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_s4_accepted := coalesce((v_detail->>'accepted')::boolean,false);
      v_code := v_detail->>'code'; v_detail := v_detail-ARRAY['accepted','code']; EXIT input;
    END IF;
    IF p_operation IN ('resume','normal_link','bookmark_return') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN
        v_code := 'PARTICIPANT_READ_ONLY'; EXIT input;
      END IF;
      IF p_operation='resume' THEN
        v_code := 'RESUMED';
        EXIT input;
      END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;

      -- A move names a candidate only. The authoritative current page and revision remain on the member row.
      IF pg_catalog.jsonb_typeof(p_payload->'expectedProgressVersion') IS DISTINCT FROM 'string'
        OR (p_payload->>'expectedProgressVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END IF;
      BEGIN
        v_progress := (p_payload->>'expectedProgressVersion')::bigint;
        IF p_operation='normal_link' THEN
          IF p_payload-ARRAY['expectedProgressVersion','expectedPageId','expectedRevisionId','targetPageId']<>'{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'expectedPageId') IS DISTINCT FROM 'string'
            OR pg_catalog.jsonb_typeof(p_payload->'expectedRevisionId') IS DISTINCT FROM 'string'
            OR pg_catalog.jsonb_typeof(p_payload->'targetPageId') IS DISTINCT FROM 'string' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          IF (p_payload->>'expectedPageId',p_payload->>'expectedRevisionId') IS DISTINCT FROM
             (v_member.current_page_id,v_member.current_revision_id) THEN
            v_code := 'STALE_DOCUMENT'; EXIT input;
          END IF;
          IF v_progress IS DISTINCT FROM v_member.progress_version THEN v_code := 'STALE_PROGRESS'; EXIT input; END IF;
          IF ((p_payload->>'targetPageId') IN (SELECT ink_product.course_exits(p_session,v_member.current_page_id,v_member.current_revision_id))) IS TRUE THEN
            IF ink_product_engine.ink_s5_trap_sealed_v1(p_session,v_member,p_payload->>'targetPageId',v_now) THEN
              v_code := 'TRAP_SEALED_LINK'; EXIT input;
            END IF;
            IF ink_product_engine.ink_s4_censored_v1(p_session,v_member,p_payload->>'targetPageId',v_now) THEN
              v_code := 'CENSORED_LINK'; EXIT input;
            END IF;
            v_trap := ink_product_engine.ink_s4_trap_hit_v1(p_session,v_member,p_payload->>'targetPageId',v_now,v_receipt);
            IF v_trap='sealed' THEN
              SELECT jsonb_build_object('trapOutcome','sealed','sealEffectId',e.effect_id) INTO STRICT v_detail
              FROM ink_product_engine.ink_s4_effects_v1 e
              WHERE e.session_id=p_session AND e.kind='trap_seal' AND e.opened_receipt_id=v_receipt;
              v_code := 'TRAP_STOPPED'; EXIT input;
            END IF;
            IF v_trap='stopped' THEN v_code := 'TRAP_STOPPED'; EXIT input; END IF;
          END IF;
          v_detail := ink_product_engine.ink_s3_move_v1(p_session,'normal_link',p_payload->>'targetPageId',NULL,
            v_progress,v_now,v_receipt);
          IF v_trap IN ('blocked','arrival') THEN
            IF v_detail->>'code'<>'MOVED' THEN RAISE EXCEPTION 'S4 trap movement must roll back'; END IF;
            v_detail := v_detail || jsonb_build_object('trapOutcome',v_trap);
            IF v_trap='arrival' THEN
              v_detail := v_detail || jsonb_build_object('stunEventSeq',ink_product_engine.ink_s4_trap_arrival_v1(p_session,v_member,v_now,v_receipt)::text);
            END IF;
          END IF;
        ELSIF p_operation='bookmark_return' THEN
          IF p_payload-ARRAY['expectedProgressVersion','rightId']<>'{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'rightId') IS DISTINCT FROM 'string' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          v_requested_right := (p_payload->>'rightId')::uuid;
          v_detail := ink_product_engine.ink_s3_move_v1(p_session,'bookmark_return',NULL,v_requested_right,
            v_progress,v_now,v_receipt);
        END IF;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_code := v_detail->>'code';
      v_detail := v_detail-'code';
      EXIT input;
    END IF;

    -- Version-scoped combat admission mirrors S2 and shares settlement and debit helpers.
    IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string' THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END IF;
    BEGIN
      v_grant_id := (p_payload->>'grantId')::uuid;
      IF p_operation='parry' THEN
        IF p_payload - ARRAY['grantId','childId'] <> '{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'childId') IS DISTINCT FROM 'string' THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
        v_child_id := (p_payload->>'childId')::uuid;
      ELSE
        IF pg_catalog.jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
            OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
        v_expected_inventory := (p_payload->>'expectedInventoryVersion')::bigint;
        IF p_operation='attack' THEN
          IF p_payload - ARRAY['grantId','expectedInventoryVersion','targetParticipantIds'] <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(p_payload->'targetParticipantIds') IS DISTINCT FROM 'array' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          IF pg_catalog.jsonb_array_length(p_payload->'targetParticipantIds') NOT BETWEEN 1 AND 2
             OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_payload->'targetParticipantIds') AS e(value)
                         WHERE pg_catalog.jsonb_typeof(e.value) <> 'string') THEN
            v_code := 'INVALID_TARGETS'; EXIT input;
          END IF;
          SELECT pg_catalog.array_agg(value::uuid ORDER BY position) INTO v_targets
            FROM pg_catalog.jsonb_array_elements_text(p_payload->'targetParticipantIds') WITH ORDINALITY AS e(value,position);
        ELSIF p_payload - ARRAY['grantId','expectedInventoryVersion'] <> '{}'::jsonb THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END;

    IF p_operation='parry' THEN
      SELECT c.* INTO v_child FROM ink_product_engine.ink_attack_children_v1 c
        WHERE c.session_id=p_session AND c.child_id=v_child_id
          AND c.target_participant_id=v_member.participant_id AND c.target_epoch=v_member.owner_epoch;
      IF NOT FOUND THEN v_code := 'WARNING_NOT_OWNED'; EXIT input; END IF;
      IF v_child.state<>'pending' THEN v_code := 'PARRY_CLOSED'; EXIT input; END IF;
      IF v_child.parry_attempt_receipt_id IS NOT NULL THEN v_code := 'PARRY_ALREADY_ATTEMPTED'; EXIT input; END IF;
    END IF;
    IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN
      v_code := 'PARTICIPANT_READ_ONLY'; EXIT input;
    END IF;

    IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;

    IF p_operation<>'parry' AND v_member.inventory_version<>v_expected_inventory THEN
      v_code := 'STALE_INVENTORY'; EXIT input;
    END IF;
    v_item := CASE p_operation WHEN 'attack' THEN 'ink' WHEN 'parry' THEN 'parry' ELSE 'shield' END;
    SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1
      WHERE session_id=p_session AND grant_id=v_grant_id AND owner_participant_id=v_member.participant_id
        AND owner_epoch=v_member.owner_epoch AND consumed_at IS NULL;
    IF NOT FOUND THEN v_code := 'GRANT_NOT_OWNED'; EXIT input; END IF;
    IF v_grant.item_id<>v_item THEN v_code := 'WRONG_ITEM_KIND'; EXIT input; END IF;

    IF p_operation IN ('parry','protect') AND ink_product_engine.ink_s5_enabled_v1(p_session) THEN
      v_s5_enhancement := ink_product_engine.ink_s5_modifier_id_v1(v_member,'enhancement',v_now);
      v_s5_weakening := ink_product_engine.ink_s5_modifier_id_v1(v_member,'weakening',v_now);
      v_tier := ink_product_engine.ink_s5_tier_v1(v_grant.base_tier,v_s5_enhancement,v_s5_weakening);
      IF v_tier IS NULL THEN v_code := 'UNSUPPORTED_MODIFIER_TRANSITION'; EXIT input; END IF;
      IF p_operation='parry' AND v_tier='enhanced' AND NOT EXISTS (
        SELECT FROM ink_product_engine.ink_attack_roots_v1 root
        JOIN ink_product_engine.ink_grants_v1 g USING(session_id,grant_id)
        WHERE (root.session_id,root.root_id)=(p_session,v_child.root_id) AND g.item_id IN ('ink','censor','thunder')
      ) THEN v_code := 'S5_REFLECTION_TIER_UNAVAILABLE'; EXIT input; END IF;
    END IF;
    IF p_operation='attack' THEN
      IF (SELECT count(DISTINCT target) FROM pg_catalog.unnest(v_targets) AS a(target)) <> pg_catalog.cardinality(v_targets)
         OR v_member.participant_id=ANY(v_targets)
         OR (SELECT count(*) FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
             AND participant_id=ANY(v_targets) AND member_role='player' AND player_status='playing') <> pg_catalog.cardinality(v_targets) THEN
        v_code := 'INVALID_TARGETS'; EXIT input;
      END IF;

      SELECT right_id INTO v_enhancement FROM ink_product_engine.ink_rights_v1
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
          AND kind='enhancement' AND closed_at IS NULL AND installed_at<=v_now AND remaining_charges=1;
      SELECT right_id INTO v_weakening FROM ink_product_engine.ink_rights_v1
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
          AND kind='weakening' AND closed_at IS NULL AND installed_at<=v_now AND remaining_charges=1;
      v_tier := CASE WHEN v_enhancement IS NOT NULL AND v_weakening IS NULL THEN 'enhanced'
                     WHEN v_weakening IS NOT NULL AND v_enhancement IS NULL THEN 'weakened'
                     ELSE v_grant.base_tier END;
      IF ink_product_engine.ink_s5_enabled_v1(p_session) THEN
        v_s5_enhancement := ink_product_engine.ink_s5_modifier_id_v1(v_member,'enhancement',v_now);
        v_s5_weakening := ink_product_engine.ink_s5_modifier_id_v1(v_member,'weakening',v_now);
        v_tier := ink_product_engine.ink_s5_tier_v1(v_tier,v_s5_enhancement,v_s5_weakening);
        IF v_tier IS NULL THEN v_code := 'UNSUPPORTED_MODIFIER_TRANSITION'; EXIT input; END IF;
      END IF;
      v_root := pg_catalog.gen_random_uuid();
      v_due_at := v_now+ink_product_engine.ink_s5_warning_window_v1(p_session);
      INSERT INTO ink_product_engine.ink_attack_roots_v1 (
        session_id,root_id,source_participant_id,source_epoch,grant_id,acceptance_seq,
        accepted_at,due_at,base_tier,effective_tier,acceptance_receipt_id
      ) VALUES (p_session,v_root,v_member.participant_id,v_member.owner_epoch,v_grant_id,
        v_session.next_acceptance_seq,v_now,v_due_at,v_grant.base_tier,v_tier,v_receipt);
      UPDATE ink_product_engine.ink_sessions_v1 SET next_acceptance_seq=next_acceptance_seq+1 WHERE session_id=p_session;
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,v_root);
      IF v_s5_enhancement IS NOT NULL OR v_s5_weakening IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s5_debit_modifiers_v1(p_session,v_receipt,ARRAY[v_s5_enhancement,v_s5_weakening]);
      END IF;
      IF v_enhancement IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_enhancement,v_now,v_receipt,v_root);
      END IF;
      IF v_weakening IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_weakening,v_now,v_receipt,v_root);
      END IF;
      FOREACH v_target IN ARRAY v_targets LOOP
        SELECT owner_epoch INTO STRICT v_target_epoch FROM ink_product_engine.ink_members_v1
          WHERE session_id=p_session AND participant_id=v_target;
        v_child_id := pg_catalog.gen_random_uuid();
        INSERT INTO ink_product_engine.ink_attack_children_v1
          (session_id,child_id,root_id,target_participant_id,target_epoch,state,warning_event_seq)
        VALUES (p_session,v_child_id,v_root,v_target,v_target_epoch,'pending',
          ink_product_engine.ink_s2_next_event_v1(p_session,v_target));
        v_children := v_children || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'childId',v_child_id,'targetParticipantId',v_target));
      END LOOP;
      v_code := 'ATTACK_ACCEPTED';
      v_detail := pg_catalog.jsonb_build_object('rootId',v_root,'children',v_children,'dueAt',v_due_at,
        'acceptanceSeq',v_session.next_acceptance_seq::text,'tier',v_tier);
    ELSIF p_operation='parry' THEN
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,v_child.root_id);
      UPDATE ink_product_engine.ink_attack_children_v1 SET parry_attempt_receipt_id=v_receipt,
        reflection_tier=CASE WHEN v_tier='enhanced' THEN 'enhanced' END
        WHERE session_id=p_session AND child_id=v_child_id;
      v_detail := pg_catalog.jsonb_build_object('childId',v_child_id);
      IF v_s5_enhancement IS NOT NULL OR v_s5_weakening IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s5_debit_modifiers_v1(p_session,v_receipt,ARRAY[v_s5_enhancement,v_s5_weakening]);
      END IF;
      IF v_tier='weakened' THEN
        PERFORM ink_product_engine.ink_s5_parry_block_v1(p_session,v_child,v_now,v_receipt);
        v_code := 'PARRY_ACCEPTED';
        v_detail := v_detail || jsonb_build_object('outcome','blocked','effectiveTier','weakened');
      ELSIF v_session.init_canonical_payload->>'variant'='parry_failure' THEN
        PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
        v_code := 'PARRY_FAILED';
      ELSE
        v_code := 'PARRY_ACCEPTED';
        v_detail := v_detail || pg_catalog.jsonb_build_object('outcome',
          ink_product_engine.ink_s4_resolve_v1(p_session,v_child_id,v_now,true,v_receipt));
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
        AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
        AND kind='protection' AND closed_at IS NULL AND remaining_charges=1 AND v_now<expires_at) THEN
        v_code := 'UNSUPPORTED_PROTECTION_REPLACEMENT'; EXIT input;
      END IF;
      UPDATE ink_product_engine.ink_rights_v1 SET closed_at=expires_at,close_reason='expired'
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id
          AND kind='protection' AND closed_at IS NULL AND expires_at<=v_now;
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,NULL);
      INSERT INTO ink_product_engine.ink_rights_v1 (session_id,right_id,owner_participant_id,owner_epoch,kind,
        source_grant_id,right_version,installed_at,expires_at,remaining_charges)
      VALUES (p_session,pg_catalog.gen_random_uuid(),v_member.participant_id,v_member.owner_epoch,'protection',
        v_grant_id,1,v_now,CASE WHEN v_tier='enhanced' THEN 'infinity'::timestamptz
        ELSE v_now+CASE WHEN v_tier='weakened' THEN interval '4 seconds' ELSE interval '8 seconds' END END,1);
      IF v_s5_enhancement IS NOT NULL OR v_s5_weakening IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s5_debit_modifiers_v1(p_session,v_receipt,ARRAY[v_s5_enhancement,v_s5_weakening]);
      END IF;
      v_code := 'PROTECTION_ACTIVE';
    END IF;
  END input;

  UPDATE ink_product_engine.ink_sessions_v1 SET state_revision=state_revision+1
    WHERE session_id=p_session RETURNING state_revision INTO STRICT v_revision;
  v_response := pg_catalog.jsonb_build_object(
    'ok',v_s4_accepted OR v_code IN ('ATTACK_ACCEPTED','PARRY_ACCEPTED','PARRY_FAILED','PROTECTION_ACTIVE','ADVANCED','RESUMED','MOVED','BOOKMARK_INSTALLED'),
    'code',v_code,'operation',p_operation,'requestId',p_request,'receiptId',v_receipt,
    'authorityReceivedAt',v_now,'stateRevision',v_revision::text) || v_detail;
  PERFORM ink_product_engine.ink_s3_record_v1(p_session,v_receipt,p_scope,p_actor,p_request,p_operation,v_payload,v_now,v_response);
  RETURN v_response;
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s4_dispatch_v1_legacy(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) OWNER TO ink_product_owner;

--
-- Name: ink_s4_expire_traps_v1(uuid, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_expire_traps_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  UPDATE ink_product_engine.ink_s4_traps_v1 SET closed_at=least(expires_at,p_at),closed_receipt_id=p_receipt,close_reason='expired'
  WHERE session_id=p_session AND closed_at IS NULL AND ((NOT phase2_contract AND expires_at<=p_at) OR NOT EXISTS (
    SELECT 1 FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=p_session AND m.participant_id=ink_s4_traps_v1.participant_id
      AND m.owner_epoch=ink_s4_traps_v1.owner_epoch AND (ink_s4_traps_v1.phase2_contract OR m.progress_version=ink_s4_traps_v1.progress_version)
      AND m.player_status='playing'))
$$;


ALTER FUNCTION ink_product_engine.ink_s4_expire_traps_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_matches_v1(ink_product_engine.ink_sessions_v1); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_matches_v1(p_session ink_product_engine.ink_sessions_v1) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT NOT (p_session).test_only AND (p_session).mode='group_items'
    AND ink_product_engine.ink_s4_fixture_id_v1((p_session).session_id)
    AND (p_session).init_canonical_payload->>'operation'='s4_product_init'
    AND (p_session).init_canonical_payload->>'clientBindingDigest'=ink_product_engine.ink_s4_client_binding_v1()->>'policyDigest'
    AND ((p_session).schema_version,(p_session).rules_version,(p_session).catalog_version,
      (p_session).mode_policy_version,(p_session).policy_digest)
    = (b->>'schemaVersion',b->>'rulesVersion',b->>'catalogVersion',
       b->>'modePolicyVersion',pg_catalog.decode(b->>'policyDigest','hex'))
    AND EXISTS (SELECT 1 FROM ink_product_engine.ink_s3_sessions_v1 enabled
      WHERE enabled.session_id=(p_session).session_id AND enabled.binding_digest=(p_session).policy_digest)
  FROM ink_product_engine.ink_s3_binding_v1() AS binding(b)
$$;


ALTER FUNCTION ink_product_engine.ink_s4_matches_v1(p_session ink_product_engine.ink_sessions_v1) OWNER TO ink_product_owner;

--
-- Name: ink_s4_navigation_v1(uuid, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_grant_id uuid;
  v_head ink_product_engine.ink_moves_v1%ROWTYPE;
  v_move_id uuid;
  v_right_id uuid;
  v_limit smallint;
  v_event_seq bigint;
BEGIN
  IF p_session IS NULL OR NOT ink_product_engine.ink_s4_fixture_id_v1(p_session) THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_SESSION');
  END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('bookmark_install','undo') THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_OPERATION');
  END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('normal','enhanced','weakened') THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_TIER');
  END IF;
  IF p_receipt IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_INPUT');
  END IF;
  IF p_payload-ARRAY['grantId','expectedInventoryVersion','expectedProgressVersion']<>'{}'::jsonb
      OR pg_catalog.jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_payload->'expectedProgressVersion') IS DISTINCT FROM 'string'
      OR (p_payload->>'grantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$'
      OR (p_payload->>'expectedProgressVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','INVALID_INPUT');
  END IF;

  IF ink_product.request_actor_v1() IS NULL OR p_member.session_id IS DISTINCT FROM p_session
      OR p_member.user_id IS DISTINCT FROM ink_product.request_actor_v1() THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','NOT_A_PARTICIPANT');
  END IF;
  v_session := ink_product_engine.ink_s3_lock_v1(p_session,p_at);
  SELECT m.* INTO v_member FROM ink_product_engine.ink_members_v1 m
    WHERE m.session_id=p_session AND m.participant_id=p_member.participant_id
      AND m.owner_epoch=p_member.owner_epoch AND m.user_id=ink_product.request_actor_v1()
      AND m.member_role='player' AND m.player_status='playing'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','NOT_AN_ACTIVE_PLAYER');
  END IF;
  PERFORM ink_product_engine.ink_s3_assert_supply_v1(p_session,v_session.started_at,p_at);
  IF (p_payload->>'expectedInventoryVersion') IS DISTINCT FROM v_member.inventory_version::text THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','STALE_INVENTORY');
  END IF;
  IF (p_payload->>'expectedProgressVersion') IS DISTINCT FROM v_member.progress_version::text THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','STALE_PROGRESS');
  END IF;
  IF ((ink_product.course_document(p_session,v_member.current_page_id)).revision_id IS DISTINCT FROM v_member.current_revision_id OR ink_product.course_is_goal(p_session,v_member.current_page_id,v_member.current_revision_id)) THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_DOCUMENT');
  END IF;
  v_grant_id := (p_payload->>'grantId')::uuid;
  PERFORM 1 FROM ink_product_engine.ink_grants_v1 g
    WHERE g.session_id=p_session AND g.grant_id=v_grant_id
      AND g.owner_participant_id=v_member.participant_id AND g.owner_epoch=v_member.owner_epoch
      AND g.item_id=CASE WHEN p_operation='undo' THEN 'undo' ELSE 'bookmark' END
      AND g.consumed_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','GRANT_NOT_OWNED');
  END IF;

  IF p_operation='bookmark_install' THEN
    v_limit := CASE p_tier WHEN 'enhanced' THEN 7 WHEN 'weakened' THEN 3 ELSE 5 END;
    v_right_id := pg_catalog.gen_random_uuid();
    UPDATE ink_product_engine.ink_bookmark_rights_v1
      SET closed_at=p_at,close_reason='replaced'
      WHERE session_id=p_session AND actor_participant_id=v_member.participant_id
        AND actor_epoch=v_member.owner_epoch AND closed_at IS NULL;
    INSERT INTO ink_product_engine.ink_bookmark_rights_v1 (
      session_id,right_id,actor_participant_id,actor_epoch,source_grant_id,installed_receipt_id,
      origin_page_id,origin_revision_id,remaining_moves,installed_at
    ) VALUES (
      p_session,v_right_id,v_member.participant_id,v_member.owner_epoch,v_grant_id,p_receipt,
      v_member.current_page_id,v_member.current_revision_id,v_limit,p_at
    );
    v_event_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
    RETURN pg_catalog.jsonb_build_object('accepted',true,'code','BOOKMARK_INSTALLED',
      'rightId',v_right_id,'remainingNormalMoves',v_limit,'eventSeq',v_event_seq::text);
  END IF;

  SELECT m.* INTO v_head FROM ink_product_engine.ink_moves_v1 m
    WHERE m.session_id=p_session AND m.actor_participant_id=v_member.participant_id
      AND m.actor_epoch=v_member.owner_epoch
    ORDER BY m.version_after DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNDO_UNAVAILABLE');
  END IF;
  IF v_head.version_after IS DISTINCT FROM v_member.progress_version
      OR v_head.to_page_id IS DISTINCT FROM v_member.current_page_id
      OR v_head.to_revision_id IS DISTINCT FROM v_member.current_revision_id THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNDO_HEAD_MISMATCH');
  END IF;
  -- S4 currently produces only normal links, bookmark returns and undo movements.
  -- A forced/joker producer and consecutive/history rules need a separate contract.
  IF v_head.operation<>'normal_link' AND NOT (
    p_tier='enhanced' AND ink_product_engine.ink_s5_enabled_v1(p_session) AND v_head.operation IN ('lost_link','cannon')) THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_UNDO_HISTORY_POLICY');
  END IF;
  IF v_head.from_revision_id IS DISTINCT FROM (ink_product.course_document(p_session,v_head.from_page_id)).revision_id
      OR ink_product.course_is_goal(p_session,v_head.from_page_id,v_head.from_revision_id)
      OR v_head.from_page_id=v_member.current_page_id THEN
    RETURN pg_catalog.jsonb_build_object('accepted',false,'code','UNSUPPORTED_UNDO_DESTINATION');
  END IF;
  IF p_tier='weakened' THEN
    IF NOT ink_product_engine.ink_s5_enabled_v1(p_session) THEN
      RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_UNDO_DRAW_POLICY');
    END IF;
    IF ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'undo:weakened',100)>=(CASE WHEN ink_product_engine.ink_s5_phase3_enabled_v1(p_session)THEN 70 ELSE 60 END) THEN
      RETURN jsonb_build_object('accepted',true,'code','UNDO_CHANCE_FAILED','s5TestOnly',true);
    END IF;
  END IF;

  v_move_id := pg_catalog.gen_random_uuid();
  INSERT INTO ink_product_engine.ink_moves_v1 (
    session_id,move_id,actor_participant_id,actor_epoch,receipt_id,operation,
    from_page_id,from_revision_id,to_page_id,to_revision_id,version_before,version_after,move_count_after,logical_at
  ) VALUES (
    p_session,v_move_id,v_member.participant_id,v_member.owner_epoch,p_receipt,'undo',
    v_member.current_page_id,v_member.current_revision_id,v_head.from_page_id,v_head.from_revision_id,
    v_member.progress_version,v_member.progress_version+1,v_member.move_count+1,p_at
  );
  UPDATE ink_product_engine.ink_members_v1
    SET current_page_id=v_head.from_page_id,current_revision_id=v_head.from_revision_id,
        progress_version=progress_version+1,move_count=move_count+1
    WHERE session_id=p_session AND participant_id=v_member.participant_id
      AND owner_epoch=v_member.owner_epoch AND progress_version=v_member.progress_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'S4 navigation state changed under lock'; END IF;
  v_event_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
  RETURN pg_catalog.jsonb_build_object('accepted',true,'code','MOVED','movementKind','forced',
    'moveId',v_move_id,'sourceMoveId',v_head.move_id,'pageId',v_head.from_page_id,
    'revisionId',v_head.from_revision_id,'progressVersion',(v_member.progress_version+1)::text,
    'moveCount',v_member.move_count+1,'eventSeq',v_event_seq::text);
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s4_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) OWNER TO ink_product_owner;

--
-- Name: ink_s4_rank_censor_exits_v1(text[], uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_rank_censor_exits_v1(p_exits text[], p_child uuid) RETURNS text[]
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
  SELECT coalesce(pg_catalog.array_agg(dest ORDER BY
    pg_catalog.sha256(pg_catalog.convert_to(p_child::text||':'||dest,'UTF8')),dest),'{}'::text[])
  FROM (SELECT DISTINCT dest FROM pg_catalog.unnest(p_exits) AS exits(dest) WHERE dest IS NOT NULL) canonical
$$;


ALTER FUNCTION ink_product_engine.ink_s4_rank_censor_exits_v1(p_exits text[], p_child uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_resolve_censor_v1(uuid, uuid, timestamp with time zone, boolean, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_resolve_censor_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_child ink_product_engine.ink_attack_children_v1%ROWTYPE;
  v_root ink_product_engine.ink_attack_roots_v1%ROWTYPE;
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_target ink_product_engine.ink_members_v1%ROWTYPE;
  v_protection uuid;
  v_outcome text;
  v_links text[];
  v_count integer;
  v_blocked integer;
  v_phase2_at timestamptz;
  v_expires timestamptz;
  v_target_seq bigint;
  v_source_seq bigint;
BEGIN
  IF p_session IS NULL OR NOT ink_product_engine.ink_s4_fixture_id_v1(p_session)
      OR p_at IS NULL OR NOT pg_catalog.isfinite(p_at) OR(p_at>pg_catalog.clock_timestamp()AND NOT(ink_product_engine.ink_s5_phase3_enabled_v1(p_session)AND NOT p_reflect AND EXISTS(SELECT FROM ink_product_engine.ink_sessions_v1 WHERE session_id=p_session AND lifecycle_state='finished')))
      OR p_reflect IS NULL OR p_receipt IS NULL THEN RAISE EXCEPTION 'Invalid S4 censor authority'; END IF;
  SELECT s.* INTO STRICT v_session FROM ink_product_engine.ink_sessions_v1 s WHERE s.session_id=p_session AND NOT s.test_only
    AND s.mode='group_items' AND s.schema_version='s3-test-v1' FOR UPDATE;
  SELECT c.* INTO STRICT v_child FROM ink_product_engine.ink_attack_children_v1 c
    WHERE c.session_id=p_session AND c.child_id=p_child AND c.state='pending';
  SELECT r.* INTO STRICT v_root FROM ink_product_engine.ink_attack_roots_v1 r JOIN ink_product_engine.ink_grants_v1 g USING(session_id,grant_id)
    WHERE r.session_id=p_session AND r.root_id=v_child.root_id AND g.item_id='censor' AND g.consumed_at=r.accepted_at;
  IF (p_reflect AND (p_at<v_root.accepted_at OR p_at>=v_root.due_at OR v_child.parry_attempt_receipt_id IS DISTINCT FROM p_receipt))
      OR (NOT p_reflect AND p_at<>v_root.due_at) THEN RAISE EXCEPTION 'Invalid S4 censor resolution time'; END IF;
  IF v_session.lifecycle_state<>'playing' OR NOT EXISTS (SELECT 1 FROM ink_product_engine.ink_members_v1 m
    WHERE m.session_id=p_session AND m.participant_id=v_child.target_participant_id AND m.owner_epoch=v_child.target_epoch
      AND m.member_role='player' AND m.player_status='playing') THEN
    v_outcome := 'void_terminal';
  ELSE
    SELECT m.* INTO v_target FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=p_session
      AND m.participant_id=CASE WHEN p_reflect THEN v_root.source_participant_id ELSE v_child.target_participant_id END
      AND m.owner_epoch=CASE WHEN p_reflect THEN v_root.source_epoch ELSE v_child.target_epoch END
      AND m.member_role='player' AND m.player_status='playing';
    IF NOT FOUND THEN
      v_outcome := 'void_source_terminal';
    ELSE
      IF ((ink_product.course_document(p_session,v_target.current_page_id)).revision_id IS DISTINCT FROM v_target.current_revision_id) THEN RAISE EXCEPTION 'S4_CENSOR_DOCUMENT_OUTSIDE_GRAPH'; END IF;
      v_links := ink_product_engine.ink_s4_rank_censor_exits_v1(ARRAY(
        SELECT ink_product.course_exits(p_session,v_target.current_page_id,v_target.current_revision_id)
      ),p_child);
      v_count := pg_catalog.cardinality(v_links);
      IF v_count<=2 THEN
        v_outcome := 'no_censor_candidates';
      ELSE
        SELECT r.right_id INTO v_protection FROM ink_product_engine.ink_rights_v1 r WHERE r.session_id=p_session
        AND r.owner_participant_id=v_target.participant_id AND r.owner_epoch=v_target.owner_epoch
        AND r.kind='protection' AND r.closed_at IS NULL AND r.remaining_charges=1 AND r.installed_at<=p_at AND p_at<r.expires_at;
        IF v_protection IS NOT NULL THEN
          PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_protection,p_at,p_receipt,v_root.root_id);
          v_outcome := CASE WHEN p_reflect THEN 'reflection_blocked' ELSE 'blocked' END;
        END IF;
      END IF;
      IF v_outcome IS NULL THEN
        v_blocked := least(v_count-2,pg_catalog.ceil(v_count*CASE WHEN (CASE WHEN p_reflect THEN coalesce(v_child.reflection_tier,v_root.effective_tier) ELSE v_root.effective_tier END)='weakened' THEN 0.25 ELSE 0.50 END)::integer);
        IF (CASE WHEN p_reflect THEN coalesce(v_child.reflection_tier,v_root.effective_tier) ELSE v_root.effective_tier END)='enhanced' THEN
          v_blocked := least(v_blocked,v_count/2);
          v_phase2_at := p_at+interval '3 seconds';
          v_expires := p_at+interval '6 seconds';
        ELSE
          v_expires := p_at+CASE WHEN (CASE WHEN p_reflect THEN coalesce(v_child.reflection_tier,v_root.effective_tier) ELSE v_root.effective_tier END)='weakened' THEN interval '2 seconds' ELSE interval '3 seconds' END;
        END IF;
        -- One active fixture censor per document frame preserves the two-exit bound.
        UPDATE ink_product_engine.ink_s4_effects_v1 SET closed_at=p_at,closed_receipt_id=p_receipt
          WHERE session_id=p_session AND participant_id=v_target.participant_id AND owner_epoch=v_target.owner_epoch
            AND kind='censor' AND progress_version=v_target.progress_version AND closed_at IS NULL
            AND page_id=v_target.current_page_id AND revision_id=v_target.current_revision_id
            AND starts_at<=p_at AND p_at<expires_at;
        INSERT INTO ink_product_engine.ink_s4_effects_v1(session_id,effect_id,participant_id,owner_epoch,kind,starts_at,expires_at,
          progress_version,page_id,revision_id,payload,opened_receipt_id)
        VALUES(p_session,pg_catalog.gen_random_uuid(),v_target.participant_id,v_target.owner_epoch,'censor',p_at,v_expires,
          v_target.progress_version,v_target.current_page_id,v_target.current_revision_id,pg_catalog.jsonb_build_object(
            'policy','s4-censor-fixture-v1','childId',p_child,'tier',(CASE WHEN p_reflect THEN coalesce(v_child.reflection_tier,v_root.effective_tier) ELSE v_root.effective_tier END),
            'phase1',v_links[1:v_blocked],'phase2At',v_phase2_at,
            'phase2',CASE WHEN v_phase2_at IS NOT NULL THEN v_links[v_blocked+1:2*v_blocked] END),p_receipt);
        v_outcome := CASE WHEN p_reflect THEN 'reflected' ELSE 'hit' END;
      END IF;
    END IF;
  END IF;
  v_target_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_child.target_participant_id);
  v_source_seq := ink_product_engine.ink_s2_next_event_v1(p_session,v_root.source_participant_id);
  UPDATE ink_product_engine.ink_attack_children_v1 SET state='resolved',outcome=v_outcome,resolved_logical_at=p_at,
    resolution_receipt_id=p_receipt,target_result_event_seq=v_target_seq,source_result_event_seq=v_source_seq
    WHERE session_id=p_session AND child_id=p_child;
  RETURN v_outcome;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s4_resolve_censor_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_resolve_v1(uuid, uuid, timestamp with time zone, boolean, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_item text;
BEGIN
  SELECT g.item_id INTO STRICT v_item FROM ink_product_engine.ink_attack_children_v1 c
  JOIN ink_product_engine.ink_attack_roots_v1 r USING(session_id,root_id)
  JOIN ink_product_engine.ink_grants_v1 g ON g.session_id=r.session_id AND g.grant_id=r.grant_id
  WHERE c.session_id=p_session AND c.child_id=p_child;
  IF v_item='censor' THEN RETURN ink_product_engine.ink_s4_resolve_censor_v1(p_session,p_child,p_at,p_reflect,p_receipt); END IF;
  IF v_item='ink' THEN RETURN ink_product_engine.ink_s2_resolve_v1(p_session,p_child,p_at,p_reflect,p_receipt); END IF;
  IF v_item IN ('lost_link','weakening','thunder') THEN RETURN ink_product_engine.ink_s5_resolve_attack_v1(p_session,p_child,p_at,p_reflect,p_receipt); END IF;
  RAISE EXCEPTION 'Unexpected S4 attack root';
END
$$;


ALTER FUNCTION ink_product_engine.ink_s4_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_trap_arrival_v1(uuid, ink_product_engine.ink_members_v1, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_trap_arrival_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_trap ink_product_engine.ink_s4_traps_v1%ROWTYPE; v_arrival ink_product_engine.ink_members_v1%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_trap FROM ink_product_engine.ink_s4_traps_v1 WHERE session_id=p_session
    AND participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch AND tier='weakened'
    AND close_reason='triggered' AND closed_receipt_id=p_receipt;
  SELECT * INTO STRICT v_arrival FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
    AND participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch
    AND current_page_id=v_trap.destination AND progress_version=p_member.progress_version+1;
  IF v_arrival.player_status<>'playing' THEN RETURN NULL; END IF;
  INSERT INTO ink_product_engine.ink_s4_effects_v1(session_id,effect_id,participant_id,owner_epoch,kind,starts_at,expires_at,
    progress_version,page_id,revision_id,payload,opened_receipt_id)
  VALUES(p_session,gen_random_uuid(),v_arrival.participant_id,v_arrival.owner_epoch,'stun',p_at,p_at+interval '1 second',
    v_arrival.progress_version,v_arrival.current_page_id,v_arrival.current_revision_id,
    jsonb_build_object('source','trap','trapId',v_trap.trap_id),p_receipt);
  RETURN ink_product_engine.ink_s2_next_event_v1(p_session,v_arrival.participant_id);
END
$$;


ALTER FUNCTION ink_product_engine.ink_s4_trap_arrival_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_trap_choices_v1(uuid, ink_product_engine.ink_members_v1, uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_trap_choices_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target uuid, p_grant uuid, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('pageId',link.destination,'selectionToken',
    encode(sha256(c.private_rng_seed||sha256(convert_to(jsonb_build_array(
      's4-trap-token-v1',p_session,p_member.participant_id,p_member.owner_epoch,p_grant,
      m.participant_id,m.owner_epoch,m.progress_version,m.current_page_id,m.current_revision_id,
      link.destination,floor(extract(epoch FROM p_at)/10))::text,'UTF8'))),'hex')) ORDER BY link.destination),'[]'::jsonb)
  FROM ink_product_engine.ink_members_v1 m JOIN ink_product_engine.ink_s3_sessions_v1 c USING(session_id)
  CROSS JOIN LATERAL ink_product.course_exits(p_session,m.current_page_id,m.current_revision_id) link(destination)
  WHERE ink_product_engine.ink_s4_fixture_id_v1(p_session) AND m.session_id=p_session AND m.participant_id=p_target
    AND m.participant_id<>p_member.participant_id AND m.member_role='player' AND m.player_status='playing'
$$;


ALTER FUNCTION ink_product_engine.ink_s4_trap_choices_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target uuid, p_grant uuid, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s4_trap_hit_v1(uuid, ink_product_engine.ink_members_v1, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_trap_hit_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone, p_receipt uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_trap ink_product_engine.ink_s4_traps_v1%ROWTYPE; v_protection uuid;
BEGIN
  SELECT * INTO v_trap FROM ink_product_engine.ink_s4_traps_v1 WHERE session_id=p_session
    AND participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch
    AND (progress_version=p_member.progress_version OR phase2_contract) AND page_id=p_member.current_page_id
    AND revision_id=p_member.current_revision_id AND destination=p_destination
    AND closed_at IS NULL AND installed_at<=p_at AND p_at<expires_at;
  IF NOT FOUND THEN RETURN 'none'; END IF;
  SELECT right_id INTO v_protection FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
    AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch
    AND kind='protection' AND closed_at IS NULL AND remaining_charges=1 AND installed_at<=p_at AND p_at<expires_at;
  UPDATE ink_product_engine.ink_s4_traps_v1 SET closed_at=p_at,closed_receipt_id=p_receipt,
    close_reason=CASE WHEN v_protection IS NULL THEN 'triggered' ELSE 'blocked' END
    WHERE session_id=p_session AND trap_id=v_trap.trap_id AND closed_at IS NULL;
  IF v_protection IS NOT NULL THEN
    PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_protection,p_at,p_receipt,NULL);
    IF ink_product_engine.ink_s5_phase4_enabled_v1(p_session)THEN
      PERFORM ink_product_engine.ink_s5_phase4_trap_shield_bonus_v1(p_session,v_protection,v_trap.trap_id,p_at,p_receipt);
    END IF;
    RETURN 'blocked';
  END IF;
  IF v_trap.tier='weakened' THEN RETURN 'arrival'; END IF;
  INSERT INTO ink_product_engine.ink_s4_effects_v1(session_id,effect_id,participant_id,owner_epoch,kind,starts_at,expires_at,
    progress_version,page_id,revision_id,payload,opened_receipt_id)
  VALUES(p_session,gen_random_uuid(),p_member.participant_id,p_member.owner_epoch,'stun',p_at,p_at+interval '3 seconds',
    p_member.progress_version,p_member.current_page_id,p_member.current_revision_id,
    jsonb_build_object('source','trap','trapId',v_trap.trap_id),p_receipt);
  IF v_trap.tier='enhanced' AND v_trap.phase2_contract AND NOT EXISTS(SELECT FROM ink_product.course_exits(p_session,p_member.current_page_id,p_member.current_revision_id)x(page_id) WHERE x.page_id<>p_destination AND NOT ink_product_engine.ink_s4_censored_v1(p_session,p_member,x.page_id,p_at) AND NOT ink_product_engine.ink_s5_trap_sealed_v1(p_session,p_member,x.page_id,p_at))THEN v_trap.tier:='normal';END IF;
  IF v_trap.tier='enhanced' THEN
    -- The existing projection requires a finite timestamp. The visit frame,
    -- not the clock, determines when this seal stops being applicable.
    INSERT INTO ink_product_engine.ink_s4_effects_v1(session_id,effect_id,participant_id,owner_epoch,kind,starts_at,expires_at,
      progress_version,page_id,revision_id,payload,opened_receipt_id)
    VALUES(p_session,gen_random_uuid(),p_member.participant_id,p_member.owner_epoch,'trap_seal',p_at,
      timestamptz '9999-12-31 23:59:59+00',p_member.progress_version,p_member.current_page_id,p_member.current_revision_id,
      jsonb_build_object('source','trap','trapId',v_trap.trap_id,'destinationPageId',v_trap.destination),p_receipt);
    PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
    RETURN 'sealed';
  END IF;
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
  RETURN 'stopped';
END
$$;


ALTER FUNCTION ink_product_engine.ink_s4_trap_hit_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s4_trap_v1(uuid, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s4_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_target ink_product_engine.ink_members_v1%ROWTYPE; v_options jsonb; v_destination text; v_trap uuid;
BEGIN
IF ink_product_engine.ink_s5_phase2_enabled_v1(p_session)THEN RETURN ink_product_engine.ink_s5_phase2_trap_v1(p_session,p_member,p_operation,p_payload,p_at,p_receipt,p_tier);END IF;
  IF NOT ink_product_engine.ink_s4_fixture_id_v1(p_session)
    OR jsonb_typeof(p_payload->'targetParticipantId') IS DISTINCT FROM 'string'
    OR (p_operation='trap_install' AND (jsonb_typeof(p_payload->'selectionToken') IS DISTINCT FROM 'string'
      OR p_payload-ARRAY['grantId','expectedInventoryVersion','targetParticipantId','selectionToken']<>'{}'::jsonb))
    OR (p_operation='trap_options' AND p_payload-ARRAY['grantId','expectedInventoryVersion','targetParticipantId']<>'{}'::jsonb)
  THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT'); END IF;
  IF p_tier NOT IN ('normal','weakened') AND NOT (
    p_tier='enhanced' AND ink_product_engine.ink_s5_enabled_v1(p_session)) THEN
    RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_TRAP_VARIANT');
  END IF;
  SELECT * INTO v_target FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
    AND participant_id=(p_payload->>'targetParticipantId')::uuid AND member_role='player'
    AND player_status='playing' AND participant_id<>p_member.participant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE'); END IF;
  v_options := ink_product_engine.ink_s4_trap_choices_v1(p_session,p_member,v_target.participant_id,
    (p_payload->>'grantId')::uuid,p_at);
  IF p_operation='trap_options' THEN
    RETURN jsonb_build_object('accepted',true,'code','TRAP_OPTIONS','options',v_options);
  END IF;
  SELECT option->>'pageId' INTO v_destination FROM jsonb_array_elements(v_options || ink_product_engine.ink_s4_trap_choices_v1(p_session,p_member,
      v_target.participant_id,(p_payload->>'grantId')::uuid,p_at-interval '10 seconds')) option
    WHERE option->>'selectionToken'=p_payload->>'selectionToken';
  IF v_destination IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','TRAP_SELECTION_STALE'); END IF;
  IF EXISTS (SELECT 1 FROM ink_product_engine.ink_s4_traps_v1 WHERE session_id=p_session AND participant_id=v_target.participant_id
    AND owner_epoch=v_target.owner_epoch AND progress_version=v_target.progress_version AND closed_at IS NULL) THEN
    RETURN jsonb_build_object('accepted',false,'code','TRAP_ALREADY_ARMED');
  END IF;
  IF ink_product_engine.ink_s4_censored_v1(p_session,v_target,v_destination,p_at) THEN
    RETURN jsonb_build_object('accepted',false,'code','CENSORED_LINK');
  END IF;
  IF ink_product_engine.ink_s5_trap_sealed_v1(p_session,v_target,v_destination,p_at) THEN
    RETURN jsonb_build_object('accepted',false,'code','TRAP_SEALED_LINK');
  END IF;
  -- TEST_ONLY: a visit-bound seal must leave a route out of the current page.
  IF p_tier='enhanced' AND NOT EXISTS (
    SELECT FROM ink_product.course_exits(p_session,v_target.current_page_id,v_target.current_revision_id) exit(page_id)
    WHERE exit.page_id<>v_destination
      AND NOT ink_product_engine.ink_s5_trap_sealed_v1(p_session,v_target,exit.page_id,p_at)
  ) THEN RETURN jsonb_build_object('accepted',false,'code','TRAP_LAST_EXIT'); END IF;
  v_trap := gen_random_uuid();
  INSERT INTO ink_product_engine.ink_s4_traps_v1(session_id,trap_id,source_grant_id,participant_id,owner_epoch,
    progress_version,page_id,revision_id,destination,tier,installed_at,expires_at,installed_receipt_id)
  VALUES(p_session,v_trap,(p_payload->>'grantId')::uuid,v_target.participant_id,v_target.owner_epoch,
    v_target.progress_version,v_target.current_page_id,v_target.current_revision_id,v_destination,p_tier,
    p_at,p_at+interval '10 seconds',p_receipt);
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_target.participant_id);
  RETURN jsonb_build_object('accepted',true,'code','TRAP_INSTALLED','trapId',v_trap);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
END
$$;


ALTER FUNCTION ink_product_engine.ink_s4_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) OWNER TO ink_product_owner;

--
-- Name: ink_s5_apply_thunder_v1(ink_product_engine.ink_members_v1, text, boolean, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_apply_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  bundle_id uuid := gen_random_uuid();
  stun_until timestamptz := p_at+make_interval(secs=>CASE WHEN p_self THEN 5
    WHEN p_tier='enhanced' THEN 5 WHEN p_tier='weakened' THEN 3 ELSE 4 END);
  seal_until timestamptz := stun_until+make_interval(secs=>CASE WHEN p_self THEN 3
    WHEN p_tier='enhanced' THEN 4 WHEN p_tier='weakened' THEN 2 ELSE 3 END);
  details jsonb := jsonb_build_object('source','thunder','bundleId',bundle_id,'selfPenalty',p_self,
    'tier',p_tier,'sealStartsAt',stun_until,'childId',p_child,'testOnly',true);
BEGIN
  IF ink_product_engine.ink_s5_phase1_enabled_v1(p_member.session_id) THEN
   RETURN ink_product_engine.ink_s5_phase1_thunder_v1(p_member,p_tier,p_self,p_at,p_receipt,p_child);
  END IF;
  INSERT INTO ink_product_engine.ink_s4_effects_v1(session_id,effect_id,participant_id,owner_epoch,kind,
    starts_at,expires_at,payload,opened_receipt_id)
  VALUES
    (p_member.session_id,bundle_id,p_member.participant_id,p_member.owner_epoch,'stun',p_at,stun_until,details,p_receipt),
    (p_member.session_id,gen_random_uuid(),p_member.participant_id,p_member.owner_epoch,'thunder_seal',p_at,seal_until,details,p_receipt);
  RETURN bundle_id;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_apply_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_apply_v1(ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_apply_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN EXISTS (SELECT FROM ink_product.rooms r WHERE r.session_id=(p_member).session_id
      AND r.binding->>'schemaVersion' IN ('candidate-v2','candidate-v3')
      AND r.binding->>'rulesVersion'='ink-s5-test-v1'
      AND r.binding->>'catalogVersion'='ink-s5-test-v1'
      AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
    THEN ink_product_engine.ink_s5_apply_v1_grant(p_member,p_operation,p_payload,p_at,p_receipt) ELSE ink_product_engine.ink_s5_apply_v1_legacy(p_member,p_operation,p_payload,p_at,p_receipt) END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_apply_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_apply_v1_grant(ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_apply_v1_grant(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_session uuid := p_member.session_id;
  v_grant ink_product_engine.ink_grants_v1;
  v_target ink_product_engine.ink_members_v1;
  v_base_keys text[] := ARRAY['grantId','expectedInventoryVersion'];
  v_attack boolean := p_operation IN ('lost_link','weakening','thunder');
  v_nav boolean := p_operation IN ('search','link_index','search_execute');
  v_extra boolean := p_operation IN ('search_execute','joker_claim');
  v_tier text;
  v_result jsonb;
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1(p_member.session_id)AND p_operation IN('search','search_execute')THEN RETURN ink_product_engine.ink_s5_phase2_search_v1(p_member,p_operation,p_payload,p_at,p_receipt);END IF;
  IF NOT ink_product_engine.ink_s5_enabled_v1(v_session) THEN
    RETURN jsonb_build_object('accepted',false,'code','S5_TEST_BINDING_REQUIRED');
  END IF;
  IF NOT v_extra THEN
    IF p_payload - (v_base_keys || CASE
        WHEN p_operation IN ('lost_link','weakening','thunder','thief','cannon') THEN ARRAY['targetParticipantId']
        WHEN p_operation='enhancement' THEN ARRAY['targetGrantIds']
        WHEN v_nav THEN ARRAY['expectedProgressVersion','expectedSnapshotId'] ELSE ARRAY[]::text[] END) <> '{}'::jsonb
      OR jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
      OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
    END IF;
    IF (p_payload->>'expectedInventoryVersion')::bigint<>p_member.inventory_version THEN
      RETURN jsonb_build_object('accepted',false,'code','STALE_INVENTORY');
    END IF;
    SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1 g
    WHERE (g.session_id,g.owner_participant_id,g.owner_epoch)=(v_session,p_member.participant_id,p_member.owner_epoch)
      AND g.grant_id=(p_payload->>'grantId')::uuid AND g.consumed_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','GRANT_NOT_OWNED'); END IF;
    IF v_grant.item_id<>p_operation THEN RETURN jsonb_build_object('accepted',false,'code','WRONG_ITEM_KIND'); END IF;
    IF p_operation IN ('lost_link','weakening','thunder','thief','cannon') THEN
      IF jsonb_typeof(p_payload->'targetParticipantId') IS DISTINCT FROM 'string' THEN
        RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
      END IF;
      SELECT * INTO v_target FROM ink_product_engine.ink_members_v1 m
      WHERE m.session_id=v_session AND m.participant_id=(p_payload->>'targetParticipantId')::uuid
        AND m.participant_id<>p_member.participant_id AND m.player_status='playing' AND m.member_role='player';
      IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE'); END IF;
    END IF;
    v_tier := ink_product_engine.ink_s5_grant_tier_v2(v_session,v_grant.grant_id,v_grant.base_tier);
  END IF;

  IF p_operation='enhancement' THEN
    v_result := ink_product_engine.ink_s5_enhancement_v2(p_member,v_grant.grant_id,p_payload,v_tier,p_at,p_receipt);
  ELSIF v_attack THEN
    v_result := ink_product_engine.ink_s5_attack_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,false);
    IF v_result->>'accepted' IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
    -- The grant debit can reference a root, so create a validated attack root first.
    v_result := ink_product_engine.ink_s5_attack_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,true);
  ELSIF v_nav THEN
    v_result := ink_product_engine.ink_s5_navigation_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,false);
  ELSE
    v_result := ink_product_engine.ink_s5_joker_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,false);
  END IF;
  IF v_result->>'accepted' IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
  IF NOT v_extra THEN
    PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,p_at,p_receipt,(v_result->>'rootId')::uuid);
  END IF;
  IF v_nav THEN
    v_result := ink_product_engine.ink_s5_navigation_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,true);
  ELSIF NOT v_attack AND p_operation<>'enhancement' THEN
    v_result := ink_product_engine.ink_s5_joker_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,true);
  END IF;
  IF v_result->>'accepted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'S5 apply diverged from admission'; END IF;
  RETURN v_result || jsonb_build_object('tier',v_tier,'s5TestOnly',true);
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s5_apply_v1_grant(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_apply_v1_legacy(ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_apply_v1_legacy(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_session uuid := p_member.session_id;
  v_grant ink_product_engine.ink_grants_v1;
  v_target ink_product_engine.ink_members_v1;
  v_base_keys text[] := ARRAY['grantId','expectedInventoryVersion'];
  v_attack boolean := p_operation IN ('lost_link','weakening','thunder');
  v_nav boolean := p_operation IN ('search','link_index','search_execute');
  v_extra boolean := p_operation IN ('search_execute','joker_claim');
  v_tier text;
  v_enhancement uuid;
  v_weakening uuid;
  v_result jsonb;
BEGIN
  IF NOT ink_product_engine.ink_s5_enabled_v1(v_session) THEN
    RETURN jsonb_build_object('accepted',false,'code','S5_TEST_BINDING_REQUIRED');
  END IF;
  IF NOT v_extra THEN
    IF p_payload - (v_base_keys || CASE
        WHEN p_operation IN ('lost_link','weakening','thunder','thief','cannon') THEN ARRAY['targetParticipantId']
        WHEN v_nav THEN ARRAY['expectedProgressVersion','expectedSnapshotId'] ELSE ARRAY[]::text[] END) <> '{}'::jsonb
      OR jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
      OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
    END IF;
    IF (p_payload->>'expectedInventoryVersion')::bigint<>p_member.inventory_version THEN
      RETURN jsonb_build_object('accepted',false,'code','STALE_INVENTORY');
    END IF;
    SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1 g
    WHERE (g.session_id,g.owner_participant_id,g.owner_epoch)=(v_session,p_member.participant_id,p_member.owner_epoch)
      AND g.grant_id=(p_payload->>'grantId')::uuid AND g.consumed_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','GRANT_NOT_OWNED'); END IF;
    IF v_grant.item_id<>p_operation THEN RETURN jsonb_build_object('accepted',false,'code','WRONG_ITEM_KIND'); END IF;
    IF p_operation IN ('lost_link','weakening','thunder','thief','cannon') THEN
      IF jsonb_typeof(p_payload->'targetParticipantId') IS DISTINCT FROM 'string' THEN
        RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
      END IF;
      SELECT * INTO v_target FROM ink_product_engine.ink_members_v1 m
      WHERE m.session_id=v_session AND m.participant_id=(p_payload->>'targetParticipantId')::uuid
        AND m.participant_id<>p_member.participant_id AND m.player_status='playing' AND m.member_role='player';
      IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE'); END IF;
    END IF;
    IF p_operation NOT IN ('enhancement','weakening') THEN
      v_enhancement := ink_product_engine.ink_s5_modifier_id_v1(p_member,'enhancement',p_at);
      v_weakening := ink_product_engine.ink_s5_modifier_id_v1(p_member,'weakening',p_at);
    END IF;
    v_tier := ink_product_engine.ink_s5_tier_v1(v_grant.base_tier,v_enhancement,v_weakening);
    IF v_tier IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_MODIFIER_TRANSITION'); END IF;
  END IF;

  IF p_operation='enhancement' THEN
    IF v_tier<>'normal' THEN RETURN jsonb_build_object('accepted',false,'code','S5_TIER_UNAVAILABLE'); END IF;
    IF ink_product_engine.ink_s5_modifier_id_v1(p_member,'enhancement',p_at) IS NOT NULL THEN
      RETURN jsonb_build_object('accepted',false,'code','S5_MODIFIER_ACTIVE');
    END IF;
    v_result := jsonb_build_object('accepted',true,'code','ENHANCEMENT_ACTIVE',
      'rightId',ink_product_engine.ink_s5_install_modifier_v1(p_member,'enhancement',p_at,p_receipt));
  ELSIF v_attack THEN
    v_result := ink_product_engine.ink_s5_attack_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,false);
    IF v_result->>'accepted' IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
    -- The grant debit can reference a root, so create a validated attack root first.
    v_result := ink_product_engine.ink_s5_attack_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,true);
  ELSIF v_nav THEN
    v_result := ink_product_engine.ink_s5_navigation_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,false);
  ELSE
    v_result := ink_product_engine.ink_s5_joker_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,false);
  END IF;
  IF v_result->>'accepted' IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
  IF NOT v_extra THEN
    PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,p_at,p_receipt,(v_result->>'rootId')::uuid);
    PERFORM ink_product_engine.ink_s5_debit_modifiers_v1(v_session,p_receipt,ARRAY[v_enhancement,v_weakening]);
  END IF;
  IF v_nav THEN
    v_result := ink_product_engine.ink_s5_navigation_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,true);
  ELSIF NOT v_attack AND p_operation<>'enhancement' THEN
    v_result := ink_product_engine.ink_s5_joker_v1(v_session,p_member,v_target,p_operation,p_payload,p_at,p_receipt,v_tier,true);
  END IF;
  IF v_result->>'accepted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'S5 apply diverged from admission'; END IF;
  RETURN v_result || jsonb_build_object('tier',v_tier,'s5TestOnly',true);
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s5_apply_v1_legacy(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_assign_modifier_v2(ink_product_engine.ink_members_v1, text, integer, uuid[], timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_assign_modifier_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_count integer, p_grants uuid[], p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_right uuid;
BEGIN
  IF p_count NOT IN (1,2) OR cardinality(p_grants)>p_count OR p_member.player_status<>'playing' THEN
    RAISE EXCEPTION 'Invalid final S5 modifier assignment';
  END IF;
  INSERT INTO ink_product_engine.ink_s5_modifiers_v1
    (session_id,participant_id,owner_epoch,kind,installed_at,expires_at,source_receipt,quantity)
  VALUES (p_member.session_id,p_member.participant_id,p_member.owner_epoch,p_kind,p_at,'infinity',p_receipt,p_count)
  RETURNING right_id INTO STRICT v_right;
  INSERT INTO ink_product_engine.ink_s5_modifier_units_v1(session_id,right_id,kind,unit,grant_id,bound_at)
    SELECT p_member.session_id,v_right,p_kind,n,p_grants[n],CASE WHEN p_grants[n] IS NOT NULL THEN p_at END
    FROM generate_series(1,p_count) n;
  IF cardinality(p_grants)>0 THEN
    UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1
    WHERE (session_id,participant_id,owner_epoch)=(p_member.session_id,p_member.participant_id,p_member.owner_epoch);
  END IF;
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
  RETURN jsonb_build_object('rightId',v_right,'assignedGrantIds',p_grants,'pendingCharges',p_count-cardinality(p_grants));
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_assign_modifier_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_count integer, p_grants uuid[], p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_attack_v1(uuid, ink_product_engine.ink_members_v1, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_attack_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN EXISTS (SELECT FROM ink_product.rooms r WHERE r.session_id=p_session
      AND r.binding->>'schemaVersion' IN ('candidate-v2','candidate-v3')
      AND r.binding->>'rulesVersion'='ink-s5-test-v1'
      AND r.binding->>'catalogVersion'='ink-s5-test-v1'
      AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
    THEN ink_product_engine.ink_s5_attack_v1_grant(p_session,p_member,p_target,p_operation,p_payload,p_at,p_receipt,p_tier,p_apply) ELSE ink_product_engine.ink_s5_attack_v1_legacy(p_session,p_member,p_target,p_operation,p_payload,p_at,p_receipt,p_tier,p_apply) END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_attack_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_attack_v1_grant(uuid, ink_product_engine.ink_members_v1, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_attack_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  attack_seq bigint;
  grant_tier text;
  window_ms integer;
  deadline timestamptz;
  child uuid;
  effect uuid;
  draw_outcome jsonb := '{}'::jsonb;
  roll integer;
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1(p_session)AND p_operation='lost_link'AND p_tier='enhanced'AND cardinality(ink_product_engine.ink_s5_lost_link_plan_v2(p_target,p_at,p_receipt,true,false))<>2 THEN RETURN jsonb_build_object('accepted',false,'code','LOST_LINK_TWO_HOPS_REQUIRED');END IF;
  IF p_operation NOT IN ('lost_link','weakening','thunder') OR p_tier NOT IN ('normal','enhanced','weakened') THEN
    RAISE EXCEPTION 'Unknown S5 attack or tier';
  END IF;
  IF p_operation='weakening' AND ink_product_engine.ink_s5_phase1_enabled_v1(p_session) THEN
   IF p_target.session_id IS DISTINCT FROM p_session OR p_target.player_status IS DISTINCT FROM 'playing'
    OR p_target.member_role IS DISTINCT FROM 'player' OR p_target.participant_id=p_member.participant_id THEN
    RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE');
   END IF;
   IF NOT p_apply THEN RETURN jsonb_build_object('accepted',true,'code','S5_ATTACK_READY'); END IF;
   IF p_tier='weakened' THEN
    roll:=ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'weakening/weakened',100);
    IF roll>=60 THEN RETURN jsonb_build_object('accepted',true,'code','WEAKENING_CHANCE_FAILED','chanceRoll',roll,'chanceSuccess',false); END IF;
   END IF;
   RETURN jsonb_build_object('accepted',true,'code','WEAKENING_APPLIED','chanceRoll',roll,'chanceSuccess',true)
    || ink_product_engine.ink_s5_weakening_v2(p_target,p_tier,p_at,p_receipt);
  END IF;
  IF p_target.session_id IS DISTINCT FROM p_session OR p_target.player_status IS DISTINCT FROM 'playing'
     OR p_target.member_role IS DISTINCT FROM 'player' OR p_target.participant_id=p_member.participant_id THEN
    RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE');
  END IF;
  IF p_operation='lost_link' AND cardinality(ink_product_engine.ink_s5_lost_link_candidates_v1(p_target,p_at))=0 THEN
    RETURN jsonb_build_object('accepted',false,'code','LOST_LINK_NO_ELIGIBLE_DESTINATION');
  END IF;
  IF NOT p_apply THEN RETURN jsonb_build_object('accepted',true,'code','S5_ATTACK_READY'); END IF;

  IF p_operation='weakening' AND p_tier='weakened' THEN
    roll := ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'weakening/weakened',100);
    draw_outcome := jsonb_build_object('chanceRoll',roll,'chanceSuccess',roll<60);
    IF roll>=60 THEN
      RETURN jsonb_build_object('accepted',true,'code','WEAKENING_CHANCE_FAILED') || draw_outcome;
    END IF;
  END IF;

  -- Only accepted Thunder may draw. Self-penalty has no warning or second defense path.
  IF p_operation='thunder' THEN
    IF ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'thunder-success',10000)>=5000 THEN
      effect := ink_product_engine.ink_s5_apply_thunder_v1(p_member,p_tier,true,p_at,p_receipt,NULL);
      PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
      RETURN jsonb_build_object('accepted',true,'code','THUNDER_SELF_PENALTY','itemId',p_operation,
        'tier',p_tier,'effectId',effect,'jokerOutcome','failure','testOnly',true);
    END IF;
    IF p_tier='weakened' AND ink_product_engine.ink_s5_phase1_enabled_v1(p_session) THEN
     effect:=ink_product_engine.ink_s5_apply_thunder_v1(p_member,p_tier,false,p_at,p_receipt,NULL);
     PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
     RETURN jsonb_build_object('accepted',true,'code','THUNDER_SELF_STUN','itemId','thunder','tier',p_tier,
      'effectId',effect,'jokerOutcome','success','selfEffect',true);
    END IF;
    draw_outcome := jsonb_build_object('jokerOutcome','success');
  END IF;

  SELECT p.warning_window_ms INTO STRICT window_ms FROM ink_product.rooms r JOIN ink_product.policies p USING(binding)
    WHERE r.session_id=p_session;
  IF window_ms NOT IN (1500,2000) THEN RAISE EXCEPTION 'Unsupported S5 warning window'; END IF;
  deadline := p_at+window_ms*interval '1 millisecond';
  child := gen_random_uuid();
  SELECT base_tier INTO STRICT grant_tier FROM ink_product_engine.ink_grants_v1
    WHERE session_id=p_session AND grant_id=(p_payload->>'grantId')::uuid;
  UPDATE ink_product_engine.ink_sessions_v1 SET next_acceptance_seq=next_acceptance_seq+1
    WHERE session_id=p_session RETURNING next_acceptance_seq-1 INTO STRICT attack_seq;
  INSERT INTO ink_product_engine.ink_attack_roots_v1(session_id,root_id,source_participant_id,source_epoch,grant_id,
    acceptance_seq,accepted_at,due_at,base_tier,effective_tier,acceptance_receipt_id)
  VALUES(p_session,p_receipt,p_member.participant_id,p_member.owner_epoch,(p_payload->>'grantId')::uuid,
    attack_seq,p_at,deadline,grant_tier,p_tier,p_receipt);
  INSERT INTO ink_product_engine.ink_attack_children_v1(session_id,child_id,root_id,target_participant_id,target_epoch,state,warning_event_seq)
  VALUES(p_session,child,p_receipt,p_target.participant_id,p_target.owner_epoch,'pending',
    ink_product_engine.ink_s2_next_event_v1(p_session,p_target.participant_id));
  IF p_operation='lost_link' THEN
    INSERT INTO ink_product_engine.ink_s5_lost_link_frames_v1 VALUES
      (p_session,p_receipt,p_member.progress_version,p_target.progress_version);
  END IF;
  RETURN jsonb_build_object('accepted',true,'code','ATTACK_ACCEPTED','rootId',p_receipt,'dueAt',deadline,
    'acceptanceSeq',attack_seq::text,'tier',p_tier,'itemId',p_operation,'testOnly',true,
    'children',jsonb_build_array(jsonb_build_object('childId',child,'targetParticipantId',p_target.participant_id))) || draw_outcome;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_attack_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_attack_v1_legacy(uuid, ink_product_engine.ink_members_v1, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_attack_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  attack_seq bigint;
  grant_tier text;
  window_ms integer;
  deadline timestamptz;
  child uuid;
  effect uuid;
  draw_outcome jsonb := '{}'::jsonb;
BEGIN
  IF p_operation NOT IN ('lost_link','weakening','thunder') OR p_tier NOT IN ('normal','enhanced','weakened') THEN
    RAISE EXCEPTION 'Unknown S5 attack or tier';
  END IF;
  IF (p_operation='weakening' AND p_tier<>'normal') OR (p_operation='lost_link' AND p_tier='enhanced') THEN
    RETURN jsonb_build_object('accepted',false,'code','S5_TIER_UNAVAILABLE');
  END IF;
  IF p_target.session_id IS DISTINCT FROM p_session OR p_target.player_status IS DISTINCT FROM 'playing'
     OR p_target.member_role IS DISTINCT FROM 'player' OR p_target.participant_id=p_member.participant_id THEN
    RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE');
  END IF;
  IF p_operation='lost_link' AND cardinality(ink_product_engine.ink_s5_lost_link_candidates_v1(p_target,p_at))=0 THEN
    RETURN jsonb_build_object('accepted',false,'code','LOST_LINK_NO_ELIGIBLE_DESTINATION');
  END IF;
  IF p_operation='weakening' AND ink_product_engine.ink_s5_modifier_id_v1(p_target,'weakening',p_at) IS NOT NULL THEN
    RETURN jsonb_build_object('accepted',false,'code','MODIFIER_ALREADY_ACTIVE');
  END IF;
  IF NOT p_apply THEN RETURN jsonb_build_object('accepted',true,'code','S5_ATTACK_READY'); END IF;

  -- Only accepted Thunder may draw. Self-penalty has no warning or second defense path.
  IF p_operation='thunder' THEN
    IF ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'thunder-success',10000)>=5000 THEN
      effect := ink_product_engine.ink_s5_apply_thunder_v1(p_member,p_tier,true,p_at,p_receipt,NULL);
      PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
      RETURN jsonb_build_object('accepted',true,'code','THUNDER_SELF_PENALTY','itemId',p_operation,
        'tier',p_tier,'effectId',effect,'jokerOutcome','failure','testOnly',true);
    END IF;
    draw_outcome := jsonb_build_object('jokerOutcome','success');
  END IF;

  SELECT p.warning_window_ms INTO STRICT window_ms FROM ink_product.rooms r JOIN ink_product.policies p USING(binding)
    WHERE r.session_id=p_session;
  IF window_ms NOT IN (1500,2000) THEN RAISE EXCEPTION 'Unsupported S5 warning window'; END IF;
  deadline := p_at+window_ms*interval '1 millisecond';
  child := gen_random_uuid();
  SELECT base_tier INTO STRICT grant_tier FROM ink_product_engine.ink_grants_v1
    WHERE session_id=p_session AND grant_id=(p_payload->>'grantId')::uuid;
  UPDATE ink_product_engine.ink_sessions_v1 SET next_acceptance_seq=next_acceptance_seq+1
    WHERE session_id=p_session RETURNING next_acceptance_seq-1 INTO STRICT attack_seq;
  INSERT INTO ink_product_engine.ink_attack_roots_v1(session_id,root_id,source_participant_id,source_epoch,grant_id,
    acceptance_seq,accepted_at,due_at,base_tier,effective_tier,acceptance_receipt_id)
  VALUES(p_session,p_receipt,p_member.participant_id,p_member.owner_epoch,(p_payload->>'grantId')::uuid,
    attack_seq,p_at,deadline,grant_tier,p_tier,p_receipt);
  INSERT INTO ink_product_engine.ink_attack_children_v1(session_id,child_id,root_id,target_participant_id,target_epoch,state,warning_event_seq)
  VALUES(p_session,child,p_receipt,p_target.participant_id,p_target.owner_epoch,'pending',
    ink_product_engine.ink_s2_next_event_v1(p_session,p_target.participant_id));
  IF p_operation='lost_link' THEN
    INSERT INTO ink_product_engine.ink_s5_lost_link_frames_v1 VALUES
      (p_session,p_receipt,p_member.progress_version,p_target.progress_version);
  END IF;
  RETURN jsonb_build_object('accepted',true,'code','ATTACK_ACCEPTED','rootId',p_receipt,'dueAt',deadline,
    'acceptanceSeq',attack_seq::text,'tier',p_tier,'itemId',p_operation,'testOnly',true,
    'children',jsonb_build_array(jsonb_build_object('childId',child,'targetParticipantId',p_target.participant_id))) || draw_outcome;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_attack_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_bind_pending_v2(); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_bind_pending_v2() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.source_round IS NULL THEN RETURN NEW; END IF;
  WITH pending AS (
    SELECT DISTINCT ON (u.kind) u.session_id,u.right_id,u.unit
    FROM ink_product_engine.ink_s5_modifier_units_v1 u
    JOIN ink_product_engine.ink_s5_modifiers_v1 r USING (session_id,right_id,kind)
    WHERE (r.session_id,r.participant_id,r.owner_epoch)=(NEW.session_id,NEW.owner_participant_id,NEW.owner_epoch)
      AND u.grant_id IS NULL
    ORDER BY u.kind,r.installed_at,r.right_id,u.unit
  )
  UPDATE ink_product_engine.ink_s5_modifier_units_v1 u SET grant_id=NEW.grant_id,bound_at=NEW.granted_at
  FROM pending p WHERE (u.session_id,u.right_id,u.unit)=(p.session_id,p.right_id,p.unit);
  RETURN NEW;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_bind_pending_v2() OWNER TO ink_product_owner;

--
-- Name: ink_s5_close_modifier_units_v2(); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_close_modifier_units_v2() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO ink_product_engine.ink_s5_modifier_uses_v1(session_id,right_id,use_receipt,unit,grant_policy)
    SELECT session_id,right_id,NEW.consumed_receipt_id,unit,true FROM ink_product_engine.ink_s5_modifier_units_v1
    WHERE (session_id,grant_id)=(NEW.session_id,NEW.grant_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_close_modifier_units_v2() OWNER TO ink_product_owner;

--
-- Name: ink_s4_effects_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s4_effects_v1 (
    session_id uuid NOT NULL,
    effect_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    kind text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    progress_version bigint,
    page_id text,
    revision_id text,
    payload jsonb NOT NULL,
    opened_receipt_id uuid NOT NULL,
    closed_at timestamp with time zone,
    closed_receipt_id uuid,
    CONSTRAINT ink_effects_s5_kind CHECK (((kind = ANY (ARRAY['censor'::text, 'stun'::text, 'trap_seal'::text, 'correction_protection'::text])) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (kind = 'thunder_seal'::text)))),
    CONSTRAINT ink_s4_effects_v1_check CHECK ((isfinite(expires_at) AND (expires_at > starts_at))),
    CONSTRAINT ink_s4_effects_v1_check1 CHECK (((closed_at IS NULL) = (closed_receipt_id IS NULL))),
    CONSTRAINT ink_s4_effects_v1_check2 CHECK (((closed_at IS NULL) OR (isfinite(closed_at) AND (closed_at >= starts_at)))),
    CONSTRAINT ink_s4_effects_v1_check3 CHECK ((((progress_version IS NULL) AND (page_id IS NULL) AND (revision_id IS NULL)) OR ((progress_version IS NOT NULL) AND (progress_version >= 0) AND (page_id IS NOT NULL) AND (revision_id IS NOT NULL)))),
    CONSTRAINT ink_s4_effects_v1_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT ink_s4_effects_v1_session_id_check CHECK (ink_product_engine.ink_s4_fixture_id_v1(session_id)),
    CONSTRAINT ink_s4_effects_v1_starts_at_check CHECK (isfinite(starts_at))
);

ALTER TABLE ONLY ink_product_engine.ink_s4_effects_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s4_effects_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_close_thunder_v1(uuid, ink_product_engine.ink_s4_effects_v1, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_close_thunder_v1(p_session uuid, p_effect ink_product_engine.ink_s4_effects_v1, p_at timestamp with time zone, p_receipt uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  UPDATE ink_product_engine.ink_s4_effects_v1 e SET closed_at=p_at,closed_receipt_id=p_receipt
  WHERE e.session_id=p_session AND e.session_id=(p_effect).session_id
    AND e.participant_id=(p_effect).participant_id AND e.owner_epoch=(p_effect).owner_epoch
    AND e.kind IN ('stun','thunder_seal') AND e.closed_at IS NULL AND e.starts_at<=p_at AND p_at<e.expires_at
    AND (p_effect).payload->>'source'='thunder' AND (e.payload->>'bundleId'=(p_effect).payload->>'bundleId'
     OR (ink_product_engine.ink_s5_phase1_enabled_v1(p_session) AND e.payload->>'source'='thunder'))
$$;


ALTER FUNCTION ink_product_engine.ink_s5_close_thunder_v1(p_session uuid, p_effect ink_product_engine.ink_s4_effects_v1, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_debit_modifiers_v1(uuid, uuid, uuid[]); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_debit_modifiers_v1(p_session uuid, p_receipt uuid, p_rights uuid[]) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  INSERT INTO ink_product_engine.ink_s5_modifier_uses_v1(session_id,right_id,use_receipt,unit)
  SELECT p_session,r.right_id,p_receipt,1+(SELECT count(*) FROM ink_product_engine.ink_s5_modifier_uses_v1 u
    WHERE (u.session_id,u.right_id)=(p_session,r.right_id))
  FROM unnest(p_rights) AS r(right_id) WHERE r.right_id IS NOT NULL
$$;


ALTER FUNCTION ink_product_engine.ink_s5_debit_modifiers_v1(p_session uuid, p_receipt uuid, p_rights uuid[]) OWNER TO ink_product_owner;

--
-- Name: ink_s5_defense_bonus_v1(ink_product_engine.ink_members_v1, uuid, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_defense_bonus_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_at timestamp with time zone, p_receipt uuid, p_domain text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_pool constant text[] := ARRAY['ink','parry','shield','bookmark','undo','censor','correction','trap','search','link_index'];
  v_item text;
  v_candidate uuid := gen_random_uuid();
BEGIN
  v_item := v_pool[1+ink_product_engine.ink_s5_draw_v1(p_member.session_id,p_offer,p_domain,cardinality(v_pool))];
  INSERT INTO ink_product_engine.ink_s5_joker_candidates_v1
    (session_id,offer_id,candidate_id,ordinal,participant_id,owner_epoch,item_id,base_tier,offered_at)
  VALUES (p_member.session_id,p_offer,v_candidate,1,p_member.participant_id,p_member.owner_epoch,v_item,'normal',p_at);
  IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(p_member))>0 THEN
    RETURN jsonb_build_object('itemId',v_item,'grants',
      ink_product_engine.ink_s5_deliver_candidates_v1(p_member,p_offer,ARRAY[v_candidate],p_at,p_receipt));
  END IF;
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
  RETURN jsonb_build_object('itemId',v_item,'offerId',p_offer);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_defense_bonus_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_at timestamp with time zone, p_receipt uuid, p_domain text) OWNER TO ink_product_owner;

--
-- Name: ink_s5_deliver_candidates_v1(ink_product_engine.ink_members_v1, uuid, uuid[], timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_deliver_candidates_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_chosen uuid[], p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_candidate ink_product_engine.ink_s5_joker_candidates_v1;
  v_slots smallint[] := ink_product_engine.ink_s5_joker_free_slots_v1(p_member);
  v_delivered integer := 0;
  v_grant uuid;
  v_result jsonb := '[]';
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1(p_member.session_id)THEN RETURN ink_product_engine.ink_s5_phase2_deliver_v1(p_member,cardinality(p_chosen),p_at,p_receipt);END IF;
  FOR v_candidate IN SELECT c.* FROM ink_product_engine.ink_s5_joker_candidates_v1 c
    WHERE (c.session_id,c.offer_id,c.participant_id,c.owner_epoch)=
      (p_member.session_id,p_offer,p_member.participant_id,p_member.owner_epoch)
      AND c.resolved_receipt_id IS NULL ORDER BY c.ordinal
  LOOP
    v_grant := NULL;
    IF v_candidate.candidate_id=ANY(p_chosen) THEN
      v_delivered := v_delivered+1;
      IF v_delivered>cardinality(v_slots) THEN RAISE EXCEPTION 'S5 offer capacity changed'; END IF;
      v_grant := gen_random_uuid();
      INSERT INTO ink_product_engine.ink_grants_v1
        (session_id,grant_id,owner_participant_id,owner_epoch,item_id,base_tier,slot_index,granted_at)
      VALUES (p_member.session_id,v_grant,p_member.participant_id,p_member.owner_epoch,
        v_candidate.item_id,v_candidate.base_tier,v_slots[v_delivered],p_at);
      v_result := v_result || jsonb_build_array(jsonb_build_object('grantId',v_grant,'itemId',v_candidate.item_id,
        'tier',v_candidate.base_tier,'slotIndex',v_slots[v_delivered]));
    END IF;
    UPDATE ink_product_engine.ink_s5_joker_candidates_v1
      SET resolved_receipt_id=p_receipt,delivered_grant_id=v_grant
      WHERE session_id=p_member.session_id AND offer_id=p_offer AND candidate_id=v_candidate.candidate_id;
  END LOOP;
  IF v_delivered<>cardinality(p_chosen) THEN RAISE EXCEPTION 'S5 offer candidates changed'; END IF;
  UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+v_delivered
    WHERE session_id=p_member.session_id AND participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch;
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
  RETURN v_result;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_deliver_candidates_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_chosen uuid[], p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_draw_v1(uuid, uuid, text, integer); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_draw_v1(p_session uuid, p_receipt uuid, p_domain text, p_bound integer) RETURNS integer
    LANGUAGE plpgsql STABLE STRICT
    SET search_path TO ''
    AS $$
DECLARE v_seed bytea; v_roll bigint; v_retry integer := 0;
BEGIN
  IF p_bound<1 OR NOT ink_product_engine.ink_s5_enabled_v1(p_session) THEN RAISE EXCEPTION 'S5 draw unavailable'; END IF;
  SELECT private_rng_seed INTO STRICT v_seed FROM ink_product_engine.ink_s3_sessions_v1 WHERE session_id=p_session;
  LOOP
    v_roll := ('x'||substr(encode(sha256(v_seed||convert_to(
      jsonb_build_array(p_session,p_receipt,p_domain,v_retry)::text,'UTF8')),'hex'),1,8))::bit(32)::bigint;
    IF v_roll<4294967296-(4294967296%p_bound) THEN RETURN (v_roll%p_bound)::integer; END IF;
    v_retry := v_retry+1;
  END LOOP;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_draw_v1(p_session uuid, p_receipt uuid, p_domain text, p_bound integer) OWNER TO ink_product_owner;

--
-- Name: ink_s5_enhancement_v2(ink_product_engine.ink_members_v1, uuid, jsonb, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_enhancement_v2(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_payload jsonb, p_tier text, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  amount integer := CASE WHEN p_tier='enhanced' THEN 2 ELSE 1 END;
  eligible uuid[] := ink_product_engine.ink_s5_modifier_eligible_v2(p_member,'enhancement',p_grant);
  selected jsonb := coalesce(p_payload->'targetGrantIds','[]'::jsonb);
  grants uuid[];
  roll integer;
BEGIN
  IF jsonb_typeof(selected)<>'array' THEN
    RETURN jsonb_build_object('accepted',false,'code','INVALID_MODIFIER_SELECTION');
  END IF;
  SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO grants FROM jsonb_array_elements_text(selected);
  IF cardinality(grants)<>least(amount,cardinality(eligible)) OR
    NOT grants <@ eligible OR cardinality(grants)<>(SELECT count(DISTINCT id) FROM unnest(grants) id) THEN
    RETURN jsonb_build_object('accepted',false,'code','INVALID_MODIFIER_SELECTION');
  END IF;
  IF p_tier='weakened' THEN
    roll:=ink_product_engine.ink_s5_draw_v1(p_member.session_id,p_receipt,'enhancement/weakened',100);
    IF roll>=60 THEN
      RETURN jsonb_build_object('accepted',true,'code','ENHANCEMENT_CHANCE_FAILED','chanceRoll',roll,'chanceSuccess',false);
    END IF;
  END IF;
  RETURN jsonb_build_object('accepted',true,'code','ENHANCEMENT_ACTIVE','chanceRoll',roll,'chanceSuccess',true)
    || ink_product_engine.ink_s5_assign_modifier_v2(p_member,'enhancement',amount,grants,p_at,p_receipt);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_enhancement_v2(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_payload jsonb, p_tier text, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_force_move_v1(ink_product_engine.ink_members_v1, text, text, integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_force_move_v1(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_next ink_product.wiki_snapshots; v_move uuid := gen_random_uuid(); v_seq bigint;
BEGIN
  IF p_operation NOT IN ('lost_link','cannon') OR p_count NOT IN (0,1)
    OR p_member.player_status<>'playing' OR p_page=p_member.current_page_id
    OR NOT ink_product_engine.ink_s5_enabled_v1(p_member.session_id) THEN RAISE EXCEPTION 'Invalid S5 forced move'; END IF;
  v_next := ink_product.course_document(p_member.session_id,p_page);
  IF v_next.id IS NULL OR ink_product.course_is_goal(p_member.session_id,v_next.page_id,v_next.revision_id) THEN
    RAISE EXCEPTION 'S5 forced move destination unavailable';
  END IF;
  INSERT INTO ink_product_engine.ink_moves_v1(session_id,move_id,actor_participant_id,actor_epoch,receipt_id,operation,
    from_page_id,from_revision_id,to_page_id,to_revision_id,version_before,version_after,move_count_after,logical_at)
  VALUES (p_member.session_id,v_move,p_member.participant_id,p_member.owner_epoch,p_receipt,p_operation,
    p_member.current_page_id,p_member.current_revision_id,v_next.page_id,v_next.revision_id,
    p_member.progress_version,p_member.progress_version+1,p_member.move_count+p_count,p_at);
  UPDATE ink_product_engine.ink_members_v1 SET current_page_id=v_next.page_id,current_revision_id=v_next.revision_id,
    progress_version=progress_version+1,move_count=move_count+p_count
  WHERE (session_id,participant_id,owner_epoch,progress_version)=
    (p_member.session_id,p_member.participant_id,p_member.owner_epoch,p_member.progress_version);
  IF NOT FOUND THEN RAISE EXCEPTION 'S5 forced move frame changed'; END IF;
  UPDATE ink_product.members m SET snapshot_id=v_next.id,progress_version=p_member.progress_version+1
  FROM ink_product.rooms r WHERE r.session_id=p_member.session_id AND (m.room_id,m.participant_id,m.owner_epoch)=
    (r.id,p_member.participant_id,p_member.owner_epoch) AND m.status='playing';
  IF NOT FOUND THEN RAISE EXCEPTION 'S5 forced move participant unavailable'; END IF;
  v_seq := ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
  RETURN jsonb_build_object('moveId',v_move,'pageId',v_next.page_id,'revisionId',v_next.revision_id,
    'snapshotId',v_next.id,'movementKind','forced','progressVersion',(p_member.progress_version+1)::text,
    'moveCount',p_member.move_count+p_count,'eventSeq',v_seq::text);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_force_move_v1(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_force_step_v2(ink_product_engine.ink_members_v1, text, text, integer, timestamp with time zone, uuid, smallint); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_force_step_v2(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid, p_step smallint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_next ink_product.wiki_snapshots; v_move uuid := gen_random_uuid(); v_seq bigint;
BEGIN
  IF p_operation NOT IN ('lost_link','cannon') OR p_count NOT IN (0,1)
    OR p_member.player_status<>'playing' OR p_page=p_member.current_page_id
    OR NOT ink_product_engine.ink_s5_enabled_v1(p_member.session_id) THEN RAISE EXCEPTION 'Invalid S5 forced move'; END IF;
  v_next := ink_product.course_document(p_member.session_id,p_page);
  IF v_next.id IS NULL OR ink_product.course_is_goal(p_member.session_id,v_next.page_id,v_next.revision_id) THEN
    RAISE EXCEPTION 'S5 forced move destination unavailable';
  END IF;
  INSERT INTO ink_product_engine.ink_moves_v1(session_id,move_id,actor_participant_id,actor_epoch,receipt_id,operation,receipt_step,
    from_page_id,from_revision_id,to_page_id,to_revision_id,version_before,version_after,move_count_after,logical_at)
  VALUES (p_member.session_id,v_move,p_member.participant_id,p_member.owner_epoch,p_receipt,p_operation,p_step,
    p_member.current_page_id,p_member.current_revision_id,v_next.page_id,v_next.revision_id,
    p_member.progress_version,p_member.progress_version+1,p_member.move_count+p_count,p_at);
  UPDATE ink_product_engine.ink_members_v1 SET current_page_id=v_next.page_id,current_revision_id=v_next.revision_id,
    progress_version=progress_version+1,move_count=move_count+p_count
  WHERE (session_id,participant_id,owner_epoch,progress_version)=
    (p_member.session_id,p_member.participant_id,p_member.owner_epoch,p_member.progress_version);
  IF NOT FOUND THEN RAISE EXCEPTION 'S5 forced move frame changed'; END IF;
  UPDATE ink_product.members m SET snapshot_id=v_next.id,progress_version=p_member.progress_version+1
  FROM ink_product.rooms r WHERE r.session_id=p_member.session_id AND (m.room_id,m.participant_id,m.owner_epoch)=
    (r.id,p_member.participant_id,p_member.owner_epoch) AND m.status='playing';
  IF NOT FOUND THEN RAISE EXCEPTION 'S5 forced move participant unavailable'; END IF;
  v_seq := ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
  RETURN jsonb_build_object('moveId',v_move,'pageId',v_next.page_id,'revisionId',v_next.revision_id,
    'snapshotId',v_next.id,'movementKind','forced','progressVersion',(p_member.progress_version+1)::text,
    'moveCount',p_member.move_count+p_count,'eventSeq',v_seq::text);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_force_step_v2(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid, p_step smallint) OWNER TO ink_product_owner;

--
-- Name: ink_s5_grant_modifiers_v2(uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_grant_modifiers_v2(p_session uuid, p_grant uuid) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(array_agg(u.kind ORDER BY u.kind),ARRAY[]::text[])
  FROM ink_product_engine.ink_s5_modifier_units_v1 u
  WHERE (u.session_id,u.grant_id)=(p_session,p_grant)
$$;


ALTER FUNCTION ink_product_engine.ink_s5_grant_modifiers_v2(p_session uuid, p_grant uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_grant_tier_v2(uuid, uuid, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_grant_tier_v2(p_session uuid, p_grant uuid, p_base text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN cardinality(kinds)=2 THEN 'normal'
    WHEN 'enhancement'=ANY(kinds) THEN 'enhanced'
    WHEN 'weakening'=ANY(kinds) THEN 'weakened'
    ELSE p_base END
  FROM ink_product_engine.ink_s5_grant_modifiers_v2(p_session,p_grant) AS kinds
$$;


ALTER FUNCTION ink_product_engine.ink_s5_grant_tier_v2(p_session uuid, p_grant uuid, p_base text) OWNER TO ink_product_owner;

--
-- Name: ink_s5_install_modifier_v1(ink_product_engine.ink_members_v1, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_install_modifier_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone, p_receipt uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_right uuid;
BEGIN
  IF ink_product_engine.ink_s5_modifier_id_v1(p_member,p_kind,p_at) IS NOT NULL THEN
    RAISE EXCEPTION 'S5 modifier is already active';
  END IF;
  -- The 20-second lifetime and no replacement are isolated test policies.
  INSERT INTO ink_product_engine.ink_s5_modifiers_v1
    (session_id,participant_id,owner_epoch,kind,installed_at,expires_at,source_receipt)
  VALUES (p_member.session_id,p_member.participant_id,p_member.owner_epoch,p_kind,p_at,p_at+interval '20 seconds',p_receipt)
  RETURNING right_id INTO STRICT v_right;
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
  RETURN v_right;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_install_modifier_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_is_sealed_v1(ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_is_sealed_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT FROM ink_product_engine.ink_s4_effects_v1 e WHERE e.session_id=(p_member).session_id
      AND e.participant_id=(p_member).participant_id AND e.owner_epoch=(p_member).owner_epoch
      AND e.kind='thunder_seal' AND e.closed_at IS NULL
      AND (e.payload->>'sealStartsAt')::timestamptz<=p_at AND p_at<e.expires_at
  )
$$;


ALTER FUNCTION ink_product_engine.ink_s5_is_sealed_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_joker_free_slots_v1(ink_product_engine.ink_members_v1); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_joker_free_slots_v1(p_member ink_product_engine.ink_members_v1) RETURNS smallint[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT ARRAY(
    SELECT candidate.slot::smallint FROM (VALUES (0),(1)) AS candidate(slot)
    WHERE NOT EXISTS (SELECT FROM ink_product_engine.ink_grants_v1 g
      WHERE (g.session_id,g.owner_participant_id,g.owner_epoch)=
        ((p_member).session_id,(p_member).participant_id,(p_member).owner_epoch)
        AND g.consumed_at IS NULL AND g.slot_index=candidate.slot)
    ORDER BY candidate.slot)
$$;


ALTER FUNCTION ink_product_engine.ink_s5_joker_free_slots_v1(p_member ink_product_engine.ink_members_v1) OWNER TO ink_product_owner;

--
-- Name: ink_s5_joker_state_v1(uuid, ink_product_engine.ink_members_v1); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_joker_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT CASE WHEN NOT ink_product_engine.ink_s5_phase2_enabled_v1(p_session)THEN ink_product_engine.ink_s5_joker_state_v1_pre_phase2(p_session,p_member)ELSE
 (ink_product_engine.ink_s5_joker_state_v1_pre_phase2(p_session,p_member)-'jokerOffers')||jsonb_build_object('jokerOffers',coalesce((SELECT jsonb_agg(offer ORDER BY seq)FROM(
 SELECT min(q.sequence)seq,jsonb_build_object('offerId',c.offer_id,'expiresAt',min(q.expires_at),'candidates',jsonb_agg(jsonb_build_object('candidateId',c.candidate_id,'itemId',c.item_id,'tier',c.base_tier,'sequence',q.sequence,'expiresAt',q.expires_at)ORDER BY q.sequence))offer
 FROM ink_product_engine.ink_s5_phase2_rewards_v1 q JOIN ink_product_engine.ink_s5_joker_candidates_v1 c USING(session_id,offer_id,candidate_id)
 WHERE c.session_id=p_session AND c.participant_id=p_member.participant_id AND c.owner_epoch=p_member.owner_epoch AND q.closed_at IS NULL AND c.resolved_receipt_id IS NULL AND clock_timestamp()<q.expires_at GROUP BY c.offer_id)a),'[]'::jsonb))END$$;


ALTER FUNCTION ink_product_engine.ink_s5_joker_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1) OWNER TO ink_product_owner;

--
-- Name: ink_s5_joker_state_v1_pre_phase2(uuid, ink_product_engine.ink_members_v1); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_joker_state_v1_pre_phase2(p_session uuid, p_member ink_product_engine.ink_members_v1) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'jokerOffers',coalesce((SELECT jsonb_agg(jsonb_build_object('offerId',offer_id,'candidates',candidates)
      ORDER BY offered_at,offer_id)
      FROM (
        SELECT c.offer_id,min(c.offered_at) AS offered_at,
          jsonb_agg(jsonb_build_object('candidateId',c.candidate_id,'itemId',c.item_id,'tier',c.base_tier)
            ORDER BY c.ordinal) AS candidates
        FROM ink_product_engine.ink_s5_joker_candidates_v1 c
        WHERE c.session_id=p_session AND c.participant_id=(p_member).participant_id
          AND c.owner_epoch=(p_member).owner_epoch AND c.resolved_receipt_id IS NULL
        GROUP BY c.offer_id
      ) pending),'[]'::jsonb),
    'rouletteSupplyWeakened',EXISTS (SELECT FROM ink_product_engine.ink_s5_roulette_supply_v1 s
      WHERE s.session_id=p_session AND s.participant_id=(p_member).participant_id
        AND s.owner_epoch=(p_member).owner_epoch AND s.applied_grant_id IS NULL))
  WHERE p_session=(p_member).session_id
$$;


ALTER FUNCTION ink_product_engine.ink_s5_joker_state_v1_pre_phase2(p_session uuid, p_member ink_product_engine.ink_members_v1) OWNER TO ink_product_owner;

--
-- Name: ink_s5_joker_v1(uuid, ink_product_engine.ink_members_v1, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_joker_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_grant uuid;
  v_offer uuid;
  v_chosen uuid[];
  v_gifts jsonb;
  v_own uuid[];
  v_theirs uuid[];
  v_stolen ink_product_engine.ink_grants_v1;
  v_receiver ink_product_engine.ink_members_v1;
  v_landing ink_product_engine.ink_members_v1;
  v_start ink_product.wiki_snapshots;
  v_destination ink_product.wiki_snapshots;
  v_effect uuid;
  v_move jsonb;
  v_child jsonb;
  v_tier text;
  v_success boolean;
  -- TEST_ONLY Q19: omit candidate grades whose use handler still rejects them.
  v_pool text[] := ARRAY['ink','bookmark','censor','search','thunder','thief','cannon'];
  v_first text;
  v_second text;
BEGIN
 IF p_operation='joker_claim'AND ink_product_engine.ink_s5_phase2_enabled_v1(p_session)THEN RETURN jsonb_build_object('accepted',false,'code','REWARD_QUEUE_REQUIRED');END IF;
  IF p_operation='thief' AND ink_product_engine.ink_s5_phase1_enabled_v1(p_session) THEN
    RETURN ink_product_engine.ink_s5_phase1_thief_v1(p_session,p_member,p_target,p_payload,p_at,p_receipt,p_tier,p_apply);
  END IF;
  IF p_operation='roulette' AND ink_product_engine.ink_s5_phase1_enabled_v1(p_session) THEN
    RETURN ink_product_engine.ink_s5_phase1_roulette_v1(p_session,p_member,p_payload,p_at,p_receipt,p_tier,p_apply);
  END IF;
  IF p_operation='joker_claim' THEN
    IF p_payload-ARRAY['offerId','candidateIds','expectedInventoryVersion']<>'{}'::jsonb
      OR jsonb_typeof(p_payload->'offerId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_payload->'candidateIds') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
      OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$'
    THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT'); END IF;
    IF jsonb_array_length(p_payload->'candidateIds') NOT BETWEEN 1 AND 2
      OR EXISTS (SELECT FROM jsonb_array_elements(p_payload->'candidateIds') x(value)
        WHERE jsonb_typeof(x.value)<>'string')
    THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT'); END IF;
    BEGIN
      v_offer := (p_payload->>'offerId')::uuid;
      SELECT array_agg(x.value::uuid) INTO v_chosen FROM jsonb_array_elements_text(p_payload->'candidateIds') x(value);
      IF (p_payload->>'expectedInventoryVersion')::bigint IS DISTINCT FROM p_member.inventory_version THEN
        RETURN jsonb_build_object('accepted',false,'code','STALE_INVENTORY');
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
    END;
    IF (SELECT count(*) FROM ink_product_engine.ink_s5_joker_candidates_v1 c
      WHERE (c.session_id,c.offer_id,c.participant_id,c.owner_epoch)=
        (p_session,v_offer,p_member.participant_id,p_member.owner_epoch)
        AND c.resolved_receipt_id IS NULL AND c.candidate_id=ANY(v_chosen))<>cardinality(v_chosen)
    THEN RETURN jsonb_build_object('accepted',false,'code','OFFER_NOT_AVAILABLE'); END IF;
    IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(p_member))<cardinality(v_chosen) THEN
      RETURN jsonb_build_object('accepted',false,'code','INVENTORY_FULL');
    END IF;
    IF NOT p_apply THEN RETURN jsonb_build_object('accepted',true,'code','S5_READY'); END IF;
    v_gifts := ink_product_engine.ink_s5_deliver_candidates_v1(p_member,v_offer,v_chosen,p_at,p_receipt);
    RETURN jsonb_build_object('accepted',true,'code','JOKER_OFFER_CLAIMED','offerId',v_offer,'grants',v_gifts,'testOnly',true);
  END IF;

  IF p_operation NOT IN ('thief','roulette','cannon') THEN
    RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_OPERATION');
  END IF;
  v_grant := (p_payload->>'grantId')::uuid;

  IF p_operation='thief' THEN
    -- TEST_ONLY Q18: both outcomes must have an eligible held grant. Armed
    -- rights and offers are separate rows, and the played grant is excluded.
    SELECT array_agg(g.grant_id ORDER BY g.slot_index) INTO v_own FROM ink_product_engine.ink_grants_v1 g
      WHERE (g.session_id,g.owner_participant_id,g.owner_epoch)=(p_session,p_member.participant_id,p_member.owner_epoch)
        AND g.consumed_at IS NULL AND g.grant_id<>v_grant;
    SELECT array_agg(g.grant_id ORDER BY g.slot_index) INTO v_theirs FROM ink_product_engine.ink_grants_v1 g
      WHERE (g.session_id,g.owner_participant_id,g.owner_epoch)=(p_session,p_target.participant_id,p_target.owner_epoch)
        AND g.consumed_at IS NULL;
    IF v_own IS NULL OR v_theirs IS NULL THEN
      RETURN jsonb_build_object('accepted',false,'code','THIEF_NO_TRANSFERABLE_GRANT');
    END IF;
  ELSIF p_operation='cannon' THEN
    -- TEST_ONLY Q21: successful landing must be a different registered frame
    -- and cannot grant a finish. Failed return while on the start page is a no-op.
    SELECT s.* INTO STRICT v_start FROM ink_product.rooms r JOIN ink_product.policies p USING (binding)
      JOIN ink_product.wiki_snapshots s ON s.id=p.start_snapshot_id WHERE r.session_id=p_session;
    v_destination := ink_product.course_document(p_session,p_target.current_page_id);
    IF v_destination.id IS NULL OR v_destination.revision_id IS DISTINCT FROM p_target.current_revision_id
      OR p_target.current_page_id=p_member.current_page_id
      OR ink_product.course_is_goal(p_session,v_destination.page_id,v_destination.revision_id)
      OR (ink_product.course_document(p_session,p_member.current_page_id)).revision_id IS DISTINCT FROM p_member.current_revision_id
    THEN RETURN jsonb_build_object('accepted',false,'code','CANNON_DESTINATION_UNAVAILABLE'); END IF;
  END IF;

  IF NOT p_apply THEN RETURN jsonb_build_object('accepted',true,'code','S5_READY'); END IF;
  -- Unconfirmed odds are scoped to this isolated S5 ruleset and shared by all tiers.
  v_success := ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,p_operation||':outcome',10000)
    < CASE WHEN p_operation='roulette' THEN 4000 ELSE 5000 END;

  IF p_operation='thief' THEN
    IF v_success THEN
      v_receiver := p_member;
      v_chosen := v_theirs;
    ELSE
      v_receiver := p_target;
      v_chosen := v_own;
    END IF;
    SELECT g.* INTO STRICT v_stolen FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=p_session
      AND g.grant_id=v_chosen[1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'thief:transfer',cardinality(v_chosen))]
      AND g.consumed_at IS NULL;
    -- Keep the source ownership and supply history immutable. A new grant or
    -- pending offer represents the transfer after the source grant is spent.
    PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_stolen,p_at,p_receipt,NULL);
    PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_stolen.owner_participant_id);
    v_tier := CASE WHEN v_success AND p_tier<>'normal' THEN p_tier ELSE v_stolen.base_tier END;
    v_chosen := ARRAY[gen_random_uuid()];
    INSERT INTO ink_product_engine.ink_s5_joker_candidates_v1
      (session_id,offer_id,candidate_id,ordinal,participant_id,owner_epoch,item_id,base_tier,source_grant_id,offered_at)
    VALUES (p_session,p_receipt,v_chosen[1],1,v_receiver.participant_id,v_receiver.owner_epoch,
      v_stolen.item_id,v_tier,v_stolen.grant_id,p_at);
    IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(v_receiver))>0 THEN
      v_gifts := ink_product_engine.ink_s5_deliver_candidates_v1(v_receiver,p_receipt,v_chosen,p_at,p_receipt);
    ELSE
      PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_receiver.participant_id);
    END IF;
    RETURN jsonb_build_object('accepted',true,'code','THIEF_RESOLVED','success',v_success,'testOnly',true,
      'offerId',p_receipt,'delivery',CASE WHEN v_gifts IS NULL THEN 'offered' ELSE 'held' END,
      'transferredItemId',v_stolen.item_id,'receivedTier',v_tier);
  END IF;

  IF p_operation='roulette' THEN
    IF NOT v_success THEN
      UPDATE ink_product_engine.ink_grants_v1 SET base_tier='weakened'
        WHERE (session_id,owner_participant_id,owner_epoch)=(p_session,p_member.participant_id,p_member.owner_epoch)
          AND grant_id<>v_grant AND consumed_at IS NULL AND base_tier<>'weakened';
      IF FOUND THEN
        UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1
          WHERE (session_id,participant_id,owner_epoch)=(p_session,p_member.participant_id,p_member.owner_epoch);
      END IF;
      -- Consecutive failures do not stack flags before the next actual grant.
      INSERT INTO ink_product_engine.ink_s5_roulette_supply_v1
        (session_id,participant_id,owner_epoch,source_receipt_id)
      VALUES (p_session,p_member.participant_id,p_member.owner_epoch,p_receipt)
      ON CONFLICT (session_id,participant_id,owner_epoch) WHERE applied_grant_id IS NULL DO NOTHING;
      PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
      RETURN jsonb_build_object('accepted',true,'code','ROULETTE_RESOLVED','success',false,
        'nextSupplyWeakened',true,'testOnly',true);
    END IF;
    IF p_tier='enhanced' THEN
      v_child := ink_product_engine.ink_s5_roulette_auto_v1(p_member,v_grant,p_at,p_receipt);
    END IF;
    v_first := v_pool[1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:reward:1',cardinality(v_pool))];
    v_pool := array_remove(v_pool,v_first);
    v_second := v_pool[1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:reward:2',cardinality(v_pool))];
    v_tier := CASE WHEN p_tier='weakened' THEN 'normal' ELSE 'enhanced' END;
    v_chosen := ARRAY[gen_random_uuid(),gen_random_uuid()];
    INSERT INTO ink_product_engine.ink_s5_joker_candidates_v1
      (session_id,offer_id,candidate_id,ordinal,participant_id,owner_epoch,item_id,base_tier,offered_at)
    VALUES (p_session,p_receipt,v_chosen[1],1,p_member.participant_id,p_member.owner_epoch,v_first,v_tier,p_at),
      (p_session,p_receipt,v_chosen[2],2,p_member.participant_id,p_member.owner_epoch,v_second,v_tier,p_at);
    IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(p_member))=2 THEN
      v_gifts := ink_product_engine.ink_s5_deliver_candidates_v1(p_member,p_receipt,v_chosen,p_at,p_receipt);
    ELSE
      PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
    END IF;
    RETURN jsonb_build_object('accepted',true,'code','ROULETTE_RESOLVED','success',true,'testOnly',true,
      'offerId',p_receipt,'delivery',CASE WHEN v_gifts IS NULL THEN 'offered' ELSE 'held' END,
      'automaticChild',v_child,'grants',v_gifts);
  END IF;

  IF NOT v_success THEN v_destination := v_start; END IF;
  IF v_destination.page_id<>p_member.current_page_id THEN
    v_move := ink_product_engine.ink_s5_force_move_v1(p_member,v_destination.page_id,'cannon',1,p_at,p_receipt);
    IF v_move->>'moveId' IS NULL THEN RAISE EXCEPTION 'S5 cannon move must roll back'; END IF;
  END IF;
  IF v_success AND p_tier IN ('enhanced','weakened') THEN
    SELECT m.* INTO STRICT v_landing FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=p_session
      AND m.participant_id=(CASE WHEN p_tier='enhanced' THEN p_target.participant_id ELSE p_member.participant_id END)
      AND m.player_status='playing';
    v_effect := gen_random_uuid();
    INSERT INTO ink_product_engine.ink_s4_effects_v1 (session_id,effect_id,participant_id,owner_epoch,kind,
      starts_at,expires_at,progress_version,page_id,revision_id,payload,opened_receipt_id)
    VALUES (p_session,v_effect,v_landing.participant_id,v_landing.owner_epoch,'stun',
      p_at,p_at+interval '2 seconds',v_landing.progress_version,v_landing.current_page_id,v_landing.current_revision_id,
      jsonb_build_object('source','cannon','tier',p_tier),p_receipt);
    PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_landing.participant_id);
  END IF;
  RETURN jsonb_build_object('accepted',true,'code','CANNON_RESOLVED','success',v_success,
    'movement',v_move,'stunEffectId',v_effect,'testOnly',true);
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s5_joker_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_lost_link_candidates_v1(ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_lost_link_candidates_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(array_agg(DISTINCT x.page_id ORDER BY x.page_id),ARRAY[]::text[])
  FROM ink_product.course_exits((p_member).session_id,(p_member).current_page_id,(p_member).current_revision_id) AS x(page_id)
  CROSS JOIN LATERAL ink_product.course_document((p_member).session_id,x.page_id) AS dest
  WHERE x.page_id<>(p_member).current_page_id AND dest.id IS NOT NULL
    AND NOT ink_product.course_is_goal((p_member).session_id,dest.page_id,dest.revision_id)
    AND NOT ink_product_engine.ink_s4_censored_v1((p_member).session_id,p_member,x.page_id,p_at)
$$;


ALTER FUNCTION ink_product_engine.ink_s5_lost_link_candidates_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_lost_link_plan_v2(ink_product_engine.ink_members_v1, timestamp with time zone, uuid, boolean, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_lost_link_plan_v2(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid, p_enhanced boolean, p_test_partial boolean) RETURNS text[]
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  hops text[] := ink_product_engine.ink_s5_lost_link_candidates_v1(p_member,p_at);
  first_page text;
  snapshot ink_product.wiki_snapshots;
  second_frame ink_product_engine.ink_members_v1 := p_member;
BEGIN
  IF cardinality(hops)=0 THEN RETURN ARRAY[]::text[]; END IF;
  first_page := hops[1+ink_product_engine.ink_s5_draw_v1(p_member.session_id,p_receipt,'lost-link-destination',cardinality(hops))];
  IF NOT p_enhanced THEN RETURN ARRAY[first_page]; END IF;
  snapshot := ink_product.course_document(p_member.session_id,first_page);
  IF snapshot.id IS NULL THEN RETURN ARRAY[]::text[]; END IF;
  second_frame.current_page_id:=snapshot.page_id;
  second_frame.current_revision_id:=snapshot.revision_id;
  second_frame.progress_version:=p_member.progress_version+1;
  hops := ink_product_engine.ink_s5_lost_link_candidates_v1(second_frame,p_at);
  IF cardinality(hops)=0 THEN
    IF p_test_partial THEN RETURN ARRAY[first_page]; END IF;
    RETURN ARRAY[]::text[];
  END IF;
  RETURN ARRAY[first_page,hops[1+ink_product_engine.ink_s5_draw_v1(p_member.session_id,p_receipt,'lost-link-second-hop',cardinality(hops))]];
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_lost_link_plan_v2(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid, p_enhanced boolean, p_test_partial boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifier_eligible_v2(ink_product_engine.ink_members_v1, text, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_modifier_eligible_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_excluded uuid) RETURNS uuid[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(array_agg(g.grant_id ORDER BY g.slot_index,g.grant_id),ARRAY[]::uuid[])
  FROM ink_product_engine.ink_grants_v1 g
  WHERE (g.session_id,g.owner_participant_id,g.owner_epoch)=
    ((p_member).session_id,(p_member).participant_id,(p_member).owner_epoch)
    AND g.consumed_at IS NULL AND g.grant_id IS DISTINCT FROM p_excluded
    AND NOT EXISTS (SELECT FROM ink_product_engine.ink_s5_modifier_units_v1 u
      WHERE (u.session_id,u.grant_id,u.kind)=(g.session_id,g.grant_id,p_kind))
$$;


ALTER FUNCTION ink_product_engine.ink_s5_modifier_eligible_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_excluded uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifier_id_v1(ink_product_engine.ink_members_v1, text, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_modifier_id_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT m.right_id FROM ink_product_engine.ink_s5_modifiers_v1 m
  WHERE (m.session_id,m.participant_id,m.owner_epoch,m.kind)=
    (p_member.session_id,p_member.participant_id,p_member.owner_epoch,p_kind)
    AND m.installed_at<=p_at AND m.expires_at>p_at AND (
      SELECT count(*) FROM ink_product_engine.ink_s5_modifier_uses_v1 u
      WHERE (u.session_id,u.right_id)=(m.session_id,m.right_id))<2
  ORDER BY m.installed_at DESC,m.right_id LIMIT 1
$$;


ALTER FUNCTION ink_product_engine.ink_s5_modifier_id_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifier_state_v1(ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_modifier_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN EXISTS (SELECT FROM ink_product.rooms r WHERE r.session_id=(p_member).session_id
      AND r.binding->>'schemaVersion' IN ('candidate-v2','candidate-v3')
      AND r.binding->>'rulesVersion'='ink-s5-test-v1'
      AND r.binding->>'catalogVersion'='ink-s5-test-v1'
      AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
    THEN ink_product_engine.ink_s5_modifier_state_v1_grant(p_member,p_at) ELSE ink_product_engine.ink_s5_modifier_state_v1_legacy(p_member,p_at) END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_modifier_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifier_state_v1_grant(ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_modifier_state_v1_grant(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('rightId',state.right_id,'kind',state.kind,'startsAt',state.installed_at,
    'expiresAt',NULL,'remainingCharges',state.remaining,'pendingCharges',state.pending)
    ORDER BY state.installed_at,state.right_id),'[]')
  FROM (
    SELECT r.right_id,r.kind,r.installed_at,count(*) AS remaining,count(*) FILTER (WHERE u.grant_id IS NULL) AS pending
    FROM ink_product_engine.ink_s5_modifiers_v1 r
    JOIN ink_product_engine.ink_s5_modifier_units_v1 u USING (session_id,right_id,kind)
    LEFT JOIN ink_product_engine.ink_s5_modifier_uses_v1 spent USING (session_id,right_id,unit)
    WHERE (r.session_id,r.participant_id,r.owner_epoch)=((p_member).session_id,(p_member).participant_id,(p_member).owner_epoch)
      AND spent.unit IS NULL
    GROUP BY r.right_id,r.kind,r.installed_at
  ) state
$$;


ALTER FUNCTION ink_product_engine.ink_s5_modifier_state_v1_grant(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifier_state_v1_legacy(ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_modifier_state_v1_legacy(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('rightId',m.right_id,'kind',m.kind,'startsAt',m.installed_at,
    'expiresAt',m.expires_at,'remainingCharges',2-used.count) ORDER BY m.kind),'[]')
  FROM ink_product_engine.ink_s5_modifiers_v1 m CROSS JOIN LATERAL (
    SELECT count(*) FROM ink_product_engine.ink_s5_modifier_uses_v1 u
    WHERE (u.session_id,u.right_id)=(m.session_id,m.right_id)
  ) used
  WHERE (m.session_id,m.participant_id,m.owner_epoch)=(p_member.session_id,p_member.participant_id,p_member.owner_epoch)
    AND m.installed_at<=p_at AND p_at<m.expires_at AND used.count<2
$$;


ALTER FUNCTION ink_product_engine.ink_s5_modifier_state_v1_legacy(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_navigation_state_v1(uuid, ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_navigation_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_snapshot ink_product.wiki_snapshots;
  v_window ink_product_engine.ink_s5_navigation_windows_v1;
  v_hash text;
  v_search jsonb;
  v_links jsonb;
BEGIN
  IF p_member.session_id=p_session AND p_member.player_status='playing' AND p_member.user_id=ink_product.request_actor_v1() THEN
    v_snapshot := ink_product.course_document(p_session,p_member.current_page_id);
    IF v_snapshot.revision_id=p_member.current_revision_id THEN
      FOR v_window IN
        SELECT DISTINCT ON (kind) * FROM ink_product_engine.ink_s5_navigation_windows_v1 w
        WHERE w.session_id=p_session AND w.participant_id=p_member.participant_id
          AND w.owner_epoch=p_member.owner_epoch AND w.snapshot_id=v_snapshot.id
          AND w.progress_version=p_member.progress_version AND w.starts_at<=p_at AND p_at<w.expires_at
        ORDER BY kind,starts_at DESC,window_id DESC
      LOOP
        IF v_window.kind='search' THEN
          SELECT document_hash INTO STRICT v_hash FROM ink_product_engine.ink_s5_search_documents_v1
            WHERE snapshot_id=v_snapshot.id;
          v_search := jsonb_build_object('windowId',v_window.window_id,'tier',v_window.tier,
            'snapshotId',v_snapshot.id,'progressVersion',v_window.progress_version::text,'documentHash',v_hash,
            'expiresAt',v_window.expires_at,'remainingSuccesses',v_window.success_limit-v_window.used_successes,
            'lastResult',CASE WHEN v_window.used_successes>0 THEN jsonb_build_object(
              'availableAt',v_window.available_at,'query',v_window.last_query,
              'count',CASE WHEN p_at>=v_window.available_at THEN v_window.last_count END) END);
        ELSE
          SELECT jsonb_build_object('windowId',v_window.window_id,'tier',v_window.tier,
            'snapshotId',v_snapshot.id,'progressVersion',v_window.progress_version::text,'expiresAt',v_window.expires_at,
            'entries',coalesce(jsonb_agg(jsonb_build_object('pageId',l.page_id,'title',l.canonical_title,
              'blocked',ink_product_engine.ink_s4_censored_v1(p_session,p_member,l.page_id,p_at)
                OR ink_product_engine.ink_s5_trap_sealed_v1(p_session,p_member,l.page_id,p_at),
              'section',CASE WHEN v_window.tier='enhanced' THEN coalesce(i.link_sections->>l.page_id,'기타') END)
              ORDER BY l.canonical_title COLLATE pg_catalog."C",l.page_id),'[]'::jsonb))
          INTO v_links FROM ink_product.wiki_links l LEFT JOIN ink_product_engine.ink_s5_search_documents_v1 i USING(snapshot_id)
          WHERE l.snapshot_id=v_snapshot.id AND NOT (l.page_id=ANY(v_window.hidden_page_ids))
            AND l.page_id IN (SELECT ink_product.course_exits(p_session,v_snapshot.page_id,v_snapshot.revision_id));
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN jsonb_build_object('search',v_search,'linkIndex',v_links);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_navigation_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_navigation_v1(uuid, ink_product_engine.ink_members_v1, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_snapshot ink_product.wiki_snapshots;
  v_search_document ink_product_engine.ink_s5_search_documents_v1;
  v_window ink_product_engine.ink_s5_navigation_windows_v1;
  v_fields text[] := ARRAY['expectedSnapshotId','expectedProgressVersion'];
  v_state jsonb;
  v_query text;
  v_count integer;
  v_available timestamptz;
  v_hidden text[] := '{}';
  v_mask_seed uuid;
BEGIN
  IF p_member.session_id IS DISTINCT FROM p_session OR p_member.player_status IS DISTINCT FROM 'playing'
      OR p_member.user_id IS DISTINCT FROM ink_product.request_actor_v1() THEN
    RETURN jsonb_build_object('accepted',false,'code','PARTICIPANT_READ_ONLY');
  END IF;
  IF p_operation IN ('search','link_index') THEN
    v_fields := v_fields || ARRAY['grantId','expectedInventoryVersion'];
  ELSIF p_operation='search_execute' THEN
    v_fields := v_fields || ARRAY['windowId','query','expectedDocumentHash'];
  ELSE
    RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_OPERATION');
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload-v_fields<>'{}'::jsonb
      OR NOT (p_payload ?& v_fields) OR EXISTS (
        SELECT FROM unnest(v_fields) f(key) WHERE jsonb_typeof(p_payload->f.key) IS DISTINCT FROM 'string'
      ) THEN
    RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
  END IF;

  v_snapshot := ink_product.course_document(p_session,p_member.current_page_id);
  IF v_snapshot.id IS NULL OR v_snapshot.revision_id IS DISTINCT FROM p_member.current_revision_id
      OR p_payload->>'expectedSnapshotId' IS DISTINCT FROM v_snapshot.id::text
      OR p_payload->>'expectedProgressVersion' IS DISTINCT FROM p_member.progress_version::text THEN
    RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_SOURCE_CHANGED');
  END IF;
  IF p_operation IN ('search','search_execute') THEN
    SELECT * INTO v_search_document FROM ink_product_engine.ink_s5_search_documents_v1 WHERE snapshot_id=v_snapshot.id;
    IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','SEARCH_DOCUMENT_UNAVAILABLE'); END IF;
  END IF;

  IF p_operation='search_execute' THEN
    v_query := btrim(p_payload->>'query',U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff');
    IF v_query='' OR char_length(p_payload->>'query')>4096
        OR p_payload->>'windowId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('accepted',false,'code','INVALID_SEARCH_QUERY');
    END IF;
    SELECT * INTO v_window FROM ink_product_engine.ink_s5_navigation_windows_v1
      WHERE session_id=p_session AND window_id=(p_payload->>'windowId')::uuid AND kind='search'
        AND participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch;
    IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_WINDOW_NOT_OWNED'); END IF;
    IF v_window.snapshot_id<>v_snapshot.id OR v_window.progress_version<>p_member.progress_version THEN
      RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_SOURCE_CHANGED');
    END IF;
    IF p_at<v_window.starts_at OR p_at>=v_window.expires_at THEN
      RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_WINDOW_EXPIRED');
    END IF;
    IF v_search_document.document_hash IS DISTINCT FROM p_payload->>'expectedDocumentHash' THEN
      RETURN jsonb_build_object('accepted',false,'code','SEARCH_DOCUMENT_MISMATCH');
    END IF;
    IF v_window.used_successes=v_window.success_limit THEN
      RETURN jsonb_build_object('accepted',false,'code','SEARCH_USED');
    END IF;
    IF p_apply IS DISTINCT FROM true THEN RETURN jsonb_build_object('accepted',true,'code','SEARCH_READY'); END IF;
    -- PostgreSQL's literal director keeps punctuation from becoming a pattern.
    SELECT coalesce(sum(regexp_count(node,'***='||v_query,1,'i')),0)::integer INTO v_count
      FROM unnest(v_search_document.text_nodes) t(node);
    IF v_count=0 THEN RETURN jsonb_build_object('accepted',true,'code','SEARCH_NOT_FOUND','count',0); END IF;
    -- TEST_ONLY Q15. Even if the result is due after the window expires, the use stays consumed.
    v_available := p_at + CASE WHEN v_window.tier='weakened' THEN interval '2 seconds' ELSE interval '0' END;
    UPDATE ink_product_engine.ink_s5_navigation_windows_v1 SET used_successes=used_successes+1,
      last_query=v_query,last_count=v_count,available_at=v_available
      WHERE session_id=p_session AND window_id=v_window.window_id;
    PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
    RETURN jsonb_build_object('accepted',true,'code','SEARCH_FOUND','availableAt',v_available,
      'count',CASE WHEN v_available=p_at THEN v_count END)
      || ink_product_engine.ink_s5_navigation_state_v1(p_session,p_member,p_at);
  END IF;

  IF p_operation='link_index'AND ink_product_engine.ink_s5_phase3_enabled_v1(p_session)AND NOT EXISTS(SELECT FROM ink_product.course_exits(p_session,v_snapshot.page_id,v_snapshot.revision_id))THEN RETURN jsonb_build_object('accepted',false,'code','LINKS_UNAVAILABLE');END IF;
  IF p_tier NOT IN ('normal','enhanced','weakened') OR p_tier IS NULL THEN
    RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_NAVIGATION_TIER');
  END IF;
  IF p_operation='link_index' AND p_tier='enhanced' AND NOT EXISTS (
    SELECT FROM ink_product_engine.ink_s5_search_documents_v1 WHERE snapshot_id=v_snapshot.id
  ) THEN RETURN jsonb_build_object('accepted',false,'code','LINK_SECTIONS_UNAVAILABLE'); END IF;
  v_state := ink_product_engine.ink_s5_navigation_state_v1(p_session,p_member,p_at);
  IF jsonb_typeof(v_state->(CASE WHEN p_operation='search' THEN 'search' ELSE 'linkIndex' END))='object' THEN
    RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_WINDOW_ACTIVE');
  END IF;
  IF p_apply IS DISTINCT FROM true THEN RETURN jsonb_build_object('accepted',true,'code','DOCUMENT_WINDOW_READY'); END IF;
  IF p_operation='link_index' AND p_tier='weakened' THEN
    -- TEST_ONLY Q16. Draw one server-side mask and persist it with the window.
    v_mask_seed := gen_random_uuid();
    SELECT coalesce(array_agg(page_id),'{}') INTO v_hidden FROM (
      SELECT page_id,row_number() OVER (ORDER BY sha256(convert_to(v_mask_seed::text||':'||page_id,'UTF8')),page_id) AS position,
        count(*) OVER () AS link_count
      FROM ink_product.course_exits(p_session,v_snapshot.page_id,v_snapshot.revision_id) AS exit(page_id)
    ) ranked WHERE position<=CASE WHEN ink_product_engine.ink_s5_phase3_enabled_v1(p_session)THEN least(link_count/2,greatest(link_count-2,0))ELSE link_count/2 END;
  END IF;
  INSERT INTO ink_product_engine.ink_s5_navigation_windows_v1 (
    session_id,participant_id,owner_epoch,window_id,kind,tier,snapshot_id,progress_version,
    starts_at,expires_at,success_limit,hidden_page_ids
  ) VALUES (p_session,p_member.participant_id,p_member.owner_epoch,p_receipt,p_operation,p_tier,v_snapshot.id,p_member.progress_version,
    p_at,p_at+CASE WHEN p_operation='search' THEN interval '15 seconds' ELSE interval '20 seconds' END,
    CASE WHEN p_operation='link_index' THEN 0 WHEN p_tier='enhanced' THEN 3 ELSE 1 END,v_hidden);
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
  RETURN jsonb_build_object('accepted',true,'code',CASE WHEN p_operation='search' THEN 'SEARCH_ACTIVE' ELSE 'LINK_INDEX_ACTIVE' END)
    || ink_product_engine.ink_s5_navigation_state_v1(p_session,p_member,p_at);
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s5_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) OWNER TO ink_product_owner;

--
-- Name: ink_attack_children_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_attack_children_v1 (
    session_id uuid NOT NULL,
    child_id uuid NOT NULL,
    root_id uuid NOT NULL,
    target_participant_id uuid NOT NULL,
    target_epoch bigint NOT NULL,
    state text NOT NULL,
    outcome text,
    resolved_logical_at timestamp with time zone,
    warning_event_seq bigint NOT NULL,
    target_result_event_seq bigint,
    source_result_event_seq bigint,
    resolution_receipt_id uuid,
    parry_attempt_receipt_id uuid,
    reflection_tier text,
    CONSTRAINT ink_attack_children_v1_check CHECK ((target_result_event_seq > warning_event_seq)),
    CONSTRAINT ink_attack_children_v1_check1 CHECK (((state = 'resolved'::text) = ((target_result_event_seq IS NOT NULL) AND (source_result_event_seq IS NOT NULL)))),
    CONSTRAINT ink_attack_children_v1_check2 CHECK (((target_result_event_seq IS NULL) = (source_result_event_seq IS NULL))),
    CONSTRAINT ink_attack_children_v1_check3 CHECK ((((state = 'pending'::text) AND (outcome IS NULL) AND (resolved_logical_at IS NULL) AND (resolution_receipt_id IS NULL)) OR ((state = 'resolved'::text) AND (outcome IS NOT NULL) AND (resolved_logical_at IS NOT NULL) AND (resolution_receipt_id IS NOT NULL)))),
    CONSTRAINT ink_attack_children_v1_check4 CHECK (((reflection_tier IS NULL) OR ((reflection_tier = 'enhanced'::text) AND (parry_attempt_receipt_id IS NOT NULL) AND ink_product_engine.ink_s5_enabled_v1(session_id)))),
    CONSTRAINT ink_attack_children_v1_resolved_logical_at_check CHECK (isfinite(resolved_logical_at)),
    CONSTRAINT ink_attack_children_v1_source_result_event_seq_check CHECK ((source_result_event_seq > 0)),
    CONSTRAINT ink_attack_children_v1_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'resolved'::text]))),
    CONSTRAINT ink_attack_children_v1_warning_event_seq_check CHECK ((warning_event_seq > 0)),
    CONSTRAINT ink_attack_s5_outcome CHECK (((outcome = ANY (ARRAY['hit'::text, 'blocked'::text, 'reflected'::text, 'reflection_blocked'::text, 'void_terminal'::text, 'void_source_terminal'::text])) OR (ink_product_engine.ink_s4_fixture_id_v1(session_id) AND (outcome = 'no_censor_candidates'::text)) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (outcome = 'void_ineligible'::text))))
);

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_attack_children_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_parry_block_v1(uuid, ink_product_engine.ink_attack_children_v1, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_parry_block_v1(p_session uuid, p_child ink_product_engine.ink_attack_children_v1, p_at timestamp with time zone, p_receipt uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_source uuid; v_target_seq bigint; v_source_seq bigint;
BEGIN
  SELECT source_participant_id INTO STRICT v_source FROM ink_product_engine.ink_attack_roots_v1
    WHERE session_id=p_session AND root_id=p_child.root_id AND p_at<due_at;
  v_target_seq:=ink_product_engine.ink_s2_next_event_v1(p_session,p_child.target_participant_id);
  v_source_seq:=ink_product_engine.ink_s2_next_event_v1(p_session,v_source);
  UPDATE ink_product_engine.ink_attack_children_v1 SET state='resolved',outcome='blocked',resolved_logical_at=p_at,
    resolution_receipt_id=p_receipt,target_result_event_seq=v_target_seq,source_result_event_seq=v_source_seq
  WHERE session_id=p_session AND child_id=p_child.child_id AND state='pending' AND parry_attempt_receipt_id=p_receipt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending weakened parry changed under session lock'; END IF;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_parry_block_v1(p_session uuid, p_child ink_product_engine.ink_attack_children_v1, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_auto_candidates_v1(ink_product_engine.ink_members_v1, uuid, integer, text[], timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_auto_candidates_v1(p_member ink_product_engine.ink_members_v1, p_parent uuid, p_ordinal integer, p_excluded text[], p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE item text; target uuid; targets uuid[]; reply jsonb; result jsonb:='[]';
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1(p_member.session_id)THEN p_excluded:=array_append(p_excluded,'search');END IF;
 FOREACH item IN ARRAY ARRAY['ink','censor','trap','lost_link','parry','shield','correction','bookmark','undo','search','link_index'] LOOP
  IF item=ANY(p_excluded) THEN CONTINUE; END IF;
  IF item IN('ink','censor','trap','lost_link') THEN
   SELECT array_agg(e.participant_id ORDER BY e.participant_id) INTO targets FROM ink_product_engine.ink_members_v1 e
   WHERE e.session_id=p_member.session_id AND e.participant_id<>p_member.participant_id AND e.player_status='playing' AND e.member_role='player';
  ELSE targets:=ARRAY[NULL::uuid]; END IF;
  FOREACH target IN ARRAY coalesce(targets,ARRAY[]::uuid[]) LOOP
   reply:=NULL;
   BEGIN
    reply:=ink_product_engine.ink_s5_phase1_auto_execute_v1(p_member,item,target,p_parent,p_ordinal,p_at);
    RAISE EXCEPTION USING ERRCODE='P1A01',MESSAGE='ROLLBACK_AUTO_ELIGIBILITY_PROBE';
   EXCEPTION WHEN SQLSTATE 'P1A01' THEN NULL;
   END;
   IF reply->>'ok'='true' THEN result:=result||jsonb_build_array(jsonb_build_object('itemId',item,'targetParticipantId',target)); END IF;
  END LOOP;
 END LOOP;
 RETURN result;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_auto_candidates_v1(p_member ink_product_engine.ink_members_v1, p_parent uuid, p_ordinal integer, p_excluded text[], p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_auto_dispatch_v1(timestamp with time zone, uuid, uuid, jsonb, text, uuid, text, jsonb); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_auto_dispatch_v1(p_parent_at timestamp with time zone, p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_session ink_product_engine.ink_sessions_v1%ROWTYPE;
  v_member ink_product_engine.ink_members_v1%ROWTYPE;
  v_previous ink_product_engine.ink_receipts_v1%ROWTYPE;
  v_grant ink_product_engine.ink_grants_v1%ROWTYPE;
  v_child ink_product_engine.ink_attack_children_v1%ROWTYPE;
  v_payload jsonb;
  v_receipt uuid := p_request;
  v_now timestamptz;
  v_due_at timestamptz;
  v_item text;
  v_grant_id uuid;
  v_child_id uuid;
  v_targets uuid[];
  v_target uuid;
  v_target_epoch bigint;
  v_expected_inventory bigint;
  v_root uuid;
  v_enhancement uuid;
  v_weakening uuid;
  v_tier text;
  v_code text;
  v_s4_accepted boolean := false;
  v_trap text;
  v_detail jsonb := '{}'::jsonb;
  v_children jsonb := '[]'::jsonb;
  v_response jsonb;
  v_due record;
  v_closed_count integer := 0;
  v_revision bigint;
  v_supply_count integer := 0;
  v_progress bigint;
  v_requested_right uuid;
  v_due_at_input boolean;
  v_after_expiry boolean;
  v_prior_action text;
  v_order_code text;
BEGIN
  IF NOT ink_product_engine.ink_s5_phase1_enabled_v1(p_session) OR p_scope<>'player'
   OR p_operation NOT IN('attack','censor','trap_install','lost_link','parry','protect','correction','bookmark_install','undo','search','link_index')
   THEN RAISE EXCEPTION 'INVALID_PHASE1_AUTO_DISPATCH'; END IF;
  IF p_session IS NULL OR p_request IS NULL OR p_actor IS NULL
      OR p_scope IS NULL OR p_scope NOT IN ('player','worker') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE');
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_ISOLATION');
  END IF;

  SELECT s.* INTO v_session FROM ink_product_engine.ink_sessions_v1 s
    WHERE s.session_id=p_session AND ink_product_engine.ink_s4_matches_v1(s)
      AND (p_scope='worker' OR EXISTS (
        SELECT 1 FROM ink_product_engine.ink_members_v1 m WHERE m.session_id=s.session_id
          AND m.user_id=p_actor AND m.member_role='player'))
    FOR UPDATE OF s;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_AVAILABLE'); END IF;
  v_now := p_parent_at;
  IF p_binding IS DISTINCT FROM ink_product_engine.ink_s4_client_binding_v1() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','BINDING_MISMATCH');
  END IF;
  IF p_operation IS NULL OR pg_catalog.btrim(p_operation)='' OR pg_catalog.length(p_operation)>32 OR p_payload IS NULL
      OR pg_catalog.octet_length(p_payload::text)>8192 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_INPUT');
  END IF;

  v_payload := pg_catalog.jsonb_build_object('operation',p_operation,'payload',p_payload);
  SELECT * INTO v_previous FROM ink_product_engine.ink_receipts_v1
    WHERE session_id=p_session AND principal_scope=p_scope AND principal_id=p_actor AND request_id=p_request;
  IF FOUND THEN
    IF v_previous.canonical_payload IS DISTINCT FROM v_payload
      OR v_previous.payload_fingerprint IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(v_payload::text,'UTF8'))
      OR v_previous.binding_digest IS DISTINCT FROM v_session.policy_digest THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'code','REQUEST_PAYLOAD_CONFLICT');
    END IF;
    RETURN v_previous.private_response;
  END IF;
  IF NOT pg_catalog.isfinite(v_now) OR EXISTS (
    SELECT 1 FROM ink_product_engine.ink_receipts_v1 WHERE session_id=p_session AND authority_received_at>v_now
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','AUTHORITY_TIME_REGRESSION');
  END IF;

  IF (p_scope='player' AND p_operation NOT IN ('attack','parry','protect','resume','normal_link','bookmark_install','bookmark_return','censor','correction','undo','trap_options','trap_install','lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim'))
      OR (p_scope='worker' AND (p_operation<>'advance' OR p_payload<>'{}'::jsonb)) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_OPERATION');
  END IF;

  IF p_operation='resume' AND p_payload IS DISTINCT FROM '{}'::jsonb THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_INPUT');
  END IF;

  -- Use due_at for logical resolution even if the worker wakes late. Root order is immutable.
  FOR v_due IN
    SELECT c.child_id,r.due_at FROM ink_product_engine.ink_attack_children_v1 c
      JOIN ink_product_engine.ink_attack_roots_v1 r USING (session_id,root_id)
    WHERE c.session_id=p_session AND c.state='pending' AND r.due_at<=v_now
    ORDER BY r.due_at,r.acceptance_seq,c.target_participant_id
  LOOP
    PERFORM ink_product_engine.ink_s4_resolve_v1(p_session,v_due.child_id,v_due.due_at,false,v_receipt);
    v_closed_count := v_closed_count+1;
  END LOOP;

  PERFORM ink_product_engine.ink_s4_expire_traps_v1(p_session,v_now,v_receipt);

  -- Record the authenticated caller's presence only after identity, replay and due settlement.
  IF v_session.lifecycle_state='playing' THEN
    IF p_scope='player' THEN
      INSERT INTO ink_product_engine.ink_s3_presence_v1(session_id,participant_id,owner_epoch,observed_at)
      SELECT session_id,participant_id,owner_epoch,v_now FROM ink_product_engine.ink_members_v1
        WHERE session_id=p_session AND user_id=p_actor AND member_role='player' AND player_status='playing'
      ON CONFLICT (session_id,participant_id,owner_epoch) DO UPDATE SET observed_at=EXCLUDED.observed_at;
    END IF;
    v_supply_count := ink_product_engine.ink_s3_tick_v1(p_session,v_now,v_receipt,false);
  END IF;

  <<input>>
  BEGIN
    IF p_scope='worker' THEN
      v_code := 'ADVANCED';
      v_detail := pg_catalog.jsonb_build_object('settledCount',v_closed_count,'supplyDecisions',v_supply_count);
      EXIT input;
    END IF;
    SELECT * INTO STRICT v_member FROM ink_product_engine.ink_members_v1
      WHERE session_id=p_session AND user_id=p_actor AND member_role='player';
    IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END IF;

    -- P6 adds only the verified supply boundary to the existing post-expiry allowance.
    SELECT EXISTS (SELECT 1 FROM ink_product_engine.ink_attack_children_v1 c
      JOIN ink_product_engine.ink_attack_roots_v1 r USING(session_id,root_id)
      WHERE c.session_id=p_session AND r.due_at=v_now AND c.resolved_logical_at=v_now) INTO v_due_at_input;
    v_after_expiry := p_operation IN ('parry','protect') OR (
      p_operation IN ('attack','bookmark_install','bookmark_return') AND EXISTS (
        SELECT 1 FROM ink_product_engine.ink_supply_rounds_v1 d WHERE d.session_id=p_session
          AND d.selected_round>0 AND d.logical_due_at=v_now AND d.decision_at=v_now
      ));
    SELECT operation INTO v_prior_action FROM ink_product_engine.ink_receipts_v1
      WHERE session_id=p_session AND principal_scope='player' AND authority_received_at=v_now
        AND outcome_code IN ('ATTACK_ACCEPTED','PARRY_ACCEPTED','PARRY_FAILED','PROTECTION_ACTIVE',
          'PARRY_CLOSED','MOVED','BOOKMARK_INSTALLED','CORRECTION_APPLIED','TRAP_INSTALLED','TRAP_STOPPED')
      ORDER BY committed_at DESC,receipt_id DESC LIMIT 1;
    IF v_prior_action IS NOT NULL AND NOT (v_prior_action IN ('attack','censor') AND p_operation IN ('attack','censor'))
        AND NOT (v_due_at_input AND v_after_expiry) THEN
      v_order_code := 'UNSUPPORTED_SAME_TIMESTAMP_ORDER';
    ELSIF v_due_at_input AND NOT v_after_expiry THEN
      v_order_code := 'UNSUPPORTED_SAME_TIME_NEW_ACTION';
    END IF;

    -- The approved 1-2 effects form one server-owned batch at the parent timestamp.
    -- Keep target, stun, grant, defense and expiry checks; separate manual actions still use R14.
    v_order_code := NULL;
    IF p_operation NOT IN ('correction','resume') AND EXISTS (
      SELECT 1 FROM ink_product_engine.ink_s4_effects_v1 WHERE session_id=p_session AND participant_id=v_member.participant_id
      AND owner_epoch=v_member.owner_epoch AND kind='stun' AND closed_at IS NULL AND starts_at<=v_now AND v_now<expires_at
      AND (progress_version IS NULL OR (progress_version,page_id,revision_id)=
        (v_member.progress_version,v_member.current_page_id,v_member.current_revision_id))
    ) THEN v_code := 'STUNNED'; EXIT input; END IF;
    IF p_operation NOT IN ('normal_link','correction','resume','trap_options')
      AND ink_product_engine.ink_s5_enabled_v1(p_session) AND ink_product_engine.ink_s5_is_sealed_v1(v_member,v_now)
    THEN v_code := 'ITEM_SEALED'; EXIT input; END IF;
    IF p_operation IN ('lost_link','search','link_index','enhancement','weakening','thunder','thief','roulette','cannon','search_execute','joker_claim') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN v_code := 'PARTICIPANT_READ_ONLY'; EXIT input; END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;
      BEGIN
        v_detail := ink_product_engine.ink_s5_apply_v1(v_member,p_operation,p_payload,v_now,v_receipt);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_s4_accepted := (v_detail->>'accepted')::boolean;
      v_code := v_detail->>'code'; v_detail := v_detail-ARRAY['accepted','code']; EXIT input;
    END IF;
    IF p_operation IN ('censor','correction','undo','trap_options','trap_install','bookmark_install') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN v_code := 'PARTICIPANT_READ_ONLY'; EXIT input; END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;
      BEGIN
        v_detail := ink_product_engine.ink_s4_apply_v1(p_session,v_member,p_operation,p_payload,v_now,v_receipt);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_s4_accepted := coalesce((v_detail->>'accepted')::boolean,false);
      v_code := v_detail->>'code'; v_detail := v_detail-ARRAY['accepted','code']; EXIT input;
    END IF;
    IF p_operation IN ('resume','normal_link','bookmark_return') THEN
      IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN
        v_code := 'PARTICIPANT_READ_ONLY'; EXIT input;
      END IF;
      IF p_operation='resume' THEN
        v_code := 'RESUMED';
        EXIT input;
      END IF;
      IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;

      -- A move names a candidate only. The authoritative current page and revision remain on the member row.
      IF pg_catalog.jsonb_typeof(p_payload->'expectedProgressVersion') IS DISTINCT FROM 'string'
        OR (p_payload->>'expectedProgressVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END IF;
      BEGIN
        v_progress := (p_payload->>'expectedProgressVersion')::bigint;
        IF p_operation='normal_link' THEN
          IF p_payload-ARRAY['expectedProgressVersion','expectedPageId','expectedRevisionId','targetPageId']<>'{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'expectedPageId') IS DISTINCT FROM 'string'
            OR pg_catalog.jsonb_typeof(p_payload->'expectedRevisionId') IS DISTINCT FROM 'string'
            OR pg_catalog.jsonb_typeof(p_payload->'targetPageId') IS DISTINCT FROM 'string' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          IF (p_payload->>'expectedPageId',p_payload->>'expectedRevisionId') IS DISTINCT FROM
             (v_member.current_page_id,v_member.current_revision_id) THEN
            v_code := 'STALE_DOCUMENT'; EXIT input;
          END IF;
          IF v_progress IS DISTINCT FROM v_member.progress_version THEN v_code := 'STALE_PROGRESS'; EXIT input; END IF;
          IF ((p_payload->>'targetPageId') IN (SELECT ink_product.course_exits(p_session,v_member.current_page_id,v_member.current_revision_id))) IS TRUE THEN
            IF ink_product_engine.ink_s5_trap_sealed_v1(p_session,v_member,p_payload->>'targetPageId',v_now) THEN
              v_code := 'TRAP_SEALED_LINK'; EXIT input;
            END IF;
            IF ink_product_engine.ink_s4_censored_v1(p_session,v_member,p_payload->>'targetPageId',v_now) THEN
              v_code := 'CENSORED_LINK'; EXIT input;
            END IF;
            v_trap := ink_product_engine.ink_s4_trap_hit_v1(p_session,v_member,p_payload->>'targetPageId',v_now,v_receipt);
            IF v_trap='sealed' THEN
              SELECT jsonb_build_object('trapOutcome','sealed','sealEffectId',e.effect_id) INTO STRICT v_detail
              FROM ink_product_engine.ink_s4_effects_v1 e
              WHERE e.session_id=p_session AND e.kind='trap_seal' AND e.opened_receipt_id=v_receipt;
              v_code := 'TRAP_STOPPED'; EXIT input;
            END IF;
            IF v_trap='stopped' THEN v_code := 'TRAP_STOPPED'; EXIT input; END IF;
          END IF;
          v_detail := ink_product_engine.ink_s3_move_v1(p_session,'normal_link',p_payload->>'targetPageId',NULL,
            v_progress,v_now,v_receipt);
          IF v_trap IN ('blocked','arrival') THEN
            IF v_detail->>'code'<>'MOVED' THEN RAISE EXCEPTION 'S4 trap movement must roll back'; END IF;
            v_detail := v_detail || jsonb_build_object('trapOutcome',v_trap);
            IF v_trap='arrival' THEN
              v_detail := v_detail || jsonb_build_object('stunEventSeq',ink_product_engine.ink_s4_trap_arrival_v1(p_session,v_member,v_now,v_receipt)::text);
            END IF;
          END IF;
        ELSIF p_operation='bookmark_return' THEN
          IF p_payload-ARRAY['expectedProgressVersion','rightId']<>'{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'rightId') IS DISTINCT FROM 'string' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          v_requested_right := (p_payload->>'rightId')::uuid;
          v_detail := ink_product_engine.ink_s3_move_v1(p_session,'bookmark_return',NULL,v_requested_right,
            v_progress,v_now,v_receipt);
        END IF;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_code := 'INVALID_INPUT'; EXIT input;
      END;
      v_code := v_detail->>'code';
      v_detail := v_detail-'code';
      EXIT input;
    END IF;

    -- Version-scoped combat admission mirrors S2 and shares settlement and debit helpers.
    IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(p_payload->'grantId') IS DISTINCT FROM 'string' THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END IF;
    BEGIN
      v_grant_id := (p_payload->>'grantId')::uuid;
      IF p_operation='parry' THEN
        IF p_payload - ARRAY['grantId','childId'] <> '{}'::jsonb
            OR pg_catalog.jsonb_typeof(p_payload->'childId') IS DISTINCT FROM 'string' THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
        v_child_id := (p_payload->>'childId')::uuid;
      ELSE
        IF pg_catalog.jsonb_typeof(p_payload->'expectedInventoryVersion') IS DISTINCT FROM 'string'
            OR (p_payload->>'expectedInventoryVersion') !~ '^(0|[1-9][0-9]{0,18})$' THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
        v_expected_inventory := (p_payload->>'expectedInventoryVersion')::bigint;
        IF p_operation='attack' THEN
          IF p_payload - ARRAY['grantId','expectedInventoryVersion','targetParticipantIds'] <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(p_payload->'targetParticipantIds') IS DISTINCT FROM 'array' THEN
            v_code := 'INVALID_INPUT'; EXIT input;
          END IF;
          IF pg_catalog.jsonb_array_length(p_payload->'targetParticipantIds') NOT BETWEEN 1 AND 2
             OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_payload->'targetParticipantIds') AS e(value)
                         WHERE pg_catalog.jsonb_typeof(e.value) <> 'string') THEN
            v_code := 'INVALID_TARGETS'; EXIT input;
          END IF;
          SELECT pg_catalog.array_agg(value::uuid ORDER BY position) INTO v_targets
            FROM pg_catalog.jsonb_array_elements_text(p_payload->'targetParticipantIds') WITH ORDINALITY AS e(value,position);
        ELSIF p_payload - ARRAY['grantId','expectedInventoryVersion'] <> '{}'::jsonb THEN
          v_code := 'INVALID_INPUT'; EXIT input;
        END IF;
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      v_code := 'INVALID_INPUT'; EXIT input;
    END;

    IF p_operation='parry' THEN
      SELECT c.* INTO v_child FROM ink_product_engine.ink_attack_children_v1 c
        WHERE c.session_id=p_session AND c.child_id=v_child_id
          AND c.target_participant_id=v_member.participant_id AND c.target_epoch=v_member.owner_epoch;
      IF NOT FOUND THEN v_code := 'WARNING_NOT_OWNED'; EXIT input; END IF;
      IF v_child.state<>'pending' THEN v_code := 'PARRY_CLOSED'; EXIT input; END IF;
      IF v_child.parry_attempt_receipt_id IS NOT NULL THEN v_code := 'PARRY_ALREADY_ATTEMPTED'; EXIT input; END IF;
    END IF;
    IF v_session.lifecycle_state<>'playing' OR v_member.player_status<>'playing' THEN
      v_code := 'PARTICIPANT_READ_ONLY'; EXIT input;
    END IF;

    IF v_order_code IS NOT NULL THEN v_code := v_order_code; EXIT input; END IF;

    IF p_operation<>'parry' AND v_member.inventory_version<>v_expected_inventory THEN
      v_code := 'STALE_INVENTORY'; EXIT input;
    END IF;
    v_item := CASE p_operation WHEN 'attack' THEN 'ink' WHEN 'parry' THEN 'parry' ELSE 'shield' END;
    SELECT * INTO v_grant FROM ink_product_engine.ink_grants_v1
      WHERE session_id=p_session AND grant_id=v_grant_id AND owner_participant_id=v_member.participant_id
        AND owner_epoch=v_member.owner_epoch AND consumed_at IS NULL;
    IF NOT FOUND THEN v_code := 'GRANT_NOT_OWNED'; EXIT input; END IF;
    IF v_grant.item_id<>v_item THEN v_code := 'WRONG_ITEM_KIND'; EXIT input; END IF;

    IF p_operation IN ('parry','protect') AND ink_product_engine.ink_s5_enabled_v1(p_session) THEN
      v_tier := ink_product_engine.ink_s5_grant_tier_v2(p_session,v_grant.grant_id,v_grant.base_tier);
      IF p_operation='parry' AND v_tier='enhanced' AND NOT EXISTS (
        SELECT FROM ink_product_engine.ink_attack_roots_v1 root
        JOIN ink_product_engine.ink_grants_v1 g USING(session_id,grant_id)
        WHERE (root.session_id,root.root_id)=(p_session,v_child.root_id) AND g.item_id IN ('ink','censor','thunder')
      ) THEN v_code := 'S5_REFLECTION_TIER_UNAVAILABLE'; EXIT input; END IF;
    END IF;
    IF p_operation='attack' THEN
      IF (SELECT count(DISTINCT target) FROM pg_catalog.unnest(v_targets) AS a(target)) <> pg_catalog.cardinality(v_targets)
         OR v_member.participant_id=ANY(v_targets)
         OR (SELECT count(*) FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
             AND participant_id=ANY(v_targets) AND member_role='player' AND player_status='playing') <> pg_catalog.cardinality(v_targets) THEN
        v_code := 'INVALID_TARGETS'; EXIT input;
      END IF;

      SELECT right_id INTO v_enhancement FROM ink_product_engine.ink_rights_v1
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
          AND kind='enhancement' AND closed_at IS NULL AND installed_at<=v_now AND remaining_charges=1;
      SELECT right_id INTO v_weakening FROM ink_product_engine.ink_rights_v1
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
          AND kind='weakening' AND closed_at IS NULL AND installed_at<=v_now AND remaining_charges=1;
      v_tier := CASE WHEN v_enhancement IS NOT NULL AND v_weakening IS NULL THEN 'enhanced'
                     WHEN v_weakening IS NOT NULL AND v_enhancement IS NULL THEN 'weakened'
                     ELSE v_grant.base_tier END;
      IF ink_product_engine.ink_s5_enabled_v1(p_session) THEN
        v_tier := ink_product_engine.ink_s5_grant_tier_v2(p_session,v_grant.grant_id,v_tier);
      END IF;
      v_root := pg_catalog.gen_random_uuid();
      v_due_at := v_now+ink_product_engine.ink_s5_warning_window_v1(p_session);
      INSERT INTO ink_product_engine.ink_attack_roots_v1 (
        session_id,root_id,source_participant_id,source_epoch,grant_id,acceptance_seq,
        accepted_at,due_at,base_tier,effective_tier,acceptance_receipt_id
      ) VALUES (p_session,v_root,v_member.participant_id,v_member.owner_epoch,v_grant_id,
        v_session.next_acceptance_seq,v_now,v_due_at,v_grant.base_tier,v_tier,v_receipt);
      UPDATE ink_product_engine.ink_sessions_v1 SET next_acceptance_seq=next_acceptance_seq+1 WHERE session_id=p_session;
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,v_root);
      IF v_enhancement IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_enhancement,v_now,v_receipt,v_root);
      END IF;
      IF v_weakening IS NOT NULL THEN
        PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,v_weakening,v_now,v_receipt,v_root);
      END IF;
      FOREACH v_target IN ARRAY v_targets LOOP
        SELECT owner_epoch INTO STRICT v_target_epoch FROM ink_product_engine.ink_members_v1
          WHERE session_id=p_session AND participant_id=v_target;
        v_child_id := pg_catalog.gen_random_uuid();
        INSERT INTO ink_product_engine.ink_attack_children_v1
          (session_id,child_id,root_id,target_participant_id,target_epoch,state,warning_event_seq)
        VALUES (p_session,v_child_id,v_root,v_target,v_target_epoch,'pending',
          ink_product_engine.ink_s2_next_event_v1(p_session,v_target));
        v_children := v_children || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'childId',v_child_id,'targetParticipantId',v_target));
      END LOOP;
      v_code := 'ATTACK_ACCEPTED';
      v_detail := pg_catalog.jsonb_build_object('rootId',v_root,'children',v_children,'dueAt',v_due_at,
        'acceptanceSeq',v_session.next_acceptance_seq::text,'tier',v_tier);
    ELSIF p_operation='parry' THEN
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,v_child.root_id);
      UPDATE ink_product_engine.ink_attack_children_v1 SET parry_attempt_receipt_id=v_receipt,
        reflection_tier=CASE WHEN v_tier='enhanced' THEN 'enhanced' END
        WHERE session_id=p_session AND child_id=v_child_id;
      v_detail := pg_catalog.jsonb_build_object('childId',v_child_id);
      IF v_tier='weakened' THEN
        PERFORM ink_product_engine.ink_s5_parry_block_v1(p_session,v_child,v_now,v_receipt);
        v_code := 'PARRY_ACCEPTED';
        v_detail := v_detail || jsonb_build_object('outcome','blocked','effectiveTier','weakened');
      ELSIF v_session.init_canonical_payload->>'variant'='parry_failure' THEN
        PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_member.participant_id);
        v_code := 'PARRY_FAILED';
      ELSE
        v_code := 'PARRY_ACCEPTED';
        v_detail := v_detail || pg_catalog.jsonb_build_object('outcome',
          ink_product_engine.ink_s4_resolve_v1(p_session,v_child_id,v_now,true,v_receipt));
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
        AND owner_participant_id=v_member.participant_id AND owner_epoch=v_member.owner_epoch
        AND kind='protection' AND closed_at IS NULL AND remaining_charges=1 AND v_now<expires_at) THEN
        v_code := 'UNSUPPORTED_PROTECTION_REPLACEMENT'; EXIT input;
      END IF;
      UPDATE ink_product_engine.ink_rights_v1 SET closed_at=expires_at,close_reason='expired'
        WHERE session_id=p_session AND owner_participant_id=v_member.participant_id
          AND kind='protection' AND closed_at IS NULL AND expires_at<=v_now;
      PERFORM ink_product_engine.ink_s2_spend_grant_v1(v_grant,v_now,v_receipt,NULL);
      INSERT INTO ink_product_engine.ink_rights_v1 (session_id,right_id,owner_participant_id,owner_epoch,kind,
        source_grant_id,right_version,installed_at,expires_at,remaining_charges)
      VALUES (p_session,pg_catalog.gen_random_uuid(),v_member.participant_id,v_member.owner_epoch,'protection',
        v_grant_id,1,v_now,CASE WHEN v_tier='enhanced' THEN 'infinity'::timestamptz
        ELSE v_now+CASE WHEN v_tier='weakened' THEN interval '4 seconds' ELSE interval '8 seconds' END END,1);
      v_code := 'PROTECTION_ACTIVE';
    END IF;
  END input;

  UPDATE ink_product_engine.ink_sessions_v1 SET state_revision=state_revision+1
    WHERE session_id=p_session RETURNING state_revision INTO STRICT v_revision;
  v_response := pg_catalog.jsonb_build_object(
    'ok',v_s4_accepted OR v_code IN ('ATTACK_ACCEPTED','PARRY_ACCEPTED','PARRY_FAILED','PROTECTION_ACTIVE','ADVANCED','RESUMED','MOVED','BOOKMARK_INSTALLED'),
    'code',v_code,'operation',p_operation,'requestId',p_request,'receiptId',v_receipt,
    'authorityReceivedAt',v_now,'stateRevision',v_revision::text) || v_detail;
  PERFORM ink_product_engine.ink_s3_record_v1(p_session,v_receipt,p_scope,p_actor,p_request,p_operation,v_payload,v_now,v_response);
  RETURN v_response;
END;
$_$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_auto_dispatch_v1(p_parent_at timestamp with time zone, p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_auto_execute_v1(ink_product_engine.ink_members_v1, text, uuid, uuid, integer, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_auto_execute_v1(p_member ink_product_engine.ink_members_v1, p_item text, p_target uuid, p_parent uuid, p_ordinal integer, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE m ink_product_engine.ink_members_v1; v_virtual_grant uuid:=gen_random_uuid(); request uuid:=gen_random_uuid();
 slots smallint[]; payload jsonb; operation text; reply jsonb; options jsonb; child uuid;
BEGIN
 IF p_item NOT IN('ink','censor','trap','lost_link','parry','shield','correction','bookmark','undo','search','link_index')
  OR NOT ink_product_engine.ink_s5_phase1_enabled_v1(p_member.session_id) THEN RAISE EXCEPTION 'AUTO_ITEM_FORBIDDEN'; END IF;
 SELECT * INTO STRICT m FROM ink_product_engine.ink_members_v1 e WHERE (e.session_id,e.participant_id,e.owner_epoch)=
  (p_member.session_id,p_member.participant_id,p_member.owner_epoch) AND e.player_status='playing';
 slots:=ink_product_engine.ink_s5_joker_free_slots_v1(m);
 IF cardinality(slots)=0 THEN RETURN jsonb_build_object('ok',false,'code','AUTO_NO_TEMPORARY_SLOT'); END IF;
 INSERT INTO ink_product_engine.ink_grants_v1(session_id,grant_id,owner_participant_id,owner_epoch,item_id,base_tier,slot_index,granted_at)
 VALUES(m.session_id,v_virtual_grant,m.participant_id,m.owner_epoch,p_item,'normal',slots[1],p_at);
 UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1
 WHERE session_id=m.session_id AND participant_id=m.participant_id RETURNING * INTO m;
 operation:=CASE p_item WHEN 'ink' THEN 'attack' WHEN 'shield' THEN 'protect' WHEN 'bookmark' THEN 'bookmark_install'
  WHEN 'trap' THEN 'trap_install' ELSE p_item END;
 payload:=jsonb_build_object('grantId',v_virtual_grant,'expectedInventoryVersion',m.inventory_version::text);
 IF p_item IN('ink','censor') THEN payload:=payload||jsonb_build_object('targetParticipantIds',ARRAY[p_target]);
 ELSIF p_item='lost_link' THEN payload:=payload||jsonb_build_object('targetParticipantId',p_target);
 ELSIF p_item='trap' THEN
  options:=ink_product_engine.ink_s4_trap_choices_v1(m.session_id,m,p_target,v_virtual_grant,p_at);
  IF jsonb_array_length(options)=0 THEN RETURN jsonb_build_object('ok',false,'code','AUTO_TRAP_UNAVAILABLE'); END IF;
  payload:=payload||jsonb_build_object('targetParticipantId',p_target,'selectionToken',options->0->>'selectionToken');
 ELSIF p_item IN('bookmark','undo') THEN payload:=payload||jsonb_build_object('expectedProgressVersion',m.progress_version::text);
 ELSIF p_item IN('search','link_index') THEN
  payload:=payload||jsonb_build_object('expectedProgressVersion',m.progress_version::text,
   'expectedSnapshotId',(ink_product.course_document(m.session_id,m.current_page_id)).id);
 ELSIF p_item='parry' THEN
  SELECT c.child_id INTO child FROM ink_product_engine.ink_attack_children_v1 c JOIN ink_product_engine.ink_attack_roots_v1 a USING(session_id,root_id)
  WHERE c.session_id=m.session_id AND c.target_participant_id=m.participant_id AND c.target_epoch=m.owner_epoch
   AND c.state='pending' AND c.parry_attempt_receipt_id IS NULL AND a.accepted_at<=p_at AND a.due_at>p_at ORDER BY a.due_at,c.child_id LIMIT 1;
  IF child IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTO_PARRY_UNAVAILABLE'); END IF;
  payload:=jsonb_build_object('grantId',v_virtual_grant,'childId',child);
 END IF;
 reply:=ink_product_engine.ink_s5_phase1_auto_dispatch_v1(p_at,m.session_id,request,ink_product_engine.ink_s4_client_binding_v1(),'player',m.user_id,operation,payload);
 IF reply->>'ok'='true' THEN
  IF EXISTS(SELECT FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=m.session_id AND g.grant_id=v_virtual_grant AND g.consumed_at IS NULL)
   THEN RAISE EXCEPTION 'AUTO_GRANT_NOT_CONSUMED'; END IF;
  INSERT INTO ink_product_engine.ink_s5_phase1_auto_v1 VALUES(m.session_id,p_parent,p_ordinal,request,v_virtual_grant,p_item,p_target,reply);
 END IF;
 RETURN reply;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_auto_execute_v1(p_member ink_product_engine.ink_members_v1, p_item text, p_target uuid, p_parent uuid, p_ordinal integer, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_enabled_v1(uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_enabled_v1(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM ink_product.rooms r JOIN ink_product.s5_phase1_policies_v1 p USING(binding)
 WHERE r.session_id=p_session AND r.binding->>'schemaVersion'='candidate-v3')
 $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_enabled_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_reward_after_v1(uuid, uuid, integer, boolean, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_reward_after_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean, p_excluded text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE roll integer; pool text[]; category integer;
BEGIN
 IF NOT ink_product_engine.ink_s5_phase1_enabled_v1(p_session) OR p_ordinal NOT IN(1,2) THEN RAISE EXCEPTION 'INVALID_REWARD_CONTEXT'; END IF;
 IF p_weakened THEN category:=ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:category/'||p_ordinal,3);
 ELSE
  roll:=ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:category/'||p_ordinal,100);
  category:=CASE WHEN roll<25 THEN 0 WHEN roll<50 THEN 1 WHEN roll<75 THEN 2 WHEN roll<85 THEN 3 ELSE 4 END;
 END IF;
 pool:=CASE category WHEN 0 THEN ARRAY['ink','censor','trap','lost_link']
  WHEN 1 THEN ARRAY['parry','shield','correction'] WHEN 2 THEN ARRAY['bookmark','undo','search','link_index']
  WHEN 3 THEN ARRAY['thunder','thief','roulette','cannon'] ELSE ARRAY['enhancement','weakening'] END;
 -- R14's two rewards remain distinct. Every approved category has at least two items,
 -- so excluding the first item never changes the category's approved probability.
 IF p_excluded IS NOT NULL THEN pool:=array_remove(pool,p_excluded); END IF;
 RETURN pool[1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:item/'||p_ordinal,cardinality(pool))];
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_reward_after_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean, p_excluded text) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_reward_v1(uuid, uuid, integer, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_reward_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT ink_product_engine.ink_s5_phase1_reward_after_v1(p_session,p_receipt,p_ordinal,p_weakened,NULL)
$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_reward_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_roulette_v1(uuid, ink_product_engine.ink_members_v1, jsonb, timestamp with time zone, uuid, text, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_roulette_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE success boolean; candidates jsonb; selected jsonb; reply jsonb; children jsonb:='[]'; requested integer;
 excluded text[]:=ARRAY[]::text[]; choices uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];
 items text[]; gifts jsonb; tier text; held uuid[]; pending_created boolean;
 probe_grant ink_product_engine.ink_grants_v1; eligible_items text[]; selected_item text;
BEGIN
 IF NOT p_apply THEN
  IF p_tier='enhanced' AND ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:outcome',10000)<5000 THEN
   -- Validate the same server-drawn plan without retaining any mutation.
   -- This also works with a full bag: the played roulette temporarily frees its own slot.
   BEGIN
    SELECT * INTO STRICT probe_grant FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=p_session AND g.grant_id=(p_payload->>'grantId')::uuid;
    PERFORM ink_product_engine.ink_s2_spend_grant_v1(probe_grant,p_at,p_receipt,NULL);
    requested:=1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:auto-count',2);
    FOR ordinal IN 1..requested LOOP
     candidates:=ink_product_engine.ink_s5_phase1_auto_candidates_v1(p_member,p_receipt,ordinal,excluded,p_at);
     IF jsonb_array_length(candidates)=0 THEN RAISE EXCEPTION USING ERRCODE='P1A02',MESSAGE='NO_SAFE_AUTO_PLAN'; END IF;
     SELECT array_agg(DISTINCT c->>'itemId' ORDER BY c->>'itemId') INTO eligible_items FROM jsonb_array_elements(candidates)c;
     selected_item:=eligible_items[1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:auto-item/'||ordinal,cardinality(eligible_items))];
     SELECT jsonb_agg(c ORDER BY c->>'targetParticipantId') INTO candidates FROM jsonb_array_elements(candidates)c WHERE c->>'itemId'=selected_item;
     selected:=candidates->ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:auto-target/'||ordinal,jsonb_array_length(candidates));
     reply:=ink_product_engine.ink_s5_phase1_auto_execute_v1(p_member,selected->>'itemId',(selected->>'targetParticipantId')::uuid,p_receipt,ordinal,p_at);
     IF reply->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION USING ERRCODE='P1A02',MESSAGE='AUTO_PLAN_CHANGED'; END IF;
     excluded:=array_append(excluded,selected->>'itemId');
    END LOOP;
    RAISE EXCEPTION USING ERRCODE='P1A01',MESSAGE='ROLLBACK_AUTO_PLAN';
   EXCEPTION WHEN SQLSTATE 'P1A01' THEN NULL;
    WHEN SQLSTATE 'P1A02' THEN RETURN jsonb_build_object('accepted',false,'code','ROULETTE_AUTO_UNAVAILABLE');
   END;
  END IF;
  RETURN jsonb_build_object('accepted',true,'code','S5_READY');
 END IF;
 success:=ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:outcome',10000)<5000;
 IF NOT success THEN
  INSERT INTO ink_product_engine.ink_s5_roulette_supply_v1(session_id,participant_id,owner_epoch,source_receipt_id)
  VALUES(p_session,p_member.participant_id,p_member.owner_epoch,p_receipt)
  ON CONFLICT(session_id,participant_id,owner_epoch) WHERE applied_grant_id IS NULL DO NOTHING;
  pending_created:=FOUND;
  held:=ink_product_engine.ink_s5_modifier_eligible_v2(p_member,'weakening',(p_payload->>'grantId')::uuid);
  IF cardinality(held)>0 OR pending_created THEN
   PERFORM ink_product_engine.ink_s5_assign_modifier_v2(p_member,'weakening',cardinality(held)+CASE WHEN pending_created THEN 1 ELSE 0 END,held,p_at,p_receipt);
  END IF;
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
  RETURN jsonb_build_object('accepted',true,'code','ROULETTE_RESOLVED','success',false,'nextSupplyWeakened',true);
 END IF;
 IF p_tier='enhanced' THEN
  requested:=1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:auto-count',2);
  FOR ordinal IN 1..requested LOOP
   candidates:=ink_product_engine.ink_s5_phase1_auto_candidates_v1(p_member,p_receipt,ordinal,excluded,p_at);
   IF jsonb_array_length(candidates)=0 THEN
    RAISE EXCEPTION 'ROULETTE_NO_EXECUTABLE_AUTO_EFFECT';
   END IF;
   SELECT array_agg(DISTINCT c->>'itemId' ORDER BY c->>'itemId') INTO eligible_items FROM jsonb_array_elements(candidates)c;
   selected_item:=eligible_items[1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:auto-item/'||ordinal,cardinality(eligible_items))];
   SELECT jsonb_agg(c ORDER BY c->>'targetParticipantId') INTO candidates FROM jsonb_array_elements(candidates)c WHERE c->>'itemId'=selected_item;
   selected:=candidates->ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'roulette:auto-target/'||ordinal,jsonb_array_length(candidates));
   BEGIN
    reply:=ink_product_engine.ink_s5_phase1_auto_execute_v1(p_member,selected->>'itemId',(selected->>'targetParticipantId')::uuid,p_receipt,ordinal,p_at);
    IF reply->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'AUTO_ELIGIBILITY_CHANGED'; END IF;
   END;
   excluded:=array_append(excluded,selected->>'itemId');
   children:=children||jsonb_build_array(selected||jsonb_build_object('childId',reply->>'receiptId','code',reply->>'code'));
  END LOOP;
 END IF;
 items:=ARRAY[ink_product_engine.ink_s5_phase1_reward_v1(p_session,p_receipt,1,p_tier='weakened')];
 items:=array_append(items,ink_product_engine.ink_s5_phase1_reward_after_v1(p_session,p_receipt,2,p_tier='weakened',items[1]));
 tier:=CASE WHEN p_tier='weakened' THEN 'normal' ELSE 'enhanced' END;
 INSERT INTO ink_product_engine.ink_s5_joker_candidates_v1(session_id,offer_id,candidate_id,ordinal,participant_id,owner_epoch,item_id,base_tier,offered_at)
 SELECT p_session,p_receipt,choices[n],n,p_member.participant_id,p_member.owner_epoch,items[n],tier,p_at FROM generate_series(1,2)n;
 IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(p_member))=2 OR(ink_product_engine.ink_s5_phase2_enabled_v1(p_session)AND cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(p_member))>0) THEN
  gifts:=ink_product_engine.ink_s5_deliver_candidates_v1(p_member,p_receipt,choices,p_at,p_receipt);
 ELSE PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
 END IF;
 RETURN jsonb_build_object('accepted',true,'code','ROULETTE_RESOLVED','success',true,'offerId',p_receipt,
  'delivery',CASE WHEN gifts IS NULL THEN 'offered' ELSE 'held' END,'grants',gifts,
  'automaticChildren',children,'automaticChild',CASE WHEN jsonb_array_length(children)>0 THEN children->0 END);
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_roulette_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_thief_v1(uuid, ink_product_engine.ink_members_v1, ink_product_engine.ink_members_v1, jsonb, timestamp with time zone, uuid, text, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_thief_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE candidates uuid[]; stolen ink_product_engine.ink_grants_v1; grant_tier text;
 candidate uuid:=gen_random_uuid(); gifts jsonb; success boolean;
BEGIN
 IF p_target.session_id IS DISTINCT FROM p_session OR p_target.player_status IS DISTINCT FROM 'playing'
   OR p_target.member_role IS DISTINCT FROM 'player' OR p_target.participant_id=p_member.participant_id
   OR p_tier NOT IN ('normal','enhanced','weakened') THEN
  RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE');
 END IF;
 SELECT array_agg(g.grant_id ORDER BY g.slot_index,g.grant_id) INTO candidates
 FROM ink_product_engine.ink_grants_v1 g
 WHERE (g.session_id,g.owner_participant_id,g.owner_epoch)=(p_session,p_target.participant_id,p_target.owner_epoch)
  AND g.consumed_at IS NULL AND (p_tier='normal' OR
   ink_product_engine.ink_s5_grant_tier_v2(p_session,g.grant_id,g.base_tier)=p_tier);
 IF coalesce(cardinality(candidates),0)=0 THEN
  RETURN jsonb_build_object('accepted',false,'code','THIEF_NO_TRANSFERABLE_GRANT');
 END IF;
 IF NOT p_apply THEN RETURN jsonb_build_object('accepted',true,'code','S5_READY'); END IF;
 success:=ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'thief:outcome',10000)<5000;
 IF NOT success THEN
  -- The played thief is debited by the existing dispatcher. Nothing else changes hands.
  RETURN jsonb_build_object('accepted',true,'code','THIEF_RESOLVED','success',false,
   'delivery','none','phase1Policy','s5-phase1-20261113-v1');
 END IF;
 SELECT * INTO STRICT stolen FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=p_session
  AND g.grant_id=candidates[1+ink_product_engine.ink_s5_draw_v1(p_session,p_receipt,'thief:transfer',cardinality(candidates))]
  AND g.consumed_at IS NULL;
 grant_tier:=ink_product_engine.ink_s5_grant_tier_v2(p_session,stolen.grant_id,stolen.base_tier);
 -- Capture the effective grade before the source consumption closes attached modifier units.
 PERFORM ink_product_engine.ink_s2_spend_grant_v1(stolen,p_at,p_receipt,NULL);
 PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,stolen.owner_participant_id);
 INSERT INTO ink_product_engine.ink_s5_joker_candidates_v1
  (session_id,offer_id,candidate_id,ordinal,participant_id,owner_epoch,item_id,base_tier,source_grant_id,offered_at)
 VALUES(p_session,p_receipt,candidate,1,p_member.participant_id,p_member.owner_epoch,
  stolen.item_id,grant_tier,stolen.grant_id,p_at);
 IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(p_member))>0 THEN
  gifts:=ink_product_engine.ink_s5_deliver_candidates_v1(p_member,p_receipt,ARRAY[candidate],p_at,p_receipt);
 ELSE PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,p_member.participant_id);
 END IF;
 RETURN jsonb_build_object('accepted',true,'code','THIEF_RESOLVED','success',true,
  'offerId',p_receipt,'delivery',CASE WHEN gifts IS NULL THEN 'offered' ELSE 'held' END,
  'transferredItemId',stolen.item_id,'receivedTier',grant_tier,'grants',gifts,
  'phase1Policy','s5-phase1-20261113-v1');
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_thief_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_thunder_v1(ink_product_engine.ink_members_v1, text, boolean, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase1_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE chain ink_product_engine.ink_s5_phase1_thunder_chains_v1; bundle uuid:=gen_random_uuid();
 first_at timestamptz; stun_until timestamptz; details jsonb; duration integer;
BEGIN
 IF p_member.player_status<>'playing' OR p_tier NOT IN ('normal','enhanced','weakened') THEN RAISE EXCEPTION 'INVALID_THUNDER_RECIPIENT'; END IF;
 duration:=CASE WHEN p_self THEN 5 WHEN p_tier='enhanced' THEN 4 WHEN p_tier='weakened' THEN 2 ELSE 3 END;
 SELECT * INTO chain FROM ink_product_engine.ink_s5_phase1_thunder_chains_v1 c
 WHERE (c.session_id,c.participant_id,c.owner_epoch)=(p_member.session_id,p_member.participant_id,p_member.owner_epoch) FOR UPDATE;
 -- A correction closes the stun and breaks the chain. F5 and document moves do not.
 IF chain.ends_at>=p_at AND EXISTS(SELECT FROM ink_product_engine.ink_s4_effects_v1 e
  WHERE (e.session_id,e.participant_id,e.owner_epoch)=(p_member.session_id,p_member.participant_id,p_member.owner_epoch)
   AND e.kind='stun' AND e.payload->>'source'='thunder' AND e.closed_at IS NULL AND e.starts_at<=p_at AND e.expires_at>=p_at) THEN
  first_at:=chain.started_at;
  stun_until:=least(first_at+interval '5 seconds',greatest(chain.ends_at,p_at+make_interval(secs=>duration)));
 ELSE first_at:=p_at;stun_until:=p_at+make_interval(secs=>duration);
 END IF;
 INSERT INTO ink_product_engine.ink_s5_phase1_thunder_chains_v1 VALUES(p_member.session_id,p_member.participant_id,p_member.owner_epoch,first_at,stun_until)
 ON CONFLICT(session_id,participant_id,owner_epoch) DO UPDATE SET started_at=EXCLUDED.started_at,ends_at=EXCLUDED.ends_at;
 details:=jsonb_build_object('source','thunder','bundleId',bundle,'selfPenalty',p_self,'tier',p_tier,
  'childId',p_child,'chainStartsAt',first_at,'chainCapAt',first_at+interval '5 seconds','phase1Policy','s5-phase1-20261113-v1');
 IF p_self THEN details:=details||jsonb_build_object('sealStartsAt',stun_until); END IF;
 IF stun_until>p_at THEN
  INSERT INTO ink_product_engine.ink_s4_effects_v1(session_id,effect_id,participant_id,owner_epoch,kind,starts_at,expires_at,payload,opened_receipt_id)
  VALUES(p_member.session_id,bundle,p_member.participant_id,p_member.owner_epoch,'stun',p_at,stun_until,details,p_receipt);
 END IF;
 -- Preserve the R14 failure penalty: base 5s self stun followed by 3s item seal.
 -- Only the approved shared continuous-stun cap can shorten an overlapping stun.
 IF p_self THEN
  INSERT INTO ink_product_engine.ink_s4_effects_v1(session_id,effect_id,participant_id,owner_epoch,kind,starts_at,expires_at,payload,opened_receipt_id)
  VALUES(p_member.session_id,gen_random_uuid(),p_member.participant_id,p_member.owner_epoch,'thunder_seal',p_at,stun_until+interval '3 seconds',details,p_receipt);
 END IF;
 RETURN CASE WHEN stun_until>p_at THEN bundle ELSE NULL END;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase1_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_deliver_v1(ink_product_engine.ink_members_v1, integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_deliver_v1(p_member ink_product_engine.ink_members_v1, p_limit integer, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE head uuid;reply jsonb;result jsonb:='[]';inv bigint;item text;tier text;
BEGIN
 FOR n IN 1..least(p_limit,cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(p_member)))LOOP
  head:=ink_product_engine.ink_s5_phase2_reward_head_v1(p_member,p_at);EXIT WHEN head IS NULL;
  SELECT inventory_version INTO inv FROM ink_product_engine.ink_members_v1 WHERE session_id=p_member.session_id AND participant_id=p_member.participant_id;
  SELECT c.item_id,c.base_tier INTO item,tier FROM ink_product_engine.ink_s5_joker_candidates_v1 c WHERE c.session_id=p_member.session_id AND c.candidate_id=head;
  reply:=ink_product_engine.ink_s5_phase2_reward_v1(p_member,'reward_claim',jsonb_build_object('candidateId',head,'expectedInventoryVersion',inv::text),p_at,p_receipt);
  IF reply->>'accepted'<>'true' THEN RAISE EXCEPTION 'AUTO_REWARD_DELIVERY_CHANGED';END IF;
  result:=result||jsonb_build_array(jsonb_build_object('grantId',reply->>'grantId','itemId',item,'tier',tier));
 END LOOP;RETURN result;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_deliver_v1(p_member ink_product_engine.ink_members_v1, p_limit integer, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_due_v1(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_due_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone) RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT CASE WHEN ink_product_engine.ink_s5_phase2_enabled_v1(p_session) THEN
  CASE WHEN p_at<p_started THEN -1 WHEN p_at<p_started+interval '20 seconds' THEN 0
   ELSE least(48,1+floor(extract(epoch FROM(p_at-p_started-interval '20 seconds'))/25)::bigint) END
 ELSE ink_product_engine.ink_s3_due_round_v1(p_started,p_at) END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_due_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_expire_rewards_v1(uuid, timestamp with time zone, uuid, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_expire_rewards_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_terminal boolean) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
 UPDATE ink_product_engine.ink_s5_joker_candidates_v1 c SET resolved_receipt_id=p_receipt FROM ink_product_engine.ink_s5_phase2_rewards_v1 q
 WHERE(c.session_id,c.offer_id,c.candidate_id)=(q.session_id,q.offer_id,q.candidate_id)AND q.session_id=p_session AND q.closed_at IS NULL AND c.resolved_receipt_id IS NULL AND(p_terminal OR q.expires_at<=p_at);
 UPDATE ink_product_engine.ink_s5_phase2_rewards_v1 SET closed_at=CASE WHEN p_terminal THEN p_at ELSE expires_at END,reason=CASE WHEN p_terminal THEN 'terminal' ELSE 'expired' END
 WHERE session_id=p_session AND closed_at IS NULL AND(p_terminal OR expires_at<=p_at);
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_expire_rewards_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_terminal boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_offer_trigger_v1(); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_offer_trigger_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
 IF ink_product_engine.ink_s5_phase2_enabled_v1(NEW.session_id)THEN
 INSERT INTO ink_product_engine.ink_s5_phase2_rewards_v1(session_id,offer_id,candidate_id,offered_at,expires_at)
 VALUES(NEW.session_id,NEW.offer_id,NEW.candidate_id,NEW.offered_at,NEW.offered_at+interval '15 seconds');END IF;RETURN NEW;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_offer_trigger_v1() OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_reward_head_v1(ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_reward_head_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT q.candidate_id FROM ink_product_engine.ink_s5_phase2_rewards_v1 q JOIN ink_product_engine.ink_s5_joker_candidates_v1 c USING(session_id,offer_id,candidate_id)
 WHERE q.session_id=p_member.session_id AND c.participant_id=p_member.participant_id AND c.owner_epoch=p_member.owner_epoch
 AND q.closed_at IS NULL AND c.resolved_receipt_id IS NULL AND q.offered_at<=p_at AND p_at<q.expires_at ORDER BY q.sequence LIMIT 1
$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_reward_head_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_reward_v1(ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_reward_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE c ink_product_engine.ink_s5_joker_candidates_v1;q ink_product_engine.ink_s5_phase2_rewards_v1;old ink_product_engine.ink_grants_v1;g uuid;slot smallint;inv bigint;
BEGIN
 IF p_payload-ARRAY['candidateId','replaceGrantId','expectedInventoryVersion']<>'{}' OR p_member.player_status<>'playing' THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_REWARD_INPUT');END IF;
 SELECT x.* INTO q FROM ink_product_engine.ink_s5_phase2_rewards_v1 x WHERE x.session_id=p_member.session_id AND x.candidate_id=(p_payload->>'candidateId')::uuid FOR UPDATE;
 SELECT x.* INTO c FROM ink_product_engine.ink_s5_joker_candidates_v1 x WHERE(x.session_id,x.offer_id,x.candidate_id)=(q.session_id,q.offer_id,q.candidate_id)
 AND x.participant_id=p_member.participant_id AND x.owner_epoch=p_member.owner_epoch AND x.resolved_receipt_id IS NULL;
 IF c.candidate_id IS NULL OR q.closed_at IS NOT NULL OR p_at>=q.expires_at OR p_at<q.offered_at THEN RETURN jsonb_build_object('accepted',false,'code','REWARD_UNAVAILABLE');END IF;
 IF c.candidate_id IS DISTINCT FROM ink_product_engine.ink_s5_phase2_reward_head_v1(p_member,p_at) THEN RETURN jsonb_build_object('accepted',false,'code','REWARD_FIFO_REQUIRED');END IF;
 IF p_operation='reward_claim' THEN
  SELECT inventory_version INTO inv FROM ink_product_engine.ink_members_v1 WHERE session_id=p_member.session_id AND participant_id=p_member.participant_id;
  IF p_payload->>'expectedInventoryVersion' IS DISTINCT FROM inv::text THEN RETURN jsonb_build_object('accepted',false,'code','STALE_INVENTORY');END IF;
  IF p_payload ? 'replaceGrantId' THEN
   SELECT * INTO old FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_member.session_id AND grant_id=(p_payload->>'replaceGrantId')::uuid
   AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch AND consumed_at IS NULL;
   IF old.grant_id IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','GRANT_NOT_OWNED');END IF;
   slot:=old.slot_index;PERFORM ink_product_engine.ink_s2_spend_grant_v1(old,p_at,p_receipt,NULL);
  ELSE slot:=(ink_product_engine.ink_s5_joker_free_slots_v1(p_member))[1];END IF;
  IF slot IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','INVENTORY_FULL');END IF;
  g:=gen_random_uuid();INSERT INTO ink_product_engine.ink_grants_v1(session_id,grant_id,owner_participant_id,owner_epoch,item_id,base_tier,slot_index,granted_at)
  VALUES(p_member.session_id,g,p_member.participant_id,p_member.owner_epoch,c.item_id,c.base_tier,slot,p_at);
  UPDATE ink_product_engine.ink_members_v1 SET inventory_version=inventory_version+1 WHERE session_id=p_member.session_id AND participant_id=p_member.participant_id;
 ELSIF p_operation<>'reward_discard' THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_REWARD_OPERATION');END IF;
 UPDATE ink_product_engine.ink_s5_joker_candidates_v1 SET resolved_receipt_id=p_receipt,delivered_grant_id=g WHERE(session_id,offer_id,candidate_id)=(c.session_id,c.offer_id,c.candidate_id);
 UPDATE ink_product_engine.ink_s5_phase2_rewards_v1 SET closed_at=p_at,reason=CASE WHEN g IS NULL THEN 'discarded' ELSE 'claimed' END WHERE sequence=q.sequence;
 PERFORM ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
 RETURN jsonb_build_object('accepted',true,'code',CASE WHEN g IS NULL THEN 'REWARD_DISCARDED' ELSE 'REWARD_CLAIMED' END,'candidateId',c.candidate_id,'grantId',g);
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_reward_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_search_state_v1(ink_product_engine.ink_members_v1, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_search_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT jsonb_build_object('windowId',w.window_id,'snapshotId',w.snapshot_id,'progressVersion',w.progress_version::text,'tier',w.tier,
 'draft',w.starts_at IS NULL,'startsAt',w.starts_at,'expiresAt',w.expires_at,'documentHash',d.document_hash,
 'remainingSuccesses',(CASE WHEN w.tier='enhanced' THEN 3 ELSE 1 END)-w.used,
 'lastResult',CASE WHEN w.used>0 THEN jsonb_build_object('query',w.last_query,'availableAt',w.available_at,'count',CASE WHEN p_at>=w.available_at THEN w.last_count END)END)
 FROM ink_product_engine.ink_s5_phase2_search_v1 w JOIN ink_product_engine.ink_s5_search_documents_v1 d USING(snapshot_id)
 WHERE w.session_id=p_member.session_id AND w.participant_id=p_member.participant_id AND w.owner_epoch=p_member.owner_epoch
 AND w.progress_version=p_member.progress_version AND w.snapshot_id=(ink_product.course_document(p_member.session_id,p_member.current_page_id)).id
 AND(w.starts_at IS NOT NULL OR EXISTS(SELECT FROM ink_product_engine.ink_grants_v1 g WHERE g.session_id=w.session_id AND g.grant_id=w.grant_id AND g.owner_participant_id=w.participant_id AND g.owner_epoch=w.owner_epoch AND g.consumed_at IS NULL))
 AND(w.starts_at IS NULL OR p_at<w.expires_at) ORDER BY w.opened_at DESC,w.window_id DESC LIMIT 1
$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_search_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_search_v1(ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_search_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE w ink_product_engine.ink_s5_phase2_search_v1;g ink_product_engine.ink_grants_v1;doc ink_product_engine.ink_s5_search_documents_v1;
 snapshot ink_product.wiki_snapshots;query text;hits integer;available timestamptz;grade text;limit_uses integer;
BEGIN
 snapshot:=ink_product.course_document(p_member.session_id,p_member.current_page_id);
 IF p_member.user_id IS DISTINCT FROM ink_product.request_actor_v1() OR p_member.player_status<>'playing' THEN RETURN jsonb_build_object('accepted',false,'code','PARTICIPANT_READ_ONLY');END IF;
 IF p_payload->>'expectedSnapshotId' IS DISTINCT FROM snapshot.id::text OR p_payload->>'expectedProgressVersion' IS DISTINCT FROM p_member.progress_version::text THEN RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_SOURCE_CHANGED');END IF;
 SELECT * INTO doc FROM ink_product_engine.ink_s5_search_documents_v1 WHERE snapshot_id=snapshot.id;
 IF doc.snapshot_id IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','SEARCH_DOCUMENT_UNAVAILABLE');END IF;
 IF p_operation='search' THEN
  IF p_payload-ARRAY['grantId','expectedInventoryVersion','expectedSnapshotId','expectedProgressVersion']<>'{}' THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');END IF;
  SELECT * INTO g FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_member.session_id AND grant_id=(p_payload->>'grantId')::uuid
   AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch AND item_id='search' AND consumed_at IS NULL;
  IF g.grant_id IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','GRANT_NOT_OWNED');END IF;
  IF p_payload->>'expectedInventoryVersion' IS DISTINCT FROM p_member.inventory_version::text THEN RETURN jsonb_build_object('accepted',false,'code','STALE_INVENTORY');END IF;
  SELECT * INTO w FROM ink_product_engine.ink_s5_phase2_search_v1 x WHERE session_id=p_member.session_id AND participant_id=p_member.participant_id
   AND owner_epoch=p_member.owner_epoch AND snapshot_id=snapshot.id AND progress_version=p_member.progress_version AND(starts_at IS NULL OR p_at<expires_at)
   AND(x.starts_at IS NOT NULL OR x.grant_id=g.grant_id)ORDER BY opened_at DESC LIMIT 1;
  IF w.window_id IS NULL THEN
   grade:=ink_product_engine.ink_s5_grant_tier_v2(g.session_id,g.grant_id,g.base_tier);
   INSERT INTO ink_product_engine.ink_s5_phase2_search_v1(session_id,window_id,participant_id,owner_epoch,grant_id,snapshot_id,progress_version,tier,opened_at)
   VALUES(p_member.session_id,p_receipt,p_member.participant_id,p_member.owner_epoch,g.grant_id,snapshot.id,p_member.progress_version,grade,p_at);
  END IF;
  RETURN jsonb_build_object('accepted',true,'code','SEARCH_OPENED','search',ink_product_engine.ink_s5_phase2_search_state_v1(p_member,p_at));
 END IF;
 IF p_payload-ARRAY['windowId','query','expectedDocumentHash','expectedSnapshotId','expectedProgressVersion']<>'{}' OR jsonb_typeof(p_payload->'query')IS DISTINCT FROM'string' THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');END IF;
 query:=btrim(p_payload->>'query',U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff');
 IF query='' OR char_length(query)>4096 THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_SEARCH_QUERY');END IF;
 SELECT * INTO w FROM ink_product_engine.ink_s5_phase2_search_v1 WHERE session_id=p_member.session_id AND window_id=(p_payload->>'windowId')::uuid
 AND participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch FOR UPDATE;
 IF w.window_id IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_WINDOW_NOT_OWNED');END IF;
 IF w.snapshot_id<>snapshot.id OR w.progress_version<>p_member.progress_version OR p_payload->>'expectedDocumentHash' IS DISTINCT FROM doc.document_hash THEN RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_SOURCE_CHANGED');END IF;
 IF w.starts_at IS NOT NULL AND p_at>=w.expires_at THEN RETURN jsonb_build_object('accepted',false,'code','DOCUMENT_WINDOW_EXPIRED');END IF;
 IF w.starts_at IS NULL THEN
  SELECT * INTO g FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_member.session_id AND grant_id=w.grant_id AND owner_participant_id=p_member.participant_id AND owner_epoch=p_member.owner_epoch AND consumed_at IS NULL;
  IF g.grant_id IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','SEARCH_GRANT_UNAVAILABLE');END IF;
  w.tier:=ink_product_engine.ink_s5_grant_tier_v2(g.session_id,g.grant_id,g.base_tier);w.starts_at:=p_at;w.expires_at:=p_at+interval '15 seconds';
  PERFORM ink_product_engine.ink_s2_spend_grant_v1(g,p_at,p_receipt,NULL);
 END IF;
 limit_uses:=CASE WHEN w.tier='enhanced' THEN 3 ELSE 1 END;
 IF w.used>=limit_uses THEN RETURN jsonb_build_object('accepted',false,'code','SEARCH_USED');END IF;
 SELECT coalesce(sum(regexp_count(node,'***='||query,1,'i')),0)::integer INTO hits FROM unnest(doc.text_nodes)t(node);
 available:=p_at+CASE WHEN w.tier='weakened' THEN interval '2 seconds' ELSE interval '0' END;
 UPDATE ink_product_engine.ink_s5_phase2_search_v1 SET starts_at=w.starts_at,expires_at=w.expires_at,tier=w.tier,used=w.used+1,last_query=query,last_count=hits,available_at=available
 WHERE session_id=w.session_id AND window_id=w.window_id;
 PERFORM ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
 RETURN jsonb_build_object('accepted',true,'code',CASE WHEN hits=0 THEN 'SEARCH_NOT_FOUND' ELSE 'SEARCH_FOUND' END,'count',CASE WHEN p_at>=available THEN hits END,'availableAt',available,'search',ink_product_engine.ink_s5_phase2_search_state_v1(p_member,p_at));
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_search_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_tick_v1(uuid, timestamp with time zone, uuid, boolean); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE s ink_product_engine.ink_sessions_v1;cfg ink_product_engine.ink_s3_sessions_v1;m ink_product_engine.ink_members_v1;due bigint;last_round bigint;
 v_round bigint;draw bytea;item text;n integer:=0;draw_id uuid;
BEGIN
 s:=ink_product_engine.ink_s3_lock_v1(p_session,p_at);due:=ink_product_engine.ink_s5_phase2_due_v1(p_session,s.started_at,p_at);
 IF p_initial AND due<>0 THEN RAISE EXCEPTION 'INVALID_INITIAL_SUPPLY'; END IF;
 SELECT * INTO STRICT cfg FROM ink_product_engine.ink_s3_sessions_v1 WHERE session_id=p_session;
 FOR m IN SELECT * FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session AND member_role='player' AND player_status='playing' ORDER BY participant_id LOOP
  SELECT coalesce(max(closed_through_round),-1) INTO last_round FROM ink_product_engine.ink_supply_rounds_v1
   WHERE session_id=p_session AND recipient_participant_id=m.participant_id AND recipient_epoch=m.owner_epoch;
  FOR v_round IN last_round+1..due LOOP
   draw:=NULL;item:=NULL;
   IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(m))>0 THEN
    draw:=sha256(cfg.private_rng_seed||convert_to(jsonb_build_array('phase2-natural-v1',p_session,m.participant_id,m.owner_epoch,v_round)::text,'UTF8'));
    draw_id:=md5(encode(draw,'hex'))::uuid;
    item:=ink_product_engine.ink_s5_phase1_reward_v1(p_session,draw_id,1,false);
   END IF;
   PERFORM ink_product_engine.ink_s3_supply_latest_v1(p_session,m.participant_id,p_at,v_round,ARRAY[v_round],v_round,item,cfg.pool_digest,draw,p_receipt);n:=n+1;
  END LOOP;
 END LOOP;RETURN n;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_trap_v1(uuid, ink_product_engine.ink_members_v1, text, jsonb, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase2_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_target ink_product_engine.ink_members_v1%ROWTYPE; v_options jsonb; v_destination text; v_trap uuid;
BEGIN
  IF NOT ink_product_engine.ink_s4_fixture_id_v1(p_session)
    OR jsonb_typeof(p_payload->'targetParticipantId') IS DISTINCT FROM 'string'
    OR (p_operation='trap_install' AND (jsonb_typeof(p_payload->'selectionToken') IS DISTINCT FROM 'string'
      OR p_payload-ARRAY['grantId','expectedInventoryVersion','targetParticipantId','selectionToken']<>'{}'::jsonb))
    OR (p_operation='trap_options' AND p_payload-ARRAY['grantId','expectedInventoryVersion','targetParticipantId']<>'{}'::jsonb)
  THEN RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT'); END IF;
  IF p_tier NOT IN ('normal','weakened') AND NOT (
    p_tier='enhanced' AND ink_product_engine.ink_s5_enabled_v1(p_session)) THEN
    RETURN jsonb_build_object('accepted',false,'code','UNSUPPORTED_TRAP_VARIANT');
  END IF;
  SELECT * INTO v_target FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session
    AND participant_id=(p_payload->>'targetParticipantId')::uuid AND member_role='player'
    AND player_status='playing' AND participant_id<>p_member.participant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'code','TARGET_NOT_AVAILABLE'); END IF;
  v_options := ink_product_engine.ink_s4_trap_choices_v1(p_session,p_member,v_target.participant_id,
    (p_payload->>'grantId')::uuid,p_at);
  IF p_operation='trap_options' THEN
    RETURN jsonb_build_object('accepted',true,'code','TRAP_OPTIONS','options',v_options);
  END IF;
  SELECT option->>'pageId' INTO v_destination FROM jsonb_array_elements(v_options || ink_product_engine.ink_s4_trap_choices_v1(p_session,p_member,
      v_target.participant_id,(p_payload->>'grantId')::uuid,p_at-interval '10 seconds')) option
    WHERE option->>'selectionToken'=p_payload->>'selectionToken';
  IF v_destination IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','TRAP_SELECTION_STALE'); END IF;
  IF EXISTS (SELECT 1 FROM ink_product_engine.ink_s4_traps_v1 WHERE session_id=p_session AND participant_id=v_target.participant_id
    AND owner_epoch=v_target.owner_epoch AND page_id=v_target.current_page_id AND revision_id=v_target.current_revision_id AND destination=v_destination AND closed_at IS NULL) THEN
    RETURN jsonb_build_object('accepted',false,'code','TRAP_ALREADY_ARMED');
  END IF;
  IF ink_product_engine.ink_s4_censored_v1(p_session,v_target,v_destination,p_at) THEN
    RETURN jsonb_build_object('accepted',false,'code','CENSORED_LINK');
  END IF;
  IF ink_product_engine.ink_s5_trap_sealed_v1(p_session,v_target,v_destination,p_at) THEN
    RETURN jsonb_build_object('accepted',false,'code','TRAP_SEALED_LINK');
  END IF;
  -- TEST_ONLY: a visit-bound seal must leave a route out of the current page.
  IF p_tier='enhanced' AND NOT EXISTS (
    SELECT FROM ink_product.course_exits(p_session,v_target.current_page_id,v_target.current_revision_id) exit(page_id)
    WHERE exit.page_id<>v_destination
      AND NOT ink_product_engine.ink_s5_trap_sealed_v1(p_session,v_target,exit.page_id,p_at)
      AND NOT ink_product_engine.ink_s4_censored_v1(p_session,v_target,exit.page_id,p_at)
      AND NOT EXISTS(SELECT FROM ink_product_engine.ink_s4_traps_v1 x WHERE x.session_id=p_session AND x.participant_id=v_target.participant_id AND x.owner_epoch=v_target.owner_epoch AND x.page_id=v_target.current_page_id AND x.revision_id=v_target.current_revision_id AND x.destination=exit.page_id AND x.tier='enhanced' AND x.closed_at IS NULL)
  ) THEN RETURN jsonb_build_object('accepted',false,'code','TRAP_LAST_EXIT'); END IF;
  v_trap := gen_random_uuid();
  INSERT INTO ink_product_engine.ink_s4_traps_v1(session_id,trap_id,source_grant_id,participant_id,owner_epoch,
    progress_version,page_id,revision_id,destination,tier,installed_at,expires_at,installed_receipt_id,phase2_contract)
  VALUES(p_session,v_trap,(p_payload->>'grantId')::uuid,v_target.participant_id,v_target.owner_epoch,
    v_target.progress_version,v_target.current_page_id,v_target.current_revision_id,v_destination,p_tier,
    p_at,timestamptz '9999-12-31 23:59:59+00',p_receipt,true);
  PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,v_target.participant_id);
  RETURN jsonb_build_object('accepted',true,'code','TRAP_INSTALLED','trapId',v_trap);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('accepted',false,'code','INVALID_INPUT');
END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase2_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase3_enabled_v1(uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase3_enabled_v1(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM ink_product.rooms r JOIN ink_product.s5_phase3_policies_v1 p USING(binding)WHERE r.session_id=p_session)$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase3_enabled_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase3_shield_bonus_v1(uuid, uuid, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase3_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE m ink_product_engine.ink_members_v1;r ink_product_engine.ink_rights_v1;offer uuid;candidate uuid:=gen_random_uuid();item text;
BEGIN
 SELECT * INTO r FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session AND right_id=p_right AND kind='protection'AND expires_at='infinity'AND close_reason='consumed';
 IF NOT FOUND OR NOT EXISTS(SELECT FROM ink_product_engine.ink_consumptions_v1 c WHERE c.session_id=p_session AND c.right_id=p_right AND c.root_id=p_root AND c.receipt_id=p_receipt AND c.kind='protection_charge')
 OR EXISTS(SELECT FROM ink_product_engine.ink_attack_roots_v1 a WHERE a.session_id=p_session AND a.root_id=p_root AND a.source_participant_id=r.owner_participant_id)THEN RETURN;END IF;
 SELECT * INTO m FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session AND participant_id=r.owner_participant_id AND owner_epoch=r.owner_epoch AND player_status='playing';IF NOT FOUND THEN RETURN;END IF;
 offer:=md5(jsonb_build_array('phase3-shield',p_session,p_right,p_root)::text)::uuid;
 INSERT INTO ink_product_engine.ink_s5_phase3_shield_rewards_v1 VALUES(p_session,p_right,p_root,offer,p_receipt)ON CONFLICT DO NOTHING;IF NOT FOUND THEN RETURN;END IF;
 item:=ink_product_engine.ink_s5_phase1_reward_v1(p_session,offer,1,false);
 PERFORM ink_product_engine.ink_s3_record_v1(p_session,offer,'worker','a3500000-0000-4000-9000-000000000007',offer,'phase3_shield_reward',jsonb_build_object('rootId',p_root,'rightId',p_right),p_at,
  jsonb_build_object('ok',true,'code','SHIELD_REWARD_CREATED','receiptId',offer,'itemId',item));
 INSERT INTO ink_product_engine.ink_s5_joker_candidates_v1(session_id,offer_id,candidate_id,ordinal,participant_id,owner_epoch,item_id,base_tier,offered_at)
 VALUES(p_session,offer,candidate,1,m.participant_id,m.owner_epoch,item,'normal',p_at);
 IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(m))>0 THEN
  PERFORM ink_product_engine.ink_s5_deliver_candidates_v1(m,offer,ARRAY[candidate],p_at,p_receipt);
 ELSE PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,m.participant_id);END IF;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase3_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase4_enabled_v1(uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase4_enabled_v1(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM ink_product.rooms r JOIN ink_product.s5_phase4_policies_v1 p USING(binding)WHERE r.session_id=p_session)
$$;


ALTER FUNCTION ink_product_engine.ink_s5_phase4_enabled_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase4_trap_shield_bonus_v1(uuid, uuid, uuid, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_phase4_trap_shield_bonus_v1(p_session uuid, p_right uuid, p_trap uuid, p_at timestamp with time zone, p_receipt uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE m ink_product_engine.ink_members_v1;r ink_product_engine.ink_rights_v1;offer uuid;candidate uuid:=gen_random_uuid();item text;
BEGIN
 IF NOT ink_product_engine.ink_s5_phase4_enabled_v1(p_session)THEN RETURN;END IF;
 SELECT * INTO r FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session AND right_id=p_right AND kind='protection'AND expires_at='infinity'AND close_reason='consumed';
 IF NOT FOUND OR NOT EXISTS(SELECT FROM ink_product_engine.ink_consumptions_v1 c WHERE c.session_id=p_session AND c.right_id=p_right AND c.root_id IS NULL AND c.receipt_id=p_receipt AND c.kind='protection_charge')
 OR NOT EXISTS(SELECT FROM ink_product_engine.ink_s4_traps_v1 t WHERE t.session_id=p_session AND t.trap_id=p_trap AND t.participant_id=r.owner_participant_id AND t.owner_epoch=r.owner_epoch AND t.close_reason='blocked'AND t.closed_receipt_id=p_receipt)THEN RETURN;END IF;
 SELECT * INTO m FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session AND participant_id=r.owner_participant_id AND owner_epoch=r.owner_epoch AND player_status='playing';IF NOT FOUND THEN RETURN;END IF;
 offer:=md5(jsonb_build_array('phase4-trap-shield',p_session,p_right,p_trap)::text)::uuid;
 INSERT INTO ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 VALUES(p_session,p_right,p_trap,offer,p_receipt)ON CONFLICT DO NOTHING;IF NOT FOUND THEN RETURN;END IF;
 item:=ink_product_engine.ink_s5_phase1_reward_v1(p_session,offer,1,false);
 PERFORM ink_product_engine.ink_s3_record_v1(p_session,offer,'worker','a3500000-0000-4000-9000-000000000007',offer,'phase4_trap_shield_reward',jsonb_build_object('trapId',p_trap,'rightId',p_right),p_at,
 jsonb_build_object('ok',true,'code','SHIELD_REWARD_CREATED','receiptId',offer,'itemId',item));
 INSERT INTO ink_product_engine.ink_s5_joker_candidates_v1(session_id,offer_id,candidate_id,ordinal,participant_id,owner_epoch,item_id,base_tier,offered_at)
 VALUES(p_session,offer,candidate,1,m.participant_id,m.owner_epoch,item,'normal',p_at);
 IF cardinality(ink_product_engine.ink_s5_joker_free_slots_v1(m))>0 THEN
  PERFORM ink_product_engine.ink_s5_deliver_candidates_v1(m,offer,ARRAY[candidate],p_at,p_receipt);
 ELSE PERFORM ink_product_engine.ink_s2_next_event_v1(p_session,m.participant_id);END IF;
END $$;


ALTER FUNCTION ink_product_engine.ink_s5_phase4_trap_shield_bonus_v1(p_session uuid, p_right uuid, p_trap uuid, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_resolve_attack_v1(uuid, uuid, timestamp with time zone, boolean, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_resolve_attack_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) RETURNS text
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN EXISTS (SELECT FROM ink_product.rooms r WHERE r.session_id=p_session
      AND r.binding->>'schemaVersion' IN ('candidate-v2','candidate-v3')
      AND r.binding->>'rulesVersion'='ink-s5-test-v1'
      AND r.binding->>'catalogVersion'='ink-s5-test-v1'
      AND r.binding->>'modePolicyVersion'='wikipedia-s5-test-v1')
    THEN ink_product_engine.ink_s5_resolve_attack_v1_grant(p_session,p_child,p_at,p_reflect,p_receipt) ELSE ink_product_engine.ink_s5_resolve_attack_v1_legacy(p_session,p_child,p_at,p_reflect,p_receipt) END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_resolve_attack_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_resolve_attack_v1_grant(uuid, uuid, timestamp with time zone, boolean, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_resolve_attack_v1_grant(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  child ink_product_engine.ink_attack_children_v1;
  root ink_product_engine.ink_attack_roots_v1;
  recipient ink_product_engine.ink_members_v1;
  frames ink_product_engine.ink_s5_lost_link_frames_v1;
  item text;
  v_outcome text;
  protection uuid;
  candidates text[];
  destination text;
  step smallint := 0;
  target_seq bigint;
  source_seq bigint;
BEGIN
  SELECT * INTO STRICT child FROM ink_product_engine.ink_attack_children_v1
    WHERE session_id=p_session AND child_id=p_child AND state='pending';
  SELECT * INTO STRICT root FROM ink_product_engine.ink_attack_roots_v1
    WHERE session_id=p_session AND root_id=child.root_id;
  SELECT item_id INTO STRICT item FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_session
    AND grant_id=root.grant_id AND consumed_receipt_id=root.acceptance_receipt_id AND consumed_at=root.accepted_at;
  IF item NOT IN ('lost_link','weakening','thunder') OR p_at IS NULL OR p_reflect IS NULL OR p_receipt IS NULL
     OR (p_reflect AND (p_at<root.accepted_at OR p_at>=root.due_at OR child.parry_attempt_receipt_id IS DISTINCT FROM p_receipt))
     OR (NOT p_reflect AND p_at<>root.due_at) THEN
    RAISE EXCEPTION 'Invalid S5 attack resolution';
  END IF;
  IF NOT EXISTS(SELECT FROM ink_product_engine.ink_sessions_v1 WHERE session_id=p_session AND lifecycle_state='playing')
     OR NOT EXISTS(SELECT FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session AND player_status='playing'
       AND participant_id=child.target_participant_id AND owner_epoch=child.target_epoch) THEN
    v_outcome := 'void_terminal';
  ELSE
    SELECT * INTO recipient FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session AND player_status='playing'
      AND participant_id=CASE WHEN p_reflect THEN root.source_participant_id ELSE child.target_participant_id END
      AND owner_epoch=CASE WHEN p_reflect THEN root.source_epoch ELSE child.target_epoch END;
    IF NOT FOUND THEN v_outcome := 'void_source_terminal'; END IF;
  END IF;

  IF v_outcome IS NULL AND item='lost_link' THEN
    SELECT * INTO STRICT frames FROM ink_product_engine.ink_s5_lost_link_frames_v1
      WHERE session_id=p_session AND root_id=root.root_id;
    IF recipient.progress_version IS DISTINCT FROM
       (CASE WHEN p_reflect THEN frames.source_progress_version ELSE frames.target_progress_version END) THEN
      v_outcome := 'void_ineligible';
    ELSE
      candidates := ink_product_engine.ink_s5_lost_link_plan_v2(recipient,p_at,root.acceptance_receipt_id,
        root.effective_tier='enhanced',false);
      IF cardinality(candidates)=0 THEN v_outcome := 'void_ineligible'; END IF;
    END IF;
  END IF;

  IF v_outcome IS NULL THEN
    SELECT right_id INTO protection FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
      AND owner_participant_id=recipient.participant_id AND owner_epoch=recipient.owner_epoch AND kind='protection'
      AND closed_at IS NULL AND remaining_charges=1 AND installed_at<=p_at AND p_at<expires_at;
    IF protection IS NOT NULL THEN
      PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,protection,p_at,p_receipt,root.root_id);
      v_outcome := CASE WHEN p_reflect THEN 'reflection_blocked' ELSE 'blocked' END;
    ELSE
      CASE item
        WHEN 'lost_link' THEN
          FOREACH destination IN ARRAY candidates LOOP
            step:=step+1;
            PERFORM ink_product_engine.ink_s5_force_step_v2(recipient,destination,'lost_link',
              CASE WHEN root.effective_tier='weakened' THEN 0 ELSE 1 END,p_at,root.acceptance_receipt_id,step);
            IF step<cardinality(candidates) THEN
              SELECT * INTO STRICT recipient FROM ink_product_engine.ink_members_v1 m
              WHERE (m.session_id,m.participant_id,m.owner_epoch)=(p_session,recipient.participant_id,recipient.owner_epoch);
            END IF;
          END LOOP;
        WHEN 'weakening' THEN
          PERFORM ink_product_engine.ink_s5_weakening_v2(recipient,root.effective_tier,p_at,root.acceptance_receipt_id);
        WHEN 'thunder' THEN
          PERFORM ink_product_engine.ink_s5_apply_thunder_v1(recipient,
            CASE WHEN p_reflect THEN coalesce(child.reflection_tier,root.effective_tier) ELSE root.effective_tier END,false,p_at,p_receipt,p_child);
      END CASE;
      v_outcome := CASE WHEN p_reflect THEN 'reflected' ELSE 'hit' END;
    END IF;
  END IF;
  target_seq := ink_product_engine.ink_s2_next_event_v1(p_session,child.target_participant_id);
  source_seq := ink_product_engine.ink_s2_next_event_v1(p_session,root.source_participant_id);
  UPDATE ink_product_engine.ink_attack_children_v1 SET state='resolved',outcome=v_outcome,
    resolved_logical_at=p_at,resolution_receipt_id=p_receipt,target_result_event_seq=target_seq,source_result_event_seq=source_seq
    WHERE session_id=p_session AND child_id=p_child AND state='pending';
  RETURN v_outcome;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_resolve_attack_v1_grant(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_resolve_attack_v1_legacy(uuid, uuid, timestamp with time zone, boolean, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_resolve_attack_v1_legacy(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  child ink_product_engine.ink_attack_children_v1;
  root ink_product_engine.ink_attack_roots_v1;
  recipient ink_product_engine.ink_members_v1;
  frames ink_product_engine.ink_s5_lost_link_frames_v1;
  item text;
  v_outcome text;
  protection uuid;
  candidates text[];
  destination text;
  target_seq bigint;
  source_seq bigint;
BEGIN
  SELECT * INTO STRICT child FROM ink_product_engine.ink_attack_children_v1
    WHERE session_id=p_session AND child_id=p_child AND state='pending';
  SELECT * INTO STRICT root FROM ink_product_engine.ink_attack_roots_v1
    WHERE session_id=p_session AND root_id=child.root_id;
  SELECT item_id INTO STRICT item FROM ink_product_engine.ink_grants_v1 WHERE session_id=p_session
    AND grant_id=root.grant_id AND consumed_receipt_id=root.acceptance_receipt_id AND consumed_at=root.accepted_at;
  IF item NOT IN ('lost_link','weakening','thunder') OR p_at IS NULL OR p_reflect IS NULL OR p_receipt IS NULL
     OR (p_reflect AND (p_at<root.accepted_at OR p_at>=root.due_at OR child.parry_attempt_receipt_id IS DISTINCT FROM p_receipt))
     OR (NOT p_reflect AND p_at<>root.due_at) THEN
    RAISE EXCEPTION 'Invalid S5 attack resolution';
  END IF;
  IF NOT EXISTS(SELECT FROM ink_product_engine.ink_sessions_v1 WHERE session_id=p_session AND lifecycle_state='playing')
     OR NOT EXISTS(SELECT FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session AND player_status='playing'
       AND participant_id=child.target_participant_id AND owner_epoch=child.target_epoch) THEN
    v_outcome := 'void_terminal';
  ELSE
    SELECT * INTO recipient FROM ink_product_engine.ink_members_v1 WHERE session_id=p_session AND player_status='playing'
      AND participant_id=CASE WHEN p_reflect THEN root.source_participant_id ELSE child.target_participant_id END
      AND owner_epoch=CASE WHEN p_reflect THEN root.source_epoch ELSE child.target_epoch END;
    IF NOT FOUND THEN v_outcome := 'void_source_terminal'; END IF;
  END IF;

  IF v_outcome IS NULL AND item='lost_link' THEN
    SELECT * INTO STRICT frames FROM ink_product_engine.ink_s5_lost_link_frames_v1
      WHERE session_id=p_session AND root_id=root.root_id;
    IF recipient.progress_version IS DISTINCT FROM
       (CASE WHEN p_reflect THEN frames.source_progress_version ELSE frames.target_progress_version END) THEN
      v_outcome := 'void_ineligible';
    ELSE
      candidates := ink_product_engine.ink_s5_lost_link_candidates_v1(recipient,p_at);
      IF cardinality(candidates)=0 THEN v_outcome := 'void_ineligible'; END IF;
    END IF;
  ELSIF v_outcome IS NULL AND item='weakening'
    AND ink_product_engine.ink_s5_modifier_id_v1(recipient,'weakening',p_at) IS NOT NULL THEN
    v_outcome := 'void_ineligible';
  END IF;

  IF v_outcome IS NULL THEN
    SELECT right_id INTO protection FROM ink_product_engine.ink_rights_v1 WHERE session_id=p_session
      AND owner_participant_id=recipient.participant_id AND owner_epoch=recipient.owner_epoch AND kind='protection'
      AND closed_at IS NULL AND remaining_charges=1 AND installed_at<=p_at AND p_at<expires_at;
    IF protection IS NOT NULL THEN
      PERFORM ink_product_engine.ink_s2_spend_right_v1(p_session,protection,p_at,p_receipt,root.root_id);
      v_outcome := CASE WHEN p_reflect THEN 'reflection_blocked' ELSE 'blocked' END;
    ELSE
      CASE item
        WHEN 'lost_link' THEN
          destination := candidates[1+ink_product_engine.ink_s5_draw_v1(p_session,root.acceptance_receipt_id,
            'lost-link-destination',cardinality(candidates))];
          -- Each movement owns the original root receipt. A single worker receipt may settle several roots.
          PERFORM ink_product_engine.ink_s5_force_move_v1(recipient,destination,'lost_link',
            CASE WHEN root.effective_tier='weakened' THEN 0 ELSE 1 END,p_at,root.acceptance_receipt_id);
        WHEN 'weakening' THEN
          PERFORM ink_product_engine.ink_s5_install_modifier_v1(recipient,'weakening',p_at,root.acceptance_receipt_id);
        WHEN 'thunder' THEN
          PERFORM ink_product_engine.ink_s5_apply_thunder_v1(recipient,
            CASE WHEN p_reflect THEN coalesce(child.reflection_tier,root.effective_tier) ELSE root.effective_tier END,false,p_at,p_receipt,p_child);
      END CASE;
      v_outcome := CASE WHEN p_reflect THEN 'reflected' ELSE 'hit' END;
    END IF;
  END IF;
  target_seq := ink_product_engine.ink_s2_next_event_v1(p_session,child.target_participant_id);
  source_seq := ink_product_engine.ink_s2_next_event_v1(p_session,root.source_participant_id);
  UPDATE ink_product_engine.ink_attack_children_v1 SET state='resolved',outcome=v_outcome,
    resolved_logical_at=p_at,resolution_receipt_id=p_receipt,target_result_event_seq=target_seq,source_result_event_seq=source_seq
    WHERE session_id=p_session AND child_id=p_child AND state='pending';
  RETURN v_outcome;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_resolve_attack_v1_legacy(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_roulette_auto_v1(ink_product_engine.ink_members_v1, uuid, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_roulette_auto_v1(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_right uuid;
  v_child uuid := gen_random_uuid();
  v_outcome text := 'already_active';
BEGIN
  SELECT r.right_id INTO v_right FROM ink_product_engine.ink_rights_v1 r
    WHERE r.session_id=p_member.session_id AND r.owner_participant_id=p_member.participant_id
      AND r.owner_epoch=p_member.owner_epoch AND r.kind='protection' AND r.closed_at IS NULL
      AND r.installed_at<=p_at AND p_at<r.expires_at AND r.remaining_charges=1;
  IF v_right IS NULL THEN
    UPDATE ink_product_engine.ink_rights_v1 SET closed_at=expires_at,close_reason='expired'
      WHERE session_id=p_member.session_id AND owner_participant_id=p_member.participant_id
        AND owner_epoch=p_member.owner_epoch AND kind='protection' AND closed_at IS NULL AND expires_at<=p_at;
    v_right := gen_random_uuid();
    INSERT INTO ink_product_engine.ink_rights_v1 (session_id,right_id,owner_participant_id,owner_epoch,kind,
      source_grant_id,right_version,installed_at,expires_at,remaining_charges)
    VALUES (p_member.session_id,v_right,p_member.participant_id,p_member.owner_epoch,'protection',
      p_grant,1,p_at,p_at+interval '8 seconds',1);
    PERFORM ink_product_engine.ink_s2_next_event_v1(p_member.session_id,p_member.participant_id);
    v_outcome := 'active';
  END IF;
  INSERT INTO ink_product_engine.ink_s5_roulette_child_v1 VALUES
    (p_member.session_id,p_receipt,v_child,v_right,v_outcome);
  RETURN jsonb_build_object('childId',v_child,'itemId','shield','outcome',v_outcome);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_roulette_auto_v1(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_roulette_supply_hook_v1(); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_roulette_supply_hook_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE ink_product_engine.ink_s5_roulette_supply_v1 SET applied_grant_id=NEW.grant_id
    WHERE session_id=NEW.session_id AND participant_id=NEW.recipient_participant_id
      AND owner_epoch=NEW.recipient_epoch AND applied_grant_id IS NULL;
  IF FOUND THEN
    UPDATE ink_product_engine.ink_grants_v1 SET base_tier='weakened'
      WHERE session_id=NEW.session_id AND grant_id=NEW.grant_id AND consumed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'S5 supply grant missing'; END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_roulette_supply_hook_v1() OWNER TO ink_product_owner;

--
-- Name: ink_s5_shield_bonus_v1(uuid, uuid, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE v_member ink_product_engine.ink_members_v1; v_right ink_product_engine.ink_rights_v1; v_origin uuid;
BEGIN
 IF ink_product_engine.ink_s5_phase3_enabled_v1(p_session)THEN PERFORM ink_product_engine.ink_s5_phase3_shield_bonus_v1(p_session,p_right,p_at,p_receipt,p_root);RETURN;END IF;
  -- Read the activation's receipt instead of the settling receipt. The worker
  -- may settle several independent protection rights in one request.
  SELECT * INTO v_right FROM ink_product_engine.ink_rights_v1 r
  WHERE (r.session_id,r.right_id)=(p_session,p_right) AND r.kind='protection' AND r.expires_at='infinity'
    AND NOT EXISTS (
      SELECT FROM ink_product_engine.ink_attack_roots_v1 root WHERE (root.session_id,root.root_id)=(p_session,p_root)
        AND root.source_participant_id=r.owner_participant_id
    );
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_member FROM ink_product_engine.ink_members_v1 m
  WHERE (m.session_id,m.participant_id,m.owner_epoch)=(p_session,v_right.owner_participant_id,v_right.owner_epoch)
    AND m.player_status='playing';
  IF NOT FOUND THEN RETURN; END IF;
  SELECT g.consumed_receipt_id INTO STRICT v_origin FROM ink_product_engine.ink_grants_v1 g
  WHERE (g.session_id,g.grant_id)=(p_session,v_right.source_grant_id) AND g.consumed_at IS NOT NULL;
  PERFORM ink_product_engine.ink_s5_defense_bonus_v1(v_member,v_origin,p_at,p_receipt,'shield:bonus');
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_tier_v1(text, uuid, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_tier_v1(p_base text, p_enhancement uuid, p_weakening uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN (p_enhancement IS NULL)=(p_weakening IS NULL) THEN p_base
    WHEN p_base<>'normal' THEN NULL
    WHEN p_enhancement IS NOT NULL THEN 'enhanced'
    ELSE 'weakened' END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_tier_v1(p_base text, p_enhancement uuid, p_weakening uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_trap_sealed_v1(uuid, ink_product_engine.ink_members_v1, text, timestamp with time zone); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_trap_sealed_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT FROM ink_product_engine.ink_s4_effects_v1 e
    WHERE ink_product_engine.ink_s5_enabled_v1(p_session)
      AND e.session_id=p_session AND (p_member).session_id=p_session
      AND e.participant_id=(p_member).participant_id AND e.owner_epoch=(p_member).owner_epoch
      AND (p_member).player_status='playing' AND e.kind='trap_seal' AND e.closed_at IS NULL AND e.starts_at<=p_at
      AND (e.progress_version,e.page_id,e.revision_id)=
        ((p_member).progress_version,(p_member).current_page_id,(p_member).current_revision_id)
      AND e.payload->>'destinationPageId'=p_destination
  )
$$;


ALTER FUNCTION ink_product_engine.ink_s5_trap_sealed_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone) OWNER TO ink_product_owner;

--
-- Name: ink_s5_warning_window_v1(uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_warning_window_v1(p_session uuid) RETURNS interval
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN ink_product_engine.ink_s5_enabled_v1(p_session) THEN
    (SELECT p.warning_window_ms * interval '1 millisecond' FROM ink_product.rooms r JOIN ink_product.policies p USING(binding)
     WHERE r.session_id=p_session) ELSE interval '2 seconds' END
$$;


ALTER FUNCTION ink_product_engine.ink_s5_warning_window_v1(p_session uuid) OWNER TO ink_product_owner;

--
-- Name: ink_s5_weakening_v2(ink_product_engine.ink_members_v1, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE FUNCTION ink_product_engine.ink_s5_weakening_v2(p_member ink_product_engine.ink_members_v1, p_tier text, p_at timestamp with time zone, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  amount integer := CASE WHEN p_tier='enhanced' THEN 2 ELSE 1 END;
  grants uuid[] := ink_product_engine.ink_s5_modifier_eligible_v2(p_member,'weakening',NULL);
BEGIN
  IF cardinality(grants)>amount THEN
    grants:=ARRAY[grants[1+ink_product_engine.ink_s5_draw_v1(p_member.session_id,p_receipt,'weakening/target-grant',cardinality(grants))]];
  END IF;
  RETURN ink_product_engine.ink_s5_assign_modifier_v2(p_member,'weakening',amount,grants,p_at,p_receipt);
END;
$$;


ALTER FUNCTION ink_product_engine.ink_s5_weakening_v2(p_member ink_product_engine.ink_members_v1, p_tier text, p_at timestamp with time zone, p_receipt uuid) OWNER TO ink_product_owner;

--
-- Name: achievement_outbox_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.achievement_outbox_v1 (
    participant_id uuid NOT NULL,
    source_mode text DEFAULT 'group_items'::text NOT NULL,
    eligibility_status text DEFAULT 'awaiting_policy'::text NOT NULL,
    proposed_common_evaluators jsonb DEFAULT '["first_normal_finish", "unique_documents"]'::jsonb NOT NULL,
    CONSTRAINT achievement_outbox_v1_eligibility_status_check CHECK ((eligibility_status = 'awaiting_policy'::text)),
    CONSTRAINT achievement_outbox_v1_source_mode_check CHECK ((source_mode = 'group_items'::text))
);

ALTER TABLE ONLY ink_product.achievement_outbox_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.achievement_outbox_v1 OWNER TO ink_product_owner;

--
-- Name: entry_policy_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.entry_policy_v1 (
    channel text NOT NULL,
    binding jsonb NOT NULL,
    admission_enabled boolean DEFAULT false NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    lifecycle_contract text NOT NULL,
    CONSTRAINT entry_policy_v1_channel_check CHECK ((channel = ANY (ARRAY['review'::text, 'production'::text]))),
    CONSTRAINT entry_policy_v1_lifecycle_contract_check CHECK ((lifecycle_contract = 'group-3-8-20m-third-120s-v1'::text)),
    CONSTRAINT entry_policy_v1_revision_check CHECK ((revision > 0))
);

ALTER TABLE ONLY ink_product.entry_policy_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.entry_policy_v1 OWNER TO ink_product_owner;

--
-- Name: finished_move_archive_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.finished_move_archive_v1 (
    room_id uuid NOT NULL,
    session_id uuid NOT NULL,
    moves jsonb NOT NULL,
    CONSTRAINT finished_move_archive_v1_moves_check CHECK ((jsonb_typeof(moves) = 'array'::text))
);

ALTER TABLE ONLY ink_product.finished_move_archive_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.finished_move_archive_v1 OWNER TO ink_product_owner;

--
-- Name: group_lifecycle_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.group_lifecycle_v1 (
    room_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    deadline_at timestamp with time zone NOT NULL,
    third_finished_at timestamp with time zone,
    grace_ends_at timestamp with time zone,
    closed_at timestamp with time zone,
    end_reason text,
    CONSTRAINT group_lifecycle_v1_check CHECK ((deadline_at = (started_at + '00:20:00'::interval))),
    CONSTRAINT group_lifecycle_v1_check1 CHECK (((third_finished_at IS NULL) = (grace_ends_at IS NULL))),
    CONSTRAINT group_lifecycle_v1_check2 CHECK ((grace_ends_at = LEAST((third_finished_at + '00:02:00'::interval), deadline_at))),
    CONSTRAINT group_lifecycle_v1_check3 CHECK (((closed_at IS NULL) = (end_reason IS NULL))),
    CONSTRAINT group_lifecycle_v1_end_reason_check CHECK ((end_reason = ANY (ARRAY['all_resolved'::text, 'grace_timeout'::text, 'time_limit'::text])))
);

ALTER TABLE ONLY ink_product.group_lifecycle_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.group_lifecycle_v1 OWNER TO ink_product_owner;

--
-- Name: match_receipts; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.match_receipts (
    room_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    request_id uuid NOT NULL,
    command jsonb NOT NULL,
    response jsonb NOT NULL
);

ALTER TABLE ONLY ink_product.match_receipts FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.match_receipts OWNER TO ink_product_owner;

--
-- Name: policies; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.policies (
    binding jsonb NOT NULL,
    minimum_players smallint NOT NULL,
    maximum_players smallint NOT NULL,
    warning_window_ms integer NOT NULL,
    start_snapshot_id uuid NOT NULL,
    goal_snapshot_id uuid NOT NULL,
    CONSTRAINT policies_binding_check CHECK (((jsonb_typeof(binding) = 'object'::text) AND (NOT ((binding ->> 'namespace'::text) IS DISTINCT FROM 'ink-s4-product'::text)) AND (binding ?& ARRAY['schemaVersion'::text, 'rulesVersion'::text, 'catalogVersion'::text, 'modePolicyVersion'::text, 'policyDigest'::text]) AND ((binding - ARRAY['namespace'::text, 'schemaVersion'::text, 'rulesVersion'::text, 'catalogVersion'::text, 'modePolicyVersion'::text, 'policyDigest'::text]) = '{}'::jsonb) AND (((binding ->> 'policyDigest'::text) ~ '^[a-f0-9]{64}$'::text) IS TRUE) AND (((binding ->> 'schemaVersion'::text) ~ '^[a-z0-9.-]{1,80}$'::text) IS TRUE) AND (((binding ->> 'rulesVersion'::text) ~ '^[a-z0-9.-]{1,80}$'::text) IS TRUE) AND (((binding ->> 'catalogVersion'::text) ~ '^[a-z0-9.-]{1,80}$'::text) IS TRUE) AND (((binding ->> 'modePolicyVersion'::text) ~ '^[a-z0-9.-]{1,80}$'::text) IS TRUE))),
    CONSTRAINT policies_check1 CHECK ((start_snapshot_id <> goal_snapshot_id)),
    CONSTRAINT policies_maximum_players_check CHECK (((maximum_players >= minimum_players) AND (maximum_players <= 8))),
    CONSTRAINT policies_minimum_players_check CHECK (((minimum_players >= 3) AND (minimum_players <= 8))),
    CONSTRAINT policies_warning_window_ms_check CHECK ((warning_window_ms > 0))
);

ALTER TABLE ONLY ink_product.policies FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.policies OWNER TO ink_product_owner;

--
-- Name: receipt_retention_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.receipt_retention_v1 (
    room_id uuid NOT NULL,
    session_id uuid NOT NULL,
    ended_at timestamp with time zone NOT NULL,
    purged_at timestamp with time zone NOT NULL,
    engine_receipts bigint NOT NULL,
    product_receipts bigint NOT NULL,
    CONSTRAINT receipt_retention_v1_check CHECK ((purged_at >= (ended_at + '30 days'::interval)))
);

ALTER TABLE ONLY ink_product.receipt_retention_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.receipt_retention_v1 OWNER TO ink_product_owner;

--
-- Name: result_projection_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.result_projection_v1 (
    room_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    mode text DEFAULT 'group_items'::text NOT NULL,
    binding jsonb NOT NULL,
    result_status text NOT NULL,
    rank integer,
    xp integer NOT NULL,
    move_count integer NOT NULL,
    elapsed_seconds numeric,
    ended_at timestamp with time zone NOT NULL,
    CONSTRAINT result_projection_v1_check CHECK (((result_status = 'finished'::text) = (rank IS NOT NULL))),
    CONSTRAINT result_projection_v1_check1 CHECK (((result_status = 'finished'::text) OR (xp = 0))),
    CONSTRAINT result_projection_v1_mode_check CHECK ((mode = 'group_items'::text)),
    CONSTRAINT result_projection_v1_move_count_check CHECK ((move_count >= 0)),
    CONSTRAINT result_projection_v1_result_status_check CHECK ((result_status = ANY (ARRAY['finished'::text, 'retired'::text]))),
    CONSTRAINT result_projection_v1_xp_check CHECK ((xp >= 0))
);

ALTER TABLE ONLY ink_product.result_projection_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.result_projection_v1 OWNER TO ink_product_owner;

--
-- Name: results; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.results (
    room_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    rank integer NOT NULL,
    xp integer,
    CONSTRAINT results_rank_check CHECK ((rank > 0)),
    CONSTRAINT results_xp_check CHECK ((xp >= 0))
);

ALTER TABLE ONLY ink_product.results FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.results OWNER TO ink_product_owner;

--
-- Name: room_receipts; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.room_receipts (
    actor_id uuid NOT NULL,
    request_id uuid NOT NULL,
    command jsonb NOT NULL,
    response jsonb NOT NULL
);

ALTER TABLE ONLY ink_product.room_receipts FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.room_receipts OWNER TO ink_product_owner;

--
-- Name: s5_phase1_policies_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.s5_phase1_policies_v1 (
    binding jsonb NOT NULL,
    contract text NOT NULL,
    CONSTRAINT s5_phase1_policies_v1_contract_check CHECK ((contract = 's5-phase1-20261113-v1'::text))
);

ALTER TABLE ONLY ink_product.s5_phase1_policies_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.s5_phase1_policies_v1 OWNER TO ink_product_owner;

--
-- Name: s5_phase2_policies_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.s5_phase2_policies_v1 (
    binding jsonb NOT NULL
);

ALTER TABLE ONLY ink_product.s5_phase2_policies_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.s5_phase2_policies_v1 OWNER TO ink_product_owner;

--
-- Name: s5_phase3_policies_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.s5_phase3_policies_v1 (
    binding jsonb NOT NULL
);

ALTER TABLE ONLY ink_product.s5_phase3_policies_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.s5_phase3_policies_v1 OWNER TO ink_product_owner;

--
-- Name: s5_phase4_policies_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.s5_phase4_policies_v1 (
    binding jsonb NOT NULL
);

ALTER TABLE ONLY ink_product.s5_phase4_policies_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.s5_phase4_policies_v1 OWNER TO ink_product_owner;

--
-- Name: s5_phase5_policies_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.s5_phase5_policies_v1 (
    binding jsonb NOT NULL
);

ALTER TABLE ONLY ink_product.s5_phase5_policies_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.s5_phase5_policies_v1 OWNER TO ink_product_owner;

--
-- Name: wiki_course_pages; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.wiki_course_pages (
    binding jsonb NOT NULL,
    page_id text NOT NULL,
    snapshot_id uuid NOT NULL
);

ALTER TABLE ONLY ink_product.wiki_course_pages FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.wiki_course_pages OWNER TO ink_product_owner;

--
-- Name: wiki_documents; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.wiki_documents (
    snapshot_id uuid NOT NULL,
    document_html text NOT NULL,
    document_digest text NOT NULL,
    CONSTRAINT wiki_documents_check CHECK ((document_digest = encode(sha256(convert_to(document_html, 'UTF8'::name)), 'hex'::text)))
);

ALTER TABLE ONLY ink_product.wiki_documents FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.wiki_documents OWNER TO ink_product_owner;

--
-- Name: worker_health_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.worker_health_v1 (
    worker_id uuid NOT NULL,
    last_started_at timestamp with time zone NOT NULL,
    last_completed_at timestamp with time zone NOT NULL,
    runs bigint DEFAULT 0 NOT NULL,
    rooms_processed bigint DEFAULT 0 NOT NULL,
    error_count bigint DEFAULT 0 NOT NULL,
    last_sqlstate text,
    last_due_lag_ms bigint DEFAULT 0 NOT NULL,
    last_run_errors integer DEFAULT 0 NOT NULL,
    CONSTRAINT worker_health_v1_last_due_lag_ms_check CHECK ((last_due_lag_ms >= 0)),
    CONSTRAINT worker_health_v1_last_run_errors_check CHECK ((last_run_errors >= 0))
);

ALTER TABLE ONLY ink_product.worker_health_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.worker_health_v1 OWNER TO ink_product_owner;

--
-- Name: worker_schedule_v1; Type: TABLE; Schema: ink_product; Owner: ink_product_owner
--

CREATE TABLE ink_product.worker_schedule_v1 (
    room_id uuid NOT NULL,
    last_polled_at timestamp with time zone NOT NULL,
    expired_through timestamp with time zone
);

ALTER TABLE ONLY ink_product.worker_schedule_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product.worker_schedule_v1 OWNER TO ink_product_owner;

--
-- Name: ink_attack_roots_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_attack_roots_v1 (
    session_id uuid NOT NULL,
    root_id uuid NOT NULL,
    source_participant_id uuid NOT NULL,
    source_epoch bigint NOT NULL,
    grant_id uuid NOT NULL,
    acceptance_seq bigint NOT NULL,
    accepted_at timestamp with time zone NOT NULL,
    due_at timestamp with time zone NOT NULL,
    base_tier text NOT NULL,
    effective_tier text NOT NULL,
    acceptance_receipt_id uuid NOT NULL,
    CONSTRAINT ink_attack_roots_v1_acceptance_seq_check CHECK ((acceptance_seq > 0)),
    CONSTRAINT ink_attack_roots_v1_accepted_at_check CHECK (isfinite(accepted_at)),
    CONSTRAINT ink_attack_roots_v1_check CHECK ((isfinite(due_at) AND (due_at > accepted_at))),
    CONSTRAINT ink_attack_roots_v1_effective_tier_check CHECK ((effective_tier = ANY (ARRAY['normal'::text, 'enhanced'::text, 'weakened'::text]))),
    CONSTRAINT ink_attack_s5_base_tier CHECK (((base_tier = 'normal'::text) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (base_tier = ANY (ARRAY['enhanced'::text, 'weakened'::text])))))
);

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_attack_roots_v1 OWNER TO ink_product_owner;

--
-- Name: ink_bookmark_rights_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_bookmark_rights_v1 (
    session_id uuid NOT NULL,
    right_id uuid NOT NULL,
    actor_participant_id uuid NOT NULL,
    actor_epoch bigint NOT NULL,
    source_grant_id uuid NOT NULL,
    installed_receipt_id uuid NOT NULL,
    origin_page_id text NOT NULL,
    origin_revision_id text NOT NULL,
    remaining_moves smallint NOT NULL,
    installed_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    CONSTRAINT ink_bookmark_rights_v1_check CHECK ((isfinite(closed_at) AND (closed_at >= installed_at))),
    CONSTRAINT ink_bookmark_rights_v1_check1 CHECK (((closed_at IS NULL) = (close_reason IS NULL))),
    CONSTRAINT ink_bookmark_rights_v1_close_reason_check CHECK ((close_reason = ANY (ARRAY['returned'::text, 'expired'::text, 'replaced'::text]))),
    CONSTRAINT ink_bookmark_rights_v1_installed_at_check CHECK (isfinite(installed_at)),
    CONSTRAINT ink_bookmark_rights_v1_origin_page_id_check CHECK ((btrim(origin_page_id) <> ''::text)),
    CONSTRAINT ink_bookmark_rights_v1_origin_revision_id_check CHECK ((btrim(origin_revision_id) <> ''::text)),
    CONSTRAINT ink_bookmark_s4_moves_v1 CHECK (((remaining_moves >= 0) AND (remaining_moves <=
CASE
    WHEN ink_product_engine.ink_s4_fixture_id_v1(session_id) THEN 7
    ELSE 5
END)))
);

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_bookmark_rights_v1 OWNER TO ink_product_owner;

--
-- Name: ink_consumptions_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_consumptions_v1 (
    session_id uuid NOT NULL,
    consumption_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    root_id uuid,
    grant_id uuid,
    right_id uuid,
    kind text NOT NULL,
    unit_index smallint NOT NULL,
    amount smallint NOT NULL,
    CONSTRAINT ink_consumptions_v1_amount_check CHECK ((amount = 1)),
    CONSTRAINT ink_consumptions_v1_check CHECK ((((kind = 'grant'::text) AND (grant_id IS NOT NULL) AND (right_id IS NULL)) OR ((kind <> 'grant'::text) AND (grant_id IS NULL) AND (right_id IS NOT NULL)))),
    CONSTRAINT ink_consumptions_v1_kind_check CHECK ((kind = ANY (ARRAY['grant'::text, 'protection_charge'::text, 'enhancement_charge'::text, 'weakening_charge'::text]))),
    CONSTRAINT ink_consumptions_v1_unit_index_check CHECK ((unit_index = 1))
);

ALTER TABLE ONLY ink_product_engine.ink_consumptions_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_consumptions_v1 OWNER TO ink_product_owner;

--
-- Name: ink_effects_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_effects_v1 (
    session_id uuid NOT NULL,
    effect_id uuid NOT NULL,
    child_id uuid NOT NULL,
    recipient_participant_id uuid NOT NULL,
    recipient_epoch bigint NOT NULL,
    kind text NOT NULL,
    tier text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    replaces_effect_id uuid,
    created_receipt_id uuid NOT NULL,
    CONSTRAINT ink_effects_v1_check CHECK ((isfinite(expires_at) AND (expires_at > starts_at))),
    CONSTRAINT ink_effects_v1_check1 CHECK ((replaces_effect_id IS DISTINCT FROM effect_id)),
    CONSTRAINT ink_effects_v1_kind_check CHECK ((kind = 'ink'::text)),
    CONSTRAINT ink_effects_v1_starts_at_check CHECK (isfinite(starts_at)),
    CONSTRAINT ink_effects_v1_tier_check CHECK ((tier = ANY (ARRAY['normal'::text, 'enhanced'::text, 'weakened'::text])))
);

ALTER TABLE ONLY ink_product_engine.ink_effects_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_effects_v1 OWNER TO ink_product_owner;

--
-- Name: ink_moves_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_moves_v1 (
    session_id uuid NOT NULL,
    move_id uuid NOT NULL,
    actor_participant_id uuid NOT NULL,
    actor_epoch bigint NOT NULL,
    receipt_id uuid NOT NULL,
    operation text NOT NULL,
    movement_kind text GENERATED ALWAYS AS (
CASE
    WHEN (operation = 'normal_link'::text) THEN 'normal'::text
    ELSE 'forced'::text
END) STORED,
    bookmark_right_id uuid,
    from_page_id text NOT NULL,
    from_revision_id text NOT NULL,
    to_page_id text NOT NULL,
    to_revision_id text NOT NULL,
    version_before bigint NOT NULL,
    version_after bigint NOT NULL,
    move_count_after integer NOT NULL,
    logical_at timestamp with time zone NOT NULL,
    receipt_step smallint DEFAULT 1 NOT NULL,
    CONSTRAINT ink_moves_s5_count CHECK (((move_count_after > 0) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (operation = 'lost_link'::text) AND (move_count_after = 0)))),
    CONSTRAINT ink_moves_s5_operation CHECK (((operation = ANY (ARRAY['normal_link'::text, 'bookmark_return'::text])) OR (ink_product_engine.ink_s4_fixture_id_v1(session_id) AND (operation = 'undo'::text)) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (operation = ANY (ARRAY['lost_link'::text, 'cannon'::text]))))),
    CONSTRAINT ink_moves_v1_check CHECK (((version_after - 1) = version_before)),
    CONSTRAINT ink_moves_v1_check1 CHECK ((from_page_id <> to_page_id)),
    CONSTRAINT ink_moves_v1_check2 CHECK (((operation = 'bookmark_return'::text) = (bookmark_right_id IS NOT NULL))),
    CONSTRAINT ink_moves_v1_check3 CHECK (((receipt_step = 1) OR ((receipt_step = 2) AND (operation = 'lost_link'::text)))),
    CONSTRAINT ink_moves_v1_from_page_id_check CHECK ((btrim(from_page_id) <> ''::text)),
    CONSTRAINT ink_moves_v1_from_revision_id_check CHECK ((btrim(from_revision_id) <> ''::text)),
    CONSTRAINT ink_moves_v1_logical_at_check CHECK (isfinite(logical_at)),
    CONSTRAINT ink_moves_v1_to_page_id_check CHECK ((btrim(to_page_id) <> ''::text)),
    CONSTRAINT ink_moves_v1_to_revision_id_check CHECK ((btrim(to_revision_id) <> ''::text)),
    CONSTRAINT ink_moves_v1_version_after_check CHECK ((version_after > 0)),
    CONSTRAINT ink_moves_v1_version_before_check CHECK ((version_before >= 0))
);

ALTER TABLE ONLY ink_product_engine.ink_moves_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_moves_v1 OWNER TO ink_product_owner;

--
-- Name: ink_receipts_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_receipts_v1 (
    session_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    principal_scope text NOT NULL,
    principal_id uuid NOT NULL,
    request_id uuid NOT NULL,
    operation text NOT NULL,
    canonical_payload jsonb NOT NULL,
    payload_fingerprint bytea NOT NULL,
    binding_digest bytea NOT NULL,
    authority_received_at timestamp with time zone NOT NULL,
    outcome_code text NOT NULL,
    private_response jsonb NOT NULL,
    committed_at timestamp with time zone NOT NULL,
    CONSTRAINT ink_receipts_v1_authority_received_at_check CHECK (isfinite(authority_received_at)),
    CONSTRAINT ink_receipts_v1_binding_digest_check CHECK ((octet_length(binding_digest) = 32)),
    CONSTRAINT ink_receipts_v1_canonical_payload_check CHECK ((jsonb_typeof(canonical_payload) = 'object'::text)),
    CONSTRAINT ink_receipts_v1_check CHECK ((committed_at >= authority_received_at)),
    CONSTRAINT ink_receipts_v1_committed_at_check CHECK (isfinite(committed_at)),
    CONSTRAINT ink_receipts_v1_operation_check CHECK ((btrim(operation) <> ''::text)),
    CONSTRAINT ink_receipts_v1_outcome_code_check CHECK (((outcome_code ~ '^[a-zA-Z][a-zA-Z0-9_]{0,63}$'::text) AND (lower(outcome_code) <> ALL (ARRAY['pending'::text, 'unknown_transport'::text, 'request_not_observed'::text])))),
    CONSTRAINT ink_receipts_v1_payload_fingerprint_check CHECK ((octet_length(payload_fingerprint) = 32)),
    CONSTRAINT ink_receipts_v1_principal_scope_check CHECK ((principal_scope = ANY (ARRAY['player'::text, 'worker'::text]))),
    CONSTRAINT ink_receipts_v1_private_response_check CHECK ((jsonb_typeof(private_response) = 'object'::text))
);

ALTER TABLE ONLY ink_product_engine.ink_receipts_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_receipts_v1 OWNER TO ink_product_owner;

--
-- Name: ink_rights_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_rights_v1 (
    session_id uuid NOT NULL,
    right_id uuid NOT NULL,
    owner_participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    kind text NOT NULL,
    source_grant_id uuid,
    right_version bigint NOT NULL,
    installed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone,
    remaining_charges smallint,
    closed_at timestamp with time zone,
    close_reason text,
    CONSTRAINT ink_rights_s5_expiry CHECK ((isfinite(expires_at) OR ((expires_at = 'infinity'::timestamp with time zone) AND (kind = 'protection'::text) AND ink_product_engine.ink_s5_enabled_v1(session_id)))),
    CONSTRAINT ink_rights_v1_check CHECK ((isfinite(closed_at) AND (closed_at >= installed_at))),
    CONSTRAINT ink_rights_v1_check1 CHECK (((closed_at IS NULL) = (close_reason IS NULL))),
    CONSTRAINT ink_rights_v1_check2 CHECK (((remaining_charges IS NOT NULL) AND (remaining_charges = ANY (ARRAY[0, 1])) AND (((kind = 'protection'::text) AND (source_grant_id IS NOT NULL) AND (expires_at IS NOT NULL) AND (expires_at > installed_at)) OR ((kind = ANY (ARRAY['enhancement'::text, 'weakening'::text])) AND (source_grant_id IS NULL) AND (expires_at IS NULL))) AND ((remaining_charges = 0) = (NOT (close_reason IS DISTINCT FROM 'consumed'::text))))),
    CONSTRAINT ink_rights_v1_close_reason_check CHECK ((close_reason = ANY (ARRAY['consumed'::text, 'replaced'::text, 'expired'::text, 'terminal'::text]))),
    CONSTRAINT ink_rights_v1_installed_at_check CHECK (isfinite(installed_at)),
    CONSTRAINT ink_rights_v1_kind_check CHECK ((kind = ANY (ARRAY['protection'::text, 'enhancement'::text, 'weakening'::text]))),
    CONSTRAINT ink_rights_v1_right_version_check CHECK ((right_version > 0))
);

ALTER TABLE ONLY ink_product_engine.ink_rights_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_rights_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s3_presence_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s3_presence_v1 (
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    CONSTRAINT ink_s3_presence_v1_observed_at_check CHECK (isfinite(observed_at))
);

ALTER TABLE ONLY ink_product_engine.ink_s3_presence_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s3_presence_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s3_sessions_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s3_sessions_v1 (
    session_id uuid NOT NULL,
    binding_digest bytea NOT NULL,
    schedule_id text NOT NULL,
    document_graph_id text NOT NULL,
    pool_digest bytea NOT NULL,
    private_rng_seed bytea NOT NULL,
    CONSTRAINT ink_s3_sessions_v1_binding_digest_check CHECK ((octet_length(binding_digest) = 32)),
    CONSTRAINT ink_s3_sessions_v1_document_graph_id_check CHECK ((document_graph_id = 's3-fixture-forest-v1'::text)),
    CONSTRAINT ink_s3_sessions_v1_pool_digest_check CHECK ((octet_length(pool_digest) = 32)),
    CONSTRAINT ink_s3_sessions_v1_private_rng_seed_check CHECK ((octet_length(private_rng_seed) = 32)),
    CONSTRAINT ink_s3_sessions_v1_schedule_id_check CHECK ((schedule_id = 's3-fixture-0-20-25'::text)),
    CONSTRAINT ink_s3_sessions_v1_session_id_check CHECK ((session_id IS NOT NULL))
);

ALTER TABLE ONLY ink_product_engine.ink_s3_sessions_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s3_sessions_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s4_traps_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s4_traps_v1 (
    session_id uuid NOT NULL,
    trap_id uuid NOT NULL,
    source_grant_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    progress_version bigint NOT NULL,
    page_id text NOT NULL,
    revision_id text NOT NULL,
    destination text NOT NULL,
    tier text NOT NULL,
    installed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    installed_receipt_id uuid NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    closed_receipt_id uuid,
    phase2_contract boolean DEFAULT false NOT NULL,
    CONSTRAINT ink_s4_traps_v1_check CHECK ((isfinite(expires_at) AND (expires_at > installed_at))),
    CONSTRAINT ink_s4_traps_v1_check1 CHECK ((((closed_at IS NULL) = (closed_receipt_id IS NULL)) AND ((closed_at IS NULL) = (close_reason IS NULL)))),
    CONSTRAINT ink_s4_traps_v1_check2 CHECK (((closed_at IS NULL) OR (isfinite(closed_at) AND (closed_at >= installed_at)))),
    CONSTRAINT ink_s4_traps_v1_close_reason_check CHECK ((close_reason = ANY (ARRAY['triggered'::text, 'blocked'::text, 'expired'::text]))),
    CONSTRAINT ink_s4_traps_v1_installed_at_check CHECK (isfinite(installed_at)),
    CONSTRAINT ink_s4_traps_v1_progress_version_check CHECK ((progress_version >= 0)),
    CONSTRAINT ink_s4_traps_v1_session_id_check CHECK (ink_product_engine.ink_s4_fixture_id_v1(session_id)),
    CONSTRAINT ink_traps_s5_tier CHECK (((tier = ANY (ARRAY['normal'::text, 'weakened'::text])) OR ((tier = 'enhanced'::text) AND ink_product_engine.ink_s5_enabled_v1(session_id))))
);

ALTER TABLE ONLY ink_product_engine.ink_s4_traps_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s4_traps_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_joker_candidates_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_joker_candidates_v1 (
    session_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    ordinal smallint NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    item_id text NOT NULL,
    base_tier text NOT NULL,
    source_grant_id uuid,
    offered_at timestamp with time zone NOT NULL,
    resolved_receipt_id uuid,
    delivered_grant_id uuid,
    CONSTRAINT ink_s5_joker_candidates_v1_base_tier_check CHECK ((base_tier = ANY (ARRAY['normal'::text, 'enhanced'::text, 'weakened'::text]))),
    CONSTRAINT ink_s5_joker_candidates_v1_check CHECK (((delivered_grant_id IS NULL) OR (resolved_receipt_id IS NOT NULL))),
    CONSTRAINT ink_s5_joker_candidates_v1_offered_at_check CHECK (isfinite(offered_at)),
    CONSTRAINT ink_s5_joker_candidates_v1_ordinal_check CHECK ((ordinal = ANY (ARRAY[1, 2])))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_joker_candidates_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_lost_link_frames_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_lost_link_frames_v1 (
    session_id uuid NOT NULL,
    root_id uuid NOT NULL,
    source_progress_version bigint NOT NULL,
    target_progress_version bigint NOT NULL,
    CONSTRAINT ink_s5_lost_link_frames_v1_source_progress_version_check CHECK ((source_progress_version >= 0)),
    CONSTRAINT ink_s5_lost_link_frames_v1_target_progress_version_check CHECK ((target_progress_version >= 0))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_lost_link_frames_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_lost_link_frames_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifier_units_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_modifier_units_v1 (
    session_id uuid NOT NULL,
    right_id uuid NOT NULL,
    kind text NOT NULL,
    unit smallint NOT NULL,
    grant_id uuid,
    bound_at timestamp with time zone,
    CONSTRAINT ink_s5_modifier_units_v1_check CHECK (((grant_id IS NULL) = (bound_at IS NULL))),
    CONSTRAINT ink_s5_modifier_units_v1_unit_check CHECK ((unit = ANY (ARRAY[1, 2])))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_units_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_modifier_units_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifier_uses_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_modifier_uses_v1 (
    session_id uuid NOT NULL,
    right_id uuid NOT NULL,
    use_receipt uuid NOT NULL,
    unit smallint NOT NULL,
    grant_policy boolean DEFAULT false NOT NULL,
    CONSTRAINT ink_s5_modifier_uses_v1_unit_check CHECK (((unit >= 1) AND (unit <= 2)))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_uses_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_modifier_uses_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_modifiers_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_modifiers_v1 (
    session_id uuid NOT NULL,
    right_id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    kind text NOT NULL,
    installed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    source_receipt uuid NOT NULL,
    quantity smallint DEFAULT 2 NOT NULL,
    CONSTRAINT ink_s5_modifiers_v1_check CHECK ((expires_at > installed_at)),
    CONSTRAINT ink_s5_modifiers_v1_kind_check CHECK ((kind = ANY (ARRAY['enhancement'::text, 'weakening'::text]))),
    CONSTRAINT ink_s5_modifiers_v1_quantity_check CHECK ((quantity = ANY (ARRAY[1, 2])))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_modifiers_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_modifiers_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_navigation_windows_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_navigation_windows_v1 (
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    window_id uuid NOT NULL,
    kind text NOT NULL,
    tier text NOT NULL,
    snapshot_id uuid NOT NULL,
    progress_version bigint NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    success_limit smallint DEFAULT 0 NOT NULL,
    used_successes smallint DEFAULT 0 NOT NULL,
    last_query text,
    last_count integer,
    available_at timestamp with time zone,
    hidden_page_ids text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT ink_s5_navigation_windows_v1_check CHECK ((isfinite(expires_at) AND (expires_at > starts_at))),
    CONSTRAINT ink_s5_navigation_windows_v1_check1 CHECK (((used_successes >= 0) AND (used_successes <= success_limit))),
    CONSTRAINT ink_s5_navigation_windows_v1_check2 CHECK (((kind = 'search'::text) = (success_limit > 0))),
    CONSTRAINT ink_s5_navigation_windows_v1_check3 CHECK (((used_successes > 0) = ((last_query IS NOT NULL) AND (last_count IS NOT NULL) AND (available_at IS NOT NULL)))),
    CONSTRAINT ink_s5_navigation_windows_v1_kind_check CHECK ((kind = ANY (ARRAY['search'::text, 'link_index'::text]))),
    CONSTRAINT ink_s5_navigation_windows_v1_last_count_check CHECK ((last_count > 0)),
    CONSTRAINT ink_s5_navigation_windows_v1_progress_version_check CHECK ((progress_version >= 0)),
    CONSTRAINT ink_s5_navigation_windows_v1_starts_at_check CHECK (isfinite(starts_at)),
    CONSTRAINT ink_s5_navigation_windows_v1_success_limit_check CHECK ((success_limit = ANY (ARRAY[0, 1, 3]))),
    CONSTRAINT ink_s5_navigation_windows_v1_tier_check CHECK ((tier = ANY (ARRAY['normal'::text, 'enhanced'::text, 'weakened'::text])))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_navigation_windows_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_navigation_windows_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_auto_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_phase1_auto_v1 (
    session_id uuid NOT NULL,
    parent_receipt uuid NOT NULL,
    ordinal smallint NOT NULL,
    child_receipt uuid NOT NULL,
    virtual_grant uuid NOT NULL,
    item_id text NOT NULL,
    target_id uuid,
    result jsonb NOT NULL,
    CONSTRAINT ink_s5_phase1_auto_v1_ordinal_check CHECK ((ordinal = ANY (ARRAY[1, 2])))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_auto_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_phase1_auto_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase1_thunder_chains_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_phase1_thunder_chains_v1 (
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    CONSTRAINT ink_s5_phase1_thunder_chains_v1_check CHECK (((ends_at >= started_at) AND (ends_at <= (started_at + '00:00:05'::interval))))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_thunder_chains_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_phase1_thunder_chains_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_rewards_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_phase2_rewards_v1 (
    sequence bigint NOT NULL,
    session_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    offered_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    reason text,
    CONSTRAINT ink_s5_phase2_rewards_v1_check CHECK ((expires_at = (offered_at + '00:00:15'::interval))),
    CONSTRAINT ink_s5_phase2_rewards_v1_check1 CHECK (((closed_at IS NULL) = (reason IS NULL))),
    CONSTRAINT ink_s5_phase2_rewards_v1_reason_check CHECK ((reason = ANY (ARRAY['claimed'::text, 'discarded'::text, 'expired'::text, 'terminal'::text])))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_rewards_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_phase2_rewards_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase2_rewards_v1_sequence_seq; Type: SEQUENCE; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_phase2_rewards_v1 ALTER COLUMN sequence ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ink_product_engine.ink_s5_phase2_rewards_v1_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ink_s5_phase2_search_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_phase2_search_v1 (
    session_id uuid NOT NULL,
    window_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    grant_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    progress_version bigint NOT NULL,
    tier text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    used integer DEFAULT 0 NOT NULL,
    last_query text,
    last_count integer,
    available_at timestamp with time zone,
    CONSTRAINT ink_s5_phase2_search_v1_check CHECK (((starts_at IS NULL) = (expires_at IS NULL))),
    CONSTRAINT ink_s5_phase2_search_v1_check1 CHECK ((expires_at = (starts_at + '00:00:15'::interval))),
    CONSTRAINT ink_s5_phase2_search_v1_last_count_check CHECK ((last_count >= 0)),
    CONSTRAINT ink_s5_phase2_search_v1_tier_check CHECK ((tier = ANY (ARRAY['normal'::text, 'enhanced'::text, 'weakened'::text]))),
    CONSTRAINT ink_s5_phase2_search_v1_used_check CHECK (((used >= 0) AND (used <= 3)))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_search_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_phase2_search_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase3_shield_rewards_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_phase3_shield_rewards_v1 (
    session_id uuid NOT NULL,
    right_id uuid NOT NULL,
    root_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    settled_receipt_id uuid NOT NULL
);

ALTER TABLE ONLY ink_product_engine.ink_s5_phase3_shield_rewards_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_phase3_shield_rewards_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_phase4_trap_shield_rewards_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 (
    session_id uuid NOT NULL,
    right_id uuid NOT NULL,
    trap_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    settled_receipt_id uuid NOT NULL
);

ALTER TABLE ONLY ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_release_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_release_v1 (
    installed boolean NOT NULL,
    CONSTRAINT ink_s5_release_v1_installed_check CHECK (installed)
);


ALTER TABLE ink_product_engine.ink_s5_release_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_roulette_child_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_roulette_child_v1 (
    session_id uuid NOT NULL,
    parent_receipt_id uuid NOT NULL,
    child_id uuid NOT NULL,
    right_id uuid NOT NULL,
    outcome text NOT NULL,
    CONSTRAINT ink_s5_roulette_child_v1_outcome_check CHECK ((outcome = ANY (ARRAY['active'::text, 'already_active'::text])))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_child_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_roulette_child_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_roulette_supply_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_roulette_supply_v1 (
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    owner_epoch bigint NOT NULL,
    source_receipt_id uuid NOT NULL,
    applied_grant_id uuid
);

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_supply_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_roulette_supply_v1 OWNER TO ink_product_owner;

--
-- Name: ink_s5_search_documents_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_s5_search_documents_v1 (
    snapshot_id uuid NOT NULL,
    document_hash text NOT NULL,
    text_nodes text[] NOT NULL,
    link_sections jsonb NOT NULL,
    CONSTRAINT ink_s5_search_documents_v1_document_hash_check CHECK ((document_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT ink_s5_search_documents_v1_link_sections_check CHECK ((jsonb_typeof(link_sections) = 'object'::text)),
    CONSTRAINT ink_s5_search_documents_v1_text_nodes_check CHECK ((array_position(text_nodes, NULL::text) IS NULL))
);

ALTER TABLE ONLY ink_product_engine.ink_s5_search_documents_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_s5_search_documents_v1 OWNER TO ink_product_owner;

--
-- Name: ink_supply_rounds_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.ink_supply_rounds_v1 (
    session_id uuid NOT NULL,
    recipient_participant_id uuid NOT NULL,
    recipient_epoch bigint NOT NULL,
    closed_through_round bigint NOT NULL,
    selected_round bigint,
    logical_due_at timestamp with time zone,
    decision_at timestamp with time zone NOT NULL,
    outcome text NOT NULL,
    pool_digest bytea NOT NULL,
    private_draw_commitment bytea,
    selected_item_id text,
    grant_id uuid,
    receipt_id uuid NOT NULL,
    event_seq bigint,
    CONSTRAINT ink_supply_rounds_v1_check CHECK (((selected_round >= 0) AND (selected_round <= closed_through_round))),
    CONSTRAINT ink_supply_rounds_v1_check1 CHECK (((selected_round IS NULL) = (logical_due_at IS NULL))),
    CONSTRAINT ink_supply_rounds_v1_check2 CHECK (((selected_round IS NULL) = (event_seq IS NULL))),
    CONSTRAINT ink_supply_rounds_v1_check3 CHECK (((logical_due_at IS NULL) OR (decision_at >= logical_due_at))),
    CONSTRAINT ink_supply_rounds_v1_check4 CHECK ((((outcome = 'granted'::text) AND (selected_round IS NOT NULL) AND (grant_id IS NOT NULL) AND (selected_item_id IS NOT NULL) AND (private_draw_commitment IS NOT NULL)) OR ((outcome = 'discarded_full'::text) AND (selected_round IS NOT NULL) AND (grant_id IS NULL) AND (selected_item_id IS NULL) AND (private_draw_commitment IS NULL)) OR ((outcome = 'ineligible'::text) AND (selected_round IS NULL) AND (grant_id IS NULL) AND (selected_item_id IS NULL) AND (private_draw_commitment IS NULL)))),
    CONSTRAINT ink_supply_rounds_v1_closed_through_round_check CHECK ((closed_through_round >= 0)),
    CONSTRAINT ink_supply_rounds_v1_decision_at_check CHECK (isfinite(decision_at)),
    CONSTRAINT ink_supply_rounds_v1_event_seq_check CHECK ((event_seq > 0)),
    CONSTRAINT ink_supply_rounds_v1_logical_due_at_check CHECK (isfinite(logical_due_at)),
    CONSTRAINT ink_supply_rounds_v1_outcome_check CHECK ((outcome = ANY (ARRAY['granted'::text, 'discarded_full'::text, 'ineligible'::text]))),
    CONSTRAINT ink_supply_rounds_v1_pool_digest_check CHECK ((octet_length(pool_digest) = 32)),
    CONSTRAINT ink_supply_rounds_v1_private_draw_commitment_check CHECK ((octet_length(private_draw_commitment) = 32)),
    CONSTRAINT ink_supply_s5_item CHECK (((selected_item_id = ANY (ARRAY['ink'::text, 'parry'::text, 'shield'::text, 'bookmark'::text, 'undo'::text, 'censor'::text, 'correction'::text, 'trap'::text])) OR (ink_product_engine.ink_s5_enabled_v1(session_id) AND (selected_item_id = ANY (ARRAY['lost_link'::text, 'search'::text, 'link_index'::text, 'enhancement'::text, 'weakening'::text, 'thunder'::text, 'thief'::text, 'roulette'::text, 'cannon'::text]))))),
    CONSTRAINT phase2_closed_round CHECK (((NOT ink_product_engine.ink_s5_phase2_enabled_v1(session_id)) OR ((closed_through_round >= 0) AND (closed_through_round <= 48))))
);

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.ink_supply_rounds_v1 OWNER TO ink_product_owner;

--
-- Name: s5_transition_control_v1; Type: TABLE; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TABLE ink_product_engine.s5_transition_control_v1 (
    singleton boolean DEFAULT true NOT NULL,
    new_rooms_enabled boolean DEFAULT false NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    CONSTRAINT s5_transition_control_v1_revision_check CHECK ((revision >= 0)),
    CONSTRAINT s5_transition_control_v1_singleton_check CHECK (singleton)
);

ALTER TABLE ONLY ink_product_engine.s5_transition_control_v1 FORCE ROW LEVEL SECURITY;


ALTER TABLE ink_product_engine.s5_transition_control_v1 OWNER TO ink_product_owner;

--
-- Name: achievement_outbox_v1 achievement_outbox_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.achievement_outbox_v1
    ADD CONSTRAINT achievement_outbox_v1_pkey PRIMARY KEY (participant_id);


--
-- Name: entry_policy_v1 entry_policy_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.entry_policy_v1
    ADD CONSTRAINT entry_policy_v1_pkey PRIMARY KEY (channel);


--
-- Name: finished_move_archive_v1 finished_move_archive_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.finished_move_archive_v1
    ADD CONSTRAINT finished_move_archive_v1_pkey PRIMARY KEY (room_id);


--
-- Name: finished_move_archive_v1 finished_move_archive_v1_session_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.finished_move_archive_v1
    ADD CONSTRAINT finished_move_archive_v1_session_id_key UNIQUE (session_id);


--
-- Name: group_lifecycle_v1 group_lifecycle_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.group_lifecycle_v1
    ADD CONSTRAINT group_lifecycle_v1_pkey PRIMARY KEY (room_id);


--
-- Name: match_receipts match_receipts_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.match_receipts
    ADD CONSTRAINT match_receipts_pkey PRIMARY KEY (room_id, actor_id, owner_epoch, request_id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (room_id, actor_id);


--
-- Name: members members_room_id_participant_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.members
    ADD CONSTRAINT members_room_id_participant_id_key UNIQUE (room_id, participant_id);


--
-- Name: policies policies_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.policies
    ADD CONSTRAINT policies_pkey PRIMARY KEY (binding);


--
-- Name: receipt_retention_v1 receipt_retention_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.receipt_retention_v1
    ADD CONSTRAINT receipt_retention_v1_pkey PRIMARY KEY (room_id);


--
-- Name: receipt_retention_v1 receipt_retention_v1_session_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.receipt_retention_v1
    ADD CONSTRAINT receipt_retention_v1_session_id_key UNIQUE (session_id);


--
-- Name: result_projection_v1 result_projection_v1_participant_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.result_projection_v1
    ADD CONSTRAINT result_projection_v1_participant_id_key UNIQUE (participant_id);


--
-- Name: result_projection_v1 result_projection_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.result_projection_v1
    ADD CONSTRAINT result_projection_v1_pkey PRIMARY KEY (room_id, actor_id);


--
-- Name: results results_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.results
    ADD CONSTRAINT results_pkey PRIMARY KEY (room_id, participant_id);


--
-- Name: results results_room_id_rank_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.results
    ADD CONSTRAINT results_room_id_rank_key UNIQUE (room_id, rank);


--
-- Name: room_receipts room_receipts_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.room_receipts
    ADD CONSTRAINT room_receipts_pkey PRIMARY KEY (actor_id, request_id);


--
-- Name: rooms rooms_code_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.rooms
    ADD CONSTRAINT rooms_code_key UNIQUE (code);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_previous_room_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.rooms
    ADD CONSTRAINT rooms_previous_room_id_key UNIQUE (previous_room_id);


--
-- Name: rooms rooms_session_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.rooms
    ADD CONSTRAINT rooms_session_id_key UNIQUE (session_id);


--
-- Name: s5_phase1_policies_v1 s5_phase1_policies_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase1_policies_v1
    ADD CONSTRAINT s5_phase1_policies_v1_pkey PRIMARY KEY (binding);


--
-- Name: s5_phase2_policies_v1 s5_phase2_policies_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase2_policies_v1
    ADD CONSTRAINT s5_phase2_policies_v1_pkey PRIMARY KEY (binding);


--
-- Name: s5_phase3_policies_v1 s5_phase3_policies_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase3_policies_v1
    ADD CONSTRAINT s5_phase3_policies_v1_pkey PRIMARY KEY (binding);


--
-- Name: s5_phase4_policies_v1 s5_phase4_policies_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase4_policies_v1
    ADD CONSTRAINT s5_phase4_policies_v1_pkey PRIMARY KEY (binding);


--
-- Name: s5_phase5_policies_v1 s5_phase5_policies_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase5_policies_v1
    ADD CONSTRAINT s5_phase5_policies_v1_pkey PRIMARY KEY (binding);


--
-- Name: wiki_course_pages wiki_course_pages_binding_snapshot_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_course_pages
    ADD CONSTRAINT wiki_course_pages_binding_snapshot_id_key UNIQUE (binding, snapshot_id);


--
-- Name: wiki_course_pages wiki_course_pages_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_course_pages
    ADD CONSTRAINT wiki_course_pages_pkey PRIMARY KEY (binding, page_id);


--
-- Name: wiki_documents wiki_documents_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_documents
    ADD CONSTRAINT wiki_documents_pkey PRIMARY KEY (snapshot_id);


--
-- Name: wiki_links wiki_links_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_links
    ADD CONSTRAINT wiki_links_pkey PRIMARY KEY (snapshot_id, page_id);


--
-- Name: wiki_snapshots wiki_snapshots_page_id_revision_id_key; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_snapshots
    ADD CONSTRAINT wiki_snapshots_page_id_revision_id_key UNIQUE (page_id, revision_id);


--
-- Name: wiki_snapshots wiki_snapshots_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_snapshots
    ADD CONSTRAINT wiki_snapshots_pkey PRIMARY KEY (id);


--
-- Name: worker_health_v1 worker_health_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.worker_health_v1
    ADD CONSTRAINT worker_health_v1_pkey PRIMARY KEY (worker_id);


--
-- Name: worker_schedule_v1 worker_schedule_v1_pkey; Type: CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.worker_schedule_v1
    ADD CONSTRAINT worker_schedule_v1_pkey PRIMARY KEY (room_id);


--
-- Name: ink_attack_children_v1 ink_attack_children_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1
    ADD CONSTRAINT ink_attack_children_v1_pkey PRIMARY KEY (session_id, child_id);


--
-- Name: ink_attack_children_v1 ink_attack_children_v1_session_id_root_id_target_participan_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1
    ADD CONSTRAINT ink_attack_children_v1_session_id_root_id_target_participan_key UNIQUE (session_id, root_id, target_participant_id);


--
-- Name: ink_attack_roots_v1 ink_attack_roots_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1
    ADD CONSTRAINT ink_attack_roots_v1_pkey PRIMARY KEY (session_id, root_id);


--
-- Name: ink_attack_roots_v1 ink_attack_roots_v1_session_id_acceptance_seq_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1
    ADD CONSTRAINT ink_attack_roots_v1_session_id_acceptance_seq_key UNIQUE (session_id, acceptance_seq);


--
-- Name: ink_attack_roots_v1 ink_attack_roots_v1_session_id_grant_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1
    ADD CONSTRAINT ink_attack_roots_v1_session_id_grant_id_key UNIQUE (session_id, grant_id);


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_pkey PRIMARY KEY (session_id, right_id);


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_session_id_actor_participant_id_acto_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_session_id_actor_participant_id_acto_key UNIQUE (session_id, actor_participant_id, actor_epoch, right_id);


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_session_id_installed_receipt_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_session_id_installed_receipt_id_key UNIQUE (session_id, installed_receipt_id);


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_session_id_source_grant_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_session_id_source_grant_id_key UNIQUE (session_id, source_grant_id);


--
-- Name: ink_consumptions_v1 ink_consumptions_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_consumptions_v1
    ADD CONSTRAINT ink_consumptions_v1_pkey PRIMARY KEY (session_id, consumption_id);


--
-- Name: ink_effects_v1 ink_effects_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_pkey PRIMARY KEY (session_id, effect_id);


--
-- Name: ink_effects_v1 ink_effects_v1_session_id_child_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_session_id_child_id_key UNIQUE (session_id, child_id);


--
-- Name: ink_effects_v1 ink_effects_v1_session_id_effect_id_recipient_participant_i_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_session_id_effect_id_recipient_participant_i_key UNIQUE (session_id, effect_id, recipient_participant_id, recipient_epoch);


--
-- Name: ink_grants_v1 ink_grants_owner_grant_v3; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_grants_v1
    ADD CONSTRAINT ink_grants_owner_grant_v3 UNIQUE (session_id, owner_participant_id, owner_epoch, grant_id);


--
-- Name: ink_grants_v1 ink_grants_owner_round_v3; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_grants_v1
    ADD CONSTRAINT ink_grants_owner_round_v3 UNIQUE (session_id, owner_participant_id, owner_epoch, source_round);


--
-- Name: ink_grants_v1 ink_grants_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_grants_v1
    ADD CONSTRAINT ink_grants_v1_pkey PRIMARY KEY (session_id, grant_id);


--
-- Name: ink_members_v1 ink_members_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_members_v1
    ADD CONSTRAINT ink_members_v1_pkey PRIMARY KEY (session_id, participant_id);


--
-- Name: ink_members_v1 ink_members_v1_session_id_participant_id_owner_epoch_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_members_v1
    ADD CONSTRAINT ink_members_v1_session_id_participant_id_owner_epoch_key UNIQUE (session_id, participant_id, owner_epoch);


--
-- Name: ink_members_v1 ink_members_v1_session_id_user_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_members_v1
    ADD CONSTRAINT ink_members_v1_session_id_user_id_key UNIQUE (session_id, user_id);


--
-- Name: ink_moves_v1 ink_moves_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_pkey PRIMARY KEY (session_id, move_id);


--
-- Name: ink_moves_v1 ink_moves_v1_session_id_actor_participant_id_actor_epoch_ve_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_session_id_actor_participant_id_actor_epoch_ve_key UNIQUE (session_id, actor_participant_id, actor_epoch, version_after);


--
-- Name: ink_moves_v1 ink_moves_v1_session_id_bookmark_right_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_session_id_bookmark_right_id_key UNIQUE (session_id, bookmark_right_id);


--
-- Name: ink_moves_v1 ink_moves_v1_session_id_receipt_id_receipt_step_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_session_id_receipt_id_receipt_step_key UNIQUE (session_id, receipt_id, receipt_step);


--
-- Name: ink_receipts_v1 ink_receipts_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_receipts_v1
    ADD CONSTRAINT ink_receipts_v1_pkey PRIMARY KEY (session_id, receipt_id);


--
-- Name: ink_receipts_v1 ink_receipts_v1_session_id_principal_scope_principal_id_req_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_receipts_v1
    ADD CONSTRAINT ink_receipts_v1_session_id_principal_scope_principal_id_req_key UNIQUE (session_id, principal_scope, principal_id, request_id);


--
-- Name: ink_rights_v1 ink_rights_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_rights_v1
    ADD CONSTRAINT ink_rights_v1_pkey PRIMARY KEY (session_id, right_id);


--
-- Name: ink_s3_presence_v1 ink_s3_presence_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s3_presence_v1
    ADD CONSTRAINT ink_s3_presence_v1_pkey PRIMARY KEY (session_id, participant_id, owner_epoch);


--
-- Name: ink_s3_sessions_v1 ink_s3_sessions_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s3_sessions_v1
    ADD CONSTRAINT ink_s3_sessions_v1_pkey PRIMARY KEY (session_id);


--
-- Name: ink_s4_effects_v1 ink_s4_effects_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_effects_v1
    ADD CONSTRAINT ink_s4_effects_v1_pkey PRIMARY KEY (session_id, effect_id);


--
-- Name: ink_s4_traps_v1 ink_s4_traps_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_traps_v1
    ADD CONSTRAINT ink_s4_traps_v1_pkey PRIMARY KEY (session_id, trap_id);


--
-- Name: ink_s4_traps_v1 ink_s4_traps_v1_session_id_source_grant_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_traps_v1
    ADD CONSTRAINT ink_s4_traps_v1_session_id_source_grant_id_key UNIQUE (session_id, source_grant_id);


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_pkey PRIMARY KEY (session_id, offer_id, candidate_id);


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_delivered_grant_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_delivered_grant_id_key UNIQUE (session_id, delivered_grant_id);


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_offer_id_ordinal_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_offer_id_ordinal_key UNIQUE (session_id, offer_id, ordinal);


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_source_grant_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_source_grant_id_key UNIQUE (session_id, source_grant_id);


--
-- Name: ink_s5_lost_link_frames_v1 ink_s5_lost_link_frames_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_lost_link_frames_v1
    ADD CONSTRAINT ink_s5_lost_link_frames_v1_pkey PRIMARY KEY (session_id, root_id);


--
-- Name: ink_s5_modifier_units_v1 ink_s5_modifier_units_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_units_v1
    ADD CONSTRAINT ink_s5_modifier_units_v1_pkey PRIMARY KEY (session_id, right_id, unit);


--
-- Name: ink_s5_modifier_units_v1 ink_s5_modifier_units_v1_session_id_grant_id_kind_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_units_v1
    ADD CONSTRAINT ink_s5_modifier_units_v1_session_id_grant_id_kind_key UNIQUE (session_id, grant_id, kind);


--
-- Name: ink_s5_modifier_uses_v1 ink_s5_modifier_uses_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_uses_v1
    ADD CONSTRAINT ink_s5_modifier_uses_v1_pkey PRIMARY KEY (session_id, right_id, unit);


--
-- Name: ink_s5_modifiers_v1 ink_s5_modifiers_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifiers_v1
    ADD CONSTRAINT ink_s5_modifiers_v1_pkey PRIMARY KEY (session_id, right_id);


--
-- Name: ink_s5_modifiers_v1 ink_s5_modifiers_v1_session_id_right_id_kind_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifiers_v1
    ADD CONSTRAINT ink_s5_modifiers_v1_session_id_right_id_kind_key UNIQUE (session_id, right_id, kind);


--
-- Name: ink_s5_modifiers_v1 ink_s5_modifiers_v1_session_id_source_receipt_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifiers_v1
    ADD CONSTRAINT ink_s5_modifiers_v1_session_id_source_receipt_key UNIQUE (session_id, source_receipt);


--
-- Name: ink_s5_navigation_windows_v1 ink_s5_navigation_windows_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_navigation_windows_v1
    ADD CONSTRAINT ink_s5_navigation_windows_v1_pkey PRIMARY KEY (session_id, window_id);


--
-- Name: ink_s5_phase1_auto_v1 ink_s5_phase1_auto_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_auto_v1
    ADD CONSTRAINT ink_s5_phase1_auto_v1_pkey PRIMARY KEY (session_id, parent_receipt, ordinal);


--
-- Name: ink_s5_phase1_auto_v1 ink_s5_phase1_auto_v1_session_id_child_receipt_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_auto_v1
    ADD CONSTRAINT ink_s5_phase1_auto_v1_session_id_child_receipt_key UNIQUE (session_id, child_receipt);


--
-- Name: ink_s5_phase1_thunder_chains_v1 ink_s5_phase1_thunder_chains_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_thunder_chains_v1
    ADD CONSTRAINT ink_s5_phase1_thunder_chains_v1_pkey PRIMARY KEY (session_id, participant_id, owner_epoch);


--
-- Name: ink_s5_phase2_rewards_v1 ink_s5_phase2_rewards_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_rewards_v1
    ADD CONSTRAINT ink_s5_phase2_rewards_v1_pkey PRIMARY KEY (sequence);


--
-- Name: ink_s5_phase2_rewards_v1 ink_s5_phase2_rewards_v1_session_id_offer_id_candidate_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_rewards_v1
    ADD CONSTRAINT ink_s5_phase2_rewards_v1_session_id_offer_id_candidate_id_key UNIQUE (session_id, offer_id, candidate_id);


--
-- Name: ink_s5_phase2_search_v1 ink_s5_phase2_search_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_search_v1
    ADD CONSTRAINT ink_s5_phase2_search_v1_pkey PRIMARY KEY (session_id, window_id);


--
-- Name: ink_s5_phase3_shield_rewards_v1 ink_s5_phase3_shield_rewards_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase3_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase3_shield_rewards_v1_pkey PRIMARY KEY (session_id, right_id, root_id);


--
-- Name: ink_s5_phase3_shield_rewards_v1 ink_s5_phase3_shield_rewards_v1_session_id_offer_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase3_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase3_shield_rewards_v1_session_id_offer_id_key UNIQUE (session_id, offer_id);


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 ink_s5_phase4_trap_shield_rewards_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase4_trap_shield_rewards_v1_pkey PRIMARY KEY (session_id, right_id, trap_id);


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 ink_s5_phase4_trap_shield_rewards_v1_session_id_offer_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase4_trap_shield_rewards_v1_session_id_offer_id_key UNIQUE (session_id, offer_id);


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 ink_s5_phase4_trap_shield_rewards_v1_session_id_right_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase4_trap_shield_rewards_v1_session_id_right_id_key UNIQUE (session_id, right_id);


--
-- Name: ink_s5_release_v1 ink_s5_release_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_release_v1
    ADD CONSTRAINT ink_s5_release_v1_pkey PRIMARY KEY (installed);


--
-- Name: ink_s5_roulette_child_v1 ink_s5_roulette_child_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_child_v1
    ADD CONSTRAINT ink_s5_roulette_child_v1_pkey PRIMARY KEY (session_id, parent_receipt_id);


--
-- Name: ink_s5_roulette_child_v1 ink_s5_roulette_child_v1_session_id_child_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_child_v1
    ADD CONSTRAINT ink_s5_roulette_child_v1_session_id_child_id_key UNIQUE (session_id, child_id);


--
-- Name: ink_s5_roulette_supply_v1 ink_s5_roulette_supply_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_supply_v1
    ADD CONSTRAINT ink_s5_roulette_supply_v1_pkey PRIMARY KEY (session_id, source_receipt_id);


--
-- Name: ink_s5_roulette_supply_v1 ink_s5_roulette_supply_v1_session_id_applied_grant_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_supply_v1
    ADD CONSTRAINT ink_s5_roulette_supply_v1_session_id_applied_grant_id_key UNIQUE (session_id, applied_grant_id);


--
-- Name: ink_s5_search_documents_v1 ink_s5_search_documents_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_search_documents_v1
    ADD CONSTRAINT ink_s5_search_documents_v1_pkey PRIMARY KEY (snapshot_id);


--
-- Name: ink_sessions_v1 ink_sessions_v1_init_request_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_sessions_v1
    ADD CONSTRAINT ink_sessions_v1_init_request_id_key UNIQUE (init_request_id);


--
-- Name: ink_sessions_v1 ink_sessions_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_sessions_v1
    ADD CONSTRAINT ink_sessions_v1_pkey PRIMARY KEY (session_id);


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_pkey PRIMARY KEY (session_id, recipient_participant_id, recipient_epoch, closed_through_round);


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_session_id_grant_id_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_session_id_grant_id_key UNIQUE (session_id, grant_id);


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_session_id_recipient_participant_id_r_key1; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_session_id_recipient_participant_id_r_key1 UNIQUE (session_id, recipient_participant_id, recipient_epoch, selected_round);


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_session_id_recipient_participant_id_re_key; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_session_id_recipient_participant_id_re_key UNIQUE (session_id, recipient_participant_id, recipient_epoch, event_seq);


--
-- Name: s5_transition_control_v1 s5_transition_control_v1_pkey; Type: CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.s5_transition_control_v1
    ADD CONSTRAINT s5_transition_control_v1_pkey PRIMARY KEY (singleton);


--
-- Name: group_lifecycle_due_v1; Type: INDEX; Schema: ink_product; Owner: ink_product_owner
--

CREATE INDEX group_lifecycle_due_v1 ON ink_product.group_lifecycle_v1 USING btree (deadline_at, grace_ends_at) WHERE (closed_at IS NULL);


--
-- Name: result_projection_actor_time_v1; Type: INDEX; Schema: ink_product; Owner: ink_product_owner
--

CREATE INDEX result_projection_actor_time_v1 ON ink_product.result_projection_v1 USING btree (actor_id, ended_at DESC);


--
-- Name: s5_admission_order_v1; Type: INDEX; Schema: ink_product; Owner: ink_product_owner
--

CREATE UNIQUE INDEX s5_admission_order_v1 ON ink_product.members USING btree (room_id, admission_order) WHERE (admission_order IS NOT NULL);


--
-- Name: worker_schedule_poll_v1; Type: INDEX; Schema: ink_product; Owner: ink_product_owner
--

CREATE INDEX worker_schedule_poll_v1 ON ink_product.worker_schedule_v1 USING btree (last_polled_at, room_id);


--
-- Name: ink_bookmark_one_active_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_bookmark_one_active_v1 ON ink_product_engine.ink_bookmark_rights_v1 USING btree (session_id, actor_participant_id, actor_epoch) WHERE (closed_at IS NULL);


--
-- Name: ink_consumptions_grant_once_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_consumptions_grant_once_v1 ON ink_product_engine.ink_consumptions_v1 USING btree (session_id, grant_id) WHERE (kind = 'grant'::text);


--
-- Name: ink_consumptions_right_once_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_consumptions_right_once_v1 ON ink_product_engine.ink_consumptions_v1 USING btree (session_id, right_id, kind, unit_index) WHERE (right_id IS NOT NULL);


--
-- Name: ink_grants_active_slot_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_grants_active_slot_v1 ON ink_product_engine.ink_grants_v1 USING btree (session_id, owner_participant_id, slot_index) WHERE (consumed_at IS NULL);


--
-- Name: ink_rights_active_kind_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_rights_active_kind_v1 ON ink_product_engine.ink_rights_v1 USING btree (session_id, owner_participant_id, kind) WHERE (closed_at IS NULL);


--
-- Name: ink_s2_pending_child_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE INDEX ink_s2_pending_child_v1 ON ink_product_engine.ink_attack_children_v1 USING btree (session_id, root_id) WHERE (state = 'pending'::text);


--
-- Name: ink_s2_root_modifier_once_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_s2_root_modifier_once_v1 ON ink_product_engine.ink_consumptions_v1 USING btree (session_id, root_id, kind) WHERE (kind = ANY (ARRAY['enhancement_charge'::text, 'weakening_charge'::text]));


--
-- Name: ink_s4_trap_open_frame_legacy; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_s4_trap_open_frame_legacy ON ink_product_engine.ink_s4_traps_v1 USING btree (session_id, participant_id, owner_epoch, progress_version) WHERE ((closed_at IS NULL) AND (NOT phase2_contract));


--
-- Name: ink_s4_trap_open_link_phase2; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_s4_trap_open_link_phase2 ON ink_product_engine.ink_s4_traps_v1 USING btree (session_id, participant_id, owner_epoch, page_id, revision_id, destination) WHERE ((closed_at IS NULL) AND phase2_contract);


--
-- Name: ink_s5_joker_pending_candidates_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE INDEX ink_s5_joker_pending_candidates_v1 ON ink_product_engine.ink_s5_joker_candidates_v1 USING btree (session_id, participant_id, owner_epoch, offer_id) WHERE (resolved_receipt_id IS NULL);


--
-- Name: ink_s5_legacy_modifier_use_receipt; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_s5_legacy_modifier_use_receipt ON ink_product_engine.ink_s5_modifier_uses_v1 USING btree (session_id, right_id, use_receipt) WHERE (NOT grant_policy);


--
-- Name: ink_s5_modifiers_by_owner; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE INDEX ink_s5_modifiers_by_owner ON ink_product_engine.ink_s5_modifiers_v1 USING btree (session_id, participant_id, owner_epoch, kind, expires_at DESC);


--
-- Name: ink_s5_navigation_windows_member_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE INDEX ink_s5_navigation_windows_member_v1 ON ink_product_engine.ink_s5_navigation_windows_v1 USING btree (session_id, participant_id, owner_epoch, progress_version, kind, starts_at DESC);


--
-- Name: ink_s5_one_pending_supply_weaken_v1; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE UNIQUE INDEX ink_s5_one_pending_supply_weaken_v1 ON ink_product_engine.ink_s5_roulette_supply_v1 USING btree (session_id, participant_id, owner_epoch) WHERE (applied_grant_id IS NULL);


--
-- Name: ink_s5_phase2_rewards_due; Type: INDEX; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE INDEX ink_s5_phase2_rewards_due ON ink_product_engine.ink_s5_phase2_rewards_v1 USING btree (session_id, expires_at) WHERE (closed_at IS NULL);


--
-- Name: wiki_course_pages freeze_course; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER freeze_course BEFORE DELETE OR UPDATE ON ink_product.wiki_course_pages FOR EACH ROW EXECUTE FUNCTION ink_product.freeze_reference();


--
-- Name: wiki_documents freeze_document; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER freeze_document BEFORE DELETE OR UPDATE ON ink_product.wiki_documents FOR EACH ROW EXECUTE FUNCTION ink_product.freeze_reference();


--
-- Name: wiki_links freeze_link; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER freeze_link BEFORE DELETE OR UPDATE ON ink_product.wiki_links FOR EACH ROW EXECUTE FUNCTION ink_product.freeze_reference();


--
-- Name: policies freeze_policy; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER freeze_policy BEFORE DELETE OR UPDATE ON ink_product.policies FOR EACH ROW EXECUTE FUNCTION ink_product.freeze_reference();


--
-- Name: wiki_snapshots freeze_snapshot; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER freeze_snapshot BEFORE DELETE OR UPDATE ON ink_product.wiki_snapshots FOR EACH ROW EXECUTE FUNCTION ink_product.freeze_reference();


--
-- Name: rooms guard_room_update; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER guard_room_update BEFORE UPDATE ON ink_product.rooms FOR EACH ROW EXECUTE FUNCTION ink_product.guard_room_update();


--
-- Name: rooms room_version_changed; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER room_version_changed AFTER UPDATE OF version ON ink_product.rooms FOR EACH ROW WHEN ((old.version IS DISTINCT FROM new.version)) EXECUTE FUNCTION ink_product.room_version_changed();


--
-- Name: members s5_admission_order_v1; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER s5_admission_order_v1 BEFORE INSERT OR UPDATE OF status ON ink_product.members FOR EACH ROW WHEN ((new.status = 'waiting'::text)) EXECUTE FUNCTION ink_product.admission_order_v1();


--
-- Name: results s5_result_projection; Type: TRIGGER; Schema: ink_product; Owner: ink_product_owner
--

CREATE TRIGGER s5_result_projection AFTER INSERT ON ink_product.results FOR EACH ROW EXECUTE FUNCTION ink_product.project_result_v1();


--
-- Name: ink_grants_v1 ink_s5_bind_pending_v2; Type: TRIGGER; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TRIGGER ink_s5_bind_pending_v2 AFTER INSERT ON ink_product_engine.ink_grants_v1 FOR EACH ROW EXECUTE FUNCTION ink_product_engine.ink_s5_bind_pending_v2();


--
-- Name: ink_grants_v1 ink_s5_close_modifier_units_v2; Type: TRIGGER; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TRIGGER ink_s5_close_modifier_units_v2 AFTER UPDATE OF consumed_at ON ink_product_engine.ink_grants_v1 FOR EACH ROW WHEN (((old.consumed_at IS NULL) AND (new.consumed_at IS NOT NULL))) EXECUTE FUNCTION ink_product_engine.ink_s5_close_modifier_units_v2();


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_phase2_offer; Type: TRIGGER; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TRIGGER ink_s5_phase2_offer AFTER INSERT ON ink_product_engine.ink_s5_joker_candidates_v1 FOR EACH ROW EXECUTE FUNCTION ink_product_engine.ink_s5_phase2_offer_trigger_v1();


--
-- Name: ink_supply_rounds_v1 ink_s5_roulette_supply_v1; Type: TRIGGER; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE TRIGGER ink_s5_roulette_supply_v1 AFTER INSERT ON ink_product_engine.ink_supply_rounds_v1 FOR EACH ROW WHEN ((new.outcome = 'granted'::text)) EXECUTE FUNCTION ink_product_engine.ink_s5_roulette_supply_hook_v1();


--
-- Name: achievement_outbox_v1 achievement_outbox_v1_participant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.achievement_outbox_v1
    ADD CONSTRAINT achievement_outbox_v1_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES ink_product.result_projection_v1(participant_id);


--
-- Name: entry_policy_v1 entry_policy_v1_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.entry_policy_v1
    ADD CONSTRAINT entry_policy_v1_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.policies(binding);


--
-- Name: finished_move_archive_v1 finished_move_archive_v1_room_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.finished_move_archive_v1
    ADD CONSTRAINT finished_move_archive_v1_room_id_fkey FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id);


--
-- Name: group_lifecycle_v1 group_lifecycle_v1_room_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.group_lifecycle_v1
    ADD CONSTRAINT group_lifecycle_v1_room_id_fkey FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id);


--
-- Name: match_receipts match_receipts_room_id_actor_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.match_receipts
    ADD CONSTRAINT match_receipts_room_id_actor_id_fkey FOREIGN KEY (room_id, actor_id) REFERENCES ink_product.members(room_id, actor_id);


--
-- Name: members members_room_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.members
    ADD CONSTRAINT members_room_id_fkey FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id);


--
-- Name: members members_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.members
    ADD CONSTRAINT members_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES ink_product.wiki_snapshots(id);


--
-- Name: policies policies_goal_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.policies
    ADD CONSTRAINT policies_goal_snapshot_id_fkey FOREIGN KEY (goal_snapshot_id) REFERENCES ink_product.wiki_snapshots(id);


--
-- Name: policies policies_start_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.policies
    ADD CONSTRAINT policies_start_snapshot_id_fkey FOREIGN KEY (start_snapshot_id) REFERENCES ink_product.wiki_snapshots(id);


--
-- Name: receipt_retention_v1 receipt_retention_v1_room_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.receipt_retention_v1
    ADD CONSTRAINT receipt_retention_v1_room_id_fkey FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id);


--
-- Name: result_projection_v1 result_projection_v1_room_id_actor_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.result_projection_v1
    ADD CONSTRAINT result_projection_v1_room_id_actor_id_fkey FOREIGN KEY (room_id, actor_id) REFERENCES ink_product.members(room_id, actor_id);


--
-- Name: results results_room_id_participant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.results
    ADD CONSTRAINT results_room_id_participant_id_fkey FOREIGN KEY (room_id, participant_id) REFERENCES ink_product.members(room_id, participant_id);


--
-- Name: rooms rooms_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.rooms
    ADD CONSTRAINT rooms_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.policies(binding);


--
-- Name: rooms rooms_previous_room_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.rooms
    ADD CONSTRAINT rooms_previous_room_id_fkey FOREIGN KEY (previous_room_id) REFERENCES ink_product.rooms(id);


--
-- Name: s5_phase1_policies_v1 s5_phase1_policies_v1_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase1_policies_v1
    ADD CONSTRAINT s5_phase1_policies_v1_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.policies(binding);


--
-- Name: s5_phase2_policies_v1 s5_phase2_policies_v1_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase2_policies_v1
    ADD CONSTRAINT s5_phase2_policies_v1_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.policies(binding);


--
-- Name: s5_phase3_policies_v1 s5_phase3_policies_v1_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase3_policies_v1
    ADD CONSTRAINT s5_phase3_policies_v1_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.s5_phase2_policies_v1(binding);


--
-- Name: s5_phase4_policies_v1 s5_phase4_policies_v1_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase4_policies_v1
    ADD CONSTRAINT s5_phase4_policies_v1_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.s5_phase3_policies_v1(binding);


--
-- Name: s5_phase5_policies_v1 s5_phase5_policies_v1_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.s5_phase5_policies_v1
    ADD CONSTRAINT s5_phase5_policies_v1_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.s5_phase4_policies_v1(binding);


--
-- Name: wiki_course_pages wiki_course_pages_binding_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_course_pages
    ADD CONSTRAINT wiki_course_pages_binding_fkey FOREIGN KEY (binding) REFERENCES ink_product.policies(binding);


--
-- Name: wiki_course_pages wiki_course_pages_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_course_pages
    ADD CONSTRAINT wiki_course_pages_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES ink_product.wiki_documents(snapshot_id);


--
-- Name: wiki_documents wiki_documents_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_documents
    ADD CONSTRAINT wiki_documents_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES ink_product.wiki_snapshots(id);


--
-- Name: wiki_links wiki_links_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.wiki_links
    ADD CONSTRAINT wiki_links_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES ink_product.wiki_snapshots(id);


--
-- Name: worker_schedule_v1 worker_schedule_v1_room_id_fkey; Type: FK CONSTRAINT; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product.worker_schedule_v1
    ADD CONSTRAINT worker_schedule_v1_room_id_fkey FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id);


--
-- Name: ink_attack_children_v1 ink_attack_children_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1
    ADD CONSTRAINT ink_attack_children_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_attack_children_v1 ink_attack_children_v1_session_id_parry_attempt_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1
    ADD CONSTRAINT ink_attack_children_v1_session_id_parry_attempt_receipt_id_fkey FOREIGN KEY (session_id, parry_attempt_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_attack_children_v1 ink_attack_children_v1_session_id_resolution_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1
    ADD CONSTRAINT ink_attack_children_v1_session_id_resolution_receipt_id_fkey FOREIGN KEY (session_id, resolution_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_attack_children_v1 ink_attack_children_v1_session_id_root_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1
    ADD CONSTRAINT ink_attack_children_v1_session_id_root_id_fkey FOREIGN KEY (session_id, root_id) REFERENCES ink_product_engine.ink_attack_roots_v1(session_id, root_id) ON DELETE RESTRICT;


--
-- Name: ink_attack_children_v1 ink_attack_children_v1_session_id_target_participant_id_ta_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_children_v1
    ADD CONSTRAINT ink_attack_children_v1_session_id_target_participant_id_ta_fkey FOREIGN KEY (session_id, target_participant_id, target_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_attack_roots_v1 ink_attack_roots_v1_session_id_acceptance_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1
    ADD CONSTRAINT ink_attack_roots_v1_session_id_acceptance_receipt_id_fkey FOREIGN KEY (session_id, acceptance_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_attack_roots_v1 ink_attack_roots_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1
    ADD CONSTRAINT ink_attack_roots_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_attack_roots_v1 ink_attack_roots_v1_session_id_grant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1
    ADD CONSTRAINT ink_attack_roots_v1_session_id_grant_id_fkey FOREIGN KEY (session_id, grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id) ON DELETE RESTRICT;


--
-- Name: ink_attack_roots_v1 ink_attack_roots_v1_session_id_source_participant_id_sourc_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_attack_roots_v1
    ADD CONSTRAINT ink_attack_roots_v1_session_id_source_participant_id_sourc_fkey FOREIGN KEY (session_id, source_participant_id, source_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_session_id_actor_participant_id_ac_fkey1; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_session_id_actor_participant_id_ac_fkey1 FOREIGN KEY (session_id, actor_participant_id, actor_epoch, source_grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, owner_participant_id, owner_epoch, grant_id) ON DELETE RESTRICT;


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_session_id_actor_participant_id_act_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_session_id_actor_participant_id_act_fkey FOREIGN KEY (session_id, actor_participant_id, actor_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_s3_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_bookmark_rights_v1 ink_bookmark_rights_v1_session_id_installed_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_bookmark_rights_v1
    ADD CONSTRAINT ink_bookmark_rights_v1_session_id_installed_receipt_id_fkey FOREIGN KEY (session_id, installed_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_consumptions_v1 ink_consumptions_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_consumptions_v1
    ADD CONSTRAINT ink_consumptions_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_consumptions_v1 ink_consumptions_v1_session_id_grant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_consumptions_v1
    ADD CONSTRAINT ink_consumptions_v1_session_id_grant_id_fkey FOREIGN KEY (session_id, grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id) ON DELETE RESTRICT;


--
-- Name: ink_consumptions_v1 ink_consumptions_v1_session_id_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_consumptions_v1
    ADD CONSTRAINT ink_consumptions_v1_session_id_receipt_id_fkey FOREIGN KEY (session_id, receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_consumptions_v1 ink_consumptions_v1_session_id_right_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_consumptions_v1
    ADD CONSTRAINT ink_consumptions_v1_session_id_right_id_fkey FOREIGN KEY (session_id, right_id) REFERENCES ink_product_engine.ink_rights_v1(session_id, right_id) ON DELETE RESTRICT;


--
-- Name: ink_consumptions_v1 ink_consumptions_v1_session_id_root_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_consumptions_v1
    ADD CONSTRAINT ink_consumptions_v1_session_id_root_id_fkey FOREIGN KEY (session_id, root_id) REFERENCES ink_product_engine.ink_attack_roots_v1(session_id, root_id) ON DELETE RESTRICT;


--
-- Name: ink_effects_v1 ink_effects_v1_session_id_child_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_session_id_child_id_fkey FOREIGN KEY (session_id, child_id) REFERENCES ink_product_engine.ink_attack_children_v1(session_id, child_id) ON DELETE RESTRICT;


--
-- Name: ink_effects_v1 ink_effects_v1_session_id_created_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_session_id_created_receipt_id_fkey FOREIGN KEY (session_id, created_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_effects_v1 ink_effects_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_effects_v1 ink_effects_v1_session_id_recipient_participant_id_recipie_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_session_id_recipient_participant_id_recipie_fkey FOREIGN KEY (session_id, recipient_participant_id, recipient_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_effects_v1 ink_effects_v1_session_id_replaces_effect_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_effects_v1
    ADD CONSTRAINT ink_effects_v1_session_id_replaces_effect_id_fkey FOREIGN KEY (session_id, replaces_effect_id) REFERENCES ink_product_engine.ink_effects_v1(session_id, effect_id) ON DELETE RESTRICT;


--
-- Name: ink_grants_v1 ink_grants_source_round_v3; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_grants_v1
    ADD CONSTRAINT ink_grants_source_round_v3 FOREIGN KEY (session_id, owner_participant_id, owner_epoch, source_round) REFERENCES ink_product_engine.ink_supply_rounds_v1(session_id, recipient_participant_id, recipient_epoch, selected_round) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_grants_v1 ink_grants_v1_session_id_consumed_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_grants_v1
    ADD CONSTRAINT ink_grants_v1_session_id_consumed_receipt_id_fkey FOREIGN KEY (session_id, consumed_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_grants_v1 ink_grants_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_grants_v1
    ADD CONSTRAINT ink_grants_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_grants_v1 ink_grants_v1_session_id_owner_participant_id_owner_epoch_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_grants_v1
    ADD CONSTRAINT ink_grants_v1_session_id_owner_participant_id_owner_epoch_fkey FOREIGN KEY (session_id, owner_participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_members_v1 ink_member_current_effect_v1; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_members_v1
    ADD CONSTRAINT ink_member_current_effect_v1 FOREIGN KEY (session_id, current_ink_effect_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_effects_v1(session_id, effect_id, recipient_participant_id, recipient_epoch) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_members_v1 ink_members_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_members_v1
    ADD CONSTRAINT ink_members_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_members_v1 ink_members_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_members_v1
    ADD CONSTRAINT ink_members_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: ink_moves_v1 ink_moves_v1_session_id_actor_participant_id_actor_epoch_b_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_session_id_actor_participant_id_actor_epoch_b_fkey FOREIGN KEY (session_id, actor_participant_id, actor_epoch, bookmark_right_id) REFERENCES ink_product_engine.ink_bookmark_rights_v1(session_id, actor_participant_id, actor_epoch, right_id) ON DELETE RESTRICT;


--
-- Name: ink_moves_v1 ink_moves_v1_session_id_actor_participant_id_actor_epoch_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_session_id_actor_participant_id_actor_epoch_fkey FOREIGN KEY (session_id, actor_participant_id, actor_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_moves_v1 ink_moves_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_s3_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_moves_v1 ink_moves_v1_session_id_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_moves_v1
    ADD CONSTRAINT ink_moves_v1_session_id_receipt_id_fkey FOREIGN KEY (session_id, receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_receipts_v1 ink_receipts_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_receipts_v1
    ADD CONSTRAINT ink_receipts_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_rights_v1 ink_rights_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_rights_v1
    ADD CONSTRAINT ink_rights_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_rights_v1 ink_rights_v1_session_id_owner_participant_id_owner_epoch_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_rights_v1
    ADD CONSTRAINT ink_rights_v1_session_id_owner_participant_id_owner_epoch_fkey FOREIGN KEY (session_id, owner_participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_rights_v1 ink_rights_v1_session_id_source_grant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_rights_v1
    ADD CONSTRAINT ink_rights_v1_session_id_source_grant_id_fkey FOREIGN KEY (session_id, source_grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id) ON DELETE RESTRICT;


--
-- Name: ink_s3_presence_v1 ink_s3_presence_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s3_presence_v1
    ADD CONSTRAINT ink_s3_presence_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_s3_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_s3_presence_v1 ink_s3_presence_v1_session_id_participant_id_owner_epoch_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s3_presence_v1
    ADD CONSTRAINT ink_s3_presence_v1_session_id_participant_id_owner_epoch_fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: ink_s3_sessions_v1 ink_s3_sessions_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s3_sessions_v1
    ADD CONSTRAINT ink_s3_sessions_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_s4_effects_v1 ink_s4_effects_v1_session_id_closed_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_effects_v1
    ADD CONSTRAINT ink_s4_effects_v1_session_id_closed_receipt_id_fkey FOREIGN KEY (session_id, closed_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s4_effects_v1 ink_s4_effects_v1_session_id_opened_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_effects_v1
    ADD CONSTRAINT ink_s4_effects_v1_session_id_opened_receipt_id_fkey FOREIGN KEY (session_id, opened_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s4_effects_v1 ink_s4_effects_v1_session_id_participant_id_owner_epoch_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_effects_v1
    ADD CONSTRAINT ink_s4_effects_v1_session_id_participant_id_owner_epoch_fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch);


--
-- Name: ink_s4_traps_v1 ink_s4_traps_v1_session_id_closed_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_traps_v1
    ADD CONSTRAINT ink_s4_traps_v1_session_id_closed_receipt_id_fkey FOREIGN KEY (session_id, closed_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s4_traps_v1 ink_s4_traps_v1_session_id_installed_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_traps_v1
    ADD CONSTRAINT ink_s4_traps_v1_session_id_installed_receipt_id_fkey FOREIGN KEY (session_id, installed_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s4_traps_v1 ink_s4_traps_v1_session_id_participant_id_owner_epoch_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_traps_v1
    ADD CONSTRAINT ink_s4_traps_v1_session_id_participant_id_owner_epoch_fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch);


--
-- Name: ink_s4_traps_v1 ink_s4_traps_v1_session_id_source_grant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s4_traps_v1
    ADD CONSTRAINT ink_s4_traps_v1_session_id_source_grant_id_fkey FOREIGN KEY (session_id, source_grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id);


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_offer_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_offer_id_fkey FOREIGN KEY (session_id, offer_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_participant_id_owne_fkey1; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_participant_id_owne_fkey1 FOREIGN KEY (session_id, participant_id, owner_epoch, delivered_grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, owner_participant_id, owner_epoch, grant_id);


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_participant_id_owner_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_participant_id_owner_fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch);


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_resolved_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_resolved_receipt_id_fkey FOREIGN KEY (session_id, resolved_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_joker_candidates_v1 ink_s5_joker_candidates_v1_session_id_source_grant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_joker_candidates_v1
    ADD CONSTRAINT ink_s5_joker_candidates_v1_session_id_source_grant_id_fkey FOREIGN KEY (session_id, source_grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id);


--
-- Name: ink_s5_lost_link_frames_v1 ink_s5_lost_link_frames_v1_session_id_root_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_lost_link_frames_v1
    ADD CONSTRAINT ink_s5_lost_link_frames_v1_session_id_root_id_fkey FOREIGN KEY (session_id, root_id) REFERENCES ink_product_engine.ink_attack_roots_v1(session_id, root_id);


--
-- Name: ink_s5_modifier_units_v1 ink_s5_modifier_units_v1_session_id_grant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_units_v1
    ADD CONSTRAINT ink_s5_modifier_units_v1_session_id_grant_id_fkey FOREIGN KEY (session_id, grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id);


--
-- Name: ink_s5_modifier_units_v1 ink_s5_modifier_units_v1_session_id_right_id_kind_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_units_v1
    ADD CONSTRAINT ink_s5_modifier_units_v1_session_id_right_id_kind_fkey FOREIGN KEY (session_id, right_id, kind) REFERENCES ink_product_engine.ink_s5_modifiers_v1(session_id, right_id, kind);


--
-- Name: ink_s5_modifier_uses_v1 ink_s5_modifier_uses_v1_session_id_right_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_uses_v1
    ADD CONSTRAINT ink_s5_modifier_uses_v1_session_id_right_id_fkey FOREIGN KEY (session_id, right_id) REFERENCES ink_product_engine.ink_s5_modifiers_v1(session_id, right_id);


--
-- Name: ink_s5_modifier_uses_v1 ink_s5_modifier_uses_v1_session_id_use_receipt_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifier_uses_v1
    ADD CONSTRAINT ink_s5_modifier_uses_v1_session_id_use_receipt_fkey FOREIGN KEY (session_id, use_receipt) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_modifiers_v1 ink_s5_modifiers_v1_session_id_participant_id_owner_epoch_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifiers_v1
    ADD CONSTRAINT ink_s5_modifiers_v1_session_id_participant_id_owner_epoch_fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch);


--
-- Name: ink_s5_modifiers_v1 ink_s5_modifiers_v1_session_id_source_receipt_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_modifiers_v1
    ADD CONSTRAINT ink_s5_modifiers_v1_session_id_source_receipt_fkey FOREIGN KEY (session_id, source_receipt) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_navigation_windows_v1 ink_s5_navigation_windows_v1_session_id_participant_id_own_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_navigation_windows_v1
    ADD CONSTRAINT ink_s5_navigation_windows_v1_session_id_participant_id_own_fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch);


--
-- Name: ink_s5_navigation_windows_v1 ink_s5_navigation_windows_v1_session_id_window_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_navigation_windows_v1
    ADD CONSTRAINT ink_s5_navigation_windows_v1_session_id_window_id_fkey FOREIGN KEY (session_id, window_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_navigation_windows_v1 ink_s5_navigation_windows_v1_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_navigation_windows_v1
    ADD CONSTRAINT ink_s5_navigation_windows_v1_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES ink_product.wiki_snapshots(id);


--
-- Name: ink_s5_phase1_auto_v1 ink_s5_phase1_auto_v1_session_id_child_receipt_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_auto_v1
    ADD CONSTRAINT ink_s5_phase1_auto_v1_session_id_child_receipt_fkey FOREIGN KEY (session_id, child_receipt) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_phase1_auto_v1 ink_s5_phase1_auto_v1_session_id_parent_receipt_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_auto_v1
    ADD CONSTRAINT ink_s5_phase1_auto_v1_session_id_parent_receipt_fkey FOREIGN KEY (session_id, parent_receipt) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_phase1_auto_v1 ink_s5_phase1_auto_v1_session_id_virtual_grant_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_auto_v1
    ADD CONSTRAINT ink_s5_phase1_auto_v1_session_id_virtual_grant_fkey FOREIGN KEY (session_id, virtual_grant) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id);


--
-- Name: ink_s5_phase1_thunder_chains_v1 ink_s5_phase1_thunder_chains__session_id_participant_id_ow_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase1_thunder_chains_v1
    ADD CONSTRAINT ink_s5_phase1_thunder_chains__session_id_participant_id_ow_fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch);


--
-- Name: ink_s5_phase2_rewards_v1 ink_s5_phase2_rewards_v1_session_id_offer_id_candidate_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_rewards_v1
    ADD CONSTRAINT ink_s5_phase2_rewards_v1_session_id_offer_id_candidate_id_fkey FOREIGN KEY (session_id, offer_id, candidate_id) REFERENCES ink_product_engine.ink_s5_joker_candidates_v1(session_id, offer_id, candidate_id);


--
-- Name: ink_s5_phase2_search_v1 ink_s5_phase2_search_v1_session_id_grant_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_search_v1
    ADD CONSTRAINT ink_s5_phase2_search_v1_session_id_grant_id_fkey FOREIGN KEY (session_id, grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, grant_id);


--
-- Name: ink_s5_phase2_search_v1 ink_s5_phase2_search_v1_session_id_window_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase2_search_v1
    ADD CONSTRAINT ink_s5_phase2_search_v1_session_id_window_id_fkey FOREIGN KEY (session_id, window_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_phase3_shield_rewards_v1 ink_s5_phase3_shield_rewards_v1_session_id_offer_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase3_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase3_shield_rewards_v1_session_id_offer_id_fkey FOREIGN KEY (session_id, offer_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_phase3_shield_rewards_v1 ink_s5_phase3_shield_rewards_v1_session_id_right_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase3_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase3_shield_rewards_v1_session_id_right_id_fkey FOREIGN KEY (session_id, right_id) REFERENCES ink_product_engine.ink_rights_v1(session_id, right_id);


--
-- Name: ink_s5_phase3_shield_rewards_v1 ink_s5_phase3_shield_rewards_v1_session_id_root_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase3_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase3_shield_rewards_v1_session_id_root_id_fkey FOREIGN KEY (session_id, root_id) REFERENCES ink_product_engine.ink_attack_roots_v1(session_id, root_id);


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 ink_s5_phase4_trap_shield_rewards_v1_session_id_offer_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase4_trap_shield_rewards_v1_session_id_offer_id_fkey FOREIGN KEY (session_id, offer_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 ink_s5_phase4_trap_shield_rewards_v1_session_id_right_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase4_trap_shield_rewards_v1_session_id_right_id_fkey FOREIGN KEY (session_id, right_id) REFERENCES ink_product_engine.ink_rights_v1(session_id, right_id);


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 ink_s5_phase4_trap_shield_rewards_v1_session_id_trap_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1
    ADD CONSTRAINT ink_s5_phase4_trap_shield_rewards_v1_session_id_trap_id_fkey FOREIGN KEY (session_id, trap_id) REFERENCES ink_product_engine.ink_s4_traps_v1(session_id, trap_id);


--
-- Name: ink_s5_roulette_child_v1 ink_s5_roulette_child_v1_session_id_parent_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_child_v1
    ADD CONSTRAINT ink_s5_roulette_child_v1_session_id_parent_receipt_id_fkey FOREIGN KEY (session_id, parent_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_roulette_child_v1 ink_s5_roulette_child_v1_session_id_right_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_child_v1
    ADD CONSTRAINT ink_s5_roulette_child_v1_session_id_right_id_fkey FOREIGN KEY (session_id, right_id) REFERENCES ink_product_engine.ink_rights_v1(session_id, right_id);


--
-- Name: ink_s5_roulette_supply_v1 ink_s5_roulette_supply_v1_session_id_participant_id_owner__fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_supply_v1
    ADD CONSTRAINT ink_s5_roulette_supply_v1_session_id_participant_id_owner__fkey FOREIGN KEY (session_id, participant_id, owner_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch);


--
-- Name: ink_s5_roulette_supply_v1 ink_s5_roulette_supply_v1_session_id_participant_id_owner_fkey1; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_supply_v1
    ADD CONSTRAINT ink_s5_roulette_supply_v1_session_id_participant_id_owner_fkey1 FOREIGN KEY (session_id, participant_id, owner_epoch, applied_grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, owner_participant_id, owner_epoch, grant_id);


--
-- Name: ink_s5_roulette_supply_v1 ink_s5_roulette_supply_v1_session_id_source_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_roulette_supply_v1
    ADD CONSTRAINT ink_s5_roulette_supply_v1_session_id_source_receipt_id_fkey FOREIGN KEY (session_id, source_receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_s5_search_documents_v1 ink_s5_search_documents_v1_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_s5_search_documents_v1
    ADD CONSTRAINT ink_s5_search_documents_v1_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES ink_product.wiki_documents(snapshot_id);


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_session_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_session_id_fkey FOREIGN KEY (session_id) REFERENCES ink_product_engine.ink_s3_sessions_v1(session_id) ON DELETE RESTRICT;


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_session_id_receipt_id_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_session_id_receipt_id_fkey FOREIGN KEY (session_id, receipt_id) REFERENCES ink_product_engine.ink_receipts_v1(session_id, receipt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_session_id_recipient_participant_id__fkey1; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_session_id_recipient_participant_id__fkey1 FOREIGN KEY (session_id, recipient_participant_id, recipient_epoch, grant_id) REFERENCES ink_product_engine.ink_grants_v1(session_id, owner_participant_id, owner_epoch, grant_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ink_supply_rounds_v1 ink_supply_rounds_v1_session_id_recipient_participant_id_r_fkey; Type: FK CONSTRAINT; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ONLY ink_product_engine.ink_supply_rounds_v1
    ADD CONSTRAINT ink_supply_rounds_v1_session_id_recipient_participant_id_r_fkey FOREIGN KEY (session_id, recipient_participant_id, recipient_epoch) REFERENCES ink_product_engine.ink_members_v1(session_id, participant_id, owner_epoch) ON DELETE RESTRICT;


--
-- Name: achievement_outbox_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.achievement_outbox_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_policy_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.entry_policy_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: finished_move_archive_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.finished_move_archive_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: group_lifecycle_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.group_lifecycle_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: match_receipts; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.match_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: members; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.members ENABLE ROW LEVEL SECURITY;

--
-- Name: achievement_outbox_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.achievement_outbox_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: entry_policy_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.entry_policy_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: finished_move_archive_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.finished_move_archive_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: group_lifecycle_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.group_lifecycle_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: match_receipts owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.match_receipts TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: members owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.members TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: policies owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.policies TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: receipt_retention_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.receipt_retention_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: result_projection_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.result_projection_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: results owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.results TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: room_receipts owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.room_receipts TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: rooms owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.rooms TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: s5_phase1_policies_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.s5_phase1_policies_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: s5_phase2_policies_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.s5_phase2_policies_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: s5_phase3_policies_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.s5_phase3_policies_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: s5_phase4_policies_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.s5_phase4_policies_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: s5_phase5_policies_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.s5_phase5_policies_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: wiki_course_pages owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.wiki_course_pages TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: wiki_documents owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.wiki_documents TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: wiki_links owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.wiki_links TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: wiki_snapshots owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.wiki_snapshots TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: worker_health_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.worker_health_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: worker_schedule_v1 owner_access; Type: POLICY; Schema: ink_product; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product.worker_schedule_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: policies; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.policies ENABLE ROW LEVEL SECURITY;

--
-- Name: receipt_retention_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.receipt_retention_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: result_projection_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.result_projection_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: results; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.results ENABLE ROW LEVEL SECURITY;

--
-- Name: room_receipts; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.room_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: s5_phase1_policies_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.s5_phase1_policies_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: s5_phase2_policies_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.s5_phase2_policies_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: s5_phase3_policies_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.s5_phase3_policies_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: s5_phase4_policies_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.s5_phase4_policies_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: s5_phase5_policies_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.s5_phase5_policies_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_course_pages; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.wiki_course_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_documents; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.wiki_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_links; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.wiki_links ENABLE ROW LEVEL SECURITY;

--
-- Name: wiki_snapshots; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.wiki_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_health_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.worker_health_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_schedule_v1; Type: ROW SECURITY; Schema: ink_product; Owner: ink_product_owner
--

ALTER TABLE ink_product.worker_schedule_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_attack_roots_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_attack_roots_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_bookmark_rights_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_bookmark_rights_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_consumptions_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_consumptions_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_effects_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_effects_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_moves_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_moves_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_receipts_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_receipts_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s3_presence_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_s3_presence_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s3_sessions_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_s3_sessions_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s5_lost_link_frames_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_s5_lost_link_frames_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s5_modifier_uses_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_s5_modifier_uses_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s5_modifiers_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_s5_modifiers_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_supply_rounds_v1 engine_append; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_append ON ink_product_engine.ink_supply_rounds_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_attack_children_v1 engine_insert; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_insert ON ink_product_engine.ink_attack_children_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_grants_v1 engine_insert; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_insert ON ink_product_engine.ink_grants_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_members_v1 engine_insert; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_insert ON ink_product_engine.ink_members_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_rights_v1 engine_insert; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_insert ON ink_product_engine.ink_rights_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s4_effects_v1 engine_insert; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_insert ON ink_product_engine.ink_s4_effects_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s4_traps_v1 engine_insert; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_insert ON ink_product_engine.ink_s4_traps_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_sessions_v1 engine_insert; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_insert ON ink_product_engine.ink_sessions_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_s5_navigation_windows_v1 engine_open; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_open ON ink_product_engine.ink_s5_navigation_windows_v1 FOR INSERT TO ink_product_owner WITH CHECK (true);


--
-- Name: ink_attack_children_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_attack_children_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_attack_roots_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_attack_roots_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_bookmark_rights_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_bookmark_rights_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_consumptions_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_consumptions_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_effects_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_effects_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_grants_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_grants_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_members_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_members_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_moves_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_moves_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_receipts_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_receipts_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_rights_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_rights_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s3_presence_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_s3_presence_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s3_sessions_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_s3_sessions_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s4_effects_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_s4_effects_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s4_traps_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_s4_traps_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s5_lost_link_frames_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_s5_lost_link_frames_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s5_navigation_windows_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_s5_navigation_windows_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s5_search_documents_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_s5_search_documents_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_sessions_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_sessions_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_supply_rounds_v1 engine_read; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_read ON ink_product_engine.ink_supply_rounds_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s5_search_documents_v1 engine_seed; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_seed ON ink_product_engine.ink_s5_search_documents_v1 FOR INSERT TO ink_product_owner WITH CHECK ((EXISTS ( SELECT
   FROM ink_product.wiki_documents d
  WHERE ((d.snapshot_id = ink_s5_search_documents_v1.snapshot_id) AND (d.document_digest = ink_s5_search_documents_v1.document_hash)))));


--
-- Name: ink_s5_modifier_uses_v1 engine_select; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_select ON ink_product_engine.ink_s5_modifier_uses_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_s5_modifiers_v1 engine_select; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_select ON ink_product_engine.ink_s5_modifiers_v1 FOR SELECT TO ink_product_owner USING (true);


--
-- Name: ink_attack_children_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_attack_children_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_bookmark_rights_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_bookmark_rights_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_grants_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_grants_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_members_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_members_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_rights_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_rights_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s3_presence_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_s3_presence_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s4_effects_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_s4_effects_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s4_traps_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_s4_traps_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_sessions_v1 engine_update; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_update ON ink_product_engine.ink_sessions_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_navigation_windows_v1 engine_use; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY engine_use ON ink_product_engine.ink_s5_navigation_windows_v1 FOR UPDATE TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_attack_children_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_attack_children_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_attack_roots_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_attack_roots_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_bookmark_rights_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_bookmark_rights_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_consumptions_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_consumptions_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_effects_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_effects_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_grants_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_grants_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_members_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_members_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_moves_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_moves_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_receipts_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_receipts_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_rights_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_rights_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s3_presence_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s3_presence_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s3_sessions_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s3_sessions_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s4_effects_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s4_effects_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s4_traps_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s4_traps_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_joker_candidates_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_joker_candidates_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_lost_link_frames_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_lost_link_frames_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_modifier_units_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_modifier_units_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_modifier_uses_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_modifier_uses_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_modifiers_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_modifiers_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_navigation_windows_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_navigation_windows_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_phase1_auto_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_phase1_auto_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_phase1_thunder_chains_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_phase1_thunder_chains_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_phase2_rewards_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_phase2_rewards_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_phase2_search_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_phase2_search_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_phase3_shield_rewards_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_phase3_shield_rewards_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_phase4_trap_shield_rewards_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_roulette_child_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_roulette_child_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_roulette_supply_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_roulette_supply_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_search_documents_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_s5_search_documents_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_sessions_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_sessions_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_supply_rounds_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.ink_supply_rounds_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: ink_s5_modifier_units_v1 modifier_unit_owner; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY modifier_unit_owner ON ink_product_engine.ink_s5_modifier_units_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_joker_candidates_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_joker_candidates_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_phase1_auto_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_phase1_auto_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_phase1_thunder_chains_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_phase1_thunder_chains_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_phase2_rewards_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_phase2_rewards_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_phase2_search_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_phase2_search_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_phase3_shield_rewards_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_phase3_shield_rewards_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_roulette_child_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_roulette_child_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_s5_roulette_supply_v1 owner_access; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY owner_access ON ink_product_engine.ink_s5_roulette_supply_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: ink_attack_children_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_attack_children_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_attack_roots_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_attack_roots_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_bookmark_rights_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_bookmark_rights_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_consumptions_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_consumptions_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_effects_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_effects_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_grants_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_grants_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_moves_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_moves_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_receipts_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_receipts_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_rights_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_rights_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s3_presence_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s3_presence_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s3_sessions_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s3_sessions_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s4_effects_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s4_effects_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s4_traps_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s4_traps_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_joker_candidates_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_joker_candidates_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_lost_link_frames_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_lost_link_frames_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_modifier_units_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_modifier_units_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_modifier_uses_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_modifier_uses_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_modifiers_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_modifiers_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_navigation_windows_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_navigation_windows_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_phase1_auto_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_phase1_auto_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_phase1_thunder_chains_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_phase1_thunder_chains_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_phase2_rewards_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_phase2_rewards_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_phase2_search_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_phase2_search_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_phase3_shield_rewards_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_phase3_shield_rewards_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_phase4_trap_shield_rewards_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_phase4_trap_shield_rewards_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_roulette_child_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_roulette_child_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_s5_roulette_supply_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_s5_roulette_supply_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: ink_supply_rounds_v1 s5_retention_delete_v1; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY s5_retention_delete_v1 ON ink_product_engine.ink_supply_rounds_v1 FOR DELETE TO ink_product_owner USING (ink_product.retention_eligible_v1(session_id));


--
-- Name: s5_transition_control_v1; Type: ROW SECURITY; Schema: ink_product_engine; Owner: ink_product_owner
--

ALTER TABLE ink_product_engine.s5_transition_control_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: s5_transition_control_v1 transition_control_owner; Type: POLICY; Schema: ink_product_engine; Owner: ink_product_owner
--

CREATE POLICY transition_control_owner ON ink_product_engine.s5_transition_control_v1 TO ink_product_owner USING (true) WITH CHECK (true);


--
-- Name: SCHEMA ink_product; Type: ACL; Schema: -; Owner: ink_product_owner
--

GRANT USAGE ON SCHEMA ink_product TO wiki_s5_worker;


--
-- Name: FUNCTION admission_order_v1(); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.admission_order_v1() FROM PUBLIC;


--
-- Name: FUNCTION advance_due_v1(); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.advance_due_v1() FROM PUBLIC;


--
-- Name: FUNCTION apply_match_command_v1(p_room uuid, p_actor uuid, p_receipt uuid, p_operation text, p_payload jsonb, verified ink_product.wiki_links); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.apply_match_command_v1(p_room uuid, p_actor uuid, p_receipt uuid, p_operation text, p_payload jsonb, verified ink_product.wiki_links) FROM PUBLIC;


--
-- Name: FUNCTION authority_now_v1(p_session uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.authority_now_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION can_read_product_topic(p_topic text); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.can_read_product_topic(p_topic text) FROM PUBLIC;
GRANT ALL ON FUNCTION ink_product.can_read_product_topic(p_topic text) TO authenticated;


--
-- Name: FUNCTION checkpoint_v1(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.checkpoint_v1(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION close_expired_v2(p_session uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.close_expired_v2(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION course_document(p_session uuid, p_page text); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.course_document(p_session uuid, p_page text) FROM PUBLIC;


--
-- Name: FUNCTION course_exits(p_session uuid, p_page text, p_revision text); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.course_exits(p_session uuid, p_page text, p_revision text) FROM PUBLIC;


--
-- Name: FUNCTION course_is_goal(p_session uuid, p_page text, p_revision text); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.course_is_goal(p_session uuid, p_page text, p_revision text) FROM PUBLIC;


--
-- Name: FUNCTION dispatch_now_v1(p_session uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.dispatch_now_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION end_at_v1(p_session uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.end_at_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION finish_if_terminal_v1(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.finish_if_terminal_v1(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION finish_if_terminal_v1_pre_next(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.finish_if_terminal_v1_pre_next(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION fixed_page_v1(value text, to_engine boolean); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.fixed_page_v1(value text, to_engine boolean) FROM PUBLIC;


--
-- Name: FUNCTION fixed_supply_draw_v1(p_session uuid, p_participant uuid, p_round bigint, p_draw bytea); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.fixed_supply_draw_v1(p_session uuid, p_participant uuid, p_round bigint, p_draw bytea) FROM PUBLIC;


--
-- Name: FUNCTION forfeit_match_v1(p_room uuid, p_actor uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.forfeit_match_v1(p_room uuid, p_actor uuid) FROM PUBLIC;


--
-- Name: FUNCTION freeze_reference(); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.freeze_reference() FROM PUBLIC;


--
-- Name: FUNCTION guard_room_update(); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.guard_room_update() FROM PUBLIC;


--
-- Name: FUNCTION has_due_v2(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.has_due_v2(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION invalidate_room(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.invalidate_room(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION is_next_v1(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.is_next_v1(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION lock_verified_link(p_room uuid, p_session uuid, p_actor uuid, p_binding jsonb, p_payload jsonb); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.lock_verified_link(p_room uuid, p_session uuid, p_actor uuid, p_binding jsonb, p_payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION match_scope(r ink_product.rooms, m ink_product.members); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.match_scope(r ink_product.rooms, m ink_product.members) FROM PUBLIC;


--
-- Name: FUNCTION project_result_v1(); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.project_result_v1() FROM PUBLIC;


--
-- Name: FUNCTION publish_wiki_snapshot(p_page text, p_revision text, p_title text, p_wiki_snapshot uuid, p_links jsonb); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.publish_wiki_snapshot(p_page text, p_revision text, p_title text, p_wiki_snapshot uuid, p_links jsonb) FROM PUBLIC;


--
-- Name: FUNCTION purge_receipts_v1(p_limit integer); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.purge_receipts_v1(p_limit integer) FROM PUBLIC;


--
-- Name: FUNCTION read_match_state_v1(p_room uuid, p_actor uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.read_match_state_v1(p_room uuid, p_actor uuid) FROM PUBLIC;


--
-- Name: FUNCTION read_match_state_v1_grant(p_room uuid, p_actor uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.read_match_state_v1_grant(p_room uuid, p_actor uuid) FROM PUBLIC;


--
-- Name: FUNCTION read_match_state_v1_legacy(p_room uuid, p_actor uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.read_match_state_v1_legacy(p_room uuid, p_actor uuid) FROM PUBLIC;


--
-- Name: FUNCTION retention_eligible_v1(p_session uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.retention_eligible_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION room_version_changed(); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.room_version_changed() FROM PUBLIC;


--
-- Name: FUNCTION run_due_batch_v1(p_worker uuid, p_limit integer); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.run_due_batch_v1(p_worker uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ink_product.run_due_batch_v1(p_worker uuid, p_limit integer) TO wiki_s5_worker;


--
-- Name: FUNCTION start_match_v1(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.start_match_v1(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION start_match_v1_pre_next(p_room uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.start_match_v1_pre_next(p_room uuid) FROM PUBLIC;


--
-- Name: FUNCTION worker_healthcheck_v1(p_worker uuid); Type: ACL; Schema: ink_product; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product.worker_healthcheck_v1(p_worker uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ink_product.worker_healthcheck_v1(p_worker uuid) TO wiki_s5_worker;


--
-- Name: FUNCTION get_group_item_s4_state_v1(p_session uuid, p_binding jsonb, p_since bigint); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.get_group_item_s4_state_v1(p_session uuid, p_binding jsonb, p_since bigint) FROM PUBLIC;


--
-- Name: FUNCTION ink_s2_next_event_v1(p_session uuid, p_participant uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s2_next_event_v1(p_session uuid, p_participant uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s2_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s2_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_fixture_id_v1(p_session uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_fixture_id_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_enabled_v1(p_session uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_enabled_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_enabled_v1(p_session uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_enabled_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s2_spend_grant_v1(p_grant ink_product_engine.ink_grants_v1, p_at timestamp with time zone, p_receipt uuid, p_root uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s2_spend_grant_v1(p_grant ink_product_engine.ink_grants_v1, p_at timestamp with time zone, p_receipt uuid, p_root uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s2_spend_right_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s2_spend_right_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_assert_supply_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_assert_supply_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_binding_v1(); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_binding_v1() FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_direct_link_v1(p_from text, p_to text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_direct_link_v1(p_from text, p_to text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_due_round_v1(p_started timestamp with time zone, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_due_round_v1(p_started timestamp with time zone, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_install_bookmark_v1(p_session uuid, p_grant uuid, p_expected_inventory bigint, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_install_bookmark_v1(p_session uuid, p_grant uuid, p_expected_inventory bigint, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_lock_v1(p_session uuid, p_authority_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_lock_v1(p_session uuid, p_authority_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_move_v1(p_session uuid, p_operation text, p_target_page text, p_right uuid, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_move_v1(p_session uuid, p_operation text, p_target_page text, p_right uuid, p_expected_progress bigint, p_authority_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_pool_digest_v1(); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_pool_digest_v1() FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_record_v1(p_session uuid, p_receipt uuid, p_scope text, p_actor uuid, p_request uuid, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_reply jsonb); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_record_v1(p_session uuid, p_receipt uuid, p_scope text, p_actor uuid, p_request uuid, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_reply jsonb) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_supply_latest_v1(p_session uuid, p_recipient uuid, p_authority_at timestamp with time zone, p_through_round bigint, p_eligible_rounds bigint[], p_draw_round bigint, p_item text, p_pool_digest bytea, p_draw_commitment bytea, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_supply_latest_v1(p_session uuid, p_recipient uuid, p_authority_at timestamp with time zone, p_through_round bigint, p_eligible_rounds bigint[], p_draw_round bigint, p_item text, p_pool_digest bytea, p_draw_commitment bytea, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s3_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s3_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_apply_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_apply_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_apply_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_apply_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_apply_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_apply_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_attack_defense_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_attack_defense_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_censored_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_censored_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_client_binding_v1(); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_client_binding_v1() FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_dispatch_v1(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_dispatch_v1(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_dispatch_v1_grant(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_dispatch_v1_grant(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_dispatch_v1_legacy(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_dispatch_v1_legacy(p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_expire_traps_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_expire_traps_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_matches_v1(p_session ink_product_engine.ink_sessions_v1); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_matches_v1(p_session ink_product_engine.ink_sessions_v1) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_rank_censor_exits_v1(p_exits text[], p_child uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_rank_censor_exits_v1(p_exits text[], p_child uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_resolve_censor_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_resolve_censor_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_resolve_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_trap_arrival_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_trap_arrival_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_trap_choices_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target uuid, p_grant uuid, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_trap_choices_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target uuid, p_grant uuid, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_trap_hit_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_trap_hit_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s4_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s4_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_apply_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_apply_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_apply_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_apply_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_apply_v1_grant(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_apply_v1_grant(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_apply_v1_legacy(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_apply_v1_legacy(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_assign_modifier_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_count integer, p_grants uuid[], p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_assign_modifier_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_count integer, p_grants uuid[], p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_attack_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_attack_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_attack_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_attack_v1_grant(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_attack_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_attack_v1_legacy(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_bind_pending_v2(); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_bind_pending_v2() FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_close_modifier_units_v2(); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_close_modifier_units_v2() FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_close_thunder_v1(p_session uuid, p_effect ink_product_engine.ink_s4_effects_v1, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_close_thunder_v1(p_session uuid, p_effect ink_product_engine.ink_s4_effects_v1, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_debit_modifiers_v1(p_session uuid, p_receipt uuid, p_rights uuid[]); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_debit_modifiers_v1(p_session uuid, p_receipt uuid, p_rights uuid[]) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_defense_bonus_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_at timestamp with time zone, p_receipt uuid, p_domain text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_defense_bonus_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_at timestamp with time zone, p_receipt uuid, p_domain text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_deliver_candidates_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_chosen uuid[], p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_deliver_candidates_v1(p_member ink_product_engine.ink_members_v1, p_offer uuid, p_chosen uuid[], p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_draw_v1(p_session uuid, p_receipt uuid, p_domain text, p_bound integer); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_draw_v1(p_session uuid, p_receipt uuid, p_domain text, p_bound integer) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_enhancement_v2(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_payload jsonb, p_tier text, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_enhancement_v2(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_payload jsonb, p_tier text, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_force_move_v1(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_force_move_v1(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_force_step_v2(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid, p_step smallint); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_force_step_v2(p_member ink_product_engine.ink_members_v1, p_page text, p_operation text, p_count integer, p_at timestamp with time zone, p_receipt uuid, p_step smallint) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_grant_modifiers_v2(p_session uuid, p_grant uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_grant_modifiers_v2(p_session uuid, p_grant uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_grant_tier_v2(p_session uuid, p_grant uuid, p_base text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_grant_tier_v2(p_session uuid, p_grant uuid, p_base text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_install_modifier_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_install_modifier_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_is_sealed_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_is_sealed_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_joker_free_slots_v1(p_member ink_product_engine.ink_members_v1); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_joker_free_slots_v1(p_member ink_product_engine.ink_members_v1) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_joker_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_joker_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_joker_state_v1_pre_phase2(p_session uuid, p_member ink_product_engine.ink_members_v1); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_joker_state_v1_pre_phase2(p_session uuid, p_member ink_product_engine.ink_members_v1) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_joker_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_joker_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_lost_link_candidates_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_lost_link_candidates_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_lost_link_plan_v2(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid, p_enhanced boolean, p_test_partial boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_lost_link_plan_v2(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone, p_receipt uuid, p_enhanced boolean, p_test_partial boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_modifier_eligible_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_excluded uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_modifier_eligible_v2(p_member ink_product_engine.ink_members_v1, p_kind text, p_excluded uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_modifier_id_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_modifier_id_v1(p_member ink_product_engine.ink_members_v1, p_kind text, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_modifier_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_modifier_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_modifier_state_v1_grant(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_modifier_state_v1_grant(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_modifier_state_v1_legacy(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_modifier_state_v1_legacy(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_navigation_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_navigation_state_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_navigation_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_parry_block_v1(p_session uuid, p_child ink_product_engine.ink_attack_children_v1, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_parry_block_v1(p_session uuid, p_child ink_product_engine.ink_attack_children_v1, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_auto_candidates_v1(p_member ink_product_engine.ink_members_v1, p_parent uuid, p_ordinal integer, p_excluded text[], p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_auto_candidates_v1(p_member ink_product_engine.ink_members_v1, p_parent uuid, p_ordinal integer, p_excluded text[], p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_auto_dispatch_v1(p_parent_at timestamp with time zone, p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_auto_dispatch_v1(p_parent_at timestamp with time zone, p_session uuid, p_request uuid, p_binding jsonb, p_scope text, p_actor uuid, p_operation text, p_payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_auto_execute_v1(p_member ink_product_engine.ink_members_v1, p_item text, p_target uuid, p_parent uuid, p_ordinal integer, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_auto_execute_v1(p_member ink_product_engine.ink_members_v1, p_item text, p_target uuid, p_parent uuid, p_ordinal integer, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_enabled_v1(p_session uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_enabled_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_reward_after_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean, p_excluded text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_reward_after_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean, p_excluded text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_reward_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_reward_v1(p_session uuid, p_receipt uuid, p_ordinal integer, p_weakened boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_roulette_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_roulette_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_thief_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_thief_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_target ink_product_engine.ink_members_v1, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text, p_apply boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase1_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase1_thunder_v1(p_member ink_product_engine.ink_members_v1, p_tier text, p_self boolean, p_at timestamp with time zone, p_receipt uuid, p_child uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_deliver_v1(p_member ink_product_engine.ink_members_v1, p_limit integer, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_deliver_v1(p_member ink_product_engine.ink_members_v1, p_limit integer, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_due_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_due_v1(p_session uuid, p_started timestamp with time zone, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_expire_rewards_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_terminal boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_expire_rewards_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_terminal boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_offer_trigger_v1(); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_offer_trigger_v1() FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_reward_head_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_reward_head_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_reward_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_reward_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_search_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_search_state_v1(p_member ink_product_engine.ink_members_v1, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_search_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_search_v1(p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_tick_v1(p_session uuid, p_at timestamp with time zone, p_receipt uuid, p_initial boolean) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase2_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase2_trap_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_operation text, p_payload jsonb, p_at timestamp with time zone, p_receipt uuid, p_tier text) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase3_enabled_v1(p_session uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase3_enabled_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase3_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase3_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase4_enabled_v1(p_session uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase4_enabled_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_phase4_trap_shield_bonus_v1(p_session uuid, p_right uuid, p_trap uuid, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_phase4_trap_shield_bonus_v1(p_session uuid, p_right uuid, p_trap uuid, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_resolve_attack_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_resolve_attack_v1(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_resolve_attack_v1_grant(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_resolve_attack_v1_grant(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_resolve_attack_v1_legacy(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_resolve_attack_v1_legacy(p_session uuid, p_child uuid, p_at timestamp with time zone, p_reflect boolean, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_roulette_auto_v1(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_roulette_auto_v1(p_member ink_product_engine.ink_members_v1, p_grant uuid, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_roulette_supply_hook_v1(); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_roulette_supply_hook_v1() FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_shield_bonus_v1(p_session uuid, p_right uuid, p_at timestamp with time zone, p_receipt uuid, p_root uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_tier_v1(p_base text, p_enhancement uuid, p_weakening uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_tier_v1(p_base text, p_enhancement uuid, p_weakening uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_trap_sealed_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_trap_sealed_v1(p_session uuid, p_member ink_product_engine.ink_members_v1, p_destination text, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_warning_window_v1(p_session uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_warning_window_v1(p_session uuid) FROM PUBLIC;


--
-- Name: FUNCTION ink_s5_weakening_v2(p_member ink_product_engine.ink_members_v1, p_tier text, p_at timestamp with time zone, p_receipt uuid); Type: ACL; Schema: ink_product_engine; Owner: ink_product_owner
--

REVOKE ALL ON FUNCTION ink_product_engine.ink_s5_weakening_v2(p_member ink_product_engine.ink_members_v1, p_tier text, p_at timestamp with time zone, p_receipt uuid) FROM PUBLIC;


--
-- PostgreSQL database dump complete
--



INSERT INTO ink_product_engine.s5_transition_control_v1 (singleton, new_rooms_enabled, revision)
VALUES (true, false, 0);

-- Clean up signal/emote rows when a retained room is eventually removed.
-- Only the S5 owner, not web callers, can write either published table.
ALTER TABLE ink_product_events.signals_v1
  ADD CONSTRAINT signals_v1_room_fk FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id) ON DELETE CASCADE;
ALTER TABLE ink_product_events.emotes_v1
  ADD CONSTRAINT emotes_v1_room_fk FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id) ON DELETE CASCADE;
ALTER TABLE ink_product_events.emote_limits_v1
  ADD CONSTRAINT emote_limits_v1_room_fk FOREIGN KEY (room_id) REFERENCES ink_product.rooms(id) ON DELETE CASCADE;

-- Kion is presentation-only. Never reuse item actions or client-supplied
-- identities to authenticate a reaction. Spectators may send after finishing.
CREATE FUNCTION public.send_group_items_kion_v1(p_room uuid, p_emote_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $s5_kion_send$
DECLARE
  actor uuid := ink_product.request_actor_v1();
  sender_participant uuid;
  rate_at timestamptz;
  now_at timestamptz := clock_timestamp();
  own_event ink_product_events.emotes_v1;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_emote_id IS NULL OR p_emote_id NOT IN (
    'hello','ready','go','good','wait','hurry','wow','lol','sad','gg'
  ) THEN RETURN jsonb_build_object('accepted',false,'code','EMOTE_INVALID'); END IF;

  SELECT m.participant_id INTO sender_participant
  FROM ink_product.rooms r JOIN ink_product.members m ON m.room_id=r.id
  WHERE r.id=p_room AND r.phase='playing' AND m.actor_id=actor
    AND m.status IN ('playing','finished') AND (
      NOT ink_product.is_next_v1(r.id) OR EXISTS (
        SELECT 1 FROM ink_product_engine.ink_members_v1 e
        WHERE e.session_id=r.session_id AND e.participant_id=m.participant_id AND e.user_id=actor
      )
    ) FOR SHARE OF r, m;
  IF sender_participant IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','SENDER_NOT_ACTIVE'); END IF;

  INSERT INTO ink_product_events.emote_limits_v1 AS limit_row(room_id,sender_id,last_sent_at)
  VALUES (p_room,actor,now_at)
  ON CONFLICT (room_id,sender_id) DO UPDATE SET last_sent_at=EXCLUDED.last_sent_at
  WHERE limit_row.last_sent_at <= EXCLUDED.last_sent_at-interval '3 seconds'
  RETURNING last_sent_at INTO rate_at;
  IF rate_at IS NULL THEN RETURN jsonb_build_object('accepted',false,'code','EMOTE_RATE_LIMIT'); END IF;

  INSERT INTO ink_product_events.emotes_v1(room_id,recipient_id,sender_participant_id,emote_id,sent_at)
  SELECT p_room,m.actor_id,sender_participant,p_emote_id,now_at
  FROM ink_product.members m
  WHERE m.room_id=p_room AND m.status IN ('playing','finished')
  ON CONFLICT (room_id,recipient_id,sender_participant_id) DO UPDATE
    SET id=gen_random_uuid(), emote_id=EXCLUDED.emote_id, sent_at=EXCLUDED.sent_at;

  SELECT * INTO own_event FROM ink_product_events.emotes_v1
  WHERE room_id=p_room AND recipient_id=actor AND sender_participant_id=sender_participant;
  RETURN jsonb_build_object('accepted',true,'code','ACCEPTED','event',to_jsonb(own_event));
END $s5_kion_send$;

CREATE FUNCTION public.get_group_items_kion_v1(p_room uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $s5_kion_read$
DECLARE actor uuid := ink_product.request_actor_v1(); recent jsonb;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM ink_product.members m JOIN ink_product.rooms r ON r.id=m.room_id
    WHERE r.id=p_room AND r.phase='playing' AND m.actor_id=actor
      AND m.status IN ('playing','finished') AND (
        NOT ink_product.is_next_v1(r.id) OR EXISTS (
          SELECT 1 FROM ink_product_engine.ink_members_v1 e
          WHERE e.session_id=r.session_id AND e.participant_id=m.participant_id AND e.user_id=actor
        )
      )
  ) THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.sent_at), '[]'::jsonb) INTO recent
  FROM ink_product_events.emotes_v1 e
  WHERE e.room_id=p_room AND e.recipient_id=actor
    AND e.sent_at >= clock_timestamp()-interval '6 seconds';
  RETURN recent;
END $s5_kion_read$;

-- Return to the migration role for external grants and Realtime policies.
RESET ROLE;
REVOKE REFERENCES ON TABLE public.profiles FROM ink_product_owner;
REVOKE CREATE ON SCHEMA public FROM ink_product_owner;

-- No realtime.messages grants or S5 Broadcast RLS policies are needed. The
-- publication and recipient-selective RLS above are the sole event transport.

-- The eight public RPCs and the JWT helper are now owned by ink_product_owner.
-- Only their owner can reliably set EXECUTE ACLs: the migrator's old GRANT
-- commands emitted no-privilege warnings after each ALTER ... OWNER.
SET LOCAL ROLE ink_product_owner;
REVOKE ALL ON FUNCTION ink_product.request_actor_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb),
  public.get_group_items_product_receipt_v1(uuid,uuid,jsonb,uuid),
  public.get_group_items_product_state_v1(uuid,uuid,jsonb),
  public.get_group_items_product_document_v1(uuid,uuid,jsonb,jsonb),
  public.act_group_items_product_v1(uuid,uuid,jsonb,uuid,text,jsonb),
  public.get_group_items_entry_v1(text),
  public.get_group_items_history_v1(integer),
  public.get_group_items_product_room_v1(uuid,jsonb),
  public.send_group_items_kion_v1(uuid,text),
  public.get_group_items_kion_v1(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb),
  public.get_group_items_product_receipt_v1(uuid,uuid,jsonb,uuid),
  public.get_group_items_product_state_v1(uuid,uuid,jsonb),
  public.get_group_items_product_document_v1(uuid,uuid,jsonb,jsonb),
  public.act_group_items_product_v1(uuid,uuid,jsonb,uuid,text,jsonb),
  public.get_group_items_entry_v1(text),
  public.get_group_items_history_v1(integer),
  public.get_group_items_product_room_v1(uuid,jsonb),
  public.send_group_items_kion_v1(uuid,text),
  public.get_group_items_kion_v1(uuid)
TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA ink_product, ink_product_engine FROM PUBLIC, anon, authenticated, service_role;
RESET ROLE;
-- Remove the entire temporary membership *from this grantor*. Revoking only
-- SET leaves an unwanted INHERIT row, while omitting GRANTED BY might touch
-- the independent bootstrap ADMIN membership installed by supabase_admin.
DO $owner_membership_cleanup$
BEGIN
  IF current_setting('wiki_s5_migration.temporary_owner_set', true) = 'yes' THEN
    EXECUTE format('REVOKE ink_product_owner FROM %I GRANTED BY CURRENT_USER', current_user);
    IF EXISTS (
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles owner_role ON owner_role.oid=m.roleid
      JOIN pg_roles member_role ON member_role.oid=m.member
      WHERE owner_role.rolname='ink_product_owner'
        AND member_role.rolname=current_user
        AND m.grantor=(SELECT oid FROM pg_roles WHERE rolname=current_user)
    ) THEN
      RAISE EXCEPTION 'S5_MIGRATION_OWNER_MEMBERSHIP_NOT_RESTORED';
    END IF;
  END IF;
END $owner_membership_cleanup$;
NOTIFY pgrst, 'reload schema';
COMMIT;
