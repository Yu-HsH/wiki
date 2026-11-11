// Real product React + isolated synthetic API/Wikipedia/Realtime. No backend writes.
// Baseline loads preserved source via Vite; never restores the user's working tree.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {expect} from '@playwright/test';
import * as f from './jungle65-full-fixtures.mjs';
const {before,base,api,output,check,USERS,START,MIDDLE,TARGET,OTHER,rooms,players,
  singleRuns,ledger,ledgerRow,htmlOf,linksOf,pageId,iso,now}=f;
const report={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),date:'2026-11-02 KST',uncommitted:true,before,fixtureOnly:true,realBackend:false,screens:[],metrics:[],calls:[],checks:f.checks};
const mobileFull=process.env.MOBILE_FULL_CI==="true";
const widths=mobileFull?[320,360,390,430,768]:[1440,1024,768,390,320],members=[USERS.me,USERS.opp,USERS.p3];
const camp='a0000000-0000-4000-8000-000000000065';
let allReady=false,groupStarted=false,failRead=false,emptyRead=false,slowRead=false;
let singleSchedule=false,apiSeq=0;
const profiles=Object.values(USERS).map((u,i)=>({id:u.id,nickname:i===1?'아주긴한글닉네임과EnglishJungle65탐험가':u.nickname,username:'explorer65',profile_image_url:'/assets/wiki-race/explorer-portrait-small.png',total_xp:840-i*70,profile_level:5}));
const reward=(id,kind,asset,name)=>({rewardId:id,kind,assetRef:asset,displayName:name,retired:false});
const owned=[reward('fixture-frame','frame','frame:tier-3','황금 탐험 프레임'),reward('fixture-title','title',null,'지식의 숲을 개척한 탐험가')];
const cards=Object.fromEntries(profiles.map((p,i)=>[p.id,{userId:p.id,nickname:p.nickname,level:5,legacyImageUrl:p.profile_image_url,title:owned[1],frame:owned[0],icon:null,background:null}]));
const ach=(id,name,category,current,unlocked=false)=>({achievementId:id,category,name,condition:'검수용 공개 업적 조건',current,tierCount:2,unlockedTier:unlocked?1:0,tiers:[{tier:1,threshold:1,xp:30,rewards:[],unlocked,seen:true,unlockId:unlocked?'u-'+id:null,unlockedAt:unlocked?iso(now()):null},{tier:2,threshold:10,xp:60,rewards:[owned[0]],unlocked:false}],nextThreshold:unlocked?10:1});
const achBody={ok:true,unseenCount:0,achievements:[ach('fixture-first','첫 발자국','onboarding',1,true),ach('fixture-wide','넓어진 세계','exploration',4,true),ach('fixture-duel','라이벌과의 한 걸음','duel',0),ach('fixture-group','함께 걷는 길','group',0),ach('fixture-collection','탐험가의 수집','collection',0)],hidden:{discovered:0,achievements:[]}};
const rankingRows=profiles.slice(0,5).map((p,i)=>({id:'record-'+i,user_id:p.id,player_name:p.nickname,start_title:START,target_title:TARGET,elapsed_seconds:45+i*13,click_count:3+i,path_titles:[START,MIDDLE,TARGET],created_at:iso(now()-i*1000),rank:i+1,timing_contract:'single_reserved_prefetch_v1'}));
const bodyOf=r=>{try{return r.request().postDataJSON()||{}}catch{return {}}};
f.extendApi(async(route,key)=>{
 const u=new URL(route.request().url()),p=u.pathname.split('/').at(-1),body=bodyOf(route),method=route.request().method();
 report.calls.push({p,body,method});
 const send=async(data,status=200)=>{await f.json(route,data,status);return true};
 const rows=()=>players.get(camp);
 if(p==='profiles'||p==='public_profiles'){
  if(method==='PATCH')return send([profiles[0]]);
  const id=(u.searchParams.get('id')||'').slice(3),obj=profiles.find(x=>x.id===id)||profiles[0];
  return send((route.request().headers().accept||'').includes('object')?obj:profiles);
 }
 if(p==='get_profile_cards_v1')return send({ok:true,cards});
 if(p==='get_profile_card_v1')return send({ok:true,card:cards[body.p_user_id]||cards[USERS.me.id]});
 if(p==='user_reward_inventory')return send(owned.map(r=>({reward_id:r.rewardId,acquired_at:iso(now()),reward_catalog:{reward_id:r.rewardId,kind:r.kind,asset_ref:r.assetRef,display_name:r.displayName,retired:false}})));
 if(p==='equip_profile_reward_v1'||p==='unequip_profile_reward_v1')return send({ok:true,equipment:p.startsWith('un')?[]:[{slot:body.p_slot,slot_index:1,reward:owned.find(r=>r.rewardId===body.p_reward_id)}]});
 if(p==='get_my_achievements_v1'){if(failRead)return send({message:'검수용 조회 실패'},500);if(slowRead)await new Promise(r=>setTimeout(r,1200));return send(emptyRead?{ok:true,achievements:[],hidden:{discovered:0,achievements:[]}}:achBody)}
 if(p==='ensure_today_daily_challenge')return send([{start_title:START,target_title:TARGET,challenge_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),hint:'같은 코스에 도전하세요'}]);
 if(p==='get_daily_course_rankings_contract_v1'||p==='get_explorer_xp_rankings_v2'){
  if(failRead)return send({message:'검수용 조회 실패'},500);if(slowRead)await new Promise(r=>setTimeout(r,1200));
  return send(emptyRead?[]:p.includes('explorer')?profiles.slice(0,5).map((r,i)=>({...r,user_id:r.id,rank:i+1,total_count:8,ranking_xp:840-i*70})):rankingRows);
 }
 if(p==='get_my_daily_course_rank_contract_v1')return send({rank:1,totalCount:8});
 if(p==='list_public_waiting_rooms_v1')return send([{room_id:camp,mode:body.p_mode,host_nickname:'캠프지기',current_players:3,max_players:6,use_items:body.p_mode==='duel'}]);
 if(p==='join_group_room')return send(rows()?.[0]);
 if(p==='submit_group_target_v2'){
  Object.assign(rows()[0],{submitted_target_title:body.p_submitted_target_title,submitted_target_page_id:body.p_submitted_target_page_id});return send(rows()[0]);
 }
 if(p==='set_group_ready'){Object.assign(rows()[0],{is_ready:body.p_is_ready});return send(rows()[0])}
 if(p==='start_group_room_game_v2'){groupStarted=true;return send(rooms.get(camp))}
 if(p==='leave_group_waiting_room')return send({ok:true});
 if(p==='single-run'&&!['create','move','leave','snapshot'].includes(body.action)){
  let run=singleRuns.get(body.runId);
  if(body.action==='allocate'){
   run={id:'full-single-'+(++apiSeq),status:singleSchedule?'prepared':'active',timing_contract:'single_reserved_prefetch_v1',run_mode:body.mode||'random',state_version:1,move_count:0,start_title_snapshot:START,start_page_id:pageId(START),start_revision_id:'5000',target_title_snapshot:TARGET,target_page_id:pageId(TARGET),target_revision_id:'5000',current_title_snapshot:START,current_page_id:pageId(START),current_revision_id:'5000',path_title_snapshots:[START],started_at:singleSchedule?null:iso(now()-30000),scheduled_start_at:singleSchedule?null:iso(now()-30000)};singleRuns.set(run.id,run);
  }
  if(!run)return send({ok:false,code:'RUN_NOT_FOUND'},400);
  if(body.action==='reserve_start')Object.assign(run,{status:'scheduled',scene_starts_at:iso(now()),scheduled_start_at:iso(now()+8600)});
  if(body.action==='start')Object.assign(run,{status:'active',started_at:run.scheduled_start_at});
  if(body.action==='leave_v1')run.status='abandoned';
  return send({ok:true,run,server_now:iso(now()),...(body.action==='document'?{page:{canonicalTitle:run.current_title_snapshot,pageId:pageId(run.current_title_snapshot),revisionId:'5000',documentHtml:htmlOf(run.current_title_snapshot),links:linksOf(run.current_title_snapshot).map(title=>({title}))}}:{})});
 }
 if(p==='apply_single_move_v2'){
  const run=singleRuns.get(body.p_run_id),title=body.p_to_title_snapshot;
  Object.assign(run,{current_title_snapshot:title,current_page_id:pageId(title),state_version:run.state_version+1,move_count:run.move_count+1,path_title_snapshots:[...run.path_title_snapshots,title],...(title===TARGET?{status:'completed',finished_at:iso(now())}:{})});
  if(title===TARGET)ledger.set('rec-'+run.id.slice(0,8),[ledgerRow('rec-'+run.id.slice(0,8),'single_random_finish',20)]);
  return send({ok:true,run});
 }
 return false;
});

async function ready(p){await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(260)}
async function auditMobilePage(p,name){
 if(!mobileFull)return;
 const result=await p.evaluate(()=>{
   const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
   const coll=(a,b)=>a&&b&&Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))>3&&Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y))>3;
   const rows=[...document.querySelectorAll(".wr-room--group .wr-roster-row.wr-kion-slot")];
   const violations=[];
   for(const [i,row] of rows.entries()){
     const profile=rect(row.querySelector(":scope > .pcard")),ready=rect(row.querySelector(":scope > .wr-status")),
       bubble=rect(row.querySelector(":scope > .wr-kion-card")),own=rect(row);
     if(coll(profile,ready))violations.push("READY_OVER_PROFILE:"+i);
     if(coll(profile,bubble))violations.push("KION_OVER_PROFILE:"+i);
     if(coll(ready,bubble))violations.push("KION_OVER_READY:"+i);
     if(bubble&&own&&(bubble.y<own.y-1||bubble.bottom>own.bottom+1||bubble.x<own.x-1||bubble.right>own.right+1))violations.push("KION_OUTSIDE_ROW:"+i);
   }
   const controls=rect(document.querySelector(".wr-room--group .wr-kion-room-controls"));
   for(const row of rows){const bubble=rect(row.querySelector(":scope > .wr-kion-card"));if(coll(bubble,controls))violations.push("KION_OVER_SEND_BUTTON");}
   return{violations,groupRows:rows.length,visibleBubbles:rows.filter(row=>row.querySelector(".wr-kion-card")).length,
     scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
 });
 check(name+" mobile no Kion/READY/profile collisions",result.violations.length===0);
 check(name+" mobile no horizontal page overflow",result.scrollWidth<=result.viewport+1);
}
async function capture(p,name,{full=true,area=null}={}){
 await ready(p);await p.mouse.move(0,0);
 await p.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('.wr-result-layer--overlay').forEach(e=>e.scrollTop=0)});
 if(await p.locator('.wr-result-layer--overlay').count())full=false;
 const m=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,articleWidth:document.querySelector('.current-page-card')?.getBoundingClientRect().width||null,hudHeight:document.querySelector('.wr-race-hud')?.getBoundingClientRect().height||null,reportTop:document.querySelector('.wr-result-layer--overlay .wr-result-frame')?.getBoundingClientRect().top??null,audioBottom:document.querySelector('.wr-audio')?.getBoundingClientRect().bottom??0}));
 check(name+' no page overflow',m.scrollWidth<=m.width);
 if(m.width<=768)await auditMobilePage(p,name);
 if(!before&&m.reportTop!==null)check(name+' report clear of sound controls',m.reportTop>=m.audioBottom);
 if(!before&&/^(single|duel|group)-play-1440$/.test(name))check(name+' article retains reading width',m.articleWidth>800);
 const file=name+'.png';await p.screenshot({path:output+'/'+file,fullPage:full,animations:'disabled'});report.screens.push({name,file,...m});
 if(area&&await p.locator(area).first().isVisible())await p.locator(area).first().screenshot({path:output+'/'+name+'-detail.png',animations:'disabled'});
 console.log('CAPTURE',name);return m;
}
async function matrix(p,name,area){for(const width of widths){await p.setViewportSize({width,height:width<=390?844:1000});await capture(p,name+'-'+width,{area});}}
async function auditFonts(p){
 const c=await p.context().newCDPSession(p);await c.send('DOM.enable');await c.send('CSS.enable');const {root}=await c.send('DOM.getDocument');const roles={display:['.wr-mode-tag',/Cafe24Ssurround/],paper:['.wr-hud-doc-value > span',/MaruBuri/],body:['.article-content p',/Pretendard/],numeric:['.wr-hud-stat-value',/Pretendard/]};report.fontRoles={};
 for(const [role,[selector,pattern]]of Object.entries(roles)){const {nodeId}=await c.send('DOM.querySelector',{nodeId:root.nodeId,selector});const {fonts}=await c.send('CSS.getPlatformFontsForNode',{nodeId});report.fontRoles[role]=fonts;check('A+ actual '+role+' glyphs',fonts.some(font=>pattern.test(font.postScriptName)));}await c.detach();
}
const onlineLocal=id=>({['wiki-mp-game:'+id+':'+USERS.me.id]:{enteredPlaying:true}});
async function open(url,options={}){const c=await f.context('me',options);await c.page.goto(base+url);return c}
async function singleStart(p){await p.goto(base+'/play');await p.locator('.wr-mode-action').first().click();await p.getByPlaceholder('예: 아인슈타인, 조선왕조...').fill('랜덤');await p.getByRole('button',{name:'랜덤 목표로 시작'}).click();await expect(p.locator('.wr-hud-doc--current')).toContainText(START,{timeout:20000});await p.locator('.wr-single-start').waitFor({state:'detached',timeout:15000});await expect(p.locator('.article-content a[data-wiki-title]').first()).toBeVisible();}
try{
 await fs.mkdir(output,{recursive:true});await f.launch();
 // A. Camp + actual search, READY, cancellation, start guard, F5, keyboard dialog.
 f.groupRoom(camp,members,{status:'waiting',room_code:'CAMP65',max_players:6});
 if(mobileFull){
   const current=iso(now());
   f.events.set(camp,[{id:"emote-mobile-host",room_id:camp,user_id:USERS.me.id,event_type:"room_emote",payload:{emoteId:"hello"},created_at:current},
     {id:"emote-mobile-rival",room_id:camp,user_id:USERS.opp.id,event_type:"room_emote",payload:{emoteId:"good"},created_at:current}]);
 }
 players.set(camp,members.map((u,i)=>({id:'camp-'+i,room_id:camp,user_id:u.id,nickname_snapshot:profiles[i].nickname,profile_image_snapshot:profiles[i].profile_image_url,is_ready:i>0,submitted_target_title:i>0?[MIDDLE,TARGET][i-1]:null,submitted_target_page_id:i>0?pageId([MIDDLE,TARGET][i-1]):null,player_status:'waiting'})));
 {
  const {ctx,page:p}=await open('/multiplayer/group/room/'+camp);
  await p.locator('.wr-group-layout').waitFor();
  if(mobileFull)await expect(p.locator(".wr-room--group .wr-roster-row.wr-kion-slot")).toHaveCount(3);
  await matrix(p,'group-camp','.wr-group-mine');
  check('A start disabled before own READY',await p.getByRole('button',{name:'게임 시작',exact:true}).isDisabled());
  await p.getByRole('textbox',{name:'문서 후보 검색어'}).fill('후보');await p.getByRole('button',{name:'검색',exact:true}).click();await p.locator('.search-item').first().click();
  check('A local candidate never submits automatically',!players.get(camp)[0].is_ready);
  await capture(p,'camp-selected-320');await p.getByRole('button',{name:'READY',exact:true}).click();
  await expect(p.getByRole('button',{name:'준비 취소',exact:true})).toBeVisible();await capture(p,'camp-ready-320');
  await p.reload();await expect(p.getByRole('button',{name:'준비 취소',exact:true})).toBeVisible();check('A READY survives F5 in server fixture',true);
  await p.getByRole('button',{name:'준비 취소',exact:true}).click();await expect(p.getByRole('button',{name:'READY',exact:true})).toBeVisible();check('A unready uses existing endpoint',true);
  await p.getByRole('button',{name:'READY',exact:true}).click();await expect(p.getByRole('button',{name:'게임 시작',exact:true})).toBeEnabled();
  await p.getByRole('button',{name:'게임 시작',exact:true}).click();await expect.poll(()=>groupStarted).toBe(true);check('A host start calls existing RPC',groupStarted);
  rooms.get(camp).host_user_id=USERS.opp.id;f.notify(camp,'game_rooms');await expect(p.locator('.wr-host-notice')).toBeVisible();await expect(p.getByRole('button',{name:'게임 시작',exact:true})).toHaveCount(0);await capture(p,'camp-host-transfer-320');check('A server host transfer removes start authority',true);
  await p.locator('.wr-roster-row .pcard').first().press('Enter');await p.locator('.user-profile-modal-card').waitFor();await capture(p,'camp-profile-320');
  if(!before){await p.keyboard.press('Escape');await expect(p.locator('.user-profile-modal-card')).toHaveCount(0);check('A camp profile Escape returns focus',await p.locator('.wr-roster-row .pcard').first().evaluate(e=>e===document.activeElement));}
  await ctx.close();
 }
 if(mobileFull){
   // Genuine GroupRoomPage with six joined players, not a reduced visual fixture.
   const fullId="full-mobile-group-6";
   const fullMembers=[USERS.me,USERS.opp,USERS.p3,USERS.p4,USERS.p5,USERS.p6];
   f.groupRoom(fullId,fullMembers,{status:"waiting",room_code:"MOB6QA",min_players:3,max_players:6});
   const current=iso(now()),emoji=["hello","ready","go","good","wait","wow"];
   players.set(fullId,players.get(fullId).map((row,i)=>({...row,id:"mobile-member-"+i,
     is_ready:i%2===1,player_status:"waiting",nickname_snapshot:profiles[i]?.nickname||fullMembers[i].nickname,
     submitted_target_title:i%2===1?MIDDLE:null,submitted_target_page_id:i%2===1?pageId(MIDDLE):null})));
   f.events.set(fullId,fullMembers.map((u,i)=>({id:"mobile6-"+i,room_id:fullId,user_id:u.id,
     event_type:"room_emote",payload:{emoteId:emoji[i]},created_at:current})));
   const {ctx,page:p}=await open("/multiplayer/group/room/"+fullId,{width:390});
   await expect(p.locator(".wr-room--group .wr-roster-row.wr-kion-slot")).toHaveCount(6);
   await matrix(p,"group-camp-full6",".wr-party");
   await ctx.close();
 }
 // B. Same real article links and right TOC across three modes.
 {
  const {ctx,page:p}=await f.context('me');await singleStart(p);await matrix(p,'single-play','.wr-race-hud');
  if(!before)await auditFonts(p);
  await p.locator('.article-content a',{hasText:MIDDLE}).first().click();await expect(p.locator('.wr-hud-doc--current')).toContainText(MIDDLE);
  check('B single move count',await f.stat(p,'이동')==='1');
  await p.reload();await expect(p.locator('.wr-hud-doc--current')).toContainText(MIDDLE);check('B single F5 current restored',true);
  await p.locator('.article-content a',{hasText:TARGET}).first().click();await p.getByTestId('single-result').waitFor();await matrix(p,'single-result','.wr-result-card');
  check('C single server ledger XP visible',(await p.locator('.rxp').innerText()).includes('20'));await p.reload();await p.getByTestId('single-result').waitFor();check('C result restored after F5',true);
  await ctx.close();
 }
 {
  const id='full-duel-play';f.duelRoom(id);const {ctx,page:p}=await open('/multiplayer/game/'+id,{local:onlineLocal(id)});
  await expect(p.locator('.mp-game-status')).toHaveText('레이스 진행 중',{timeout:20000});await matrix(p,'duel-play','.wr-race-dock');
  check('B five duel item slots',await p.locator('.duel-item-slot').count()===5);
  await p.getByRole('button',{name:/링크만 보기 · 사용 가능/}).click();const index=p.getByRole('dialog',{name:'링크만 보기'});await index.waitFor();check('B item overlay uses actual allowed link set',await index.locator('.duel-item-index__word').count()===linksOf(START).length);await capture(p,'duel-item-index-320');await p.keyboard.press('Escape');await expect(index).toHaveCount(0);check('B item overlay Escape closes',true);
  await p.locator('.article-content a',{hasText:MIDDLE}).first().click();await expect(p.locator('.wr-hud-doc--current')).toContainText(MIDDLE);check('B duel real HTML link moved',true);
  await p.getByRole('button',{name:'나가기',exact:true}).click();await p.getByRole('dialog').waitFor();await capture(p,'duel-retire-dialog-320');
  await ctx.close();
 }
 {
  const id='full-group-play';f.groupRoom(id,members);const {ctx,page:p}=await open('/multiplayer/group/game/'+id,{local:onlineLocal(id)});
  await p.locator('.article-content a[data-wiki-title]').first().waitFor({timeout:20000});await matrix(p,'group-play','.wr-race-side');
  await p.locator('.article-content a',{hasText:MIDDLE}).first().click();await expect(p.locator('.wr-hud-doc--current')).toContainText(MIDDLE);check('B group HTML link moved',true);
  await p.locator('.article-content a',{hasText:TARGET}).first().click();await p.locator('.wr-result-a').waitFor();await matrix(p,'group-personal-result','.wr-result-card');await p.getByRole('button',{name:'관전하기 →',exact:true}).click();await p.locator('.wr-race-tabs').waitFor();await capture(p,'group-spectating-320');check('B group completion to spectator retained',true);
  await ctx.close();
 }
 // A separate small matrix checks the other existing single entry modes.
 for(const mode of ['custom','daily']){
  singleSchedule=mode==='daily';
  const {ctx,page:p}=await f.context('me',{width:390});await p.goto(base+(mode==='daily'?'/lobby':'/play'));
  if(mode==='daily')await p.locator('.daily-btn').click();
  else{await p.locator('.wr-mode-action').first().click();await p.getByPlaceholder('예: 아인슈타인, 조선왕조...').fill('목표');await p.getByPlaceholder('예: 아인슈타인, 조선왕조...').press('Enter');await p.locator('.qs-modal .search-item').first().click();await p.locator('.qs-modal-actions .app-btn-primary').click();}
  await expect(p.locator('.wr-hud-doc--current')).toContainText(START,{timeout:20000});
  if(mode==='daily'){await p.getByTestId('single-start-cinematic').waitFor();await capture(p,'single-daily-countdown-390');await p.getByTestId('single-start-cinematic').waitFor({state:'detached',timeout:20000});check('B scheduled start acknowledges server clock',report.calls.some(c=>c.p==='single-run'&&c.body.action==='start'));}
  await capture(p,'single-'+mode+'-390');check('B single '+mode+' reaches real game HUD',true);await ctx.close();
  singleSchedule=false;
 }
 // C. Finalized result fixtures: display only, no claim of real XP grants.
 for(const [name,winner,reason]of[['duel-win',USERS.me.id,'normal_finish'],['duel-loss',USERS.opp.id,'normal_finish'],['duel-retired',USERS.opp.id,'forfeit']]){
  const id='full-'+name;f.finishedDuel(id,{winner,reason,meRetire:reason==='forfeit'?'forfeited':null,xp:[winner===USERS.me.id?'duel_win_normal':'duel_loss_normal',winner===USERS.me.id?50:reason==='forfeit'?0:25]});
  const {ctx,page:p}=await open('/multiplayer/game/'+id,{local:onlineLocal(id)});await p.locator('.wr-result').waitFor({timeout:20000});
  if(name==='duel-win')await matrix(p,name,'.wr-result-card');else{await p.setViewportSize({width:390,height:844});await capture(p,name+'-390')}
  await ctx.close();
 }
 {
  const id='full-group-result';f.groupRoom(id,members);f.finalizeGroup(id,members,{[USERS.me.id]:{rank:1},[USERS.opp.id]:{rank:2},[USERS.p3.id]:{retire:'timeout'}});
  const my=f.players.get(id)[0];ledger.set('gr-'+id+'-'+USERS.me.id.slice(0,4),[ledgerRow('gr-'+id+'-'+USERS.me.id.slice(0,4),'group_rank_1',70)]);
  const {ctx,page:p}=await open('/multiplayer/group/game/'+id,{local:onlineLocal(id)});await p.locator('.wr-result').waitFor({timeout:20000});await matrix(p,'group-result','.wr-result-card');await ctx.close();
 }
 // D. Main data views and meaningful interactions.
 for(const [name,url,wait]of[['ranking','/ranking','.ranking-top article'],['profile','/profile','.profile-representative'],['achievements','/achievements','.ach-card']]){
  const {ctx,page:p}=await open(url);await p.locator(wait).first().waitFor();await matrix(p,name,wait);
  if(name==='ranking'){for(const tab of ['주간 탐험가','탐험가 레벨']){await p.getByRole('button',{name:tab,exact:true}).click();await p.locator('.ranking-score').first().waitFor();await capture(p,'ranking-'+(tab==='주간 탐험가'?'weekly':'xp')+'-320');}check('D existing ranking tabs clickable',true)}
  if(name==='profile'){
   await p.locator('.profile-settings summary').click();await p.getByRole('button',{name:'수정',exact:true}).click();await p.getByRole('textbox',{name:'닉네임',exact:true}).fill('캠프 탐험가');await capture(p,'profile-edit-320');
   if(before){report.baselineIssue='320px nickname cancel button clipped by original unwrapped flex row';await p.getByRole('button',{name:'취소',exact:true}).press('Enter');}else await p.getByRole('button',{name:'취소',exact:true}).click();check('D profile nickname editor cancel',true);
   const toggle=p.locator('.preward-toggle').filter({hasText:'변경'}).first();if(await toggle.count()){await toggle.click();await capture(p,'profile-equipment-320');}
  }
  if(name==='achievements'){await p.getByRole('button',{name:'히든',exact:true}).click();check('D undiscovered hidden names absent',await p.locator('.ach-card:not(.ach-card--hidden-summary)').count()===0);await capture(p,'achievements-hidden-320');}
  await ctx.close();
 }
 // E. Approved screens sampled without redesign; public guides remain real routes.
 for(const [name,url,wait]of[['landing','/','.wr65-landing-picture'],['home','/lobby','.wr65-jungle-hero'],['play','/play','.wr-mode'],['public-duel','/multiplayer?mode=duel','.mp-public-board'],['public-group','/multiplayer?mode=group','.mp-public-board'],['updates','/updates','.wr-updates-page'],['guide','/guide','.public-article'],['privacy','/privacy','.public-article'],['terms','/terms','.public-article'],['about','/about','.public-article'],['login','/login','.auth-card']]){
  const {ctx,page:p}=await open(url,{anonymous:name==='landing'||name==='login'});await p.locator(wait).first().waitFor();await matrix(p,name);
  if(name==='public-duel'){await p.getByRole('button',{name:'게임 설명',exact:true}).click();await p.locator('.help-modal').waitFor();await capture(p,'item-guide-320');await p.keyboard.press('Escape');check('E item guide Escape closes',await p.locator('.help-modal').count()===0);}
  if(name==='home'){await p.getByRole('button',{name:'사운드 설정',exact:true}).click();await p.locator('.wr-audio-panel').waitFor();await capture(p,'sound-settings-320');await p.keyboard.press('Escape');check('E sound settings Escape closes',await p.locator('.wr-audio-panel').count()===0);}
  await ctx.close();
 }
 // Status fixtures are separate from successful backend-shaped responses.
 for(const [name,state]of[['empty','emptyRead'],['error','failRead'],['loading','slowRead']]){
  emptyRead=state==='emptyRead';failRead=state==='failRead';slowRead=state==='slowRead';const {ctx,page:p}=await open('/ranking',{width:390});
  if(slowRead){await p.locator('.ranking-table-wrap [aria-busy]').waitFor();await capture(p,'ranking-loading-390')}
  else{await p.locator(failRead?'.app-error':'.ranking-table-wrap').waitFor();await capture(p,'ranking-'+name+'-390')}
  await ctx.close();emptyRead=failRead=slowRead=false;
 }
 // Guest restrictions run through real product routing.
 {
  const {ctx,page:p}=await f.context('guestSingle',{guest:true,width:390});await p.goto(base+'/multiplayer');await p.waitForURL(/\/play$/);check('E guest online route redirects to PLAY',true);await capture(p,'guest-play-390');await ctx.close();
 }
 report.consoleErrors=f.consoleErrors;report.fontNetwork=f.fontNetwork;report.unexpectedErrors=f.consoleErrors.filter(x=>!/검수용 조회 실패|Failed to load resource|랭킹 조회 실패/.test(x));
 check('No unexpected page/console errors',report.unexpectedErrors.length===0);
 await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2));
 console.log('PASS full review',report.screens.length,'screens',report.checks.length,'checks');
}catch(e){report.failure=e.stack;report.consoleErrors=f.consoleErrors;await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2));throw e}
finally{await f.close()}
