// Disposable GitHub Actions ONLY. Two REAL local Supabase accounts and two
// isolated Playwright browser contexts. No production traffic or credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli, runPsql,
} from "./supabase-runtime-common.mjs";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
  throw Error("REFUSED: only disposable GitHub Actions runner supported");
}
if (process.env.WIKI_VALIDATION_WORKDIR || process.env.SUPABASE_DB_CONTAINER ||
    readProjectId() !== TARGET_PROJECT_ID) throw Error("REFUSED: unapproved local project/container");
const cli = runCli(["--version"]);
if (cli.status !== 0 || cli.stdout.trim() !== EXPECTED_CLI_VERSION) {
  throw Error("REFUSED: wrong pinned Supabase CLI");
}
const container = expectedDbContainer();
const inspection = inspectContainer(container);
if (inspection.status !== 0 || JSON.parse(inspection.stdout).State?.Health?.Status !== "healthy") {
  throw Error("REFUSED: local DB is not healthy");
}
const envResult = runCli(["--workdir", repoRoot, "status", "-o", "env"]);
if (envResult.status !== 0) throw Error("Local Supabase status unavailable");
const status = Object.fromEntries(envResult.stdout.split(/\r?\n/).flatMap(line => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return m ? [[m[1],m[2].replace(/^['"]|['"]$/g,"")]] : [];
}));
const apiUrl = status.API_URL;
const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY;
const adminKey = status.SERVICE_ROLE_KEY;
if (apiUrl !== "http://127.0.0.1:54321" || !anonKey || !adminKey) {
  throw Error("REFUSED: not the isolated loopback Supabase API");
}

const runId = randomUUID().replaceAll("-","").slice(0,12);
const admin = createClient(apiUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const base = "http://127.0.0.1:5176";
const users = [],rooms=[];
let vite, browser;
const q = x => "'" + String(x).replaceAll("'","''") + "'";
function sql(sqlText) {
  const r = runPsql(container,sqlText,{timeout:120000});
  if (r.status !== 0) throw Error("LOCAL SQL FAILED: "+r.stderr.slice(-900));
  return r.stdout.trim();
}
function verify(label,predicate) { assert.ok(predicate,label); console.log("PASS "+label); }
function pause(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitServer() {
  for(let i=0;i<100;i++){
    if(vite?.exitCode!=null) throw Error("Local Vite exited prematurely");
    try { if ((await fetch(base+"/login")).status<500) return; }catch{}
    await pause(250);
  }
  throw Error("Local Vite did not start");
}
async function createUser(index) {
  const alias = "pr36_"+runId+"_"+index;
  const email = alias+"@local.test";
  const password = "QA-"+runId+"-"+index+"!pass";
  const nickname = "TTL QA "+index;
  const {data,error} = await admin.auth.admin.createUser({
    email,password,email_confirm:true,user_metadata:{username:alias,nickname},
  });
  if(error || !data?.user?.id) throw Error("Local account creation failed");
  const user = {id:data.user.id,alias,email,password,nickname};
  users.push(user);
  sql("insert into public.profiles(id,username,nickname,synthetic_email) values ("+
      [user.id,alias,nickname,email].map(q).join(",")+") on conflict (id) do nothing;");
  const client = createClient(apiUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const signin = await client.auth.signInWithPassword({email,password});
  if(signin.error || !signin.data?.session) throw Error("Local test login failed");
  user.session=signin.data.session;
  user.client=client;
  return user;
}
async function actorContext(user) {
  const context = await browser.newContext({viewport:{width:1280,height:840},serviceWorkers:"block"});
  await context.addInitScript(session => {
    localStorage.setItem("sb-127-auth-token",JSON.stringify(session));
  },user.session);
  const page = await context.newPage();
  return {context,page,user};
}
async function createRoom(mode) {
  const name=mode==="duel"?"create_discoverable_duel_room_v1":"create_discoverable_group_room_v1";
  const params=mode==="duel"?
    {p_use_items:false,p_is_public:true}:
    {p_max_players:3,p_min_players:3,p_finish_rank_limit:3,p_is_public:true};
  const {data,error}=await users[0].client.rpc(name,params);
  if(error || !data?.id)throw Error("Local "+mode+" room create failed: "+(error?.message||"empty"));
  rooms.push(data.id);
  return data;
}
function makeStale(room) {
  sql("update public.room_players set last_seen_at=now()-interval '3 hours' "+
      "where room_id="+q(room.id)+" and user_id="+q(users[0].id)+";");
}
function roomStatus(room){
  return sql("select status from public.game_rooms where id="+q(room.id)+";");
}
async function assertDenied(client,name,params,code) {
  const {error}=await client.rpc(name,params);
  verify(name+" denies expired room",Boolean(error) && error.message.includes(code));
}
async function runMode(mode,host,guest) {
  const live=await createRoom(mode);
  const hostUrl=mode==="duel"?"/multiplayer/room/":"/multiplayer/group/room/";
  await host.page.goto(base+hostUrl+live.id,{waitUntil:"domcontentloaded"});
  // Host should maintain an authenticated visible waiting-room presence.
  await host.page.waitForURL(url=>url.pathname.endsWith(live.id),{timeout:10000});
  await guest.page.goto(base+"/multiplayer?mode="+mode,{waitUntil:"domcontentloaded"});
  const listing=guest.page.locator(".mp-public-room");
  await listing.first().waitFor({state:"visible",timeout:20000});
  verify(mode+" visible to account B",await listing.count()===1);
  await listing.first().getByRole("button",{name:/참가하기/}).click();
  await guest.page.waitForURL(url=>url.pathname.endsWith(live.id),{timeout:20000});
  verify(mode+" account B joined account A's room",
    sql("select count(*) from public.room_players where room_id="+q(live.id)+
      " and user_id="+q(users[1].id)+";")==="1");

  const stale=await createRoom(mode);
  makeStale(stale);
  await guest.page.goto(base+"/multiplayer?mode="+mode,{waitUntil:"domcontentloaded"});
  await guest.page.locator(".mp-public-board").waitFor({state:"visible",timeout:20000});
  await guest.page.getByRole("button",{name:"새로고침"}).click();
  await guest.page.waitForTimeout(700);
  verify(mode+" idle room became expired after list refresh",roomStatus(stale)==="expired");
  verify(mode+" stale room removed from browser list",
    await guest.page.locator(".mp-public-room").count()===(mode==="duel"?0:1));
  if(mode==="duel") {
    await assertDenied(users[1].client,"join_duel_room_v2",{p_room_code:stale.room_code},"DUEL_ROOM_NOT_JOINABLE");
  } else {
    await assertDenied(users[1].client,"join_group_room",{p_room_id:stale.id},"GROUP_ROOM_NOT_WAITING");
  }
  const own=await users[0].client.rpc("heartbeat_public_waiting_room_v1",{p_room_id:stale.id});
  verify(mode+" expired lobby cannot be revived by host",own.data===false && !own.error);
  const unauthorized=await users[1].client.rpc("heartbeat_public_waiting_room_v1",{p_room_id:live.id});
  verify(mode+" guest cannot forge host heartbeat",
    Boolean(unauthorized.error) && unauthorized.error.message.includes("PUBLIC_ROOM_HOST_ONLY"));
  console.log("PASS 2-account browser "+mode+" live/join/expiry/security");
}
try {
  await createUser(1);
  await createUser(2);
  verify("two distinct authenticated local users",users[0].id!==users[1].id);
  const env={...process.env,VITE_SUPABASE_URL:apiUrl,VITE_SUPABASE_ANON_KEY:anonKey,VITE_MAINTENANCE:""};
  vite=spawn(process.platform==="win32"?"npm.cmd":"npm",
     ["run","dev","--","--host","127.0.0.1","--port","5176","--strictPort"],
     {cwd:repoRoot,env,stdio:"ignore"});
  await waitServer();
  browser=await chromium.launch({headless:true});
  const host=await actorContext(users[0]);
  const guest=await actorContext(users[1]);
  verify("browser contexts isolate storage",host.context!==guest.context);
  await runMode("duel",host,guest);
  await runMode("group",host,guest);
  console.log("PASS all two-account browser tests (isolated Supabase; no production writes)");
} finally {
  if(browser) await browser.close().catch(()=>{});
  if(vite){vite.kill();await pause(300);}
  if(rooms.length) {
    try {
      sql("delete from public.game_rooms where id in ("+rooms.map(q).join(",")+");");
    }catch(error){console.warn("local room cleanup incomplete:",error.message);}
  }
  for(const user of users){
    try { await admin.auth.admin.deleteUser(user.id); }
    catch(error){console.warn("local account cleanup incomplete:",error.message);}
  }
}
