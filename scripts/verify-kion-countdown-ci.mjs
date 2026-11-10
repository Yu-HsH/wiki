import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "@playwright/test";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
  throw Error("REFUSED: countdown browser QA requires isolated CI");
}
const base = "http://127.0.0.1:5196";
const fixture = base + "/tests/browser-fixtures/kion-countdown.html";
const dir = path.resolve("test-results/kion-countdown");
fs.mkdirSync(dir, {recursive:true});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, browser;

try {
  server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5196","--strictPort"],{
    stdio:"ignore", env:{...process.env,VITE_ENABLE_KION_COUNTDOWN_ANIMATION:"true"}
  });
  let ready=false;
  for(let i=0;i<90;i++){
    try{const r=await fetch(fixture);if(r.ok){ready=true;break;}}catch{}
    await sleep(300);
  }
  assert.ok(ready,"countdown Vite fixture started");
  browser=await chromium.launch({headless:true});
  for(const [width,height] of [[320,720],[390,844],[768,800],[1280,900]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce"});
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",(e)=>errors.push(e.message));
    await page.goto(fixture,{waitUntil:"domcontentloaded"});
    await page.locator("#duel .wr-kion-countdown").first().waitFor({state:"visible",timeout:10000});
    assert.equal(await page.locator("#duel .wr-kion-countdown").count(),4);
    assert.equal(await page.locator("#group .wr-kion-countdown").count(),4);
    assert.equal(await page.locator("#unsupported .wr-kion-countdown").count(),0);
    assert.equal(await page.locator("#recovered .wr-kion-countdown").count(),0);
    assert.equal(await page.locator('[data-motion="ready"]').count(),6);
    assert.equal(await page.locator('[data-motion="go"]').count(),2);
    await page.evaluate(()=>document.querySelectorAll(".wr-kion-countdown img").forEach((img)=>img.loading="eager"));
    await page.waitForFunction(()=>[...document.querySelectorAll(".wr-kion-countdown img")].every((img)=>img.complete&&img.naturalWidth===256),null,{timeout:10000});
    const readyAnimation=await page.locator('#duel [data-motion="ready"] .wr-kion-sticker').first().evaluate((el)=>getComputedStyle(el).animationName);
    assert.equal(readyAnimation,"none","reduced motion must disable companion animation");
    assert.equal(await page.locator(".wr-kion-countdown").first().evaluate((el)=>getComputedStyle(el).pointerEvents),"none");
    await page.getByRole("button",{name:/다른 동작 0/}).click();
    await page.getByRole("button",{name:/다른 동작 1/}).waitFor();
    const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(scrollWidth<=width+1,"no horizontal overflow at "+width+": "+scrollWidth);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(dir,"kion-count-"+width+".png"),fullPage:true,animations:"disabled"});
    console.log("PASS Kion countdown reduced-motion "+width+"x"+height);
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:"no-preference"});
  const page=await context.newPage();
  await page.goto(fixture,{waitUntil:"domcontentloaded"});
  await page.locator("#duel .wr-kion-countdown").first().waitFor();
  const animated=await page.locator('#duel [data-motion="ready"] .wr-kion-sticker').first().evaluate((el)=>getComputedStyle(el).animationName);
  assert.ok(animated.includes("wr-kion-count-ready"),"regular motion animates ready sticker");
  await context.close();
  console.log("PASS Kion countdown optional motion");
}finally{
  if(browser)await browser.close().catch(()=>{});
  if(server)server.kill("SIGTERM");
}