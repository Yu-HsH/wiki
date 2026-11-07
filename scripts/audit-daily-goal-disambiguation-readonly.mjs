#!/usr/bin/env node
/**
 * Read-only audit of the 17 auto-daily word titles observed in production
 * daily_challenge_pool on 2026-11-07. No DB connection, no DB mutations.
 * Prevents mistaking today's ALREADY LOCKED daily course for a reroll target.
 *
 * Note: if an operator adds or changes pool titles, regenerate this input
 * from production metadata via a separate review, not an uncontrolled fallback.
 */
import { performance } from "node:perf_hooks";

export const DAILY_POOL_TITLES_20261107 = Object.freeze([
  "GPT (언어 모델)", "SQL", "고래상어", "광합성", "교황 프란치스코",
  "김치", "라면", "레드벨벳 (아이돌)", "메이플스토리",
  "백준 온라인 저지", "벤치 프레스", "생맥주", "월드 와이드 웹",
  "카카오톡", "한강", "화성", "훈민정음",
]);
const titleSet = new Set(DAILY_POOL_TITLES_20261107);
if (titleSet.size !== DAILY_POOL_TITLES_20261107.length) throw new Error("DUPLICATE_RESEARCH_DAILY_TITLE");
const query = new URLSearchParams({
  action: "query", titles: DAILY_POOL_TITLES_20261107.join("|"),
  prop: "pageprops", ppprop: "disambiguation", redirects: "1",
  format: "json", formatversion: "2",
});
const started = performance.now();
const resp = await fetch("https://ko.wikipedia.org/w/api.php?" + query, {
  headers: {
    "User-Agent": "WikiRaceDisambiguationResearch/0.1 (https://github.com/Yu-HsH/wiki; one-off public daily candidates audit)",
    "Accept": "application/json",
  },
  signal: AbortSignal.timeout(10000),
});
if (!resp.ok) throw Error("WIKIPEDIA_HTTP_"+resp.status);
const body = await resp.json();
if (body.error || !Array.isArray(body.query?.pages)) throw Error("WIKIPEDIA_INVALID_RESPONSE");
const aliases = new Map([
  ...(body.query?.normalized || []).map(v => [v.from,v.to]),
  ...(body.query?.redirects || []).map(v => [v.from,v.to]),
]);
const resolveTitle = original => {
  let name = original;
  for (let i = 0; i < 3 && aliases.has(name); i++) name = aliases.get(name);
  return name;
};
const byCanonical = new Map(body.query.pages.map(page => [page.title,page]));
const reports = DAILY_POOL_TITLES_20261107.map(title => {
  const page = byCanonical.get(resolveTitle(title));
  return {
    title,
    canonicalTitle: page?.title || null,
    missing: !page || page.missing !== undefined || page.invalid !== undefined,
    disambiguation: Boolean(page && Object.prototype.hasOwnProperty.call(page.pageprops || {}, "disambiguation")),
  };
});
const summary = {
  origin:"17 production daily pool target titles observed 2026-11-07",
  checked:reports.length,
  ambiguous:reports.filter(r=>r.disambiguation).map(r=>r.title),
  missing:reports.filter(r=>r.missing).map(r=>r.title),
  elapsedMs:Math.round(performance.now()-started),
  requests:1,
  note:"Existing selected daily challenges are never rerolled; this script only audits available words.",
};
console.log("DAILY_GOAL_IDENTITY_AUDIT " + JSON.stringify({ summary,reports }));
if(summary.ambiguous.length||summary.missing.length||reports.length!==17)process.exitCode=1;
