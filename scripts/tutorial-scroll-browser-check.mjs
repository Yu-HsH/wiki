import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = 'http://127.0.0.1:5181/tutorial/fixtures/index.html?module=growth-basics';
const out = new URL('../.temp/ux-refine-20261106/a/scroll/', import.meta.url);
await mkdir(out, { recursive: true });
const report = { basis: '9676b0185fd5a71c617c14c1c332b32efc9ba74a', dateKst: '2026-11-06', uncommitted: true,
  environment: 'A React fixture in desktop Chromium; reported GR05 target geometry, conservative 340px fixture bubble; not actual integrated B or DB', checks: [], errors: [], forbiddenRequests: [], applicationCommands: [] };
const browser = await chromium.launch({ headless: true });
const check = async (name, work) => { await work(); report.checks.push(name); console.log('PASS', name); };
const at = (page, id) => page.waitForFunction(expected => document.querySelector('.wr-tutorial-layer')?.dataset.step === expected && document.querySelector('.wr-tutorial-layer')?.dataset.ready === 'true', id);
async function createPage() {
  const ctx = await browser.newContext({ viewport: { width: 768, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET' || /\/(rest|auth|functions)\/v1\//.test(url.pathname)) { report.applicationCommands.push(url.pathname); return route.abort(); }
    if (url.origin !== 'http://127.0.0.1:5181') { report.forbiddenRequests.push(url.origin + url.pathname); return route.abort(); }
    return route.continue();
  });
  await page.goto(base);
  await page.getByRole('button', { name: '훈련 시작', exact: true }).click(); await at(page, 'GR00');
  await page.getByRole('button', { name: '다음', exact: true }).click(); await at(page, 'GR01');
  await page.getByRole('button', { name: '연습용 도감 열기', exact: true }).click(); await at(page, 'GR02');
  await page.getByRole('button', { name: '칭호 견본 열기', exact: true }).click(); await at(page, 'GR03');
  await page.getByRole('button', { name: '길을 살피는 연습가 · 연습용 선택', exact: true }).click(); await at(page, 'GR04');
  return { ctx, page };
}
async function prepareGeometry(page, impossible = false) {
  await page.addStyleTag({ content: `body { min-height:2400px !important; } body:has(.wr-tutorial-layer[data-step="GR05"]) [data-tutorial-anchor="growth.title-controls"] { position:absolute !important;left:29px !important;top:${impossible ? 380 : 710.28125}px !important;width:710px !important;height:${impossible ? 900 : 231.71875}px !important;box-sizing:border-box !important;margin:0 !important; } body:has(.wr-tutorial-layer[data-step="GR05"]) .wr-tutorial-bubble { height:340px !important; }` });
  await page.evaluate(() => window.scrollTo({ top: 380, behavior: 'instant' }));
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const original = window.__originalScrollTo || window.scrollTo.bind(window);
    window.__originalScrollTo = original;
    window.__scrollRepairCalls = [];
    window.__manualScroll = top => original({ top, behavior: 'instant' });
    window.scrollTo = (...args) => {
      const target = document.querySelector('[data-tutorial-anchor="growth.title-controls"]')?.getBoundingClientRect();
      window.__scrollRepairCalls.push({ request: args[0], before: { scrollY, top: target?.top, bottom: target?.bottom, height: target?.height, viewportHeight: innerHeight } });
      return original(...args);
    };
  });
  await page.getByRole('button', { name: '다음', exact: true }).click();
}
try {
  const first = await createPage();
  await check('768px visible blocked GR05 repositions once, remeasures spotlight and permits real remove action', async () => {
    const { page } = first;
    await prepareGeometry(page);
    await at(page, 'GR05');
    const measured = await page.evaluate(() => {
      const target = document.querySelector('[data-tutorial-anchor="growth.title-controls"]').getBoundingClientRect();
      const bubble = document.querySelector('.wr-tutorial-bubble').getBoundingClientRect();
      return { calls: window.__scrollRepairCalls.length, before: window.__scrollRepairCalls[0]?.before, scrollY, fits: target.top >= 0 && target.bottom <= innerHeight && bubble.top >= 0 && bubble.bottom <= innerHeight,
        overlap: target.left < bubble.right && target.right > bubble.left && target.top < bubble.bottom && target.bottom > bubble.top,
        spotlight: !!document.querySelector('.wr-tutorial-target'), target: { top: target.top, height: target.height } };
    });
    assert.equal(measured.calls, 1); assert.ok(measured.before.top >= 0 && measured.before.bottom <= measured.before.viewportHeight, 'target was already fully visible before collision repair'); assert.equal(measured.fits, true); assert.equal(measured.overlap, false); assert.equal(measured.spotlight, true);
    report.repairedGeometry = measured;
    await page.screenshot({ path: fileURLToPath(new URL('gr05-repaired-768.png', out)) });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize')); window.__manualScroll(380); });
    await page.waitForFunction(() => document.querySelector('.wr-tutorial-layer')?.dataset.ready === 'false');
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.__scrollRepairCalls.length), 1, 'manual scrolling is not repeatedly overridden');
    await page.getByRole('button', { name: '위치 다시 맞추기', exact: true }).click(); await at(page, 'GR05');
    assert.equal(await page.evaluate(() => window.__scrollRepairCalls.length), 2, 'explicit retry grants exactly one new repair');
    await page.getByRole('button', { name: '이전', exact: true }).click(); await at(page, 'GR04');
    await prepareGeometry(page); await at(page, 'GR05');
    assert.equal(await page.evaluate(() => window.__scrollRepairCalls.length), 1, 'previous/next visit receives a new one-shot repair');
    await page.getByRole('button', { name: '연습용 해제', exact: true }).click(); await at(page, 'GR06');
    assert.equal(await page.locator('[data-testid="growth-title"]').innerText(), '연습 칭호 없음');
    await page.getByRole('button', { name: '처음부터 다시', exact: true }).click(); await at(page, 'GR00');
    await page.getByRole('button', { name: '다음', exact: true }).click(); await at(page, 'GR01');
    await page.getByRole('button', { name: '연습용 도감 열기', exact: true }).click(); await at(page, 'GR02');
    await page.getByRole('button', { name: '칭호 견본 열기', exact: true }).click(); await at(page, 'GR03');
    await page.getByRole('button', { name: '길을 살피는 연습가 · 연습용 선택', exact: true }).click(); await at(page, 'GR04');
    await prepareGeometry(page); await at(page, 'GR05');
    assert.equal(await page.evaluate(() => window.__scrollRepairCalls.length), 1, 'restart visit receives a new one-shot repair');
    await page.getByRole('button', { name: '연습용 해제', exact: true }).click(); await at(page, 'GR06');
  });
  await first.ctx.close();
  const second = await createPage();
  await check('oversized visible target remains blocked without scroll loop and can still pause safely', async () => {
    const { page } = second;
    await prepareGeometry(page, true);
    await page.waitForFunction(() => document.querySelector('.wr-tutorial-layer')?.dataset.step === 'GR05' && document.querySelector('.wr-tutorial-layer')?.dataset.ready === 'false');
    await page.getByRole('button', { name: '위치 다시 맞추기', exact: true }).waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__scrollRepairCalls.length), 0);
    assert.equal(await page.locator('.wr-tutorial-target').count(), 0);
    await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'paused');
  });
  await second.ctx.close();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.applicationCommands, []); assert.deepEqual(report.forbiddenRequests, []);
  report.success = true;
} catch (error) {
  report.success = false; report.failure = error.stack; console.error(error); process.exitCode = 1;
  const page = browser.contexts().flatMap(ctx => ctx.pages()).at(-1);
  if (page) { console.error((await page.locator('body').innerText()).slice(-1600)); await page.screenshot({ path: fileURLToPath(new URL('failure.png', out)) }); }
} finally { await writeFile(new URL('browser-report.json', out), JSON.stringify(report, null, 2)); await browser.close(); }
