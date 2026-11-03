// Actual Auth/PostgREST and product React against the restored backup copy.
// Wikipedia/snapshot transport is a local article fixture. No production calls.
import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from '@playwright/test';import {createServer} from 'vite';
import {startBackupHttp} from './duel-backup-http-local.mjs';
const out='.temp/duel-final-20261103/qa-http';fs.mkdirSync(out,{recursive:true});
const restored=JSON.parse(fs.readFileSync('.temp/duel-final-20261103/backup/report.json')),db=restored.database;
assert(restored.actualRestore&&restored.productionWrites===0);assert.match(db,/^jungle65_drain_final_[a-f0-9]{8}$/);
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=s=>{const r=spawnSync('docker',['exec','-i','supabase_db_wiki-next-goal-release-20261029','psql','-U','postgres','-d',db,'-X','-At','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,'LOCAL_QA_SQL_FAILED');return r.stdout.trim();};
let backend,vite,browser,completed=false;const checks=[],contexts=[],errors=[],users=[];const pass=s=>{checks.push(s);console.log('PASS',s);};
const tag=randomUUID().slice(0,8),pages=['시작','목표'].map((name,i)=>({title:'qa-http-'+tag+'-'+name,pageId:'qa-http-'+tag+'-'+i,revisionId:'qa-rev-'+i,snapshotId:randomUUID()})),[START,TARGET]=pages;
try{
 backend=await startBackupHttp(db);const {api,config}=backend,base='http://127.0.0.1:5250';
 const admin=createClient(api,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 for(let i=0;i<3;i++){const email='qa-http-'+tag+'-'+i+'@local.test',password=randomUUID()+randomUUID();const made=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(made.error,null,made.error?.message);const id=made.data.user.id;
  sql('insert into public.profiles(id,username,nickname,synthetic_email)values('+q(id)+','+q('qahttp_'+tag+'_'+i)+','+q('QA HTTP '+i)+','+q(email)+');');
  const client=createClient(api,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'x-wiki-duel-protocol':'search-authority-v1'}}});
  const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null,signed.error?.message);const got=await client.auth.getUser();assert.equal(got.data.user.id,id);users.push({id,client,session:signed.data.session});
 }pass('restored backup: three synthetic users really sign in through Auth HTTP');
 for(const client of [createClient(api,config.ANON_KEY),users[0].client,admin]){const r=await client.rpc('admin_recover_legacy_duel_v1',{p_room_id:randomUUID(),p_request_id:randomUUID(),p_expected_fingerprint:'a'.repeat(64),p_rationale:'unauthorized HTTP test'});assert(r.error);const a=await client.rpc('admin_set_duel_qa_v1',{p_user_ids:[users[0].id],p_request_id:randomUUID(),p_approval_ref:'unauthorized HTTP test'});assert(a.error);}
 pass('actual anon/member/service-key HTTP cannot recover or enroll QA');
 const privateRead=await users[0].client.schema('private').from('duel_release_qa_v1').select('*');assert(privateRead.error);pass('actual member HTTP cannot inspect private QA list');
 sql("update private.duel_release_control_v1 set entry_open=false,search_enabled=false,required_protocol='search-authority-v1';");
 let r=await users[0].client.rpc('create_duel_room_v2',{p_use_items:false});assert.equal(r.error?.message,'DUEL_ENTRY_PAUSED');
 const ids='array['+users.slice(0,2).map(u=>q(u.id)).join(',')+']::uuid[]';
 const setQa=(ttl=3600,request=randomUUID())=>sql('select public.admin_set_duel_qa_v1('+ids+','+q(request)+",'local restored HTTP QA approval',"+ttl+');');
 setQa();pass('two accounts approved through postgres-only audited manager under closed gate');
 r=await users[2].client.rpc('create_duel_room_v2',{p_use_items:false});assert.equal(r.error?.message,'DUEL_ENTRY_PAUSED');
 const forged=await fetch(api+'/rest/v1/rpc/create_duel_room_v2',{method:'POST',headers:{apikey:config.ANON_KEY,Authorization:'Bearer '+users[2].session.access_token,'Content-Type':'application/json','x-wiki-duel-protocol':'search-authority-v1','x-qa-user-id':users[0].id},body:'{"p_use_items":false}'});assert(!forged.ok);pass('ordinary authenticated user and forged QA header rejected');
 const old=await fetch(api+'/rest/v1/rpc/create_duel_room_v2',{method:'POST',headers:{apikey:config.ANON_KEY,Authorization:'Bearer '+users[0].session.access_token,'Content-Type':'application/json'},body:'{"p_use_items":false}'});assert.equal((await old.json()).message,'DUEL_CLIENT_RELOAD_REQUIRED');pass('allowlisted real JWT with old protocol rejected');
 sql('insert into public.wiki_pages(page_id,canonical_title)values'+pages.map(p=>'('+q(p.pageId)+','+q(p.title)+')').join(',')+';insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot)values'+pages.map(p=>'('+q(p.snapshotId)+','+q(p.pageId)+','+q(p.revisionId)+','+q(p.title)+')').join(',')+';insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal)values('+q(START.snapshotId)+','+q(TARGET.pageId)+','+q(TARGET.revisionId)+','+q(TARGET.title)+','+q(TARGET.title)+',0);');
 Object.assign(process.env,{VITE_SUPABASE_URL:api,VITE_SUPABASE_ANON_KEY:config.ANON_KEY,VITE_MAINTENANCE:'false'});
 vite=await createServer({server:{host:'127.0.0.1',port:5250,strictPort:true},logLevel:'error'});await vite.listen();
 browser=await chromium.launch({headless:true,executablePath:'C:/Users/SSAFY/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe'});
 async function page(actor){const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);await context.addInitScript(session=>{if(!localStorage.getItem('sb-127-auth-token'))localStorage.setItem('sb-127-auth-token',JSON.stringify(session));},actor.session);
  await context.route('https://ko.wikipedia.org/**',async route=>{const url=new URL(route.request().url());let p=pages.find(p=>p.title===(url.searchParams.get('page')||url.searchParams.get('titles')||decodeURIComponent(url.pathname.split('/summary/')[1]||'')))||START,data;
   if(url.searchParams.get('list')==='search')data={query:{search:[{title:TARGET.title,snippet:'QA target'}]}};
   else if(url.searchParams.get('list')==='random')data={query:{random:[{title:START.title}]}};
   else if(url.pathname.includes('/summary/'))data={title:p.title,pageid:p.pageId,revision:p.revisionId,extract:'Local QA document'};
   else if(url.searchParams.get('action')==='parse')data={parse:{title:p.title,pageid:p.pageId,revid:p.revisionId,text:{'*':'<div class="mw-parser-output"><p>QA document</p><a href="/wiki/'+TARGET.title+'">'+TARGET.title+'</a></div>'}}};
   else data={query:{pages:{1:{title:p.title,pageid:p.pageId,links:[{title:TARGET.title,ns:0}]}}}};await route.fulfill({json:data});});
  await context.route(api+'/functions/v1/wiki-snapshot',async route=>{const p=pages.find(p=>p.title===route.request().postDataJSON().title)||START;await route.fulfill({json:{snapshotId:p.snapshotId,pageId:p.pageId,revisionId:p.revisionId,canonicalTitle:p.title}});});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));return p;
 }
 const host=await page(users[0]),guest=await page(users[1]);await host.goto(base+'/multiplayer');await host.getByRole('button',{name:'1 vs 1',exact:true}).click();await host.getByRole('button',{name:'방 생성',exact:true}).click();await host.waitForURL('**/multiplayer/room/**');const roomId=host.url().split('/').at(-1),code=sql('select room_code from public.game_rooms where id='+q(roomId)+';');
 r=await users[2].client.rpc('join_duel_room_v2',{p_room_code:code});assert.equal(r.error?.message,'DUEL_ENTRY_PAUSED');
 await guest.goto(base+'/multiplayer');await guest.getByRole('button',{name:'1 vs 1',exact:true}).click();await guest.getByRole('textbox',{name:'1:1 방 코드',exact:true}).fill(code);await guest.getByRole('button',{name:'참가',exact:true}).click();await guest.waitForURL('**/multiplayer/room/**');pass('QA A creates and B joins through real React UI and actual RPC');
 r=await users[1].client.rpc('start_duel_room_v2',{p_room_id:roomId,p_start_title:START.title,p_start_page_id:START.pageId,p_start_revision_id:START.revisionId});assert.equal(r.error?.message,'HOST_REQUIRED');pass('QA exception preserves guest and nonparticipant ownership checks');
 await host.reload();await host.locator('.room-target-input').fill('목표');await host.getByRole('button',{name:'검색',exact:true}).click();await host.locator('.search-item').filter({hasText:TARGET.title}).click();await expect(host.locator('.room-target-section').first()).toContainText(TARGET.title);
 await host.getByRole('button',{name:'게임 시작',exact:true}).click();await host.waitForURL('**/multiplayer/game/**');await guest.goto(base+'/multiplayer/game/'+roomId);
 await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중',{timeout:25000});await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중',{timeout:25000});pass('QA host starts normal React game under closed gate');
 const own=await users[0].client.from('room_players').select('user_id,path_titles').eq('room_id',roomId);assert.equal(own.error,null);assert.deepEqual(own.data.map(p=>p.user_id),[users[0].id]);pass('actual RLS still hides opponent path');
 sql("select public.admin_set_duel_qa_v1('{}',"+q(randomUUID())+",'local HTTP QA revocation');");
 r=await users[0].client.rpc('create_duel_room_v2',{p_use_items:false});assert.equal(r.error?.message,'DUEL_ENTRY_PAUSED');r=await users[0].client.rpc('heartbeat_duel_v2',{p_room_id:roomId});assert.equal(r.error,null);
 await host.reload();await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중',{timeout:20000});await host.locator('.article-content a').filter({hasText:TARGET.title}).click();await expect(host.getByTestId('duel-result')).toBeVisible({timeout:20000});await guest.reload();await expect(guest.getByTestId('duel-result')).toBeVisible({timeout:20000});pass('revocation blocks new entry but existing F5/move/normal result and XP settle');
 const ledger=()=>sql('select jsonb_agg(to_jsonb(l) order by l.id) from public.xp_ledger l where source_id in(select id from public.match_history where room_id='+q(roomId)+');'),before=ledger();const awards=JSON.parse(before);assert.equal(awards.length,2);assert.equal(awards.reduce((n,l)=>n+l.amount,0),75);
 await host.reload();await guest.reload();await expect(host.getByTestId('duel-result')).toBeVisible({timeout:20000});await expect(guest.getByTestId('duel-result')).toBeVisible({timeout:20000});assert.equal(ledger(),before);pass('real normal XP 50/25 and F5 ledger idempotency');
 for(const width of [320,390]){await host.setViewportSize({width,height:844});await host.screenshot({path:out+'/result-'+width+'.png',fullPage:true});assert(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}pass('restored API React result mobile 320/390px');
 const expiryReq=randomUUID();setQa(1,expiryReq);await new Promise(r=>setTimeout(r,1250));r=await users[0].client.rpc('create_duel_room_v2',{p_use_items:false});assert.equal(r.error?.message,'DUEL_ENTRY_PAUSED');setQa(1,expiryReq);r=await users[0].client.rpc('create_duel_room_v2',{p_use_items:false});assert.equal(r.error?.message,'DUEL_ENTRY_PAUSED');pass('actual TTL expiry rejects new entry and management replay cannot renew it');
 assert.deepEqual(errors,[]);completed=true;
}finally{
 for(const c of contexts)await c.close();await browser?.close();await vite?.close();await backend?.stop();
 fs.writeFileSync(out+'/report.json',JSON.stringify({date:new Date().toISOString(),basis:'20b50fb + recovery/QA candidate',restoredDatabase:db,actualRestoredDatabase:true,actualHttpAuthPostgrestReact:true,actualRealtime:true,productionContacted:false,productionWrites:0,completed,checks,errors,limits:['Wikipedia and wiki-snapshot browser transport are fixtures; other suites exercise actual Deno/Wikipedia.','Synthetic accounts/data remain only in the disposable restored database. Passwords/tokens are not stored.']},null,2));
}
