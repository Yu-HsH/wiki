import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.CI !== "true") {
  throw Error("REFUSED: isolated CI-only UI checks");
}
const base = "http://127.0.0.1:5180";
const screenshots=path.resolve("test-results/duel-search-contrast");
fs.mkdirSync(screenshots,{recursive:true});
let vite,browser;
const rgb=str=>(str.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
function luminance(c){
  return rgb(c).reduce((sum,v,i)=>{
    const n=v/255;
    return sum + (n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4) * [.2126,.7152,.0722][i];
  },0);
}
function contrast(a,b){
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
async function waitForServer(){
  for(let i=0;i<90;i++){try{if((await fetch(base+"/tests/browser-fixtures/duel-search-contrast.html")).ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}
  throw Error("Vite dev server failed to start");
}
try{
  vite=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5180","--strictPort"],{stdio:"ignore"});
  await waitForServer();
  browser=await chromium.launch({headless:true});
  for(const width of [320,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width<=390?2:1,hasTouch:width<=390});
    const page=await context.newPage();
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text());});
    const res=await page.goto(base+"/tests/browser-fixtures/duel-search-contrast.html");
    const input=page.getByRole("textbox",{name:"현재 문서에서 찾을 단어"});
    try {
      await input.waitFor({state:"visible",timeout:10000});
    } catch(e) {
      console.error("Fixture diagnostic",{
        status:res?.status(),url:page.url(),errors,
        body:(await page.locator("body").innerText()).slice(0,1500),
        html:(await page.content()).slice(0,2200),
      });
      await page.screenshot({path:path.join(screenshots,`search-debug-${width}.png`)});
      throw e;
    }
    const panel=page.locator(".game-search-panel");
    const colors=await page.evaluate(()=>{
      const input=document.querySelector(".game-search-panel__body input");
      const panel=document.querySelector(".game-search-panel");
      const message=document.querySelector(".game-search-panel__message");
      const button=document.querySelector(".game-search-panel__body button");
      const style=getComputedStyle(input);
      const rect=panel.getBoundingClientRect();
      return {
        input:style.color,caret:style.caretColor,
        inputBackground:style.backgroundColor,
        placeholder:getComputedStyle(input,"::placeholder").color,
        button:getComputedStyle(button).color,
        buttonBackground:getComputedStyle(button).backgroundColor,
        message:getComputedStyle(message).color,
        panelBackground:getComputedStyle(panel).backgroundColor,
        bounds:{left:rect.left,right:rect.right},
        width:innerWidth,
      };
    });
    assert.ok(contrast(colors.input,colors.inputBackground)>=4.5,`input contrast ${width} ${JSON.stringify(colors)}`);
    assert.ok(contrast(colors.placeholder,colors.inputBackground)>=4.5,`placeholder contrast ${width}`);
    assert.ok(contrast(colors.message,colors.panelBackground)>=4.5,`hint contrast ${width}`);
    assert.ok(contrast(colors.button,colors.buttonBackground)>=4.5,`button contrast ${width}`);
    assert.ok(colors.caret!=="rgb(255, 255, 255)",`white caret on paper ${width}`);
    assert.ok(colors.bounds.left>=-1 && colors.bounds.right<=width+1,`popup within viewport ${width}`);
    await input.focus();
    const outline=await input.evaluate(el=>getComputedStyle(el).outlineStyle);
    assert.notEqual(outline,"none",`focus outline ${width}`);

    await input.fill("없음");
    await page.getByRole("button",{name:"찾기"}).click();
    await page.getByRole("status").filter({hasText:"검색 결과가 없습니다."}).waitFor({timeout:15000});
    assert.equal(await page.locator('[data-testid="qa-state"]').getAttribute("data-count"),"0",`zero results do not consume ${width}`);
    await input.fill("반도체");
    await page.getByRole("button",{name:"찾기"}).click();
    try {
      await page.getByRole("status").filter({hasText:"3개 발견"}).waitFor({timeout:4500});
    } catch (error) {
      console.error("Search result diagnostic",{
        panel:(await panel.innerText()).slice(0,1600),
        count:await page.locator('[data-testid="qa-state"]').getAttribute("data-count"),
        busy:await page.locator('[data-testid="qa-state"]').getAttribute("data-busy"),
        input:await input.inputValue(),
        marks:await page.locator("mark.game-search-highlight").count(),
        errors
      });
      await page.screenshot({path:path.join(screenshots,`search-debug-${width}.png`)});
      throw error;
    }
    assert.equal(await page.locator('[data-testid="qa-state"]').getAttribute("data-count"),"1",`successful search consumes one use ${width}`);
    await input.fill("반도체");
    await page.getByRole("button",{name:"찾기"}).click();
    await page.getByRole("status").filter({hasText:"이미 성공 검색을 사용했습니다."}).waitFor({timeout:15000});
    assert.equal(await page.locator('[data-testid="qa-state"]').getAttribute("data-count"),"1",`second success blocked ${width}`);
    await page.screenshot({path:path.join(screenshots,`search-${width}.png`)});
    assert.deepEqual(errors,[],`browser errors ${width}`);
    console.log("PASS search item",width,"computed contrast",{
      input:contrast(colors.input,colors.inputBackground).toFixed(2),
      hint:contrast(colors.message,colors.panelBackground).toFixed(2),
      placeholder:contrast(colors.placeholder,colors.inputBackground).toFixed(2),
    });
    await context.close();
  }
  console.log("PASS #10 search contrast all 4 responsive viewports and zero/once/reject behavior");
}finally{
  if(browser)await browser.close().catch(()=>{});
  if(vite)vite.kill("SIGTERM");
}
