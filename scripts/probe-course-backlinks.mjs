/**
 * One-off, READ-ONLY MediaWiki backlinks probe.
 * 13 focus targets only by default; never invoked by a user's game request.
 * Complies with the Wikimedia descriptive User-Agent guidance and limits to ~1 rps.
 * Measurements are lower bounds when continuation is present. NOT a server-wide quality gate.
 */
import { readFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";

const corpus = JSON.parse(readFileSync(new URL("../data/research/course-quality-sample-20261107.json", import.meta.url), "utf8"));
const candidates = corpus.sample.filter(row => row.cohort === "focus");
const maxArg = process.argv.find(arg => arg.startsWith("--limit="));
const maximum = maxArg ? Number(maxArg.slice("--limit=".length)) : 13;
if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 50) throw new Error("limit must be an integer between 1 and 50");

const API = "https://ko.wikipedia.org/w/api.php";
const HEADERS = {
  "User-Agent": "WikiRaceQualityResearchBot/0.1 (https://github.com/Yu-HsH/wiki; read-only public API study)",
  "Accept": "application/json",
};
const results = [];
for (const item of candidates.slice(0, maximum)) {
  const url = new URL(API);
  for (const [key, val] of Object.entries({
    action: "query", list: "backlinks", bltitle: item.title,
    blnamespace: "0", blfilterredir: "nonredirects",
    bllimit: "50", format: "json", formatversion: "2",
  })) url.searchParams.set(key, val);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("HTTP_" + response.status);
    const data = await response.json();
    if (data?.error || !Array.isArray(data?.query?.backlinks)) throw new Error("INVALID_MEDIAWIKI_RESPONSE");
    const row = {
      title: item.title,
      cachedInbound: item.cached_inbound_sources,
      apiSampleCount: data.query.backlinks.length,
      apiHasMore: Boolean(data.continue),
      // We do not follow continuation: reported count is a lower bound at 50.
      apiCountKind: data.continue ? "at_least" : "complete",
    };
    results.push({ ...row, ok: true });
    console.log("PROBE_JSON " + JSON.stringify(row));
  } catch (error) {
    const failure = { title: item.title, ok: false, error: String(error?.message || error).slice(0, 120) };
    results.push(failure);
    console.log("PROBE_ERROR " + JSON.stringify(failure));
  }
  // A deliberate polite delay; including the last request is fine.
  await pause(1000);
}
const summary = {
  attempted: results.length, success: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length,
};
console.log("PROBE_SUMMARY " + JSON.stringify(summary));
// This probe is observational and may be network-blocked in CI. Never fail a PR for an external outage.
