import test from "node:test";
import assert from "node:assert/strict";

import { buildGroupMatchHistoryRows } from "../utils/groupMatchHistory.js";

test("그룹 기록은 서버 결과의 순위와 4위까지 그대로 저장한다", () => {
  const rows = buildGroupMatchHistoryRows([
    {
      room_id: "room-1",
      user_id: "user-4",
      result_status: "finished",
      rank: 4,
      elapsed_seconds: 90,
      move_count: 12,
    },
    {
      room_id: "room-1",
      user_id: "user-2",
      result_status: "retired",
      rank: null,
    },
    {
      room_id: "room-1",
      user_id: "user-1",
      result_status: "finished",
      rank: 1,
      elapsed_seconds: 42,
      move_count: 5,
    },
    {
      room_id: "room-1",
      user_id: "guest-3",
      result_status: "finished",
      rank: 2,
      elapsed_seconds: 50,
      move_count: 6,
    },
  ], "room-1");

  assert.deepEqual(rows, [
    {
      room_id: "room-1",
      user_id: "user-1",
      rank: 1,
      elapsed_seconds: 42,
      move_count: 5,
    },
    {
      room_id: "room-1",
      user_id: "user-4",
      rank: 4,
      elapsed_seconds: 90,
      move_count: 12,
    },
  ]);
});
