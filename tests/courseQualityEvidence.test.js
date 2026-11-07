import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessDocumentEvidence, assessCourseEvidence, summarizeEvidence, assessLiveBacklinkEvidence } from "../utils/courseQualityEvidence.js";

const corpus = JSON.parse(readFileSync(new URL("../data/research/course-quality-sample-20261107.json", import.meta.url), "utf8"));
const sample = corpus.sample;
const byTitle = Object.fromEntries(sample.map(row => [row.title, row]));

test("50 actual observed snapshots include 13 focus and 37 deterministic random samples", () => {
  assert.equal(sample.length, 50);
  assert.deepEqual(summarizeEvidence(sample), {
    total: 50, focus: 13, randomSnapshot: 37,
    sparseStartCandidates: 5, absentCachedInbound: 4,
    sparseCachedInbound: sample.filter(row => row.cached_inbound_sources <= 2).length,
  });
  assert.equal(new Set(sample.map(row => row.page_id)).size, 50);
});

test("a previously frustrating pair remains a manual review candidate on cached evidence", () => {
  const result = assessCourseEvidence(
    byTitle["미국의 하늘에 잘린 달 2"],
    byTitle["2010년 FIFA 월드컵 남미 지역 예선"],
  );
  assert.equal(result.priority, "review");
  assert.equal(assessDocumentEvidence(byTitle["미국의 하늘에 잘린 달 2"]).observedHubExits, 11);
  assert.ok(result.startFlags.includes("MULTIPLE_CACHED_HUB_EXITS_DESPITE_FEW_LINKS"));
  assert.equal(result.autoReject, false);
  assert.equal(result.verifiedReachable, false);
  assert.ok(result.startFlags.includes("FEW_OUTGOING_LINKS"));
  assert.ok(result.goalFlags.includes("FEW_INBOUND_IN_CACHED_SAMPLE"));
  assert.ok(result.goalFlags.includes("NO_EARLY_INBOUND_IN_CACHED_SAMPLE"));
});

test("broad titles can have enough observed connections without proving reachability", () => {
  const result = assessCourseEvidence(byTitle["서울특별시"], byTitle["월드 와이드 웹"]);
  assert.equal(result.priority, "baseline_observed");
  assert.equal(result.autoReject, false);
  assert.equal(result.verifiedReachable, false);
});

test("sparse backlink evidence for popular topics does not become an automatic false rejection", () => {
  const result = assessCourseEvidence(byTitle["메이플스토리"], byTitle["GPT (언어 모델)"]);
  assert.equal(result.priority, "review");
  assert.equal(result.autoReject, false);
  assert.equal(assessDocumentEvidence(byTitle["GPT (언어 모델)"]).cachedInboundSources, 1);
});

test("missing measurements are unknown, never interpreted as zero", () => {
  const result = assessCourseEvidence({ outbound_links: null }, { cached_inbound_sources: null });
  assert.equal(result.priority, "unknown");
  assert.equal(result.autoReject, false);
  assert.ok(result.startFlags.includes("OUTBOUND_NOT_MEASURED"));
  assert.ok(result.goalFlags.includes("INBOUND_NOT_MEASURED"));
});

test("counts must be safe nonnegative integers", () => {
  const result = assessDocumentEvidence({ outbound_links: -1, cached_inbound_sources: "0", cached_inbound_early50: 0 });
  assert.ok(result.flags.includes("OUTBOUND_NOT_MEASURED"));
  assert.ok(result.flags.includes("INBOUND_NOT_MEASURED"));
});

test("quality triage does not mutate source measurement records", () => {
  const initial = structuredClone(sample[0]);
  assessCourseEvidence(sample[0], sample[1]);
  assert.deepEqual(sample[0], initial);
});


const live = JSON.parse(readFileSync(new URL("../data/research/course-quality-live-backlinks-20261107.json", import.meta.url), "utf8"));
const liveByTitle = Object.fromEntries(live.rows.map(row => [row.title, row]));

test("13 independent public Wikimedia backlink probes are preserved with declared cap semantics", () => {
  assert.equal(live.rows.length, 13);
  assert.equal(new Set(live.rows.map(row => row.title)).size, 13);
  assert.equal(assessLiveBacklinkEvidence(liveByTitle["고래상어"]).lowerBound, 43);
  assert.equal(assessLiveBacklinkEvidence(liveByTitle["고래상어"]).exact, true);
});

test("a low cached inbound count does not falsely label well-linked target as isolated", () => {
  assert.equal(byTitle["GPT (언어 모델)"].cached_inbound_sources, 1);
  const result = assessLiveBacklinkEvidence(liveByTitle["GPT (언어 모델)"]);
  assert.equal(result.status, "at_least_limit");
  assert.equal(result.exact, false);
  assert.equal(result.lowerBound, 50);
  assert.equal(result.autoReject, false);
});

test("zero or two actual direct backlinks are observation flags, never automatic rejection", () => {
  assert.equal(assessLiveBacklinkEvidence(liveByTitle["미국의 하늘에 잘린 달 2"]).status, "no_direct_backlinks_observed");
  assert.equal(assessLiveBacklinkEvidence(liveByTitle["백준 온라인 저지"]).status, "very_few_direct_backlinks");
  assert.equal(assessLiveBacklinkEvidence(liveByTitle["백준 온라인 저지"]).autoReject, false);
});

test("the 2010 FIFA target has >=50 direct backlinks despite only one cached inbound", () => {
  const row = liveByTitle["2010년 FIFA 월드컵 남미 지역 예선"];
  assert.equal(row.cachedInbound, 1);
  assert.equal(assessLiveBacklinkEvidence(row).status, "at_least_limit");
});

test("missing or invalid live observation is unknown, not zero", () => {
  assert.equal(assessLiveBacklinkEvidence(undefined).status, "unknown");
  assert.equal(assessLiveBacklinkEvidence({ apiSampleCount: 0 }).status, "unknown");
  assert.equal(assessLiveBacklinkEvidence({ apiSampleCount: -3, apiHasMore: false }).status, "unknown");
});


test("a sparse-looking movie start has 11 direct exits into connected cached hubs", () => {
  const movie = byTitle["미국의 하늘에 잘린 달 2"];
  assert.equal(movie.outbound_links, 17);
  assert.equal(movie.observed_hub_exits_20, 11);
  assert.equal(movie.observed_hub_exits_50, 10);
});

test("even when direct backlink and hub signals look sufficient, perceived difficulty remains unproven", () => {
  const result = assessCourseEvidence(
    byTitle["미국의 하늘에 잘린 달 2"],
    byTitle["2010년 FIFA 월드컵 남미 지역 예선"],
    { liveGoal: liveByTitle["2010년 FIFA 월드컵 남미 지역 예선"] },
  );
  assert.equal(result.priority, "baseline_observed");
  assert.equal(result.autoReject, false);
  assert.equal(result.verifiedReachable, false);
  // A previously reported frustrating course can look fine under these counts.
  // Therefore this audit is NOT suitable for enforcing automatic rerolls.
});
