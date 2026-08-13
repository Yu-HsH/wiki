import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGroupFinalStandings,
  canGroupPlayerMove,
  getGroupEntryPhase,
  getPendingGroupPlayers,
  getRestoredGroupPhase,
  GROUP_GAME_PHASE,
  isGroupPlayerFinished,
  shouldRetireGroupPlayer,
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
    participant_status: "retired",
    left_at: "2026-07-26T00:00:00.000Z",
  };

  assert.deepEqual(getPendingGroupPlayers([me, departed]), []);
});

test("최종 결과는 완주 순위와 RETIRE 참가자를 모두 표시할 수 있게 병합한다", () => {
  const departed = {
    ...activePlayer,
    participant_status: "retired",
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
  assert.equal(standings[1].result_status, "retired");
  assert.equal(standings[1].leave_reason, "게임 이탈");
});

test("grace_period는 별도 화면 phase 없이 진행 중인 그룹 경기로 복원한다", () => {
  assert.equal(
    getRestoredGroupPhase({
      outcome: "active",
      room: { ...room, status: "grace_period" },
      moveCount: 0,
    }),
    GROUP_GAME_PHASE.PLAYING
  );
});

test("retired 참가자는 pending에서 제외하고 disconnected 참가자는 pending으로 유지한다", () => {
  const retired = {
    ...activePlayer,
    player_status: "retired",
    retired_at: "2026-07-26T00:00:00.000Z",
  };
  const disconnected = {
    ...activePlayer,
    user_id: "user-3",
    player_status: "disconnected",
    disconnected_at: "2026-07-26T00:00:00.000Z",
  };

  assert.deepEqual(
    getPendingGroupPlayers([retired, disconnected]).map((player) => player.user_id),
    ["user-3"]
  );
});

test("finished 참가자는 has_finished가 없어도 pending에서 제외한다", () => {
  const finished = {
    ...activePlayer,
    player_status: "finished",
    result_status: "finished",
    rank: 2,
  };

  assert.deepEqual(getPendingGroupPlayers([finished]), []);
});

test("서버 player_status가 retired이면 최종 상태를 retired로 표현한다", () => {
  const standings = buildGroupFinalStandings([{
    ...activePlayer,
    player_status: "retired",
    retired_at: "2026-07-26T00:00:00.000Z",
    retire_reason: "grace_timeout",
  }]);

  assert.equal(standings[0].result_status, "retired");
  assert.equal(standings[0].retire_reason, "grace_timeout");
});

test("복구 화면의 active 참가자는 RETIRE 대상이고 finished/retired 참가자는 화면만 나간다", () => {
  assert.equal(
    shouldRetireGroupPlayer(
      { status: "grace_period" },
      { user_id: "user-1", player_status: "playing", has_finished: false }
    ),
    true
  );
  assert.equal(
    shouldRetireGroupPlayer(
      { status: "playing" },
      { user_id: "user-1", player_status: "finished", has_finished: true }
    ),
    false
  );
  assert.equal(
    shouldRetireGroupPlayer(
      { status: "playing" },
      { user_id: "user-1", player_status: "retired", has_finished: false }
    ),
    false
  );
});

test("최종 standings는 room_players의 has_finished/rank를 완주 결과로 추측하지 않는다", () => {
  const standings = buildGroupFinalStandings([
    {
      user_id: "user-1",
      nickname_snapshot: "one",
      has_finished: true,
      rank: 1,
      player_status: "playing",
    },
    {
      user_id: "user-2",
      nickname_snapshot: "two",
      has_finished: false,
      player_status: "retired",
      retire_reason: "left",
    },
  ], []);

  assert.deepEqual(standings.map((player) => player.user_id), ["user-2"]);
  assert.equal(isGroupPlayerFinished({
    player_status: "playing",
    has_finished: true,
  }), false);
});

test("최종 standings는 group_match_results의 rank와 is_winner를 보존하고 RETIRE rank를 비운다", () => {
  const standings = buildGroupFinalStandings([
    { user_id: "user-1", nickname_snapshot: "one", has_finished: true, rank: 99 },
    { user_id: "user-2", nickname_snapshot: "two", player_status: "retired" },
  ], [
    {
      user_id: "user-1",
      result_status: "finished",
      rank: 4,
      is_winner: false,
      move_count: 11,
      elapsed_seconds: 70,
    },
    {
      user_id: "user-2",
      result_status: "retired",
      rank: null,
      is_winner: false,
      retire_reason: "time_limit",
    },
  ]);

  assert.equal(standings[0].rank, 4);
  assert.equal(standings[0].is_winner, false);
  assert.equal(standings[1].result_status, "retired");
  assert.equal(standings[1].rank, null);
});
