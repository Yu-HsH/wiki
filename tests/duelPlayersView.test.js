import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// SF-A2 (TRACKS.md §8-SEC-⑦): the 1:1 front reads players through the masked RPC
// and re-reads on the opponent's progress signal and on its own heartbeat tick.
// SF-A3 hides the opponent row from room_players; if any of these regress, the
// opponent panel freezes or recovery ends in OPPONENT_LEFT.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const service = read("services/multiplayerService.js");
const page = read("pages/MultiplayerGamePage.jsx");

test("SF-A2: fetchRoomPlayers reads through get_duel_room_players_v1, not the table", () => {
  const body = service.slice(
    service.indexOf("export async function fetchRoomPlayers"),
    service.indexOf("export const DUEL_PROGRESS_EVENT_TYPE")
  );
  assert.match(body, /supabase\.rpc\("get_duel_room_players_v1", \{\s*p_room_id: roomId,\s*\}\)/);
  assert.doesNotMatch(service, /\.from\(["']room_players["']\)/);
  assert.match(service, /export const DUEL_PROGRESS_EVENT_TYPE = "duel_progress";/);
});

test("SF-A2: the opponent's progress signal triggers a re-read, judged by payload.userId", () => {
  const [branch] = page.match(/if \(eventType === DUEL_PROGRESS_EVENT_TYPE\) \{[\s\S]*?\n    \}/) || [];
  assert.ok(branch, "duel_progress branch present");
  assert.match(branch, /payload\.userId !== user\?\.id/);
  assert.match(branch, /await refreshPlayersFromServer\(\)/);
});

test("SF-A2: the heartbeat tick re-reads players", () => {
  const [heartbeat] = page.match(/const sendHeartbeat = async \(\) => \{[\s\S]*?\n    \};/) || [];
  assert.ok(heartbeat, "sendHeartbeat present");
  assert.match(heartbeat, /await refreshPlayersFromServer\(\);/);
});

test("SF-A2: a late refresh never overwrites a newer row", () => {
  const [refresh] = page.match(/const refreshPlayersFromServer = async \(\) => \{[\s\S]*?\n  \};/) || [];
  assert.ok(refresh, "refreshPlayersFromServer present");
  assert.match(refresh, /Number\(known\.progress_version\) > Number\(row\.progress_version\)\) return known/);
});

test("SF-A2: item sync merges rows — the opponent row arrives without its path", () => {
  const [sync] = page.match(/const syncAfterItemUse = async \(outcome\) => \{[\s\S]*?\n  \};/) || [];
  assert.ok(sync, "syncAfterItemUse present");
  assert.match(sync, /return fresh \? \{ \.\.\.player, \.\.\.fresh \} : player;/);
  assert.doesNotMatch(sync, /return fresh \|\| player;/);
});

test("SF-A2: the waiting room applies only the latest players read", () => {
  // Without this, a read issued before the guest left can land after the newer one
  // and keep START enabled (14c smoke failed 2 of 3 runs with the RPC read, 2026-10-03).
  const room = read("pages/RoomPage.jsx");
  assert.match(room, /return readId === playersReadRef\.current \? rows : null;/);
  const realtime = room.slice(room.indexOf('table: "room_players"'), room.indexOf(".subscribe("));
  assert.match(realtime, /await readLatestPlayers\(\);\s*if \(latestPlayers\) setPlayers\(latestPlayers\);/);
  assert.doesNotMatch(realtime, /fetchRoomPlayers\(/);
});
