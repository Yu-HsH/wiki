import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { expect } from "@playwright/test";

const rpcUrl = name => "**/rest/v1/rpc/" + name;
const logs = (directory, name, value) =>
  fs.writeFileSync(path.join(directory, name + ".json"), JSON.stringify(value, null, 2) + "\n");
const stateRPC = { v4:"get_duel_v4_state", s5:"get_group_items_product_state_v1" };
const actionRPC = { v4:"act_duel_v4", s5:"act_group_items_product_v1" };
const raceDocument = { v4:".duel-v4-document", s5:".gip-document" };
const parryButton = { v4:".duel-v4-warning .duel-v4-parry", s5:".gip-warning button.gip-parry" };

export async function recordStart(agents, mode, directory) {
  const selector = raceDocument[mode];
  await Promise.all(agents.map(({ page }) => page.evaluate(selector => {
    const rows = [];
    const visibleTicks = new Set();
    const sample = () => {
      const overlay = document.querySelector(".item-race-countdown");
      const race = document.querySelector(selector);
      const digit = overlay?.querySelector(".countdown-number");
      const row = {
        wallTimeMs: Date.now(),
        scheduledStartMs: Number(overlay?.dataset.serverStartAt) || null,
        stage: overlay?.dataset.countdownStage ?? null,
        tick: digit?.textContent ?? null,
        intro: Boolean(document.querySelector(".item-race-intro")),
        playing: Boolean(race),
        documentReady: Boolean(race?.querySelector("article.article-content a[data-wiki-title]")),
      };
      if (row.stage==="countdown" && digit && Number(getComputedStyle(digit).opacity)>=0.5) visibleTicks.add(row.tick);
      const last = rows.at(-1);
      if ((overlay || race) && (!last || Object.keys(row).slice(1).some(key => last[key] !== row[key]))) rows.push(row);
    };
    window.reviewStart = { rows, visibleTicks, timer:setInterval(sample, 25) };
  }, selector)));

  return async ({ requestedAt, serverStartedAt, verify = () => {} }) => {
    const trace = await Promise.all(agents.map(async ({ page }, index) => {
      const width = page.viewportSize().width;
      const prefix = path.join(directory, `${mode}-start-${index + 1}-${width}px`);
      await expect(page.locator('[data-countdown-stage="intro"]')).toBeVisible({ timeout:15_000 });
      if (index < 2) {
        await page.waitForFunction(()=>Number(document.querySelector(".item-race-intro [data-cinematic-ms]")?.dataset.cinematicMs)>=1400);
        await page.screenshot({ path:prefix+"-intro.png" });
      }
      await expect(page.locator('[data-countdown-stage="countdown"] .countdown-number')).toHaveText("3", { timeout:10_000 });
      if (index < 2) {
        await page.waitForFunction(()=>{
          const digit = document.querySelector('[data-countdown-stage="countdown"] .countdown-number');
          return digit?.textContent==="3" && Number(getComputedStyle(digit).opacity)>=0.8;
        });
        await page.screenshot({ path:prefix+"-countdown.png" });
      }
      await expect(page.locator(selector+" article.article-content a[data-wiki-title]").first()).toBeVisible({ timeout:15_000 });
      if (index < 2) await page.screenshot({ path:prefix+"-playing.png" });
      const captured = await page.evaluate(() => {
        clearInterval(window.reviewStart.timer);
        return { rows:window.reviewStart.rows, visibleTicks:[...window.reviewStart.visibleTicks] };
      });
      return { player:index+1, width, ...captured };
    }));
    const startedAt = await serverStartedAt();
    logs(directory, mode+"-start-timeline", { requestedAt, startedAt, trace });
    for (const { rows, visibleTicks } of trace) {
      const start = rows[0]?.scheduledStartMs;
      assert.equal(start, startedAt, "same reserved server start for every player");
      assert.ok(start-requestedAt >= 7900 && start-requestedAt <= 9000, "server reserved eight seconds");
      assert.ok(rows.some(row=>row.intro));
      const ticks = rows.filter(row=>row.stage==="countdown");
      assert.deepEqual(ticks.map(row=>row.tick), ["3","2","1"]);
      assert.deepEqual(visibleTicks, ["3","2","1"]);
      assert.ok(ticks.every(row=>!row.intro && !row.playing));
      assert.ok(rows.find(row=>row.playing).wallTimeMs >= start-75, "game DOM did not open early");
      assert.ok(rows.at(-1).documentReady);
    }
    await verify(startedAt);
    console.log(`PASS ${mode} server reservation and ${trace.length} real start timelines`);
  };
}

export async function instrumentGroupAudio(context) {
  const instrument = async () => {
    window.reviewItemSounds = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes("/audio/selected/")) {
        window.reviewItemSounds.push(new URL(this.src).pathname.split("/audio/selected/")[1]);
      }
      return play.call(this);
    };
    window.reviewGroupSounds = [];
    if (location.protocol !== "http:") return;
    const { audioManager } = await import("/services/audioManager.js");
    const playCue = audioManager.play.bind(audioManager);
    audioManager.play = async (name, options) => {
      if (options?.key?.startsWith("group-start:") || options?.key?.startsWith("item-count:")) {
        const cue = { wallTimeMs:Date.now(), name, key:options.key };
        window.reviewGroupSounds.push(cue);
        cue.played = await playCue(name, options);
        return cue.played;
      }
      return playCue(name, options);
    };
    window.reviewSoundReady = true;
  };
  await context.addInitScript(instrument);
}

export async function skipGroupIntro(page) {
  await page.evaluate(() => {
    const reactToIntro = new MutationObserver(() => {
      const button = document.querySelector('[data-countdown-stage="intro"] .wr-cinematic-skip');
      if (!button) return;
      reactToIntro.disconnect();
      window.reviewSkippedAt = Date.now();
      button.click();
    });
    reactToIntro.observe(document.body, { childList:true, subtree:true });
  });
}

export async function verifyGroupAudio(agents, rejoin, directory, startMs) {
  const skipped = agents[2].page;
  const sound = page=>page.evaluate(()=>window.reviewGroupSounds);
  const initial = await Promise.all(agents.map(({ page })=>sound(page)));
  const skippedAt = await skipped.evaluate(()=>window.reviewSkippedAt);
  assert.ok(skippedAt && skippedAt <= startMs-3600);
  const opening = initial[0].filter(cue=>cue.key.endsWith(":roster") && cue.name==="open");
  assert.equal(opening.length,1);
  assert.equal(opening[0].played,true,"opening audio actually played");
  assert.ok(opening[0].wallTimeMs >= startMs-7000 && opening[0].wallTimeMs <= startMs-6600);
  assert.equal(initial[2].filter(cue=>cue.key.startsWith("group-start:")).length, 0);
  await expect(rejoin.locator(".gip-document article.article-content a[data-wiki-title]").first()).toBeVisible({timeout:15_000});
  await rejoin.waitForFunction(()=>window.reviewSoundReady);
  const reconnected = (await sound(rejoin)).filter(cue=>cue.key.startsWith("group-start:"));
  assert.deepEqual(reconnected, []);
  logs(directory,"s5-start-audio",{ startMs, skippedAt, initial, reconnected });
  console.log("PASS R4 recorded one opening cue, none after early skip or reload");
}

export async function checkClockInRace({ mode, receiver, attacker, route, directory, prepare, attack, waitFor }) {
  const { page } = receiver;
  for (const recovery of [false,true]) {
    const stage = recovery ? "recovery" : "first-entry";
    const sample = [];
    const writes = [];
    let started = 0;
    let deadline;
    const readUrl = rpcUrl(stateRPC[mode]);
    const writeUrl = rpcUrl(actionRPC[mode]);
    const observe = async intercepted => {
      const order = started++;
      const sentAt = Date.now();
      if (order===0) await sleep(7000); // Before the server observes the request.
      const reply = await intercepted.fetch();
      const result = await reply.json();
      if (reply.ok()) sample.push({ order, sentAt, receivedAt:Date.now(),
        serverObservedAt:mode==="v4" ? result.serverTime : result.body?.serverObservedAt });
      return intercepted.fulfill({ response:reply });
    };
    const post = async intercepted => {
      const request = intercepted.request().postDataJSON();
      const isParry = mode==="v4" ? request.p_operation==="item" && request.p_input?.attackId : request.p_operation==="parry";
      if (!isParry) return intercepted.continue();
      const timing = { requestedAt:Date.now() };
      writes.push(timing);
      if (recovery) await sleep(Math.max(0, deadline+150-Date.now()));
      timing.forwardedAt = Date.now();
      const reply = await intercepted.fetch();
      const result = await reply.json();
      const body = mode==="s5" ? result.body : result;
      timing.code = body?.code;
      timing.serverReceivedAt = body?.authorityReceivedAt ?? null;
      return intercepted.fulfill({response:reply});
    };
    await prepare(attacker, receiver);
    // Unload the previous race document before arming the first-read delay.
    await page.goto("about:blank");
    await page.route(readUrl, observe);
    await page.route(writeUrl, post);
    try {
      await page.goto(route, { waitUntil:"domcontentloaded" });
      const first = await waitFor(()=>sample.find(row=>row.order===0), `${mode} ${stage} slow first read`,80,200);
      await page.evaluate(()=>window.dispatchEvent(new Event("online")));
      await waitFor(()=>sample.some(row=>row.order>0 && row.receivedAt-row.sentAt<350),
        `${mode} ${stage} fast follow-up`,80,200);
      assert.ok(first.receivedAt-first.sentAt>=6900);
      await expect(page.locator(raceDocument[mode]+" article.article-content a[data-wiki-title]").first())
        .toBeVisible({timeout:10_000});
      const accepted = await attack(attacker, receiver);
      deadline = Date.parse(accepted.dueAt);
      assert.ok(Number.isFinite(deadline));
      const parry = page.locator(parryButton[mode]);
      await expect(parry).toBeEnabled({timeout:3500});
      const shownAt = Date.now();
      const box = await parry.boundingBox();
      assert.ok(box?.width >= 63 && box?.height >= 63);
      await page.screenshot({path:path.join(directory,`${mode}-r1-${stage}.png`)});
      await parry.evaluate(button=>{button.click();button.click();});
      await waitFor(()=>writes[0]?.code, `${mode} ${stage} parry receipt`,80,100);
      assert.equal(writes.length,1, "double click produced one request");
      assert.ok(shownAt<deadline && writes[0].requestedAt<deadline, "control was actionable before the deadline");
      const expected = mode==="v4"
        ? { live:"PARRY_REFLECTED", late:"PARRY_WINDOW_CLOSED" }
        : { live:"PARRY_ACCEPTED", late:"PARRY_CLOSED" };
      assert.equal(writes[0].code, recovery ? expected.late : expected.live);
      if (recovery) {
        assert.ok(writes[0].forwardedAt>=deadline);
        if (mode==="s5") assert.ok(Date.parse(writes[0].serverReceivedAt)>=deadline);
        await expect(page.getByText(mode==="v4"?"패링 시간이 지났습니다.":"패링 시간이 지났어요.",{exact:true}).first()).toBeVisible();
      }
      logs(directory,`${mode}-r1-${stage}`,{sample,deadline,shownAt,box,writes});
      console.log(`PASS R1 ${mode} ${stage} 7s first upstream latency, fast read, live parry: ${writes[0].code}`);
    } finally {
      await page.unrouteAll({ behavior:"ignoreErrors" });
    }
  }
}

export async function checkItemReadFailure({ page, directory, waitFor }) {
  const leave = page.getByRole("button",{name:"경기 포기",exact:true});
  const settings = page.locator(".item-race-settings");
  await settings.locator("summary").click();
  await expect(leave).toBeEnabled();
  await leave.click();
  const confirm = page.getByRole("dialog").getByRole("button",{name:"이탈하기"});
  await expect(confirm).toBeEnabled();

  const counts = { roomOk:0, itemFailed:0, itemOk:0, leave:0 };
  let fail = true;
  const roomRead = async route => {
    const reply = await route.fetch();
    if (reply.ok()) counts.roomOk++;
    return route.fulfill({response:reply});
  };
  const itemRead = async route => {
    if (fail) {
      counts.itemFailed++;
      return route.fulfill({status:503,json:{message:"REVIEW_TEST_UNAVAILABLE"}});
    }
    const reply = await route.fetch();
    if (reply.ok()) counts.itemOk++;
    return route.fulfill({response:reply});
  };
  const roomWrite = route => {
    if (route.request().postDataJSON().p_operation==="leave") counts.leave++;
    return route.continue();
  };
  const roomReadUrl = rpcUrl("get_group_items_product_room_v1");
  const itemReadUrl = rpcUrl(stateRPC.s5);
  const roomWriteUrl = rpcUrl("act_group_items_product_room_v1");
  await page.route(roomReadUrl,roomRead);
  await page.route(itemReadUrl,itemRead);
  await page.route(roomWriteUrl,roomWrite);
  const reread = ()=>page.evaluate(()=>window.dispatchEvent(new Event("online")));
  try {
    await reread();
    await waitFor(()=>counts.roomOk && counts.itemFailed, "healthy room and failed item state");
    await expect(page.getByText("경기 연결을 다시 확인하고 있어요.",{exact:false}).first()).toBeVisible();
    await expect(page.locator(".gip-document .wr-readonly article.article-content")).toBeVisible();
    await expect(leave).toBeDisabled();
    await expect(confirm).toBeDisabled();
    await expect(page.locator(".item-race-slot[data-item-id]").first()).toBeDisabled();
    await confirm.evaluate(button=>button.click());
    await leave.evaluate(button=>button.click());
    await sleep(250);
    assert.equal(counts.leave,0);
    const outage = { ...counts };
    await page.screenshot({path:path.join(directory,"s5-r3-outage-modal.png")});
    fail = false;
    await reread();
    await expect(confirm).toBeEnabled({timeout:10_000});
    await expect(leave).toBeEnabled();
    assert.ok(counts.itemOk>0);
    await page.screenshot({path:path.join(directory,"s5-r3-recovered-modal.png")});
    await confirm.click();
    await waitFor(()=>counts.leave===1,"recovered leave submission");
    logs(directory,"s5-r3-item-read-outage",{outage, recovered:counts});
    console.log("PASS R3 healthy room RPC, item state 503, existing modal and leave guarded, recovery re-enabled leave");
  } finally {
    await page.unroute(roomReadUrl,roomRead);
    await page.unroute(itemReadUrl,itemRead);
    await page.unroute(roomWriteUrl,roomWrite);
  }
}
