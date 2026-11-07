#!/usr/bin/env node
/**
 * Read-only, offline, deterministic inspection of the 50 cached snapshots.
 * No Wikimedia API, Supabase, DB writes, or production requests are made.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assessCourseEvidence, summarizeEvidence } from "../utils/courseQualityEvidence.js";

const path = fileURLToPath(new URL("../data/research/course-quality-sample-20261107.json", import.meta.url));
const corpus = JSON.parse(readFileSync(path, "utf8"));
const rows = corpus.sample;
const summary = summarizeEvidence(rows);
const byName = new Map(rows.map(row => [row.title, row]));
const demoPairs = [
  ["미국의 하늘에 잘린 달 2", "2010년 FIFA 월드컵 남미 지역 예선"],
  ["김치", "SQL"],
  ["서울특별시", "월드 와이드 웹"],
  ["메이플스토리", "GPT (언어 모델)"],
];
const examples = demoPairs.map(([start, goal]) => ({
  start, goal,
  ...assessCourseEvidence(byName.get(start), byName.get(goal)),
}));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, examples }, null, 2));
} else {
  console.log("Wiki Race cached link evidence — READ ONLY, never authoritative difficulty");
  console.table([summary]);
  console.table(examples.map(({ start, goal, priority, autoReject }) => ({
    start, goal, priority, autoReject,
  })));
  console.log("NOTE: Metrics are from cached source snapshots only; absent backlinks are not proof of isolation.");
}
