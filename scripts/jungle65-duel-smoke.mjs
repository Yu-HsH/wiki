// Real React/CSS + synthetic Auth/REST/RPC/Realtime. Never contacts Supabase.
// --before reads the preserved, pre-edit source; external font responses stay in memory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium, expect} from '@playwright/test';

const root=fileURLToPath(new URL('../',import.meta.url));
const task=path.resolve(root,process.env.JUNGLE65_DUEL_TASK||'.temp/jungle65-duel-20261102');
const sourceRoot=path.resolve(root,process.env.JUNGLE65_DUEL_SOURCE_ROOT||path.join(task,'preserved'));
const before=process.argv.includes('--before');
const output=path.join(task,before?'before':'after');
fs.mkdirSync(output,{recursive:true});
const port=Number(process.env.JUNGLE65_DUEL_PORT)||(before?5216:5217),base=`http://127.0.0.1:${port}`,api='http://127.0.0.1:54329';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const names=['캠프지기','아주긴한글닉네임과EnglishJungle65탐험가','새싹 탐험가'];
const duelId='d0000000-0000-4000-8000-000000000065',groupId='a0000000-0000-4000-8000-000000000065';
const roomFor=mode=>({id:mode==='duel'?duelId:groupId,room_code:mode==='duel'?'DUEL65':'CAMP65',mode,status:'waiting',host_user_id:ids[0],max_players:mode==='duel'?2:6,min_players:mode==='duel'?2:3,use_items:mode==='duel',is_public:false,state_version:1});
const playersFor=mode=>ids.slice(0,mode==='duel'?2:3).map((user_id,i)=>({id:`${mode}-fixture-${i}`,room_id:roomFor(mode).id,user_id,nickname_snapshot:names[i],profile_image_snapshot:null,role:i===0?'host':'guest',player_status:'waiting',is_ready:mode==='group'&&i!==2,target_title:mode==='duel'&&i===0?'훈민정음':null,target_page_id:mode==='duel'&&i===0?'101':null,submitted_target_title:mode==='group'&&i!==2?['훈민정음','한글'][i]:null,submitted_target_page_id:mode==='group'&&i!==2?String(101+i):null,created_at:`2026-11-02T00:00:0${i}Z`}));
const report={date:'2026-11-02 KST',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),uncommitted:true,before,realReact:true,syntheticBackend:true,realSupabaseContacted:false,screens:[],checks:[],pageErrors:[],consoleErrors:[],requests:[],fontNetwork:[],blockedExternal:[]};
const check=(name,condition=true)=>{assert.ok(condition,name);report.checks.push(name);console.log('PASS',name)};
const fontCache=new Map();
const server=await createServer({root,configFile:false,envFile:false,cacheDir:path.join(task,'vite-cache-'+port),
 plugins:before?[{name:'preserved-entry',enforce:'pre',load(id){const relative=path.relative(root,id.split('?')[0]);const p=path.join(sourceRoot,relative);if(!relative.startsWith('..')&&/\.(?:[cm]?jsx?|css)$/.test(relative)&&fs.existsSync(p)&&fs.statSync(p).isFile())return fs.readFileSync(p,'utf8')}}]:[],
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(api),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('entry-ui-fixture-public-key'),'import.meta.env.VITE_MAINTENANCE':JSON.stringify('')},
 server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/.temp/**']}}
});
let browser;
async function makePage(width,{mode='duel',actor=0,listing='normal',guest=false,anonymous=false,fontFailure=false}={}){
 const context=await browser.newContext({viewport:{width,height:width<=390?844:1000},hasTouch:width<=390,isMobile:width<=390,reducedMotion:'reduce',serviceWorkers:'block'});
 const user={id:ids[actor],aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',user_metadata:{nickname:names[actor]}};
 const exp=Math.floor(Date.now()/1000)+3600;
 const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp,role:'authenticated'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.fixture';
 await context.addInitScript(({user,token,exp,guest,anonymous})=>{if(anonymous)return;if(guest)localStorage.setItem('wiki_game_local_user',JSON.stringify({id:'guest-review',displayName:'게스트 검토',isGuest:true,mode:'local'}));else localStorage.setItem('sb-127-auth-token',JSON.stringify({user,access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:exp,expires_in:3600}))},{user,token,exp,guest,anonymous});
 const state={mode,listing,joinFail:false,delayList:0,delayMutation:0,mutationError:false,listCalls:0,calls:[],fontFailure};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===base)return route.continue();
  const fontSource=url.href.startsWith('https://cdn.jsdelivr.net/npm/pretendard@1.3.9/')||url.href==='https://img.cafe24.com/csdstatic/freefonts/fonts/ko/Cafe24Ssurround-v2.0.woff2'||url.href==='https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Bold.woff2';
  if(fontSource){
   if(fontFailure)return route.abort('failed');
   if(!fontCache.has(url.href))fontCache.set(url.href,(async()=>{const response=await route.fetch();const body=await response.body();report.fontNetwork.push({url:url.href,status:response.status(),bytes:body.length});return {status:response.status(),body,contentType:response.headers()['content-type'],headers:{'access-control-allow-origin':'*'}}})());
   return route.fulfill(await fontCache.get(url.href));
  }
  const json=(data,status=200)=>route.fulfill({status,json:data,headers:{'access-control-allow-origin':'*','content-range':'0-0/0'}});
  if(url.origin!==api){report.blockedExternal.push(url.origin+url.pathname);return route.fulfill({status:200,contentType:request.resourceType()==='stylesheet'?'text/css':'application/json',body:request.resourceType()==='stylesheet'?'':'{}'})}
  const p=url.pathname,body=request.postData()?request.postDataJSON():{};
  const entry={path:p,method:request.method(),body,fixture:true};state.calls.push(entry);report.requests.push(entry);
  if(p.startsWith('/auth/v1/'))return json(user);
  if(p.endsWith('/profiles'))return json(request.headers().accept?.includes('object')?{id:user.id,nickname:names[actor],profile_image_url:null}:[]);
  if(p.endsWith('/get_profile_cards_v1'))return json({ok:true,cards:{}});
  if(p.endsWith('/get_xp_summary_v1'))return json({ok:true,total_xp:435,level:5,current_level_xp:35,next_level_xp:200});
  if(p.endsWith('/get_my_achievements_v1'))return json({ok:true,achievements:[],hidden:{discovered:0,achievements:[]},unseenCount:0});
  if(p.endsWith('/ensure_today_daily_challenge'))return json([{start_title:'대한민국',target_title:'한글',challenge_date:'2026-11-02',hint:'검수용 코스'}]);
  if(p.endsWith('/game_rooms'))return json(roomFor(mode));
  if(p.endsWith('/room_players')||p.endsWith('/get_duel_room_players_v1'))return json(playersFor(mode));
  if(p.endsWith('/list_public_waiting_rooms_v1')){
   state.listCalls++;
   if(state.delayList)await new Promise(r=>setTimeout(r,state.delayList));
   if(state.listing==='loading')await new Promise(r=>setTimeout(r,2400));
   if(state.listing==='error')return json({code:'FIXTURE_LIST_ERROR',message:'목록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.'},400);
   if(state.listing==='empty')return json([]);
   return json([0,1,2].map(i=>({room_id:i===0?roomFor(mode).id:`b000000${i}-0000-4000-8000-000000000065`,mode:body.p_mode,host_nickname:i===0?'캠프지기':i===1?names[1]:'Jungle Scout 65',current_players:mode==='duel'?1:3+i,max_players:mode==='duel'?2:6+i,use_items:i%2===0&&mode==='duel',created_at:'2026-11-02T00:00:00Z'})));
  }
  if(/\/(join_public_room_v1|create_discoverable_duel_room_v1|create_discoverable_group_room_v1|find_room_by_code_v1|join_duel_room_v2|join_group_room)$/.test(p)){
   if(state.delayMutation)await new Promise(r=>setTimeout(r,state.delayMutation));
   if(state.mutationError||(state.joinFail&&p.endsWith('/join_public_room_v1')))return json({code:'ROOM_FULL',message:'이미 정원이 찼거나 참가할 수 없는 방입니다.'},400);
   if(p.endsWith('/find_room_by_code_v1'))return json(groupId);
   if(p.includes('/create_discoverable_'))return json(roomFor(mode));
   if(p.endsWith('/join_public_room_v1'))return json({ok:true});
   return json(playersFor(mode)[actor]);
  }
  // HOME has optional read-only feeds. Unknown requests are never sent to Supabase.
  return json([]);
 });
 await context.routeWebSocket('**/*',ws=>{if(!ws.url().startsWith(api.replace('http:','ws:'))){ws.close();return}ws.onMessage(raw=>{const frame=JSON.parse(String(raw));if(!Array.isArray(frame))return;const[joinRef,ref,topic,event,payload]=frame;const response=event==='phx_join'?{postgres_changes:(payload?.config?.postgres_changes??[]).map((x,i)=>({...x,id:6500+i}))}:{};if(['phx_join','phx_leave','heartbeat','access_token'].includes(event))ws.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response}]))})});
 const page=await context.newPage();page.fixture=state;
 // Freeze Date only; real timers keep working. HOME's live query-time label is deterministic.
 await page.clock.setFixedTime(new Date('2026-11-02T00:00:00Z'));
 page.on('pageerror',e=>report.pageErrors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({message:m.text(),intentional:state.listing==='error'||state.joinFail||state.mutationError||fontFailure})});
 return page;
}
async function ready(page){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(600)}
async function shot(page,name){
 await ready(page);
 const metrics=await page.evaluate(()=>{
  const box=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return {x:+(r.x+scrollX).toFixed(2),top:+(r.y+scrollY).toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)}};
  return {width:innerWidth,totalHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,board:box('.mp-public-board'),firstRoom:box('.mp-public-room'),join:box('.mp-card--join'),create:box('.mp-card--create'),buttons:[...document.querySelectorAll('main button')].filter(e=>e.offsetWidth).map(e=>({text:e.textContent.trim(),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status}))};
 });
 const file=path.join(output,name+'.png');await page.screenshot({path:file,fullPage:true,animations:'disabled'});
 report.screens.push({name,...metrics,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
 check(name+': no horizontal overflow',metrics.scrollWidth<=metrics.width);
 return metrics;
}
async function platformFonts(page,selectors){const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const{root:doc}=await cdp.send('DOM.getDocument');const data={};for(const[k,selector]of Object.entries(selectors)){const{nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector});assert.ok(nodeId,selector);data[k]=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts}await cdp.detach();return data}

const reward=(id,kind,asset,name)=>({reward_id:'fixture-'+id,kind,asset_ref:asset,display_name:name});
const cards=Object.fromEntries(ids.map((id,i)=>[id,{userId:id,nickname:names[i],icon:reward('icon','icon','/assets/wiki-race/explorer-portrait-small.png','탐험가'),title:reward('title','title',null,i===1?'끝없는 링크의 숲을 개척한 탐험가':'지식의 길잡이'),frame:reward('frame','frame',i===0?'frame:tier-3':'frame:special',i===0?'황금 프레임':'특별 프레임')}]))
async function duelPage(width,options={}){
 const p=await makePage(width,{actor:options.actor||0,fontFailure:options.fontFailure||false});
 const state={room:{...roomFor('duel'),use_items:options.items!==false},solo:options.solo||false,target:options.target===undefined?'훈민정음':options.target,targetId:'101',queryDelay:0,saveDelay:0,saveFail:false,snapshotFail:false,failReads:false,startDelay:0,calls:[],sockets:[]};
 const rows=()=>playersFor('duel').slice(0,state.solo?1:2).map((r,i)=>({...r,target_title:i===0?state.target:null,target_page_id:i===0&&state.target?state.targetId:null}));
 p.duel=state;
 await p.context().addInitScript(({fail})=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){if(fail)throw new Error('fixture clipboard denied');window.__copiedCode=text}}})},{fail:options.copyFail||false});
 await p.context().route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  const json=(data,status=200)=>route.fulfill({status,json:data,headers:{'access-control-allow-origin':'*','content-range':'0-0/0'}});
  if(url.origin===api){
   const body=req.postData()?req.postDataJSON():{},endpoint=url.pathname.split('/').at(-1);
   if(['game_rooms','get_duel_room_players_v1','join_duel_room_v2','set_duel_target_v2','start_duel_room_v2','leave_duel_room_v2','wiki-snapshot'].includes(endpoint))state.calls.push({endpoint,body});
   if(endpoint==='game_rooms'||endpoint==='get_duel_room_players_v1'){if(state.failReads)return json({code:'FIXTURE_READ_ERROR',message:'fixture read failed'},400);return json(endpoint==='game_rooms'?state.room:rows())}
   if(endpoint==='join_duel_room_v2')return json(rows()[options.actor||0]);
   if(endpoint==='get_profile_cards_v1')return json({ok:true,cards});
   if(endpoint==='get_profile_card_v1')return json({ok:true,card:cards[body.p_user_id]});
   if(endpoint==='profiles'){const requested=(url.searchParams.get('id')||'').replace('eq.','');const index=Math.max(0,ids.indexOf(requested));return json({id:ids[index],nickname:names[index],username:'fixture',profile_level:12})}
   if(endpoint==='public_profiles')return json({id:ids[options.actor||0],nickname:names[options.actor||0],username:'fixture',profile_level:12});
   if(endpoint==='wiki-snapshot'){if(state.snapshotFail)return json({message:'문서 snapshot 검증 실패'},500);return json({snapshotId:'fixture-snapshot',canonicalTitle:body.title,pageId:body.pageId||'101',revisionId:body.revisionId||'201'})}
   if(endpoint==='set_duel_target_v2'){if(state.saveDelay)await new Promise(r=>setTimeout(r,state.saveDelay));if(state.saveFail)return json({code:'TARGET_DENIED',message:'목표 저장이 거부되었습니다. 다시 선택하세요.'},400);state.target=body.p_target_title;state.targetId=body.p_target_page_id;return json(rows()[0])}
   if(endpoint==='start_duel_room_v2'){if(state.startDelay)await new Promise(r=>setTimeout(r,state.startDelay));return json(state.room)}
   if(endpoint==='leave_duel_room_v2')return json({ok:true});
  }
  if(url.hostname==='ko.wikipedia.org'){
   if(url.pathname.includes('/page/summary/')){const title=decodeURIComponent(url.pathname.split('/').at(-1));return json({title,pageid:title==='대한민국'?102:101,revision:title==='대한민국'?202:201,extract:'검증용 위키 문서 요약',description:'검증용 문서'})}
   if(url.searchParams.get('list')==='search'){if(state.queryDelay)await new Promise(r=>setTimeout(r,state.queryDelay));return json({query:{search:[{title:'세종대왕',snippet:'조선의 <span class="searchmatch">왕</span>'},{title:'한글',snippet:'한글 문자'}]}})}
   if(url.searchParams.get('list')==='random')return json({query:{random:[{id:102,title:'대한민국',ns:0}]}});
   if(url.searchParams.get('action')==='parse')return json({parse:{title:'대한민국',pageid:102,revid:202,text:{'*':'<div class="mw-parser-output"><p>대한민국 <a href="/wiki/한글">한글</a></p></div>'},sections:[]}});
   return json({query:{pages:{102:{pageid:102,title:'대한민국',links:[{ns:0,title:'한글'}],extract:'대한민국 문서',revisions:[{revid:202}]}}}});
  }
  return route.fallback();
 });
 await p.context().routeWebSocket(api.replace('http:','ws:')+'/**',ws=>{
  let socket;
  ws.onMessage(raw=>{const frame=JSON.parse(String(raw));if(!Array.isArray(frame))return;const[joinRef,ref,topic,event,payload]=frame;
   if(event==='phx_join'){const bindings=(payload?.config?.postgres_changes??[]).map((x,i)=>({...x,id:7300+i}));socket={ws,topic,joinRef,bindings};state.sockets.push(socket);ws.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{postgres_changes:bindings}}]));}
   else if(['phx_leave','heartbeat','access_token'].includes(event))ws.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{}}]));
  });
 });
 state.emit=table=>{for(const s of state.sockets){const binding=s.bindings.find(x=>x.table===table);if(binding)s.ws.send(JSON.stringify([s.joinRef,null,s.topic,'postgres_changes',{ids:[binding.id],data:{schema:'public',table,columns:[],commit_timestamp:'2026-11-02T00:00:00Z',type:'UPDATE',record:table==='game_rooms'?state.room:rows()[0],old_record:{},errors:null}}]))}};
 return p;
}
const calls=(page,endpoint)=>page.duel.calls.filter(c=>c.endpoint===endpoint);
async function enter(page){await page.goto(base+'/multiplayer/room/'+duelId);await expect(page.locator('.wr-duel-stage')).toBeVisible();await ready(page)}
async function duelShot(page,name){await shot(page,name);const s=report.screens.at(-1);s.duel=await page.evaluate(()=>({players:[...document.querySelectorAll('.wr-duel-player')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}),vs:(()=>{const r=document.querySelector('.wr-duel-center').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),targetCount:document.querySelectorAll('.wr-duel-center-title').length,sticky:getComputedStyle(document.querySelector('.wr-lobby-actions')).position}));return s}
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.JUNGLE65_BROWSER_PATH||'C:/Users/SSAFY/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe'});report.browser=await browser.version();
 for(const width of [1440,768,390,320]){
  const page=await duelPage(width);await enter(page);const s=await duelShot(page,'duel-'+width);
  check(width+': no READY',await page.getByRole('button',{name:'READY',exact:true}).count()===0);
  await expect(page.getByRole('button',{name:'게임 시작',exact:true})).toBeEnabled();
  if(!before){check(width+': single saved target panel',s.duel.targetCount===1);check(width+': non-sticky CTA',s.duel.sticky==='static');check(width+': actual profile frames',await page.locator('.wr65-duel-profile.pcard--framed').count()===2);check(width+': gold/special frame and picture',await page.locator('.wr65-duel-profile .pcard-avatar-img').count()===2&&await page.locator('.wr65-duel-profile.pcard--frame-special .pcard-avatar-ring').count()===1);if(width>=390)check(width+': side by side VS',Math.abs(s.duel.players[0].y-s.duel.players[1].y)<1&&s.duel.vs.x>s.duel.players[0].x&&s.duel.players[1].x>s.duel.vs.x);else check('320: vertical comparison',s.duel.players[1].y>s.duel.players[0].y);
   const fonts=await platformFonts(page,{title:'.wr-lobby-titles h1',name:'.wr65-duel-profile .pcard-name',goal:'.wr-duel-center-title',cta:'.wr-lobby-actions button'});report.fontRoles??=[];report.fontRoles.push({width,fonts});check(width+': A+ fonts',fonts.title.some(f=>f.isCustomFont&&f.postScriptName.includes('Ssurround'))&&fonts.name.some(f=>f.isCustomFont&&f.familyName.includes('Pretendard'))&&fonts.goal.some(f=>f.isCustomFont&&f.postScriptName==='MaruBuri-Bold'));
  }
  await page.reload();await expect(page.locator('.wr-duel-center-title')).toHaveText('훈민정음');check(width+': F5 saved server target restored');await page.context().close();
 }
 // Product pages and both entry modes: frozen Date + exact source before/after.
 for(const width of [1440,768,390,320])for(const[view,url,opts,selector]of[
  ['entry-duel','/multiplayer?mode=duel',{},'.mp-public-room'],['entry-group','/multiplayer?mode=group',{mode:'group'},'.mp-public-room'],['group','/multiplayer/group/room/'+groupId,{mode:'group'},'.wr-party'],['landing','/',{anonymous:true},'.wr65-landing-picture'],['home','/lobby',{},'.wr65-jungle-hero'],['play','/play',{},'.wr-modes']]){
   const page=await makePage(width,opts);await page.goto(base+url);await expect(page.locator(selector).first()).toBeVisible();await shot(page,view+'-'+width);await page.context().close();
 }
 if(!before){
  const alone=await duelPage(390,{solo:true,target:null});await enter(alone);await expect(alone.getByRole('button',{name:'게임 시작',exact:true})).toBeDisabled();await expect(alone.locator('.wr-duel-player--empty')).toBeVisible();await duelShot(alone,'solo-no-target-390');check('solo/missing target blocks start');
  alone.duel.solo=false;let reads=calls(alone,'get_duel_room_players_v1').length;alone.duel.emit('room_players');await expect.poll(()=>calls(alone,'get_duel_room_players_v1').length).toBeGreaterThan(reads);await expect(alone.locator('.wr-duel-player--empty')).toHaveCount(0);await expect(alone.getByRole('button',{name:'게임 시작',exact:true})).toBeDisabled();check('Realtime guest join re-reads without target start');
  alone.duel.queryDelay=900;await alone.getByRole('textbox',{name:'목표 문서 검색어'}).fill('왕');await alone.getByRole('textbox',{name:'목표 문서 검색어'}).press('Enter');await expect(alone.locator('.wr65-target-state')).toHaveText('목표 검색 중');await expect(alone.getByRole('button',{name:'게임 시작',exact:true})).toBeDisabled();await expect(alone.locator('.wr-search-results button')).toHaveCount(2);check('query remains distinct from persisted target',await alone.locator('.wr-duel-center-title').count()===0&&calls(alone,'set_duel_target_v2').length===0);await duelShot(alone,'search-results-390');
  alone.duel.saveDelay=1200;await alone.locator('.wr-search-results button').first().click();await expect(alone.locator('.wr65-target-state')).toHaveText('목표 저장 중');await expect(alone.getByRole('button',{name:'게임 시작',exact:true})).toBeDisabled();await duelShot(alone,'saving-target-390');await expect(alone.locator('.wr-duel-center-title')).toHaveText('세종대왕');await expect(alone.getByRole('button',{name:'게임 시작',exact:true})).toBeEnabled();check('selection uses summary/snapshot/save identity',calls(alone,'set_duel_target_v2').at(-1).body.p_target_title==='세종대왕'&&calls(alone,'set_duel_target_v2').at(-1).body.p_target_page_id==='101'&&calls(alone,'set_duel_target_v2').at(-1).body.p_is_ready===false);await alone.reload();await expect(alone.locator('.wr-duel-center-title')).toHaveText('세종대왕');check('F5 restores newly saved target');
  await alone.getByRole('button',{name:'목표 문서 변경'}).click();await expect(alone.getByRole('textbox',{name:'목표 문서 검색어'})).toBeFocused();await expect(alone.locator('.wr-duel-center-title')).toHaveText('세종대왕');await expect(alone.locator('.wr65-target-state')).toHaveText('기존에 저장된 목표');check('edit keeps old saved target visible');await alone.getByRole('textbox',{name:'목표 문서 검색어'}).fill('한글');await alone.getByRole('textbox',{name:'목표 문서 검색어'}).press('Enter');await expect(alone.locator('.wr-search-results button')).toHaveCount(2);alone.duel.saveFail=true;alone.fixture.mutationError=true;await alone.locator('.wr-search-results button').last().click();await expect(alone.locator('.wr-lobby-error')).toContainText('목표 저장');await expect(alone.getByRole('button',{name:'게임 시작',exact:true})).toBeDisabled();await expect(alone.locator('.wr-duel-center-title')).toHaveText('세종대왕');await duelShot(alone,'target-save-error-390');check('failed save preserves server target and blocks start');alone.duel.saveFail=false;await alone.locator('.wr-search-results button').last().click();await expect(alone.locator('.wr-duel-center-title')).toHaveText('한글');await expect(alone.getByRole('button',{name:'게임 시작',exact:true})).toBeEnabled();check('retry save recovers');
  const snapshotCount=calls(alone,'wiki-snapshot').length;alone.duel.startDelay=600;await alone.getByRole('button',{name:'게임 시작',exact:true}).dblclick();await expect.poll(()=>calls(alone,'start_duel_room_v2').length).toBe(1);check('start uses validated different start identity',calls(alone,'wiki-snapshot').length>snapshotCount&&calls(alone,'start_duel_room_v2')[0].body.p_start_title==='대한민국'&&calls(alone,'start_duel_room_v2')[0].body.p_start_page_id==='102');await alone.context().close();
  const guest=await duelPage(390,{actor:1});await enter(guest);await expect(guest.locator('.wr-duel-center-title')).toHaveText('훈민정음');check('participant read-only target/no start/no search',await guest.getByRole('button',{name:'게임 시작',exact:true}).count()===0&&await guest.getByRole('textbox',{name:'목표 문서 검색어'}).count()===0&&await guest.getByRole('button',{name:'목표 문서 변경'}).count()===0);await duelShot(guest,'participant-390');await guest.context().close();
  for(const fail of [false,true]){const p=await duelPage(390,{copyFail:fail,items:!fail});await enter(p);await p.getByRole('button',{name:'방 코드 DUEL65 복사'}).click();await expect(p.locator('.wr-copy-feedback')).toHaveText(fail?'복사하지 못했습니다':'복사됨');if(!fail)check('copy exact code',await p.evaluate(()=>window.__copiedCode)==='DUEL65');else check('copy failure visible');await expect(p.locator('.wr-rule-strip')).toHaveText(fail?'아이템 없음':'아이템전');await duelShot(p,fail?'copy-failed-no-items-390':'copy-success-390');await p.context().close()}
  const sync=await duelPage(390);await enter(sync);reads=calls(sync,'get_duel_room_players_v1').length;sync.duel.target='Realtime 확정 목표';sync.duel.emit('room_players');await expect(sync.locator('.wr-duel-center-title')).toHaveText('Realtime 확정 목표');check('Realtime update fetches latest server target',calls(sync,'get_duel_room_players_v1').length>reads);sync.duel.failReads=true;sync.fixture.mutationError=true;await sync.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(sync.locator('.wr-room-sync')).toContainText('최신 방 정보 확인 실패');await expect(sync.locator('.wr-duel-center-title')).toHaveText('Realtime 확정 목표');await duelShot(sync,'sync-error-390');sync.duel.failReads=false;await sync.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(sync.locator('.wr-room-sync')).toContainText('실시간 알림 수신 중');for(const s of sync.duel.sockets)s.ws.close();await expect(sync.locator('.wr-room-sync')).toContainText('실시간 연결 확인 중');check('disconnect keeps server reconcile message');await sync.context().close();
  for(const action of ['leave','play','logout']){const p=await duelPage(390);await enter(p);if(action==='leave')await p.getByRole('button',{name:'방 나가기'}).click();else if(action==='play')await p.getByRole('link',{name:'PLAY',exact:true}).click();else await p.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(p).toHaveURL(base+(action==='leave'?'/multiplayer':action==='play'?'/play':'/'));check(action+': existing leave path',calls(p,'leave_duel_room_v2').length===1);await p.context().close()}
  const racing=await duelPage(390);await enter(racing);racing.duel.room.status='playing';await racing.getByRole('link',{name:'PLAY',exact:true}).click();await expect(racing).toHaveURL(base+'/play');check('navigation guard avoids leave once server playing',calls(racing,'leave_duel_room_v2').length===0);await racing.context().close();
  const modal=await duelPage(390);await enter(modal);const profile=modal.locator('.wr65-duel-profile').last();await profile.focus();await profile.press('Enter');const dialog=modal.getByRole('dialog',{name:'탐험가 프로필'});await expect(dialog).toBeVisible();await expect(dialog.locator('.user-profile-modal-content')).toBeVisible();for(const key of ['Tab','Shift+Tab'])for(let i=0;i<8;i++){await modal.keyboard.press(key);assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)))}await modal.screenshot({path:path.join(output,'profile-modal-390.png')});await modal.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(profile).toBeFocused();await profile.press('Space');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'✕',exact:true}).click();await expect(dialog).toHaveCount(0);check('profile Enter/Space, focus trap/Escape/close/return');await modal.context().close();
  const long=await duelPage(320,{target:'아주 긴 공통 목표 문서와 English Jungle65 탐험 지식의 역사'});await enter(long);await duelShot(long,'long-goal-320');await long.context().close();
  const fail=await duelPage(320,{fontFailure:true});await enter(fail);await duelShot(fail,'font-fallback-320');await fail.context().close();
  const keyboard=await duelPage(390,{target:null});await enter(keyboard);await keyboard.setViewportSize({width:390,height:420});const input=keyboard.getByRole('textbox',{name:'목표 문서 검색어'});await input.focus();await input.scrollIntoViewIfNeeded();check('reduced keyboard viewport keeps input visible',await input.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}));await keyboard.screenshot({path:path.join(output,'keyboard-viewport-390.png')});await keyboard.context().close();
 }
 check('no unhandled JS errors',report.pageErrors.length===0);check('no ordinary console errors',report.consoleErrors.filter(e=>!e.intentional).length===0);
 if(!before){const previous=JSON.parse(fs.readFileSync(path.join(task,'before/report.json')));for(const s of report.screens.filter(s=>/^(entry-|group-|landing-|home-|play-)/.test(s.name))){check(s.name+': pixel-identical regression',s.sha256===previous.screens.find(p=>p.name===s.name).sha256)}report.heights=report.screens.filter(s=>/^duel-\d+$/.test(s.name)).map(s=>({width:s.width,before:previous.screens.find(p=>p.name===s.name).totalHeight,after:s.totalHeight}))}
}catch(e){report.fatal=e.stack;throw e}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close()}
console.log(JSON.stringify({checks:report.checks.length,screens:report.screens.length,output},null,2));
