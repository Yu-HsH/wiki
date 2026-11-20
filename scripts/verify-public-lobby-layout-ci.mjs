import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {spawn} from "node:child_process";import {chromium} from "@playwright/test";
if(process.env.GITHUB_ACTIONS!=="true"||process.env.CI!=="true")throw Error("CI ONLY");
const root="http://127.0.0.1:5183",out=path.resolve("test-results/public-lobby-responsive");fs.mkdirSync(out,{recursive:true});let server,browser;
async function ready(){for(let i=0;i<80;i++){try{if((await fetch(root+"/tests/browser-fixtures/public-lobby-layout.html")).ok)return}catch{}await new Promise(r=>setTimeout(r,300));}throw Error("Vite start timeout");}
try{server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5183","--strictPort"],{stdio:"ignore"});await ready();browser=await chromium.launch({headless:true});
for(const width of [320,390,768,1024,1440,1920]){
 const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width>=1440?2:1,reducedMotion:"reduce"}),page=await ctx.newPage();
 await page.goto(root+"/tests/browser-fixtures/public-lobby-layout.html");
 const layout=page.locator(".wr65-entry-layout");
 await layout.waitFor({state:"visible"});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector(".wr65-entry-layout")).display==="grid");
 const m=await page.evaluate(()=>{
  const fields=[".wr65-entry-layout",".mp-public-board",".mp-mode-panel",".mp-card--join",".mp-card--create",".mp-code-input"];
  const dims=Object.fromEntries(fields.map(k=>{const el=document.querySelector(k),r=el.getBoundingClientRect(),s=getComputedStyle(el);return [k,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:s.display,columns:s.gridTemplateColumns}]}));
  return {dims,bodyScrollWidth:document.documentElement.scrollWidth,innerWidth,inputs:[...document.querySelectorAll("input,button")].map(e=>({name:e.getAttribute("aria-label")||e.textContent?.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,right:e.getBoundingClientRect().right}))};
 });
 const g=m.dims,join=g[".mp-card--join"],create=g[".mp-card--create"],board=g[".mp-public-board"],panel=g[".mp-mode-panel"],input=g[".mp-code-input"];
 assert.ok(m.bodyScrollWidth<=width+2,"body overflows width "+width+": "+JSON.stringify(m));
 assert.ok(join.width>=Math.min(250,width-70),"join card too narrow at "+width+": "+join.width);
 assert.ok(create.width>=Math.min(250,width-70),"create card too narrow at "+width+": "+create.width);
 assert.ok(input.width>=110,"room code input clipped at "+width);
 assert.ok(m.inputs.every(e=>e.right<=width+2),"button or input clipped at "+width);
 if(width>=1024){assert.ok(panel.x>=board.right-1,"sidebar must be right of board at "+width);assert.ok(create.y>join.bottom-1,"join/create cards stacked at desktop "+width);}
 else {assert.ok(panel.y>=board.bottom-1,"sidebar should follow public board at "+width);if(width<=760)assert.ok(create.y>join.bottom-1,"cards stack on mobile");}
 await page.screenshot({path:path.join(out,"lobby-"+width+".png"),fullPage:true});
 console.log("PASS #11 lobby layout",width,JSON.stringify({join:Math.round(join.width),create:Math.round(create.width),panel:panel.columns}));
 await ctx.close();
}
console.log("PASS #11 all 6 responsive layouts");
}finally{if(browser)await browser.close().catch(()=>{});if(server)server.kill("SIGTERM");}
