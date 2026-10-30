import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261030034358_public_room_host_presence_v1.sql", import.meta.url), "utf8");
const roomPage = readFileSync(new URL("../pages/RoomPage.jsx", import.meta.url), "utf8");

test("public-room discovery filters waiting rooms without an actual host participant", () => {
  const list = sql.slice(sql.indexOf("create or replace function public.list_public_waiting_rooms_v1"), sql.indexOf("create or replace function public.join_public_room_v1"));
  assert.match(list, /r\.is_public is true and r\.status = 'waiting'/);
  assert.match(list, /hp\.room_id = r\.id and hp\.user_id = r\.host_user_id/);
  assert.match(list, /auth\.uid\(\) is null/);
  assert.doesNotMatch(list, /room_code/);
});

test("public join requires host presence and serializes against concurrent host leave", () => {
  const join = sql.slice(sql.indexOf("create or replace function public.join_public_room_v1"));
  assert.match(join, /hp\.user_id = public\.game_rooms\.host_user_id/);
  assert.match(join, /for update;/);
  assert.match(join, /PUBLIC_ROOM_NOT_JOINABLE/);
  assert.match(join, /public\.join_duel_room_v2/);
  assert.match(join, /public\.join_group_room/);
});

test("duel lobby stops hiding failed join errors or displaying an abandoned lobby", () => {
  assert.doesNotMatch(roomPage, /await joinRoom\(roomId, user\.id\).*\.catch\(\(\) => trace/);
  assert.match(roomPage, /throw new Error\(error instanceof Error/);
  assert.match(roomPage, /방장이 떠난 대기실입니다/);
});
