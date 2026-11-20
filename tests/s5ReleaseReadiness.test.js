import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20261120024414_group_items_s5.sql");
const app = source("App.jsx");
const play = source("pages/PlayPage.jsx");
const route = source("components/group-items-jungle/ProductGroupItemsRoute.jsx");

test("S5 migration borrows PostgreSQL 17 SET ROLE only for unmerged migration ownership", () => {
  assert.match(migration, /pg_has_role\(current_user, 'ink_product_owner', 'SET'\)/);
  assert.match(migration, /GRANT ink_product_owner TO %I WITH INHERIT FALSE/);
  assert.match(migration, /GRANT ink_product_owner TO %I WITH SET TRUE/);
  assert.match(migration, /set_config\('wiki_s5_migration\.temporary_owner_set', 'yes', true\)/);
  assert.match(migration, /REVOKE ink_product_owner FROM %I GRANTED BY CURRENT_USER/);
  assert.match(migration, /S5_MIGRATION_OWNER_MEMBERSHIP_NOT_RESTORED/);
  assert.ok(migration.indexOf("DO $owner_membership_cleanup$") > migration.lastIndexOf("ALTER FUNCTION"),
    "owner SET privilege must be cleaned up after object ownership changes");
  assert.match(migration, /REVOKE ALL ON FUNCTION ink_product\.advance_due_room_v1\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
});

test("S5 PostgreSQL 17 runs owner-only DDL and final RPC ACLs under the correct role", () => {
  const schemasOwned = migration.indexOf("ALTER SCHEMA ink_product_engine OWNER TO ink_product_owner");
  const referenceGrant = migration.indexOf("GRANT REFERENCES ON TABLE public.profiles TO ink_product_owner");
  const beginOwnerDdl = migration.indexOf("SET LOCAL ROLE ink_product_owner", schemasOwned);
  const firstOwnerFunction = migration.indexOf("CREATE FUNCTION ink_product.admission_order_v1");
  const endOwnerDdl = migration.indexOf("RESET ROLE", firstOwnerFunction);
  const referenceRevoke = migration.indexOf("REVOKE REFERENCES ON TABLE public.profiles FROM ink_product_owner");
  const beginOwnerAcl = migration.indexOf("SET LOCAL ROLE ink_product_owner", referenceRevoke);
  const grantPublicRpc = migration.indexOf("TO authenticated;", beginOwnerAcl);
  const endOwnerAcl = migration.indexOf("RESET ROLE", grantPublicRpc);
  const membershipCleanup = migration.indexOf("DO $owner_membership_cleanup$");
  assert.ok(schemasOwned < referenceGrant && referenceGrant < beginOwnerDdl &&
    beginOwnerDdl < firstOwnerFunction && firstOwnerFunction < endOwnerDdl &&
    endOwnerDdl < referenceRevoke && referenceRevoke < beginOwnerAcl &&
    beginOwnerAcl < grantPublicRpc && grantPublicRpc < endOwnerAcl && endOwnerAcl < membershipCleanup);
  assert.match(migration, /REVOKE ALL ON FUNCTION ink_product\.request_actor_v1\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration.slice(beginOwnerAcl, endOwnerAcl), /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;[\s\S]*?GRANT EXECUTE ON FUNCTION[\s\S]*?public\.get_group_items_entry_v1\(text\)[\s\S]*?TO authenticated;/);
  assert.doesNotMatch(migration.slice(0, schemasOwned), /GRANT EXECUTE ON FUNCTION get_group_items_entry_v1\(text\) TO authenticated/);
});

test("S5 reads authenticated JWT claims without the inaccessible managed Auth schema", () => {
  assert.match(migration, /CREATE FUNCTION ink_product\.request_actor_v1\(\) RETURNS uuid[\s\S]*?request\.jwt\.claim\.sub/);
  assert.match(migration, /request\.jwt\.claims/);
  assert.match(migration, /ALTER FUNCTION ink_product\.request_actor_v1\(\) OWNER TO ink_product_owner/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ink_product\.request_actor_v1\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(migration.replace(/^\s*--.*$/gm, ""), /auth\.uid\(\)/);
  assert.doesNotMatch(migration, /GRANT USAGE ON SCHEMA auth/);
  assert.match(migration, /IF ink_product\.request_actor_v1\(\) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'/);
});

test("S5 active-player reads wake only their own due room after member authorization", () => {
  const start = migration.indexOf("CREATE FUNCTION public.get_group_items_product_state_v1");
  const end = migration.indexOf("ALTER FUNCTION get_group_items_product_state_v1", start);
  const state = migration.slice(start, end);
  const auth = state.indexOf("m.actor_id IS NULL");
  const firstRead = state.indexOf("ink_product.read_match_state_v1");
  const settle = state.indexOf("ink_product.advance_due_room_v1(r.id)");
  assert.ok(auth !== -1 && firstRead > auth && settle > firstRead);
  assert.match(state, /IF r\.phase='finished' OR m\.status IN \('finished','left'\)/);
  const worker = migration.slice(migration.indexOf("CREATE FUNCTION ink_product.advance_due_room_v1"),
    migration.indexOf("ALTER FUNCTION ink_product.advance_due_room_v1"));
  assert.match(worker, /WHERE id=p_room AND phase='playing'\s+FOR UPDATE SKIP LOCKED/);
  assert.match(worker, /ink_product\.has_due_v2\(p_room\)/);
  assert.match(worker, /'worker', worker, 'advance'/);
  assert.match(worker, /INSERT INTO ink_product\.worker_schedule_v1\(room_id,last_polled_at,expired_through\)/);
  assert.doesNotMatch(worker, /FROM ink_product\.rooms\s+WHERE phase='playing'\s+ORDER BY/);
  assert.match(route, /const heartbeatIntervalMs = 4500/);
});

test("S5 entry stays behind build and server admission gates", () => {
  assert.match(app, /VITE_GROUP_ITEMS_S5_ENTRY === "1"/);
  assert.match(play, /VITE_GROUP_ITEMS_S5_ENTRY === "1"/);
  assert.match(play, /id: "group-items"/);
  assert.match(route, /MODE === "s4-product-candidate" \? "review" : "production"/);
  assert.match(route, /!entry\.admissionEnabled/);
  assert.match(migration, /SELECT FROM ink_product\.entry_policy_v1 WHERE binding=p_binding AND admission_enabled/);
  assert.match(migration, /VALUES \(true, false, 0\)/);
  assert.doesNotMatch(migration, /INSERT INTO ink_product\.entry_policy_v1 VALUES \('production'/);
});

test("the group engine does not silently replace current duel item RPCs", () => {
  assert.match(migration, /minimum_players >= 3/);
  assert.match(migration, /p\.minimum_players<>3 OR p\.maximum_players<>8/);
  assert.match(source("pages/MultiplayerGamePage.jsx"), /ensureDuelItemGrant/);
  assert.match(source("pages/MultiplayerGamePage.jsx"), /fetchDuelItemState/);
});
