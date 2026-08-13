import test from "node:test";
import assert from "node:assert/strict";

import {
  validateGroupGameSession,
} from "../utils/onlineGameSession.js";

const baseRoom = {
  id: "room-1",
  mode: "group",
  status: "grace_period",
  game_starts_at: "2026-07-26T00:00:00.000Z",
  group_start_title: "대한민국",
  group_target_title: "미국",
};

test("grace_period 참가자는 유효한 그룹 경기 세션으로 인정한다", () => {
  const session = validateGroupGameSession({
    room: baseRoom,
    players: [{
      user_id: "user-1",
      player_status: "playing",
      current_title: "대한민국",
      path_titles: ["대한민국"],
      move_count: 0,
      has_finished: false,
    }],
    userId: "user-1",
    now: Date.parse("2026-07-26T00:01:00.000Z"),
  });

  assert.equal(session.outcome, "active");
  assert.equal(session.room.status, "grace_period");
  assert.equal(session.elapsedSeconds, 60);
});

test("retired 참가자는 경기 중 pending 세션으로 재진입하지 못한다", () => {
  assert.throws(
    () => validateGroupGameSession({
      room: { ...baseRoom, status: "playing" },
      players: [{
        user_id: "user-1",
        player_status: "retired",
        retired_at: "2026-07-26T00:00:00.000Z",
        has_finished: false,
      }],
      userId: "user-1",
    }),
    (error) => error.code === "PARTICIPANT_INACTIVE"
  );
});

test("finished 방에서는 retired 참가자도 최종 결과 화면을 복원할 수 있다", () => {
  const session = validateGroupGameSession({
    room: { ...baseRoom, status: "finished" },
    players: [{
      user_id: "user-1",
      player_status: "retired",
      retired_at: "2026-07-26T00:00:00.000Z",
      has_finished: false,
    }],
    userId: "user-1",
  });

  assert.equal(session.outcome, "ended");
});

test("disconnected 참가자는 종료 전 복귀 가능한 active 세션으로 유지한다", () => {
  const session = validateGroupGameSession({
    room: { ...baseRoom, status: "playing" },
    players: [{
      user_id: "user-1",
      player_status: "disconnected",
      disconnected_at: "2026-07-26T00:00:00.000Z",
      current_title: "대한민국",
      path_titles: ["대한민국"],
      move_count: 0,
      has_finished: false,
    }],
    userId: "user-1",
  });

  assert.equal(session.outcome, "active");
});
