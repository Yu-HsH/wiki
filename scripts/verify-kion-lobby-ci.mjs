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

  for (const [width, height] of [[320, 720], [360, 800], [390, 844], [430, 932], [768, 800], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const jsErrors = [];
    page.on("pageerror", (error) => jsErrors.push(error.message));
    await page.goto(fixture, { waitUntil: "domcontentloaded" });
    const duel = page.locator("#duel");
    const group = page.locator("#group");
    const groupFull = page.locator("#group-full");
    const groupSilent = page.locator("#group-silent");
    await duel.locator(".wr-duel-player .wr-kion-card").first().waitFor({ state: "visible", timeout: 12000 });
    assert.equal(await duel.locator(".wr-duel-player .wr-kion-card").count(), 2, "Both joined duel players own bubbles");
    assert.equal(await group.locator(".wr-roster-row .wr-kion-card").count(), 3, "Only three joined group players own bubbles");
    assert.equal(await group.locator(".wr-roster-row--empty .wr-kion-card").count(), 0, "Empty seats never display a bubble");
    assert.equal(await group.locator(".wr-roster-row--empty").count(), 3, "Half-filled roster has three empty seats");
    assert.equal(await groupFull.locator(".wr-roster-row .wr-kion-card").count(), 6, "All six players own a speech card");
    assert.equal(await groupFull.locator(".wr-roster-row--empty").count(), 0, "Six occupied seats leave no empty row");
    assert.equal(await groupSilent.locator(".wr-roster-row.wr-kion-slot").count(), 3);
    assert.equal(await groupSilent.locator(".wr-kion-card").count(), 0, "No bubble when reactions expire");
    for (let i = 0; i < 3; i++) {
      const quietRow = groupSilent.locator(".wr-roster-row.wr-kion-slot").nth(i);
      const activeRow = group.locator(".wr-roster-row.wr-kion-slot").nth(i);
      const [quietBox,activeBox] = await Promise.all([quietRow.boundingBox(),activeRow.boundingBox()]);
      assert.ok(quietBox && activeBox && Math.abs(quietBox.height-activeBox.height)<1,
        "A reacting player's row must not change height when emote expires at "+width);
      const quietDisplay = await quietRow.evaluate(el=>getComputedStyle(el).display);
      assert.equal(quietDisplay,"grid","No-emote READY rows preserve grid layout");
      const quietProfile = await quietRow.locator(":scope > .pcard").boundingBox();
      const quietStatus = await quietRow.locator(":scope > .wr-status").boundingBox();
      const quietComputed=await quietRow.evaluate(el=>({
        grid:getComputedStyle(el).gridTemplateRows,
        profile:{gridRow:getComputedStyle(el.querySelector(":scope > .pcard")).gridRow,height:getComputedStyle(el.querySelector(":scope > .pcard")).height},
        ready:{gridRow:getComputedStyle(el.querySelector(":scope > .wr-status")).gridRow,position:getComputedStyle(el.querySelector(":scope > .wr-status")).position}
      }));
      if (intersects(quietProfile,quietStatus)) {
        await page.screenshot({path:path.join(screenshots,"no-emote-overlap-"+width+"-"+i+".png"),fullPage:true});
      }
      assert.ok(!intersects(quietProfile,quietStatus),
        "No-emote READY doesn't overlap nickname at "+width+" row "+i+" "+
        JSON.stringify({quietProfile,quietStatus,quietComputed}));
    }
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
    await groupFull.locator(".wr-roster-row").last().locator(".pcard[role=button]").click();
    assert.match(await groupFull.locator(".fixture-foot").innerText(), /프로필 클릭 1회/);
    await group.getByLabel("목표 문서 검색").fill("훈민정음");
    assert.equal(await group.getByLabel("목표 문서 검색").inputValue(), "훈민정음");

    // Regression: the real group camp CSS used to place READY and Kion on the
    // same top-right coordinates, allowing bubbles to bleed into the next row
    // and into the picker. Every real occupied row must now have independent
    // grid cells, including an empty-sticker slot with stable dimensions.
    for (const root of [group, groupFull]) {
      const rows = root.locator(".wr-room--group .wr-roster-row.wr-kion-slot");
      for (let i = 0; i < await rows.count(); i++) {
        const row = rows.nth(i);
        const computed = await row.evaluate((el) => ({
          display: getComputedStyle(el).display,
          readyPosition: getComputedStyle(el.querySelector(":scope > .wr-status")).position,
          stickerPosition: getComputedStyle(el.querySelector(":scope > .wr-kion-card")).position,
          namePadding: getComputedStyle(el.querySelector(".pcard-name-row")).paddingRight,
        }));
        assert.equal(computed.display, "grid", "Occupied group row must use collision-free grid at "+width);
        assert.equal(computed.readyPosition, "static", "READY must not be absolutely positioned at "+width);
        assert.equal(computed.stickerPosition, "static", "Kion card must be inside grid at "+width);
        assert.equal(computed.namePadding, "0px", "No 64px padding from pre-Kion group title layout at "+width);

        const profile = await row.locator(":scope > .pcard").boundingBox();
        const ready = await row.locator(":scope > .wr-status").boundingBox();
        const bubble = await row.locator(":scope > .wr-kion-card").boundingBox();
        const rowBox = await row.boundingBox();
        assert.ok(!intersects(profile, ready), "Group READY must not cover participant at "+width+" row "+i);
        assert.ok(!intersects(profile, bubble), "Group Kion must not cover participant at "+width+" row "+i);
        assert.ok(!intersects(ready, bubble), "Group Kion must not cover READY at "+width+" row "+i);
        assert.ok(bubble && rowBox && bubble.y>=rowBox.y-1 && bubble.y+bubble.height<=rowBox.y+rowBox.height+1,
          "Kion must stay in own row at "+width+" row "+i);
        if (i + 1 < await rows.count()) {
          const next = await rows.nth(i + 1).boundingBox();
          if (width <= 760) {
            assert.ok(!intersects(bubble, next), "Kion must not cover NEXT participant at "+width+" row "+i);
          }
        }
      }
      const controls = await root.locator(".wr-kion-room-controls").boundingBox();
      const lastSticker = await rows.last().locator(":scope > .wr-kion-card").boundingBox();
      assert.ok(!intersects(controls, lastSticker), "Kion must not cover send control at "+width);
    }

    for (const root of [duel, group, groupFull]) {
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
