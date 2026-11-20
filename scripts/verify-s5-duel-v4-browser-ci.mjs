// Disposable Docker-only S5 / duel-v4 multi-account browser QA.
// No hosted project, persistent credentials, or production endpoints are used.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli, runPsql } from "./supabase-runtime-common.mjs";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" ||
    readProjectId() !== TARGET_PROJECT_ID || process.env.WIKI_VALIDATION_WORKDIR ||
    process.env.SUPABASE_DB_CONTAINER) throw Error("REFUSED: disposable GitHub Actions Docker only");
const cli = runCli(["--version"]);
assert.equal(cli.status, 0);
assert.equal(cli.stdout.trim(), EXPECTED_CLI_VERSION);
const container = expectedDbContainer();
const checked = inspectContainer(container);
assert.equal(checked.status, 0);
assert.equal(JSON.parse(checked.stdout).State?.Health?.Status, "healthy");
const envResult = runCli(["--workdir", repoRoot, "status", "-o", "env"]);
assert.equal(envResult.status, 0);
const env = Object.fromEntries(envResult.stdout.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
}));
assert.equal(env.API_URL, "http://127.0.0.1:54321");
assert.ok(env.ANON_KEY && env.SERVICE_ROLE_KEY);
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const token = randomUUID().slice(0, 8);
const url = "http://127.0.0.1:5187";
const directory = path.join(repoRoot, "test-results", "s5-v4-browser");
fs.mkdirSync(directory, { recursive: true });
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = statement => {
  const result = runPsql(container, statement, { timeout: 120000 });
  if (result.status !== 0) throw Error("LOCAL SQL FAILED: " + result.stderr.slice(-2200));
  return result.stdout.trim();
};
const log = message => console.log("PASS " + message);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label, attempts = 75, interval = 450) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { const result = await check(); if (result) return result; }
    catch (error) { last = error; }
    await delay(interval);
  }
  throw Error(label + " timed out" + (last ? ": " + last.message : ""));
}
const users = [], contexts = [];
let browser, server;
async function createUser(index) {
  const username = `s5v4_${token}_${index}`, email = username + "@local.test";
  const password = `S5v4QA-${token}-${index}!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { username, nickname: "QA " + index } });
  if (error || !data?.user?.id) throw Error("LOCAL Auth create: " + error?.message);
  const client = createClient(env.API_URL, env.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  let signed;
  for (let attempt = 1; attempt <= 3; attempt++) {
    signed = await client.auth.signInWithPassword({ email, password });
    if (!signed.error && signed.data?.session) break;
    const failure = { index, attempt, name: signed.error?.name, status: signed.error?.status,
      code: signed.error?.code, message: signed.error?.message };
    console.warn("LOCAL Auth sign-in retry", JSON.stringify(failure));
    if (attempt < 3) await delay(1000 * attempt);
  }
  if (signed.error || !signed.data?.session) throw Error("LOCAL Auth sign-in failed after 3 attempts: " +
    JSON.stringify({ index, name: signed.error?.name, status: signed.error?.status,
      code: signed.error?.code, message: signed.error?.message }));
  sql("insert into public.profiles(id,username,nickname,synthetic_email) values (" +
    [data.user.id, username, "QA " + index, email].map(quote).join(",") + ") on conflict(id) do nothing;");
  const user = { id: data.user.id, client, session: signed.data.session };
  users.push(user);
  return user;
}
async function rpc(user, name, args) {
  const { data, error } = await user.client.rpc(name, args);
  if (error) throw Error(name + ": " + error.message + " (" + error.code + ")");
  return data;
}
const start = { title: "S5v4 Start " + token, pageId: "90101", revisionId: "101" };
const middle = { title: "S5v4 Middle " + token, pageId: "90102", revisionId: "102" };
const goal = { title: "S5v4 Goal " + token, pageId: "90103", revisionId: "103" };
const wiki = [start, middle, goal];
for (const item of wiki) {
  item.snapshotId = randomUUID();
  const next = wiki[Math.min(wiki.indexOf(item) + 1, 2)];
  item.html = `<div class="mw-parser-output"><h2>테스트 문서</h2><p><a href="/wiki/${encodeURIComponent(next.title)}">${next.title}</a></p></div>`;
}
function seedWiki() {
  sql("begin; insert into public.wiki_pages(page_id,canonical_title) values " +
    wiki.map(p => `(${quote(p.pageId)},${quote(p.title)})`).join(",") + ";" +
    "insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values " +
    wiki.map(p => `(${[p.snapshotId,p.pageId,p.revisionId,p.title].map(quote).join(",")})`).join(",") + ";" +
    "insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal) values " +
    [start,middle].map((p,i) => `(${[p.snapshotId,wiki[i+1].pageId,wiki[i+1].revisionId,wiki[i+1].title,wiki[i+1].title].map(quote).join(",")},0)`).join(",") + "; commit;");
}
const binding = { namespace:"ink-s4-product", schemaVersion:"candidate-v3", rulesVersion:"ink-s5-test-v1",
  catalogVersion:"ink-s5-test-v1", modePolicyVersion:"wikipedia-s5-test-v1", policyDigest:"a".repeat(64) };
const s5Start = randomUUID(), s5Goal = randomUUID();
function seedS5() {
  const b = quote(JSON.stringify(binding));
  const a = quote(s5Start), z = quote(s5Goal);
  const htmlA = `<p>시작</p><p><a href="/wiki/목표">목표</a></p>`, htmlB = `<p>목표</p>`;
  const statement = `BEGIN;
GRANT ink_product_owner TO postgres WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE ink_product_owner;
INSERT INTO ink_product.wiki_snapshots(id,page_id,revision_id,canonical_title,wiki_snapshot_id)
  VALUES (${a},'11','101','시작',gen_random_uuid()),(${z},'22','102','목표',gen_random_uuid());
INSERT INTO ink_product.wiki_links(snapshot_id,page_id,canonical_title,aliases)
  VALUES (${a},'22','목표','{}'),(${z},'11','시작','{}');
INSERT INTO ink_product.wiki_documents(snapshot_id,document_html,document_digest)
  VALUES (${a},${quote(htmlA)},encode(sha256(convert_to(${quote(htmlA)},'UTF8')),'hex')),
         (${z},${quote(htmlB)},encode(sha256(convert_to(${quote(htmlB)},'UTF8')),'hex'));
INSERT INTO ink_product.policies VALUES (${b}::jsonb,3,8,1500,${a},${z});
INSERT INTO ink_product.wiki_course_pages VALUES (${b}::jsonb,'11',${a}),(${b}::jsonb,'22',${z});
INSERT INTO ink_product.s5_phase1_policies_v1 VALUES (${b}::jsonb,'s5-phase1-20261113-v1');
INSERT INTO ink_product.s5_phase2_policies_v1 VALUES (${b}::jsonb);
INSERT INTO ink_product.s5_phase3_policies_v1 VALUES (${b}::jsonb);
INSERT INTO ink_product.entry_policy_v1 VALUES ('review',${b}::jsonb,true,1,'group-3-8-20m-third-120s-v1');
RESET ROLE;
REVOKE ink_product_owner FROM postgres GRANTED BY CURRENT_USER;
COMMIT;`;
  sql(statement);
  assert.equal(sql("select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid where r.rolname='ink_product_owner' and m.grantor=(select oid from pg_roles where rolname='postgres');"),"0");
  log("S5 review-only policy seeded without persistent owner membership");
}
function fixture(title) {
  const normalized = decodeURIComponent(String(title || "").replaceAll("_", " ")).toLowerCase();
  return wiki.find(p => p.title.toLowerCase() === normalized) || start;
}
async function interceptWiki(context) {
  await context.route("https://**/*", route => route.abort("blockedbyclient"));
  await context.route("**/functions/v1/wiki-snapshot", route => {
    let body = {}; try { body = route.request().postDataJSON() || {}; } catch {}
    const item = wiki.find(p => p.pageId === String(body.pageId) && p.revisionId === String(body.revisionId));
    if (!item) return route.fulfill({status:409,json:{code:"UNKNOWN_LOCAL_FIXTURE"}});
    return route.fulfill({status:200,json:{snapshotId:item.snapshotId,pageId:item.pageId,revisionId:item.revisionId,
      canonicalTitle:item.title,documentHtml:item.html,links:[]}});
  });
  await context.route("https://ko.wikipedia.org/**", route => {
    const request = new URL(route.request().url()), params = request.searchParams;
    const item = fixture(params.get("page") || params.get("titles") ||
      (request.pathname.includes("/page/summary/") ? decodeURIComponent(request.pathname.split("/").at(-1)) : ""));
    const next = wiki[Math.min(wiki.indexOf(item)+1,2)];
    let data;
    if (request.pathname === "/w/api.php" && params.get("list") === "random")
      data = {query:{random:[{id:start.pageId,title:start.title,ns:0}]}};
    else if (request.pathname === "/w/api.php" && params.get("prop") === "links")
      data = {query:{pages:{[item.pageId]:{pageid:item.pageId,title:item.title,
        links:[{ns:0,title:next.title}]}}}};
    else if (request.pathname === "/w/api.php" && params.get("action") === "parse")
      data = {parse:{title:item.title,pageid:item.pageId,revid:item.revisionId,text:{"*":item.html}}};
    else if (request.pathname.includes("/page/summary/"))
      data = {title:item.title,pageid:item.pageId,revision:item.revisionId,extract:"Isolated fixture"};
    else if (request.pathname === "/w/api.php" && params.get("list") === "search")
      data = {query:{search:wiki.map(p=>({title:p.title,snippet:"Test"}))}};
    else return route.fulfill({status:404,json:{code:"UNSUPPORTED_LOCAL_WIKI"}});
    return route.fulfill({status:200,json:data,headers:{"access-control-allow-origin":"*"}});
  });
}
async function actor(user, width=390) {
  const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:"block",reducedMotion:"reduce"});
  contexts.push(context);
  await context.addInitScript(session=>localStorage.setItem("sb-127-auth-token",JSON.stringify(session)),user.session);
  await interceptWiki(context);
  const page = await context.newPage();
  const errors=[]; page.on("pageerror", error=>errors.push(error.message));
  return {user,context,page,errors};
}
async function navigate(actor, relative) {
  await actor.page.goto(url + relative, {waitUntil:"domcontentloaded",timeout:60000});
}
async function s5Action(user, operation, roomId, payload={}) {
  const room = roomId ? await rpc(user,"get_group_items_product_room_v1",{p_room:roomId,p_binding:null}) : null;
  const result = await rpc(user,"act_group_items_product_room_v1",{p_operation:operation,p_room:roomId??null,
    p_request:randomUUID(),p_expected_version:room?.version??null,p_binding:binding,p_payload:payload});
  assert.equal(result.ok,true,`${operation}: ${JSON.stringify(result)}`);
  return result;
}
async function groupRound(count) {
  const members=users.slice(0,count);
  const created=await s5Action(members[0],"create",null);
  const room=created.roomId;
  const code=sql("select code from ink_product.rooms where id="+quote(room));
  for(const user of members.slice(1)) await s5Action(user,"join",null,{roomCode:code});
  for(const user of members) await s5Action(user,"ready",room);
  await s5Action(members[0],"start",room);
  const session=sql("select session_id from ink_product.rooms where id="+quote(room));
  const agents=[];
  for(let i=0;i<count;i++) {
    const a=await actor(members[i],i===0?390:1280); agents.push(a);
    await navigate(a,"/multiplayer/group-items/"+room);
  }
  for(const a of agents) {
    await a.page.locator('[data-product-group-phase="playing"]').waitFor({state:"visible",timeout:40000});
    await a.page.getByRole("button",{name:"키온 보내기"}).waitFor({state:"visible",timeout:40000});
  }
  log(`S5 ${count} authenticated Chromium clients see active gameplay and Kion dock`);
  if(count===3) {
    const sender=agents[0].page, recipient=agents[1].page;
    await waitFor(()=>sender.getByRole("button",{name:"키온 보내기"}).isEnabled(),"S5 Kion WSS join",80,300);
    await sender.getByRole("button",{name:"키온 보내기"}).click();
    await sender.getByRole("button",{name:/감정표현 보내기:/}).first().click();
    await recipient.locator(".wr-race-emotes__reaction").first().waitFor({state:"visible",timeout:15000});
    log("S5 player-to-player real WSS Kion delivery");
    await sender.screenshot({path:path.join(directory,"s5-kion-mobile-390.png"),animations:"disabled"});
    await waitFor(()=>sql("select count(*) from ink_product_engine.ink_grants_v1 where session_id="+quote(session)+" and source_round=1;") === "3",
      "S5 20-second natural supply",100,500);
    log("S5 natural first supply: 3 recipients at 20 seconds, no worker");
    await agents[0].page.reload({waitUntil:"domcontentloaded"});
    await agents[0].page.getByRole("button",{name:"키온 보내기"}).waitFor({state:"visible",timeout:20000});
    for(const width of [320,360,390,430]) {
      await agents[0].page.setViewportSize({width,height:width===320?720:width===360?800:width===390?844:932});
      await agents[0].page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      const values=await agents[0].page.evaluate(()=>({width:document.documentElement.clientWidth,
        overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
        dock:document.querySelector(".s5-kion-dock")?.getBoundingClientRect().toJSON()}));
      assert.equal(values.overflow,0,`S5 ${width}px horizontal overflow`);
      assert.ok(values.dock?.x>=-1 && values.dock?.right<=width+1,`S5 ${width}px dock clipped`);
      await agents[0].page.screenshot({path:path.join(directory,`s5-game-mobile-${width}.png`),animations:"disabled"});
    }
    log("S5 actual 320/360/390/430px mobile viewport + F5 layout");
  }
  for(const a of agents) assert.equal(a.errors.length,0,`S5 page error: ${a.errors.join("; ")}`);
  await Promise.all(agents.map(a=>a.context.close()));
  log(`S5 ${count}-player match browser phase completed`);
}
async function duelRound() {
  const members=users.slice(0,2);
  sql("insert into duel_v4.admission(user_id,expires_at) values "+
    members.map(u=>`(${quote(u.id)},clock_timestamp()+interval '1 hour')`).join(",")+";");
  const agents=[];
  for(let i=0;i<2;i++){const a=await actor(members[i],390); agents.push(a); await navigate(a,"/multiplayer/duel-v4");}
  const host=agents[0].page, guest=agents[1].page;
  await host.getByRole("button",{name:"방 만들기"}).click();
  await host.waitForURL(/\/multiplayer\/duel-v4\/[a-f0-9-]{36}$/, {timeout:20000});
  const room=host.url().split("/").at(-1);
  const code=await host.locator("[data-duel-v4-code]").innerText();
  await guest.getByLabel("방 코드").fill(code);
  await guest.getByRole("button",{name:"입장"}).click();
  await guest.waitForURL(new RegExp("/multiplayer/duel-v4/"+room+"$"),{timeout:20000});
  log("duel v4 actual UI create and join with two distinct Auth users");
  // The normal client UI exercises both snapshot preparation and target/start commands.
  await host.getByLabel("목표 문서").fill(goal.title);
  await host.getByRole("button",{name:"목표 저장"}).click();
  await waitFor(async()=>!(await host.getByRole("button",{name:"게임 시작"}).isEnabled())?false:true,
    "duel v4 target saved",55,350);
  await host.getByRole("button",{name:"게임 시작"}).click();
  await waitFor(async()=>Boolean((await rpc(members[0],"get_duel_v4_state",{p_room:room})).startedAt),
    "duel v4 actual UI start",70,400);
  for(const a of agents) await a.page.locator(".duel-v4-document").waitFor({state:"visible",timeout:30000});
  log("duel v4 actual UI start, document and two-slot inventory dock");
  sql(`update duel_v4.grants set item_id='ink' where room_id=${quote(room)} and user_id=${quote(members[0].id)} and slot=1;
       update duel_v4.grants set item_id='parry' where room_id=${quote(room)} and user_id=${quote(members[1].id)} and slot=1;`);
  await host.reload({waitUntil:"domcontentloaded"});
  await guest.reload({waitUntil:"domcontentloaded"});
  await host.locator('[data-duel-v4-item="ink"]').waitFor({state:"visible",timeout:20000});
  await guest.locator('[data-duel-v4-item="parry"]').waitFor({state:"visible",timeout:20000});
  await host.locator('[data-duel-v4-item="ink"]').click();
  await host.getByRole("button",{name:"사용",exact:true}).click();
  await guest.getByRole("button",{name:"패링"}).waitFor({state:"visible",timeout:12000});
  const parry=guest.getByRole("button",{name:"패링"});
  const box=await parry.boundingBox();
  await guest.screenshot({path:path.join(directory,"duel-v4-parry-mobile-before-click.png"),animations:"disabled"});
  console.log("MEASURE duel v4 parry at 390px",JSON.stringify(box));
  assert.ok(box?.width>=63&&box?.height>=63,"actual 390px parry touch target >=64px: "+JSON.stringify(box));
  await parry.click();
  await guest.screenshot({path:path.join(directory,"duel-v4-parry-desktop.png"),animations:"disabled"});
  log("duel v4 real ink attack and mobile parry input");
  for(const width of [320,360,390,430]) {
    await host.setViewportSize({width,height:width===320?720:width===360?800:width===390?844:932});
    await host.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const overflow=await host.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth));
    assert.equal(overflow,0,`duel v4 ${width}px horizontal overflow`);
    await host.screenshot({path:path.join(directory,`duel-v4-game-${width}.png`),animations:"disabled"});
  }
  log("duel v4 actual 320/360/390/430px responsive game");
  const original=await rpc(members[0],"get_duel_v4_state",{p_room:room});
  await host.reload({waitUntil:"domcontentloaded"});
  const restored=await rpc(members[0],"get_duel_v4_state",{p_room:room});
  assert.equal(restored.players.find(p=>p.id===members[0].id).moves,
    original.players.find(p=>p.id===members[0].id).moves,"F5 no phantom move");
  for(const a of agents) assert.equal(a.errors.length,0,"duel v4 page errors: "+a.errors.join("; "));
  await Promise.all(agents.map(a=>a.context.close()));
  log("duel v4 F5 authoritative progress retained");
}
try {
  seedWiki(); seedS5();
  for(let i=0;i<8;i++) await createUser(i+1);
  server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5187","--strictPort","--mode","s4-product-candidate"],{
    cwd:repoRoot,env:{...process.env,VITE_SUPABASE_URL:env.API_URL,VITE_SUPABASE_ANON_KEY:env.ANON_KEY,
      VITE_DUEL_ITEMS_V4_ENTRY:"1",VITE_GROUP_ITEMS_S5_ENTRY:"1",VITE_MAINTENANCE:""},stdio:"ignore"});
  await waitFor(async()=>{try{return(await fetch(url+"/login")).status<500}catch{return false}},"Vite QA host",100,300);
  browser=await chromium.launch({headless:true});
  await duelRound();
  for(const count of [3,4,8]) await groupRound(count);
  console.log("PASS LOCAL S5/DUEL-V4 MULTIACCOUNT BROWSER GATE");
} finally {
  await browser?.close().catch(()=>{});
  server?.kill("SIGTERM");
  // Never manipulate hosted users/data; workflow disposes the local DB volume.
}
