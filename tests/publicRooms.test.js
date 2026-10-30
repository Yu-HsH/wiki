import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20261030010000_public_room_discovery_v1.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/MultiplayerPage.jsx", import.meta.url), "utf8");
const duel = readFileSync(new URL("../services/multiplayerService.js", import.meta.url), "utf8");
const group = readFileSync(new URL("../services/groupMultiplayerService.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../services/publicRoomService.js", import.meta.url), "utf8");

test("new and historical rooms remain private unless host opts in", () => {
  assert.match(sql, /is_public boolean not null default false/);
  assert.match(page, /useState\(false\)/);
  assert.match(duel, /p_is_public: options\.isPublic \?\? false/);
  assert.match(group, /p_is_public: options\.isPublic \?\? false/);
});
test("privacy gate removes old all-waiting RLS policy while retaining joined-room policy", () => {
  assert.match(sql, /drop policy if exists "Authenticated users can view waiting or joined rooms"/);
  assert.doesNotMatch(sql, /drop policy if exists "Players can view joined rooms"/);
});
test("public listing has a narrow projection, waiting/capacity filter and authenticated gate", () => {
  const start=sql.indexOf("create or replace function public.list_public_waiting_rooms_v1");
  const end=sql.indexOf("create or replace function public.join_public_room_v1",start);
  assert.ok(start>0 && end>start);
  const body=sql.slice(start,end);
  for(const str of ["auth.uid() is null","r.is_public is true","r.status = 'waiting'","< r.max_players","limit 50"])assert.ok(body.includes(str),str);
  for(const field of ["room_id uuid","host_nickname text","current_players bigint","max_players integer"])assert.ok(body.includes(field),field);
  for(const field of ["room_code text","path_titles","user_id uuid","select r.*"])assert.ok(!body.includes(field),field);
});
test("legacy member write grants cannot change visibility without an approved RPC", () => {
  assert.match(sql, /private\.guard_room_visibility_v1/);
  assert.match(sql, /before insert or update of is_public/);
  assert.match(sql, /current_user in \('authenticated', 'anon'\)/);
  assert.match(sql, /ROOM_VISIBILITY_RPC_REQUIRED/);
});

test("private code lookup and public join use authenticated, narrow RPCs", () => {
  for(const rpc of ["find_room_by_code_v1","create_discoverable_duel_room_v1","create_discoverable_group_room_v1","list_public_waiting_rooms_v1","join_public_room_v1"]){
    assert.ok(sql.includes(`revoke all on function public.${rpc}`),rpc);
    assert.ok(sql.includes(` to authenticated;`));
  }
  assert.match(sql, /perform public\.join_duel_room_v2\(v_room\.room_code\)/);
  assert.match(sql, /perform public\.join_group_room\(v_room\.id\)/);
  assert.match(duel, /joinDuelRoomByCode/);
  assert.match(group, /p_mode: "group"/);
});
test("entry supports both modes, preserves room-code join and lists public rooms", () => {
  assert.match(page, /joinDuelRoomByCode\(code\)/);
  assert.match(page, /findGroupRoomByCode\(code\)/);
  assert.match(page, /joinGroupRoom\(room\.id\)/);
  assert.match(page, /handleJoinPublicRoom/);
  assert.match(page, /isPublic, setIsPublic/);
  assert.match(page, /room\.mode === "group"/);
  assert.match(api, /list_public_waiting_rooms_v1/);
  assert.match(api, /join_public_room_v1/);
});
