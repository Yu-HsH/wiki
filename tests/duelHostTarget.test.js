import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const room = read("pages/RoomPage.jsx");
const game = read("pages/MultiplayerGamePage.jsx");
const service = read("services/multiplayerService.js");

// Exercise the actual service functions with an isolated RPC transport; no network.
const isolated = await import(`data:text/javascript;base64,${Buffer.from(`
export const calls = [];
export let rpcError = null;
export function failWith(error) { rpcError = error; }
const isSupabaseConfigured = true;
const supabase = { async rpc(name, args) { calls.push({ name, args }); return { data: [{ id: "saved" }], error: rpcError }; } };
${service.replace(/^import .*;\r?\n/gm, "")}
`).toString("base64")}`);

test("14c START는 snapshot 반환 identity 전체를 숫자 ID도 문자열로 전달한다", async () => {
  await isolated.startRoomGame("room", "host", { canonicalTitle: "서버 제목", pageId: 123, revisionId: 456 });
  assert.deepEqual(isolated.calls.at(-1), {
    name: "start_duel_room_v2",
    args: { p_room_id: "room", p_start_title: "서버 제목", p_start_page_id: "123", p_start_revision_id: "456" },
  });
});

test("14c setter는 READY 고정 호환값을 보내고 저장된 행을 반환한다", async () => {
  assert.deepEqual(await isolated.setDuelTargetV2("room", {
    title: "목표", pageId: 1, revisionId: 2, isReady: true,
  }), { id: "saved" });
  assert.equal(isolated.calls.at(-1).args.p_is_ready, false);
});

test("14c START 서버 거부를 fallback이나 재호출로 숨기지 않는다", async () => {
  const error = { message: "DUEL_START_SNAPSHOT_REQUIRED" };
  isolated.failWith(error);
  const before = isolated.calls.length;
  await assert.rejects(isolated.startRoomGame("room", "host", { title: "미확인" }), (e) => e === error);
  assert.equal(isolated.calls.length, before + 1);
  isolated.failWith(null);
});

test("14c 대기실에는 READY 조작·배지·각자 목표 라벨이 없다", () => {
  assert.doesNotMatch(room, /handleReady|handleUnready|is_ready|allReady|room-ready-badge|상대가 풀 목표 문서|내가 풀 목표 문서/);
  assert.match(room, /방장이 고른 목표:/);
  assert.match(room, /방장이 목표를 고르는 중/);
  assert.match(room, /\{isHost \? \(/);
});

test("14c 목표/시작은 snapshot 반환 identity를 사용하고 진행 중 START를 막는다", () => {
  assert.match(room, /targetIdentity = await ensureWikiSnapshot\(targetPage\)/);
  assert.match(room, /pageId: targetIdentity\.pageId/);
  assert.match(room, /startIdentity = await ensureWikiSnapshot\(candidatePage\)/);
  assert.match(room, /startRoomGame\(roomId, user\.id, startIdentity\)/);
  assert.match(room, /!savingTarget && !isSearching && !starting && !targetSaveFailed/);
  assert.match(room, /disabled=\{!canStart\}/);
});

test("14c 게임의 양쪽 목표는 host_user_id의 동일한 공통 목표다", () => {
  assert.match(game, /player\.user_id === room\?\.host_user_id/);
  assert.match(game, /myTargetTitle = commonTargetTitle/);
  assert.match(game, /opponentTargetTitle = commonTargetTitle/);
  assert.doesNotMatch(game, /myTargetTitle = opponentPlayer\?\.target_title/);
});
