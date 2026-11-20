import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";

const cases = [
  { field: "food", source: "간장", target: "발효" },
  { field: "life", source: "가전제품", target: "전자레인지" },
  { field: "environment", source: "기상", target: "태풍" },
  { field: "environment", source: "공기조화", target: "미세먼지" },
  { field: "health", source: "모카 포트", target: "카페인" },
  { field: "history", source: "국제무역", target: "비단길" },
  { field: "it", source: "인공지능", target: "챗GPT" },
  { field: "culture", source: "T1 (e스포츠)", target: "리그 오브 레전드" },
  { field: "culture", source: "기안84", target: "웹툰" },
];
const port = 4188;
const root = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--host", "127.0.0.1", "--port", String(port), "--strictPort"
], { stdio: ["ignore", "pipe", "pipe"] });
let serverOutput = "";
server.stdout.on("data", c => { serverOutput += c.toString(); });
server.stderr.on("data", c => { serverOutput += c.toString(); });
let browser;
const results = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error("Vite exited: " + serverOutput.slice(-700));
    try {
      const response = await fetch(root + "/tests/browser-fixtures/daily-goal-entryway-smoke.html");
      if (response.ok) { ready = true; break; }
    } catch { /* server boot */ }
    await sleep(250);
  }
  if (!ready) throw new Error("Vite server unavailable");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  for (const row of cases) {
    const query = new URLSearchParams({ source: row.source, target: row.target });
    let status = "PASS";
    let detail = null;
    try {
      await page.goto(root + "/tests/browser-fixtures/daily-goal-entryway-smoke.html?" + query, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForFunction(() => {
        const value = document.querySelector('[data-testid="load-state"]')?.textContent;
        return value === "READY" || value === "ERROR";
      }, { timeout: 85000 });
      const loadState = await page.locator('[data-testid="load-state"]').textContent();
      if (loadState !== "READY") {
        const error = await page.locator('[data-testid="load-error"]').textContent();
        throw new Error("PAGE_FETCH_FAILED: " + String(error).slice(0, 100));
      }
      const targetLink = page.locator('.wiki-shell a[data-wiki-title="' + row.target + '"]');
      const count = await targetLink.count();
      if (!count) throw new Error("TARGET_NOT_CLICKABLE_IN_SANITIZED_ARTICLE");
      const clickable = targetLink.first();
      await clickable.scrollIntoViewIfNeeded({ timeout: 10000 });
      await clickable.click({ timeout: 10000 });
      const lastClick = await page.locator('[data-testid="last-click"]').textContent();
      assert.equal(lastClick, row.target);
      detail = { clickableLinks: count, clickedTarget: lastClick };
    } catch (error) {
      status = "FAIL";
      detail = { error: String(error?.message || error).slice(0, 190) };
    }
    const output = { field: row.field, source: row.source, target: row.target, status, detail };
    results.push(output);
    console.log("DAILY_GOAL_WIKIVIEWER " + JSON.stringify(output));
  }
  if (pageErrors.length) throw new Error("UNCAUGHT_BROWSER_ERRORS:" + pageErrors.slice(0, 3).join(" | "));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
const summary = {
  tested: results.length,
  passed: results.filter(x => x.status === "PASS").length,
  failed: results.filter(x => x.status === "FAIL").length,
  scope: "actual Wiki Race fetchPageData sanitizer and WikiViewer onLinkClick, not server movement or authenticated daily match",
};
console.log("DAILY_GOAL_WIKIVIEWER_SUMMARY " + JSON.stringify(summary));
if (summary.tested !== cases.length || summary.failed > 0) process.exitCode = 1;
