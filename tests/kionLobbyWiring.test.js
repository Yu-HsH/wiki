import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const lobby = fs.readFileSync(new URL("../components/RoomLobbyEmotes.jsx", import.meta.url), "utf8");
const duel = fs.readFileSync(new URL("../pages/RoomPage.jsx", import.meta.url), "utf8");
const group = fs.readFileSync(new URL("../pages/GroupRoomPage.jsx", import.meta.url), "utf8");

test("Kion lobby is hard-disabled until an explicit backend rollout flag", () => {
  assert.match(lobby, /VITE_ENABLE_KION_ROOM_EMOTES\s*===\s*"true"/);
  assert.match(lobby, /if \(!enabled\) return null/);
  assert.match(lobby, /roomStatus === "waiting"/);
  assert.match(lobby, /isJoined/);
});

test("Both waiting-room pages mount the same dock without affecting readiness", () => {
  for (const page of [duel, group]) {
    assert.match(page, /import RoomLobbyEmotes from/);
    assert.match(page, /<RoomLobbyEmotes roomId=\{roomId\} userId=\{user\?\.id\} players=\{players\} roomStatus=\{room\?\.status\} \/>/);
  }
  assert.match(group, /handleReady/);
  assert.match(duel, /startRoomGame/);
});

test("Lobby messages are server-owned presets, never direct event inserts", () => {
  assert.match(lobby, /sendRoomEmote\(roomId, emoteId\)/);
  assert.match(lobby, /fetchRecentRoomEmotes\(roomId/);
  assert.match(lobby, /event_type !== "room_emote"/);
  assert.match(lobby, /supabase\.removeChannel\(channel\)/);
  assert.doesNotMatch(lobby, /\.insert\(/);
});
