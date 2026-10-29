import test from "node:test";
import assert from "node:assert/strict";
import { singleCinematicRecord, groupPodiumGroups } from "../utils/cinematicPresentation.js";

test("single completion requires authoritative scalars, independently of route length", () => {
  const record = { resultStatus: "completed", startTitle: "출발", targetTitle: "목표", elapsedSeconds: 42, clickCount: 17, pathTitles: ["출발", "목표"] };
  assert.equal(singleCinematicRecord(record), record);
  assert.equal(singleCinematicRecord({ ...record, pathTitles: [] }).clickCount, 17);
  for (const patch of [{ resultStatus: "invalid" }, { elapsedSeconds: null }, { elapsedSeconds: -1 }, { clickCount: null }, { clickCount: 1.5 }, { targetTitle: "" }]) assert.equal(singleCinematicRecord({ ...record, ...patch }), null);
  assert.equal(singleCinematicRecord(null), null);
});

test("podium uses existing server ranks only; ties are grouped, missing ranks never created", () => {
  const rows = [{ key: "a", status: "완주", rank: 1 }, { key: "b", status: "완주", rank: 1 }, { key: "c", status: "완주", rank: 3 }, { key: "d", status: "리타이어", rank: 2, retired: true }, { key: "e", status: "무효", rank: 2 }];
  const before = JSON.stringify(rows);
  assert.deepEqual(groupPodiumGroups(rows).map(g => [g.rank, g.rows.map(r => r.key)]), [[3, ["c"]], [1, ["a", "b"]]]);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(groupPodiumGroups([]), []);
});
