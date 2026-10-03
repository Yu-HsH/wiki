// SF-A2: real local Auth/RPC/Realtime, deterministic Wikipedia + snapshot transport.
// Two matches: (1) the room_players policy before SF-A3, (2) the SF-A3 policy (opponent row
// hidden while starting/playing). The policy found at the start is restored in finally.
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
const names = ['시작', '중간', '목표'].map((name) => `sa2-${token}-${name}`);
const pages = names.map((title, i) => ({ title, pageId: `sa2-${token}-${i}`, revisionId: `${100 + i}`, snapshotId: randomUUID() }));
const [START, MIDDLE, TARGET] = pages;
const PATH_KEYS = ['path_titles', 'path_page_ids', 'path_revision_ids'];
const POLICY = '"Players can view players in their room"';
// Two policies: before SF-A3 (member-wide) and SF-A3. The real SF-A3 helper is used once
// 20261004110000 is applied; before that an inline copy stands in. Whatever policy the
// database had at the start is put back in finally.
const policyQual = () => sql(`select qual from pg_policies where tablename = 'room_players' and policyname = 'Players can view players in their room';`);
const setPolicy = (using) => sql(`drop policy ${POLICY} on public.room_players;
  create policy ${POLICY} on public.room_players for select to authenticated using (${using});`);
const hasHelper = () => sql(`select to_regprocedure('public.can_view_room_player_v1(uuid,uuid)') is not null;`) === 't';
const A3_INLINE = `public.is_room_member(room_id) and (
      user_id = (select auth.uid())
      or not exists (select 1 from public.game_rooms room where room.id = room_players.room_id
                     and room.mode = 'duel' and room.status in ('starting', 'playing')))`;
const originalQual = policyQual();
const users = [], rooms = [], contexts = [], checks = [], errors = [];
const playerReads = [], tableReads = [], progressFrames = [];
const admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server, completed = false;
const artifactDir = '.temp/sa2-ui';
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
    assert.ok(page, `unexpected summary ${title}`);
    data = { title, pageid: page.pageId, revision: page.revisionId, extract: '로컬 SF-A2 검증 문서' };
  } else if (url.searchParams.get('list') === 'search') {
    data = { query: { search: [{ title: TARGET.title, snippet: '목표 후보' }] } };
  } else if (url.searchParams.get('list') === 'random') {
    data = { query: { random: [{ title: START.title }] } };
  } else {
    const page = pages.find((p) => p.title === (url.searchParams.get('page') || url.searchParams.get('titles')));
    assert.ok(page, `unexpected wiki page ${url.href}`);
    const links = pages.slice(pages.indexOf(page) + 1);
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
    assert.ok(page, 'snapshot must refer to a seeded fixture');
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
  Object.assign(process.env, { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: config.ANON_KEY, VITE_MAINTENANCE: 'false' });
  server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const host = await makeContext(users[0], 'host');
  const guest = await makeContext(users[1], 'guest');
  const base = 'http://127.0.0.1:5187';

  for (const mode of ['before-a3', 'a3']) {
    const wanted = mode === 'a3' ? (hasHelper() ? 'can_view_room_player_v1(room_id, user_id)' : A3_INLINE) : 'is_room_member(room_id)';
    if (policyQual() !== wanted) {
      setPolicy(wanted);
      // Policy DDL right before a match made local Realtime miss the first events (2 of 4 runs).
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    const room = await rpc(users[0].client, 'create_duel_room_v2', { p_use_items: false }); rooms.push(room.id);
    await host.goto(`${base}/multiplayer/room/${room.id}`);
    await guest.goto(`${base}/multiplayer/room/${room.id}`);
    await host.locator('.room-target-input').fill('목표');
    await host.getByRole('button', { name: '검색', exact: true }).click();
    await host.locator('.search-item').filter({ hasText: TARGET.title }).click();
    await expect(host.getByRole('status')).toHaveCount(0);
    await expect(host.locator('.room-target-section').first()).toContainText(TARGET.title);
    await expect(guest.getByText(`방장이 고른 목표: ${TARGET.title}`).first()).toBeVisible();
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

    // Recovery: the guest reloads mid-match. With the A3 policy, a table-based read would end in OPPONENT_LEFT.
    await guest.reload();
    await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    await expect(opponentBox(guest, '현재 문서')).toHaveText(MIDDLE.title);
    pass(`${mode}: guest F5 mid-match recovers with the opponent shown`);

    // Host finishes; the result reveals and the path is readable again.
    await host.locator('.article-content a').filter({ hasText: TARGET.title }).click();
    await expect(host.getByText('🎉 승리!', { exact: true })).toBeVisible();
    await expect(guest.getByText('😢 패배', { exact: true })).toBeVisible();
    const finishedRead = await users[1].client.rpc('get_duel_room_players_v1', { p_room_id: room.id });
    assert.equal(finishedRead.error, null);
    const hostRow = finishedRead.data.find((row) => row.user_id === users[0].id);
    assert.deepEqual(hostRow.path_titles, [START.title, MIDDLE.title, TARGET.title]);
    pass(`${mode}: after the finish both results show and the host path is revealed`);
    await host.screenshot({ path: `${artifactDir}/result-${mode}.png`, fullPage: true });
    await host.goto(`${base}/multiplayer`); await guest.goto(`${base}/multiplayer`);
  }
  assert.deepEqual(tableReads, [], `1:1 pages read room_players directly: ${tableReads.join(' | ')}`);
  pass('no 1:1 page read room_players directly');
  assert.deepEqual(errors, []); pass('browser page errors: zero');
  completed = true;
} finally {
  if (policyQual() !== originalQual) setPolicy(originalQual);
  for (const context of contexts) await context.close();
  await browser?.close(); await server?.close();
  if (rooms.length) sql(`delete from public.game_rooms where id in (${rooms.map(q).join(',')});`);
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id); assert.equal(result.error, null, result.error?.message);
  }
  sql(`delete from public.wiki_pages where page_id in (${pages.map((p) => q(p.pageId)).join(',')});`);
  assert.equal(policyQual(), originalQual);
  assert.equal(Number(sql(`select count(*) from auth.users where id in (${[...users.map((u) => u.id), randomUUID()].map(q).join(',')});`)), 0);
  pass('cleanup: policy restored; rooms/accounts/pages removed; sessions/keys never saved');
  fs.writeFileSync(`${artifactDir}/summary.json`, JSON.stringify({ date: '2026-10-03', completed, checks, errors }, null, 2));
  console.log(`SF-A2 UI ${completed ? 'PASS' : 'INCOMPLETE'}: ${checks.length} checks`);
}
