// Phase 2 lobby smoke against the REAL local Supabase stack (Auth, RPC, RLS, Realtime).
// Same conventions as release-validation-local-smoke.mjs: fixture articles are seeded into the
// local wiki snapshot tables and only Wikipedia + the wiki-snapshot Edge call for those seeded
// pages are answered in-browser (Wikipedia is not reachable offline). Every room, membership,
// target, READY, START, leave and host transfer goes through the actual local backend.
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
const pages = ['가람', '나루', '다솜', '라온'].map((name, i) => ({
  title: `p2-${token}-${name}`, pageId: `p2-${token}-${i}`, revisionId: `${200 + i}`, snapshotId: randomUUID(),
}));
const [A, B, C] = pages;
const base = 'http://127.0.0.1:5188';
const artifactDir = 'test-results/packet13-b1/ui-phase2-local';
fs.mkdirSync(artifactDir, { recursive: true });

const users = [], rooms = [], contexts = [], checks = [], pageErrors = [], consoleErrors = [], apiErrors = [], realtimeFrames = [];
const admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server, completed = false, randomPick = 0;
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error, null, result.error?.message);
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
const roomRow = (id) => JSON.parse(sql(`select coalesce(to_jsonb(r), 'null'::jsonb) from public.game_rooms r where id=${q(id)};`) || 'null');
const playerRows = (id) => JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(p) order by created_at), '[]'::jsonb) from public.room_players p where room_id=${q(id)};`));
const roomIdFromUrl = (page) => new URL(page.url()).pathname.split('/').pop();

async function wikiRoute(route) {
  const url = new URL(route.request().url());
  let data;
  if (url.pathname.includes('/summary/')) {
    const title = decodeURIComponent(url.pathname.split('/summary/')[1]);
    const page = pages.find((p) => p.title === title);
    if (!page) return route.abort();
    data = { title, pageid: page.pageId, revision: page.revisionId, extract: 'Phase 2 로컬 검증 문서' };
  } else if (url.searchParams.get('list') === 'search') {
    data = { query: { search: pages.map((p) => ({ title: p.title, snippet: 'Phase 2 후보' })) } };
  } else if (url.searchParams.get('list') === 'random') {
    data = { query: { random: [{ title: pages[3 - (randomPick++ % 2)].title }] } };
  } else {
    const page = pages.find((p) => p.title === (url.searchParams.get('page') || url.searchParams.get('titles')));
    if (!page) return route.abort();
    const links = pages.filter((p) => p !== page);
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
  await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|pagead2\.googlesyndication\.com)\//, (route) => route.fulfill({ status: 200, body: '' }));
  await context.route(`${apiUrl}/functions/v1/wiki-snapshot`, async (route) => {
    const input = route.request().postDataJSON();
    const page = pages.find((p) => p.title === input.title);
    if (!page) { await route.continue(); return; }
    await route.fulfill({ json: { snapshotId: page.snapshotId, pageId: page.pageId, revisionId: page.revisionId, canonicalTitle: page.title } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${label}: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`${label}: ${msg.text()}`); });
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/realtime/v1/')) return;
    socket.on('framereceived', ({ payload }) => {
      const text = String(payload);
      if (/"status":"error"|"system"|phx_error|phx_close/.test(text) && !text.includes('"heartbeat"')) realtimeFrames.push(`${label} ${text.slice(0, 300)}`);
    });
  });
  page.on('response', async (response) => {
    if (!response.url().startsWith(apiUrl) || response.status() < 400) return;
    let body = ''; try { body = (await response.text()).slice(0, 300); } catch { /* navigation */ }
    apiErrors.push(`${label} ${response.status()} ${new URL(response.url()).pathname} ${body}`);
  });
  return page;
}
async function createActor(name) {
  const email = `p2-${token}-${name}@local.test`, password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname: `p2 ${name}` } });
  assert.equal(created.error, null);
  const actor = { id: created.data.user.id, name, email };
  users.push(actor);
  sql(`insert into public.profiles(id, username, nickname, synthetic_email) values (${q(actor.id)},${q(`qap2_${token}_${name}`)},${q(`p2 ${name}`)},${q(email)});`);
  const client = createClient(apiUrl, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null);
  return Object.assign(actor, { client, session: signed.data.session });
}
const mainText = (page) => page.locator('main').innerText();
async function joinByCode(page, mode, code) {
  await page.goto(`${base}/multiplayer?mode=${mode}`);
  await page.locator(".mp-mode-panel input[placeholder='ROOM CODE']").fill(code);
  await page.locator('.mp-mode-panel').getByRole('button', { name: '참가', exact: true }).click();
  await page.waitForURL(mode === 'duel' ? /\/multiplayer\/room\// : /\/multiplayer\/group\/room\//, { timeout: 20000 });
  await page.locator('.wr-room').waitFor();
}
async function groupPickAndReady(page, title) {
  const input = page.locator('.wr-group-mine input');
  await input.fill('p2');
  await input.press('Enter');
  await page.locator('.wr-group-mine .search-item').filter({ hasText: title }).click();
  await page.getByRole('button', { name: 'READY', exact: true }).click();
  await page.locator('.wr-candidate-card.is-locked').waitFor({ timeout: 15000 });
}

try {
  sql(`insert into public.wiki_pages(page_id, canonical_title) values ${pages.map((p) => `(${q(p.pageId)},${q(p.title)})`).join(',')};
    insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values ${pages.map((p) => `(${q(p.snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)})`).join(',')};`);
  for (const from of pages) for (const [i, to] of pages.filter((p) => p !== from).entries()) {
    sql(`insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal) values (${q(from.snapshotId)},${q(to.pageId)},${q(to.revisionId)},${q(to.title)},${q(to.title)},${i});`);
  }
  const [hostActor, guestActor, thirdActor] = [await createActor('host'), await createActor('guest'), await createActor('third')];

  Object.assign(process.env, { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: config.ANON_KEY, VITE_MAINTENANCE: 'false' });
  server = await createServer({ server: { host: '127.0.0.1', port: 5188, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const host = await makeContext(hostActor, 'host');
  const guest = await makeContext(guestActor, 'guest');
  const third = await makeContext(thirdActor, 'third');

  // ══ DUEL ════════════════════════════════════════════════════════
  await host.goto(`${base}/play`);
  await host.locator('.wr-mode').nth(1).click();
  await host.locator('.mp-mode-panel').getByRole('button', { name: '방 생성', exact: true }).click();
  await host.waitForURL(/\/multiplayer\/room\//, { timeout: 20000 });
  const duelId = roomIdFromUrl(host); rooms.push(duelId);
  await host.locator('.wr-duel-stage').waitFor();
  assert.equal(roomRow(duelId).mode, 'duel');
  assert.equal(roomRow(duelId).host_user_id, hostActor.id);
  pass('D1 authenticated host creates duel room through PLAY → entry (create_duel_room_v2)');
  const duelCode = roomRow(duelId).room_code;
  await joinByCode(guest, 'duel', duelCode);
  await expect(host.locator('.wr-lobby-count')).toHaveText('2 / 2', { timeout: 15000 });
  assert.deepEqual(playerRows(duelId).map((p) => p.user_id).sort(), [hostActor.id, guestActor.id].sort());
  pass('D2 second authenticated user joins by real room code; host sees 2/2 via Realtime');
  for (const page of [host, guest]) assert.ok(!/READY|준비 완료/.test(await mainText(page)));
  assert.equal(await host.getByRole('button', { name: 'READY' }).count() + await guest.getByRole('button', { name: 'READY' }).count(), 0);
  pass('D3 no READY on host or guest');
  const hostStart = host.getByRole('button', { name: '게임 시작', exact: true });
  assert.ok(await hostStart.isDisabled());
  await host.locator('.room-target-input').fill('p2');
  await host.locator('.room-target-input').press('Enter');
  await host.locator('.search-item').filter({ hasText: B.title }).click();
  await expect(host.locator('.wr-target-chosen .wr-gold-pill')).toContainText(B.title, { timeout: 15000 });
  assert.equal(playerRows(duelId).find((p) => p.user_id === hostActor.id).target_page_id, B.pageId);
  pass('D4 host search/select persisted by set_duel_target_v2');
  await expect(guest.getByText(`방장이 고른 목표: ${B.title}`).first()).toBeVisible({ timeout: 15000 });
  pass('D5 guest receives selected target through real Realtime refresh');
  await expect(hostStart).toBeEnabled({ timeout: 15000 });
  pass('D6 host START enabled after opponent + target');
  assert.equal(await guest.getByRole('button', { name: '게임 시작' }).count(), 0);
  assert.equal(await guest.locator('.room-target-input').count(), 0);
  pass('D7 guest has no START and no target search');
  await host.screenshot({ path: `${artifactDir}/duel-host-ready-to-start.png`, fullPage: true });
  await guest.screenshot({ path: `${artifactDir}/duel-guest-target.png`, fullPage: true });
  await hostStart.click();
  await Promise.all([host.waitForURL(`**/multiplayer/game/${duelId}`, { timeout: 30000 }), guest.waitForURL(`**/multiplayer/game/${duelId}`, { timeout: 30000 })]);
  pass('D8 host START via start_duel_room_v2');
  await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 30000 });
  await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 30000 });
  const duelPlaying = roomRow(duelId);
  assert.equal(duelPlaying.status, 'playing');
  pass(`D9 both players in the same duel game (${duelId}) status=playing`);

  // D10 waiting-room header navigation performs the real leave RPC
  const navDuel = await rpc(thirdActor.client, 'create_duel_room_v2', { p_use_items: false }); rooms.push(navDuel.id);
  await joinByCode(guest, 'duel', navDuel.room_code);
  assert.ok(playerRows(navDuel.id).some((p) => p.user_id === guestActor.id));
  await guest.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: 'HOME', exact: true }).click();
  await guest.waitForURL(/\/lobby$/, { timeout: 15000 });
  await expect.poll(() => playerRows(navDuel.id).some((p) => p.user_id === guestActor.id), { timeout: 10000 }).toBe(false);
  pass('D10a duel header HOME → leave_duel_room_v2 removed guest membership (room still waiting)');
  const navGroup = await rpc(thirdActor.client, 'create_group_room', { p_max_players: 6, p_min_players: 3, p_finish_rank_limit: 3 }); rooms.push(navGroup.id);
  await joinByCode(guest, 'group', navGroup.room_code);
  assert.ok(playerRows(navGroup.id).some((p) => p.user_id === guestActor.id));
  await guest.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: 'PLAY', exact: true }).click();
  await guest.waitForURL(/\/play$/, { timeout: 15000 });
  await expect.poll(() => playerRows(navGroup.id).some((p) => p.user_id === guestActor.id), { timeout: 10000 }).toBe(false);
  pass('D10b group header PLAY → leave_group_waiting_room removed membership');

  // R loading-screen "← 온라인 플레이로" clicked during the initial direct-entry join.
  // The real join RPC is only held back in the browser so the click provably lands mid-load.
  async function backDuringInitialLoad(page, roomPath, joinRpc, roomId, label) {
    let joinSent = false, joinDone = false;
    const pattern = `**/rest/v1/rpc/${joinRpc}`;
    await page.route(pattern, async (route) => { joinSent = true; await new Promise((r) => setTimeout(r, 2500)); await route.fallback(); joinDone = true; });
    await page.goto(`${base}${roomPath}`);
    const back = page.getByRole('button', { name: '← 온라인 플레이로' });
    await back.waitFor({ timeout: 15000 });
    await expect(page.locator('.wr-lobby-state h1')).toContainText('불러오는 중');
    await expect.poll(() => joinSent, { timeout: 10000 }).toBe(true);
    assert.equal(joinDone, false, `${label}: click must land before the initial join completes`);
    await back.click();
    await page.waitForURL(/\/multiplayer$/, { timeout: 20000 });
    await page.unroute(pattern);
    assert.equal(joinDone, true, `${label}: navigation waited for the in-flight join`);
    await expect.poll(() => playerRows(roomId).some((p) => p.user_id === guestActor.id), { timeout: 10000 }).toBe(false);
    await page.waitForTimeout(4000);
    assert.equal(playerRows(roomId).some((p) => p.user_id === guestActor.id), false, `${label}: late join re-added the user`);
    assert.equal(roomRow(roomId)?.status ?? 'deleted', 'waiting');
    pass(`R ${label}: ← 온라인 플레이로 during initial join → /multiplayer, membership gone, no late re-join`);
  }
  const rDuel = await rpc(thirdActor.client, 'create_duel_room_v2', { p_use_items: false }); rooms.push(rDuel.id);
  await backDuringInitialLoad(guest, `/multiplayer/room/${rDuel.id}`, 'join_duel_room_v2', rDuel.id, 'duel');
  const rGroup = await rpc(thirdActor.client, 'create_group_room', { p_max_players: 6, p_min_players: 3, p_finish_rank_limit: 3 }); rooms.push(rGroup.id);
  await backDuringInitialLoad(guest, `/multiplayer/group/room/${rGroup.id}`, 'join_group_room', rGroup.id, 'group');

  // ══ GROUP ═══════════════════════════════════════════════════════
  await host.goto(`${base}/play`);
  await host.locator('.wr-mode').nth(2).click();
  await host.locator('.mp-mode-panel').getByRole('button', { name: '방 생성', exact: true }).click();
  await host.waitForURL(/\/multiplayer\/group\/room\//, { timeout: 20000 });
  const groupId = roomIdFromUrl(host); rooms.push(groupId);
  await host.locator('.wr-roster').waitFor();
  const groupRoom = roomRow(groupId);
  assert.equal(groupRoom.mode, 'group'); assert.equal(groupRoom.max_players, 6);
  pass('G1 authenticated host creates group room (create_group_room, max_players 6 unchanged)');
  const groupStart = host.getByRole('button', { name: '게임 시작', exact: true });
  await joinByCode(guest, 'group', groupRoom.room_code);
  await expect(host.locator('.wr-roster-row:not(.wr-roster-row--empty)')).toHaveCount(2, { timeout: 15000 });
  assert.ok(await groupStart.isDisabled());
  await expect(host.locator('#wr-group-status')).toContainText('최소 3명');
  pass('G3 two players → START blocked with real reason');
  await joinByCode(third, 'group', groupRoom.room_code);
  await expect(host.locator('.wr-roster-row:not(.wr-roster-row--empty)')).toHaveCount(3, { timeout: 15000 });
  assert.equal(playerRows(groupId).length, 3);
  pass('G2 two more authenticated users joined (3 real memberships)');
  await expect(host.locator('#wr-group-status')).toContainText('준비 중');
  assert.ok(await groupStart.isDisabled());
  pass('G4 not-all-ready blocks START');
  for (const page of [host, guest, third]) await groupPickAndReady(page, A.title);
  const rowsAllA = playerRows(groupId);
  assert.ok(rowsAllA.every((p) => p.is_ready && p.submitted_target_page_id === A.pageId));
  pass('G5 each player selected a candidate; READY submitted it (submit_group_target_v2 + set_group_ready)');
  for (const page of [host, guest, third]) {
    assert.equal(await page.locator('.wr-group-mine input').count(), 0);
    await expect(page.locator('.wr-candidate-card.is-locked')).toContainText(A.title);
  }
  pass('G6 READY locks own candidate UI for all three');
  await expect(host.locator('#wr-group-status')).toContainText('서로 다른 후보', { timeout: 15000 });
  assert.ok(await groupStart.isDisabled());
  await expect(host.locator('.wr-course-count')).toContainText('1');
  pass('G7 all READY with one distinct candidate → START blocked');
  await third.getByRole('button', { name: '준비 취소' }).click();
  await third.getByRole('button', { name: '다시 선택' }).click();
  await groupPickAndReady(third, C.title);
  assert.equal(playerRows(groupId).find((p) => p.user_id === thirdActor.id).submitted_target_page_id, C.pageId);
  await expect(groupStart).toBeEnabled({ timeout: 15000 });
  await expect(host.locator('#wr-group-status')).toContainText('시작할 수 있습니다');
  assert.equal(await guest.getByRole('button', { name: '게임 시작' }).count() + await third.getByRole('button', { name: '게임 시작' }).count(), 0);
  pass('G8 after changing one candidate (unready → reselect → READY): 2 distinct + all READY enables host START; guests have none');
  await host.screenshot({ path: `${artifactDir}/group-host-ready-to-start.png`, fullPage: true });
  await groupStart.click();
  await Promise.all([host, guest, third].map((page) => page.waitForURL(`**/multiplayer/group/game/${groupId}`, { timeout: 30000 })));
  pass('G9 host START via start_group_room_game_v2');
  for (const page of [host, guest, third]) await expect(page.locator('.article-content')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => roomRow(groupId).status, { timeout: 20000 }).toBe('playing');
  const groupPlaying = roomRow(groupId);
  assert.ok([A.pageId, C.pageId].includes(groupPlaying.group_start_page_id) && [A.pageId, C.pageId].includes(groupPlaying.group_target_page_id));
  assert.notEqual(groupPlaying.group_start_page_id, groupPlaying.group_target_page_id);
  pass(`G10 all three in the same group game (${groupId}) status=playing, course from submitted candidates`);

  // ══ HOST SUCCESSION ═════════════════════════════════════════════
  const succ = await rpc(hostActor.client, 'create_group_room', { p_max_players: 6, p_min_players: 3, p_finish_rank_limit: 3 }); rooms.push(succ.id);
  await host.goto(`${base}/multiplayer/group/room/${succ.id}`); await host.locator('.wr-roster').waitFor();
  await guest.goto(`${base}/multiplayer/group/room/${succ.id}`); await guest.locator('.wr-roster').waitFor();
  await third.goto(`${base}/multiplayer/group/room/${succ.id}`); await third.locator('.wr-roster').waitFor();
  await expect(host.locator('.wr-roster-row:not(.wr-roster-row--empty)')).toHaveCount(3, { timeout: 15000 });
  await groupPickAndReady(guest, A.title);
  await groupPickAndReady(third, B.title);
  assert.equal(playerRows(succ.id).length, 3);
  pass('S1 fresh 3-player waiting group room (guest + third READY)');
  await host.getByRole('button', { name: '방 나가기' }).click();
  await host.waitForURL(/\/multiplayer$/, { timeout: 15000 });
  pass('S2 host left via existing 방 나가기 (leave_group_waiting_room)');
  await expect.poll(() => roomRow(succ.id)?.host_user_id, { timeout: 10000 }).toBe(guestActor.id);
  const succRows = playerRows(succ.id);
  assert.equal(succRows.length, 2);
  assert.equal(succRows.find((p) => p.user_id === guestActor.id).role, 'host');
  pass('S3 backend transferred host to earliest remaining player (trigger)');
  await guest.locator('.wr-host-notice').waitFor({ timeout: 15000 });
  await expect(third.locator('.wr-party-host')).toContainText('p2 guest', { timeout: 15000 });
  pass('S4 both remaining UIs received new host_user_id via Realtime (notice + host marker)');
  await expect(guest.getByRole('button', { name: '게임 시작', exact: true })).toHaveCount(1);
  assert.equal(await third.getByRole('button', { name: '게임 시작' }).count(), 0);
  await expect(guest.locator('#wr-group-status')).toContainText('최소 3명');
  pass('S5 new host has host controls (START, correctly blocked at 2 players); other player still none');
  assert.ok(succRows.every((p) => p.is_ready));
  await expect(guest.locator('.wr-candidate-card.is-locked')).toContainText(A.title);
  await expect(third.locator('.wr-candidate-card.is-locked')).toContainText(B.title);
  await expect(guest.locator('.wr-roster .wr-status--teal')).toHaveCount(2);
  pass('S6 remaining room/READY/candidate state preserved in DB and UI');
  await guest.screenshot({ path: `${artifactDir}/succession-new-host.png`, fullPage: true });
  await third.screenshot({ path: `${artifactDir}/succession-other.png`, fullPage: true });

  assert.deepEqual(pageErrors, []);
  pass('browser page errors: zero');
  completed = true;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close(); await server?.close();
  if (rooms.length) sql(`delete from private.duel_random_destinations_v1 where room_id in (${rooms.map(q).join(',')}); delete from public.game_rooms where id in (${rooms.map(q).join(',')});`);
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id); assert.equal(result.error, null, result.error?.message);
  }
  sql(`delete from public.wiki_pages where page_id in (${pages.map((p) => q(p.pageId)).join(',')});`);
  assert.equal(Number(sql(`select count(*) from auth.users where email like ${q(`p2-${token}-%`)};`)), 0);
  assert.equal(Number(sql(`select count(*) from public.game_rooms where id in (${[...rooms, randomUUID()].map(q).join(',')});`)), 0);
  fs.writeFileSync(`${artifactDir}/summary.json`, JSON.stringify({ date: '2026-10-07', base: '62105a3 + uncommitted Phase 2 tree', backend: apiUrl, completed, checks, pageErrors, consoleErrors, apiErrors, realtimeFrames }, null, 2));
  console.log(`Phase 2 local smoke ${completed ? 'PASS' : 'INCOMPLETE'}: ${checks.length} checks · console errors ${consoleErrors.length} · API errors ${apiErrors.length}`);
}
