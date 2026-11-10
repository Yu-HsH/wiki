import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  KION_LOBBY_VISIBLE_MS,
  visibleRoomLobbyReactions,
  mergeRoomLobbySnapshots,
} from "../utils/lobbyEmotePresentation.js";

const lobby = fs.readFileSync(new URL("../components/RoomLobbyEmotes.jsx", import.meta.url), "utf8");
const style = fs.readFileSync(new URL("../components/RoomLobbyEmotes.css", import.meta.url), "utf8");
const duel = fs.readFileSync(new URL("../pages/RoomPage.jsx", import.meta.url), "utf8");
const group = fs.readFileSync(new URL("../pages/GroupRoomPage.jsx", import.meta.url), "utf8");

test("Kion lobby transport is hard-disabled until explicit backend rollout", () => {
  assert.match(lobby, /VITE_ENABLE_KION_ROOM_EMOTES\s*===\s*"true"/);
  assert.match(lobby, /roomStatus === "waiting"/);
  assert.match(lobby, /isJoined/);
  assert.match(lobby, /if \(!state\?\.enabled\) return null/);
});

test("Both real waiting-room pages attach player-owned bubbles and roster controls", () => {
  for (const page of [duel,group]) {
    assert.match(page, /useRoomLobbyEmotes\(\{ roomId, userId: user\?\.id, players, roomStatus: room\?\.status \}\)/);
    assert.match(page, /<RoomLobbyEmoteBubble event=\{lobbyEmotes\.reactionsByUserId\.get\(player\.user_id\)\}/);
    assert.match(page, /<RoomLobbyEmoteControls state=\{lobbyEmotes\}/);
    assert.doesNotMatch(page, /<RoomLobbyEmotes roomId/);
  }
  assert.match(duel, /position=\{slot === "a" \? "duel-left" : "duel-right"\}/);
  assert.match(group, /position="group"/);
  assert.match(group, /\$\{lobbyEmotes\.enabled \? "wr-kion-slot" : ""\}/);
  assert.match(group, /className="wr-roster-row wr-roster-row--empty"/);
  assert.match(group, /handleReady/);
  assert.match(duel, /startRoomGame/);
});

test("Bubble is pointer-inert, has actual Kion image and doesn't move game controls", () => {
  assert.match(lobby, /KionEmoteSticker preset=\{preset\} size=\{64\}/);
  assert.match(style, /\.wr-kion-card \{/);
  assert.match(style, /pointer-events: none/);
  assert.match(style, /wr-roster-row\.wr-kion-slot/);
  assert.match(style, /wr-duel-player\.wr-kion-slot/);
  assert.match(style, /wr-kion-card--duel-left/);
  assert.match(style, /wr-kion-card--duel-right/);
  assert.match(style, /prefers-reduced-motion: reduce/);
});

test("Server-owned presets and RLS listener; UI never writes directly to room_events", () => {
  assert.match(lobby, /sendRoomEmote\(roomId, emoteId\)/);
  assert.match(lobby, /fetchRecentRoomEmotes\(roomId/);
  assert.match(lobby, /event_type !== "room_emote"/);
  assert.match(lobby, /supabase\.removeChannel\(channel\)/);
  assert.doesNotMatch(lobby, /\.insert\(/);
  assert.match(lobby, /if \(response\.accepted\)/);
  assert.match(lobby, /sendGuard\.current/);
});

test("6-second reactions only for current room's occupied seats", () => {
  const now = 1_000_000;
  const players = [{user_id:"a"},{user_id:"b"}];
  const rows = [
    {id:"one",roomId:"room",userId:"a",createdAt:now-5_999},
    {id:"old",roomId:"room",userId:"b",createdAt:now-6_000},
    {id:"out",roomId:"room",userId:"stranger",createdAt:now-5},
    {id:"different",roomId:"other",userId:"b",createdAt:now-5},
    {id:"future",roomId:"room",userId:"b",createdAt:now+501},
    {id:"right",roomId:"room",userId:"b",createdAt:now-10},
  ];
  assert.equal(KION_LOBBY_VISIBLE_MS, 6000);
  assert.deepEqual(visibleRoomLobbyReactions(rows,"room",now,players).map(e=>e.id),["one","right"]);
});

test("Backfill cannot replay old reaction over more recent one; one per participant", () => {
  const first=[{id:"later",userId:"a",createdAt:2000}];
  const older=[{id:"before",userId:"a",createdAt:1000},{id:"b",userId:"b",createdAt:1500}];
  const merged=mergeRoomLobbySnapshots(first,older);
  assert.deepEqual(merged.map(e=>e.id),["b","later"]);
  assert.deepEqual(mergeRoomLobbySnapshots(merged,older),merged);
  assert.deepEqual(mergeRoomLobbySnapshots(merged,[{id:"z",userId:"a",createdAt:2000}]).map(e=>e.id),["b","z"]);
});

test("Realtime startup and foreground recovery have bounded post-join backfill", () => {
  assert.match(lobby, /catchupTimer = window\\.setTimeout\\(backfill, 4_000\\)/);
  assert.match(lobby, /document\\.addEventListener\\("visibilitychange", onVisibility\\)/);
  assert.match(lobby, /document\\.removeEventListener\\("visibilitychange", onVisibility\\)/);
  assert.match(lobby, /if \\(catchupTimer !== null\\) window\\.clearTimeout\\(catchupTimer\\)/);
});
