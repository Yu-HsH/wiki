// Real React/CSS + synthetic Auth/REST/RPC/Realtime. Never contacts Supabase.
// --before reads the preserved, pre-edit source; external font responses stay in memory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {build,createServer,preview} from 'vite';
import {chromium, expect} from '@playwright/test';

const root=fileURLToPath(new URL('../',import.meta.url));
const task=path.resolve(root,process.env.JUNGLE65_ENTRY_TASK||'.temp/jungle65-aplus-20261102');
const sourceRoot=path.resolve(root,process.env.JUNGLE65_ENTRY_SOURCE_ROOT||path.join(task,'preserved'));
const before=process.argv.includes('--before');
const bundled=process.argv.includes('--bundled');
const output=path.join(process.env.JUNGLE65_ENTRY_OUTPUT||task,before?'before':'after');
fs.mkdirSync(output,{recursive:true});
const port=Number(process.env.JUNGLE65_ENTRY_PORT)||(before?5214:5215),base=`http://127.0.0.1:${port}`,api='http://127.0.0.1:54329';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const names=['캠프지기','아주긴한글닉네임과EnglishJungle65탐험가','새싹 탐험가'];
const duelId='d0000000-0000-4000-8000-000000000065',groupId='a0000000-0000-4000-8000-000000000065';
const roomFor=mode=>({id:mode==='duel'?duelId:groupId,room_code:mode==='duel'?'DUEL65':'CAMP65',mode,status:'waiting',host_user_id:ids[0],max_players:mode==='duel'?2:6,min_players:mode==='duel'?2:3,use_items:mode==='duel',is_public:false,state_version:1});
const playersFor=mode=>ids.slice(0,mode==='duel'?2:3).map((user_id,i)=>({id:`${mode}-fixture-${i}`,room_id:roomFor(mode).id,user_id,nickname_snapshot:names[i],profile_image_snapshot:null,role:i===0?'host':'guest',player_status:'waiting',is_ready:mode==='group'&&i!==2,target_title:mode==='duel'&&i===0?'훈민정음':null,target_page_id:mode==='duel'&&i===0?'101':null,submitted_target_title:mode==='group'&&i!==2?['훈민정음','한글'][i]:null,submitted_target_page_id:mode==='group'&&i!==2?String(101+i):null,created_at:`2026-11-02T00:00:0${i}Z`}));
const report={date:'2026-11-02 KST',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),uncommitted:true,before,realReact:true,syntheticBackend:true,realSupabaseContacted:false,screens:[],checks:[],pageErrors:[],consoleErrors:[],requests:[],fontNetwork:[],blockedExternal:[]};
const check=(name,condition=true)=>{assert.ok(condition,name);report.checks.push(name);console.log('PASS',name)};
const fontCache=new Map();
const serverConfig={root,configFile:false,envFile:false,cacheDir:path.join(task,'vite-cache-'+port),
 plugins:before?[{name:'preserved-entry',enforce:'pre',load(id){const relative=path.relative(root,id.split('?')[0]);const p=path.join(sourceRoot,relative);if(!relative.startsWith('..')&&/\.(?:[cm]?jsx?|css)$/.test(relative)&&fs.existsSync(p)&&fs.statSync(p).isFile())return fs.readFileSync(p,'utf8')}}]:[],
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(api),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('entry-ui-fixture-public-key'),'import.meta.env.VITE_MAINTENANCE':JSON.stringify('')},
 server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/.temp/**']}}
};
let server;
if(bundled){
 const outDir=path.join(output,'bundled-app');
 await build({...serverConfig,build:{outDir},logLevel:'error'});
 const running=await preview({root,configFile:false,envFile:false,build:{outDir},preview:{host:'127.0.0.1',port,strictPort:true}});
 server={listen:async()=>{},close:()=>new Promise(resolve=>running.httpServer.close(resolve))};
}else server=await createServer(serverConfig);
report.bundled=bundled;
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
  // A frozen release source already includes A+ fonts; compare it with the same
  // real font responses. Historical pre-A+ runs retain their original policy.
  if(fontSource&&(!before||process.env.JUNGLE65_ENTRY_SOURCE_ROOT)){
   // In a production bundle Vite awaits imported CSS before mounting React.
   // Keep the original dev stylesheet-outage case, and inject font-file failure
   // in bundled mode so that its fallback-font assertion actually reaches the UI.
   if(fontFailure&&(!bundled||request.resourceType()==='font'))return route.abort('failed');
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
async function ready(page){await page.waitForTimeout(900);await page.evaluate(()=>document.fonts.ready)}
async function shot(page,name){
 await ready(page);
 await page.mouse.move(0,0);
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
const mutationCalls=(page,rpc)=>page.fixture.calls.filter(c=>c.path.endsWith('/'+rpc));
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.JUNGLE65_BROWSER_PATH||'C:/Users/SSAFY/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe'});
 report.browser=await browser.version();
 for(const width of [1920,1440,1024,768,390,320])for(const mode of ['duel','group']){
  const page=await makePage(width,{mode});await page.goto(base+'/multiplayer?mode='+mode);await expect(page.locator('.mp-public-room')).toHaveCount(3);
  const metrics=await shot(page,`${mode}-${width}`);
  check(`${mode}/${width}: scoped mode has no duplicate picker`,await page.locator('.mp-mode-grid').count()===0);
  check(`${mode}/${width}: default private`,!(await page.getByRole('checkbox',{name:/공개방으로 만들기/}).isChecked()));
  check(`${mode}/${width}: no room code in public listing`,!(await page.locator('.mp-public-board').innerText()).includes('DUEL65'));
  if(mode==='group')check(`${width}: default capacity 6`,await page.getByLabel('그룹 방 정원').inputValue()==='6');
  if(!before){
   if(width>=1024||width<=760){
    check(`${mode}/${width}: narrow action column stacks cards`,metrics.create.top>=metrics.join.top+metrics.join.height);
    check(`${mode}/${width}: stacked cards use the full action column`,await page.locator('.mp-mode-panel').evaluate(e=>[...e.children].every(card=>card.getBoundingClientRect().width===e.getBoundingClientRect().width)));
   }else check(`${mode}/${width}: two-column cards have readable width`,metrics.join.width>=280&&metrics.create.width>=280);
   const code=page.getByRole('textbox',{name:mode==='duel'?'1:1 방 코드':'단체 방 코드'});await code.fill('ABC123');
   check(`${mode}/${width}: all six code characters fit`,await code.evaluate(e=>e.value==='ABC123'&&e.clientWidth-parseFloat(getComputedStyle(e).paddingLeft)-parseFloat(getComputedStyle(e).paddingRight)>=6*parseFloat(getComputedStyle(e).fontSize)*.65));
   check(`${mode}/${width}: card labels and controls are not clipped`,await page.locator('.mp-mode-panel').evaluate(panel=>[...panel.querySelectorAll('h3,p,label,button,input')].every(e=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight)));
   check(`${mode}/${width}: public board before code/create`,metrics.board.top<=metrics.join.top&&await page.locator('.wr65-entry-layout').evaluate(e=>e.firstElementChild.classList.contains('mp-public-board')));
   if(width<=390)check(`${mode}/${width}: public rooms in first mobile screen`,metrics.firstRoom.top<844);
   check(`${mode}/${width}: all main controls >=44px`,metrics.buttons.every(b=>b.height>=44));
   const roles=await platformFonts(page,{title:'.wr-entry-title h1',cta:'.mp-public-room .mp-action-btn',paper:'.mp-public-board h2',player:'.wr65-player-name',body:'.wr-entry-lead',numeric:'.wr65-room-count'});
   report.fontRoles??=[];report.fontRoles.push({mode,width,roles});
   for(const role of ['title','cta'])check(`${mode}/${width}: ${role} actual Surround`,roles[role].some(f=>f.isCustomFont&&f.postScriptName.includes('Ssurround')));
   check(`${mode}/${width}: paper actual Maru Bold`,roles.paper.some(f=>f.isCustomFont&&f.postScriptName==='MaruBuri-Bold'));
   for(const role of ['player','body','numeric'])check(`${mode}/${width}: ${role} actual Pretendard`,roles[role].some(f=>f.isCustomFont&&f.familyName.includes('Pretendard')));
   const weights=await page.locator('.wr65-player-name,.wr65-room-count').evaluateAll(es=>es.slice(0,2).map(e=>({weight:getComputedStyle(e).fontWeight,numerals:getComputedStyle(e).fontVariantNumeric})));
   check(`${mode}/${width}: nickname600 / numbers700 tabular`,weights[0].weight==='600'&&weights[1].weight==='700'&&weights[1].numerals.includes('tabular-nums'));
   check(`${mode}/${width}: header nickname600`,await page.locator('.wr-header-user a > span:first-child').evaluate(e=>getComputedStyle(e).fontWeight)==='600');
  }
  await page.context().close();
 }
 // Same real product pages before/after, at every requested size.
 for(const width of [1440,1024,768,390,320])for(const [view,url,anonymous]of [['landing','/',true],['home','/lobby',false],['play','/play',false]]){
  const page=await makePage(width,{anonymous});await page.goto(base+url);await expect(page.locator(view==='landing'?'.wr65-landing-picture':view==='home'?'.wr65-jungle-hero':'.wr-modes')).toBeVisible();
  await shot(page,`${view}-${width}`);await page.context().close();
 }
 for(const mode of ['duel','group'])for(const width of [1440,390,320]){
  const page=await makePage(width,{mode});await page.goto(base+(mode==='duel'?'/multiplayer/room/'+duelId:'/multiplayer/group/room/'+groupId));await expect(page.locator(mode==='duel'?'.wr-duel-stage':'.wr-party')).toBeVisible();await shot(page,`${mode}-waiting-${width}`);
  if(mode==='duel')check(`${width}: duel no READY`,await page.getByRole('button',{name:'READY',exact:true}).count()===0);
  else await expect(page.getByRole('button',{name:'게임 시작',exact:true})).toBeDisabled();
  if(!before){const selector=mode==='duel'?'.wr-name-btn .pcard-name, button.wr-name-btn':'.pcard-name';const font=await platformFonts(page,{name:selector,title:'.wr-lobby-titles h1'});check(`${mode}/${width}: waiting nickname uses Pretendard`,font.name.some(f=>f.isCustomFont&&f.familyName.includes('Pretendard')));check(`${mode}/${width}: waiting nickname600`,await page.locator(selector).first().evaluate(e=>getComputedStyle(e).fontWeight)==='600');check(`${mode}/${width}: waiting title uses Surround`,font.title.some(f=>f.isCustomFont&&f.postScriptName.includes('Ssurround')))}
  await page.reload();await expect(page.locator(mode==='duel'?'.wr-duel-center-title':'.is-locked .wr-candidate-title')).toHaveText('훈민정음');check(`${mode}/${width}: fixture F5 restoration retained`);await page.context().close();
 }
 if(!before){
  for(const listing of ['loading','empty','error']){const page=await makePage(390,{listing});await page.goto(base+'/multiplayer?mode=duel');await expect(page.locator('.mp-public-board__'+listing)).toBeVisible();if(listing==='loading')await expect(page.locator('.mp-public-board button')).toBeDisabled();await shot(page,'state-'+listing+'-390');if(listing==='error'){page.fixture.listing='normal';await page.locator('.mp-public-board button').click();await expect(page.locator('.mp-public-room')).toHaveCount(3);check('list error refresh recovers')}await page.context().close()}
  for(const mode of ['duel','group']){
   const page=await makePage(390,{mode});await page.goto(base+'/multiplayer?mode='+mode);await expect(page.locator('.mp-public-room')).toHaveCount(3);
   const help=page.getByRole('button',{name:'게임 설명',exact:true});await help.focus();await help.press('Enter');const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
   for(const direction of ['Tab','Shift+Tab'])for(let i=0;i<8;i++){await page.keyboard.press(direction);assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)))}
   await shot(page,'help-'+mode+'-390');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(help).toBeFocused();check(mode+': help focus trap/Escape/return');
   page.fixture.joinFail=true;const old=page.fixture.listCalls;await page.locator('.mp-public-room button').first().click();await expect(page.locator('.mp-error')).toBeVisible();await expect.poll(()=>page.fixture.listCalls).toBeGreaterThan(old);check(mode+': failed public join re-fetches list');
   page.fixture.joinFail=false;page.fixture.delayMutation=650;const calls=mutationCalls(page,'join_public_room_v1').length;await page.locator('.mp-public-room button').first().dblclick();await expect(page).toHaveURL(new RegExp('/multiplayer/'+(mode==='duel'?'room/':'group/room/')+roomFor(mode).id+'$'));check(mode+': public join navigation and duplicate guard',mutationCalls(page,'join_public_room_v1').length===calls+1);await page.context().close();
   const code=await makePage(390,{mode});await code.goto(base+'/multiplayer?mode='+mode);const input=code.getByRole('textbox',{name:mode==='duel'?'1:1 방 코드':'단체 방 코드'});await input.fill(' jung65 ');await input.press('Enter');await expect(code).toHaveURL(new RegExp(roomFor(mode).id+'$'));
   check(mode+': code trim/uppercase preserved',mutationCalls(code,mode==='duel'?'join_duel_room_v2':'find_room_by_code_v1').some(c=>c.body.p_room_code==='JUNG65'));if(mode==='group')check('group code join second RPC retained',mutationCalls(code,'join_group_room').length>0);await code.context().close();
   const create=await makePage(390,{mode});await create.goto(base+'/multiplayer?mode='+mode);await expect(create.locator('.mp-public-room')).toHaveCount(3);if(mode==='duel')await expect(create.getByRole('checkbox',{name:/아이템 사용/})).toBeChecked();await create.locator('.mp-card--create button').click();await expect(create).toHaveURL(new RegExp(roomFor(mode).id+'$'));const body=mutationCalls(create,'create_discoverable_'+mode+'_room_v1')[0].body;check(mode+': default private create payload',body.p_is_public===false);if(mode==='duel')check('duel default items true',body.p_use_items===true);else check('group default create settings preserved',body.p_max_players===6&&body.p_min_players===3&&body.p_finish_rank_limit===3);await create.context().close();
   const options=await makePage(390,{mode});await options.goto(base+'/multiplayer?mode='+mode);await options.getByRole('checkbox',{name:/공개방으로 만들기/}).check();if(mode==='duel')await options.getByRole('checkbox',{name:/아이템 사용/}).uncheck();else await options.getByLabel('그룹 방 정원').selectOption('8');options.fixture.delayMutation=600;await options.locator('.mp-card--create button').dblclick();await expect(options).toHaveURL(new RegExp(roomFor(mode).id+'$'));const changes=mutationCalls(options,'create_discoverable_'+mode+'_room_v1');check(mode+': configured create single request',changes.length===1&&changes[0].body.p_is_public===true&&(mode==='duel'?changes[0].body.p_use_items===false:changes[0].body.p_max_players===8));await options.context().close();
  }
  const manual=await makePage(390);await manual.goto(base+'/multiplayer');await expect(manual.locator('.mp-mode-grid')).toBeVisible();await manual.getByRole('button',{name:'단체모드',exact:true}).click();await expect(manual.getByLabel('그룹 방 정원')).toHaveValue('6');await manual.getByRole('button',{name:'1 vs 1',exact:true}).click();await expect(manual.getByRole('checkbox',{name:/아이템 사용/})).toBeChecked();check('unscoped legacy mode picker retained');await manual.context().close();
  const guest=await makePage(390,{guest:true});await guest.goto(base+'/multiplayer?mode=duel');await expect(guest).toHaveURL(base+'/play');check('guest blocked from online entry');await guest.context().close();
  const anon=await makePage(390,{anonymous:true});await anon.goto(base+'/multiplayer?mode=group');await expect(anon).toHaveURL(/\/login$/);check('anonymous redirected to login');await anon.context().close();
  const fail=await makePage(320,{fontFailure:true});await fail.goto(base+'/multiplayer?mode=duel');await expect(fail.locator('.mp-public-room')).toHaveCount(3);await shot(fail,'font-fallback-320');const fonts=await platformFonts(fail,{title:'.wr-entry-title h1',body:'.wr-entry-lead'});check('font failure retains readable system fallback',Object.values(fonts).every(list=>list.length>0&&list.every(f=>!f.isCustomFont)));await fail.context().close();
  const focus=await makePage(390);await focus.goto(base+'/multiplayer?mode=duel');await expect(focus.locator('.mp-public-room')).toHaveCount(3);const cta=focus.locator('.mp-public-room button').first();await cta.focus();const focusStyle=await cta.evaluate(e=>({outline:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth}));check('CTA keyboard focus visible',focusStyle.outline==='solid'&&parseFloat(focusStyle.width)>=3);await cta.hover();await shot(focus,'focus-hover-390');await focus.context().close();
  const virtual=await makePage(390);await virtual.goto(base+'/multiplayer?mode=duel');await virtual.setViewportSize({width:390,height:420});const field=virtual.getByRole('textbox',{name:'1:1 방 코드'});await field.focus();await field.scrollIntoViewIfNeeded();await shot(virtual,'reduced-height-keyboard-390');check('reduced viewport allows code field focus',await field.evaluate(e=>{const r=e.getBoundingClientRect();return document.activeElement===e&&r.top>=0&&r.bottom<=innerHeight}));await virtual.context().close();
  const wrapping=await makePage(320);await wrapping.goto(base+'/multiplayer?mode=duel');await expect(wrapping.locator('.mp-public-room')).toHaveCount(3);await wrapping.locator('.mp-public-room button').first().evaluate(e=>{e.textContent='이 공개 원정대의 탐험에 참가하기'});await shot(wrapping,'long-cta-320');check('long CTA wraps without clipping',await wrapping.locator('.mp-public-room button').first().evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1&&e.getBoundingClientRect().height>=44));await wrapping.context().close();
 }
 check('no unhandled page errors',report.pageErrors.length===0);
 check('no normal console errors',report.consoleErrors.filter(e=>!e.intentional).length===0);
 if(!before){const previous=JSON.parse(fs.readFileSync(path.join(task,'before/report.json')));for(const s of report.screens.filter(s=>/^(landing|home|play)-/.test(s.name))){const old=previous.screens.find(x=>x.name===s.name);check(s.name+': pixel-identical regression',old.sha256===s.sha256)}}
}catch(e){report.fatal=e.stack;throw e}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close()}
console.log(JSON.stringify({checks:report.checks.length,screens:report.screens.length,output},null,2));
