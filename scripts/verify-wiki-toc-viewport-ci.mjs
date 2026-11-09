import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "@playwright/test";
if(process.env.GITHUB_ACTIONS!=="true"||process.env.CI!=="true")throw Error("REFUSED: isolated browser CI only");
const base="http://127.0.0.1:5181";
const dir=path.resolve("test-results/wiki-toc-responsive");
fs.mkdirSync(dir,{recursive:true});
let vite,browser;
async function ready(){
 for(let i=0;i<80;i++){try{const r=await fetch(base+"/tests/browser-fixtures/wiki-toc-responsive.html");if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}
 throw Error("Vite TOC fixture unreachable");
}
try{
 vite=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5181","--strictPort"],{stdio:"ignore"});
 await ready();browser=await chromium.launch({headless:true});
 for(const [width,height] of [[320,568],[390,844],[500,590],[720,640],[768,720],[1024,768]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<=500?2:1,hasTouch:width<=500,reducedMotion:"reduce"});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/tests/browser-fixtures/wiki-toc-responsive.html");
  const nav=page.getByRole("navigation",{name:"현재 문서 목차"});
  await nav.waitFor({state:"visible",timeout:15000});
  // Vite injects CSS separately from the JSX, so wait for the stylesheet as
  // well as the React node before measuring layout.
  try {
    await page.waitForFunction(() => {
      const el=document.querySelector(".wiki-nav-rail");
      return el && getComputedStyle(el).position==="fixed";
    },null,{timeout:8000});
  } catch (error) {
    console.error("TOC CSS diagnostic",await page.evaluate(()=>{
      const el=document.querySelector(".wiki-nav-rail");
      return {position:el && getComputedStyle(el).position,
        html:el?.outerHTML.slice(0,400),styles:document.styleSheets.length,
        body:document.body.className,root:document.querySelector(".wr-race")?.className,
        appStyles:[...document.querySelectorAll("style[data-vite-dev-id]")].filter(st=>st.dataset.viteDevId.includes("app.css")).map(st=>({
          id:st.dataset.viteDevId,length:st.textContent.length,
          hasNav:st.textContent.includes(".wiki-nav-rail"),
          nearNav:st.textContent.slice(Math.max(0,st.textContent.indexOf(".wiki-nav-rail")-80),st.textContent.indexOf(".wiki-nav-rail")+120)
        })),
        sheets:[...document.styleSheets].slice(0,8).map(sh=>({href:sh.href,owner:sh.ownerNode?.dataset?.viteDevId||'',count:(()=>{try{return sh.cssRules.length}catch{return -1}})()})),
        rules:[...document.styleSheets].flatMap(sheet=>{
          try{
            const found=[];
            const scan=(rules,media="")=>{
              for(const rule of rules){
                if(rule.cssRules){scan(rule.cssRules,media+" "+(rule.conditionText||""));continue;}
                if(!rule.selectorText)continue;
                if(rule.selectorText.includes("wiki-nav-rail")||rule.style?.position==="static"){
                  let matched=false;try{matched=el.matches(rule.selectorText);}catch{}
                  found.push({selector:rule.selectorText,position:rule.style?.position,matched,
                    media:media.trim(),styles:rule.cssText.slice(0,220)});
                }
              }
            };
            scan(sheet.cssRules);return found;
          }catch{return [];}
        }).slice(-35)};
    }));
    throw error;
  }
  if(width<=760){
    const geom=await nav.evaluate(el=>{
      const rect=el.getBoundingClientRect(),btn=el.querySelector("button").getBoundingClientRect();
      return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,height:rect.height,width:rect.width,
        btnWidth:btn.width,btnHeight:btn.height,innerH:innerHeight,innerW:innerWidth,
        display:getComputedStyle(el.querySelector(".wiki-nav-section-list")).display,
        position:getComputedStyle(el).position};
    });
    assert.equal(geom.position,"fixed");
    assert.equal(geom.display,"none","collapsed TOC must hide long heading list");
    assert.ok(geom.height<=70 && geom.btnWidth>=44 && geom.btnHeight>=44,"small but touchable toggle");
    assert.ok(geom.left>=-1 && geom.right<=width+1 && geom.bottom<=height-55,"TOC within viewport and above dock");
    const collapsedButton=page.getByRole("button",{name:"문서 목차 펼치기"});
    await collapsedButton.click();
    const expanded=page.getByRole("button",{name:"문서 목차 접기"});
    await expanded.waitFor({state:"visible",timeout:5000});
    assert.equal(await expanded.getAttribute("aria-expanded"),"true");
    const expandedRect=await nav.boundingBox();
    assert.ok(expandedRect && expandedRect.x>=-1 && expandedRect.x+expandedRect.width<=width+1,
      "expanded TOC doesn't overflow horizontally");
    assert.ok(expandedRect.y>=-1 && expandedRect.y+expandedRect.height<=height-55,
      "expanded TOC stays inside touch viewport above dock");
    await page.getByRole("button",{name:"목차: 17장 문서 목차"}).click();
    await page.waitForTimeout(500);
    const y=await page.evaluate(()=>scrollY);
    assert.ok(y>100,"TOC navigates within article");
    await expanded.click();
    assert.equal(await collapsedButton.getAttribute("aria-expanded"),"false");
  }else{
    const p=await nav.evaluate(el=>getComputedStyle(el).position);
    assert.equal(p,"fixed");
  }
  await page.screenshot({path:path.join(dir,`toc-${width}.png`),animations:"disabled"});
  assert.deepEqual(errors,[],"No renderer errors "+width);
  console.log("PASS #34 TOC responsive",width,"x",height,"toggle and heading scroll");
  await ctx.close();
 }
}finally{
 if(browser)await browser.close().catch(()=>{});
 if(vite)vite.kill("SIGTERM");
}
