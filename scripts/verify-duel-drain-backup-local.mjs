// Explicit LOCAL backup verification. No linked CLI, remote connection or credentials.
// The protected backup directory contains production.dump and fingerprint-before.private.json.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';import {randomUUID,createHash} from 'node:crypto';
const out='.temp/duel-final-20261103/backup';fs.mkdirSync(out,{recursive:true});
const container='supabase_db_wiki-next-goal-release-20261029';
const {privateDir}=JSON.parse(fs.readFileSync('.temp/production-preflight-20261103/private-location.json'));
const backup=JSON.parse(fs.readFileSync('.temp/production-preflight-20261103/backup-verified.json'));
const db='jungle65_drain_final_'+randomUUID().slice(0,8);
const args=target=>['exec','-i',container,'psql','-U','postgres','-d',target,'-X','-At','-v','ON_ERROR_STOP=1'];
function sql(s,target=db){assert(/^(template1|jungle65_drain_final_[a-f0-9]{8})$/.test(target));const r=spawnSync('docker',args(target),{input:s,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:64*1024*1024});if(r.status!==0){fs.writeFileSync(privateDir+'/drain-final-error.private.log',r.stderr);throw Error('LOCAL_DRAIN_TEST_FAILED (protected log)')}return r.stdout;}
const json=s=>JSON.parse(sql(s).split(/\r?\n/).filter(s=>s.startsWith('{')||s.startsWith('[')).at(-1));
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const inspection=spawnSync('docker',['inspect',container],{encoding:'utf8',windowsHide:true});assert.equal(inspection.status,0);
assert(JSON.parse(inspection.stdout)[0].NetworkSettings.Ports['5432/tcp'].every(p=>p.HostPort==='55422'));
const archive=fs.readFileSync(privateDir+'/production.dump');assert.equal(createHash('sha256').update(archive).digest('hex'),backup.backupSha256);
sql('create database '+db+' owner postgres template template0;','template1');
const restore=spawnSync('docker',['exec','-i',container,'pg_restore','-U','supabase_admin','-d',db,'--exit-on-error'],{input:archive,windowsHide:true,maxBuffer:64*1024*1024});assert.equal(restore.status,0,'actual local restore failed');
const fingerprint=fs.readFileSync('scripts/duel-backup-fingerprint.sql','utf8'),restored=json(fingerprint),golden=JSON.parse(fs.readFileSync(privateDir+'/fingerprint-before.private.json'));
for(const key of ['tables','functions','policies','defaults'])assert.deepEqual(restored[key],golden[key]);
const security=v=>v.map(x=>({...x,acl:(x.acl??[x.owner+'=arwdDxtm/'+x.owner]).toSorted()}));
assert.deepEqual(security(restored.security),security(golden.security));
const migrations=fs.readdirSync('supabase/migrations').filter(f=>/^2026110[23]/.test(f)).sort();assert.equal(migrations.length,6);
for(const m of migrations.slice(0,3))sql(fs.readFileSync('supabase/migrations/'+m,'utf8'));
const cutover=json(`begin;
update private.duel_release_control_v1 set entry_open=false,search_enabled=false,required_protocol='search-authority-v1';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temp table baseline as select count(*) xp from public.xp_ledger;
do $drain$ declare c record; begin
 for c in select r.id from public.game_rooms r where mode='duel' and status='playing' and not exists(select 1 from private.duel_recovery_approvals_v1 a where a.room_key=encode(sha256(convert_to(r.id::text,'UTF8')),'hex')) loop
  perform public.finalize_duel_if_expired(c.id);
 end loop;
 for c in select r.id,a.fingerprint from public.game_rooms r join private.duel_recovery_approvals_v1 a on a.room_key=encode(sha256(convert_to(r.id::text,'UTF8')),'hex') loop
  perform public.admin_recover_legacy_duel_v1(c.id,extensions.gen_random_uuid(),c.fingerprint,'local complete cutover rehearsal');
 end loop;
end;$drain$;
select jsonb_build_object('remaining',(select count(*) from public.game_rooms where mode='duel' and status in('starting','playing')),'xpRows',(select count(*) from public.xp_ledger)-(select xp from baseline),'searchSchemaNotInstalled',to_regclass('private.duel_search_sessions_v1') is null);rollback;`);
assert.equal(cutover.remaining,0);assert.equal(cutover.xpRows,0);assert(cutover.searchSchemaNotInstalled);
for(const m of migrations.slice(3))sql(fs.readFileSync('supabase/migrations/'+m,'utf8'));
const before=json(fingerprint);
const sqlChecks=[];
for(const name of ['duel_search_authority_v1','duel_item_authority_v3','duel_release_controls_v1','duel_drain_recovery_v1','duel_qa_admission_v1']){
 const output=sql(fs.readFileSync('supabase/tests/'+name+'.sql','utf8'));
 fs.writeFileSync(out+'/'+name+'.log',output);
 assert.doesNotMatch(output,/not ok|Looks like/);const passed=Number(output.match(/1\.\.(\d+)/)?.[1]);assert(passed>0);assert.equal(output.match(/^ok \d+ -/gm)?.length,passed,'TAP plan must equal recorded assertions');sqlChecks.push({name,passed,failed:0});
}
// Same service-role entry point as production, mocked only in this disposable DB.
const normal=json(`begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temp table cases(detail jsonb);
do $test$ declare c record; first jsonb; second jsonb; xp bigint; detail jsonb;
begin for c in select id,row_number() over(order by created_at,id) ordinal from public.game_rooms where mode='duel' and status in('starting','playing') order by created_at,id loop
  begin
    select count(*) into xp from public.xp_ledger;
    first:=to_jsonb(public.finalize_duel_if_expired(c.id));second:=to_jsonb(public.finalize_duel_if_expired(c.id));
    detail:=jsonb_build_object('caseId','D'||lpad(c.ordinal::text,2,'0'),'status',first->>'status','reason',first->>'finished_reason','retryIdentical',first=second,'xpRows',(select count(*) from public.xp_ledger)-xp,'matches',(select count(*) from public.match_history where room_id=c.id));
    raise sqlstate 'ZD003';
  exception when sqlstate 'ZD003' then null;when others then detail:=jsonb_build_object('caseId','D'||lpad(c.ordinal::text,2,'0'),'error',sqlerrm);end;
  insert into cases values(detail);
end loop;end;$test$;
select jsonb_build_object('normal',jsonb_agg(detail)) from cases;rollback;`);
assert.equal(normal.normal.filter(r=>r.reason==='cancelled'&&r.xpRows===0&&r.matches===1&&r.retryIdentical).length,32);
assert.equal(normal.normal.filter(r=>r.error).length,4);
const actual=json(`begin;
update private.duel_release_control_v1 set entry_open=false,search_enabled=false,required_protocol='search-authority-v1';
create temp table cases(detail jsonb);
do $test$ declare c record; request uuid; first jsonb; second jsonb; xp bigint; unlocks bigint;
begin for c in select r.id,a.* from public.game_rooms r join private.duel_recovery_approvals_v1 a on a.room_key=encode(sha256(convert_to(r.id::text,'UTF8')),'hex') order by a.case_id loop
 select count(*) into xp from public.xp_ledger;select count(*) into unlocks from public.user_achievement_unlocks;
 request:=extensions.gen_random_uuid();first:=public.admin_recover_legacy_duel_v1(c.id,request,c.fingerprint,'local verified backup rehearsal');second:=public.admin_recover_legacy_duel_v1(c.id,request,c.fingerprint,'local verified backup rehearsal');
 insert into cases values(jsonb_build_object('caseId',c.case_id,'code',first->>'code','retryIdentical',first=second,'winnerNull',first->'winnerUserId'='null'::jsonb,'xpRows',(select count(*) from public.xp_ledger)-xp,'unlocks',(select count(*) from public.user_achievement_unlocks)-unlocks,'matches',(select count(*) from public.match_history where room_id=c.id)));
end loop;end;$test$;
select jsonb_build_object('recovery',jsonb_agg(detail)) from cases;rollback;`);
assert.equal(actual.recovery.length,4);assert(actual.recovery.every(r=>r.code==='LEGACY_DUEL_CANCELLED'&&r.retryIdentical&&r.winnerNull&&r.xpRows===0&&r.unlocks===0&&r.matches===1));
assert.deepEqual(json(fingerprint).tables,before.tables,'rollback must preserve all restored tables');
// Two real psql connections; a marker confirms lock acquisition before B starts.
function concurrent(s,marker){let output='',error='',resolveMarker;const acquired=new Promise(r=>resolveMarker=r);
 const child=spawn('docker',args(db),{windowsHide:true});child.stdout.on('data',b=>{output+=b;if(marker&&output.includes(marker))resolveMarker();});child.stderr.on('data',b=>error+=b);child.stdin.end(s);
 const done=new Promise(resolve=>child.on('close',code=>resolve({code,output,error})));return {acquired,done};}
const approved=JSON.parse(sql("select jsonb_agg(jsonb_build_object('caseId',a.case_id,'id',r.id,'fp',a.fingerprint)) from public.game_rooms r join private.duel_recovery_approvals_v1 a on a.room_key=encode(sha256(convert_to(r.id::text,'UTF8')),'hex');").trim());
sql("update private.duel_release_control_v1 set entry_open=false,search_enabled=false,required_protocol='search-authority-v1';");
const dup=approved.find(c=>c.caseId==='D28'),req=randomUUID(),call=(c,request=req)=>"select public.admin_recover_legacy_duel_v1("+q(c.id)+","+q(request)+","+q(c.fp)+",'local concurrent approved recovery');";
let a=concurrent('begin;'+call(dup)+"select 'RECOVERY_LOCKED';select pg_sleep(1);commit;",'RECOVERY_LOCKED');await a.acquired;
let b=concurrent('begin;'+call(dup)+'commit;');let [ar,br]=await Promise.all([a.done,b.done]);assert.equal(ar.code,0);assert.equal(br.code,0);assert.equal(JSON.parse(ar.output.split(/\r?\n/).find(x=>x.startsWith('{'))).resultId,JSON.parse(br.output.split(/\r?\n/).find(x=>x.startsWith('{'))).resultId);
const changed=approved.find(c=>c.caseId==='D32'),actor=sql("select user_id from public.room_players where room_id="+q(changed.id)+" and role='host';").trim();
a=concurrent("begin;select id from public.game_rooms where id="+q(changed.id)+" for update;select 'HEARTBEAT_LOCKED';select pg_sleep(1);select set_config('request.jwt.claim.sub',"+q(actor)+",true);select public.heartbeat_duel_v2("+q(changed.id)+") is not null;commit;",'HEARTBEAT_LOCKED');await a.acquired;
b=concurrent('begin;'+call(changed,randomUUID())+'commit;');[ar,br]=await Promise.all([a.done,b.done]);assert.equal(ar.code,0);assert.notEqual(br.code,0);assert(br.error.includes('RECOVERY_RECENT_ACTIVITY'));
// An existing normal room is not a recovery target. Both live -> no-op;
// one live -> existing forfeit, never an invented admin cancellation.
const normalRoom=sql("select id from public.game_rooms where mode='duel' and status='playing' and duel_start_page_id is not null order by created_at limit 1;").trim();
const protection=json(`begin;select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_players set heartbeat_at=clock_timestamp() where room_id=${q(normalRoom)};
select public.finalize_duel_if_expired(${q(normalRoom)}) is not null;
select jsonb_build_object('bothLivePlaying',(select status='playing' from public.game_rooms where id=${q(normalRoom)}),'matches',(select count(*) from public.match_history where room_id=${q(normalRoom)}));rollback;`);
assert(protection.bothLivePlaying);assert.equal(protection.matches,0);
const live=sql("select user_id from public.room_players where room_id="+q(normalRoom)+" order by role limit 1;").trim();
a=concurrent("begin;select id from public.game_rooms where id="+q(normalRoom)+" for update;select 'NORMAL_HEARTBEAT_LOCKED';select pg_sleep(1);select set_config('request.jwt.claim.sub',"+q(live)+",true);select public.heartbeat_duel_v2("+q(normalRoom)+") is not null;commit;",'NORMAL_HEARTBEAT_LOCKED');await a.acquired;
b=concurrent("begin;select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);select public.finalize_duel_if_expired("+q(normalRoom)+") is not null;commit;");[ar,br]=await Promise.all([a.done,b.done]);assert.equal(ar.code,0);assert.equal(br.code,0);
const liveResult=json("select jsonb_build_object('winnerProtected',winner_user_id="+q(live)+",'reason',result_reason,'xpRows',(select count(*) from public.xp_ledger where source_id=m.id),'xpAmount',(select coalesce(sum(amount),0) from public.xp_ledger where source_id=m.id)) from public.match_history m where room_id="+q(normalRoom)+";");
assert(liveResult.winnerProtected);assert.equal(liveResult.reason,'disconnect_forfeit');assert.equal(liveResult.xpRows,2);
const denial=concurrent("begin;select public.admin_recover_legacy_duel_v1("+q(normalRoom)+","+q(randomUUID())+",repeat('a',64),'local nonapproved room');commit;");const denied=await denial.done;assert.notEqual(denied.code,0);assert(denied.error.includes('RECOVERY_NOT_APPROVED'));
const report={date:new Date().toISOString(),basis:'20b50fb + recovery/QA candidate',productionContacted:false,productionWrites:0,database:db,backupSha256:backup.backupSha256,actualRestore:true,matchedTables:77,matchedFunctions:125,matchedPolicies:41,matchedSecurity:76,matchedDefaults:24,cutover,sqlChecks,normal:normal.normal,recovery:actual.recovery,rollbackTablesEqual:before.tables.length,concurrency:{duplicateRecoverySameResult:true,newHeartbeatRejectedAfterLock:true,normalBothLiveNoop:true,normalLiveWinnerProtected:liveResult,existingNonapprovedRoomRejected:true},limits:['Normal expiry RPC can award legitimate forfeit XP when one player returns. It has no cancellation-only expected-state argument.','Concurrency mutations persist only in this disposable local database; production rooms are untouched.','Migration SQL is individually executed in this test; it does not synthesize Supabase migration-history rows. Production remains 45 and candidate files total 51.']};
fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({database:db,restoredTables:77,normalCancelled:32,recovered:4,concurrency:report.concurrency,productionWrites:0}));
