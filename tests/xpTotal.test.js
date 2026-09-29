import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { fetchXpRankings, normalizeXpRankingRow } from "../rankingService.js";
import { buildXpProgress, formatXp } from "../utils/xpProgress.js";

/*
 * 트랙 15b — profiles.total_xp 소비 측 (20260929090000).
 * DB 동작은 supabase/tests/xp_ledger_v1.sql §9가 검증한다. 여기는 프론트 계약만 본다.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

const migration = read("supabase/migrations/20260929090000_xp_total_v1.sql");
const rankingServiceSource = read("rankingService.js");
const rankingPageSource = read("pages/RankingPage.jsx");
const mainPageSource = read("pages/MainPage.jsx");
const xpProgressSource = read("utils/xpProgress.js");
const xpProgressComponentSource = read("components/XpProgress.jsx");

/** 체인 호출을 기록하고 마지막에 `rows`를 돌려주는 가짜 PostgREST 빌더. */
function createFakeClient(rows) {
  const calls = [];
  const builder = {
    select(columns) { calls.push(["select", columns]); return builder; },
    gt(column, value) { calls.push(["gt", column, value]); return builder; },
    order(column, options) { calls.push(["order", column, options]); return builder; },
    limit(count) {
      calls.push(["limit", count]);
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return {
    calls,
    from(table) { calls.push(["from", table]); return builder; },
  };
}

/* ── fetchXpRankings ─────────────────────────────────────── */

test("fetchXpRankings — total_xp > 0 필터, total_xp 내림차순 → created_at → id (결정 4·5)", async () => {
  const client = createFakeClient([]);
  await fetchXpRankings({ limit: 10, client });

  assert.deepEqual(client.calls, [
    ["from", "profiles"],
    ["select", "id, nickname, profile_image_url, total_xp, profile_level"],
    ["gt", "total_xp", 0],
    ["order", "total_xp", { ascending: false }],
    ["order", "created_at", { ascending: true }],
    ["order", "id", { ascending: true }],
    ["limit", 10],
  ]);
});

test("fetchXpRankings — 행을 정규화하고 서버 순서를 그대로 둔다", async () => {
  const client = createFakeClient([
    { id: "u-2", nickname: "Two", profile_image_url: null, total_xp: 1020, profile_level: 10 },
    { id: "u-1", nickname: null, profile_image_url: "https://x/a.png", total_xp: "20", profile_level: 1 },
  ]);
  const rows = await fetchXpRankings({ client });

  assert.deepEqual(rows, [
    { userId: "u-2", nickname: "Two", profileImageUrl: null, totalXp: 1020, level: 10 },
    { userId: "u-1", nickname: null, profileImageUrl: "https://x/a.png", totalXp: 20, level: 1 },
  ]);
});

test("fetchXpRankings — 전원 0이면 빈 배열이다 (빈 상태 표시)", async () => {
  assert.deepEqual(await fetchXpRankings({ client: createFakeClient([]) }), []);
  assert.deepEqual(await fetchXpRankings({ client: createFakeClient(null) }), []);
});

test("fetchXpRankings — 오류는 삼키지 않는다", async () => {
  const failure = new Error("boom");
  const client = {
    from: () => ({
      select() { return this; },
      gt() { return this; },
      order() { return this; },
      limit: () => Promise.resolve({ data: null, error: failure }),
    }),
  };
  await assert.rejects(fetchXpRankings({ client }), failure);
});

test("normalizeXpRankingRow — profile_level이 없으면 level은 null이다", () => {
  assert.equal(normalizeXpRankingRow({ id: "u", total_xp: 5 }).level, null);
  assert.equal(normalizeXpRankingRow({ id: "u", total_xp: 5 }).totalXp, 5);
});

/* ── fetchRankings (결정 3: 시그니처 불변, select만 확장) ─────── */

test("fetchRankings — 시그니처 불변, 프로필 select에 total_xp·profile_level만 추가", () => {
  assert.match(
    rankingServiceSource,
    /export async function fetchRankings\(\{ period = "all", limit = 50 \} = \{\}\)/
  );
  assert.match(rankingServiceSource, /const PROFILE_XP_COLUMNS = "total_xp, profile_level";/);
  assert.match(
    rankingServiceSource,
    /\.select\(`id, nickname, profile_image_url, \$\{PROFILE_XP_COLUMNS\}`\)\s*\.in\("id", userIds\)/
  );
});

test("로비 TOP 3 호출은 그대로다 (결정 3)", () => {
  for (const period of ["daily", "weekly", "all"]) {
    assert.match(mainPageSource, new RegExp(`fetchRankings\\(\\{ period: "${period}", limit: 3 \\}\\)`));
  }
  assert.equal(mainPageSource.includes("fetchXpRankings"), false);
});

test("RankingPage — XP 탭은 fetchXpRankings를 쓰고 빈 상태를 보여 준다", () => {
  assert.match(rankingPageSource, /fetchXpRankings\(\{ limit: 50 \}\)/);
  assert.match(rankingPageSource, /아직 XP를 얻은 탐험가가 없습니다/);
  assert.match(rankingPageSource, /level: row\.level/);
  assert.match(rankingPageSource, /level: record\.level \?\? null/);
});

/* ── 레벨 공식은 DB에만 (결정 2, C3 §3·§4) ─────────────────── */

test("프론트는 레벨 공식을 복제하지 않는다", () => {
  for (const source of [xpProgressSource, xpProgressComponentSource, rankingServiceSource]) {
    assert.equal(/level_from_total_xp|xp_to_next_level/.test(source.replace(/^\s*(\/\/|\*).*$/gm, "")), false);
    assert.equal(/25\s*\*/.test(source), false, "100 + 25 * ... 공식이 프론트에 없다");
  }
  assert.match(migration, /select public\.level_from_total_xp\(p\.total_xp\);/);
});

/* ── 진행도 표시 ─────────────────────────────────────────── */

test("buildXpProgress — 서버 쌍으로 비율과 문구를 만든다", () => {
  assert.deepEqual(
    buildXpProgress({ totalXp: 1020, level: 10, currentLevelXp: 20, nextLevelXp: 125 }),
    {
      level: 10,
      totalXp: 1020,
      currentLevelXp: 20,
      nextLevelXp: 125,
      percent: 16,
      label: "20 / 125 XP",
    }
  );
});

test("buildXpProgress — 요약이 없거나 깨졌으면 null", () => {
  assert.equal(buildXpProgress(null), null);
  assert.equal(buildXpProgress({ level: 1, currentLevelXp: 0, nextLevelXp: 0 }), null);
  assert.equal(buildXpProgress({ level: "x", currentLevelXp: 0, nextLevelXp: 100 }), null);
});

test("buildXpProgress — 범위를 넘는 값은 막대 안으로 자른다", () => {
  assert.equal(buildXpProgress({ level: 1, currentLevelXp: 150, nextLevelXp: 100 }).percent, 100);
  assert.equal(buildXpProgress({ level: 1, currentLevelXp: -5, nextLevelXp: 100 }).percent, 0);
});

test("formatXp — 천 단위 구분", () => {
  assert.equal(formatXp(12480), "12,480 XP");
  assert.equal(formatXp(null), "0 XP");
});
