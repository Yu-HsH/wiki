import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
  throw Error("REFUSED: isolated Kion lobby visual QA runs only on CI");
}
const base = "http://127.0.0.1:5192";
const fixture = base + "/tests/browser-fixtures/kion-lobby.html";
const screenshots = path.resolve("test-results/kion-lobby");
fs.mkdirSync(screenshots, { recursive: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, browser;

try {
  server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5192", "--strictPort"], { stdio: "ignore" });
  let started = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try { const response = await fetch(fixture); if (response.ok) { started = true; break; } } catch {}
    await delay(300);
  }
  if (!started) throw Error("Kion lobby Vite fixture failed to start");
  browser = await chromium.launch({ headless: true });

  for (const [width, height] of [[320, 720], [390, 844], [768, 800], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const jsErrors = [];
    page.on("pageerror", (error) => jsErrors.push(error.message));
    await page.goto(fixture, { waitUntil: "domcontentloaded" });
    await page.locator("#duel .wr-kion-room-dock").waitFor({ state: "visible", timeout: 12000 });
    assert.equal(await page.locator("#group .wr-kion-room-dock").count(), 1);

    const duel = page.locator("#duel");
    const trigger = duel.getByRole("button", { name: /키온 보내기/ });
    await trigger.click();
    const picker = duel.locator(".wr-kion-picker__panel");
    await picker.waitFor({ state: "visible" });
    assert.equal(await picker.locator(".wr-kion-picker__option").count(), 10);
    await picker.getByRole("button", { name: /감정표현 보내기: 레디!/ }).click();
    await duel.locator(".wr-kion-room-dock__reaction").filter({ hasText: "레디!" }).waitFor({ state: "visible" });
    assert.equal(await picker.isVisible(), false, "Picker closes after send");

    const group = page.locator("#group");
    await group.getByRole("button", { name: /키온 보내기/ }).click();
    await group.locator(".wr-kion-picker__panel").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    assert.equal(await group.locator(".wr-kion-picker__panel").isVisible(), false, "ESC closes group picker");

    await page.evaluate(() => {
      document.querySelectorAll(".wr-kion-room-dock img").forEach((img) => { img.loading = "eager"; });
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".wr-kion-room-dock img")].every((img) => img.complete && img.naturalWidth > 0),
      null, { timeout: 10_000 }
    );
    const htmlWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(htmlWidth <= width + 1, "No horizontal overflow at " + width + ", found " + htmlWidth);
    assert.deepEqual(jsErrors, [], "No runtime exceptions at " + width);
    await page.screenshot({ path: path.join(screenshots, "room-lobby-" + width + ".png"), fullPage: true, animations: "disabled" });
    console.log("PASS Kion lobby viewport " + width + "x" + height);
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill("SIGTERM");
}
