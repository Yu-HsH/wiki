import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("ranking screen exposes separate daily challenge and today's regular run tabs", () => {
  const ranking = source("pages/RankingPage.jsx");
  assert.match(ranking, /selectPeriod\("today_runs"\)/);
  assert.match(ranking, /selectPeriod\("daily"\)/);
  assert.match(ranking, /오늘의 기록/);
  assert.match(ranking, /오늘의 도전/);
  assert.match(ranking, /period === "today_runs"/);
  assert.match(ranking, /period === "daily"/);
  assert.match(ranking, /period === "daily" && !loading && !error && course/);
});

test("ranking service keeps normal today records separate from fixed daily course rankings", () => {
  const service = source("rankingService.js");
  assert.match(service, /period === "today_runs"/);
  assert.match(service, /\['random', 'custom'\]/);
  assert.match(service, /get_daily_course_rankings_contract_v1/);
  assert.match(service, /getKSTPeriodStartIso\(period\)/);
  assert.doesNotMatch(source("pages/RankingPage.jsx"), /fetchRankings\(\{ period: "all"/);
});
