// Rehearsal uses only fresh GitHub Actions Docker and synthetic data, NEVER linked DB.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer,
  inspectContainer, readProjectId, repoRoot, runCli, runPsql } from "./supabase-runtime-common.mjs";

const cmd=process.argv[2];
assert.ok(["stage","seed","unstage","verify"].includes(cmd),"Unsupported rehearsal mode");
assert.equal(process.env.CI,"true");
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(readProjectId(),TARGET_PROJECT_ID,"Wrong local Docker project");
assert.ok(process.env.RUNNER_TEMP?.startsWith("/"));
assert.ok(!process.env.WIKI_VALIDATION_WORKDIR&&!process.env.SUPABASE_DB_CONTAINER);
const cli=runCli(["--version"]);
assert.equal(cli.status,0);
assert.equal(cli.stdout.trim(),EXPECTED_CLI_VERSION);
const dir=path.join(repoRoot,"supabase","migrations");
const temp=path.join(process.env.RUNNER_TEMP,"wiki-s5-migration-rehearsal");
const pending=[
 "20261120024414_group_items_s5.sql",
 "20261120104117_duel_items_v4.sql",
 "20261120113035_duel_v4_server_search.sql",
 "20261120113647_duel_v4_reward_queue.sql",
 "20261120114137_duel_v4_link_index.sql"
];
const file=n=>path.join(dir,n), staged=n=>path.join(temp,"pending",n);
const hash=x=>createHash("sha256").update(x).digest("hex");
const qty=()=>fs.readdirSync(dir).filter(n=>/^\d+_.+\.sql$/.test(n)).length;
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const u1="00000000-0000-4000-a063-000000000001",u2="00000000-0000-4000-a063-000000000002";
const room="00000000-0000-4000-a063-000000000101",grant="00000000-0000-4000-a063-000000000201";
const witnessFile=path.join(temp,"witness.json");
const manifestFile=path.join(temp,"manifest.json");
function query(command){
 const r=runPsql(expectedDbContainer(),command,{timeout:120000,maxBuffer:8*1024*1024});
 if(r.status!==0)throw Error("DISPOSABLE_LOCAL_SQL_FAILED "+r.stderr.slice(-2500));
 return r.stdout.trim();
}
function scalar(s){return query(s).split("\n").filter(Boolean).at(-1)??""}
function count(){return Number(scalar("select count(*) from supabase_migrations.schema_migrations;"))}
function healthy(){
 const c=inspectContainer(expectedDbContainer());
 assert.equal(c.status,0);
 assert.equal(JSON.parse(c.stdout).State?.Health?.Status,"healthy");
}
if(cmd==="stage"){
 assert.equal(qty(),64,"Expected 64 migration files");
 assert.ok(!fs.existsSync(temp),"Refuse collision with existing staging");
 fs.mkdirSync(path.join(temp,"pending"),{recursive:true});
 const manifest={};
 for(const n of pending){
  manifest[n]=hash(fs.readFileSync(file(n)));
  fs.renameSync(file(n),staged(n));
 }
 fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 assert.equal(qty(),59);
 console.log("PASS 59-file baseline staged, five pending migration files secured off-tree");
 process.exit(0);
}
if(cmd==="unstage"){
 const manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
 assert.deepEqual(Object.keys(manifest).sort(),[...pending].sort());
 for(const n of pending){
  assert.ok(!fs.existsSync(file(n)),"Refuse overwriting existing migration");
  assert.equal(hash(fs.readFileSync(staged(n))),manifest[n],"Staged file modified");
  fs.renameSync(staged(n),file(n));
 }
 assert.equal(qty(),64);
 console.log("PASS restored original five migrations byte-for-byte");
 process.exit(0);
}
healthy();
const snapshotSql=[
 "select jsonb_build_object(",
 " 'auth',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email) order by id),'[]'::jsonb)",
 "  from auth.users where id in ("+q(u1)+","+q(u2)+")),",
 " 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'nickname',nickname,'total_xp',total_xp) order by id),'[]'::jsonb)",
 "  from public.profiles where id in ("+q(u1)+","+q(u2)+")),",
 " 'rooms',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'host',host_user_id,'mode',mode,'status',status,'code',room_code) order by id),'[]'::jsonb)",
 "  from public.game_rooms where id="+q(room)+"),",
 " 'players',(select coalesce(jsonb_agg(jsonb_build_object('room',room_id,'user',user_id,'role',role) order by user_id),'[]'::jsonb)",
 "  from public.room_players where room_id="+q(room)+"),",
 " 'match_history',(select coalesce(jsonb_agg(jsonb_build_object('room',room_id,'winner',winner_user_id,'loser',loser_user_id,'status',result_status) order by room_id),'[]'::jsonb)",
 "  from public.match_history where room_id="+q(room)+"),",
 " 'xp',(select coalesce(jsonb_agg(jsonb_build_object('user',user_id,'source',source_id,'amount',amount,'class',xp_class) order by source_id),'[]'::jsonb)",
 "  from public.xp_ledger where user_id in ("+q(u1)+","+q(u2)+"))",
 ")::text;"
].join("\n");
const aclSql=[
 "select jsonb_build_object(",
 " 'profile_rls',(select relrowsecurity from pg_class where oid='public.profiles'::regclass),",
 " 'room_rls',(select relrowsecurity from pg_class where oid='public.game_rooms'::regclass),",
 " 'xp_rls',(select relrowsecurity from pg_class where oid='public.xp_ledger'::regclass),",
 " 'anon_profiles_read',has_table_privilege('anon','public.profiles','SELECT'),",
 " 'anon_xp_insert',has_table_privilege('anon','public.xp_ledger','INSERT'),",
 " 'anon_grant',has_function_privilege('anon','public.grant_xp_v1(uuid,text,uuid,integer,integer,text)','EXECUTE')",
 ")::text;"
].join("\n");
const snapshot=()=>JSON.parse(scalar(snapshotSql));
const acl=()=>JSON.parse(scalar(aclSql));
if(cmd==="seed"){
 assert.equal(count(),59);
 assert.equal(scalar("select to_regclass('ink_product.rooms') is null and to_regclass('duel_v4.rooms') is null;"),"t");
 const seed=[
  "BEGIN;",
  "INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES",
  " ("+q(u1)+",'authenticated','authenticated','migration-qa-a@local.test','{}','{}',now(),now()),",
  " ("+q(u2)+",'authenticated','authenticated','migration-qa-b@local.test','{}','{}',now(),now());",
  "INSERT INTO public.profiles(id,username,nickname,synthetic_email) VALUES",
  " ("+q(u1)+",'migration_qa_a','Migration QA A','migration-qa-a@local.test'),",
  " ("+q(u2)+",'migration_qa_b','Migration QA B','migration-qa-b@local.test');",
  "INSERT INTO public.game_rooms(id,room_code,host_user_id,mode,status,min_players,max_players,finish_rank_limit,use_items,finished_at) VALUES",
  " ("+q(room)+",'M63Q01',"+q(u1)+",'duel','finished',2,2,3,true,now());",
  "INSERT INTO public.room_players(room_id,user_id,role,nickname_snapshot,is_ready) VALUES",
  " ("+q(room)+","+q(u1)+",'host','Migration QA A',false),",
  " ("+q(room)+","+q(u2)+",'guest','Migration QA B',false);",
  "INSERT INTO public.match_history(room_id,winner_user_id,loser_user_id,duration_seconds,result_status,result_reason,finalized_at) VALUES",
  " ("+q(room)+","+q(u1)+","+q(u2)+",60,'completed','synthetic_qa',now());",
  "DO $check$ BEGIN",
  " IF (SELECT public.grant_xp_v1("+q(u1)+",'single_random_finish',"+q(grant)+",20,20)->>'granted')<>'true'",
  " THEN RAISE EXCEPTION 'SYNTHETIC_XP_GRANT_FAILED'; END IF;",
  "END $check$;",
  "COMMIT;"
 ].join("\n");
 query(seed);
 const data=snapshot();
 assert.deepEqual(["auth","profiles","rooms","players","match_history"].map(k=>data[k].length),[2,2,1,2,1]);
 assert.ok(data.xp.length>=1,"At least the explicitly granted XP row must exist");
 assert.ok(data.profiles.find(x=>x.id===u1)?.total_xp>=20,"Finished match may also trigger XP");
 assert.equal(data.xp.find(x=>x.source===grant)?.amount,20,"Explicit XP grant remains 20");
 const witness={data,acl:acl(),sha256:hash(JSON.stringify(data))};
 fs.writeFileSync(witnessFile,JSON.stringify(witness,null,2));
 console.log("PASS 59 applied: 2 users/profiles, duel room/players/history, explicit 20XP plus any automatic match XP");
 console.log("BASELINE_SYNTHETIC_SHA "+witness.sha256);
 process.exit(0);
}
if(cmd==="verify"){
 assert.equal(count(),64);
 assert.equal(qty(),64);
 const witness=JSON.parse(fs.readFileSync(witnessFile,"utf8"));
 const after=snapshot();
 assert.deepEqual(after,witness.data,"Synthetic legacy data changed across the 5 migrations");
 assert.deepEqual(acl(),witness.acl,"Existing ACL/RLS changed");
 assert.equal(hash(JSON.stringify(after)),witness.sha256);
 assert.equal(scalar("select to_regclass('ink_product.rooms') is not null and to_regclass('duel_v4.rooms') is not null;"),"t");
 assert.equal(scalar("select not has_function_privilege('anon','public.get_group_items_product_room_v1(uuid,jsonb)','EXECUTE');"),"t");
 assert.equal(scalar("select public.grant_xp_v1("+q(u1)+",'single_random_finish',"+q(grant)+",20,20)->>'granted';"),"false","Old XP must remain idempotent");
 assert.equal(Number(scalar("select count(*) from public.xp_ledger where source_id="+q(grant)+";")),1);
 assert.deepEqual(snapshot(),witness.data,"Duplicate XP grant changed data");
 console.log("PASS 59→64 forward migration on populated local DB");
 console.log("PASS legacy synthetic auth/profiles, room/members/match history, XP and ACL/RLS unchanged");
 console.log("PASS old XP deduplicates, new S5/duel v4 tables present and anon S5 RPC denied");
 console.log("FINAL_SYNTHETIC_SHA "+witness.sha256);
 process.exit(0);
}
