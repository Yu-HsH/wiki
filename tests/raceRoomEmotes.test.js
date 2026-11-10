import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getVisibleRaceEmotes, mergeRaceEmoteSnapshots } from "../utils/raceEmotePresentation.js";

const js = fs.readFileSync(new URL("../components/RaceRoomEmotes.jsx", import.meta.url), "utf8");
const duel = fs.readFileSync(new URL("../pages/MultiplayerGamePage.jsx", import.meta.url), "utf8");
const group = fs.readFileSync(new URL("../pages/GroupGamePage.jsx", import.meta.url), "utf8");

test("recent reactions stop at six seconds and remain hidden when muted", () => {
  const now = Date.parse("2026-11-10T09:00:10Z");
  const rows = [
    { id: "a", userId: "one", createdAt: now - 5999 },
    { id: "b", userId: "two", createdAt: now - 6000 },
    { id: "c", userId: "three", createdAt: now + 501 },
    { id: "d", userId: "four", createdAt: now - 1 },
  ];
  assert.deepEqual(getVisibleRaceEmotes(rows, now).map((row) => row.id), ["a", "d"]);
  assert.deepEqual(getVisibleRaceEmotes(rows, now, true), []);
});

test("event backfill keeps newer sender reaction and deterministic display order", () => {
  const original = [{ id: "a", userId: "first", createdAt: 1000 }];
  const history = [
    { id: "b", userId: "first", createdAt: 900 },
    { id: "c", userId: "second", createdAt: 1200 },
    { id: "d", userId: "first", createdAt: 1300 },
  ];
  const merged = mergeRaceEmoteSnapshots(original, history);
  assert.deepEqual(merged.map((item) => item.id), ["c", "d"]);
  assert.deepEqual(mergeRaceEmoteSnapshots(merged, history), merged);
});

test("race views are feature-gated and refuse idle/disconnected players", () => {
  assert.match(js, /VITE_ENABLE_KION_RACE_EMOTES\s*===\s*"true"/);
  assert.match(js, /me\?\.player_status === "playing"/);
  assert.match(js, /roomStatus === "playing" \|\| roomStatus === "grace_period"/);
  assert.match(js, /if \(!enabled\) return null/);
  assert.match(js, /getVisibleRaceEmotes\(events, clock, hidden, roomId\)/);
  assert.match(js, /setCooldownUntil\(Date\.now\(\) \+ 3000\)/);
});

test("event source is room-scoped and legacy spectator RPC never changes", () => {
  assert.match(js, /table: "room_events"/);
  assert.match(js, /room_id=eq\.\$\{roomId\}/);
  assert.match(js, /event_type !== "room_emote"/);
  assert.match(js, /supabase\.removeChannel\(channel\)/);
  assert.match(js, /sendRoomEmote\(roomId, emoteId\)/);
  assert.doesNotMatch(js, /sendGroupSpectatorEmoji/);
  assert.doesNotMatch(js, /\.insert\(/);
});

test("1:1 and group mount race strip without changing article or item handlers", () => {
  assert.match(duel, /<RaceRoomEmotes roomId=\{roomId\} userId=\{user\?\.id\} players=\{players\} roomStatus=\{room\?\.status\} active=\{isPlaying\} \/>/);
  assert.match(group, /<RaceRoomEmotes roomId=\{roomId\} userId=\{user\?\.id\} players=\{players\} roomStatus=\{room\?\.status\} active=\{isGroupPlaying\} \/>/);
  assert.match(duel, /onLinkClick=\{handleMove\}/);
  assert.match(group, /onLinkClick=\{handleMove\}/);
  assert.match(duel, /onUseItem=\{handleUseItem\}/);
  assert.match(group, /<ReactionDock/); // finished spectator still owns legacy reactions
});

test("room switches cannot leak previous room reactions, even with same sender", () => {
  const now = 100_000;
  const events = [
    {id:"old",roomId:"old-room",userId:"member",createdAt:now-5,emoteId:"hello"},
    {id:"new",roomId:"new-room",userId:"member",createdAt:now-3,emoteId:"good"},
  ];
  assert.deepEqual(getVisibleRaceEmotes(events,now,false,"new-room").map(e=>e.id),["new"]);
});

test("race reactions are separately opt-in, channel warmup is backfilled, duplicate sends guarded", () => {
  assert.doesNotMatch(js, /VITE_ENABLE_KION_ROOM_EMOTES/);
  assert.match(js, /catchupTimer = window\\.setTimeout\\(backfill, 4_000\\)/);
  assert.match(js, /document\\.removeEventListener\\("visibilitychange", onVisibility\\)/);
  assert.match(js, /sendGuard\\.current = true/);
  assert.match(duel, /if \\(event\\.event_type === "room_emote"\\) return/);
});
