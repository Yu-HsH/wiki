import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

const port = 4179;
const root = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--host", "127.0.0.1",
  "--port", String(port),
  "--strictPort",
], { stdio: ["ignore", "pipe", "pipe"] });

let browser;
let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error("Vite server exited: " + output);
    try {
      const response = await fetch(root + "/tests/browser-fixtures/goal-brief-smoke.html");
      if (response.ok) { ready = true; break; }
    } catch { /* server still starting */ }
    await sleep(250);
  }
  if (!ready) throw new Error("Vite failed to become ready: " + output);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(root + "/tests/browser-fixtures/goal-brief-smoke.html", {
    waitUntil: "networkidle",
  });

  const brief = page.locator("details.wr-target-brief");
  await expect(brief).toBeVisible();
  await expect(brief).toHaveJSProperty("open", true);
  await expect(brief.locator(".target-summary")).toContainText("데이터베이스");

  const toggle = brief.locator("summary");
  await toggle.click();
  await expect(brief).toHaveJSProperty("open", false);
  await toggle.click();
  await expect(brief).toHaveJSProperty("open", true);

  await page.locator('article a[data-wiki-title="서울특별시"]').click();
  await expect(page.getByTestId("last-click")).toHaveText("서울특별시");
  assert.deepEqual(pageErrors, []);

  console.log("Chromium mobile 390px: goal starts open, toggles, article link callback: PASS");
} catch (error) {
  console.error("Goal brief browser smoke FAILED:", error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
