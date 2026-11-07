import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  anchorOrderEvidence, buildTwoHopWitnessGraph, inspectObservedPaths,
  summarizeTwoHopWitness, summarizeCompletedPathProfiles,
} from "../utils/coursePathEvidence.js";

const pairs = JSON.parse(readFileSync(new URL("../data/research/path-quality-two-hop-20261107.json", import.meta.url), "utf8")).pairs;
const history = JSON.parse(readFileSync(new URL("../data/research/path-quality-played-15-20261107.json", import.meta.url), "utf8"));
const lookup = (from, to) => {
  const result = pairs.find(x => x.start === from && x.goal === to);
  assert.ok(result, "missing research pair: " + from + "→" + to);
  return result;
};

test("eleven real two-hop public-document graph observations are reproducible", () => {
  assert.equal(pairs.length, 11);
  assert.equal(lookup("대한민국", "훈민정음").cached_two_hop_total, 12);
  assert.equal(lookup("김치", "SQL").cached_two_hop_total, 2);
  assert.equal(lookup("SQL", "월드 와이드 웹").cached_two_hop_total, 13);
  assert.equal(lookup("음식", "김치").cached_two_hop_total, 4);
});

test("the same two-hop length can have very different observed first-link order", () => {
  const easyToSpot = summarizeTwoHopWitness(lookup("대한민국", "훈민정음"));
  const unusual = summarizeTwoHopWitness(lookup("김치", "SQL"));
  assert.equal(easyToSpot.distinctFirstHops, 12);
  assert.equal(unusual.distinctFirstHops, 2);
  assert.ok(easyToSpot.earliestFirstLinkOrdinal <= 65);
  assert.ok(unusual.earliestFirstLinkOrdinal >= 300);
  assert.equal(unusual.firstLinkInFirst50Count, 0);
  assert.ok(unusual.firstAnchorPercentileMin > 0.95);
  assert.equal(unusual.autoReject, false);
});

test("SQL to the web has several observed first-hop alternatives including early anchors", () => {
  const result = summarizeTwoHopWitness(lookup("SQL", "월드 와이드 웹"));
  assert.equal(result.cachedTwoHopMidpoints, 13);
  assert.equal(result.earliestFirstLinkOrdinal, 1);
  assert.ok(result.firstLinkInFirst50Count >= 2);
  assert.equal(result.shortestWorldwide, null);
});

test("no cached two-hop witness must not be interpreted as unreachable", () => {
  for (const [start, goal] of [
    ["메이플스토리", "GPT (언어 모델)"],
    ["미국의 하늘에 잘린 달 2", "2010년 FIFA 월드컵 남미 지역 예선"],
  ]) {
    const pair = lookup(start, goal);
    const result = inspectObservedPaths(buildTwoHopWitnessGraph(pair), { maxHops: 2 });
    assert.equal(result.status, "no_path_observed_in_subset");
    assert.equal(result.foundCount, 0);
    assert.equal(result.verifiedReachable, false);
    assert.equal(summarizeTwoHopWitness(pair).shortestWorldwide, null);
  }
});

test("a real observed witness is still not proof that current live revisions permit the same route", () => {
  const result = inspectObservedPaths(buildTwoHopWitnessGraph(lookup("음식", "김치")), { maxHops: 2 });
  assert.equal(result.shortestObservedHops, 2);
  assert.equal(result.distinctFirstHops, 4);
  assert.equal(result.status, "paths_observed_in_subset");
  assert.equal(result.verifiedReachable, false);
});

test("link ordinal is only an anchor-order proxy, including boundaries", () => {
  assert.equal(anchorOrderEvidence(0, 1).orderRatio, 0);
  assert.equal(anchorOrderEvidence(0, 100).band, "early_anchor_order");
  assert.equal(anchorOrderEvidence(80, 100).band, "late_anchor_order");
  assert.equal(anchorOrderEvidence(319, 321).band, "late_anchor_order");
  assert.equal(anchorOrderEvidence(321, 321).valid, false);
  assert.equal(anchorOrderEvidence(-1, 9).valid, false);
  assert.equal(anchorOrderEvidence(null, 9).band, "unknown");
});

test("bounded BFS avoids cycles, allows branching, and keeps missing-page coverage explicit", () => {
  const graph = {
    start: "A", goal: "G",
    pages: [
      { title: "A", outboundTotal: 4, links: [
        { to: "B", ordinal: 1 }, { to: "C", ordinal: 2 }, { to: "MISSING", ordinal: 3 },
        { to: "B", ordinal: 3 },
      ] },
      { title: "B", outboundTotal: 2, links: [
        { to: "A", ordinal: 0 }, { to: "G", ordinal: 1 },
      ] },
      { title: "C", outboundTotal: 1, links: [{ to: "G", ordinal: 0 }] },
    ],
  };
  const result = inspectObservedPaths(graph, { maxHops: 3 });
  assert.equal(result.foundCount, 2);
  assert.equal(result.distinctFirstHops, 2);
  assert.equal(result.shortestObservedHops, 2);
  assert.equal(result.missingPageSnapshots, 1);
  assert.equal(result.verifiedReachable, false);
});

test("search budget exhaustion returns incomplete observation, never unreachable", () => {
  const graph = { start: "A", goal: "G", pages: [
    { title: "A", outboundTotal: 3, links: [{ to: "B", ordinal: 0 }, { to: "C", ordinal: 1 }] },
    { title: "B", outboundTotal: 1, links: [{ to: "G", ordinal: 0 }] },
    { title: "C", outboundTotal: 1, links: [{ to: "G", ordinal: 0 }] },
  ] };
  const result = inspectObservedPaths(graph, { maxEdges: 1 });
  assert.equal(result.status, "no_path_observed_in_subset");
  assert.equal(result.truncated, true);
  assert.equal(result.verifiedReachable, false);
});

test("invalid graph budgets are rejected rather than silently truncating", () => {
  assert.throws(() => inspectObservedPaths({ start: "a", goal: "b" }, { maxHops: 0 }), /INVALID_BOUNDED_GRAPH_LIMITS/);
  assert.throws(() => inspectObservedPaths({ start: "a", goal: "b" }, { maxStates: -1 }), /INVALID_BOUNDED_GRAPH_LIMITS/);
});

test("15 completed real play profiles include legacy-coverage holes, not fake link failures", () => {
  const stats = summarizeCompletedPathProfiles(history.rows);
  assert.equal(stats.sessions, 15);
  assert.equal(stats.fullyObservedSessions, 13);
  assert.equal(stats.missingEvidenceSessions, 2);
  assert.equal(stats.sessionsWithRepeatedTitles, 1);
  assert.equal(stats.sessionsWithLateOrderAnchor, 4);
  assert.equal(stats.longElapsedBuckets, 1);
  assert.ok(stats.coverageRatio > 0.8 && stats.coverageRatio < 1);
  assert.equal(stats.inference, "COMPLETED_PATHS_ONLY_NOT_PERCEIVED_DIFFICULTY");
});

test("historical sampling data does not contain player identifiers or full paths", () => {
  assert.equal(history.rows.length, 15);
  for (const row of history.rows) {
    assert.equal(Object.hasOwn(row, "user_id"), false);
    assert.equal(Object.hasOwn(row, "nickname"), false);
    assert.equal(Object.hasOwn(row, "room_id"), false);
    assert.equal(Object.hasOwn(row, "run_id"), false);
    assert.equal(Object.hasOwn(row, "path_titles"), false);
    assert.equal(Object.hasOwn(row, "start_title"), false);
    assert.equal(Object.hasOwn(row, "target_title"), false);
    assert.match(row.sample_id, /^OBS-\d\d$/);
  }
});

test("invalid and partial historical path profiles cannot increase coverage", () => {
  const rows = [
    { path_steps: 3, cached_step_sources: 3, matched_steps: 3, repeated_titles: 0, late_order_steps: 0 },
    { path_steps: 2, cached_step_sources: 2, matched_steps: 4, repeated_titles: 0, late_order_steps: 0 },
  ];
  assert.equal(summarizeCompletedPathProfiles(rows).sessions, 1);
  assert.equal(summarizeCompletedPathProfiles(rows).coverageRatio, 1);
});


test("new public daily-style cases provide more paths without claiming an exhaustive graph", () => {
  const koreaRiver = summarizeTwoHopWitness(lookup("대한민국", "한강"));
  assert.equal(koreaRiver.cachedTwoHopMidpoints, 21);
  assert.equal(koreaRiver.inspectedWitnesses, 20);
  assert.equal(koreaRiver.witnessesTruncated, true);
  assert.equal(koreaRiver.earliestFirstLinkOrdinal, 6);
  const computing = summarizeTwoHopWitness(lookup("컴퓨터", "월드 와이드 웹"));
  assert.equal(computing.cachedTwoHopMidpoints, 8);
  assert.equal(computing.witnessesTruncated, false);
  assert.equal(summarizeTwoHopWitness(lookup("김치", "한강")).cachedTwoHopMidpoints, 2);
  assert.equal(summarizeTwoHopWitness(lookup("서울특별시", "한강")).cachedTwoHopMidpoints, 15);
  assert.equal(summarizeTwoHopWitness(lookup("훈민정음", "한강")).cachedTwoHopMidpoints, 5);
});
