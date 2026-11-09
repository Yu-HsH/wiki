// CI-only E2E: real Supabase authentication, two / three independent browser
// contexts and actual private lobby navigation; never connect to production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli, runPsql,
} from "./supabase-runtime-common.mjs";

if(process.env.CI!=="true" || process.env.GITHUB_ACTIONS!=="true" ||
  process.env.WIKI_VALIDATION_WORKDIR || process.env.SUPABASE_DB_CONTAINER ||
  readProjectId()!==TARGET_PROJECT_ID)throw Error("REFUSED: disposable local QA only");
const version=runCli(["--version"]);
assert.equal(version.status,0);
assert.equal(version.stdout.trim(),EXPECTED_CLI_VERSION);
const container=expectedDbContainer();
const inspected=inspectContainer(container);
assert.equal(inspected.status,0);
assert.equal(JSON.parse(inspected.stdout).State?.Health?.Status,"healthy");
const status=runCli(["--workdir",repoRoot,"status","-o","env"]);
assert.equal(status.status,0);
const env=Object.fromEntries(status.stdout.split(/\r?\n/).flatMap(line=>{
  const m=line.match(/^([A-Z0-9_]+)=(.*)$/);
  return m?[[m[1],m[2].replace(/^['"]|['"]$/g,"")]]:[];
}));
assert.equal(env.API_URL,"http://127.0.0.1:54321");
const anonKey=env.ANON_KEY||env.PUBLISHABLE_KEY,adminKey=env.SERVICE_ROLE_KEY;
assert.ok(anonKey&&adminKey);
const admin=createClient(env.API_URL,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const base="http://127.0.0.1:5179";
const token=randomUUID().replaceAll("-","").slice(0,8);
const people=[],rooms=[],contexts=[];
let browser,vite;
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
function sql(qry){
  const r=runPsql(container,qry,{timeout:120000});
  if(r.status!==0)throw Error("LOCAL SQL ERROR "+r.stderr.slice(-1200));
  return r.stdout.trim();
}
async function rpc(user,name,args){
  const {data,error}=await user.client.rpc(name,args);
  if(error)throw Error(name+" failed: "+error.message);
  return Array.isArray(data)?data[0]:data;
}
async function addUser(index){
  const alias="rematch_"+token+"_"+index,email=alias+"@local.test";
  const password="LocalRematchQA-"+token+"-"+index+"!";
  const {data,error}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
    user_metadata:{username:alias,nickname:"ReMatch QA "+index},
  });
  if(error||!data?.user?.id)throw Error("Local auth user creation failed");
  const user={id:data.user.id,alias,email,password};
  people.push(user);
  sql("insert into public.profiles(id,username,nickname,synthetic_email) values ("+
    [user.id,alias,"ReMatch QA "+index,email].map(q).join(",")+") on conflict(id) do nothing;");
  const client=createClient(env.API_URL,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const signin=await client.auth.signInWithPassword({email,password});
  if(signin.error||!signin.data.session)throw Error("Local user sign-in failed");
  user.session=signin.data.session;
  user.client=client;
  return user;
}
function insertFinishedSource(mode,users){
  const id=randomUUID(),roomCode=(mode==="duel"?"D":"G")+randomUUID().replaceAll("-","").slice(0,5).toUpperCase();
  const count=mode==="duel"?2:3;
  sql("set request.headers = '{\"x-wiki-duel-protocol\":\"search-authority-v1\"}';\n"+
    "insert into public.game_rooms(id,room_code,host_user_id,status,mode,min_players,max_players,finish_rank_limit,use_items,finished_at) "+
    "values ("+[id,roomCode,users[0].id,"finished",mode,count,count,3,mode==="duel"?"true":"false","now()"].map((v,i)=>
      i===6||i===5||i===7||i===8||i===9?String(v):q(v)).join(",")+");\n"+
    "insert into public.room_players(room_id,user_id,role,nickname_snapshot,is_ready) values "+
    users.slice(0,count).map((u,i)=>"("+[id,u.id,i===0?"host":"guest","ReMatch QA "+(i+1)].map(q).join(",")+",false)").join(",")+";");
  rooms.push(id);
  return id;
}
async function makeActor(user){
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"});
  contexts.push(context);
  await context.addInitScript(s=>localStorage.setItem("sb-127-auth-token",JSON.stringify(s)),user.session);
  const page=await context.newPage();
  return {user,context,page};
}
async function verifyMode(mode,users,actors){
  const sourceId=insertFinishedSource(mode,users);
  const host=users[0],guest=users[1];
  const other=users[3];
  let denied=await other.client.rpc("get_rematch_room_v1",{p_source_room_id:sourceId});
  assert.ok(denied.error?.message.includes("REMATCH_SOURCE_NOT_PARTICIPANT"));
  console.log("PASS "+mode+" outsider cannot discover previous members' private invitation");
  denied=await guest.client.rpc("create_rematch_room_v1",{p_source_room_id:sourceId});
  assert.ok(denied.error?.message.includes("REMATCH_HOST_REQUIRED"));
  const nextId=await rpc(host,"create_rematch_room_v1",{p_source_room_id:sourceId});
  assert.ok(nextId && nextId!==sourceId);
  const repeated=await rpc(host,"create_rematch_room_v1",{p_source_room_id:sourceId});
  assert.equal(nextId,repeated,"host double click must not create another room");
  const offer=await rpc(guest,"get_rematch_room_v1",{p_source_room_id:sourceId});
  assert.equal(offer,nextId);
  console.log("PASS "+mode+" host idempotent creation and guest invitation");
  const room=JSON.parse(sql("select row_to_json(r) from (select id,status,is_public,mode,use_items,min_players,max_players from public.game_rooms where id="+q(nextId)+") r;"));
  assert.equal(room.is_public,false);
  assert.equal(room.status,"waiting");
  assert.equal(room.mode,mode);
  if(mode==="duel")assert.equal(room.use_items,true);
  const code=sql("select room_code from public.game_rooms where id="+q(nextId)+";");
  denied=mode==="duel"?
    await other.client.rpc("join_duel_room_v2",{p_room_code:code}):
    await other.client.rpc("join_group_room",{p_room_id:nextId});
  assert.ok(denied.error?.message.includes("REMATCH_MEMBERS_ONLY"),"outsider code-join should be blocked");
  const targetUrl=mode==="duel"?"/multiplayer/room/":"/multiplayer/group/room/";
  await actors[0].page.goto(base+targetUrl+nextId);
  for(let i=1;i<(mode==="duel"?2:3);i++){
    assert.equal(await rpc(users[i],"join_rematch_room_v1",{p_source_room_id:sourceId}),nextId);
    await actors[i].page.goto(base+targetUrl+nextId);
  }
  if(mode==="duel"){
    await actors[1].page.getByText("1:1 대전 준비").waitFor({state:"visible",timeout:25000});
    await actors[1].page.locator(".wr-duel-players").waitFor({state:"visible",timeout:25000});
  }else{
    await actors[2].page.getByText("탐험가 집결 캠프").waitFor({state:"visible",timeout:25000});
    await actors[2].page.locator(".wr-party").waitFor({state:"visible",timeout:25000});
  }
  const players=JSON.parse(sql("select coalesce(json_agg(row_to_json(p)), '[]'::json) from ("+
    "select user_id,is_ready,move_count,current_title,submitted_target_title from public.room_players where room_id="+q(nextId)+") p;"));
  assert.equal(players.length,mode==="duel"?2:3);
  assert.ok(players.every(x=>!x.is_ready&&x.move_count===0&&x.current_title===null&&x.submitted_target_title===null));
  await actors[1].page.reload({waitUntil:"domcontentloaded"});
  await (mode==="duel"?actors[1].page.locator(".wr-duel-players"):actors[1].page.locator(".wr-party"))
    .waitFor({state:"visible",timeout:25000});
  assert.equal(sql("select count(*) from public.room_players where room_id="+q(nextId)+";"),
    String(mode==="duel"?2:3));
  assert.equal(sql("select status from public.game_rooms where id="+q(sourceId)+";"),"finished");
  console.log("PASS "+mode+" browser rematch lobby, isolated participants, F5 and old room unchanged");
}
async function waitForVite(){
  for(let i=0;i<100;i++){try{if((await fetch(base+"/login")).status<500)return;}catch{}await new Promise(resolve=>setTimeout(resolve,300));}
  throw Error("Disposable Vite not responding");
}
try{
  for(let i=0;i<4;i++)await addUser(i+1);
  vite=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","5179","--strictPort"],
    {cwd:repoRoot,env:{...process.env,VITE_SUPABASE_URL:env.API_URL,VITE_SUPABASE_ANON_KEY:anonKey,VITE_MAINTENANCE:""},stdio:"ignore"});
  await waitForVite();
  browser=await chromium.launch({headless:true});
  const actors=[];
  for(const u of people)actors.push(await makeActor(u));
  await verifyMode("duel",people,actors);
  await verifyMode("group",people,actors);
  console.log("PASS real two/three-account rematch lobby integration (local-only)");
}finally{
  if(browser)await browser.close().catch(()=>{});
  if(vite)vite.kill("SIGTERM");
  // GH Actions runner owns the DB volume, which is destroyed by workflow.
}
