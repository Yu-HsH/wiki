-- This migration leaves both public entry and all schedules inactive.
CREATE TABLE duel_v4.public_entry_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE duel_v4.public_entry_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON duel_v4.public_entry_v1 FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO duel_v4.public_entry_v1 DEFAULT VALUES;

CREATE FUNCTION private.is_item_mode_member_v1(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT FROM auth.users u JOIN public.profiles p ON p.id = u.id
    WHERE u.id = p_actor AND NOT u.is_anonymous
  )
$$;
REVOKE ALL ON FUNCTION private.is_item_mode_member_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION duel_v4.can_enter(actor uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT FROM duel_v4.admission a WHERE a.user_id = actor AND a.expires_at > now()
  ) OR (
    EXISTS (SELECT FROM duel_v4.public_entry_v1 WHERE singleton AND enabled)
    AND EXISTS (SELECT FROM private.pr63_drain_gate WHERE singleton AND entry_open)
    AND private.is_item_mode_member_v1(actor)
  )
$$;

CREATE TABLE private.v4_kion_cleanup_runs_v1 (
  completed_at timestamptz PRIMARY KEY,
  deleted_rows integer,
  error_state text,
  CHECK ((deleted_rows IS NULL) <> (error_state IS NULL)),
  CHECK (deleted_rows BETWEEN 0 AND 2000),
  CHECK (error_state ~ '^[0-9A-Z]{5}$')
);
ALTER TABLE private.v4_kion_cleanup_runs_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.v4_kion_cleanup_runs_v1 FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.purge_terminal_v4_kion_requests_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cutoff timestamptz := statement_timestamp() - interval '30 days';
  deleted integer;
  failure text;
BEGIN
  BEGIN
    WITH batch AS (
      SELECT q.room_id, q.sender_id, q.request_id
      FROM duel_v4.kion_requests q JOIN duel_v4.rooms r ON r.id = q.room_id
      WHERE r.finished_at <= cutoff
      ORDER BY r.finished_at, q.room_id, q.sender_id, q.request_id
      LIMIT 2000 FOR UPDATE OF q SKIP LOCKED
    )
    DELETE FROM duel_v4.kion_requests q USING batch b
    WHERE (q.room_id, q.sender_id, q.request_id) = (b.room_id, b.sender_id, b.request_id);
    GET DIAGNOSTICS deleted = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS failure = RETURNED_SQLSTATE;
    RAISE WARNING 'V4_KION_RETENTION_FAILED [%]', failure;
  END;
  INSERT INTO private.v4_kion_cleanup_runs_v1 VALUES (NEW.last_completed_at, deleted, failure);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'V4_KION_RETENTION_LOG_FAILED [%]', SQLSTATE;
  RETURN NULL;
END
$$;

-- Use the role grant pattern from migration 67 and restore it on completion.
CREATE TEMP TABLE _launch_owner_restore ON COMMIT DROP AS
SELECT inherit_option, set_option FROM pg_auth_members
WHERE roleid = 'ink_product_owner'::regrole AND member = 'postgres'::regrole
  AND grantor = 'postgres'::regrole;
GRANT ink_product_owner TO postgres WITH INHERIT TRUE;
GRANT ink_product_owner TO postgres WITH SET TRUE;

-- The guard runs only for the Production binding and new waiting memberships.
-- Review admission and the shared drain fence keep their original behavior.
CREATE FUNCTION ink_product.require_public_member_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'waiting' AND OLD.room_id = NEW.room_id
    AND OLD.actor_id = NEW.actor_id THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT FROM ink_product.rooms r
    JOIN ink_product.entry_policy_v1 e ON e.binding = r.binding
    WHERE r.id = NEW.room_id AND e.channel = 'production'
  ) AND NOT private.is_item_mode_member_v1(NEW.actor_id) THEN
    RAISE insufficient_privilege USING MESSAGE = 'S5_MEMBER_REQUIRED';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION ink_product.require_public_member_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER s5_require_public_member_v1
BEFORE INSERT OR UPDATE OF status, room_id, actor_id ON ink_product.members
FOR EACH ROW WHEN (NEW.status = 'waiting')
EXECUTE FUNCTION ink_product.require_public_member_v1();

SET LOCAL ROLE ink_product_owner;

CREATE TABLE ink_product.lobby_kion_cleanup_runs_v1 (
  completed_at timestamptz PRIMARY KEY,
  deleted_rows integer,
  error_state text,
  CHECK ((deleted_rows IS NULL) <> (error_state IS NULL)),
  CHECK (deleted_rows BETWEEN 0 AND 2000),
  CHECK (error_state ~ '^[0-9A-Z]{5}$')
);
ALTER TABLE ink_product.lobby_kion_cleanup_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ink_product.lobby_kion_cleanup_runs_v1 FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON ink_product.lobby_kion_cleanup_runs_v1 TO ink_product_owner
  USING (true) WITH CHECK (true);
REVOKE ALL ON ink_product.lobby_kion_cleanup_runs_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON ink_product.lobby_kion_cleanup_runs_v1 TO postgres;
CREATE POLICY operator_read ON ink_product.lobby_kion_cleanup_runs_v1 FOR SELECT TO postgres USING (true);

CREATE OR REPLACE FUNCTION ink_product.purge_terminal_lobby_kion_requests_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cutoff timestamptz := statement_timestamp() - interval '30 days';
  deleted integer;
  failure text;
BEGIN
  BEGIN
    WITH batch AS (
      SELECT q.room_id, q.sender_id, q.request_id
      FROM ink_product_events.lobby_kion_requests_v1 q
      JOIN ink_product.rooms r ON r.id = q.room_id
      JOIN ink_product.group_lifecycle_v1 l ON l.room_id = r.id
      WHERE r.phase = 'finished' AND l.closed_at <= cutoff
      ORDER BY l.closed_at, q.room_id, q.sender_id, q.request_id
      LIMIT 2000 FOR UPDATE OF q SKIP LOCKED
    )
    DELETE FROM ink_product_events.lobby_kion_requests_v1 q USING batch b
    WHERE (q.room_id, q.sender_id, q.request_id) = (b.room_id, b.sender_id, b.request_id);
    GET DIAGNOSTICS deleted = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS failure = RETURNED_SQLSTATE;
    RAISE WARNING 'S5_KION_RETENTION_FAILED [%]', failure;
  END;
  INSERT INTO ink_product.lobby_kion_cleanup_runs_v1 VALUES (NEW.last_completed_at, deleted, failure);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'S5_KION_RETENTION_LOG_FAILED [%]', SQLSTATE;
  RETURN NULL;
END
$$;

-- postgres is the pg_cron job principal. No browser-facing grant or credentials.
GRANT EXECUTE ON FUNCTION ink_product.run_maintenance_v1(text, uuid, integer) TO postgres;

RESET ROLE;
DO $$
DECLARE before_grant record;
BEGIN
  SELECT * INTO before_grant FROM pg_temp._launch_owner_restore;
  IF FOUND THEN
    EXECUTE format('GRANT ink_product_owner TO postgres WITH INHERIT %s', before_grant.inherit_option);
    EXECUTE format('GRANT ink_product_owner TO postgres WITH SET %s', before_grant.set_option);
  ELSE
    REVOKE ink_product_owner FROM postgres GRANTED BY CURRENT_USER;
  END IF;
END
$$;
