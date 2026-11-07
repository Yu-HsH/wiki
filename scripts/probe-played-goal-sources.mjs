#!/usr/bin/env node
/** Cross-check Wikipedia *public article titles* linking to chosen target pages.
 * One-off research only; no player/guest/user identifiers.
 * Do not infer full source diversity from a truncated (50) API page.
 */
import { setTimeout as sleep } from "node:timers/promises";

const titles = [
  "황리아", "영웅필살", "주런던 홍콩 경제무역대표부",
  "덕곡면", "포니아토프스키", "원성하오",
  "김용운 (야구 선수)", "랑시퐁루즈역",
];
let successes = 0;
for (const title of titles) {
  const url = new URL("https://ko.wikipedia.org/w/api.php");
  for (const [k, v] of Object.entries({
    action: "query", list: "backlinks", bltitle: title, blnamespace: "0",
    bllimit: "50", blfilterredir: "nonredirects", format: "json", formatversion: "2",
  })) url.searchParams.set(k, v);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WikiRaceResearch/0.2 (https://github.com/Yu-HsH/wiki; bounded one-off public quality audit)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("HTTP_" + response.status);
    const data = await response.json();
    const results = data?.query?.backlinks;
    if (!Array.isArray(results)) throw new Error("INVALID_RESPONSE");
    const row = {
      title, countSample: results.length, hasMore: Boolean(data.continue),
      inboundTitles: results.map(x => x.title).filter(x => typeof x === "string").slice(0, 50),
    };
    console.log("GOAL_SOURCE_SAMPLE " + JSON.stringify(row));
    successes++;
  } catch (error) {
    console.log("GOAL_SOURCE_FAILURE " + JSON.stringify({
      title, error: String(error?.message || error).slice(0, 100),
    }));
  }
  await sleep(1000);
}
console.log("GOAL_SOURCE_SUMMARY " + JSON.stringify({ attempted: titles.length, successes }));
