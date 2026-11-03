// Isolated local DB/Edge only. Run from a worktree under <repo>/.worktrees/.
// Wikipedia is read-only. No production credentials, account or game writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {extractSnapshotBodyLinks} from '../supabase/functions/wiki-snapshot/snapshotLinkGraph.js';
const workspace=path.resolve('../..'),project=path.join(workspace,'.temp/next-goal-20261014/jungle65-release-20261102/project');
const corpus=path.resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||path.join(workspace,'.temp/search-release-gate-20261102/corpus'));
const browserOnly=process.argv.includes('--browser');
const largeRepeat=process.argv.includes('--large-repeat');
const widths=process.argv.includes('--both-widths')?[320,390]:[390];
const out=path.resolve(process.env.SEARCH_BENCH_OUTPUT||(browserOnly?'.temp/duel-search-performance-browser':'.temp/duel-search-performance'));fs.mkdirSync(out,{recursive:true});
const container='supabase_db_wiki-next-goal-release-20261029';
assert.ok(fs.readFileSync(path.join(project,'supabase/config.toml'),'utf8').includes('project_id = "wiki-next-goal-release-20261029"'));
const status=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',project,'--output','json'],{encoding:'utf8',windowsHide:true});
assert.equal(status.status,0);const config=JSON.parse(status.stdout);assert.equal(config.API_URL,'http://127.0.0.1:55421');
const sql=s=>{const r=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const q=v=>"'"+String(v).replaceAll("'","''")+"'",admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[],rooms=[],ownedPages=[],ownedSnapshots=[],ownedCaches=[],trials=[],documents=[],errors=[],tag=randomUUID().slice(0,8);let completed=false;
let browser,vite;const peerHeartbeats=new Set();
const write=()=>fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({date:new Date().toISOString(),completed,productionContacted:false,isolatedApi:config.API_URL,cacheDefinition:'cold=search-document cache miss, warm=search-document hit; source link graph pre-existing in both',graphBoundary:'Actual pinned HTML and body link titles; fixture destination IDs. Wikipedia identity resolution is outside the timed activation path.',coldRuntime:'First request includes current worker initialization; later cold trials are document-cache cold, not forced isolate cold.',trials,documents,errors},null,2));
const timed=async work=>{const at=performance.now(),value=await work();return {value,ms:performance.now()-at};};
const rpc=async(client,name,args)=>{const r=await client.rpc(name,args);assert.equal(r.error,null,r.error?.message);return r.data;};
const edge=async(body)=>{const measured=await timed(async()=>{const r=await fetch(config.API_URL+'/functions/v1/duel-search',{method:'POST',headers:{apikey:config.ANON_KEY,Authorization:'Bearer '+users[0].session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(22000)});return {status:r.status,timing:r.headers.get('server-timing'),body:await r.json()};});return {...measured.value,ms:measured.ms};};
async function seed(meta){
 const page=JSON.parse(fs.readFileSync(path.join(corpus,meta.file),'utf8')).parse,raw=page.text['*'];
 assert.equal(String(page.revid),meta.revisionId);assert.equal(String(page.pageid),meta.pageId);
 const existing=sql(`select id from public.wiki_page_snapshots where page_id=${q(meta.pageId)} and revision_id=${q(meta.revisionId)};`);
 if(existing){
  assert.equal(sql(`select count(*) from private.duel_search_documents_v1 where snapshot_id=${q(existing)};`),'0','refuse an existing search cache');
  assert.equal(sql(`select count(*) from private.duel_search_sessions_v1 where source_snapshot_id=${q(existing)};`),'0','refuse a snapshot used by other search sessions');
  ownedCaches.push(existing);return {...meta,snapshot:existing,graphOrigin:'existing local snapshot, read only',bodyLinks:Number(sql(`select count(*) from public.wiki_snapshot_links where snapshot_id=${q(existing)};`))};
 }
 if(sql(`select count(*) from public.wiki_pages where page_id=${q(meta.pageId)};`)==='0'){sql(`insert into public.wiki_pages(page_id,canonical_title)values(${q(meta.pageId)},${q(meta.title)});`);ownedPages.push(meta.pageId);}
 const snapshot=randomUUID();ownedSnapshots.push(snapshot);sql(`insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot)values(${q(snapshot)},${q(meta.pageId)},${q(meta.revisionId)},${q(meta.title)});`);
 const allowed=new Set(page.links.filter(x=>x.ns===0).map(x=>x['*'])),bodyLinks=extractSnapshotBodyLinks(raw).filter(x=>allowed.has(x.title));assert.ok(bodyLinks.length);
 sql(`insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_title_snapshot,link_text,ordinal)values ${bodyLinks.map((x,i)=>`(${q(snapshot)},${q('perf-'+tag+'-'+i)},${q(x.title)},${q(x.linkText||x.title)},${i})`).join(',')};`);
 return {...meta,snapshot,bodyLinks:bodyLinks.length};
}
async function fixture(meta){
 const room=randomUUID();rooms.push(room);sql(`insert into public.game_rooms(id,room_code,host_user_id,status,mode,min_players,max_players,use_items,game_starts_at)values(${q(room)},${q(randomUUID().slice(0,6).toUpperCase())},${q(users[0].id)},'playing','duel',2,2,true,clock_timestamp()-interval '2 seconds');insert into public.room_players(room_id,user_id,role,nickname_snapshot,player_status,current_title,current_page_id,current_revision_id,target_title,target_page_id,target_revision_id,start_title,start_page_id,start_revision_id,path_titles,path_page_ids,path_revision_ids)select ${q(room)},id,r,'Performance QA','playing',${q(meta.title)},${q(meta.pageId)},${q(meta.revisionId)},'성능 검증 목표','perf-target','perf-rev',${q(meta.title)},${q(meta.pageId)},${q(meta.revisionId)},array[${q(meta.title)}],array[${q(meta.pageId)}],array[${q(meta.revisionId)}] from(values(${q(users[0].id)}::uuid,'host'),(${q(users[1].id)}::uuid,'guest'))u(id,r);`);
 const grant=sql(`insert into public.duel_item_grants(room_id,user_id,slot_index,slot_role,item_id)values(${q(room)},${q(users[0].id)},3,'search','search_once')returning id;`).split('\n')[0];return {room,grant};
}
try{
 write();for(let i=0;i<2;i++){
  const email='perf-'+tag+'-'+i+'@local.test',password=randomUUID()+randomUUID(),r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null);const actor={id:r.data.user.id};users.push(actor);
  sql(`insert into public.profiles(id,username,nickname,synthetic_email)values(${q(actor.id)},${q('perf_'+tag+'_'+i)},'Performance QA',${q(email)});`);
  actor.client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await actor.client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);actor.session=signed.data.session;
 }
 const index=JSON.parse(fs.readFileSync(path.join(corpus,'index.json'),'utf8'));
 if(browserOnly){
  Object.assign(process.env,{VITE_SUPABASE_URL:config.API_URL,VITE_SUPABASE_ANON_KEY:config.ANON_KEY,VITE_MAINTENANCE:'false'});
  vite=await createServer({root:process.cwd(),cacheDir:path.join(out,'vite-cache'),server:{host:'127.0.0.1',port:5293,strictPort:true},logLevel:'error'});await vite.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Users/SSAFY/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe'});
 }
 const diagnosticFile=process.argv.find(arg=>arg.startsWith('--corpus-file='))?.split('=')[1];
 for(const file of diagnosticFile?[diagnosticFile]:largeRepeat?['05.json']:['00.json','01.json','02.json','04.json','05.json']){
  const meta=await seed(index.find(x=>x.file===file));
  if(browserOnly){
   const actual=JSON.parse(fs.readFileSync(path.join(corpus,meta.file),'utf8')).parse;
   // One real corpus-to-corpus link exercises navigation and authoritative DB
   // movement, in addition to comparing every rendered destination/manifest.
   if(meta.title==='대한민국'){
    if(ownedSnapshots.includes(meta.snapshot))sql(`update public.wiki_snapshot_links set target_page_id='6160',target_revision_id='42027587' where snapshot_id=${q(meta.snapshot)} and target_title_snapshot='한강';`);
    else assert.equal(sql(`select distinct target_page_id from public.wiki_snapshot_links where snapshot_id=${q(meta.snapshot)} and target_title_snapshot='한강';`),'6160','existing graph remains read-only');
   }
   for(const width of widths)for(const condition of ['cold','warm']){
    if(condition==='cold')sql(`delete from private.duel_search_documents_v1 where snapshot_id=${q(meta.snapshot)};`);
    const f=await fixture(meta),ctx=await browser.newContext({viewport:{width,height:844}});
    // A valid two-player game needs a live opponent too. Do not disable the
    // server's disconnect finalizer or lengthen search/reconnect deadlines.
    await rpc(users[1].client,'heartbeat_duel_v2',{p_room_id:f.room});
    const peerHeartbeat=setInterval(()=>{rpc(users[1].client,'heartbeat_duel_v2',{p_room_id:f.room}).catch(error=>{errors.push({stage:'peer-heartbeat',message:error.message});write();});},5000);peerHeartbeats.add(peerHeartbeat);
    await ctx.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),users[0].session);
    await ctx.route('**/ko.wikipedia.org/**',route=>{const u=new URL(route.request().url()),requested=u.pathname.includes('/summary/')?decodeURIComponent(u.pathname.split('/summary/')[1]):(u.searchParams.get('titles')||u.searchParams.get('page')),target=requested==='한강'?index.find(m=>m.title==='한강'):meta,targetActual=target===meta?actual:JSON.parse(fs.readFileSync(path.join(corpus,target.file),'utf8')).parse,page={pageid:target.pageId,revid:target.revisionId,lastrevid:target.revisionId,title:target.title,ns:0,extract:'실제 문서 성능 검증',links:targetActual.links.map(x=>({title:x['*'],ns:x.ns}))};return route.fulfill({json:u.pathname.includes('/summary/')?{...page,revision:target.revisionId}:u.searchParams.get('action')==='parse'?{parse:targetActual}:{query:{pages:{[target.pageId]:page}}}});});
    // Images do not participate in text search; avoid extra third-party traffic.
    await ctx.route('**/upload.wikimedia.org/**',route=>route.abort());
    const page=await ctx.newPage(),navigation=[];
    page.on('response',async response=>{if(/wiki-snapshot|apply_duel_move_v2/.test(response.url())){try{const b=await response.json();navigation.push({endpoint:response.url().split('/').at(-1),status:response.status(),code:b.code,error:b.error,pageId:b.pageId,revisionId:b.revisionId});write();}catch{}}});
    await page.goto('http://127.0.0.1:5293/multiplayer/game/'+f.room);await expect(page.locator('.article-content')).toBeVisible({timeout:30000});
    const readyResponse=page.waitForResponse(r=>r.url().includes('/functions/v1/duel-search')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='prepare',{timeout:22000});readyResponse.catch(()=>{});
    let activationAt;page.on('request',r=>{if(r.url().endsWith('/rpc/use_duel_item_v3'))activationAt=performance.now();});
    const clickAt=performance.now();await page.getByRole('button',{name:/검색.*사용 가능/}).click();const response=await readyResponse,body=await response.json();assert.ok(activationAt,'actual activation request observed');const at=activationAt,record={title:meta.title,width,condition,code:body.code,status:response.status(),prepareTiming:response.headers()['server-timing'],activationToResponseMs:performance.now()-at,automationClickToResponseMs:performance.now()-clickAt};trials.push(record);write();
    assert.equal(body.code,'SEARCH_DOCUMENT_READY','every UI trial must actually prepare');
    if(body.code==='SEARCH_DOCUMENT_READY'){
     await expect(page.locator('.game-search-panel')).toBeVisible({timeout:15000});record.activationToVisibleMs=performance.now()-at;record.remainingMs=Math.max(0,15000-record.activationToVisibleMs);
     const stored=JSON.parse(sql(`select text_nodes from private.duel_search_documents_v1 where snapshot_id=${q(meta.snapshot)};`)),rendered=await page.locator('.article-content').evaluate(root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),a=[];while(w.nextNode())a.push(w.currentNode.nodeValue);return a;});assert.deepEqual(rendered,stored);record.manifestMatches=true;
     record.beforeSearchMs=performance.now()-at;record.panelGeometry=await page.locator('.game-search-panel').evaluate(panel=>{const nodes=[];for(let n=panel;n;n=n.parentElement){const s=getComputedStyle(n),r=n.getBoundingClientRect();nodes.push({className:n.className,top:r.top,bottom:r.bottom,position:s.position,topStyle:s.top,transform:s.transform,filter:s.filter,perspective:s.perspective,contain:s.contain,feedbackBottom:s.getPropertyValue('--duel-feedback-bottom'),isolation:s.isolation});}return nodes;});write();await page.screenshot({path:path.join(out,file+'-'+condition+'-before-search-'+width+'.png')});
     const searchResponse=page.waitForResponse(r=>r.url().includes('/functions/v1/duel-search')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='search',{timeout:10000}).catch(e=>{throw Error('search response: '+e.message)});searchResponse.catch(()=>{});
     await page.getByRole('textbox',{name:'현재 문서에서 찾을 단어'}).fill(meta.title.slice(0,2));const searchAt=performance.now();await page.getByRole('button',{name:'찾기',exact:true}).click({timeout:5000});record.searchCode=(await (await searchResponse).json()).code;record.searchResponseMs=performance.now()-searchAt;
     assert.equal(record.searchCode,'SEARCH_FOUND','every UI trial must actually search');
     if(record.searchCode==='SEARCH_FOUND'){await expect(page.locator('.game-search-highlight').first()).toBeVisible();record.searchToHighlightMs=performance.now()-searchAt;}
     if(meta.title==='대한민국'){
      record.navigation=navigation;write();
      const link=page.locator('.article-content a[data-wiki-title="한강"]').first();await expect(link).toBeVisible();await link.click();
      await expect.poll(()=>sql(`select current_page_id from public.room_players where room_id=${q(f.room)} and user_id=${q(users[0].id)};`)).toBe('6160');
      record.realCorpusLinkMove='대한민국/42562205 -> 한강/42027587';
     }
    }
    await page.screenshot({path:path.join(out,file+'-'+condition+'-'+width+'.png')});write();console.log('UI',meta.title,condition,JSON.stringify(record));clearInterval(peerHeartbeat);peerHeartbeats.delete(peerHeartbeat);await ctx.close();sql(`delete from public.game_rooms where id=${q(f.room)};`);rooms.splice(rooms.indexOf(f.room),1);
   }
   continue;
  }
  for(const condition of ['cold','warm'])for(let n=0;n<(condition==='cold'?(largeRepeat?20:5):10);n++){
   if(condition==='cold')sql(`delete from private.duel_search_documents_v1 where snapshot_id=${q(meta.snapshot)};`);
   const cacheWasPresent=sql(`select count(*) from private.duel_search_documents_v1 where snapshot_id=${q(meta.snapshot)};`)==='1';
   const f=await fixture(meta),at=performance.now(),activated=await timed(()=>rpc(users[0].client,'use_duel_item_v3',{p_room_id:f.room,p_grant_id:f.grant,p_request_id:randomUUID(),p_correlation_id:randomUUID()}));assert.equal(activated.value.ok,true);
   const b={action:'prepare',roomId:f.room,itemEventId:activated.value.item_event_id};let prepared;
   try{prepared=await edge(b)}catch(e){prepared={status:0,body:{code:e.name},ms:performance.now()-at-activated.ms};}
   const readyMs=performance.now()-at,record={title:meta.title,rawBytes:meta.rawBytes,condition,cacheWasPresent,n:n+1,activationMs:activated.ms,prepareMs:prepared.ms,prepareTiming:prepared.timing,code:prepared.body.code,status:prepared.status,activationToReadyMs:readyMs,remainingMs:prepared.body.code==='SEARCH_DOCUMENT_READY'?Math.max(0,15000-readyMs):0,search:null};
   if(prepared.body.code==='SEARCH_DOCUMENT_READY'){
    const response=await edge({action:'search',roomId:f.room,itemEventId:activated.value.item_event_id,documentHash:prepared.body.documentHash,requestId:randomUUID(),query:meta.title.slice(0,2)});
    record.search={ms:response.ms,timing:response.timing,code:response.body.code,status:response.status};
   }
   trials.push(record);write();console.log(meta.title,condition,n+1,record.code,Math.round(readyMs)+'ms',record.search?.code||'');
   sql(`delete from public.game_rooms where id=${q(f.room)};`);rooms.splice(rooms.indexOf(f.room),1);
   if(condition==='cold')await new Promise(r=>setTimeout(r,1500));
  }
  const storage=sql(`select json_build_object('htmlBytes',octet_length(document_html),'textManifestBytes',octet_length(text_nodes::text),'rowBytes',pg_column_size(d),'textNodes',jsonb_array_length(text_nodes)) from private.duel_search_documents_v1 d where snapshot_id=${q(meta.snapshot)};`);
  documents.push({...meta,storage:storage?JSON.parse(storage):null});write();
 }
 completed=true;
}catch(e){errors.push({name:e.name,message:e.message});throw e;}finally{
 for(const timer of peerHeartbeats)clearInterval(timer);
 await browser?.close();await vite?.close();
 for(const room of rooms)sql(`delete from public.game_rooms where id=${q(room)};`);
 for(const actor of users){const r=await admin.auth.admin.deleteUser(actor.id);assert.equal(r.error,null);}
 for(const id of ownedCaches)sql(`delete from private.duel_search_documents_v1 where snapshot_id=${q(id)};`);
 for(const id of ownedSnapshots)sql(`delete from public.wiki_page_snapshots where id=${q(id)};`);
 for(const id of ownedPages)sql(`delete from public.wiki_pages where page_id=${q(id)};`);
 write();
}
