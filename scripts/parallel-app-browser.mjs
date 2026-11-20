// Real application integration QA. No product module replacement, no DB and no remote backend.
// The only replacement boundary is browser HTTP/WebSocket transport to an in-memory fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const basis = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const port = Number(process.env.PARALLEL_APP_PORT || 5180);
const base = 'http://127.0.0.1:' + port;
const api = 'http://127.0.0.1:59991'; // Deliberately unserved. Every browser request is intercepted.
const only = process.argv.find(value => value.startsWith('--only='))?.slice('--only='.length) ?? 'all';
assert.ok(['all', 'practice', 'profile', 'growth'].includes(only), 'unknown fixture scope');
const out = path.join(root, '.temp', 'parallel-app-integration',
  new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(out, {recursive: true});
const dateKst = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const report = {basis, dateKst, uncommitted:true, mode:only, environment:'Actual index/main/App/AuthProvider/routes; Chromium desktop viewports; HTTP fixtures; no DB', checks:[], captures:[], pageErrors:[], forbidden:[], externalBlocked:[], unexpectedApi:[], contexts:[], modulesLoaded:[], success:false};
const users = {
  a: {id:'11111111-1111-4111-8111-111111111111', email:'qa-a@example.invalid', user_metadata:{nickname:'통합 탐험가 A', username:'qa-a'}},
  b: {id:'22222222-2222-4222-8222-222222222222', email:'qa-b@example.invalid', user_metadata:{nickname:'통합 탐험가 B', username:'qa-b'}},
};
const titleA = {rewardId:'title_daily_steps_1', kind:'title', displayName:'이어지는 발걸음', assetRef:null};
const titleB = {rewardId:'title_duel_victor_1', kind:'title', displayName:'승부사', assetRef:null};
const icon = {rewardId:'icon_default_book', kind:'profile_icon', displayName:'펼친 책', assetRef:'/profile-icons/book.svg'};
const frame = {rewardId:'frame_ready_explorer', kind:'frame', displayName:'준비된 탐험가', assetRef:'frame:special'};
const background = {rewardId:'background_group_together', kind:'background', displayName:'함께하는 탐험', assetRef:null};
const finish = {rewardId:'finish_first_arrival', kind:'finish_effect', displayName:'완주 빛', assetRef:'finish:tier-1'};
const pathColor = {rewardId:'path_color_one_step', kind:'path_color', displayName:'한 걸음의 색', assetRef:'path:purple'};
const collectionPath = {rewardId:'fixture-public-path', kind:'path_effect', displayName:'연습 수집 효과', assetRef:null};
const collectionEmoji = {rewardId:'fixture-public-reaction', kind:'spectator_emoji', displayName:'연습 수집 리액션', assetRef:null};
const owned = [icon,titleA,titleB,frame,background,finish,pathColor,collectionPath,collectionEmoji];
const rawReward = reward => ({reward_id:reward.rewardId,kind:reward.kind,display_name:reward.displayName,asset_ref:reward.assetRef,retired:false});
const initialEquipment = [{slot:'profile_icon',slotIndex:1,reward:icon},{slot:'title',slotIndex:1,reward:titleA},{slot:'frame',slotIndex:1,reward:frame}];
const clone = value => structuredClone(value);
const jwt = user => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({alg:'HS256',typ:'JWT'}) + '.' + encode({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+7200}) + '.' + encode({fixture:true});
};
const userFromToken = token => {
  try {const id=JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;return Object.values(users).find(user=>user.id===id);} catch {return null;}
};
const sessionFor = user => ({access_token:jwt(user),refresh_token:'fixture-refresh-'+user.id,token_type:'bearer',expires_in:7200,expires_at:Math.floor(Date.now()/1000)+7200,user});
const ledgerBaseline = {gameRecords:[{id:'existing-record',user_id:users.a.id,elapsed_seconds:42}],xpLedger:[{id:'existing-xp',amount:640}],unlocks:[{id:'fixture-unlock',tier:1}],inventory:owned.map(item=>item.rewardId)};
const mutatingRpc = name => /^(mark_achievements_seen|equip_profile_reward|unequip_profile_reward|ensure_today_daily_challenge|grant_|create_|join_|start_|initialize_|activate_|apply_|leave_|finalize_|set_.*ready|submit_)/.test(name);
const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'};
const checks = async (name, work) => {
  try {await work();report.checks.push(name);console.log('PASS',name);}
  catch(error) {
    report.failedCheck=name;
    for(const context of browser?.contexts()||[])for(const page of context.pages()){
      const file='failure-'+report.captures.length+'.png';
      try{
        report.failurePage={url:page.url(),step:await page.locator('.wr-tutorial-layer').getAttribute('data-step').catch(()=>null),body:(await page.locator('body').innerText()).slice(0,4000)};
        report.failureGeometry=await page.evaluate(()=>{
          const rect=element=>{const r=element?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null;};
          return{capturedBeforeScreenshot:true,viewport:{width:innerWidth,height:innerHeight,offsetTop:visualViewport?.offsetTop,visualHeight:visualViewport?.height},scrollY,ready:document.querySelector('.wr-tutorial-layer')?.dataset.ready,bubble:rect(document.querySelector('.wr-tutorial-bubble')),highlight:rect(document.querySelector('.wr-tutorial-target')),anchors:[...document.querySelectorAll('[data-tutorial-anchor]')].map(element=>({name:element.getAttribute('data-tutorial-anchor'),tag:element.tagName,rect:rect(element),inert:Boolean(element.closest('[inert]'))})),protectedRects:[...document.querySelectorAll('[data-tutorial-protect]')].map(element=>({tag:element.tagName,text:element.innerText?.slice(0,90),rect:rect(element)}))};
        });
        await page.screenshot({path:path.join(out,file),fullPage:false});
        report.captures.push(file);
      }catch{}
    }
    throw error;
  }
};
const stateFor = actor => ({actor, practiceGuard:false, allowNormalHomeCommands:false, calls:[], equipment:{[users.a.id]:clone(initialEquipment),[users.b.id]:clone(initialEquipment)}, ledger:clone(ledgerBaseline),seen:0,analytics:0,dailyCreates:0,failedWrites:0,failedReads:0,writeGate:null});
let releaseWrite;
const gateWrite = state => {state.writeGate=new Promise(resolve=>{releaseWrite=()=>{state.writeGate=null;resolve();};});};
const countRpc = (state,name) => state.calls.filter(call=>call.name===name).length;
const stableLedger = state => JSON.stringify(state.ledger);
const cardFor = (state,user) => {
  const result={userId:user.id,nickname:user.user_metadata.nickname,level:4,icon:null,title:null,frame:null,background:null,badges:[],legacyImageUrl:null};
  for(const row of state.equipment[user.id]||[]) {const key={profile_icon:'icon',title:'title',frame:'frame',background:'background'}[row.slot];if(key)result[key]=row.reward;}
  return result;
};
const achievementResponse = (state,user) => ({ok:true,unseenCount:state.seen?0:1,achievements:[{
  achievementId:'fixture-public-counter',category:'daily',name:user?.id===users.b.id?'둘째 탐험가의 공개 기록':'이어서 기록하기',condition:'공개된 연습 조건',description:'실제 서버 판정을 대신하지 않는 HTTP 자료',displayPolicy:'counter',current:2,nextThreshold:5,tierCount:2,unlockedTier:1,
  tiers:[{tier:1,threshold:1,xp:30,unlocked:true,unlockId:'fixture-unlock',unlockedAt:'2026-11-05T00:00:00Z',seen:Boolean(state.seen),rewards:[titleA]},{tier:2,threshold:5,xp:60,unlocked:false,rewards:[finish]}],
}],hidden:{discovered:0,achievements:[]}});
async function apiRoute(route,state) {
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(state.manualAutoScope){try{const live=new URL(request.frame().url());state.practiceGuard=live.searchParams.has('practice');state.allowNormalHomeCommands=!state.practiceGuard&&live.pathname==='/lobby';}catch{}}
  if(method==='OPTIONS')return route.fulfill({status:200,headers:cors});
  let p={};try{p=request.postDataJSON()||{};}catch{}
  const token=(request.headers().authorization||'').replace(/^Bearer /,'');
  const user=userFromToken(token)||users[state.actor]||null;
  const respond=(body,status=200,extra={})=>route.fulfill({status,contentType:'application/json',headers:{...cors,...extra},body:method==='HEAD'?'':JSON.stringify(body)});
  const rpc=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.split('/').at(-1):null;
  const entry={method,path:url.pathname,name:rpc,actor:user?.id||'guest'};
  state.calls.push(entry);
  const isWrite=rpc?mutatingRpc(rpc):url.pathname.startsWith('/functions/')||url.pathname.startsWith('/rest/')&&!['GET','HEAD'].includes(method);
  if(state.practiceGuard&&isWrite){report.forbidden.push({...entry,scope:'practice'});return respond({ok:false,code:'PRACTICE_COMMAND_FORBIDDEN'},403);}
  const normalAllowed=rpc&&['equip_profile_reward_v1','unequip_profile_reward_v1','mark_achievements_seen_v1'].includes(rpc)
    ||state.allowNormalHomeCommands&&(rpc==='ensure_today_daily_challenge'||url.pathname==='/rest/v1/analytics_events'&&method==='POST');
  if(!state.practiceGuard&&isWrite&&!normalAllowed){report.forbidden.push({...entry,scope:'normal'});return respond({ok:false,code:'NORMAL_COMMAND_FORBIDDEN'},403);}
  if(url.pathname.startsWith('/auth/')) {
    if(url.pathname.endsWith('/logout'))return respond({});
    if(url.pathname.endsWith('/token'))return respond(sessionFor(users[state.actor]||users.a));
    return user?respond(user):respond({message:'No fixture session'},401);
  }
  if(rpc) {
    switch(rpc) {
      case 'get_profile_card_v1':return respond({ok:true,card:cardFor(state,Object.values(users).find(value=>value.id===p.p_user_id)||user||users.a)});
      case 'get_profile_cards_v1':return respond({ok:true,cards:Object.fromEntries((p.p_user_ids||[]).map(id=>{const owner=Object.values(users).find(value=>value.id===id)||users.a;return[id,cardFor(state,owner)];}))});
      case 'get_xp_summary_v1':return respond({ok:true,total_xp:640,level:4,current_level_xp:140,next_level_xp:175});
      case 'get_my_achievements_v1':return respond(state.achievementFixture ? {...clone(state.achievementFixture),unseenCount:state.seen?0:state.achievementFixture.unseenCount} : achievementResponse(state,user));
      case 'mark_achievements_seen_v1':state.seen+=1;return respond({ok:true,marked:1});
      case 'equip_profile_reward_v1':
      case 'unequip_profile_reward_v1': {
        if(state.writeGate)await state.writeGate;
        if(state.failedWrites>0){state.failedWrites-=1;return respond({ok:false,code:'REWARD_NOT_OWNED'});}
        const id=user?.id||users.a.id;
        const equipment=state.equipment[id]||[];
        const next=equipment.filter(item=>item.slot!==p.p_slot);
        if(rpc==='equip_profile_reward_v1'){
          const reward=(state.fixtureOwned||owned).find(item=>item.rewardId===p.p_reward_id);
          if(!reward)return respond({ok:false,code:'REWARD_NOT_OWNED'});
          next.push({slot:p.p_slot,slotIndex:1,reward});
        }
        state.equipment[id]=next;
        return respond({ok:true,equipment:clone(next)});
      }
      case 'ensure_today_daily_challenge':state.dailyCreates+=1;return respond([{start_title:'사과',target_title:'식물',challenge_date:dateKst,hint:'검증용 코스'}]);
      case 'get_daily_course_rankings_contract_v1':
      case 'get_explorer_xp_rankings_v2':return respond([]);
      case 'get_my_daily_course_rank_contract_v1':return respond({ok:true,rank:null});
      case 'level_from_total_xp':return respond(4);
      default:report.unexpectedApi.push(entry);return respond({ok:false,code:'UNHANDLED_FIXTURE_RPC'},400);
    }
  }
  const table=url.pathname.split('/').at(-1);
  if(method==='HEAD')return respond(null,200,{'content-range':'*/0'});
  if(table==='site_news_posts' && method==='GET' && !state.practiceGuard)return respond([]);
  if(table==='analytics_events'){state.analytics+=1;return respond(null,201);}
  if(table==='profiles'){
    const id=(url.searchParams.get('id')||'').replace(/^eq\./,'')||user?.id||users.a.id;
    const owner=Object.values(users).find(value=>value.id===id)||users.a;
    const row={id:owner.id,username:owner.user_metadata.username,nickname:owner.user_metadata.nickname,profile_image_url:null,total_xp:640,profile_level:4};
    return respond((request.headers().accept||'').includes('vnd.pgrst.object')?row:[row]);
  }
  if(table==='user_reward_inventory')return respond((state.fixtureOwned||owned).map(reward=>({reward_id:reward.rewardId,acquired_at:'2026-11-05T00:00:00Z',reward_catalog:rawReward(reward)})));
  if(table==='user_profile_equipment'){
    if(state.failedReads>0){state.failedReads-=1;return respond({message:'fixture read unavailable'},503);}
    return respond((state.equipment[user?.id||users.a.id]||[]).filter(row=>['finish_effect','path_color'].includes(row.slot)).map(row=>({slot:row.slot,reward_id:row.reward.rewardId})));
  }
  if(table==='reward_catalog')return respond(owned.map(rawReward));
  if(['game_records','match_history','group_match_history','group_match_results','xp_ledger','daily_challenges'].includes(table))return respond([]);
  report.unexpectedApi.push(entry);
  return respond({message:'Unhandled HTTP fixture request'},400);
}
let server,browser;
const moduleRequests=new Set();
async function makeContext(width,actor='guest',options={}) {
  const state=stateFor(actor);
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<=430,serviceWorkers:'block',...options});
  context.setDefaultTimeout(15000);
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===api)return apiRoute(route,state);
    if(url.origin===base){if(request.resourceType()==='script')moduleRequests.add(url.pathname);return route.continue();}
    if(/(^|\.)wikipedia\.org$/.test(url.hostname)||/(^|\.)wikimedia\.org$/.test(url.hostname)){
      const body=url.pathname.includes('/feed/')?{}:{parse:{text:{'*':'<div class="mw-parser-output"><p>검증용 공개 소개</p></div>'}}};
      return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify(body)});
    }
    report.externalBlocked.push({host:url.hostname,path:url.pathname,type:request.resourceType()});
    if(request.resourceType()==='stylesheet')return route.fulfill({status:200,contentType:'text/css',body:''});
    return route.abort();
  });
  await context.routeWebSocket('**/*',async ws=>{
    const url=new URL(ws.url());
    const entry={protocol:url.protocol,host:url.host,path:url.pathname};
    report.websockets||={localHmr:[],mockedRealtime:[],blocked:[],externalConnections:0};
    if(url.protocol==='ws:'&&url.hostname==='127.0.0.1'&&url.port===String(port)&&url.pathname==='/'){
      report.websockets.localHmr.push(entry);ws.connectToServer();return;
    }
    if(url.protocol==='ws:'&&url.hostname==='127.0.0.1'&&url.port==='59991'&&url.pathname==='/realtime/v1/websocket'){
      report.websockets.mockedRealtime.push(entry);
      ws.onMessage(raw=>{try{const [join,ref,topic]=JSON.parse(String(raw));ws.send(JSON.stringify([join,ref,topic,'phx_reply',{status:'ok',response:{postgres_changes:[]}}]));}catch{}});
      return;
    }
    report.websockets.blocked.push(entry);
    await ws.close({code:1008,reason:'QA external WebSocket blocked'});
  });
  await context.addInitScript(({actor,session})=>{
    if(!sessionStorage.getItem('parallel-app:seeded')){
      localStorage.removeItem('sb-127-auth-token');
      if(actor==='guest')localStorage.setItem('wiki_game_local_user',JSON.stringify({id:'guest-app-fixture',displayName:'게스트',isGuest:true,mode:'local'}));
      else if (session) localStorage.setItem('sb-127-auth-token',JSON.stringify(session));
      sessionStorage.setItem('parallel-app:seeded','1');
    }
  },{actor,session:users[actor]?sessionFor(users[actor]):null});
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  const capture=async name=>{const file=name+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});report.captures.push(file);};
  const close=async()=>{
    report.contexts.push({width,actor,calls:state.calls,analytics:state.analytics,dailyCreates:state.dailyCreates,seen:state.seen,ledgerUnchanged:stableLedger(state)===(state.ledgerInitial||JSON.stringify(ledgerBaseline))});
    await context.close();
  };
  return{context,page,state,capture,close};
}
const at=async(page,id)=>{
  await expect(page.locator('.wr-tutorial-layer')).toHaveAttribute('data-step',id);
  await expect(page.locator('.wr-tutorial-layer')).toHaveAttribute('data-ready','true');
  await expect(page.locator('.wr-tutorial-bubble')).not.toContainText(/대상을 가리지 않도록|안내할 대상을 아직|다른 화면에 있어요/);
  if(!['W00','F01','GR00'].includes(id))await expect(page.locator('.wr-tutorial-target')).toHaveCount(1);
  await fit(page);
  if(process.argv.includes('--ux-refine')||only==='ux-refine-probe'){
    const expected={S02:'사과',S03:'사과',S04:'사과',S05:'사과',S06:'과일',S07:'과일',S08:'요리',S09:'식물'}[id];
    if(expected){
      const entries=[];
      for(const [anchor,title] of [['solo.current',expected],['solo.target','식물']]){
        const text=page.locator('[data-tutorial-anchor="'+anchor+'"] .wr-hud-doc-value > span');
        await expect(text).toHaveText(title);
        await expect.poll(()=>text.evaluate(element=>element.clientWidth>0&&element.scrollWidth<=element.clientWidth)).toBe(true);
        entries.push(await text.evaluate(element=>({text:element.textContent.trim(),clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,rect:element.getBoundingClientRect().toJSON()})));
      }
      (report.hudTextChecks||=[]).push({id,width:page.viewportSize().width,current:entries[0],goal:entries[1]});
    }
  }
  (report.stepsVerified||=[]).push({id,width:page.viewportSize().width});
};
const next=async(page,id)=>{await page.getByRole('button',{name:'다음',exact:true}).click();if(id)await at(page,id);};
const diagnostic=page=>page.getByTestId('tutorial-app-state');
async function fit(page) {
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const read=()=>{
    const bubble=document.querySelector('.wr-tutorial-bubble'),target=document.querySelector('.wr-tutorial-target');
    if(!bubble)return{fits:true,overlap:false,audioOccluded:false};
    const b=bubble.getBoundingClientRect(),t=target?.getBoundingClientRect(),v=visualViewport;
    const audio=document.querySelector('.wr-audio'),a=audio?.getBoundingClientRect(),layer=document.querySelector('.wr-tutorial-layer');
    const audioOccluded=Boolean(a&&layer&&b.left<a.right&&b.right>a.left&&b.top<a.bottom&&b.bottom>a.top&&Number(getComputedStyle(audio).zIndex)>Number(getComputedStyle(layer).zIndex));
    return{audioOccluded,fits:b.left>=v.offsetLeft-1&&b.right<=v.offsetLeft+v.width+1&&b.top>=v.offsetTop-1&&b.bottom<=v.offsetTop+v.height+1,overlap:Boolean(t&&b.left<t.right-8&&b.right>t.left+8&&b.top<t.bottom-8&&b.bottom>t.top+8),bubble:b.toJSON(),target:t?.toJSON(),step:layer?.dataset.step,ready:layer?.dataset.ready,scrollY};
  };
  const geometry=await page.evaluate(read),flags={fits:geometry.fits,overlap:geometry.overlap,audioOccluded:geometry.audioOccluded};
  if(!geometry.fits||geometry.overlap||geometry.audioOccluded){
    await page.waitForTimeout(60);
    (report.layoutViolations||=[]).push({initial:geometry,after60ms:await page.evaluate(read)});
  }
  assert.deepEqual(flags,{fits:true,overlap:false,audioOccluded:false},'bubble remains in viewport, clear of its action and existing audio UI');
}
async function beginIntro(page) {
  await page.goto(base+'/lobby?practice=intro-core');
  await expect(diagnostic(page)).toHaveAttribute('data-module','intro-core');
  await page.getByRole('button',{name:/^(훈련 시작|다시 시작)$/}).click();
  await at(page,'W00');
}
async function toSolo(page,{keyboard=false,capture,width}={}) {
  await next(page,'H01');await next(page,'H02');await fit(page);
  if(capture)await capture('home-'+width);
  const home=page.locator('[data-tutorial-anchor="home.start"]');
  if(keyboard){await home.focus();await page.keyboard.press('Enter');}else await home.click();
  await at(page,'P01');assert.equal(new URL(page.url()).pathname,'/play');assert.equal(new URL(page.url()).searchParams.get('practice'),'intro-core');
  await next(page,'P02');if(capture)await capture('play-modes-'+width);await next(page,'P03');await fit(page);
  if(capture)await capture('play-'+width);
  const solo=page.locator('[data-tutorial-anchor="play.solo"]');
  if(keyboard){await solo.focus();await page.keyboard.press('Space');}else await solo.click();
  await at(page,'S01');assert.equal(new URL(page.url()).pathname,'/tutorial/practice/solo');
  await page.getByRole('button',{name:'연습 출발',exact:true}).click();
  await at(page,'S02');await next(page,'S03');await next(page,'S04');await next(page,'S05');await fit(page);
  if(capture)await capture('solo-'+width);
  await page.getByRole('link',{name:'과일',exact:true}).click();await at(page,'S06');
}
async function completeIntro(page,{capture,width}={}) {
  await next(page,'S07');await page.getByRole('link',{name:'요리',exact:true}).click();await at(page,'S08');
  await page.getByRole('button',{name:'연습 전용 · 직전 선택 다시 하기',exact:true}).click();await at(page,'S07');
  await page.getByRole('link',{name:'식물',exact:true}).click();await at(page,'S09');
  await page.getByRole('button',{name:'연습 결과 보기',exact:true}).click();await at(page,'R01');
  if(capture)await capture('intro-result-'+width);
  await next(page,'F01');await page.getByRole('button',{name:'훈련 마치기',exact:true}).click();
  await expect(diagnostic(page)).toHaveAttribute('data-status','completed');
  await expect(page.locator('.wr-tutorial-layer')).toHaveCount(0);
}
async function switchMember(page,state,actor) {
  state.actor=actor;
  await page.evaluate(async({session})=>{
    const {supabase}=await import('/supabaseClient.js');
    const result=await supabase.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    if(result.error)throw result.error;
  },{session:sessionFor(users[actor])});
}
async function firstVisitCase() {
  const item = await makeContext(320, 'anonymous');
  item.state.manualAutoScope = true;
  try {
    await checks('320px new visitor can open guide and begin tutorial from the real guest login flow', async () => {
      const { page } = item;
      await page.goto(base + '/');
      await page.locator('.wr65-landing-start').click();
      await page.getByRole('button', { name: '게스트로 둘러보기' }).click();
      await expect(page).toHaveURL(base + '/lobby');

      const guide = page.getByRole('link', { name: /플레이 가이드/ }).last();
      await guide.scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      await guide.click();
      await expect(page).toHaveURL(base + '/guide');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.goBack();
      await expect(page).toHaveURL(base + '/lobby');

      const start = page.getByRole('button', { name: '처음이라면 게임 방법 연습' });
      await expect(start).toBeVisible();
      assert.ok((await start.boundingBox()).height >= 44);
      await start.click();
      await expect(diagnostic(page)).toHaveAttribute('data-module', 'intro-core');
      await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
      await at(page, 'W00');
    });
  } finally {
    await item.close();
  }
}
async function practiceCases() {
  for(const width of [320,360,390,430,768,1024,1440]){
    const item=await makeContext(width);
    item.state.practiceGuard=true;
    try{
      await checks(width+'px actual HOME→PLAY→SOLO→result, source anchors, no production mutation',async()=>{
        const before=stableLedger(item.state),equipment=JSON.stringify(item.state.equipment);
        await beginIntro(item.page);await toSolo(item.page,{capture:item.capture,width});
        if(width===390){
          await item.page.reload();await expect(diagnostic(item.page)).toHaveAttribute('data-status','paused');
          await expect(item.page.locator('.wr-tutorial-layer')).toHaveCount(0);
          await item.page.getByRole('button',{name:'이어하기',exact:true}).click();await at(item.page,'S06');
        }
        await completeIntro(item.page,{capture:item.capture,width});
        assert.equal(stableLedger(item.state),before);assert.equal(JSON.stringify(item.state.equipment),equipment);assert.equal(item.state.seen,0);assert.equal(item.state.analytics,0);assert.equal(item.state.dailyCreates,0);
        await fit(item.page);
      });
    }finally{await item.close();}
  }
  const guest=await makeContext(390,'guest');
  guest.state.practiceGuard=true;
  try{
    await checks('actual AuthProvider guest/member checkpoints and blocked connected routes remain separate',async()=>{
      const{page,state}=guest;
      await beginIntro(page);await toSolo(page);
      await page.getByRole('button',{name:'다음에 이어서',exact:true}).click();
      await page.goto(base+'/profile?practice=intro-core');
      await expect(page.getByRole('heading',{name:'연습 화면으로 돌아가세요',exact:true})).toBeVisible();
      assert.equal(countRpc(state,'get_profile_card_v1'),0);assert.equal(countRpc(state,'get_my_achievements_v1'),0);
      await page.getByRole('button',{name:'연습 이어서 보기',exact:true}).click();
      await page.getByRole('button',{name:'이어하기',exact:true}).click();await at(page,'S06');
      await page.getByRole('button',{name:'다음에 이어서',exact:true}).click();
      await switchMember(page,state,'a');
      await expect(diagnostic(page)).toHaveAttribute('data-scope','member');
      await expect(diagnostic(page)).toHaveAttribute('data-status','unseen');
      await page.getByRole('button',{name:'훈련 시작',exact:true}).click();await at(page,'W00');await next(page,'H01');
      await page.getByRole('button',{name:'다음에 이어서',exact:true}).click();
      state.actor='guest';
      await page.evaluate(async()=>{
        localStorage.setItem('wiki_game_local_user',JSON.stringify({id:'guest-return-fixture',displayName:'게스트',isGuest:true,mode:'local'}));
        const{supabase}=await import('/supabaseClient.js');const result=await supabase.auth.signOut();if(result.error)throw result.error;
      });
      await expect(diagnostic(page)).toHaveAttribute('data-scope','guest');
      await expect(diagnostic(page)).toHaveAttribute('data-status','paused');
      await page.getByRole('button',{name:'이어하기',exact:true}).click();await at(page,'S06');
      assert.equal(stableLedger(state),JSON.stringify(ledgerBaseline));
    });
  }finally{await guest.close();}
  const item=await makeContext(390,'a',{reducedMotion:'reduce'});
  item.state.practiceGuard=true;
  try{
    await checks('member keyboard, reduced-motion, F5 pause and explicit checkpoint resume',async()=>{
      await beginIntro(item.page);await toSolo(item.page,{keyboard:true});
      await item.page.keyboard.press('Escape');
      await item.page.getByRole('button',{name:'계속하기',exact:true}).click();await at(item.page,'S06');
      await item.page.reload();
      await expect(diagnostic(item.page)).toHaveAttribute('data-status','paused');await expect(item.page.locator('.wr-tutorial-layer')).toHaveCount(0);
      await item.page.getByRole('button',{name:'이어하기',exact:true}).click();await at(item.page,'S06');
      await expect(item.page.locator('.wr-tutorial-arrow')).toHaveCSS('animation-name','none');
    });
    await checks('actual AuthProvider account switch separates checkpoint A/B',async()=>{
      await item.page.getByRole('button',{name:'다음에 이어서',exact:true}).click();
      await switchMember(item.page,item.state,'b');
      await expect(diagnostic(item.page)).toHaveAttribute('data-status','unseen');
      await item.page.getByRole('button',{name:'훈련 시작',exact:true}).click();await at(item.page,'W00');
      await item.page.getByRole('button',{name:'다음에 이어서',exact:true}).click();
      await switchMember(item.page,item.state,'a');
      await expect(diagnostic(item.page)).toHaveAttribute('data-status','paused');
      await item.page.getByRole('button',{name:'이어하기',exact:true}).click();await at(item.page,'S06');
    });
    await checks('dismiss/reenter keeps training local; explicit exit restores normal HOME',async()=>{
      await item.page.keyboard.press('Escape');await item.page.getByRole('button',{name:'여기서 종료',exact:true}).click();
      await expect(item.page.locator('.wr-tutorial-layer')).toHaveCount(0);
      await item.page.getByRole('button',{name:'다시 시작',exact:true}).click();await at(item.page,'W00');
      await item.page.getByRole('button',{name:'다음에 이어서',exact:true}).click();
      item.state.allowNormalHomeCommands=true;item.state.practiceGuard=false; // The next explicit control ends practice before normal HOME commands.
      await item.page.getByRole('button',{name:'연습 종료 · HOME으로',exact:true}).click();
      await expect.poll(()=>new URL(item.page.url()).searchParams.has('practice')).toBe(false);
      await expect(item.page.getByRole('button',{name:'처음이라면 게임 방법 연습',exact:true})).toBeVisible();
      await expect(item.page.getByRole('button',{name:'사운드 설정',exact:true})).toBeVisible();
      await expect(diagnostic(item.page)).toHaveCount(0);
      assert.equal(stableLedger(item.state),JSON.stringify(ledgerBaseline));
    });
  }finally{await item.close();}
}
async function profileCases() {
  for(const width of [320,360,390,430,768,1024,1440]){
    const item=await makeContext(width,'a',{reducedMotion:'reduce'});
    const {page,state}=item;
    try{
      await checks(width+'px actual ProfilePage HTTP equipment confirmation/failure/retry/F5 and unsupported disclosure',async()=>{
        await page.goto(base+'/profile');
        await expect(page.getByRole('heading',{name:'나만의 탐험 기록 카드',exact:true})).toBeVisible();
        await expect(page.locator('#profile-card-preview')).toContainText(titleA.displayName);
        if(process.argv.includes('--ux-refine')){
          const writesBefore=['equip_profile_reward_v1','unequip_profile_reward_v1','mark_achievements_seen_v1'].map(name=>countRpc(state,name));
          await page.getByRole('button',{name:'완주 효과 변경',exact:true}).click();
          await page.getByRole('button',{name:'완주 빛 장착 전 견본',exact:true}).click();
          await expect(page.getByRole('region',{name:'장착 전 꾸미기 견본'}).getByTestId('finish-effect')).toBeVisible();
          await expect(page.locator('#profile-card-preview')).toContainText(titleA.displayName);
          assert.deepEqual(['equip_profile_reward_v1','unequip_profile_reward_v1','mark_achievements_seen_v1'].map(name=>countRpc(state,name)),writesBefore,'FinishEffect try-on never invokes production commands');
          await page.getByRole('button',{name:'견본 닫기',exact:true}).click();
          await page.getByRole('button',{name:'완주 효과 변경',exact:true}).click();
        }
        await page.getByRole('button',{name:'대표 칭호 변경',exact:true}).click();
        state.failedWrites=1;gateWrite(state);
        const before=countRpc(state,'equip_profile_reward_v1');
        const target=page.locator('button.preward-choice').filter({hasText:'승부사'});
        await target.click();await expect.poll(()=>countRpc(state,'equip_profile_reward_v1')).toBe(before+1);
        await expect(target).toBeDisabled();await expect(page.locator('#profile-card-preview')).toContainText(titleA.displayName);
        await item.capture('profile-pending-'+width);
        releaseWrite();await expect(page.getByRole('button',{name:'같은 요청 다시 시도',exact:true})).toBeVisible();
        await expect(page.locator('#profile-card-preview')).toContainText(titleA.displayName);
await item.capture('profile-failure-'+width);
        await page.getByRole('button',{name:'같은 요청 다시 시도',exact:true}).click();
        await expect(page.locator('#profile-card-preview')).toContainText(titleB.displayName);
        assert.equal(countRpc(state,'equip_profile_reward_v1'),before+2);
        await page.reload();await expect(page.locator('#profile-card-preview')).toContainText(titleB.displayName);
        await page.getByRole('button',{name:'대표 칭호 변경',exact:true}).click();
        await page.locator('.preward-row').filter({has:page.locator('.preward-label',{hasText:'대표 칭호'})}).getByRole('button',{name:'해제',exact:true}).click();
        await expect.poll(()=>state.equipment[users.a.id].some(row=>row.slot==='title')).toBe(false);
        await expect(page.getByText('수집 전용 · 현재 효과 미지원',{exact:true})).toBeVisible();
        await fit(page);await item.capture('profile-'+width);
        assert.equal(stableLedger(state),JSON.stringify(ledgerBaseline));
      });
      await checks(width+'px actual AchievementsPage earned/title/hidden and existing seen command',async()=>{
        await page.goto(base+'/achievements');
        await expect(page.getByRole('heading',{name:'업적 · 발견 도감',exact:true})).toBeVisible();
        await expect(page.getByText('발견 0 / ??',{exact:true})).toBeVisible();
        const detailsToggle=page.getByRole('button',{name:/^보상·기록 자세히 보기/});
        if(await detailsToggle.isVisible())await detailsToggle.click();
        await expect(page.locator('.album-reward .pcard-title').filter({hasText:titleA.displayName}).first()).toBeVisible();
        await expect.poll(()=>countRpc(state,'mark_achievements_seen_v1')).toBeGreaterThan(0);
        await fit(page);await item.capture('achievements-'+width);
        assert.equal(stableLedger(state),JSON.stringify(ledgerBaseline));
      });
    }finally{await item.close();}
  }
  const item=await makeContext(390,'a');
  try{
    await checks('actual profile account change ignores old pending response',async()=>{
      const{page,state}=item;
      await page.goto(base+'/profile');await expect(page.locator('#profile-card-preview')).toContainText('통합 탐험가 A');
      await page.getByRole('button',{name:'대표 칭호 변경',exact:true}).click();
      gateWrite(state);await page.locator('button.preward-choice').filter({hasText:'승부사'}).click();
      await expect.poll(()=>countRpc(state,'equip_profile_reward_v1')).toBe(1);
      await switchMember(page,state,'b');await expect(page.locator('#profile-card-preview')).toContainText('통합 탐험가 B');
      releaseWrite();await page.waitForTimeout(100);
      await expect(page.locator('#profile-card-preview')).toContainText(titleA.displayName);
      await expect(page.locator('#profile-card-preview')).not.toContainText(titleB.displayName);
      assert.equal(stableLedger(state),JSON.stringify(ledgerBaseline));
    });
    await checks('actual AchievementsPage account change replaces prior member public records',async()=>{
      const{page,state}=item;
      await page.getByRole('link',{name:'업적',exact:true}).click();
      await expect(page.locator('.album-current')).toContainText('둘째 탐험가의 공개 기록');
      await switchMember(page,state,'a');
      await expect(page.locator('.album-current')).toHaveText('이어서 기록하기 · 이어서 기록하기');
      await expect(page.locator('article')).not.toContainText('둘째 탐험가의 공개 기록');
      assert.equal(stableLedger(state),JSON.stringify(ledgerBaseline));
    });
  }finally{await item.close();}
}
async function growthCases() {
  for(const width of [320,360,390,430,768,1024,1440]){
    const item=await makeContext(width,width===768?'a':'guest',{reducedMotion:'reduce'});
    item.state.practiceGuard=true;
    try{
      await checks(width+'px actual growth route reuses B album/editor/result and local equip/remove without mutations',async()=>{
        const{page,state}=item;
        await page.goto(base+'/tutorial/practice/growth?practice=growth-basics');
        await expect(diagnostic(page)).toHaveAttribute('data-module','growth-basics');
        await page.getByRole('button',{name:/^(훈련 시작|다시 시작)$/}).click();await at(page,'GR00');
        await next(page,'GR01');await fit(page);
        await page.locator('[data-tutorial-anchor="growth.album.open"]').click();await at(page,'GR02');
        await expect(page.locator('[data-reward-preview="true"][aria-label="연습용 발견 도감"]')).toBeVisible();
        await page.locator('[data-tutorial-anchor="growth.reward.inspect"]').click();await at(page,'GR03');
        const controls=page.locator('[data-tutorial-anchor="growth.title-controls"]');
        await expect(controls.locator('.preward-choice')).toBeVisible();await fit(page);await item.capture('growth-editor-'+width);
        await controls.getByRole('button',{name:/^길을 살피는 연습가.*연습용 선택/}).click();await at(page,'GR04');
        await expect(page.getByTestId('growth-title')).toHaveText('길을 살피는 연습가');
        if(width===390){
          await page.reload();await expect(diagnostic(page)).toHaveAttribute('data-status','paused');
          await expect(page.locator('.wr-tutorial-layer')).toHaveCount(0);
          await expect(page.getByTestId('growth-title')).toHaveText('길을 살피는 연습가');
          await page.getByRole('button',{name:'이어하기',exact:true}).click();await at(page,'GR04');
        }
        await fit(page);await item.capture('growth-card-'+width);
        await next(page,'GR05');await fit(page);await item.capture('growth-remove-'+width);
        await controls.getByRole('button',{name:'연습용 해제',exact:true}).click();await at(page,'GR06');
        await expect(page.getByTestId('growth-title')).toHaveText('연습 칭호 없음');
        await page.locator('[data-tutorial-anchor="growth.result.open"]').click();await at(page,'GR07');
        await expect(page.getByTestId('result-achievements')).toContainText('연습 결과 견본');
        await expect(page.locator('[data-tutorial-anchor="growth.result"] [data-reward-preview="true"]')).toBeVisible();
        await fit(page);await item.capture('growth-result-'+width);
        const resultGeometry=await page.evaluate(()=>{
          const result=document.querySelector('[data-tutorial-anchor="growth.result"]')?.getBoundingClientRect();
          const medal=document.querySelector('[data-tutorial-anchor="growth.result"] .wr-single-achievement-medal svg')?.getBoundingClientRect();
          return{viewport:{width:innerWidth,height:innerHeight},result:{width:result?.width,height:result?.height},medal:{width:medal?.width,height:medal?.height}};
        });
        (report.growthGeometry||=[]).push({width,...resultGeometry});
        assert.ok(resultGeometry.medal.width<=(width<=600?43:65)&&resultGeometry.medal.height<=(width<=600?53:77),'B single result medal retains existing 64x76 desktop / 42x52 mobile maximum');
        await expect(page.locator('.wr-tutorial-target')).toHaveCount(1); // Observe steps also need an actually visible specimen.
        await page.getByRole('button',{name:'훈련 마치기',exact:true}).click();
        await expect(diagnostic(page)).toHaveAttribute('data-status','completed');
        assert.equal(stableLedger(state),JSON.stringify(ledgerBaseline));assert.equal(state.seen,0);
        assert.equal(state.analytics,0);assert.equal(state.dailyCreates,0);assert.deepEqual(state.equipment[users.a.id],initialEquipment);
        assert.equal(countRpc(state,'get_my_achievements_v1'),0);assert.equal(countRpc(state,'get_profile_card_v1'),0);
      });
    }finally{await item.close();}
  }
}
async function networkProbe() {
  const item=await makeContext(390,'guest');item.state.practiceGuard=true;
  try{
    await item.page.goto(base+'/lobby?practice=intro-core');
    await expect(diagnostic(item.page)).toHaveAttribute('data-module','intro-core');
    const before=report.websockets?.blocked.length||0;
    const result=await item.page.evaluate(()=>new Promise(resolve=>{
      const socket=new WebSocket('wss://qa-external.invalid/blocked-probe');
      const timeout=setTimeout(()=>{socket.close();resolve({timedOut:true});},4000);
      socket.onclose=event=>{clearTimeout(timeout);resolve({code:event.code,reason:event.reason});};
      socket.onerror=()=>{};
    }));
    assert.equal(result.code,1008,'arbitrary external WebSocket must be locally closed');
    assert.equal(report.websockets.blocked.length,before+1);
    assert.equal(report.websockets.externalConnections,0);
    report.networkProbe={success:true,syntheticProbe:true,url:'wss://qa-external.invalid/blocked-probe',...result};
    console.log('PASS external WebSocket catch-all probe (no connectToServer)');
  }finally{await item.close();}
}
async function sourceSnapshot() {
  const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))].filter(name=>/\.(jsx?|css|html|json)$/.test(name)).sort();
  const hash=createHash('sha256');
  for(const name of files){hash.update(name+'\0');hash.update(await fs.readFile(path.join(root,name)));}
  return{sha256:hash.digest('hex'),files:files.length};
}
try{
  report.sourceBefore=await sourceSnapshot();
  server=await createServer({root,configFile:false,envFile:false,cacheDir:path.join(out,'vite-cache'),define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(api),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('parallel-app-fixture-only-key'),
    'import.meta.env.VITE_MAINTENANCE':JSON.stringify(''),
  },server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/.temp/**']}}});
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.PARALLEL_BROWSER_PATH?{executablePath:process.env.PARALLEL_BROWSER_PATH}:{})});
  if(process.argv.includes('--network-probe'))await networkProbe();
  if(only==='all'||only==='practice') {
    await firstVisitCase();
    await practiceCases();
  }
  if(only==='all'||only==='profile')await profileCases();
  if(only==='all'||only==='growth')await growthCases();
  report.modulesLoaded=[...moduleRequests].sort();
  for(const suffix of ['/main.jsx','/App.jsx','/authContext.jsx'])assert.ok(report.modulesLoaded.includes(suffix),'actual app module loaded: '+suffix);
  report.sourceAfter=await sourceSnapshot();
  assert.deepEqual(report.sourceAfter,report.sourceBefore,'product source changed during the frozen QA run');
  assert.equal(report.forbidden.length,0,'unexpected practice or normal production mutation');
  assert.equal(report.unexpectedApi.length,0,'HTTP fixture must account for every backend endpoint');
  assert.equal(report.pageErrors.length,0,'actual app page errors');
  assert.ok(report.contexts.every(item=>item.ledgerUnchanged),'existing records/XP/unlocks/inventory unchanged');
  report.success=true;
}catch(error){
  report.failure={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
}finally{
  report.modulesLoaded=[...moduleRequests].sort();
  await browser?.close();
  await server?.close();
  if(only==='review'){
    const review=await import('./parallel-app-review-capture.mjs');
    await review.finalizeReviewEvidence({root,out,report});
  }
  await fs.writeFile(path.join(out,'report-'+only+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({success:report.success,mode:only,checks:report.checks.length,captures:report.captures.length,forbidden:report.forbidden.length,unexpectedApi:report.unexpectedApi.length,pageErrors:report.pageErrors.length,output:out}));
}
