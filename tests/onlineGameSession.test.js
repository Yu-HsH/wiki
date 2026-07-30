import test from "node:test";
import assert from "node:assert/strict";

import {
  OnlineGameSessionError,
  elapsedSecondsFromServer,
  isProgressAlreadyApplied,
  normalizeOnlineGameError,
  retryRecoverable,
  validateDuelGameSession,
  validateGroupGameSession,
} from "../utils/onlineGameSession.js";

const groupRoom = {
  id: "room-1",
  mode: "group",
  status: "playing",
  group_start_title: "대한민국",
  group_target_title: "서울특별시",
  started_at: "2026-07-15T00:00:00.000Z",
};

const groupPlayer = {
  user_id: "user-1",
  current_title: "한반도",
  path_titles: ["대한민국", "한반도"],
  move_count: 1,
  has_finished: false,
};

test("단체 게임 복구는 localStorage가 아닌 서버 진행 상태를 반환한다", () => {
  const result = validateGroupGameSession({
    room: groupRoom,
    players: [groupPlayer],
    userId: "user-1",
    now: Date.parse("2026-07-15T00:01:00.000Z"),
  });

  assert.equal(result.outcome, "active");
  assert.equal(result.currentTitle, "한반도");
  assert.deepEqual(result.pathTitles, ["대한민국", "한반도"]);
  assert.equal(result.moveCount, 1);
  assert.equal(result.elapsedSeconds, 60);
});

test("삭제된 방, 강제 퇴장, 종료된 게임을 서로 구분한다", () => {
  assert.throws(
    () => validateGroupGameSession({ room: null, players: [], userId: "user-1" }),
    (error) => error instanceof OnlineGameSessionError && error.code === "ROOM_NOT_FOUND" && !error.recoverable
  );

  assert.throws(
    () => validateGroupGameSession({
      room: groupRoom,
      players: [{ ...groupPlayer, status: "kicked" }],
      userId: "user-1",
    }),
    (error) => error.code === "PARTICIPANT_INACTIVE"
  );

  const ended = validateGroupGameSession({
    room: { ...groupRoom, status: "finished" },
    players: [{ ...groupPlayer, has_finished: true }],
    userId: "user-1",
  });
  assert.equal(ended.outcome, "ended");
});

test("개인 완주와 전체 경기 종료를 서로 다른 서버 상태로 복원한다", () => {
  const personalFinish = validateGroupGameSession({
    room: groupRoom,
    players: [
      { ...groupPlayer, has_finished: true, rank: 1 },
      { ...groupPlayer, user_id: "user-2", current_title: "서울", has_finished: false },
    ],
    userId: "user-1",
  });

  assert.equal(personalFinish.outcome, "finished");
  assert.equal(personalFinish.room.status, "playing");
});

test("1:1 게임 URL은 참가자가 없거나 종료된 경우 진행 화면을 허용하지 않는다", () => {
  const duelRoom = { id: "duel-1", status: "playing", started_at: groupRoom.started_at };
  const opponent = { user_id: "user-2", target_title: "목표", current_title: "상대 문서" };

  assert.throws(
    () => validateDuelGameSession({ room: duelRoom, players: [opponent], userId: "user-1" }),
    (error) => error.code === "NOT_A_PARTICIPANT"
  );

  const finished = validateDuelGameSession({
    room: { ...duelRoom, status: "finished" },
    players: [{ ...groupPlayer, start_title: "시작" }, opponent],
    userId: "user-1",
  });
  assert.equal(finished.outcome, "finished");
});

test("일시 오류는 제한 횟수만 재시도하고 성공 상태를 반환한다", async () => {
  let calls = 0;
  const result = await retryRecoverable(
    async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("Failed to fetch");
      return "recovered";
    },
    { attempts: 3, sleep: async () => {} }
  );

  assert.equal(result, "recovered");
  assert.equal(calls, 3);
});

test("서버 시작 시간을 기준으로 타이머를 복원한다", () => {
  assert.equal(
    elapsedSecondsFromServer("2026-07-15T00:00:00.000Z", Date.parse("2026-07-15T00:02:03.900Z")),
    123
  );
});

test("같은 이동 요청은 이미 반영된 결과로 판정하고 다른 이동은 충돌로 남긴다", () => {
  const latest = {
    current_title: "한반도",
    move_count: 1,
    has_finished: false,
  };

  assert.equal(isProgressAlreadyApplied(latest, {
    currentTitle: "한반도",
    moveCount: 1,
    hasFinished: false,
  }), true);
  assert.equal(isProgressAlreadyApplied(latest, {
    currentTitle: "서울특별시",
    moveCount: 1,
    hasFinished: false,
  }), false);

  assert.equal(isProgressAlreadyApplied({
    ...latest,
    has_finished: true,
  }, {
    currentTitle: "한반도",
    moveCount: 1,
    hasFinished: false,
  }), false);
});

test("네트워크 오류는 재시도 가능, 인증 만료는 복구 불가능으로 분류한다", () => {
  const network = normalizeOnlineGameError(new TypeError("Failed to fetch"));
  const auth = normalizeOnlineGameError({ code: "401", message: "JWT expired" });

  assert.equal(network.recoverable, true);
  assert.equal(auth.recoverable, false);
  assert.equal(auth.code, "AUTH_EXPIRED");
});
