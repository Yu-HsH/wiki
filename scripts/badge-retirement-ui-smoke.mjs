// 16d-1: the front works on the old DB (badges still a kind, no asset_ref tokens) and on the 16d-2 shape
// (badges converted, tokens set). Phase B simulates 16d-2 on the catalog rows it uses and restores them.
// Local stack only. No stored keys/sessions. Fixtures and catalog changes are undone in finally.
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
const pages = ['시작', '목표A', '목표B'].map((name, i) => ({
  title: `16d-${token}-${name}`, pageId: `16d-${token}-${i}`, revisionId: `${100 + i}`, snapshotId: randomUUID(),
}));
const users = [], rooms = [], contexts = [], checks = [], errors = [];
const admin = createClient(apiUrl, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server, completed = false, catalogBackup = null;
const base = 'http://127.0.0.1:5188';
const artifactDir = '.temp/16d-ui';
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
    data = { title, pageid: page.pageId, revision: page.revisionId, extract: '로컬 16d 검증 문서' };
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
      data = { query: { pages: { 1: { title: page.title, pageid: page.pageId, links: pages.slice(1).map((p) => ({ title: p.title, ns: 0 })) } } } };
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
    const page = pages.find((p) => p.title === route.request().postDataJSON().title);
    assert.ok(page, 'snapshot must refer to a seeded fixture');
    await route.fulfill({ json: { snapshotId: page.snapshotId, pageId: page.pageId, revisionId: page.revisionId, canonicalTitle: page.title } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}
async function openEditor(page) {
  await page.goto(`${base}/profile`);
  await page.locator('summary.preward-summary').click();
  await expect(page.locator('.preward-row')).toHaveCount(6);
}
async function equipVia(page, label, name) {
  await page.getByRole('button', { name: `${label} 변경` }).click();
  await page.locator('.preward-choice').filter({ hasText: name }).click();
  await expect(page.locator('.preward-row').filter({ hasText: label }).locator('.preward-current')).toContainText(name);
}
async function playSingle(page) {
  await page.goto(`${base}/lobby`);
  await page.getByRole('button', { name: /혼자서 플레이/ }).click();
  await page.locator('.qs-modal-input').fill('목표');
  await page.locator('.qs-modal').getByRole('button', { name: '검색', exact: true }).click();
  await page.locator('.search-item').filter({ hasText: pages[1].title }).click();
  await page.locator('.qs-modal-actions .app-btn-primary').click();
  await page.waitForURL('**/game');
  await page.locator('.article-content a').filter({ hasText: pages[1].title }).first().click({ timeout: 30000 });
  await expect(page.getByTestId('result-xp')).toBeVisible({ timeout: 20000 });
}

const OWNED = ['frame_wide_world_3', 'finish_better_path_3', 'path_color_one_step', 'badge_first_arrival', 'frame_backlink_return'];
try {
  sql(`insert into public.wiki_pages(page_id, canonical_title) values ${pages.map((p) => `(${q(p.pageId)},${q(p.title)})`).join(',')};
    insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot) values ${pages.map((p) => `(${q(p.snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)})`).join(',')};
    insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,link_text,ordinal)
    values ${pages.slice(1).map((p, i) => `(${q(pages[0].snapshotId)},${q(p.pageId)},${q(p.revisionId)},${q(p.title)},${q(p.title)},${i})`).join(',')};`);
  for (const name of ['deco', 'rival']) {
    const email = `16d-${token}-${name}@local.test`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname: `16d ${name}` } });
    assert.equal(created.error, null);
    const actor = { id: created.data.user.id, email, password }; users.push(actor);
    sql(`insert into public.profiles(id, username, nickname, synthetic_email)
      values (${q(actor.id)},${q(`qa16d_${token}_${name}`)},${q(`16d ${name}`)},${q(email)});`);
    const client = createClient(apiUrl, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password }); assert.equal(signed.error, null);
    Object.assign(actor, { client, session: signed.data.session });
  }
  const [deco, rival] = users;
  // Old-DB state: owns a badge and has it in the badge slot, plus a frame, a finish effect and a path color.
  sql(`insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
       select ${q(deco.id)}, r, 'admin' from unnest(array[${OWNED.map(q).join(',')}]) r;
       insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
       values (${q(rival.id)}, 'finish_better_path_3', 'admin'), (${q(rival.id)}, 'frame_backlink_return', 'admin');
       insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
       values (${q(deco.id)}, 'badge', 1, 'badge_first_arrival'),
              (${q(rival.id)}, 'finish_effect', 1, 'finish_better_path_3'),
              (${q(rival.id)}, 'frame', 1, 'frame_backlink_return');`);

  Object.assign(process.env, { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: config.ANON_KEY, VITE_MAINTENANCE: 'false' });
  server = await createServer({ server: { host: '127.0.0.1', port: 5188, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });

  /* ── A. old DB ── */
  let page = await makeContext(deco);
  await openEditor(page);
  const labels = await page.locator('.preward-label').allTextContents();
  assert.deepEqual(labels, ['프로필 아이콘', '대표 칭호', '프로필 프레임', '프로필 배경', '완주 효과', '경로 색상']);
  await expect(page.locator('.pcard-badges, .pcard-badge')).toHaveCount(0);
  await page.getByRole('button', { name: '프로필 아이콘 변경' }).click();
  await expect(page.locator('.preward-choice').filter({ hasText: '첫 도착' })).toHaveCount(0);
  await page.getByRole('button', { name: '프로필 아이콘 변경' }).click();
  pass('A old DB: editor 4 card rows + 2 match rows, no badge row or badge render, equipped badge ignored');

  await equipVia(page, '프로필 프레임', '넓어진 세계 III');
  await expect(page.locator('.pcard').first()).toHaveClass(/pcard--framed/);
  await expect(page.locator('.pcard').first()).not.toHaveClass(/pcard--frame-tier/);
  await equipVia(page, '완주 효과', '더 나은 길 III');
  await equipVia(page, '경로 색상', '한 칸의 차이');
  pass('A old DB: frame / finish effect / path color equip through the editor; no token → default ring');

  await playSingle(page);
  const fxA = page.getByTestId('finish-effect');
  await expect(fxA).toHaveClass(/fx-finish--tier-1/);
  pass('A old DB: single result shows the finish effect (default tier-1 without a token)');

  /* ── B. simulate 16d-2 on the rows used here ── */
  catalogBackup = sql(`select string_agg(format('(%L,%L,%L,%L)', reward_id, kind, display_name, coalesce(asset_ref, '<null>')), ',')
    from public.reward_catalog where reward_id in (${OWNED.map(q).join(',')});`);
  sql(`update public.reward_catalog set asset_ref = 'frame:tier-3' where reward_id = 'frame_wide_world_3';
       update public.reward_catalog set asset_ref = 'finish:tier-3' where reward_id = 'finish_better_path_3';
       update public.reward_catalog set asset_ref = 'path:purple' where reward_id = 'path_color_one_step';
       update public.reward_catalog set asset_ref = 'frame:special' where reward_id = 'frame_backlink_return';
       delete from public.user_profile_equipment where slot = 'badge' and user_id = ${q(deco.id)};
       update public.reward_catalog set kind = 'profile_icon', asset_ref = '/profile-icons/first-arrival.svg'
        where reward_id = 'badge_first_arrival';`);
  await openEditor(page);
  await expect(page.locator('.pcard').first()).toHaveClass(/pcard--frame-tier-3/);
  const ring = await page.locator('.pcard-avatar').first().evaluate((el) => getComputedStyle(el).boxShadow);
  assert.match(ring, /rgb\(185, 138, 18\)/, `gold ring: ${ring}`);
  await page.getByRole('button', { name: '프로필 아이콘 변경' }).click();
  const converted = page.locator('.preward-choice').filter({ hasText: '첫 도착' });
  await expect(converted.locator('img')).toHaveAttribute('src', '/profile-icons/first-arrival.svg');
  await converted.click();
  await expect(page.locator('.pcard-avatar-img').first()).toHaveAttribute('src', '/profile-icons/first-arrival.svg');
  await page.locator('.preward-swatch').count();
  await page.screenshot({ path: `${artifactDir}/profile-new-db.png`, fullPage: true });
  pass('B 16d-2 shape: tier-3 gold frame, converted badge equips as a profile icon with its SVG');

  await playSingle(page);
  const fxB = page.getByTestId('finish-effect');
  await expect(fxB).toHaveClass(/fx-finish--tier-3/);
  const inner = await fxB.locator('div div').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(inner, 'rgb(110, 86, 201)', 'last node in purple');
  await page.screenshot({ path: `${artifactDir}/single-new-db.png`, fullPage: true });
  pass('B 16d-2 shape: single result — purple path nodes, tier-3 finish effect on the last node');

  /* ── C. 1:1 — rival (reduced motion) wins with a finish effect; deco loses ── */
  const room = await rpc(deco.client, 'create_duel_room_v2', { p_use_items: false }); rooms.push(room.id);
  const host = await makeContext(deco);
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
  await guest.locator('.article-content a').filter({ hasText: pages[1].title }).first().click();
  await expect(guest.getByText('🎉 승리!', { exact: true })).toBeVisible();
  await expect(host.getByText('😢 패배', { exact: true })).toBeVisible();
  await expect(guest.getByTestId('finish-effect')).toHaveClass(/fx-finish--tier-3/);
  await expect(host.getByTestId('finish-effect')).toHaveCount(0);
  const pulse = await guest.getByTestId('finish-effect').evaluate((el) => getComputedStyle(el, '::after').animationName);
  assert.equal(pulse, 'none', 'reduced motion: no pulse');
  await guest.screenshot({ path: `${artifactDir}/duel-win.png`, fullPage: true });
  pass('C 1:1: winner card has the finish effect (static under reduced motion); loser card none; no path line');

  await guest.goto(`${base}/profile`);
  await expect(guest.locator('.pcard--frame-special .pcard-avatar-ring')).toHaveCount(1);
  const spin = await guest.locator('.pcard-avatar-ring').first().evaluate((el) => getComputedStyle(el, '::after').animationName);
  assert.equal(spin, 'none', 'reduced motion: special ring does not rotate');
  const motion = await makeContext(rival);
  await motion.goto(`${base}/profile`);
  const spinning = await motion.locator('.pcard-avatar-ring').first().evaluate((el) => getComputedStyle(el, '::after').animationName);
  assert.equal(spinning, 'pcard-frame-spin');
  pass('special frame: teal dashed ring rotates, static under reduced motion');

  assert.deepEqual(errors, []); pass('browser page errors: zero');
  completed = true;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close(); await server?.close();
  if (catalogBackup) {
    sql(`update public.reward_catalog c set kind = v.kind, display_name = v.display_name,
           asset_ref = nullif(v.asset_ref, '<null>')
           from (values ${catalogBackup}) as v(reward_id, kind, display_name, asset_ref)
          where c.reward_id = v.reward_id;`);
  }
  if (rooms.length) sql(`delete from public.game_rooms where id in (${rooms.map(q).join(',')});`);
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id); assert.equal(result.error, null, result.error?.message);
  }
  sql(`delete from public.wiki_pages where page_id in (${pages.map((p) => q(p.pageId)).join(',')});`);
  assert.equal(Number(sql(`select count(*) from public.reward_catalog where reward_id = 'badge_first_arrival' and kind = 'badge' and asset_ref is null;`)), 1, 'catalog restored');
  assert.equal(Number(sql(`select count(*) from public.reward_catalog where asset_ref like 'frame:%' or asset_ref like 'finish:%' or asset_ref like 'path:%';`)), 0, 'no token left');
  pass('cleanup: catalog restored, accounts removed');
  fs.writeFileSync(`${artifactDir}/summary.json`, JSON.stringify({ date: '2026-10-03', completed, checks, errors }, null, 2));
  console.log(`16d-1 UI ${completed ? 'PASS' : 'INCOMPLETE'}: ${checks.length} checks`);
}
