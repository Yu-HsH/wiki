import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = 'http://127.0.0.1:5181/tutorial/fixtures/index.html';
const out = new URL('../.temp/ux-refine-20261106/a/growth/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { basis: '9676b0185fd5a71c617c14c1c332b32efc9ba74a', dateKst: '2026-11-06', uncommitted: true, environment: 'desktop Chromium, A-only render slot fixture, no real B/DB/mobile device', checks: [], errors: [], forbiddenRequests: [], applicationCommands: [] };
const check = async (name, work) => { await work(); report.checks.push(name); console.log('PASS', name); };
async function at(page, id) { await page.waitForFunction(expected => document.querySelector('.wr-tutorial-layer')?.dataset.step === expected && document.querySelector('.wr-tutorial-layer')?.dataset.ready === 'true', id); }
async function next(page, id) { await page.getByRole('button', { name: '다음', exact: true }).click(); await at(page, id); }
async function context(width, options = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...options });
  const page = await ctx.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() !== 'GET' || /\/(rest|auth|functions)\/v1\//.test(url.pathname)) { report.applicationCommands.push({ method: request.method(), path: url.pathname }); return route.abort(); }
    if (url.origin !== 'http://127.0.0.1:5181') { report.forbiddenRequests.push(url.origin + url.pathname); return route.abort(); }
    return route.continue();
  });
  return { ctx, page };
}
async function openEditor(page) {
  await page.getByRole('button', { name: '훈련 시작', exact: true }).click(); await at(page, 'GR00');
  await next(page, 'GR01'); await page.getByRole('button', { name: '연습용 도감 열기', exact: true }).click(); await at(page, 'GR02');
  await page.getByRole('button', { name: '칭호 견본 열기', exact: true }).click(); await at(page, 'GR03');
}
try {
  for (const width of [320, 390, 430, 768, 1440]) {
    const { ctx, page } = await context(width);
    await page.addInitScript(() => {
      const key = 'wiki-race:tutorial:v1:guest:growth-fixture-guest:intro-core';
      if (!localStorage.getItem(key)) {
        localStorage.setItem('wiki-race:tutorial:v1:browser-guest', 'growth-fixture-guest');
        localStorage.setItem(key, JSON.stringify({ schema: 1, moduleId: 'intro-core', version: 1, status: 'completed', stepId: 'F01', completedVersion: 1 }));
      }
    });
    await page.goto(`${base}?module=growth-basics${width === 390 ? '&slot=1' : ''}`);
    await check(`${width}: growth actual open/select/remove/result, pause F5, independent intro completion`, async () => {
      await openEditor(page);
      if (width === 390) assert.equal(await page.locator('[data-testid="growth-injected-slot"]').count(), 1);
      await page.getByRole('button', { name: '길을 살피는 연습가 · 연습용 선택', exact: true }).click(); await at(page, 'GR04');
      assert.equal(await page.locator('[data-testid="growth-title"]').innerText(), '길을 살피는 연습가');
      await page.screenshot({ path: fileURLToPath(new URL(`growth-card-${width}.png`, out)) });
      await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
      await page.reload(); await page.getByRole('button', { name: '이어하기', exact: true }).click(); await at(page, 'GR04');
      assert.equal(await page.locator('[data-testid="growth-title"]').innerText(), '길을 살피는 연습가');
      await next(page, 'GR05');
      await page.getByRole('button', { name: '연습용 해제', exact: true }).click(); await at(page, 'GR06');
      assert.equal(await page.locator('[data-testid="growth-title"]').innerText(), '연습 칭호 없음');
      await page.getByRole('button', { name: '연습 결과 견본 열기', exact: true }).click(); await at(page, 'GR07');
      await page.getByRole('button', { name: '훈련 마치기', exact: true }).click();
      assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'completed');
      await page.getByLabel('연습 모듈', { exact: true }).selectOption('intro-core');
      assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'completed');
      assert.equal(await page.locator('.wr-tutorial-layer').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    });
    await ctx.close();
  }
  const { ctx, page } = await context(390, { reducedMotion: 'reduce' });
  await page.goto(`${base}?module=growth-basics&identity=member-a&slot=1`);
  await check('growth previous selection remains actionable; keyboard and exit/restart preserve local-only contract', async () => {
    await openEditor(page);
    await page.getByRole('button', { name: '길을 살피는 연습가 · 연습용 선택', exact: true }).focus();
    await page.keyboard.press('Space'); await at(page, 'GR04');
    await page.getByRole('button', { name: '이전', exact: true }).click(); await at(page, 'GR03');
    assert.equal(await page.getByRole('button', { name: '길을 살피는 연습가 · 연습용 선택', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: '길을 살피는 연습가 · 연습용 선택', exact: true }).click(); await at(page, 'GR04');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '여기서 종료', exact: true }).click();
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'dismissed');
    await page.getByRole('button', { name: '다시 시작', exact: true }).click(); await at(page, 'GR00');
    assert.equal(await page.locator('[data-testid="growth-title"]').innerText(), '연습 칭호 없음');
  });
  await check('growth account/module changes cannot restore another account equipment or complete intro', async () => {
    await next(page, 'GR01'); await page.getByRole('button', { name: '연습용 도감 열기', exact: true }).click(); await at(page, 'GR02');
    await page.getByRole('button', { name: '칭호 견본 열기', exact: true }).click(); await at(page, 'GR03');
    await page.getByRole('button', { name: '길을 살피는 연습가 · 연습용 선택', exact: true }).click(); await at(page, 'GR04');
    await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
    await page.getByLabel('검증 계정').selectOption('member-b');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'unseen');
    assert.equal(await page.locator('[data-testid="growth-title"]').innerText(), '연습 칭호 없음');
    await page.getByLabel('연습 모듈', { exact: true }).selectOption('intro-core');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'unseen');
    await page.getByLabel('연습 모듈', { exact: true }).selectOption('growth-basics');
    await page.getByLabel('검증 계정').selectOption('member-a');
    await page.getByRole('button', { name: '이어하기', exact: true }).click(); await at(page, 'GR04');
    assert.equal(await page.locator('[data-testid="growth-title"]').innerText(), '길을 살피는 연습가');
  });
  await ctx.close();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.forbiddenRequests, []); assert.deepEqual(report.applicationCommands, []);
  report.success = true;
} catch (error) {
  report.success = false; report.failure = error.stack; console.error(error); process.exitCode = 1;
  const page = browser.contexts().flatMap(ctx => ctx.pages()).at(-1);
  if (page) { console.error((await page.locator('body').innerText()).slice(-2200)); await page.screenshot({ path: fileURLToPath(new URL('failure.png', out)) }); }
} finally { await writeFile(new URL('browser-report.json', out), JSON.stringify(report, null, 2)); await browser.close(); }
