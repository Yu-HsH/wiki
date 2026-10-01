// 14c: real local Auth/RPC/Realtime, deterministic Wikipedia + snapshot transport.
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
const names = ['시작', '목표A', '목표B'].map((name) => `14c-${token}-${name}`);
const pages = names.map((title, i) => ({ title, pageId: `14c-${token}-${i}`, revisionId: `${100 + i}`, snapshotId: randomUUID() }));
const users = [], rooms = [], contexts = [], checks = [], errors = [], startCalls = [];
const admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server, failSnapshot = false, slowSnapshot = false, completed = false;
const artifactDir = '.temp/14c-ui';
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
    data = { title, pageid: page.pageId, revision: page.revisionId, extract: '로컬 14c 검증 문서' };
  } else if (url.searchParams.get('list') === 'search') {
    data = { query: { search: pages.slice(1).map((p) => ({ title: p.title, snippet: '공통 목표 후보' })) } };
  } else if (url.searchParams.get('list') === 'random') {
    data = { query: { random: [{ title: pages[0].title }] } };
  } else {
    const page = pages.find((p) => p.title === (url.searchParams.get('page') || url.searchParams.get('titles')));
    assert.ok(page, `unexpected wiki page ${url.href}`);
    if (url.searchParams.get('action') === 'parse') {
      const parseRevision = route.request().frame().url().includes('/multiplayer/room/') ? '999' : page.revisionId;
      data = { parse: { title: page.title, pageid: page.pageId, revid: parseRevision,
        text: { '*': `<div class="mw-parser-output"><p>로컬 문서</p>${pages.slice(1).map((p) => `<a href="/wiki/${p.title}">${p.title}</a>`).join(' ')}</div>` } } };
    } else {
      data = { query: { pages: { 1: { title: page.title, pageid: page.pageId,
        links: pages.slice(1).map((p) => ({ title: p.title, ns: 0 })) } } } };
    }
  }
  await route.fulfill({ json: data });
}
async function makeContext(actor) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  contexts.push(context);
  const storageKey = `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({ storageKey, session }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey, session: actor.session });
  await context.route('https://ko.wikipedia.org/**', wikiRoute);
  await context.route(`${apiUrl}/functions/v1/wiki-snapshot`, async (route) => {
    if (slowSnapshot) await new Promise((resolve) => setTimeout(resolve, 750));
    if (failSnapshot) return route.fulfill({ status: 503, json: { message: '14c intentional snapshot failure' } });
    const input = route.request().postDataJSON();
    const page = pages.find((p) => p.title === input.title);
    assert.ok(page, 'snapshot must refer to a seeded fixture');
    // Deliberately use a different input revision in the Wikipedia parse below;
    // START must send this returned authoritative identity, not the parse revision.
    await route.fulfill({ json: { snapshotId: page.snapshotId, pageId: page.pageId,
      revisionId: page.revisionId, canonicalTitle: page.title } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/rpc/start_duel_room_v2')) startCalls.push(request.postDataJSON());
  });
  return page;
}
async function selectTarget(page, index) {
  await page.locator('.room-target-input').fill('목표');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.locator('.search-item').filter({ hasText: pages[index].title }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.room-target-section').first()).toContainText(pages[index].title);
}
async function roomRows(id) {
  return JSON.parse(sql(`select jsonb_build_object('room', (select to_jsonb(r) from public.game_rooms r where id=${q(id)}),
    'players', (select jsonb_agg(to_jsonb(p) order by user_id) from public.room_players p where room_id=${q(id)}));`));
}
try {
  sql(`insert into public.wiki_pages(page_id, canonical_title) values ${pages.map((p) => `(${q(p.pageId)},${q(p.title)})`).join(',')};
    insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values ${pages.map((p) => `(${q(p.snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)})`).join(',')};
    insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal)
    values ${pages.slice(1).map((p, i) => `(${q(pages[0].snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)},${q(p.title)},${i})`).join(',')};`);
  for (const name of ['host', 'guest']) {
    const email = `14c-${token}-${name}@local.test`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname: `14c ${name}` } });
    assert.equal(created.error, null);
    const actor = { id: created.data.user.id, email, password }; users.push(actor);
    sql(`insert into public.profiles(id, username, nickname, synthetic_email)
      values (${q(actor.id)},${q(`qa14c_${token}_${name}`)},${q(`14c ${name}`)},${q(email)});`);
    const client = createClient(apiUrl, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password }); assert.equal(signed.error, null);
    Object.assign(actor, { client, session: signed.data.session });
  }
  Object.assign(process.env, { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: config.ANON_KEY, VITE_MAINTENANCE: 'false' });
  server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  let host = await makeContext(users[0]);
  const guest = await makeContext(users[1]);
  const base = 'http://127.0.0.1:5186';
  for (const useItems of [false, true]) {
    const room = await rpc(users[0].client, 'create_duel_room_v2', { p_use_items: useItems }); rooms.push(room.id);
    await host.goto(`${base}/multiplayer/room/${room.id}`);
    await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled();
    pass(`${useItems}: one player cannot START`);
    await guest.goto(`${base}/multiplayer/room/${room.id}`);
    await expect(guest.getByText('방장이 목표를 고르는 중').first()).toBeVisible();
    await expect(guest.locator('.room-target-input')).toHaveCount(0);
    await expect(guest.getByRole('button', { name: '게임 시작', exact: true })).toHaveCount(0);
    await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled();
    pass(`${useItems}: guest has no target controls; missing target disables START`);
    await selectTarget(host, 1);
    await expect(guest.getByText(`방장이 고른 목표: ${pages[1].title}`).first()).toBeVisible();
    await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled();
    assert.ok((await roomRows(room.id)).players.every((p) => !p.is_ready));
    pass(`${useItems}: selection saves immediately; Realtime guest sees target; both READY false`);
    await guest.reload();
    await expect(guest.getByText(`방장이 고른 목표: ${pages[1].title}`).first()).toBeVisible();
    pass(`${useItems}: guest waiting-room F5 restores host target`);
    slowSnapshot = true;
    await host.locator('.room-target-input').fill('목표');
    await host.getByRole('button', { name: '검색', exact: true }).click();
    await host.locator('.search-item').filter({ hasText: pages[2].title }).click();
    await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled();
    await expect(host.getByRole('status')).toHaveCount(0);
    slowSnapshot = false;
    await expect(guest.getByText(`방장이 고른 목표: ${pages[2].title}`).first()).toBeVisible();
    pass(`${useItems}: target loading blocks START; changed target reaches guest`);
    if (!useItems) {
      failSnapshot = true;
      await host.locator('.room-target-input').fill('목표');
      await host.getByRole('button', { name: '검색', exact: true }).click();
      await host.locator('.search-item').filter({ hasText: pages[1].title }).click();
      await expect(host.locator('.mp-error')).toBeVisible();
      await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled();
      failSnapshot = false;
      await selectTarget(host, 2);
      pass('target save failure blocks START; successful reselection restores it');
      await rpc(users[1].client, 'leave_duel_room_v2', { p_room_id: room.id, p_request_id: randomUUID() });
      await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled();
      await guest.reload();
      await expect(host.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled();
      pass('guest leave blocks START; rejoin restores it');
    }
    await host.screenshot({ path: `${artifactDir}/waiting-${useItems}.png`, fullPage: true });
    const beforeCalls = startCalls.length;
    slowSnapshot = true;
    await host.getByRole('button', { name: '게임 시작', exact: true }).click();
    await expect(host.getByRole('button', { name: '시작 중...', exact: true })).toBeDisabled();
    await Promise.all([host.waitForURL('**/multiplayer/game/**'), guest.waitForURL('**/multiplayer/game/**')]);
    slowSnapshot = false;
    assert.equal(startCalls.length, beforeCalls + 1);
    assert.equal(startCalls.at(-1).p_start_page_id, pages[0].pageId);
    assert.equal(startCalls.at(-1).p_start_revision_id, pages[0].revisionId);
    pass(`${useItems}: random start sends snapshot identity exactly once`);
    await expect(host.locator('.vs-target').first()).toHaveText(pages[2].title);
    await expect(host.locator('.vs-target').last()).toHaveText(pages[2].title);
    pass(`${useItems}: VS introduction has one common target`);
    await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    await expect(guest.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    const rows = await roomRows(room.id);
    assert.equal(rows.room.status, 'playing');
    assert.ok(rows.players.every((p) => p.start_page_id === pages[0].pageId && p.start_revision_id === pages[0].revisionId
      && p.target_page_id === pages[2].pageId && p.target_revision_id === pages[2].revisionId));
    pass(`${useItems}: both initialize identical start/target; transition playing`);
    await expect(host.locator('.mp-game-goal-value')).toHaveText(pages[2].title);
    await expect(guest.locator('.mp-game-goal-value')).toHaveText(pages[2].title);
    pass(`${useItems}: both HUDs show the common target`);
    const inventory = sql(`select count(*) from public.duel_item_grants where room_id=${q(room.id)};`);
    assert.equal(Number(inventory), useItems ? 10 : 0);
    pass(`${useItems}: item/non-item inventory contract preserved`);
    await host.reload();
    await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    assert.equal((await roomRows(room.id)).players.find((p) => p.user_id === users[0].id).move_count, 0);
    pass(`${useItems}: playing F5 restores target and progress`);
    await host.context().close();
    const signedAgain = await users[0].client.auth.signInWithPassword({ email: users[0].email, password: users[0].password });
    assert.equal(signedAgain.error, null);
    users[0].session = signedAgain.data.session;
    host = await makeContext(users[0]);
    await host.goto(`${base}/multiplayer/room/${room.id}`);
    await host.waitForURL('**/multiplayer/game/**');
    await expect(host.locator('.mp-game-status')).toHaveText('레이스 진행 중', { timeout: 20000 });
    await expect(host.locator('.mp-game-goal-value')).toHaveText(pages[2].title);
    pass(`${useItems}: fresh login context restores playing from room URL`);
    await host.screenshot({ path: `${artifactDir}/playing-${useItems}.png`, fullPage: true });
    // Clicking the real rendered Wikipedia link exercises snapshot -> move RPC -> result.
    await host.locator('.article-content a').filter({ hasText: pages[2].title }).click();
    await expect(host.getByText('🎉 승리!', { exact: true })).toBeVisible();
    await expect(guest.getByText('😢 패배', { exact: true })).toBeVisible();
    const finished = await roomRows(room.id);
    assert.equal(finished.room.status, 'finished');
    assert.ok(finished.players.find((p) => p.user_id === users[0].id).has_finished);
    pass(`${useItems}: real link move finishes; both result screens converge`);
    await host.goto(`${base}/multiplayer`); await guest.goto(`${base}/multiplayer`);
  }
  assert.deepEqual(errors, []); pass('browser page errors: zero');
  completed = true;
} finally {
  for (const context of contexts) await context.close();
  await browser?.close(); await server?.close();
  if (rooms.length) sql(`delete from public.game_rooms where id in (${rooms.map(q).join(',')});`);
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id); assert.equal(result.error, null, result.error?.message);
  }
  sql(`delete from public.wiki_pages where page_id in (${pages.map((p) => q(p.pageId)).join(',')});`);
  assert.equal(Number(sql(`select count(*) from public.game_rooms where id in (${[...rooms, randomUUID()].map(q).join(',')});`)), 0);
  assert.equal(Number(sql(`select count(*) from auth.users where id in (${[...users.map((u) => u.id), randomUUID()].map(q).join(',')});`)), 0);
  assert.equal(Number(sql(`select count(*) from public.wiki_pages where page_id in (${pages.map((p) => q(p.pageId)).join(',')});`)), 0);
  pass('cleanup: rooms/accounts removed; sessions/keys never saved');
  fs.writeFileSync(`${artifactDir}/summary.json`, JSON.stringify({ date: '2026-10-01', completed, checks, errors }, null, 2));
  console.log(`14c UI ${completed ? 'PASS' : 'INCOMPLETE'}: ${checks.length} checks`);
}
