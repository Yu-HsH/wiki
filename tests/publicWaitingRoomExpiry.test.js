import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = source("docs/ops/sql/public_waiting_room_expiry_v1.sql");

test("expiry only targets publicly visible waiting rooms and never result-finishes matches", () => {
  assert.match(sql, /status in \('waiting'.*'expired'\)/);
  assert.match(sql, /r\.is_public is true and r\.status='waiting'/);
  assert.match(sql, /hp\.last_seen_at >= now\(\) - interval '2 hours'/);
  assert.match(sql, /status='expired'/);
  assert.doesNotMatch(sql, /set\s+status\s*=\s*'finished'/i);
  assert.match(sql, /for update of r skip locked/);
  assert.match(sql, /state_version=r\.state_version\+1/);
});

test("all public discovery, public and direct join routes share server liveness guard", () => {
  for (const name of [
    "list_public_waiting_rooms_v1", "join_public_room_v1", "find_room_by_code_v1",
    "join_duel_room_v2", "join_group_room"
  ]) assert.ok(sql.includes("FUNCTION public." + name), name);
  const refs = sql.match(/private\.public_waiting_room_live_v1\(/g) || [];
  assert.ok(refs.length >= 7, "definition plus all use sites");
  assert.match(sql, /perform private\.expire_stale_public_waiting_rooms_v1\(100\)/);
});

test("host-only heartbeat and visible-page client pulse are separately authorized", () => {
  const api = source("services/publicRoomService.js");
  const hook = source("hooks/usePublicWaitingRoomHeartbeat.js");
  for (const page of ["pages/RoomPage.jsx", "pages/GroupRoomPage.jsx"]) {
    assert.match(source(page), /usePublicWaitingRoomHeartbeat\(room, user\?\.id, setSubmitError\)/);
    assert.match(source(page), /roomData\.status === "expired"/);
    if (page === "pages/GroupRoomPage.jsx") {
      assert.doesNotMatch(source(page), /joinGroupRoom\(roomId\)\.catch\(\(\) => \{ \}\)/);
    }
  }
  assert.match(sql, /host_user_id is distinct from auth\.uid\(\)/);
  assert.match(sql, /grant execute on function public\.heartbeat_public_waiting_room_v1\(uuid\) to authenticated/);
  assert.match(api, /heartbeat_public_waiting_room_v1/);
  assert.match(hook, /document\.hidden/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /window\.setInterval/);
  assert.match(source("pages/MultiplayerPage.jsx"), /window\.setInterval\(refresh, 60000\)/);
});

test("local SQL integration fixtures cover expired duel, group, private, live and anti-spoofing", () => {
  const tap = source("supabase/tests/public_waiting_room_expiry_v1.sql");
  for (const phrase of [
    "direct duel code join", "direct group join", "PUBLIC_ROOM_HOST_ONLY",
    "public playing match is untouched", "private waiting room is untouched",
    "host cannot revive", "only the two active public duel rooms"
  ]) assert.ok(tap.includes(phrase), phrase);
  assert.match(tap, /begin;/);
  assert.match(tap, /rollback;/);
});
