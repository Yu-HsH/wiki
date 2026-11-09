import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {spawn} from "node:child_process";import {chromium} from "@playwright/test";
if(process.env.GITHUB_ACTIONS!=="true"||process.env.CI!=="true")throw Error("CI ONLY");
const root="http://127.0.0.1:5184",out=path.resolve("test-results/home-banner-vector");fs.mkdirSync(out,{recursive:true});let server,browser;
async function ready(){for(let i=0;i<90;i++){try{if((await fetch(root+"/tests/browser-fixtures/home-vector-banner.html")).ok)return}catch{}await new Promise(r=>setTimeout(r,250));}throw Error("Vite start timeout");}
try{
 server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5184","--strictPort"],{stdio:"ignore"});await ready();browser=await chromium.launch({headless:true});
 for(const [width,dpr] of [[320,2],[390,2],[1440,1],[1440,2],[1920,2]]){
  const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:dpr,reducedMotion:"reduce"});
  const page=await ctx.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(root+"/tests/browser-fixtures/home-vector-banner.html");
  const hero=page.locator(".wr-veil");await hero.waitFor({state:"visible",timeout:18000});
  await page.locator(".wr-veil-art image").first().waitFor({state:"attached"});
  await page.locator(".wr-veil-copy h1").waitFor({state:"visible"});
  const result=await page.evaluate(async ()=>{
   const images=[...document.querySelectorAll(".wr-veil-art image")];
   const layers=await Promise.all(images.map(async im=>{
     const url=im.getAttribute("href"),res=await fetch(url),text=await res.text();
     return {url,status:res.status,type:res.headers.get("content-type"),isSvg:text.trimStart().startsWith("<svg"),
       hasRaster:/<image\\b|data:image\\/(?:png|jpeg|webp)|\\.(?:png|jpg|jpeg|webp)/i.test(text)};
   }));
   const banner=document.querySelector(".wr-veil");
   const art=document.querySelector(".wr-veil-art"),headline=document.querySelector(".wr-veil-copy h1"),start=document.querySelector(".wr-veil-start-visual");
   const b=banner.getBoundingClientRect(),h=headline.getBoundingClientRect(),c=start.getBoundingClientRect();
   return {layers,bounds:{banner:[b.x,b.width],headline:[h.x,h.width],cta:[c.x,c.width]},
    title:headline.textContent,cta:start.textContent,hasFallback:!!banner.querySelector(".wr-veil-fallback"),
    font:getComputedStyle(headline).fontFamily,pixelRatio:devicePixelRatio,screenWidth:innerWidth};
  });
  assert.equal(result.layers.length,4);
  assert.ok(result.layers.every(x=>x.status===200&&x.isSvg&&!x.hasRaster),"all hero layers must remain vector artwork "+JSON.stringify(result.layers));
  assert.ok(!result.hasFallback,"no blurry PNG fallback");
  assert.ok(result.title.includes("Wiki")&&result.title.includes("Race"));
  assert.ok(result.cta.includes("게임 시작"));
  assert.ok(result.bounds.headline[0]>=0 && result.bounds.headline[0]+result.bounds.headline[1]<=width+1,"HTML title clipped");
  assert.ok(result.bounds.cta[0]>=0 && result.bounds.cta[0]+result.bounds.cta[1]<=width+1,"HTML CTA clipped");
  await page.screenshot({path:path.join(out,"home-"+width+"-dpr-"+dpr+".png"),animations:"disabled"});
  await page.locator(".wr-veil-trigger").click();
  await page.waitForFunction(()=>document.body.dataset.playStarted==="true");
  assert.deepEqual(errors,[],"browser errors");
  console.log("PASS #9 vector SVG4, HTML text, full-banner button",width,"DPR",dpr);
  await ctx.close();
 }
 console.log("PASS #9 HOME banner all five DPR/viewport checks");
}finally{if(browser)await browser.close().catch(()=>{});if(server)server.kill("SIGTERM");}
