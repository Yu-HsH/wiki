// Release smoke: real local Auth/RPC/Realtime, independent browser sessions.
// Fixture articles cover normal races; random teleport uses the actual local Edge.
// --group-only and --single-only resume those checks without replaying duel checks.
// No remote Supabase, no stored keys/sessions. All fixtures are removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import { expectedDbContainer, readProjectId, runCli, runPsql } from './supabase-runtime-common.mjs';

const status = runCli(['status', '--output', 'json']);
assert.equal(status.status, 0, 'local Supabase status failed');
const config = JSON.parse(status.stdout);
const apiUrl = config.API_URL;
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(apiUrl), 'local API only');
const container = expectedDbContainer(readProjectId());
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
function sql(statement) {
  const result = runPsql(container, statement);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const token = randomUUID().slice(0, 8);
const groupOnly = process.argv.includes('--group-only');
const singleOnly = process.argv.includes('--single-only');
const names = ['시작', '중간', '목표'].map((name) => `sa2-${token}-${name}${process.argv.includes('--long-titles') ? '-아주긴문서제목'.repeat(12) : ''}`);
const pages = names.map((title, i) => ({ title, pageId: `sa2-${token}-${i}`, revisionId: `${100 + i}`, snapshotId: randomUUID() }));
const [START, MIDDLE, TARGET] = pages;
const PATH_KEYS = ['path_titles', 'path_page_ids', 'path_revision_ids'];
// Assert the applied SF-A3 policy; never replace it for this smoke.
const policyQual = () => sql(`select qual from pg_policies where tablename = 'room_players' and policyname = 'Players can view players in their room';`);
const hasHelper = () => sql(`select to_regprocedure('public.can_view_room_player_v1(uuid,uuid)') is not null;`) === 't';
const originalQual = policyQual();
const users = [], rooms = [], contexts = [], checks = [], errors = [];
const playerReads = [], tableReads = [], progressFrames = [];
const subscriptions = [], rawFrames = [], publicFrames = [];
const ledgerSnapshot = () => sql(`select jsonb_build_object('xp',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]'::jsonb) from public.xp_ledger l where l.user_id in (${users.map(u=>q(u.id)).join(',')})),'unlocks',(select coalesce(jsonb_agg(to_jsonb(u)-'seen_at' order by u.id),'[]'::jsonb) from public.user_achievement_unlocks u where u.user_id in (${users.map(u=>q(u.id)).join(',')})));`);
async function subscribeActor(actor, roomId, label) {
  await actor.client.realtime.setAuth(actor.session.access_token);
  const channel=actor.client.channel(`release-${token}-${label}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'room_players',filter:`room_id=eq.${roomId}`},p=>rawFrames.push({label,row:p.new})).on('postgres_changes',{event:'INSERT',schema:'public',table:'room_events',filter:`room_id=eq.${roomId}`},p=>publicFrames.push({label,row:p.new}));
  subscriptions.push({client:actor.client,channel});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscription timeout')),15000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(Error(status));}})});
}
const mmss=(seconds)=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
async function mobileCheck(page,name){
 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth-document.documentElement.clientWidth,...[...document.querySelectorAll('.wr-result,.wr-result-card')].map(n=>n.scrollWidth-n.clientWidth)));
 assert.ok(overflow<=1,`${name} horizontal overflow ${overflow}`);
 const primary=page.locator('[data-testid="duel-result"] .wr-ractions .wr-race-btn--primary');
 if(await primary.count()){await primary.scrollIntoViewIfNeeded();await expect(primary).toBeVisible();const b=await primary.boundingBox();assert.ok(b&&b.x>=-1&&b.x+b.width<=391,`${name} primary button clipped`);}
 await page.screenshot({path:`${artifactDir}/${name}-390.png`,fullPage:true});pass(`${name}: mobile 390px no horizontal overflow and result button usable`);
 await page.setViewportSize({width:1280,height:900});
}
const admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server, completed = false;
let groupFixture = false;
let singleRandomFixture = false, randomPickCount = 0;
let dailyOriginal, dailyChanged = false;
const artifactDir = '.temp/release-validation-20261006/resume/ui';
fs.mkdirSync(artifactDir, { recursive: true });
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error, null, result.error?.message);
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
// Every page links to the two later pages; the snapshot table decides what is allowed.
async function wikiRoute(route) {
  const url = new URL(route.request().url());
  let data;
  if (url.pathname.includes('/summary/')) {
    const title = decodeURIComponent(url.pathname.split('/summary/')[1]);
    const page = pages.find((p) => p.title === title);
    if (!page) { await route.continue(); return; }
    data = { title, pageid: page.pageId, revision: page.revisionId, extract: '로컬 SF-A2 검증 문서' };
  } else if (url.searchParams.get('list') === 'search') {
    data = { query: { search: [{ title: TARGET.title, snippet: '목표 후보' }] } };
  } else if (url.searchParams.get('list') === 'random') {
    const picked = singleRandomFixture && randomPickCount++ > 0 ? TARGET : START;
    data = { query: { random: [{ title: picked.title }] } };
  } else {
    const page = pages.find((p) => p.title === (url.searchParams.get('page') || url.searchParams.get('titles')));
    if (!page) { await route.continue(); return; }
    const links = groupFixture ? pages.filter(p => p !== page) : pages.slice(pages.indexOf(page) + 1);
    if (url.searchParams.get('action') === 'parse') {
      data = { parse: { title: page.title, pageid: page.pageId, revid: page.revisionId,
        text: { '*': `<div class="mw-parser-output"><p>로컬 문서</p>${links.map((p) => `<a href="/wiki/${p.title}">${p.title}</a>`).join(' ')}</div>` } } };
    } else {
      data = { query: { pages: { 1: { title: page.title, pageid: page.pageId, links: links.map((p) => ({ title: p.title, ns: 0 })) } } } };
    }
  }
  await route.fulfill({ json: data });
}
async function makeContext(actor, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  contexts.push(context);
  const storageKey = `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({ storageKey, session }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey, session: actor.session });
  await context.route('https://ko.wikipedia.org/**', wikiRoute);
  await context.route(`${apiUrl}/functions/v1/wiki-snapshot`, async (route) => {
    const input = route.request().postDataJSON();
    const page = pages.find((p) => p.title === input.title);
    if (!page) { await route.continue(); return; }
    await route.fulfill({ json: { snapshotId: page.snapshotId, pageId: page.pageId, revisionId: page.revisionId, canonicalTitle: page.title } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/room_players')) tableReads.push(`${label} ${request.url()}`);
  });
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    if (String(payload).includes('"duel_progress"')) progressFrames.push({ label, at: Date.now() });
  }));
  page.on('response', async (response) => {
    if (!response.url().includes('/rest/v1/rpc/get_duel_room_players_v1')) return;
    try { playerReads.push({ label, rows: await response.json() }); } catch { /* aborted on navigation */ }
  });
  return page;
}
async function roomRows(id) {
  return JSON.parse(sql(`select jsonb_build_object('room', (select to_jsonb(r) from public.game_rooms r where id=${q(id)}),
    'players', (select jsonb_agg(to_jsonb(p) order by user_id) from public.room_players p where room_id=${q(id)}));`));
}
const opponentBox = (page, label) => page.locator('.mp-opponent-box').filter({ hasText: label }).locator('.mp-opponent-value');

try {
  sql(`insert into public.wiki_pages(page_id, canonical_title) values ${pages.map((p) => `(${q(p.pageId)},${q(p.title)})`).join(',')};
    insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values ${pages.map((p) => `(${q(p.snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)})`).join(',')};
    insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal) values
      (${q(START.snapshotId)},${q(MIDDLE.pageId)},${q(MIDDLE.revisionId)},${q(MIDDLE.title)},${q(MIDDLE.title)},0),
      (${q(START.snapshotId)},${q(TARGET.pageId)},${q(TARGET.revisionId)},${q(TARGET.title)},${q(TARGET.title)},1),
      (${q(MIDDLE.snapshotId)},${q(TARGET.pageId)},${q(TARGET.revisionId)},${q(TARGET.title)},${q(TARGET.title)},0);`);
  for (const name of ['host', 'guest']) {
    const email = `sa2-${token}-${name}@local.test`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname: `sa2 ${name}` } });
    assert.equal(created.error, null);
    const actor = { id: created.data.user.id, email, password }; users.push(actor);
    sql(`insert into public.profiles(id, username, nickname, synthetic_email)
      values (${q(actor.id)},${q(`qasa2_${token}_${name}`)},${q(`sa2 ${name}`)},${q(email)});`);
    const client = createClient(apiUrl, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password }); assert.equal(signed.error, null);
    Object.assign(actor, { client, session: signed.data.session });
  }
  // Exercise the existing target helper against the actual local schema and ACL.
  sql(`insert into public.target_candidates(title,difficulty,evaluated_by,recommended,summary) values(${q(TARGET.title)},'easy',${q(`release-${token}`)},true,'Release fixture');`);
  try {
    globalThis.releaseTargetClient=users[0].client;
    const targetSource=fs.readFileSync('services/targetService.js','utf8').replace(/^import[^\n]+\n/,'const supabase = globalThis.releaseTargetClient; const isSupabaseConfigured = true;\n');
    const {fetchRandomAiTarget}=await import(`data:text/javascript;base64,${Buffer.from(targetSource).toString('base64')}`);
    assert.equal((await fetchRandomAiTarget({difficulty:'easy'})).title,TARGET.title);
    pass('target helper: authenticated candidate read uses existing schema columns');
  } finally {
    delete globalThis.releaseTargetClient;
    sql(`delete from public.target_candidates where title=${q(TARGET.title)} and evaluated_by=${q(`release-${token}`)};`);
  }
  Object.assign(process.env, { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: config.ANON_KEY, VITE_MAINTENANCE: 'false' });
  server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const host = await makeContext(users[0], 'host');
  const guest = await makeContext(users[1], 'guest');
  const base = 'http://127.0.0.1:5187';

  for (const mode of groupOnly || singleOnly ? [] : ['a3']) {
    assert.ok(hasHelper(), 'actual SF-A3 migration must be applied');
    assert.ok(policyQual().includes('can_view_room_player_v1'), 'actual SF-A3 policy required');
    const room = await rpc(users[0].client, 'create_duel_room_v2', { p_use_items: false }); rooms.push(room.id);
    await host.goto(`${base}/multiplayer/room/${room.id}`);
    await guest.goto(`${base}/multiplayer/room/${room.id}`);
    await host.locator('.room-target-input').fill('목표');
    await host.getByRole('button', { name: '검색', exact: true }).click();
    await host.locator('.search-item').filter({ hasText: TARGET.title }).click();
    await expect(host.getByRole('status')).toHaveCount(0);
    await expect(host.locator('.room-target-section').first()).toContainText(TARGET.title);
    await expect(guest.getByText(`방장이 고른 목표: ${TARGET.title}`).first()).toBeVisible({timeout:15000});
    await host.getByRole('button', { name: '게임 시작', exact: true }).click();
    await Promise.all([host.waitForURL('**/multiplayer/game/**'), guest.waitForURL('**/multiplayer/game/**')]);
    await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    pass(`${mode}: both players reach playing through the RPC read`);
    // Waiting-room reads are unmasked on purpose; from here on the room is playing.
    playerReads.length = 0;

    if (mode === 'a3') {
      const visible = await users[1].client.from('room_players').select('user_id, path_titles').eq('room_id', room.id);
      assert.equal(visible.error, null);
      assert.deepEqual(visible.data.map((row) => row.user_id), [users[1].id]);
      pass('a3: the table read during play returns my own row only');
    }

    for (const [i,actor] of users.entries()) {
      const read=await actor.client.from('room_players').select('*').eq('room_id',room.id);
      assert.equal(read.error,null);assert.deepEqual(read.data.map(p=>p.user_id),[actor.id]);
      await subscribeActor(actor,room.id,i===0?'host':'guest');
    }
    pass('A3: host and guest direct SELECT both show only their own row');
    await mobileCheck(host,'duel-game');
    // Host moves start -> middle. The guest's panel must follow without a table read.
    progressFrames.length = 0;
    const movedAt = Date.now();
    await host.locator('.article-content a').filter({ hasText: MIDDLE.title }).click();
    await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중');
    await expect(opponentBox(guest, '현재 문서')).toHaveText(MIDDLE.title, { timeout: 15000 });
    await expect(opponentBox(guest, '이동 횟수')).toHaveText('1회');
    pass(`${mode}: the guest panel shows the host's current document and move count`);
    const signal = progressFrames.find(({ label, at }) => label === 'guest' && at >= movedAt);
    assert.ok(signal, 'the guest received the duel_progress signal over realtime');
    assert.ok(signal.at - movedAt < 5000, `signal took ${signal.at - movedAt}ms`);
    pass(`${mode}: the guest received the host's duel_progress signal (${signal.at - movedAt}ms)`);

    const leaked = playerReads.filter(({ label, rows }) => label === 'guest' && Array.isArray(rows)
      && rows.some((row) => row.user_id === users[0].id && PATH_KEYS.some((key) => key in row)));
    assert.equal((await roomRows(room.id)).room.status, 'playing');
    assert.ok(playerReads.some(({ label }) => label === 'guest'), 'the guest re-read players during play');
    assert.equal(leaked.length, 0, 'guest RPC reads during play carried the host path');
    pass(`${mode}: no guest player read carried the host path while playing`);

    await guest.locator('.article-content a').filter({hasText:MIDDLE.title}).click();
    await expect(opponentBox(host,'이동 횟수')).toHaveText('1회');
    await expect.poll(()=>rawFrames.filter(f=>f.label==='host'&&f.row.user_id===users[0].id).length).toBeGreaterThan(0);
    await expect.poll(()=>rawFrames.filter(f=>f.label==='guest'&&f.row.user_id===users[1].id).length).toBeGreaterThan(0);
    await expect.poll(()=>publicFrames.filter(f=>f.label==='host'&&f.row.event_type==='duel_progress').length).toBeGreaterThan(0);
    await expect.poll(()=>publicFrames.filter(f=>f.label==='guest'&&f.row.event_type==='duel_progress').length).toBeGreaterThan(0);
    await new Promise(resolve=>setTimeout(resolve,1500));
    assert.equal(rawFrames.filter(f=>f.row.user_id!==(f.label==='host'?users[0].id:users[1].id)).length,0);
    assert.ok(publicFrames.every(f=>!JSON.stringify(f.row).includes('path_titles')&&!JSON.stringify(f.row).includes('path_page_ids')));
    pass('A3: real Realtime own-row positive controls received by both; opponent private payload absent; public progress received by both');
    // Recovery: the guest reloads mid-match. With the A3 policy, a table-based read would end in OPPONENT_LEFT.
    await guest.reload();
    await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    await expect(opponentBox(guest, '현재 문서')).toHaveText(MIDDLE.title);
    pass(`${mode}: guest F5 mid-match recovers with the opponent shown`);

    // Host finishes; the result reveals and the path is readable again.
    await host.locator('.article-content a').filter({ hasText: TARGET.title }).click();
    await expect(host.locator('#wr-duel-result-title')).toContainText('승리');
    await expect(guest.locator('#wr-duel-result-title')).toContainText('패배');
    const finishedRead = await users[1].client.rpc('get_duel_room_players_v1', { p_room_id: room.id });
    assert.equal(finishedRead.error, null);
    const hostRow = finishedRead.data.find((row) => row.user_id === users[0].id);
    assert.deepEqual(hostRow.path_titles, [START.title, MIDDLE.title, TARGET.title]);
    pass(`${mode}: after the finish both results show and the host path is revealed`);
    for(const actor of users){const read=await actor.client.from('room_players').select('user_id,path_titles').eq('room_id',room.id);assert.equal(read.error,null);assert.equal(read.data.length,2);assert.deepEqual(read.data.find(r=>r.user_id===users[0].id).path_titles,[START.title,MIDDLE.title,TARGET.title]);}
    pass('A3: after finish both direct SELECT and masked RPC reveal opponent path');
    await expect(host.getByTestId('result-xp')).toContainText('XP',{timeout:15000});
    const duration=Number(sql(`select duration_seconds from public.match_history where room_id=${q(room.id)};`));
    await expect(host.locator('[data-testid="duel-result"] .wr-rstats')).toContainText(mmss(duration));
    const before=ledgerSnapshot();
    await host.reload();await guest.reload();
    await expect(host.locator('#wr-duel-result-title')).toContainText('승리',{timeout:15000});
    await expect(guest.locator('#wr-duel-result-title')).toContainText('패배',{timeout:15000});
    await expect(host.getByTestId('duel-result')).toContainText(MIDDLE.title);
    await expect(host.locator('[data-testid="duel-result"] .wr-rstats')).toContainText(mmss(duration));
    await expect(host.getByTestId('result-xp')).toContainText('XP');
    assert.equal(ledgerSnapshot(),before,'F5 must not duplicate XP or achievements');
    pass('duel result F5: verdict/path/moves/XP recovered; XP and achievement rows unchanged');
    await mobileCheck(host,'duel-result');
    fs.writeFileSync(artifactDir+'/duel-ledger.json',before);
    await host.screenshot({ path: `${artifactDir}/result-${mode}.png`, fullPage: true });
    await host.goto(`${base}/multiplayer`); await guest.goto(`${base}/multiplayer`);
  }
  assert.deepEqual(tableReads, [], `1:1 pages read room_players directly: ${tableReads.join(' | ')}`);
  pass('no 1:1 page read room_players directly');

  // An item-enabled match exercises the actual local Edge handler and RPCs.
  if (!groupOnly && !singleOnly) {
  for (const entry of subscriptions.splice(0)) await entry.client.removeChannel(entry.channel);
  const itemRoom = await rpc(users[0].client, 'create_duel_room_v2', { p_use_items: true });
  rooms.push(itemRoom.id);
  await host.goto(`${base}/multiplayer/room/${itemRoom.id}`);
  await guest.goto(`${base}/multiplayer/room/${itemRoom.id}`);
  await host.locator('.room-target-input').fill('목표');
  await host.getByRole('button', { name: '검색', exact: true }).click();
  await host.locator('.search-item').filter({ hasText: TARGET.title }).click();
  await expect(guest.getByText(`방장이 고른 목표: ${TARGET.title}`).first()).toBeVisible({timeout:15000});
  await host.getByRole('button', { name: '게임 시작', exact: true }).click();
  await Promise.all([host.waitForURL('**/multiplayer/game/**'), guest.waitForURL('**/multiplayer/game/**')]);
  await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', {timeout:20000});
  await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', {timeout:20000});
  const joker=JSON.parse(sql(`select row_to_json(g) from public.duel_item_grants g where room_id=${q(itemRoom.id)} and user_id=${q(users[0].id)} and slot_role='joker';`));
  assert.ok(joker,'a joker fixture slot must exist');
  sql(`update public.duel_item_grants set item_id='random_teleport' where id=${q(joker.id)};`);
  await host.reload();
  await expect(host.locator('.duel-item-slot').filter({hasText:'특수:임의 문서'})).toBeEnabled({timeout:15000});
  const edgeResponse=host.waitForResponse(r=>r.url().endsWith('/functions/v1/duel-random-teleport'),{timeout:30000});
  await host.locator('.duel-item-slot').filter({hasText:'특수:임의 문서'}).click();
  const edge=await edgeResponse; const itemResponse=await edge.json();
  fs.writeFileSync(`${artifactDir}/teleport-response.json`,JSON.stringify(itemResponse,null,2));
  assert.equal(edge.status(),200);
  assert.equal(itemResponse.result,'applied',JSON.stringify({ok:itemResponse.ok,code:itemResponse.code}));
  const itemState=JSON.parse(sql(`select to_jsonb(p) from public.room_players p where room_id=${q(itemRoom.id)} and user_id=${q(users[0].id)};`));
  assert.notEqual(itemState.current_page_id,START.pageId);assert.notEqual(itemState.current_page_id,TARGET.pageId);
  assert.equal(itemState.move_count,1);assert.equal(itemState.path_page_ids.length,2);
  assert.equal(sql(`select count(*) from public.duel_item_events where grant_id=${q(joker.id)};`),'1');
  assert.equal(sql(`select consumed_at is not null from public.duel_item_grants where id=${q(joker.id)};`),'t');
  await expect(host.locator('.article-content')).toBeVisible({timeout:30000});
  await expect(host.locator('.article-content')).toContainText(/./);
  await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중',{timeout:30000});
  pass('random_teleport: actual local Edge selects canonical unrelated document; DB move/path/count/consumption and browser rendering succeed');
  await host.screenshot({path:`${artifactDir}/teleport-desktop.png`,fullPage:true});
  const retired=await rpc(users[1].client,'leave_duel_room_v2',{p_room_id:itemRoom.id,p_request_id:randomUUID()});
  assert.equal(retired.ok,true);
  await expect(guest.locator('#wr-duel-result-title')).toContainText('패배',{timeout:15000});
  await guest.reload();await expect(guest.locator('#wr-duel-result-title')).toContainText('패배',{timeout:15000});
  pass('duel: forfeit result and retired-player F5 restore');
  }

  if (singleOnly) {
    dailyOriginal=JSON.parse(sql(`select coalesce((select to_jsonb(c) from public.daily_challenges c where challenge_date=(now() at time zone 'Asia/Seoul')::date),'null'::jsonb);`));
    if(dailyOriginal?.hint==='Release fixture' && dailyOriginal.target_title.startsWith('sa2-')) dailyOriginal=null;
    dailyChanged=true;
    sql(`delete from public.daily_challenges where challenge_date=(now() at time zone 'Asia/Seoul')::date;
      insert into public.daily_challenges(challenge_date,target_title,hint) values((now() at time zone 'Asia/Seoul')::date,${q(TARGET.title)},'Release fixture');`);
    dailyChanged=true;
    const measurements=[];
    for(const [mode,expected] of [['custom',15],['custom',0],['random',20],['daily',25],['daily',0]]) {
      singleRandomFixture=mode==='random';randomPickCount=0;
      await host.goto(`${base}/lobby`);
      if(mode==='daily') {
        await expect(host.locator('.daily-keyword')).toHaveText(TARGET.title,{timeout:15000});
        await host.locator('.daily-btn').click();
      } else {
        await host.getByRole('button',{name:/혼자서 플레이/}).click();
        await host.locator('.qs-modal-input').fill(mode==='random'?'랜덤':'목표');
        if(mode==='custom') {
          await host.locator('.qs-modal').getByRole('button',{name:'검색',exact:true}).click();
          await host.locator('.search-item').filter({hasText:TARGET.title}).click();
        }
        await host.locator('.qs-modal-actions .app-btn-primary').click();
      }
      await host.waitForURL('**/game');
      await host.locator('.article-content a').filter({hasText:TARGET.title}).first().click({timeout:30000});
      await expect(host.getByTestId('result-xp')).toBeVisible({timeout:20000});
      const row=JSON.parse(sql(`select jsonb_build_object('record',to_jsonb(g),'xp',(select coalesce(sum(amount),0) from public.xp_ledger l where l.source_id=g.id and l.xp_class='gameplay')) from public.game_records g where g.user_id=${q(users[0].id)} order by g.created_at desc,g.id desc limit 1;`));
      assert.equal(row.record.run_mode,mode);assert.equal(Number(row.xp),expected);
      if(expected>0) await expect(host.getByTestId('result-xp')).toContainText(`+${expected} XP`);
      measurements.push({mode,expected,actual:Number(row.xp),recordId:row.record.id});
      pass(`single ${mode}: browser finish and DB run_mode/gameplay XP ${expected}`);
      await host.screenshot({path:`${artifactDir}/single-${mode}-${expected}.png`,fullPage:true});
    }
    fs.writeFileSync(`${artifactDir}/single-measurements.json`,JSON.stringify(measurements,null,2));
  }

  // Minimum three-player group: two browser contexts and one authenticated RPC actor.
  if (!singleOnly) {
  groupFixture=true;
  const email=`release-${token}-third@local.test`,password=randomUUID();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);
  const third={id:created.data.user.id,email,password};users.push(third);
  sql(`insert into public.profiles(id,username,nickname,synthetic_email) values(${q(third.id)},${q(`release_${token}_third`)},'Release third',${q(email)});`);
  third.client=createClient(apiUrl,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await third.client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);third.session=signed.data.session;
  for(const from of pages) for(const to of pages.filter(p=>p!==from)) sql(`insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal) values(${q(from.snapshotId)},${q(to.pageId)},${q(to.revisionId)},${q(to.title)},${q(to.title)},(select coalesce(max(ordinal),-1)+1 from public.wiki_snapshot_links where snapshot_id=${q(from.snapshotId)})) on conflict(snapshot_id,target_page_id) do nothing;`);
  const group=await rpc(users[0].client,'create_group_room',{p_max_players:3,p_min_players:3,p_finish_rank_limit:3});rooms.push(group.id);
  for(const actor of users.slice(1)) await rpc(actor.client,'join_group_room',{p_room_id:group.id});
  for(const [i,actor] of users.entries()){
    const target=pages[i];await rpc(actor.client,'submit_group_target_v2',{p_room_id:group.id,p_submitted_keyword:target.title,p_submitted_target_title:target.title,p_submitted_target_page_id:target.pageId,p_submitted_target_revision_id:target.revisionId});
    await rpc(actor.client,'set_group_ready',{p_room_id:group.id,p_is_ready:true});
  }
  await rpc(users[0].client,'start_group_room_game_v2',{p_room_id:group.id});
  await rpc(users[0].client,'activate_group_room_game',{p_room_id:group.id});
  const playing=(await roomRows(group.id)).room;
  assert.equal(playing.status,'playing');
  const groupTarget=pages.find(p=>p.pageId===playing.group_target_page_id);assert.ok(groupTarget);
  await host.goto(`${base}/multiplayer/group/game/${group.id}`);await guest.goto(`${base}/multiplayer/group/game/${group.id}`);
  await expect(host.locator('.article-content')).toBeVisible({timeout:20000});
  const groupRead=await users[0].client.from('room_players').select('user_id').eq('room_id',group.id);assert.equal(groupRead.error,null);assert.equal(groupRead.data.length,3);
  pass('group: room/join/ready/start via actual RPC; A3 retains all three group rows');
  await host.locator('.article-content a').filter({hasText:groupTarget.title}).first().click();
  await expect(host.getByText('1위',{exact:true})).toBeVisible({timeout:20000});
  assert.equal((await roomRows(group.id)).room.status,'playing');
  pass('group: personal finish shows rank while remaining race continues');
  await guest.locator('.article-content a').filter({hasText:groupTarget.title}).first().click();
  const thirdRow=(await roomRows(group.id)).players.find(p=>p.user_id===third.id);
  const thirdFinish=await rpc(third.client,'apply_group_move_v2',{p_room_id:group.id,p_request_id:randomUUID(),p_correlation_id:null,p_expected_version:thirdRow.progress_version,p_to_page_id:groupTarget.pageId});assert.equal(thirdFinish.ok,true);
  await expect(host.getByTestId('group-final-result')).toBeVisible({timeout:20000});
  await expect(host.locator('#wr-group-result-title')).toHaveText('1위 완주');
  await expect(host.getByTestId('result-xp')).toContainText('XP');
  const groupLedger=ledgerSnapshot();
  await host.reload();await expect(host.getByTestId('group-final-result')).toBeVisible({timeout:20000});
  await expect(host.locator('#wr-group-result-title')).toHaveText('1위 완주');
  await expect(host.locator('.wr-srow.is-me .wr-srow-rank')).toContainText('1');
  await expect(host.getByTestId('result-xp')).toContainText('XP');
  assert.equal(ledgerSnapshot(),groupLedger,'group result F5 must preserve XP and achievement rows');
  fs.writeFileSync(`${artifactDir}/group-ledger.json`,groupLedger);
  await host.setViewportSize({width:390,height:844});
  assert.ok(await host.evaluate(()=>Math.max(document.documentElement.scrollWidth-document.documentElement.clientWidth,...[...document.querySelectorAll('.wr-result,.wr-result-card')].map(n=>n.scrollWidth-n.clientWidth)))<=1,'group mobile overflow');
  const leave=host.getByRole('button',{name:'그룹 로비로',exact:true});await leave.scrollIntoViewIfNeeded();await expect(leave).toBeVisible();
  await host.screenshot({path:`${artifactDir}/group-result-390.png`,fullPage:true});
  pass('group: final result XP/achievement, F5 no duplicate grants, mobile 390px result and primary action usable');
  }
  assert.deepEqual(errors, []); pass('browser page errors: zero');
  completed = true;
} finally {
  assert.equal(policyQual(),originalQual,'the real A3 policy was preserved');
  for(const s of subscriptions) await s.client.removeChannel(s.channel);
  for (const context of contexts) await context.close();
  await browser?.close(); await server?.close();
  if (dailyChanged) {
    sql(`delete from public.target_candidates where title=${q(TARGET.title)} and evaluated_by='release-local';
      delete from public.daily_challenges where challenge_date=(now() at time zone 'Asia/Seoul')::date;`);
    if(dailyOriginal) sql(`insert into public.daily_challenges select * from jsonb_populate_record(null::public.daily_challenges,${q(JSON.stringify(dailyOriginal))}::jsonb);`);
  }
  if (rooms.length) sql(`delete from private.duel_random_destinations_v1 where room_id in (${rooms.map(q).join(',')}); delete from public.game_rooms where id in (${rooms.map(q).join(',')});`);
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id); assert.equal(result.error, null, result.error?.message);
  }
  sql(`delete from public.wiki_pages where page_id in (${pages.map((p) => q(p.pageId)).join(',')});`);
  assert.equal(policyQual(), originalQual);
  assert.equal(Number(sql(`select count(*) from auth.users where id in (${[...users.map((u) => u.id), randomUUID()].map(q).join(',')});`)), 0);
  pass('cleanup: policy preserved; rooms/accounts/pages removed; sessions/keys never saved');
  fs.writeFileSync(`${artifactDir}/${singleOnly ? 'single-summary' : groupOnly ? 'group-summary' : 'summary'}.json`, JSON.stringify({ date: '2026-10-06', base: 'e4fb483 + uncommitted tree', completed, checks, errors }, null, 2));
  console.log(`Release UI ${completed ? 'PASS' : 'INCOMPLETE'}: ${checks.length} checks`);
}
