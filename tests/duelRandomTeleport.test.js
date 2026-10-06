import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transformSync } from "esbuild";
import { canUseDuelItem, getDuelItem } from "../data/duelItems.js";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const destModule = { exports: {} };
new Function("module", "exports", transformSync(read("supabase/functions/duel-random-teleport/destination.ts"), { loader: "ts", format: "cjs" }).code)(destModule, destModule.exports);
const { chooseDestination } = destModule.exports;
const player = { current_page_id: "1", target_page_id: "2", current_title: "Current", target_title: "Target", progress_version: 3 };
const canonical = (overrides = {}) => ({ pageid: 9, ns: 0, title: "Canonical", revisions: [{ revid: 10 }], ...overrides });
const saved = { pageId: "9", revisionId: "10", canonicalTitle: "Canonical", snapshotId: "snapshot", links: [{ pageId: "3" }] };

test("teleport resolves a random redirect to namespace-0 canonical identity unrelated to current links", async () => {
  const queries = [];
  const result = await chooseDestination({ player, wikiJson: async args => {
    queries.push(args);
    return args.list === "random" ? { query: { random: [{ id: 8, title: "Redirect" }] } } : { query: { pages: { 9: canonical() } } };
  }, snapshot: async page => { assert.equal(page.pageId, "9"); assert.equal(page.title, "Canonical"); return saved; } });
  assert.deepEqual(result, { pageId: "9", revisionId: "10", namespace: 0 });
  assert.equal(queries[0].rnnamespace, "0");
  assert.equal(queries[1].redirects, "1");
});

for (const [label, page] of [["namespace",canonical({ns:14})], ["missing",canonical({missing:""})], ["current",canonical({pageid:1})], ["target",canonical({pageid:2})], ["invalid",canonical({invalid:""})]]) {
  test(`invalid ${label} never reaches snapshot or consumption; retries are bounded`, async () => {
    let calls=0;
    const result=await chooseDestination({ player, maxAttempts:3, wikiJson:async args=>{ calls++; return args.list ? {query:{random:[{id:9}]}} : {query:{pages:{9:page}}}; }, snapshot:()=>{throw Error("must not snapshot");} });
    assert.equal(result,null); assert.equal(calls,6);
  });
}

test("fetch failure, canonical snapshot mismatch and empty outgoing graph return no destination", async () => {
  let calls=0;
  assert.equal(await chooseDestination({player,maxAttempts:2,wikiJson:async()=>{calls++;throw Error("offline");}}),null);
  assert.equal(calls,2);
  for (const snapshot of [{...saved,pageId:"bad"},{...saved,canonicalTitle:"Forged"},{...saved,links:[]}]) {
    assert.equal(await chooseDestination({ player, maxAttempts:1, wikiJson:async args=>args.list?{query:{random:[{id:9}]}}:{query:{pages:{9:canonical()}}}, snapshot:async()=>snapshot }),null);
  }
});

async function edgeScenario({ bodyExtra={}, auth=true, initial={ok:false,code:"RANDOM_DESTINATION_REQUIRED",player}, register={ok:true}, commitError=false, initialError=false, destinationMissing=false, finalResult={ok:true,item_id:"random_teleport"} }={}) {
  let handler; let uses=0; let registrations=0; let selections=0; let registered;
  const rpc = async (name,args) => {
    if(name === "use_duel_item_v3") { uses++; if(uses===1)return initialError?{data:null,error:Error("lost initial response")}:{data:initial,error:null}; return commitError?{data:null,error:Error("lost response")}:{data:finalResult,error:null}; }
    registrations++; registered=args; return {data:register,error:null};
  };
  const source=read("supabase/functions/duel-random-teleport/index.ts").replace(/^import[^\n]*\n/gm,"");
  new Function("createClient","chooseDestination","Deno",transformSync(source,{loader:"ts",format:"cjs"}).code)(()=>({auth:{getUser:async()=>({data:{user:auth?{id:"verified-user"}:null},error:null})},rpc}),async()=>{selections++;if(destinationMissing)return null;return {pageId:"9",revisionId:"10",namespace:0};},{env:{get:()=>"unit"},serve:fn=>{handler=fn;}});
  const id="00000000-0000-0000-06c0-000000000001";
  const response=await handler(new Request("http://localhost",{method:"POST",body:JSON.stringify({roomId:id,grantId:id,requestId:id,correlationId:id,...bodyExtra})}));
  return {body:await response.json(),uses,registrations,selections,registered,status:response.status};
}

test("Edge actor comes from verified auth; destination registration precedes atomic item RPC",async()=>{
  const out=await edgeScenario(); assert.equal(out.uses,2);assert.equal(out.registrations,1);assert.equal(out.registered.p_user_id,"verified-user");
  assert.equal(out.registered.p_expected_version,3);assert.equal(out.body.ok,true);assert.equal(out.registered.p_correlation_id,undefined);
});
test("caller-supplied actor/destination and anonymous caller cannot choose or use an item",async()=>{
  for(const bodyExtra of [{userId:"opponent"},{title:"Target"},{pageId:"2"}]){const out=await edgeScenario({bodyExtra});assert.equal(out.status,400);assert.equal(out.uses,0);}
  assert.equal((await edgeScenario({auth:false})).uses,0);
});
test("ownership failure and duplicate success both avoid another random selection",async()=>{
  for(const initial of [{ok:false,code:"ITEM_NOT_OWNED"},{ok:true,code:"ITEM_USED"}]){const out=await edgeScenario({initial});assert.deepEqual(out.body,initial);assert.equal(out.selections,0);assert.equal(out.uses,1);}
});
test("version conflict never calls consuming RPC; lost commit response is marked ambiguous",async()=>{
  const conflict=await edgeScenario({register:{ok:false,code:"STATE_VERSION_CONFLICT"}});assert.equal(conflict.uses,1);assert.equal(conflict.body.code,"STATE_VERSION_CONFLICT");
  const lost=await edgeScenario({commitError:true});assert.equal(lost.body.code,"ITEM_STATE_UNKNOWN");
  assert.equal((await edgeScenario({initialError:true})).body.code,"ITEM_STATE_UNKNOWN");
});
test("teleport remains usable with no current links while random_link_move keeps its guard",()=>{
  assert.equal(canUseDuelItem({...getDuelItem("random_teleport"),used:false},{linkCount:0}),true);
  assert.equal(canUseDuelItem({...getDuelItem("random_link_move"),used:false},{linkCount:0}),false);
});
test("SQL protects destination writes and keeps M1 mask, item ownership, history and atomic consumption",()=>{
  const sql=read("supabase/migrations/20261006002015_duel_random_teleport_v1.sql");
  assert.match(sql,/register_duel_random_destination_v1[^;]*from public, anon, authenticated/);
  assert.match(sql,/grant execute on function public.register_duel_random_destination_v1[^;]*to service_role/);
  assert.match(sql,/v_destination.expected_version is distinct from v_player.progress_version/);
  assert.match(sql,/grant_id=p_grant_id/);assert.match(sql,/namespace=0/);
  assert.match(sql,/raise exception 'ITEM_RPC_REQUIRED'/);
  assert.match(sql,/'opponent', to_jsonb\(v_opponent\) - array\['path_titles'/);
  const move=sql.indexOf("-- 4. Apply.");const reject=sql.indexOf("if v_move is not null",move);const consume=sql.indexOf("-- 5. Consume",move);
  assert.ok(move<reject&&reject<consume);
  assert.match(sql,/array_append\(v_player.path_page_ids, v_to_id\)/);
  assert.match(sql,/v_delta := case when v_previous.event_type = 'FORCED_LINK' then -1 else 1 end/);
});

test("lookup failure skips commit, and rejected movement keeps the RPC failure contract",async()=>{
 const missing=await edgeScenario({destinationMissing:true});assert.equal(missing.body.code,"RANDOM_DOCUMENT_UNAVAILABLE");assert.equal(missing.uses,1);assert.equal(missing.registrations,0);
 const finalResult={ok:false,code:"ITEM_MOVE_REJECTED"};assert.deepEqual((await edgeScenario({finalResult})).body,finalResult);
});
