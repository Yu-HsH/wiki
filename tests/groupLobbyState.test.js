import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUP_START_BLOCK, getGroupStartState } from "../utils/groupLobbyState.js";

const p = (user_id, ready, pageId, nickname = user_id) => ({
  user_id, nickname_snapshot: nickname, is_ready: ready, submitted_target_page_id: pageId,
});

test("그룹 START 표시: 2명은 인원 미달", () => {
  const state = getGroupStartState({ players: [p("a", true, "1"), p("b", true, "2")], status: "waiting", myUserId: "a" });
  assert.equal(state.ok, false);
  assert.equal(state.code, GROUP_START_BLOCK.TOO_FEW);
  assert.match(state.reason, /지금 2명/);
});

test("그룹 START 표시: READY 전 참가자가 있으면 막고 이름/나를 구분한다", () => {
  const players = [p("a", true, "1"), p("b", true, "2"), p("c", false, null, "수현")];
  assert.equal(getGroupStartState({ players, status: "waiting", myUserId: "a" }).reason, "수현이 준비 중입니다");
  assert.equal(getGroupStartState({ players, status: "waiting", myUserId: "c" }).reason, "내 후보 선택과 READY가 필요합니다");
  const two = [...players, p("d", false, null)];
  assert.equal(getGroupStartState({ players: two, status: "waiting", myUserId: "c" }).reason, "나를 포함해 2명이 준비 중입니다");
});

test("그룹 START 표시: READY여도 제출 page_id가 없으면 서버처럼 준비 전으로 본다", () => {
  const state = getGroupStartState({ players: [p("a", true, "1"), p("b", true, "2"), p("c", true, null)], status: "waiting" });
  assert.equal(state.code, GROUP_START_BLOCK.NOT_READY);
});

test("그룹 START 표시: 서로 다른 page_id가 2개 미만이면 막는다", () => {
  const state = getGroupStartState({ players: [p("a", true, "7"), p("b", true, "7"), p("c", true, 7)], status: "waiting" });
  assert.equal(state.code, GROUP_START_BLOCK.NOT_DISTINCT);
  assert.equal(state.distinctCount, 1);
});

test("그룹 START 표시: 전원 준비 + 후보 2종이면 허용, 대기 상태가 아니면 불가", () => {
  const players = [p("a", true, "1"), p("b", true, "1"), p("c", true, "2")];
  assert.equal(getGroupStartState({ players, status: "waiting" }).ok, true);
  assert.equal(getGroupStartState({ players, status: "starting" }).ok, false);
});

test("그룹 START 표시 규칙은 서버 거부 조건과 같은 순서를 따른다", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260814103000_group_final_gaps_v13.sql", import.meta.url), "utf8");
  const start = sql.slice(sql.indexOf("function public.start_group_room_game_v2"));
  const order = ["GROUP_PLAYER_COUNT_INVALID", "GROUP_ALL_PLAYERS_NOT_READY", "GROUP_TARGETS_NOT_DISTINCT"].map((code) => start.indexOf(code));
  assert.ok(order.every((index) => index > 0) && order[0] < order[1] && order[1] < order[2]);
  assert.match(start, /not is_ready or submitted_target_page_id is null/);
});
