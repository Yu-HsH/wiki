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
const s5First = { title: "S5 첫 후보 " + token, pageId: "90111", revisionId: "111" };
const s5Second = { title: "S5 둘째 후보 " + token, pageId: "90112", revisionId: "112" };
const s5Candidates = [s5First, s5Second];
const wiki = [start, middle, goal, ...s5Candidates];
const outgoing = new Map([[start, middle], [middle, goal], [s5First, s5Second], [s5Second, s5First]]);
for (const item of wiki) {
  item.snapshotId = randomUUID();
  const next = outgoing.get(item);
  const link = next ? `<p><a href="/wiki/${encodeURIComponent(next.title)}">${next.title}</a></p>` : "";
  item.html = `<div class="mw-parser-output"><h2>테스트 문서</h2>${link}</div>`;
}
function seedWiki() {
  sql("begin; insert into public.wiki_pages(page_id,canonical_title) values " +
    wiki.map(p => `(${quote(p.pageId)},${quote(p.title)})`).join(",") + ";" +
    "insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values " +
    wiki.map(p => `(${[p.snapshotId,p.pageId,p.revisionId,p.title].map(quote).join(",")})`).join(",") + ";" +
    "insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal) values " +
    [...outgoing].map(([from,to]) => `(${[from.snapshotId,to.pageId,to.revisionId,to.title,to.title].map(quote).join(",")},0)`).join(",") + "; commit;");
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
    const next = outgoing.get(item);
    let data;
    if (request.pathname === "/w/api.php" && params.get("list") === "random")
      data = {query:{random:[{id:start.pageId,title:start.title,ns:0}]}};
    else if (request.pathname === "/w/api.php" && params.get("prop") === "links")
      data = {query:{pages:{[item.pageId]:{pageid:item.pageId,title:item.title,
        links:next ? [{ns:0,title:next.title}] : []}}}};
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
async function createItemRoom(actor, mode) {
  const segment = mode === "duel" ? "duel-v4" : "group-items";
  await navigate(actor,"/multiplayer?mode="+mode);
  await actor.page.getByRole("checkbox",{name:"아이템전으로 진행"}).check({timeout:20000});
  await actor.page.getByRole("button",{name:"방 생성",exact:true}).click();
  await actor.page.waitForURL(new RegExp("/multiplayer/"+segment+"/[a-f0-9-]{36}$"),{timeout:20000});
  const code = actor.page.locator(".wr-room-code-value");
  await code.waitFor({state:"visible",timeout:20000});
  return { code:(await code.innerText()).trim(), roomId:actor.page.url().split("/").at(-1) };
}
async function joinItemRoom(actor, mode, room, code) {
  const segment = mode === "duel" ? "duel-v4" : "group-items";
  await navigate(actor,"/multiplayer?mode="+mode);
  await actor.page.getByRole("textbox",{name:"방 코드"}).fill(code);
  await actor.page.getByRole("button",{name:"참가",exact:true}).click();
  await actor.page.waitForURL("**/multiplayer/"+segment+"/"+room,{timeout:20000});
}
async function readyGroup(room,members,agents) {
  for(let i=0;i<members.length;i++){
    const page=agents[i].page;
    const candidate=s5Candidates[i % s5Candidates.length];
    const search=page.getByRole("search",{name:"내 문서 후보 검색"});
    await search.getByRole("textbox").fill(candidate.title);
    await search.getByRole("button",{name:"검색",exact:true}).click();
    await page.getByRole("list",{name:"문서 후보 검색 결과"})
      .getByRole("button").filter({hasText:candidate.title}).click();
    await page.getByRole("button",{name:"후보 취소",exact:true}).waitFor({state:"visible"});
    await page.getByRole("button",{name:"준비",exact:true}).click({timeout:20000});
    await waitFor(()=>sql("select ready from ink_product.members where room_id="+quote(room)+
      " and actor_id="+quote(members[i].id))==="t",
      `S5 player ${i+1} ready acknowledged`,75,300);
  }
}
async function verifyS5FinishAndRematch(count, room, members, agents) {
  const started=await rpc(members[0],"get_group_items_product_room_v1",{p_room:room,p_binding:null});
  assert.equal(started.freeWiki,true,"S5 browser flow must use a new free-Wikipedia room");
  assert.ok(s5Candidates.some(candidate=>candidate.title===started.target?.title),"S5 must draw a submitted goal");
  const link = a=>a.page.locator(`article.article-content a[data-wiki-title="${started.target.title}"]`);
  // Every player must reach the seeded goal through the actual article click,
  // not by direct SQL updates or a fabricated terminal state.
  for(let i=0;i<count;i++){
    try {
      await link(agents[i]).waitFor({state:"visible",timeout:7000});
    } catch(error) {
      const dom=await agents[i].page.evaluate(()=>({
        phase:document.querySelector("[data-product-group-phase]")?.getAttribute("data-product-group-phase"),
        documentSource:document.querySelector("[data-product-document-source]")?.getAttribute("data-product-document-source"),
        article:document.querySelector("article.article-content")?.innerHTML.slice(0,1400),
        anchors:[...document.querySelectorAll("article a")].map(a=>({html:a.outerHTML,visible:!!a.getClientRects().length})),
        failure:document.querySelector(".gip-document")?.innerText.slice(0,700),
      }));
      console.error("S5 ARTICLE DIAGNOSTIC",JSON.stringify({count,player:i+1,dom}));
      await agents[i].page.screenshot({path:path.join(directory,`s5-${count}-missing-goal-anchor.png`),animations:"disabled"});
      throw error;
    }
    await link(agents[i]).click();
    await waitFor(()=>sql("select status from ink_product.members where room_id="+quote(room)+
      " and actor_id="+quote(members[i].id))==="finished",
      `S5 ${count} player ${i+1} real goal completion`,70,300);
    if(i===0){
      const first=agents[0].page;
      await first.getByRole("heading",{name:"1위 완주"}).waitFor({state:"visible"});
      await first.getByRole("button",{name:/관전하기/}).click();
      const watching=first.getByRole("region",{name:"상대 문서 관전"});
      await watching.getByRole("heading",{name:"경로 비교"}).waitFor({state:"visible"});
      assert.equal(await first.locator(".item-race-slots").count(),0);
      const progress=await rpc(members[0],"get_group_items_product_room_v1",{p_room:room,p_binding:null});
      const own=progress.players.find(player=>player.participantId===progress.participantId);
      assert.equal(own.rank,1);
      assert.equal(own.pathTitles.at(-1),progress.target.title);
      assert.ok(progress.players.filter(player=>player.status==="playing").every(player=>player.pathTitles==null));
    }
  }
  await waitFor(()=>sql("select phase from ink_product.rooms where id="+quote(room))==="finished",
    `S5 ${count} authoritative terminal`,100,400);
  const resultCount=()=>Number(sql("select count(*) from ink_product.results where room_id="+quote(room)));
  const projected=()=>Number(sql("select count(*) from ink_product.result_projection_v1 where room_id="+quote(room)));
  const xpCount=()=>Number(sql("select count(*) from public.xp_ledger where source_id in ("+
    "select participant_id from ink_product.results where room_id="+quote(room)+")"));
  await waitFor(()=>resultCount()===count&&projected()===count&&xpCount()>=count,
    `S5 ${count} complete result and XP projection`,65,350);
  const rankXp=sql("select string_agg(rank::text||':'||xp::text,',' order by rank) from ink_product.results where room_id="+quote(room));
  const expected=Array.from({length:count},(_,i)=>`${i+1}:${[70,55,45][i]??35}`).join(",");
  assert.equal(rankXp,expected,`S5 ${count} ranking XP`);
  for(let i=0;i<count;i++){
    const a=agents[i];
    await a.page.locator('[data-product-group-phase="finished"]').waitFor({state:"visible",timeout:30000});
    await a.page.locator('section[aria-label="아이템 그룹 결과"]').waitFor({state:"visible"});
    const expectedXp=[70,55,45][i]??35;
    const ownRoom=await rpc(members[i],"get_group_items_product_room_v1",{p_room:room,p_binding:null});
    assert.equal(ownRoom.phase,"finished");
    const own=ownRoom.results.find(row=>row.participantId===ownRoom.participantId);
    assert.equal(own?.xp,expectedXp,`S5 ${count} member ${i+1} XP`);
    assert.ok(ownRoom.players.every(player=>player.status==="finished" && player.moveCount>=1));
    assert.ok(ownRoom.players.every(player=>player.pathTitles?.at(-1)===ownRoom.target.title));
  }
  await agents[0].page.reload({waitUntil:"domcontentloaded"});
  await agents[0].page.locator('section[aria-label="아이템 그룹 결과"]').waitFor({state:"visible",timeout:20000});
  log(`S5 ${count} real goal clicks, result DOM, all ranks/XP and F5 verified`);
  const before={results:resultCount(),projection:projected(),xp:xpCount()};
  const host=agents[0].page;
  await host.getByRole("button",{name:"같은 멤버로 다시 준비하기"}).click();
  await host.waitForURL(next=>/\/multiplayer\/group-items\/[a-f0-9-]{36}$/.test(next.pathname) && next.pathname!=="/multiplayer/group-items/"+room,{timeout:20000});
  const nextRoom=host.url().split("/").at(-1);
  assert.notEqual(nextRoom,room,"S5 rematch room must be new");
  const next=await rpc(members[0],"get_group_items_product_room_v1",{p_room:nextRoom,p_binding:null});
  assert.equal(next.phase,"waiting");
  assert.equal(next.players.length,1,"S5 rematch starts with host, no implicit member rejoin");
  assert.equal(sql("select previous_room_id from ink_product.rooms where id="+quote(nextRoom)),room);
  assert.equal(sql(`select enabled from private.exploration_hint_options_v1 where mode='group_items' and room_id=${quote(nextRoom)}`),"t");
  assert.equal(sql(`select count(*) from private.exploration_hint_documents_v1 where room_id=${quote(nextRoom)}`),"0");
  for(const guest of agents.slice(1)) {
    await guest.page.getByRole("button",{name:"재경기 준비방 참가",exact:true}).click({timeout:25000});
    await guest.page.waitForURL("**/multiplayer/group-items/"+nextRoom,{timeout:15000});
  }
  assert.equal(sql(`select count(*) from ink_product.members where room_id=${quote(nextRoom)} and (ready or target_candidate_id is not null)`),"0");
  await readyGroup(nextRoom,members,agents);
  assert.equal(Number(sql("select count(*) from ink_product.members where room_id="+quote(nextRoom)+
    " and status='waiting' and ready")),count);
  await host.reload({waitUntil:"domcontentloaded"});
  await host.getByRole("button",{name:"경기 시작"}).waitFor({state:"visible",timeout:30000});
  await host.getByRole("button",{name:"경기 시작"}).click();
  await host.locator('[data-product-group-phase="playing"]').waitFor({state:"visible",timeout:25000});
  assert.equal(Number(sql("select count(*) from ink_product.members where room_id="+quote(nextRoom)+" and status='playing'")),count);
  assert.deepEqual({results:resultCount(),projection:projected(),xp:xpCount()},before,
    `S5 ${count} rematch must not duplicate old results/XP`);
  await host.screenshot({path:path.join(directory,`s5-${count}-finished-rematch.png`),animations:"disabled"});
  log(`S5 ${count} UI rematch, all players rejoin/ready, fresh restart, old result/XP immutable`);
}


async function verifyS5LatencyBrowser() {
  // The browser performs real fetches through Playwright's local-only delayed
  // route. This intentionally tests UI time presentation, NOT the server parry RPC.
  const context=await browser.newContext({viewport:{width:390,height:844},
    serviceWorkers:"block",reducedMotion:"reduce"});
  contexts.push(context);
  const page=await context.newPage();
  let requests=0,deadline=null,firstObserved=null;
  await page.route("**/__s5_rtt_probe",async route=>{
    const n=requests++;
    if(n===0) await delay(1400); // upstream delay BEFORE server observation
    const serverObservedAt=Date.now();
    if(n===0){firstObserved=serverObservedAt;deadline=serverObservedAt+1500;}
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({serverObservedAt,deadline,seq:n+1})});
  });
  await page.goto(url+"/login",{waitUntil:"domcontentloaded"});
  await page.evaluate(async()=>{
    const module=await import("/tests/s5ReactionBrowserHarness.jsx");
    module.initialize();
  });
  const send=()=>page.evaluate(async()=>{
    const started=performance.now();
    const response=await fetch("/__s5_rtt_probe");
    if(!response.ok)throw Error("LOCAL_CLOCK_PROBE_FAILED");
    const sample=await response.json();
    return window.__s5ReactionBrowser.accept(sample,performance.now()-started);
  });
  const slow=await send();
  assert.ok(slow.rtt>=1300&&slow.rtt<5000,"actual delayed fetch RTT: "+slow.rtt);
  assert.ok(slow.legacyNow-slow.fixedNow>=1200,
    "the old conservative effect clock must retain the pre-server latency");
  await delay(150); // original presentation would already have closed
  const fast=await send();
  assert.equal(requests,2,"one actual slow and one actual fast browser fetch");
  assert.ok(fast.rtt<400,"fast follow-up request must be fast: "+fast.rtt);
  assert.equal(fast.deadline,deadline);
  const before=await page.evaluate(()=>window.__s5ReactionBrowser.frame());
  assert.ok(before.legacyNow>=deadline,
    "original warning clock must have prematurely expired for this test to be meaningful");
  assert.ok(before.fixedNow<deadline,
    "S5 warning clock must still precede the authoritative deadline");
  await page.waitForFunction(()=> {
    const legacy=document.querySelector('[data-reaction-clock="legacy"] button.gip-parry');
    const fixed=document.querySelector('[data-reaction-clock="fixed"] button.gip-parry');
    return legacy?.disabled===true&&fixed?.disabled===false;
  },null,{timeout:2000});
  await page.screenshot({path:path.join(directory,"s5-reaction-clock-high-rtt.png"),animations:"disabled"});
  await page.locator('[data-reaction-clock="fixed"] button.gip-parry').click();
  const clicks=await page.evaluate(()=>window.__s5ReactionBrowser.clicks());
  assert.equal(clicks,1,"fixed S5 timed parry remains directly clickable");
  // Both paths always retain the exact same received authority deadline.
  const frame=await page.evaluate(()=>window.__s5ReactionBrowser.frame());
  assert.equal(frame.fixedDeadline,frame.legacyDeadline);
  assert.equal(frame.fixedDeadline,deadline);
  log("S5 actual Chromium 1400ms pre-observation delay then fast response: legacy early-disabled, fixed 64px reaction clickable");
  await context.close();
}

async function groupRound(count) {
  const members=users.slice(0,count);
  const agents=[];
  for(let i=0;i<count;i++) {
    const a=await actor(members[i],i===0?390:1280); agents.push(a);
  }
  const {roomId:room,code}=await createItemRoom(agents[0],"group");
  for(const guest of agents.slice(1)) await joinItemRoom(guest,"group",room,code);
  await readyGroup(room,members,agents);
  await agents[0].page.getByRole("button",{name:"경기 시작",exact:true}).click({timeout:20000});
  const session=await waitFor(()=>sql("select session_id from ink_product.rooms where id="+quote(room)), "S5 initialized room");
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
  await verifyS5FinishAndRematch(count,room,members,agents);
  for(const a of agents) assert.equal(a.errors.length,0,`S5 page error: ${a.errors.join("; ")}`);
  await Promise.all(agents.map(a=>a.context.close()));
  log(`S5 ${count}-player match browser phase completed`);
}
async function duelRound() {
  const members=users.slice(0,2);
  sql("insert into duel_v4.admission(user_id,expires_at) values "+
    members.map(u=>`(${quote(u.id)},clock_timestamp()+interval '1 hour')`).join(",")+";");
  const agents=[];
  for(let i=0;i<2;i++) agents.push(await actor(members[i],390));
  const host=agents[0].page, guest=agents[1].page;
  const {roomId:room,code}=await createItemRoom(agents[0],"duel");
  await joinItemRoom(agents[1],"duel",room,code);
  log("duel v4 actual UI create and join with two distinct Auth users");
  // The normal client UI exercises both snapshot preparation and target/start commands.
  const search=host.getByRole("search",{name:"목표 문서 검색"});
  await search.getByRole("textbox").fill(goal.title);
  await search.getByRole("button",{name:"검색",exact:true}).click();
  await host.getByRole("list",{name:"목표 문서 검색 결과"})
    .getByRole("button",{name:goal.title,exact:true}).click();
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
  // A parry inventory slot has the same accessible name as the timed attack response.
  // Only the 64px response control proves the incoming warning is actionable.
  const parry=guest.locator(".duel-v4-warning button.duel-v4-parry");
  try {
    await parry.waitFor({state:"visible",timeout:3500});
  } catch (error) {
    await guest.screenshot({path:path.join(directory,"duel-v4-missing-parry-warning.png"),animations:"disabled"});
    const actual=await rpc(members[1],"get_duel_v4_state",{p_room:room});
    throw Error("Timed parry response was not visible: "+JSON.stringify({
      warningCount:actual.warnings?.length,warningIds:actual.warnings?.map(w=>w.id),
      errors:await guest.locator(".duel-v4-messages").innerText(),
      inventory:actual.inventory?.map(i=>i.itemId),reason:error.message}));
  }
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
  log("duel v4 F5 authoritative progress retained");

  // Normal goal arrival must close the real result projection and show both players
  // their authoritative XP in a browser, followed by an actual UI rematch.
  const link=title=>host.locator('article.article-content a[data-wiki-title]').filter({hasText:title}).first();
  await link(middle.title).waitFor({state:"visible",timeout:30000});
  await link(middle.title).click();
  await waitFor(async()=>Number((await rpc(members[0],"get_duel_v4_state",{p_room:room}))
    .players.find(p=>p.id===members[0].id).moves)===1,"duel v4 first actual link move",80,300);
  await link(goal.title).waitFor({state:"visible",timeout:25000});
  await link(goal.title).click();
  await host.locator('section[aria-label="경기 결과"]').waitFor({state:"visible",timeout:25000});
  await guest.locator('section[aria-label="경기 결과"]').waitFor({state:"visible",timeout:25000});
  const winner=await rpc(members[0],"get_duel_v4_state",{p_room:room});
  const loser=await rpc(members[1],"get_duel_v4_state",{p_room:room});
  assert.equal(winner.winnerId,members[0].id);
  assert.equal(winner.finishReason,"normal_finish");
  assert.equal(winner.xp,50);
  assert.equal(loser.xp,25);
  assert.equal(winner.players.find(p=>p.id===members[0].id).moves,2);
  assert.match(await host.locator('section[aria-label="경기 결과"]').innerText(),/획득 XP \+50/);
  assert.match(await guest.locator('section[aria-label="경기 결과"]').innerText(),/획득 XP \+25/);
  const resultRoom=sql("select result_room_id from duel_v4.rooms where id="+quote(room));
  const history=()=>Number(sql("select count(*) from public.match_history where room_id="+quote(resultRoom)));
  const ledger=()=>Number(sql("select count(*) from public.xp_ledger where source_id in ("+
    "select id from public.match_history where room_id="+quote(resultRoom)+")"));
  assert.equal(history(),1,"duel v4 exactly one historical result");
  assert.equal(ledger(),2,"duel v4 winner and loser each got one XP entry");
  await host.reload({waitUntil:"domcontentloaded"});
  await host.locator('section[aria-label="경기 결과"]').waitFor({state:"visible",timeout:20000});
  const old={history:history(),xp:ledger()};
  await host.getByRole("button",{name:"같은 멤버로 다시 준비하기"}).click();
  await host.waitForURL(next=>/\/multiplayer\/duel-v4\/[a-f0-9-]{36}$/.test(next.pathname) && next.pathname!=="/multiplayer/duel-v4/"+room,{timeout:20000});
  const nextRoom=host.url().split("/").at(-1);
  assert.notEqual(nextRoom,room);
  await guest.getByRole("button",{name:"재경기 준비방 참가",exact:true}).click({timeout:25000});
  await guest.waitForURL(new RegExp("/multiplayer/duel-v4/"+nextRoom+"$"),{timeout:20000});
  assert.equal(Number(sql("select count(*) from duel_v4.members where room_id="+quote(nextRoom))),2);
  assert.equal(Number(sql("select count(*) from duel_v4.grants where room_id="+quote(nextRoom))),0);
  assert.deepEqual({history:history(),xp:ledger()},old,"duel v4 rematch no old XP/result duplication");
  await host.getByRole("button",{name:"게임 시작"}).click();
  await waitFor(async()=>Boolean((await rpc(members[0],"get_duel_v4_state",{p_room:nextRoom})).startedAt),
    "duel v4 rematch starts with new inventory",80,350);
  assert.equal(Number(sql("select count(*) from duel_v4.grants where room_id="+quote(nextRoom)+
    " and consumed_at is null")),2);
  await host.screenshot({path:path.join(directory,"duel-v4-finished-rematch.png"),animations:"disabled"});
  log("duel v4 real two-link finish, result DOM/XP, F5, UI rematch and new supply");
  for(const a of agents) assert.equal(a.errors.length,0,"duel v4 page errors: "+a.errors.join("; "));
  await Promise.all(agents.map(a=>a.context.close()));

}
try {
  seedWiki(); seedS5();
  for(let i=0;i<8;i++) await createUser(i+1);
  server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5187","--strictPort","--mode","s4-product-candidate"],{
    cwd:repoRoot,env:{...process.env,VITE_SUPABASE_URL:env.API_URL,VITE_SUPABASE_ANON_KEY:env.ANON_KEY,
      VITE_DUEL_ITEMS_V4_ENTRY:"1",VITE_GROUP_ITEMS_S5_ENTRY:"1",VITE_MAINTENANCE:""},stdio:"ignore"});
  await waitFor(async()=>{try{return(await fetch(url+"/login")).status<500}catch{return false}},"Vite QA host",100,300);
  browser=await chromium.launch({headless:true});
  const failures=[];
  async function caseRun(name,work){
    const starting=contexts.length;
    try { await work(); log(name+" PASS"); }
    catch(error) { failures.push(name+": "+error.message); console.error("FAIL "+name,error.stack); }
    finally {
      await Promise.all(contexts.splice(starting).map(context=>context.close().catch(()=>{})));
    }
  }
  await caseRun("S5 1400ms pre-server RTT reaction UI",verifyS5LatencyBrowser);
  await caseRun("duel v4 two-player",duelRound);
  for(const count of [3,4,8]) await caseRun("S5 "+count+"-player",()=>groupRound(count));
  if(failures.length) throw Error("ISOLATED BROWSER GATE FAILURES: "+failures.join(" | "));
  console.log("PASS LOCAL S5/DUEL-V4 MULTIACCOUNT BROWSER GATE");
} finally {
  await browser?.close().catch(()=>{});
  server?.kill("SIGTERM");
  // Never manipulate hosted users/data; workflow disposes the local DB volume.
}
