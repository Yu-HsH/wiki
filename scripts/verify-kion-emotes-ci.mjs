import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "@playwright/test";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
  throw Error("REFUSED: isolated Kion browser test only runs in CI");
}
const base = "http://127.0.0.1:5189";
const fixture = base + "/tests/browser-fixtures/kion-emotes.html";
const dir = path.resolve("test-results/kion-emotes");
fs.mkdirSync(dir, {recursive:true});
const ids = ["hello","ready","go","good","wait","hurry","wow","lol","sad","gg"];
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
let vite, browser;
async function waitForVite() {
 for(let i=0;i<90;i++){
   try { const r=await fetch(fixture); if(r.ok) return; } catch {}
   await sleep(300);
 }
 throw Error("Kion browser fixture did not start");
}
try {
 vite=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5189","--strictPort"],{stdio:"ignore"});
 await waitForVite();
 for(const id of ids){
   const res=await fetch(base+"/assets/wiki-race/emotes/kion-"+id+".webp");
   assert.equal(res.status,200,"WebP file "+id+" HTTP 200");
   assert.match(res.headers.get("content-type")||"",/webp/i,id+" MIME");
   const bytes=new Uint8Array(await res.arrayBuffer());
   assert.ok(bytes.length>10000,id+" bytes");
   assert.equal(String.fromCharCode(...bytes.slice(0,4)),"RIFF");
   assert.equal(String.fromCharCode(...bytes.slice(8,12)),"WEBP");
 }
 console.log("PASS Kion 10/10 public asset URLs");
 browser=await chromium.launch({headless:true});
 for (const [width,height] of [[320,720],[390,844],[768,800],[1280,900]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<=390?2:1,reducedMotion:"reduce"});
   const page=await context.newPage();
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.goto(fixture,{waitUntil:"domcontentloaded"});
   await page.locator('#gallery article').first().waitFor({state:"visible",timeout:12000});
   await page.evaluate(()=>document.querySelectorAll("#gallery img,#legacy-test img").forEach(img=>img.loading="eager"));
   await page.waitForFunction(()=>[...document.querySelectorAll("#gallery img,#legacy-test img")].every(img=>img.complete&&img.naturalWidth===256),null,{timeout:10000});
   assert.equal(await page.locator("#gallery article").count(),10);
   assert.equal(await page.locator("#legacy-test img").count(),5);
   assert.equal(await page.locator("#stale-test .wr-kion-bubble").count(),1,"stale reaction exists as a hidden element");
   assert.equal(await page.locator("#stale-test .wr-kion-bubble").isVisible(),false);
   await page.locator("#fallback-test .wr-kion-sticker__fallback").waitFor({state:"visible",timeout:8000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,
      "no horizontal overflow at "+width);
   const top=page.locator("#top-picker").getByRole("button",{name:/상단 선택/});
   await top.click();
   const panel=page.locator("#top-picker .wr-kion-picker__panel");
   await panel.waitFor({state:"visible"});
   assert.equal(await panel.getAttribute("data-position"),"below");
   assert.equal(await page.locator("#top-picker .wr-kion-picker__option").count(),10);
   const panelRect=await panel.boundingBox();
   assert.ok(panelRect && panelRect.x>=-1 && panelRect.x+panelRect.width<=width+1 &&
      panelRect.y>=-1 && panelRect.y+panelRect.height<=height+1,"top picker inside viewport");
   await page.keyboard.press("Escape");
   assert.equal(await panel.isVisible(),false,"Escape closes picker");
   assert.equal(await top.getAttribute("aria-expanded"),"false");
   await top.click();
   await page.locator("#top-picker").getByRole("button",{name:/감정표현 보내기: 레디!/}).click();
   assert.match(await page.locator("#selected").innerText(),/ready/);
   assert.equal(await panel.isVisible(),false,"select closes picker");
   await top.click();
   await page.locator("#gallery article").first().click();
   assert.equal(await panel.isVisible(),false,"outside click closes picker");
   const bottom=page.locator("#bottom-picker").getByRole("button",{name:/하단 선택/});
   await bottom.scrollIntoViewIfNeeded();
   await bottom.click();
   const bottomPanel=page.locator("#bottom-picker .wr-kion-picker__panel");
   await bottomPanel.waitFor({state:"visible"});
   assert.equal(await bottomPanel.getAttribute("data-position"),"above");
   const bottomRect=await bottomPanel.boundingBox();
   assert.ok(bottomRect && bottomRect.x>=-1 && bottomRect.x+bottomRect.width<=width+1 &&
      bottomRect.y>=-1 && bottomRect.y+bottomRect.height<=height+1,"bottom picker inside viewport");
   await page.screenshot({path:path.join(dir,"kion-"+width+".png"),fullPage:true,animations:"disabled"});
   assert.deepEqual(errors,[],"no JS render errors "+width);
   console.log("PASS Kion responsive viewport "+width+"x"+height);
   await context.close();
 }
} finally {
 if(browser) await browser.close().catch(()=>{});
 if(vite) vite.kill("SIGTERM");
}