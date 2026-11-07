#!/usr/bin/env node
/**
 * Read-only public Wikipedia cross-check for target articles appearing in
 * anonymized Wiki Race course reviews (no user/session IDs or raw user paths).
 * Never called by a game; 1 request/second, 8 s timeout each, 50 capped backlinks.
 */
import { setTimeout as pause } from "node:timers/promises";

const titles = [
  "황리아", "덕곡면", "영웅필살", "주런던 홍콩 경제무역대표부",
  "원성하오", "포니아토프스키", "대체물", "연애특강",
  "랑시퐁루즈역", "김용운 (야구 선수)", "SQL", "훈민정음",
  "흘러가는 나날, 밥은 맛있어", "GPT (언어 모델)", "덕곡면 (합천군)",
];
const parsed = process.argv.find(x => x.startsWith("--limit="));
const limit = parsed ? Number(parsed.split("=")[1]) : titles.length;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > titles.length) throw new Error("invalid --limit");

const base = "https://ko.wikipedia.org/w/api.php";
const headers = {
  "User-Agent": "WikiRaceResearch/0.2 (https://github.com/Yu-HsH/wiki; noncommercial offline game quality audit)",
  "Accept": "application/json",
};
const results = [];
for (const title of titles.slice(0, limit)) {
  const url = new URL(base);
  for (const [name, value] of Object.entries({
    action: "query", list: "backlinks", bltitle: title,
    blnamespace: "0", bllimit: "50", blfilterredir: "nonredirects",
    prop: "pageprops", ppprop: "disambiguation",
    titles: title, format: "json", formatversion: "2",
  })) url.searchParams.set(name, value);
  try {
    const response = await fetch(url, {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("HTTP_" + response.status);
    const data = await response.json();
    const backlinks = data?.query?.backlinks;
    const page = data?.query?.pages?.[0];
    if (!Array.isArray(backlinks) || !page) throw new Error("INVALID_QUERY_RESPONSE");
    const result = {
      title, ok: true,
      canonicalTitle: page.title,
      pageId: page.pageid ?? null,
      disambiguation: Object.hasOwn(page.pageprops || {}, "disambiguation"),
      ns0Backlinks: backlinks.length,
      backlinksCapped: Boolean(data.continue),
      // Omit source page titles from saved analytics; only count.
    };
    results.push(result);
    console.log("PLAY_GOAL_PROBE " + JSON.stringify(result));
  } catch (error) {
    const result = { title, ok: false, error: String(error?.message || error).slice(0, 130) };
    results.push(result);
    console.log("PLAY_GOAL_ERROR " + JSON.stringify(result));
  }
  await pause(1000);
}
console.log("PLAY_GOAL_SUMMARY " + JSON.stringify({
  attempted: results.length,
  successful: results.filter(x => x.ok).length,
  unavailable: results.filter(x => !x.ok).length,
  // An API failure never proves a document inaccessible.
}));
