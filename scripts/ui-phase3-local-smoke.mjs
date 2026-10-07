// Phase 3 RACE + Group Spectator smoke against the REAL local Supabase stack (Auth, RPC, RLS,
// triggers, Realtime). Same conventions as ui-phase2-local-smoke / release-validation-local-smoke:
// fixture articles are seeded into the local wiki snapshot tables (with a full link graph so the
// server's link validation passes) and only Wikipedia + the wiki-snapshot Edge call for those
// seeded pages are answered in-browser (Wikipedia is not reachable offline). Runs, rooms, moves,
// finishes, grace, item grants and spectator state go through the actual local backend.
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
const pages = ['출발', '중간', '목표', '여분'].map((name, i) => ({
  title: `p3-${token}-${name}`, pageId: `p3-${token}-${i}`, revisionId: `${300 + i}`, snapshotId: randomUUID(),
}));
const [START, MIDDLE, TARGET] = pages;
const base = 'http://127.0.0.1:5190';
const artifactDir = 'test-results/packet13-b1/ui-phase3-local';
fs.mkdirSync(artifactDir, { recursive: true });

const users = [], rooms = [], runs = [], contexts = [], checks = [], pageErrors = [], consoleErrors = [], apiErrors = [];
const admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server, completed = false;
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error, null, `${name}: ${result.error?.message}`);
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
const roomRow = (id) => JSON.parse(sql(`select coalesce(to_jsonb(r), 'null'::jsonb) from public.game_rooms r where id=${q(id)};`) || 'null');
const playerRows = (id) => JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(p) order by created_at), '[]'::jsonb) from public.room_players p where room_id=${q(id)};`));
const byTitle = (title) => pages.find((p) => p.title === title);
const htmlOf = (page) => `<div class="mw-parser-output"><p><b>${page.title}</b> 로컬 Phase 3 검증 문서. ${pages.filter((p) => p !== page).map((p) => `<a href="/wiki/${encodeURIComponent(p.title)}">${p.title}</a>`).join(', ')}.</p><h2>개요</h2><p>${'검증 문단. '.repeat(30)}</p></div>`;

async function wikiRoute(route) {
  const url = new URL(route.request().url());
  let data;
  if (url.pathname.includes('/summary/')) {
    const page = byTitle(decodeURIComponent(url.pathname.split('/summary/')[1]));
    if (!page) return route.abort();
    data = { title: page.title, pageid: page.pageId, revision: page.revisionId, extract: 'Phase 3 로컬 검증 문서' };
  } else if (url.searchParams.get('list') === 'search') {
    data = { query: { search: [{ title: TARGET.title, snippet: '목표 후보' }] } };
  } else if (url.searchParams.get('list') === 'random') {
    data = { query: { random: [{ title: START.title }] } };
  } else {
    const page = byTitle(url.searchParams.get('page') || url.searchParams.get('titles'));
    if (!page) return route.abort();
    data = url.searchParams.get('action') === 'parse'
      ? { parse: { title: page.title, pageid: page.pageId, revid: page.revisionId, text: { '*': htmlOf(page) } } }
      : { query: { pages: { 1: { title: page.title, pageid: page.pageId, links: pages.filter((p) => p !== page).map((p) => ({ title: p.title, ns: 0 })) } } } };
  }
  await route.fulfill({ json: data });
}

async function makeContext(actor, label, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  const storageKey = `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({ storageKey, session }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey, session: actor.session });
  await context.route('https://ko.wikipedia.org/**', wikiRoute);
  await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|pagead2\.googlesyndication\.com)\//, (route) => route.fulfill({ status: 200, body: '' }));
  await context.route(`${apiUrl}/functions/v1/wiki-snapshot`, async (route) => {
    const input = route.request().postDataJSON();
    const page = byTitle(input.title);
    if (!page) { await route.continue(); return; }
    await route.fulfill({ json: { snapshotId: page.snapshotId, pageId: page.pageId, revisionId: page.revisionId, canonicalTitle: page.title, ...(input.includeDocument ? { documentHtml: htmlOf(page), links: pages.filter((p) => p !== page).map((p) => ({ ns: 0, title: p.title })) } : {}) } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${label}: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`${label}: ${msg.text()}`); });
  page.on('response', async (response) => {
    if (!response.url().startsWith(apiUrl) || response.status() < 400) return;
    let body = ''; try { body = (await response.text()).slice(0, 300); } catch { /* navigation */ }
    apiErrors.push(`${label} ${response.status()} ${new URL(response.url()).pathname} ${body}`);
  });
  return page;
}
async function createActor(name) {
  const email = `p3-${token}-${name}@local.test`, password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname: `p3 ${name}` } });
  assert.equal(created.error, null);
  const actor = { id: created.data.user.id, name, email };
  users.push(actor);
  sql(`insert into public.profiles(id, username, nickname, synthetic_email) values (${q(actor.id)},${q(`qap3_${token}_${name}`)},${q(`p3 ${name}`)},${q(email)});`);
  const client = createClient(apiUrl, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null);
  await new Promise((r) => setTimeout(r, 1200)); // local JWT iat-in-future edge (see Phase 2 smoke)
  return Object.assign(actor, { client, session: signed.data.session });
}
const linkTo = (page, title) => page.locator('.article-content a[data-wiki-title]').filter({ hasText: title }).first();

try {
  sql(`insert into public.wiki_pages(page_id, canonical_title) values ${pages.map((p) => `(${q(p.pageId)},${q(p.title)})`).join(',')};
    insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values ${pages.map((p) => `(${q(p.snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)})`).join(',')};`);
  for (const from of pages) for (const [i, to] of pages.filter((p) => p !== from).entries()) {
    sql(`insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal) values (${q(from.snapshotId)},${q(to.pageId)},${q(to.revisionId)},${q(to.title)},${q(to.title)},${i});`);
  }
  const actors = [];
  for (const name of ['host', 'guest', 'third', 'fourth']) actors.push(await createActor(name));
  const [A, B, C, D] = actors;

  Object.assign(process.env, { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: config.ANON_KEY, VITE_MAINTENANCE: 'false' });
  server = await createServer({ server: { host: '127.0.0.1', port: 5190, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });

  // ══ SINGLE (authenticated, custom target) ══════════════════════
  {
    const page = await makeContext(A, 'single');
    await page.goto(`${base}/play`);
    await page.locator('.wr-mode').first().click();
    await page.getByPlaceholder('예: 아인슈타인, 조선왕조...').fill('목표');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(TARGET.title) }).first().click();
    await page.getByRole('button', { name: `'${TARGET.title}' 시작` }).click();
    await expect(page.locator('.wr-hud-doc--current')).toContainText(START.title, { timeout: 30000 });
    await page.locator('.countdown-overlay').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const runId = sql(`select id from public.single_game_runs where user_id=${q(A.id)} order by created_at desc limit 1;`);
    runs.push(runId);
    assert.ok(runId, 'server single run created');
    pass('S1 single race shell over a real server run (create_single_game_run)');
    await linkTo(page, MIDDLE.title).click();
    await expect(page.locator('.wr-hud-doc--current')).toContainText(MIDDLE.title, { timeout: 15000 });
    assert.equal(Number(sql(`select move_count from public.single_game_runs where id=${q(runId)};`)), 1);
    pass('S2 single movement via apply_single_move_v2 (server move_count 1, HUD updated)');
    await page.screenshot({ path: `${artifactDir}/single-desktop.png` });
    await linkTo(page, TARGET.title).click();
    await page.getByTestId('single-result').waitFor({ timeout: 20000 }); // Phase 4 result (was "Mission Accomplished!")
    assert.equal(sql(`select status from public.single_game_runs where id=${q(runId)};`), 'completed');
    pass('S3 single finish → server status completed → existing SuccessOverlay');
  }

  // ══ DUEL (two accounts, item mode) ════════════════════════════
  {
    const room = await rpc(A.client, 'create_duel_room_v2', { p_use_items: true }); rooms.push(room.id);
    await rpc(B.client, 'join_duel_room_v2', { p_room_code: room.room_code });
    await rpc(A.client, 'set_duel_target_v2', { p_room_id: room.id, p_target_title: TARGET.title, p_target_page_id: TARGET.pageId, p_target_revision_id: TARGET.revisionId, p_is_ready: false });
    await rpc(A.client, 'start_duel_room_v2', { p_room_id: room.id, p_start_title: START.title, p_start_page_id: START.pageId, p_start_revision_id: START.revisionId });
    const host = await makeContext(A, 'duel-host');
    const guest = await makeContext(B, 'duel-guest');
    await Promise.all([host.goto(`${base}/multiplayer/game/${room.id}`), guest.goto(`${base}/multiplayer/game/${room.id}`)]);
    try {
      await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 40000 });
      await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 40000 });
    } catch (error) {
      const flat = async (p) => (await p.locator('body').innerText()).slice(0, 400).split('\n').join(' | ');
      console.log('DUEL-DIAG host:', await flat(host));
      console.log('DUEL-DIAG guest:', await flat(guest));
      console.log('DUEL-DIAG room:', JSON.stringify(roomRow(room.id)).slice(0, 600));
      console.log('DUEL-DIAG players:', JSON.stringify(playerRows(room.id).map((p) => ({ u: p.user_id === A.id ? 'host' : 'guest', s: p.player_status, st: p.start_title, cur: p.current_title, sp: p.start_page_id, cp: p.current_page_id }))));
      throw error;
    }
    assert.equal(roomRow(room.id).status, 'playing');
    pass('D1 both duel players reach the race shell (status playing)');
    await expect(host.locator('.wr-race-dock .duel-item-slot')).toHaveCount(5, { timeout: 20000 });
    const grants = Number(sql(`select count(*) from public.duel_item_grants where room_id=${q(room.id)} and user_id=${q(A.id)};`));
    pass(`D2 item dock renders the real server grant (${grants} grant rows → 5-slot tray)`);
    await linkTo(host, MIDDLE.title).click();
    await expect(host.locator('.wr-hud-doc--current')).toContainText(MIDDLE.title, { timeout: 15000 });
    await expect(guest.locator('.mp-opponent-box').filter({ hasText: '현재 문서' }).locator('.mp-opponent-value')).toHaveText(MIDDLE.title, { timeout: 20000 });
    await expect(guest.locator('.mp-opponent-box').filter({ hasText: '이동 횟수' }).locator('.mp-opponent-value')).toHaveText('1회');
    pass('D3 host move via apply_duel_move_v2 reaches guest opponent strip through Realtime');
    const linkIndexSlot = host.getByRole('button', { name: /링크만 보기 · 사용 가능/ });
    if (await linkIndexSlot.count()) {
      await linkIndexSlot.click();
      const overlay = host.getByRole('dialog', { name: '링크만 보기' });
      await overlay.waitFor({ timeout: 15000 });
      assert.ok(await overlay.locator('.duel-item-index__word').count() >= 2);
      await host.screenshot({ path: `${artifactDir}/duel-link-index.png` });
      await host.keyboard.press('Escape');
      pass('D4 link_index granted → use_duel_item_v3 applied → Link Index overlay of current links');
    } else {
      pass('D4 link_index not in this random grant — item dock still rendered from server state (overlay covered by fixture suite)');
    }
    await host.screenshot({ path: `${artifactDir}/duel-host.png` });
    await linkTo(guest, TARGET.title).click();
    await guest.getByTestId('duel-result').waitFor({ timeout: 20000 }); // Phase 4 result (was .mp-result-card)
    await host.getByTestId('duel-result').waitFor({ timeout: 20000 });
    assert.equal(roomRow(room.id).status, 'finished');
    pass('D5 guest finishes → both transition to the existing result overlay (room finished)');
  }

  // ══ GROUP (four accounts: three finish → grace, spectator) ═══════
  {
    const room = await rpc(A.client, 'create_group_room', { p_max_players: 6, p_min_players: 3, p_finish_rank_limit: 3 }); rooms.push(room.id);
    for (const actor of [B, C, D]) await rpc(actor.client, 'join_group_room', { p_room_id: room.id });
    for (const [actor, page] of [[A, START], [B, TARGET], [C, START], [D, TARGET]]) {
      await rpc(actor.client, 'submit_group_target_v2', { p_room_id: room.id, p_submitted_keyword: page.title, p_submitted_target_title: page.title, p_submitted_target_page_id: page.pageId, p_submitted_target_revision_id: page.revisionId });
      await rpc(actor.client, 'set_group_ready', { p_room_id: room.id, p_is_ready: true });
    }
    await rpc(A.client, 'start_group_room_game_v2', { p_room_id: room.id });
    await rpc(A.client, 'activate_group_room_game', { p_room_id: room.id });
    const live = roomRow(room.id);
    assert.equal(live.status, 'playing');
    const goal = byTitle(live.group_target_title);
    assert.ok(goal, 'group target is a seeded page');
    const [pa, pb, pc, pd] = [await makeContext(A, 'g-host'), await makeContext(B, 'g-guest'), await makeContext(C, 'g-third'), await makeContext(D, 'g-fourth')];
    for (const p of [pa, pb, pc, pd]) await p.goto(`${base}/multiplayer/group/game/${room.id}`);
    for (const p of [pa, pb, pc, pd]) await expect(p.locator('.wr-race-side .wr-prow')).toHaveCount(4, { timeout: 30000 });
    assert.equal(await pa.locator('.duel-item-slot, .item-panel').count(), 0);
    await expect(pa.locator('.wr-race-hud .wr-hud-timer')).toContainText('남은 시간');
    pass('G1 four real participants in the group race shell (no items, 남은 시간 from server deadline)');
    await pa.screenshot({ path: `${artifactDir}/group-desktop.png` });

    await linkTo(pa, goal.title).click();
    await pa.locator('.wr-result-a').waitFor({ timeout: 20000 });
    await expect(pd.locator('.wr-race-side')).toContainText('1위', { timeout: 20000 });
    pass('G2 first finisher → Result A; other participants see 1위 via Realtime');
    assert.equal(await pa.locator('.wr-race-tabs').count(), 0);
    await pa.getByRole('button', { name: '관전하기 →' }).click();
    await pa.locator('.wr-race-tabs').waitFor({ timeout: 15000 });
    await expect(pa.locator('.article-content')).toBeVisible({ timeout: 20000 });
    await expect(pa.locator('.wr-hud-watch')).toContainText('관전 중');
    pass('G3 completed player enters spectator only after 관전하기 → watched player real article (read-only)');
    await pa.screenshot({ path: `${artifactDir}/spectator-desktop.png` });

    await linkTo(pb, goal.title).click();
    await pb.locator('.wr-result-a').waitFor({ timeout: 20000 });
    await linkTo(pc, goal.title).click();
    await pc.locator('.wr-result-a').waitFor({ timeout: 20000 });
    await expect.poll(() => roomRow(room.id).status, { timeout: 15000 }).toBe('grace_period');
    const grace = roomRow(room.id);
    await expect(pd.locator('.wr-race-hud .wr-hud-timer')).toContainText('마감까지', { timeout: 20000 });
    const shown = await pd.locator('.wr-race-hud .wr-hud-timer .wr-hud-stat-value').innerText();
    const [m, s] = shown.split(':').map(Number);
    const expected = Math.floor((Math.min(Date.parse(grace.grace_ends_at), Date.parse(grace.game_deadline_at)) - Date.now()) / 1000);
    assert.ok(m * 60 + s <= 120 && Math.abs(m * 60 + s - expected) <= 5, `grace shown ${shown} vs expected ~${expected}s`);
    pass(`G4 three finishers → server grace_period → remaining player HUD '마감까지 ${shown}' = min(20분, 3위+2분) (not a fresh 2:00 restart)`);
    await pd.screenshot({ path: `${artifactDir}/group-grace.png` });
    await expect(pa.locator('.wr-race-tabs-end')).toContainText('3위 완주', { timeout: 20000 });
    pass('G5 spectator receives grace state via Realtime (gold grace notice)');
    await pa.getByRole('button', { name: /반응 보내기: 응원/ }).click();
    await expect(pa.locator('.wr-reaction-note')).toContainText('초 후 다시', { timeout: 10000 });
    assert.ok(Number(sql(`select count(*) from public.room_events where room_id=${q(room.id)} and event_type='group_spectator_emoji';`)) >= 1);
    pass('G6 spectator reaction via send_group_spectator_emoji_v13 (room_events row) + 3s cooldown display');
    await pa.setViewportSize({ width: 390, height: 844 });
    assert.ok(await pa.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await pa.screenshot({ path: `${artifactDir}/spectator-390.png` });
    pass('G7 spectator 390px no horizontal overflow');
  }

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
  assert.equal(Number(sql(`select count(*) from auth.users where email like ${q(`p3-${token}-%`)};`)), 0);
  fs.writeFileSync(`${artifactDir}/summary.json`, JSON.stringify({ date: '2026-10-07', base: '321ea27 + uncommitted Phase 3 tree', backend: apiUrl, completed, checks, pageErrors, consoleErrors, apiErrors }, null, 2));
  console.log(`Phase 3 local smoke ${completed ? 'PASS' : 'INCOMPLETE'}: ${checks.length} checks · console errors ${consoleErrors.length} · API errors ${apiErrors.length}`);
}
