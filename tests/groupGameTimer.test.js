import test from "node:test";
import assert from "node:assert/strict";

import {
  GROUP_GAME_DURATION_SECONDS,
  GROUP_GRACE_DURATION_SECONDS,
  createGroupFinalizerGate,
  getGroupActualEndAt,
  getGroupRemainingSeconds,
  isGroupRoomActive,
  isGroupRoomExpired,
} from "../utils/groupGameTimer.js";

test("그룹 기본 시간은 20분 hard deadline과 2분 grace이다", () => {
  assert.equal(GROUP_GAME_DURATION_SECONDS, 1200);
  assert.equal(GROUP_GRACE_DURATION_SECONDS, 120);
});

const now = Date.parse("2026-08-13T00:00:00.000Z");

test("playing은 game_deadline_at 기준 남은 시간을 계산한다", () => {
  const room = {
    status: "playing",
    game_deadline_at: "2026-08-13T00:15:00.000Z",
  };

  assert.equal(getGroupActualEndAt(room).toISOString(), "2026-08-13T00:15:00.000Z");
  assert.equal(getGroupRemainingSeconds(room, now), 900);
  assert.equal(getGroupRemainingSeconds(room, now + 1000), 899);
});

test("grace_period는 grace_ends_at과 전체 제한 중 더 이른 시각을 사용한다", () => {
  const graceFirst = {
    status: "grace_period",
    grace_ends_at: "2026-08-13T00:08:00.000Z",
    game_deadline_at: "2026-08-13T00:15:00.000Z",
  };
  const deadlineFirst = {
    ...graceFirst,
    grace_ends_at: "2026-08-13T00:17:00.000Z",
  };

  assert.equal(getGroupRemainingSeconds(graceFirst, now + 5 * 60 * 1000), 180);
  assert.equal(getGroupRemainingSeconds(deadlineFirst, now + 14 * 60 * 1000), 60);
});

test("만료 시각은 남은 시간을 0으로 고정하고 active room만 만료로 판정한다", () => {
  const expired = {
    status: "grace_period",
    grace_ends_at: "2026-08-12T23:59:59.000Z",
    game_deadline_at: "2026-08-13T00:15:00.000Z",
  };

  assert.equal(getGroupRemainingSeconds(expired, now), 0);
  assert.equal(isGroupRoomExpired(expired, now), true);
  assert.equal(isGroupRoomActive({ ...expired, status: "finished" }), false);
  assert.equal(isGroupRoomExpired({ ...expired, status: "finished" }, now), false);
});

test("null 또는 잘못된 timestamp도 예외 없이 안전한 값을 반환한다", () => {
  const invalid = {
    status: "playing",
    game_deadline_at: "not-a-timestamp",
  };

  assert.equal(getGroupActualEndAt(invalid), null);
  assert.equal(getGroupRemainingSeconds(invalid, now), 0);
  assert.equal(isGroupRoomExpired(invalid, now), false);
  assert.equal(getGroupRemainingSeconds({ status: "finished" }, now), 0);
});

test("grace_period도 active room으로 판정되어 게임 화면에서 계속 진행할 수 있다", () => {
  assert.equal(isGroupRoomActive({ status: "playing" }), true);
  assert.equal(isGroupRoomActive({ status: "grace_period" }), true);
  assert.equal(isGroupRoomActive({ status: "waiting" }), false);
});

test("같은 브라우저의 동일한 finalizer 요청은 한 번만 실행한다", async () => {
  const gate = createGroupFinalizerGate();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    return "finished";
  };

  const first = gate.run("room-1:grace_period:123", operation);
  const duplicate = gate.run("room-1:grace_period:123", operation);

  assert.strictEqual(first, duplicate);
  assert.equal(await first, "finished");
  assert.equal(gate.run("room-1:grace_period:123", operation), null);
  assert.equal(calls, 1);
});

test("복구 재시도는 같은 finalizer key를 명시적으로 다시 실행할 수 있다", async () => {
  const gate = createGroupFinalizerGate();
  let calls = 0;
  const operation = async () => {
    calls += 1;
  };

  await gate.run("room-1:playing:123", operation);
  await gate.run("room-1:playing:123", operation, { force: true });

  assert.equal(calls, 2);
});
