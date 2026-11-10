import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";

const port = 4199;
const root = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js","--host","127.0.0.1","--port",String(port),"--strictPort",
], {stdio:["ignore","pipe","pipe"]});
let logs = "";
server.stderr.on("data", x => {logs += x.toString();});
server.stdout.on("data", x => {logs += x.toString();});
let browser;
try {
  let ready = false;
  for(let i=0;i<90;i++){
    if(server.exitCode !== null) throw new Error("VITE_EXITED: "+logs.slice(-400));
    try { if((await fetch(root+"/tests/browser-fixtures/site-news-fallback.html")).ok){ready=true;break;} }
    catch { /* boot */ }
    await sleep(250);
  }
  if(!ready) throw new Error("VITE_SERVER_NOT_READY");
  browser = await chromium.launch({headless:true});
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
    const page = await browser.newPage({viewport});
    const errors=[];
    page.on("pageerror",e => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("wiki_game_local_user",
        JSON.stringify({id:"guest-news-smoke",isGuest:true,mode:"local",displayName:"게스트"}));
    });
    await page.goto(root+"/tests/browser-fixtures/site-news-fallback.html",{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"탐험대 소식"}).waitFor({timeout:25000});
    await page.getByRole("heading",{name:/Wiki Race 2\.0\.2/}).waitFor();
    await page.getByText(/새 비공개 재경기 준비방/).waitFor();
    assert.equal(await page.getByRole("button",{name:"소식 관리"}).count(),0);
    const count=await page.locator(".wr-updates-item").count();
    assert.ok(count>=4,"legacy announcements remain visible");
    await page.goto(root+"/tests/browser-fixtures/site-news-fallback.html?view=admin");
    await page.getByText(/접근 권한이 없습니다/).waitFor({timeout:25000});
    assert.equal(await page.locator("#news-title").count(),0);
    assert.deepEqual(errors,[],"uncaught browser errors");
    console.log("SITE_NEWS_BROWSER_PASS "+JSON.stringify({viewport,publicCount:count,adminDenied:true}));
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
