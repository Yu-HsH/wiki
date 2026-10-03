// 16c: achievement display on the real local stack — Auth/RPC/Realtime, deterministic Wikipedia + snapshot transport.
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
const names = ['시작', '목표A', '목표B'].map((name) => `16c-${token}-${name}`);
const pages = names.map((title, i) => ({ title, pageId: `16c-${token}-${i}`, revisionId: `${100 + i}`, snapshotId: randomUUID() }));
const users = [], rooms = [], contexts = [], checks = [], errors = [];
const admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server, completed = false;
const base = 'http://127.0.0.1:5187';
const artifactDir = '.temp/16c-ui';
fs.mkdirSync(artifactDir, { recursive: true });
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error, null, result.error?.message);
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
async function wikiRoute(route) {
  const url = new URL(route.request().url());
  let data;
  if (url.pathname.includes('/summary/')) {
    const title = decodeURIComponent(url.pathname.split('/summary/')[1]);
    const page = pages.find((p) => p.title === title);
    assert.ok(page, `unexpected summary ${title}`);
    data = { title, pageid: page.pageId, revision: page.revisionId, extract: '로컬 16c 검증 문서' };
  } else if (url.searchParams.get('list') === 'search') {
    data = { query: { search: pages.slice(1).map((p) => ({ title: p.title, snippet: '목표 후보' })) } };
  } else if (url.searchParams.get('list') === 'random') {
    data = { query: { random: [{ title: pages[0].title }] } };
  } else {
    const page = pages.find((p) => p.title === (url.searchParams.get('page') || url.searchParams.get('titles')));
    assert.ok(page, `unexpected wiki page ${url.href}`);
    if (url.searchParams.get('action') === 'parse') {
      data = { parse: { title: page.title, pageid: page.pageId, revid: page.revisionId,
        text: { '*': `<div class="mw-parser-output"><p>로컬 문서</p>${pages.slice(1).map((p) => `<a href="/wiki/${p.title}">${p.title}</a>`).join(' ')}</div>` } } };
    } else {
      data = { query: { pages: { 1: { title: page.title, pageid: page.pageId,
        links: pages.slice(1).map((p) => ({ title: p.title, ns: 0 })) } } } };
    }
  }
  await route.fulfill({ json: data });
}
async function makeContext(actor, { reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion });
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
    await route.fulfill({ json: { snapshotId: page.snapshotId, pageId: page.pageId,
      revisionId: page.revisionId, canonicalTitle: page.title } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}
const unlocks = (userId) => JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('id', achievement_id, 'tier', tier,
  'source', source_type, 'seen', seen_at is not null) order by achievement_id, tier), '[]') from public.user_achievement_unlocks
  where user_id=${q(userId)};`));
const unseen = (userId) => Number(sql(`select count(*) from public.user_achievement_unlocks where user_id=${q(userId)} and seen_at is null;`));

try {
  sql(`insert into public.wiki_pages(page_id, canonical_title) values ${pages.map((p) => `(${q(p.pageId)},${q(p.title)})`).join(',')};
    insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values ${pages.map((p) => `(${q(p.snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)})`).join(',')};
    insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal)
    values ${pages.slice(1).map((p, i) => `(${q(pages[0].snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)},${q(p.title)},${i})`).join(',')};`);
  for (const name of ['solo', 'rival']) {
    const email = `16c-${token}-${name}@local.test`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname: `16c ${name}` } });
    assert.equal(created.error, null);
    const actor = { id: created.data.user.id, email, password }; users.push(actor);
    sql(`insert into public.profiles(id, username, nickname, synthetic_email)
      values (${q(actor.id)},${q(`qa16c_${token}_${name}`)},${q(`16c ${name}`)},${q(email)});`);
    const client = createClient(apiUrl, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password }); assert.equal(signed.error, null);
    Object.assign(actor, { client, session: signed.data.session });
  }
  const [solo, rival] = users;
  // solo: 99 XP (one short of Lv.2) and 99 visited documents (one game away from 넓어진 세계 I).
  sql(`select public.grant_xp_v1(${q(solo.id)}, 'admin_adjustment', gen_random_uuid(), 99, 99);
    insert into public.user_visited_documents(user_id, page_id, first_source_type)
    select ${q(solo.id)}, ${q(`16c-${token}-v`)} || g, 'retro' from generate_series(1, 99) g;`);

  Object.assign(process.env, { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: config.ANON_KEY, VITE_MAINTENANCE: 'false' });
  server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });

  /* ── 1. single: 1-move first finish → hidden + 2 general, XP 15 + 90, Lv.1 → Lv.3 ── */
  let soloPage = await makeContext(solo);
  await soloPage.goto(`${base}/lobby`);
  await expect(soloPage.getByRole('button', { name: '업적', exact: true })).toBeVisible();
  await expect(soloPage.locator('.ach-notice')).toHaveCount(0);
  pass('lobby: 업적 entry visible; no notice with 0 unseen');

  await soloPage.getByRole('button', { name: /혼자서 플레이/ }).click();
  await soloPage.locator('.qs-modal-input').fill('목표');
  await soloPage.locator('.qs-modal').getByRole('button', { name: '검색', exact: true }).click();
  await soloPage.locator('.search-item').filter({ hasText: pages[1].title }).click();
  await soloPage.locator('.qs-modal-actions .app-btn-primary').click();
  await soloPage.waitForURL('**/game');
  await soloPage.locator('.article-content a').filter({ hasText: pages[1].title }).first().click({ timeout: 30000 });

  const resultXp = soloPage.getByTestId('result-xp');
  await expect(resultXp).toContainText('+15 XP', { timeout: 20000 });
  await expect(resultXp).toContainText('+90 XP');
  await expect(resultXp).toContainText('업적 달성');
  await expect(resultXp.locator('.rxp-levelup')).toHaveText('레벨 업! Lv.1 → Lv.3 (+2)');
  pass('single: result XP + achievement XP summed (105); multi level-up Lv.1 → Lv.3 (+2)');

  const reveal = soloPage.getByTestId('result-achievements');
  await expect(reveal).not.toHaveClass(/ach-reveal--static/);
  await expect(reveal.locator('.ach-reveal-card')).toHaveCount(3, { timeout: 5000 });
  await expect(reveal.locator('.ach-reveal-card').first()).toHaveClass(/ach-reveal-card--hidden/);
  await expect(reveal.locator('.ach-reveal-card').nth(1)).not.toHaveClass(/ach-reveal-card--hidden/);
  await expect(reveal).toContainText('첫 도착');
  await expect(reveal).toContainText('넓어진 세계');
  pass('single: reveal shows 3 cards, hidden first');
  await soloPage.screenshot({ path: `${artifactDir}/single-result.png`, fullPage: true });

  const soloUnlocks = unlocks(solo.id);
  assert.deepEqual(soloUnlocks.map((u) => u.id).sort(), ['explore_unique_documents', 'hidden_one_move', 'onboarding_first_finish']);
  await expect.poll(() => unseen(solo.id)).toBe(0);
  pass('single: the three revealed unlocks are marked seen');

  /* ── 2. lobby notice for a path without a result screen; dismiss = session only ── */
  sql(`select private.unlock_achievement_v1(${q(solo.id)}, 'group_party_of_eight', 1::smallint, 'admin', null, now());`);
  assert.equal(unseen(solo.id), 1);
  await soloPage.goto(`${base}/lobby`);
  await expect(soloPage.locator('.ach-notice')).toContainText('새 업적 1개');
  await soloPage.getByRole('button', { name: '새 업적 알림 닫기' }).click();
  await expect(soloPage.locator('.ach-notice')).toHaveCount(0);
  await soloPage.reload();
  await expect(soloPage.getByRole('button', { name: '업적', exact: true })).toBeVisible();
  await expect(soloPage.locator('.ach-notice')).toHaveCount(0);
  assert.equal(unseen(solo.id), 1, 'dismiss does not mark seen');
  pass('lobby: notice bundles the unseen unlock; close hides it for the session without marking seen');

  await soloPage.context().close();
  soloPage = await makeContext(solo);
  await soloPage.goto(`${base}/lobby`);
  await expect(soloPage.locator('.ach-notice')).toContainText('새 업적 1개');
  pass('lobby: a new session shows the notice again');

  await soloPage.locator('.ach-notice-link').click();
  await soloPage.waitForURL('**/achievements');
  const partyCard = soloPage.locator('.ach-card').filter({ hasText: '여덟 명의 원정대' });
  await expect(partyCard.locator('.ach-new')).toHaveText('NEW');
  await expect(soloPage.locator('.ach-card--hidden-summary')).toContainText('발견 1 / ??');
  await expect(soloPage.locator('.ach-card--hidden')).toHaveCount(1);
  await expect(soloPage.locator('.ach-card--hidden .ach-kind')).toHaveText('재미');
  const wideCard = soloPage.locator('.ach-card').filter({ hasText: '넓어진 세계' });
  await expect(wideCard.locator('.ach-progress-label')).toHaveText('101 / 500');
  await expect(wideCard.locator('.ach-next')).toContainText('다음 보상 (II): +60 XP');
  await expect.poll(() => unseen(solo.id)).toBe(0);
  await soloPage.screenshot({ path: `${artifactDir}/achievements.png`, fullPage: true });
  pass('achievements: NEW on the unseen card, 발견 1 / ??, progress + next reward; entering marks seen');

  await soloPage.goto(`${base}/lobby`);
  await expect(soloPage.getByRole('button', { name: '업적', exact: true })).toBeVisible();
  await expect(soloPage.locator('.ach-notice')).toHaveCount(0);
  await soloPage.goto(`${base}/achievements`);
  await expect(soloPage.locator('.ach-new')).toHaveCount(0);
  pass('after the screen: no lobby notice, no NEW');

  await soloPage.goto(`${base}/profile`);
  const summary = soloPage.getByTestId('profile-achievements');
  await expect(summary).toContainText('4개 달성');
  await expect(summary.locator('li')).toHaveCount(3);
  await expect(summary.locator('li').first()).toContainText('여덟 명의 원정대');
  pass('profile: 4 achieved (no denominator), latest 3 with the newest first');

  /* ── 3. duel: winner with an unlock holds 6000ms (reduced motion → static); loser without holds 4000ms ── */
  const room = await rpc(solo.client, 'create_duel_room_v2', { p_use_items: false }); rooms.push(room.id);
  const host = soloPage;
  const guest = await makeContext(rival, { reducedMotion: 'reduce' });
  await host.goto(`${base}/multiplayer/room/${room.id}`);
  await guest.goto(`${base}/multiplayer/room/${room.id}`);
  await expect(guest.getByText('방장이 목표를 고르는 중').first()).toBeVisible();
  await host.locator('.room-target-input').fill('목표');
  await host.getByRole('button', { name: '검색', exact: true }).click();
  await host.locator('.search-item').filter({ hasText: pages[1].title }).click();
  await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: '게임 시작', exact: true }).click();
  await Promise.all([host.waitForURL('**/multiplayer/game/**'), guest.waitForURL('**/multiplayer/game/**')]);
  await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
  await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });

  const atLobby = (page) => page.waitForURL((url) => url.pathname === '/multiplayer', { timeout: 12000 }).then(() => Date.now());
  await guest.locator('.article-content a').filter({ hasText: pages[1].title }).first().click();
  await expect(guest.getByText('🎉 승리!', { exact: true })).toBeVisible();
  const guestShownAt = Date.now();
  await expect(host.getByText('😢 패배', { exact: true })).toBeVisible();
  const hostShownAt = Date.now();
  const guestLobby = atLobby(guest), hostLobby = atLobby(host);

  const guestReveal = guest.getByTestId('result-achievements');
  await expect(guestReveal).toHaveClass(/ach-reveal--static/);
  await expect(guestReveal).toContainText('첫 도착');
  await expect(guest.getByTestId('result-xp')).toContainText('+30 XP');
  await guest.screenshot({ path: `${artifactDir}/duel-win.png`, fullPage: true });
  pass('duel: winner sees 첫 도착 (+30 XP) statically under reduced motion');
  await expect(host.getByTestId('result-xp')).toContainText('1:1 정상 패배');
  await expect(host.getByTestId('result-achievements')).toHaveCount(0);
  pass('duel: loser has XP and no reveal');

  const [guestAt, hostAt] = await Promise.all([guestLobby, hostLobby]);
  const guestHold = guestAt - guestShownAt, hostHold = hostAt - hostShownAt;
  console.log(`hold: winner ${guestHold}ms · loser ${hostHold}ms`);
  assert.ok(guestHold >= 5200 && guestHold <= 7500, `winner hold ${guestHold}`);
  assert.ok(hostHold >= 3200 && hostHold <= 5000, `loser hold ${hostHold}`);
  pass(`duel: hold 6000ms with an unlock (${guestHold}ms), 4000ms without (${hostHold}ms)`);
  assert.deepEqual(unlocks(rival.id).map((u) => [u.id, u.source, u.seen]), [['onboarding_first_finish', 'duel', true]]);
  pass('duel: the revealed unlock is marked seen');

  assert.deepEqual(errors, []); pass('browser page errors: zero');
  completed = true;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close(); await server?.close();
  if (rooms.length) sql(`delete from public.game_rooms where id in (${rooms.map(q).join(',')});`);
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id); assert.equal(result.error, null, result.error?.message);
  }
  sql(`delete from public.wiki_pages where page_id in (${pages.map((p) => q(p.pageId)).join(',')});`);
  assert.equal(Number(sql(`select count(*) from auth.users where id in (${[...users.map((u) => u.id), randomUUID()].map(q).join(',')});`)), 0);
  assert.equal(Number(sql(`select count(*) from public.user_achievement_unlocks where user_id in (${[...users.map((u) => u.id), randomUUID()].map(q).join(',')});`)), 0);
  pass('cleanup: rooms/accounts/unlocks removed; sessions/keys never saved');
  fs.writeFileSync(`${artifactDir}/summary.json`, JSON.stringify({ date: '2026-10-03', completed, checks, errors }, null, 2));
  console.log(`16c UI ${completed ? 'PASS' : 'INCOMPLETE'}: ${checks.length} checks`);
}
