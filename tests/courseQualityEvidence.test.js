import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessDocumentEvidence, assessCourseEvidence, summarizeEvidence } from "../utils/courseQualityEvidence.js";

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

test("a previous frustrating random pair is prioritized for review, NOT banned", () => {
  const result = assessCourseEvidence(
    byTitle["미국의 하늘에 잘린 달 2"],
    byTitle["2010년 FIFA 월드컵 남미 지역 예선"],
  );
  assert.equal(result.priority, "priority_review");
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
