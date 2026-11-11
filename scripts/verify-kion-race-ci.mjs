import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
  throw Error("REFUSED: race visual QA must run in isolated GitHub Actions");
}

const base = "http://127.0.0.1:5194";
const url = base + "/tests/browser-fixtures/kion-race.html";
const dir = path.resolve("test-results/kion-race");
fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, browser;

try {
  server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5194", "--strictPort"], { stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { const response = await fetch(url); if (response.ok) { ready = true; break; } } catch {}
    await sleep(300);
  }
  assert.ok(ready, "Kion race fixture Vite server must be ready");
  browser = await chromium.launch({ headless: true });
  for (const [width, height] of [[320, 720], [390, 844], [768, 800], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const duel = page.locator("#duel");
    const group = page.locator("#group");
    await duel.locator(".wr-race-emotes").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await group.locator(".wr-race-emotes").count(), 1);
    assert.equal(await group.locator(".wr-race-emotes__reaction").count(), 6,
      "A six-person group may have six distinct visible reactions at once");
    const trigger = duel.getByRole("button", { name: /키온 보내기/ });
    await trigger.click();
    const panel = duel.locator(".wr-kion-picker__panel");
    await panel.waitFor({ state: "visible" });
    assert.equal(await panel.locator("button").count(), 10);
    const rect = await panel.boundingBox();
    if (!rect || rect.x < -1 || rect.x + rect.width > width + 1) {
      await page.screenshot({ path: path.join(dir, "picker-overflow-" + width + ".png"), fullPage: true });
    }
    assert.ok(rect && rect.x >= -1 && rect.x + rect.width <= width + 1,
      "Picker fits horizontal viewport: width=" + width + " rect=" + JSON.stringify(rect));
    await panel.getByRole("button", { name: /감정표현 보내기: 레디!/ }).click();
    await duel.locator(".wr-race-emotes__reaction").filter({ hasText: "레디!" }).waitFor({ state: "visible" });
    assert.equal(await panel.isVisible(), false);
    await duel.getByRole("button", { name: /숨기기/ }).click();
    assert.equal(await duel.locator(".wr-race-emotes__reaction").count(), 0, "Reaction hidden");
    await duel.getByRole("button", { name: /표시하기/ }).click();
    assert.ok(await duel.locator(".wr-race-emotes__reaction").count() >= 1, "Reaction restored");
    await duel.getByRole("button", { name: /문서 링크 0/ }).click();
    await duel.getByRole("button", { name: /문서 링크 1/ }).waitFor();
    await duel.getByRole("button", { name: /아이템 사용 0/ }).click();
    await duel.getByRole("button", { name: /아이템 사용 1/ }).waitFor();
    await group.getByRole("button", { name: /키온 보내기/ }).click();
    await group.locator(".wr-kion-picker__panel").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    assert.equal(await group.locator(".wr-kion-picker__panel").isVisible(), false);
    await group.getByRole("button", { name: /문서 링크 0/ }).click();
    await group.getByRole("button", { name: /문서 링크 1/ }).waitFor();

    await page.evaluate(() => document.querySelectorAll(".wr-race-emotes img")
      .forEach((image) => { image.loading = "eager"; }));
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".wr-race-emotes img")].every((img) => img.complete && img.naturalWidth > 0),
      null, { timeout: 10000 }
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, "No horizontal document overflow: " + overflow);
    assert.deepEqual(errors, [], "No JS errors for " + width);
    await page.screenshot({
      path: path.join(dir, "race-" + width + ".png"),
      fullPage: true, animations: "disabled",
    });
    console.log("PASS Kion duel/group race " + width + "x" + height);
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill("SIGTERM");
}
