import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGroupFinalStandings,
  canGroupPlayerMove,
  getGroupEntryPhase,
  getPendingGroupPlayers,
  getRestoredGroupPhase,
  GROUP_GAME_PHASE,
} from "../utils/groupGameFlow.js";

const room = {
  id: "room-1",
  mode: "group",
  status: "playing",
};

const me = {
  id: "player-1",
  user_id: "user-1",
  nickname_snapshot: "나",
  current_title: "서울특별시",
  move_count: 5,
  path_titles: ["대한민국", "서울특별시"],
  has_finished: true,
  rank: 1,
  elapsed_seconds: 48,
};

const activePlayer = {
  id: "player-2",
  user_id: "user-2",
  nickname_snapshot: "t2",
  current_title: "미국",
  move_count: 7,
  path_titles: ["대한민국", "아시아", "미국"],
  has_finished: false,
};

test("최초 방 화면 이동과 F5 재진입의 안내 상태를 구분한다", () => {
  assert.equal(
    getGroupEntryPhase({ hasInitialEntryToken: true }),
    GROUP_GAME_PHASE.INITIALIZING
  );
  assert.equal(
    getGroupEntryPhase({ hasInitialEntryToken: false }),
    GROUP_GAME_PHASE.RECOVERING
  );
});

test("개인 완주는 결과 화면으로, 관전 선택 후 F5는 관전으로 복원한다", () => {
  const session = {
    outcome: "finished",
    room,
    players: [me, activePlayer],
    me,
  };

  assert.equal(getRestoredGroupPhase(session), GROUP_GAME_PHASE.FINISHED);
  assert.equal(
    getRestoredGroupPhase(session, { viewMode: "spectating" }),
    GROUP_GAME_PHASE.SPECTATING
  );
});

test("방 전체 종료는 개인 완주와 별개로 최종 결과 화면을 복원한다", () => {
  assert.equal(
    getRestoredGroupPhase({
      outcome: "ended",
      room: { ...room, status: "finished" },
      players: [me],
      me,
    }),
    GROUP_GAME_PHASE.ENDED
  );
});

test("완주·관전·복구 상태에서는 공식 이동 요청을 차단한다", () => {
  assert.equal(canGroupPlayerMove({
    phase: GROUP_GAME_PHASE.PLAYING,
    isLoading: false,
    moveInFlight: false,
    hasFinished: false,
  }), true);

  for (const phase of [
    GROUP_GAME_PHASE.FINISHED,
    GROUP_GAME_PHASE.SPECTATING,
    GROUP_GAME_PHASE.RECOVERING,
    GROUP_GAME_PHASE.ENDED,
  ]) {
    assert.equal(canGroupPlayerMove({
      phase,
      isLoading: false,
      moveInFlight: false,
      hasFinished: phase !== GROUP_GAME_PHASE.RECOVERING,
    }), false);
  }
});

test("한 명 완주 후 진행 중 참가자는 완료 대기 목록에 유지한다", () => {
  assert.deepEqual(
    getPendingGroupPlayers([me, activePlayer]).map((player) => player.user_id),
    ["user-2"]
  );
});

test("중도 이탈 참가자는 전체 종료 대기 대상에서 제외한다", () => {
  const departed = {
    ...activePlayer,
    participant_status: "dnf",
    left_at: "2026-07-26T00:00:00.000Z",
  };

  assert.deepEqual(getPendingGroupPlayers([me, departed]), []);
});

test("최종 결과는 완주 순위와 DNF 참가자를 모두 표시할 수 있게 병합한다", () => {
  const departed = {
    ...activePlayer,
    participant_status: "dnf",
    leave_reason: "게임 이탈",
  };
  const results = [{
    user_id: me.user_id,
    nickname_snapshot: me.nickname_snapshot,
    rank: 1,
    move_count: 5,
    elapsed_seconds: 48,
    result_status: "finished",
  }];

  const standings = buildGroupFinalStandings([me, departed], results);

  assert.equal(standings.length, 2);
  assert.equal(standings[0].result_status, "finished");
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].result_status, "dnf");
  assert.equal(standings[1].leave_reason, "게임 이탈");
});
