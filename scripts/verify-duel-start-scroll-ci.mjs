// Disposable, fully isolated group/duel browser navigation loading QA.
// Two real authenticated clients for duel, three for group, deterministic
// Wikipedia fixture pages, real local Postgres RPCs, real Chromium DOM clicks.
// Must never read keys or touch a hosted Supabase project.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli, runPsql,
} from "./supabase-runtime-common.mjs";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" ||
    process.env.SUPABASE_DB_CONTAINER || process.env.WIKI_VALIDATION_WORKDIR ||
    readProjectId() !== TARGET_PROJECT_ID) {
  throw Error("REFUSED: disposable GitHub Actions + pinned local database only");
}
const version = runCli(["--version"]);
assert.equal(version.status,0);
assert.equal(version.stdout.trim(),EXPECTED_CLI_VERSION);
const dbContainer = expectedDbContainer();
const check=inspectContainer(dbContainer);
assert.equal(check.status,0);
assert.equal(JSON.parse(check.stdout).State?.Health?.Status,"healthy");
const envResult=runCli(["--workdir",repoRoot,"status","-o","env"]);
assert.equal(envResult.status,0);
const values=Object.fromEntries(envResult.stdout.split(/\r?\n/).flatMap(line=>{
  const m=line.match(/^([A-Z0-9_]+)=(.*)$/);
  return m?[[m[1],m[2].replace(/^['"]|['"]$/g,"")]]:[];
}));
const api=values.API_URL, publicKey=values.ANON_KEY||values.PUBLISHABLE_KEY, adminKey=values.SERVICE_ROLE_KEY;
assert.equal(api,"http://127.0.0.1:54321");
assert.ok(publicKey && adminKey);
const browserUrl="http://127.0.0.1:5182";
const runId=randomUUID().slice(0,8);
const admin=createClient(api,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const people=[],rooms=[],contexts=[];
let server,browser;
const folder=path.join(repoRoot,"test-results","duel-start-scroll");
fs.mkdirSync(folder,{recursive:true});
const sqlQuote=value=>"'"+String(value).replaceAll("'","''")+"'";
function sql(source){
  const result=runPsql(dbContainer,source,{timeout:120000});
  if(result.status!==0)throw Error("LOCAL SQL: "+result.stderr.slice(-1500));
  return result.stdout.trim();
}
function log(label){console.log("PASS "+label);}
async function waitForServer(){
  for(let i=0;i<100;i++){try{if((await fetch(browserUrl+"/login")).status<500)return;}catch{}await new Promise(r=>setTimeout(r,300));}
  throw Error("Vite HTTP server unavailable");
}
async function addUser(n){
  const alias="loading_"+runId+"_"+n;
  const email=alias+"@local.test",password="LoadingQA-"+runId+"-"+n+"!";
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:alias,nickname:"Loading QA "+n}});
  if(error||!data?.user?.id)throw Error("LOCAL user creation "+(error?.message||n));
  const user={id:data.user.id,alias,email,password};
  people.push(user);
  sql("insert into public.profiles(id,username,nickname,synthetic_email) values ("+
    [user.id,alias,"Loading QA "+n,email].map(sqlQuote).join(",")+") on conflict(id) do nothing;");
  const client=createClient(api,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw Error("LOCAL auth failed "+n);
  user.session=signed.data.session;
  user.client=client;
  return user;
}
async function rpc(user,name,args){
  const {data,error}=await user.client.rpc(name,args);
  if(error)throw Error(name+": "+error.message);
  return Array.isArray(data)?data[0]:data;
}
const first={title:"Navigation QA "+runId+" A",pageId:"overlay_"+runId+"_a",revisionId:"overlay_"+runId+"_rev_a"};
const second={title:"Navigation QA "+runId+" B",pageId:"overlay_"+runId+"_b",revisionId:"overlay_"+runId+"_rev_b"};
const fixtures=[first,second];
for(const p of fixtures){
  const next=p===first?second:first;
  p.html='<div class="mw-parser-output"><p>Loading QA article</p><p><a href="/wiki/'+encodeURIComponent(next.title).replaceAll("%20","_")+'">'+next.title+'</a></p></div>';
  p.extract="Isolated automated navigation overlay QA";
  p.snapshotId=randomUUID();
}
const byTitle=t=>fixtures.find(p=>p.title.toLowerCase()===decodeURIComponent(String(t||"").replaceAll("_"," ")).toLowerCase())||first;
function makeFixture(){
  sql("begin;\ninsert into public.wiki_pages(page_id,canonical_title) values "+
      fixtures.map(p=>"("+sqlQuote(p.pageId)+","+sqlQuote(p.title)+")").join(",")+";\n"+
      "insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values "+
      fixtures.map(p=>"("+[p.snapshotId,p.pageId,p.revisionId,p.title].map(sqlQuote).join(",")+")").join(",")+";\n"+
      "insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal) values "+
      fixtures.map((p,i)=>{const next=fixtures[1-i];return "("+[p.snapshotId,next.pageId,next.revisionId,next.title,next.title].map(sqlQuote).join(",")+",0)"}).join(",")+";\ncommit;");
}
async function installRoutes(ctx){
  // Register catch-all first; Playwright resolves the last matching route first.
  await ctx.route("https://**/*",async route=>route.abort("blockedbyclient"));
  await ctx.route("**/functions/v1/wiki-snapshot",async route=>{
    let req={};try{req=route.request().postDataJSON()||{}}catch{}
    const item=fixtures.find(p=>String(req.pageId)===p.pageId&&String(req.revisionId)===p.revisionId);
    if(!item)return route.fulfill({status:409,json:{code:"FIXTURE_IDENTITY_UNKNOWN"}});
    await route.fulfill({status:200,json:{snapshotId:item.snapshotId,pageId:item.pageId,
      revisionId:item.revisionId,canonicalTitle:item.title,documentHtml:item.html,
      links:[{pageId:(item===first?second:first).pageId,title:(item===first?second:first).title}]}});
  });
  await ctx.route("https://ko.wikipedia.org/**",async route=>{
    const req=route.request(),url=new URL(req.url()),params=url.searchParams;
    const title=params.get("page")||params.get("titles")||
      (url.pathname.includes("/page/summary/")?decodeURIComponent(url.pathname.split("/").at(-1)):"");
    const item=byTitle(title),next=item===first?second:first;
    let data;
    if(url.pathname==="/w/api.php" && params.get("prop")==="links"){
      data={query:{pages:{[item.pageId]:{pageid:item.pageId,title:item.title,links:[{ns:0,title:next.title}]}}}};
    }else if(url.pathname==="/w/api.php" && params.get("action")==="parse"){
      data={parse:{title:item.title,pageid:item.pageId,revid:item.revisionId,text:{"*":item.html}}};
    }else if(url.pathname.includes("/page/summary/")){
      data={title:item.title,pageid:item.pageId,revision:item.revisionId,extract:item.extract};
    }else if(url.pathname==="/w/api.php" && params.get("list")==="random"){
      data={query:{random:[{id:item.pageId,title:item.title,ns:0}]}};
    }else if(url.pathname==="/w/api.php" && params.get("list")==="search"){
      data={query:{search:fixtures.map(p=>({title:p.title,snippet:p.extract}))}};
    }else{
      return route.fulfill({status:404,json:{code:"UNSUPPORTED_WIKIPEDIA_TEST_API"}});
    }
    await route.fulfill({status:200,json:data,headers:{"access-control-allow-origin":"*"}});
  });
}
async function actor(user){
  const context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:"block",reducedMotion:"reduce"});
  contexts.push(context);
  await context.addInitScript(session=>localStorage.setItem("sb-127-auth-token",JSON.stringify(session)),user.session);
  await installRoutes(context);
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  return {user,context,page,errors};
}
async function browserOpen(actor,route){
  await actor.page.goto(browserUrl+route,{waitUntil:"domcontentloaded",timeout:60000});
}
async function matchRoom(mode,user,maxPlayers=3){
  const params=mode==="duel"?{p_use_items:false,p_is_public:false}:
    {p_max_players:maxPlayers,p_min_players:3,p_finish_rank_limit:3,p_is_public:false};
  const data=await rpc(user,mode==="duel"?"create_discoverable_duel_room_v1":"create_discoverable_group_room_v1",params);
  if(!data?.id)throw Error("Room RPC returned no id");
  rooms.push(data.id);
  return data;
}
async function writeGroupReady(roomId,users){
  for(let i=0;i<users.length;i++){
    const target=fixtures[i%2];
    await rpc(users[i],"submit_group_target_v2",{
      p_room_id:roomId,p_submitted_keyword:target.title,p_submitted_target_title:target.title,
      p_submitted_target_page_id:target.pageId,p_submitted_target_revision_id:target.revisionId,
    });
    await rpc(users[i],"set_group_ready",{p_room_id:roomId,p_is_ready:true});
  }
}
async function roomRow(roomId){
  return JSON.parse(sql("select row_to_json(r) from (select id,status,group_start_title,group_target_title from public.game_rooms where id="+sqlQuote(roomId)+") r;"));
}
async function delayedMoveAndAssert(actor,rpcName,linkTitle,mode){
  const page=actor.page;
  const main=page.locator(".wiki-article a[data-wiki-title], .wiki-content a[data-wiki-title], a[data-wiki-title]");
  await main.filter({hasText:linkTitle}).first().waitFor({state:"visible",timeout:30000});
  const overlay=page.locator(".page-loading-overlay");
  await page.route("**/rest/v1/rpc/"+rpcName,async route=>{
    // Keep the actual server RPC unchanged, only delay transport to make the UI observable.
    await new Promise(resolve=>setTimeout(resolve,1500));
    await route.continue();
  });
  await main.filter({hasText:linkTitle}).first().click();
  await overlay.waitFor({state:"visible",timeout:6000});
  const label=await overlay.locator(".page-loading-text").innerText();
  assert.ok(label.includes("위키 문서를 불러오는 중"),mode+" loader label");
  await page.screenshot({path:path.join(folder,mode+"-loading.png"),animations:"disabled"});
  log(mode+" overlay visible during server move");
  await overlay.waitFor({state:"hidden",timeout:30000});
  await page.screenshot({path:path.join(folder,mode+"-done.png"),animations:"disabled"});
  log(mode+" overlay removed after server move");
}
async function group(actors){
  const r=await matchRoom("group",actors[0].user,3);
  for(const other of actors.slice(1))await rpc(other.user,"join_group_room",{p_room_id:r.id});
  await writeGroupReady(r.id,actors.map(x=>x.user));
  await rpc(actors[0].user,"start_group_room_game_v2",{p_room_id:r.id});
  const room=await roomRow(r.id);
  assert.ok(room.status==="starting"||room.status==="playing","group entered starting/playing");
  if(room.status==="starting")await rpc(actors[0].user,"activate_group_room_game",{p_room_id:r.id});
  for(const a of actors)await browserOpen(a,"/multiplayer/group/game/"+r.id);
  const live=await roomRow(r.id);
  assert.ok(live.status==="playing"||live.status==="grace_period");
  const target=live.group_target_title;
  assert.ok(fixtures.some(p=>p.title===target)&&target!==live.group_start_title,"valid fixture course");
  await delayedMoveAndAssert(actors[0],"apply_group_move_v2",target,"group");
  const moves=sql("select move_count from public.room_players where room_id="+sqlQuote(r.id)+
    " and user_id="+sqlQuote(actors[0].user.id)+";");
  assert.equal(moves,"1","group actual server-authoritative move");
  log("group three distinct real accounts; real move_count=1");
  for(const a of actors)assert.equal(a.errors.length,0,"group browser errors: "+a.errors.join(";"));
}
async function duel(actors){
  const r=await matchRoom("duel",actors[0].user);
  await rpc(actors[1].user,"join_duel_room_v2",{p_room_code:r.room_code});
  await rpc(actors[0].user,"set_duel_target_v2",{
    p_room_id:r.id,p_target_title:second.title,p_target_page_id:second.pageId,
    p_target_revision_id:second.revisionId,p_is_ready:false,
  });
  // Enter the actual lobby FIRST. A React Router transition from a scrolled
  // lobby is the user-reported source of unequal initial article positions.
  for(const a of actors)await browserOpen(a,"/multiplayer/room/"+r.id);
  for(let i=0;i<actors.length;i++){
    const page=actors[i].page;
    await page.getByText("1:1 대전 준비").waitFor({state:"visible",timeout:20000});
    await page.evaluate(y=>{
      document.body.style.minHeight="350vh";
      document.documentElement.style.minHeight="350vh";
      window.scrollTo({top:y,behavior:"instant"});
    },i===0?430:910);
    const before=await page.evaluate(()=>scrollY);
    assert.ok(before>150,"each participant began at an intentionally nonzero lobby scroll position");
    console.log("Duel pregame user",i,"scrollY",before);
  }
  await rpc(actors[0].user,"start_duel_room_v2",{
    p_room_id:r.id,p_start_title:first.title,p_start_page_id:first.pageId,
    p_start_revision_id:first.revisionId,
  });
  for(const a of actors){
    await a.page.waitForURL(url=>url.pathname==="/multiplayer/game/"+r.id,{timeout:45000});
    await a.page.waitForFunction(()=>{
      return document.querySelector(".mp-game-status")?.textContent?.includes("레이스 진행 중");
    },null,{timeout:90000});
    const y=await a.page.evaluate(()=>window.scrollY);
    assert.ok(y<=2,"first playing article must be top-aligned, got "+y);
    await a.page.screenshot({path:path.join(folder,"duel-initial-"+a.user.alias+".png"),animations:"disabled"});
  }
  log("two authenticated clients started the same article at scrollY 0");
  // F5 restore must still show the authoritative ongoing article and not
  // re-run the new-race countdown alignment (source guard is separate).
  await actors[1].page.reload({waitUntil:"domcontentloaded"});
  await actors[1].page.waitForFunction(()=>{
    return document.querySelector(".mp-game-status")?.textContent?.includes("레이스 진행 중");
  },null,{timeout:90000});
  const moves=sql("select move_count from public.room_players where room_id="+sqlQuote(r.id)+
    " and user_id="+sqlQuote(actors[0].user.id)+";");
  assert.equal(moves,"0","initial document synchronization must not count as a move");
  for(const a of actors)assert.equal(a.errors.length,0,"duel browser errors: "+a.errors.join(";"));
  console.log("PASS #35 duel two-user initial scroll sync and F5 without a fake move");
}
try{
  makeFixture();
  for(let i=0;i<2;i++)await addUser(i+1);
  const env={...process.env,VITE_SUPABASE_URL:api,VITE_SUPABASE_ANON_KEY:publicKey,VITE_MAINTENANCE:""};
  server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5182","--strictPort"],
    {cwd:repoRoot,env,stdio:"ignore"});
  await waitForServer();
  browser=await chromium.launch({headless:true});
  const duelActors=[];
  for(const user of people)duelActors.push(await actor(user));
  await duel(duelActors);
  console.log("PASS #35 real duel initial scroll equivalence");
}finally{
  if(browser)await browser.close().catch(()=>{});
  if(server)server.kill("SIGTERM");
  // All persistent test data is inside the CI-owned disposable Postgres volume.
  // Workflow destroys the entire isolated volume after this job (success/fail).
}
