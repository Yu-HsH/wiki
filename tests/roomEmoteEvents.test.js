import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_EMOTE_IDS,
  isRoomEmoteId,
  normalizeRoomEmoteEvent,
  normalizeRoomEmoteRpcResponse,
  upsertLatestRoomEmote,
} from "../utils/roomEmoteEvents.js";

const event = (id, userId, emoteId, createdAt) => ({
  id, room_id: "room-1", user_id: userId, event_type: "room_emote",
  payload: { emoteId }, created_at: createdAt,
});

test("catalogue contract is exactly the ten approved server IDs", () => {
  assert.deepEqual(ROOM_EMOTE_IDS, [
    "hello", "ready", "go", "good", "wait",
    "hurry", "wow", "lol", "sad", "gg",
  ]);
  assert.equal(isRoomEmoteId("go"), true);
  assert.equal(isRoomEmoteId("cheer"), false); // legacy spectator only
  assert.equal(isRoomEmoteId("GO"), false);
  assert.equal(isRoomEmoteId({}), false);
});

test("response parser preserves structured server denials", () => {
  assert.deepEqual(normalizeRoomEmoteRpcResponse([{ accepted: false, code: "EMOTE_RATE_LIMIT" }]),
    { accepted: false, code: "EMOTE_RATE_LIMIT" });
  assert.equal(normalizeRoomEmoteRpcResponse([]), null);
});

test("invalid/malformed or legacy event cannot become a Kion reaction", () => {
  assert.equal(normalizeRoomEmoteEvent(event("1", "u", "cheer", "2026-11-10T00:00:00Z")), null);
  assert.equal(normalizeRoomEmoteEvent({ ...event("1", "u", "go", "bad"), created_at: "bad" }), null);
  assert.equal(normalizeRoomEmoteEvent({ ...event("1", "u", "go", "2026-11-10T00:00:00Z"), user_id: null }), null);
  assert.equal(normalizeRoomEmoteEvent({ ...event("1", "u", "go", "2026-11-10T00:00:00Z"), event_type: "group_spectator_emoji" }), null);
});

test("upsert preserves newest per sender, ignores stale and sorts by server time", () => {
  const older = event("a", "alice", "hello", "2026-11-10T00:00:00Z");
  const newer = event("b", "alice", "go", "2026-11-10T00:00:02Z");
  const other = event("c", "bob", "gg", "2026-11-10T00:00:01Z");
  let rows = upsertLatestRoomEmote([], older);
  rows = upsertLatestRoomEmote(rows, other);
  rows = upsertLatestRoomEmote(rows, newer);
  assert.deepEqual(rows.map((item) => item.emoteId), ["gg", "go"]);
  assert.equal(upsertLatestRoomEmote(rows, older), rows);
  assert.equal(upsertLatestRoomEmote(rows, { ...other, id: "c" }), rows);
});
