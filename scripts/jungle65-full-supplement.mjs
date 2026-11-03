// Additional real-UI fixtures: approved duel lobby, eight-person camp, censorship,
// touch and keyboard. All API and realtime calls remain intercepted in memory.
import fs from 'node:fs/promises';
import {expect} from '@playwright/test';
import * as f from './jungle65-full-fixtures.mjs';
const checks=[],screens=[];
const check=(name,value)=>{if(!value)throw new Error(name);checks.push(name)};
const profiles=Object.values(f.USERS).map((u,i)=>({id:u.id,nickname:i===1?'아주긴한글닉네임과EnglishJungle65탐험가':u.nickname,profile_image_url:'/assets/wiki-race/explorer-portrait-small.png',profile_level:5}));
f.extendApi(async(route)=>{const u=new URL(route.request().url()),p=u.pathname.split('/').at(-1),body=route.request().postData()?route.request().postDataJSON():{};const send=async d=>{await f.json(route,d);return true};
 if(p==='profiles'||p==='public_profiles'){const id=(u.searchParams.get('id')||'').replace('eq.','');const r=profiles.find(x=>x.id===id)||profiles[0];return send(route.request().headers().accept?.includes('object')?r:id?[r]:profiles)}
 if(p==='get_profile_card_v1')return send({ok:true,card:{userId:body.p_user_id,nickname:profiles.find(x=>x.id===body.p_user_id)?.nickname||'탐험가',frame:null,title:null,icon:null,background:null}});
 if(p==='join_group_room'||p==='join_duel_room_v2')return send({ok:true});
 return false;
});
async function snap(p,name){await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:f.output+'/'+name+'.png',fullPage:!name.includes('censored'),animations:'disabled'});check(name+' no page overflow',await f.noOverflow(p));screens.push(name)}
try{
 await f.launch();await fs.mkdir(f.output,{recursive:true});
 const duel='full-waiting-supplement';f.duelRoom(duel);Object.assign(f.rooms.get(duel),{status:'waiting',room_code:'DUEL65'});
 const lobby=await f.context('me');await lobby.page.goto(f.base+'/multiplayer/room/'+duel);await lobby.page.locator('.wr-duel-stage').waitFor();
 for(const width of [1440,1024,768,390,320]){await lobby.page.setViewportSize({width,height:width<=390?844:1000});await snap(lobby.page,'duel-waiting-'+width)}await lobby.ctx.close();
 const camp='full-eight-camp';f.groupRoom(camp,Object.values(f.USERS),{status:'waiting',room_code:'CAMP88',max_players:8});
 f.players.get(camp).forEach((r,i)=>Object.assign(r,{nickname_snapshot:profiles[i].nickname,is_ready:i%2===0,submitted_target_title:i%2===0?f.TARGET:null,submitted_target_page_id:i%2===0?f.pageId(f.TARGET):null}));
 const c=await f.context('me',{width:390});await c.ctx.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text}},configurable:true}));await c.page.goto(f.base+'/multiplayer/group/room/'+camp);await c.page.locator('.wr-group-layout').waitFor();await snap(c.page,'group-eight-camp-390');
 await c.page.getByRole('button',{name:'방 코드 CAMP88 복사',exact:true}).tap();await expect(c.page.locator('.wr-copy-feedback')).toHaveText('복사됨');check('Touch copy exact fixture room code',await c.page.evaluate(()=>window.__copied)==='CAMP88');
 await c.page.locator('.wr-roster-row .pcard').first().tap();await c.page.locator('.user-profile-modal-card').waitFor();await snap(c.page,'camp-touch-profile-390');
 if(!f.before){for(let i=0;i<6;i++){await c.page.keyboard.press('Tab');check('Camp dialog focus contained '+i,await c.page.getByRole('dialog',{name:'탐험가 프로필'}).evaluate(e=>e.contains(document.activeElement)))}await c.page.keyboard.press('Escape');await expect(c.page.locator('.user-profile-modal-card')).toHaveCount(0);check('Touch-opened camp dialog Escape closes',true)}await c.ctx.close();
 const id='full-censored';f.duelRoom(id,{item:{censorMs:60000,censorArticle:true}});const d=await f.context('me',{width:390,local:{['wiki-mp-game:'+id+':'+f.USERS.me.id]:{enteredPlaying:true}}});await d.page.goto(f.base+'/multiplayer/game/'+id);const link=d.page.locator('.article-content a.duel-item-censored').first();await link.waitFor();check('Censored links remain noninteractive',await link.evaluate(e=>e.getAttribute('aria-disabled')==='true'&&getComputedStyle(e).pointerEvents==='none'));await snap(d.page,'duel-censored-390');await d.page.reload();await link.waitFor();check('Duel F5 preserves censored state',true);await d.ctx.close();
 check('No unexpected page/console errors',f.consoleErrors.length===0);await fs.writeFile(f.output+'/supplement-report.json',JSON.stringify({head:'bd87c4d + uncommitted',date:'2026-11-02 KST',fixtureOnly:true,before:f.before,checks,screens,consoleErrors:f.consoleErrors},null,2));console.log('PASS',checks.length,'supplement checks',screens.length,'screens');
}finally{await f.close()}
