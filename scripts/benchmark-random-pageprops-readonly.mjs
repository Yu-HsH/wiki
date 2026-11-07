#!/usr/bin/env node
/**
 * Offline/CI Wikimedia *performance* probe. READ ONLY.
 * Paired fixed-title requests compare response payload / timing with and
 * without pageprops in the SAME MediaWiki Action API query, using real HTTP.
 * These are illustrative network samples, not a live production SLA.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { performance } from "node:perf_hooks";

const API = "https://ko.wikipedia.org/w/api.php";
const HEADERS = {
  "User-Agent": "WikiRaceDisambiguationResearch/0.1 (https://github.com/Yu-HsH/wiki; one-off noncommercial benchmark)",
  "Accept": "application/json",
};
const pairs = [
  "덕곡면", "한강", "광합성", "화성",
  "포니아토프스키", "김치",
];
const records = [];
const quantile = (list, q) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
};
for (let i = 0; i < pairs.length; i++) {
  const title = pairs[i];
  // AB / BA alternation limits order-related network bias.
  const methods = i % 2 === 0 ? ["baseline", "pageprops"] : ["pageprops", "baseline"];
  for (const variant of methods) {
    const params = new URLSearchParams({
      action: "query", titles: title, prop: variant === "baseline" ? "info|revisions" : "info|revisions|pageprops",
      rvprop: "ids", redirects: "1", format: "json", formatversion: "2",
    });
    if (variant === "pageprops") params.set("ppprop", "disambiguation");
    const start = performance.now();
    try {
      const response = await fetch(API + "?" + params.toString(), {
        headers: HEADERS, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("HTTP_" + response.status);
      const bytes = Buffer.byteLength(await response.text(), "utf8");
      const elapsedMs = Math.round(performance.now() - start);
      records.push({ title, variant, elapsedMs, bytes, ok: true });
      console.log("PAGEPROPS_BENCH " + JSON.stringify({ title, variant, elapsedMs, bytes }));
    } catch (error) {
      const reason = String(error?.message || error).slice(0, 90);
      records.push({ title, variant, ok: false, reason });
      console.log("PAGEPROPS_BENCH_ERROR " + JSON.stringify({ title, variant, reason }));
    }
    await sleep(1000);
  }
}
const baseline = records.filter(x => x.ok && x.variant === "baseline");
const extra = records.filter(x => x.ok && x.variant === "pageprops");
const pairsOk = pairs.filter(name => baseline.some(x => x.title === name) && extra.some(x => x.title === name));
const deltas = pairsOk.map(name => {
  const b = baseline.find(x => x.title === name), x = extra.find(x => x.title === name);
  return { title: name, deltaMs: x.elapsedMs - b.elapsedMs, deltaBytes: x.bytes - b.bytes };
});
const result = {
  attempted: records.length,
  success: records.filter(x => x.ok).length,
  pairedArticles: deltas.length,
  medianAdditionalMs: quantile(deltas.map(x => x.deltaMs), 0.5),
  p90AdditionalMs: quantile(deltas.map(x => x.deltaMs), 0.9),
  medianAdditionalBytes: quantile(deltas.map(x => x.deltaBytes), 0.5),
  sample: deltas,
  notes: [
    "Added pageprops is part of the same request, not an additional Wikimedia request.",
    "Results are small-sample internet RTT observations, NOT client/game latency guarantees.",
    "Additional RANDOM draws happen only when a disambiguation goal is encountered.",
    "No Supabase snapshot call, race, player data, or production mutation is involved.",
  ],
};
console.log("PAGEPROPS_BENCH_SUMMARY " + JSON.stringify(result));
// Fail only for a completely unavailable endpoint or if pair comparison is impossible.
if (deltas.length < 4) process.exitCode = 1;
