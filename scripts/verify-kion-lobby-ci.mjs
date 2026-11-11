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

function intersects(a, b) {
  if (!a || !b) return false;
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w > 3 && h > 3;
}

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
    const duel = page.locator("#duel");
    const group = page.locator("#group");
    await duel.locator(".wr-duel-player .wr-kion-card").first().waitFor({ state: "visible", timeout: 12000 });
    assert.equal(await duel.locator(".wr-duel-player .wr-kion-card").count(), 2, "Both joined duel players own bubbles");
    assert.equal(await group.locator(".wr-roster-row .wr-kion-card").count(), 3, "Only three joined group players own bubbles");
    assert.equal(await group.locator(".wr-roster-row--empty .wr-kion-card").count(), 0, "Empty seats never display a bubble");
    assert.equal(await page.locator(".wr-kion-room-dock").count(), 0, "Old shared feed removed");

    const trigger = duel.getByRole("button", { name: /키온 보내기/ });
    await trigger.click();
    const picker = duel.locator(".wr-kion-picker__panel");
    await picker.waitFor({ state: "visible" });
    assert.equal(await picker.locator(".wr-kion-picker__option").count(), 10);
    const panel = await picker.boundingBox();
    if (!panel || panel.x < -1 || panel.x + panel.width > width + 1) {
      await page.screenshot({path:path.join(screenshots,"picker-overflow-"+width+".png"),fullPage:true});
    }
    assert.ok(panel && panel.x >= -1 && panel.x + panel.width <= width + 1,
      "Picker fits viewport at "+width+": "+JSON.stringify(panel));
    await picker.getByRole("button", { name: /감정표현 보내기: 레디!/ }).click();
    await duel.locator(".wr-duel-player.wr-is-me .wr-kion-card").filter({ hasText: "레디!" })
      .waitFor({ state: "visible" });
    assert.equal(await duel.locator(".wr-duel-player.wr-is-me .wr-kion-card").count(), 1,
      "New own reaction replaces previous bubble");
    assert.equal(await duel.locator(".wr-duel-player:not(.wr-is-me) .wr-kion-card").count(), 1,
      "Other player's reaction is unaffected");
    assert.equal(await picker.isVisible(), false, "Picker closes after send");

    await group.getByRole("button", { name: /키온 보내기/ }).click();
    const groupPicker = group.locator(".wr-kion-picker__panel");
    await groupPicker.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    assert.equal(await groupPicker.isVisible(), false, "ESC closes group picker");

    // The speech cards must never intercept the existing profile or READY controls.
    await duel.locator(".wr-duel-player.wr-is-me .pcard[role=button]").click();
    await group.locator(".wr-roster-row.wr-is-me .pcard[role=button]").click();
    await group.getByRole("button", { name: /READY 0/ }).click();
    await group.getByRole("button", { name: /READY 1/ }).waitFor();
    await group.getByLabel("목표 문서 검색").fill("훈민정음");
    assert.equal(await group.getByLabel("목표 문서 검색").inputValue(), "훈민정음");

    for (const root of [duel, group]) {
      const cards = root.locator(".wr-kion-slot:has(.wr-kion-card)");
      for (let i = 0; i < await cards.count(); i++) {
        const card = cards.nth(i);
        const bubble = await card.locator(".wr-kion-card").boundingBox();
        const cardBox = await card.boundingBox();
        assert.ok(bubble && cardBox && bubble.x >= cardBox.x - 1 &&
          bubble.x + bubble.width <= cardBox.x + cardBox.width + 1 &&
          bubble.y >= cardBox.y - 1 && bubble.y + bubble.height <= cardBox.y + cardBox.height + 1,
          "Bubble fits occupied card at "+width+" item "+i+": "+JSON.stringify({bubble,cardBox}));
        for (const selector of [".wr-status",".pcard-avatar",".pcard-name",".wr-duel-player-tags"]) {
          const el = card.locator(selector).first();
          if (await el.count() === 0 || !(await el.isVisible())) continue;
          const rect = await el.boundingBox();
          if (intersects(bubble,rect)) {
            await page.screenshot({path:path.join(screenshots,"overlap-"+width+"-"+i+".png"),fullPage:true});
          }
          assert.ok(!intersects(bubble,rect),"Bubble cannot overlap "+selector+" at "+width+
            " item "+i+": "+JSON.stringify({bubble,rect}));
        }
      }
    }

    await page.evaluate(() => {
      document.querySelectorAll(".wr-kion-card img, .wr-kion-picker img")
        .forEach((img) => { img.loading = "eager"; });
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".wr-kion-card img")].every((img) => img.complete && img.naturalWidth > 0),
      null, { timeout: 10_000 }
    );
    const htmlWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(htmlWidth <= width + 1, "No horizontal overflow at " + width + ", found " + htmlWidth);
    assert.deepEqual(jsErrors, [], "No runtime exceptions at " + width);
    await page.screenshot({ path: path.join(screenshots, "room-lobby-" + width + ".png"), fullPage: true, animations: "disabled" });
    console.log("PASS Kion attached speech cards at " + width + "x" + height);
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill("SIGTERM");
}
