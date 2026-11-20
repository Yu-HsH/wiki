import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:5181/tutorial/fixtures/index.html';
const out = new URL('../.temp/ux-refine-20261106/a/initial-layout/intro/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { basis: '9676b0185fd5a71c617c14c1c332b32efc9ba74a', dateKst: '2026-11-06', uncommitted: true, environment: 'Chromium desktop fixture (not real mobile / DB)', checks: [], errors: [], forbiddenRequests: [], applicationCommands: [] };
const check = async (name, work) => { await work(); report.checks.push(name); console.log('PASS', name); };
const step = page => page.locator('.wr-tutorial-layer').getAttribute('data-step');
async function at(page, id) { await page.waitForFunction(expected => document.querySelector('.wr-tutorial-layer')?.dataset.step === expected && document.querySelector('.wr-tutorial-layer')?.dataset.ready === 'true', id); }
async function next(page, id) { await page.getByRole('button', { name: '다음', exact: true }).click(); await at(page, id); }
async function noCover(page) {
  await page.waitForTimeout(70);
  return page.evaluate(() => {
    const bubble = document.querySelector('.wr-tutorial-bubble').getBoundingClientRect();
    const target = document.querySelector('.wr-tutorial-target')?.getBoundingClientRect();
    const overlap = target && bubble.left < target.right - 8 && bubble.right > target.left + 8 && bubble.top < target.bottom - 8 && bubble.bottom > target.top + 8;
    const viewport = window.visualViewport;
    return { overlap: Boolean(overlap), fits: bubble.left >= viewport.offsetLeft - 1 && bubble.right <= viewport.offsetLeft + viewport.width + 1 && bubble.top >= viewport.offsetTop - 1 && bubble.bottom <= viewport.offsetTop + viewport.height + 1, overflow: document.documentElement.scrollWidth > innerWidth };
  });
}
async function context(width, options = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...options });
  const page = await ctx.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || /\/(rest|auth|functions)\/v1\//.test(url.pathname)) { report.applicationCommands.push({ method: route.request().method(), path: url.pathname }); return route.abort(); }
    if (url.origin === 'http://127.0.0.1:5181') return route.continue();
    report.forbiddenRequests.push({ method: route.request().method(), url: url.origin + url.pathname });
    return route.abort();
  });
  return { ctx, page };
}
try {
  report.initialLayouts = [];
  for (const width of [390, 1440]) {
    const initial = await context(width);
    const { page } = initial;
    // Observe every ready commit and paint opportunity. Never wait away a bad frame.
    await page.addInitScript(() => {
      const probe = window.__tutorialInitialLayout = { operation: 'start', recording: true, samples: [], violations: [] };
      const capture = phase => {
        if (!probe.recording) return;
        const layer = document.querySelector('.wr-tutorial-layer[data-step="W00"][data-ready="true"]');
        const bubble = layer?.querySelector('.wr-tutorial-bubble');
        if (!bubble) return;
        const rect = bubble.getBoundingClientRect();
        const viewport = window.visualViewport;
        const sample = { phase, operation: probe.operation, top: rect.top, bottom: rect.bottom, height: rect.height,
          fits: rect.left >= viewport.offsetLeft - 1 && rect.right <= viewport.offsetLeft + viewport.width + 1 && rect.top >= viewport.offsetTop - 1 && rect.bottom <= viewport.offsetTop + viewport.height + 1 };
        if (probe.samples.length < 300) probe.samples.push(sample);
        if (!sample.fits) probe.violations.push(sample);
      };
      new MutationObserver(() => capture('ready-commit')).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ready', 'style'] });
      const paint = () => { capture('frame'); requestAnimationFrame(paint); };
      requestAnimationFrame(paint);
    });
    await check(`${width}px W00 fits from its first ready commit after start, resume, F5 and dismiss/restart`, async () => {
      await page.goto(base);
      const checkpoint = async () => {
        await at(page, 'W00');
        // One paint opportunity is observed; all earlier bad commits stay recorded.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
        assert.equal(await page.locator('.wr-tutorial-context [aria-current="step"]').innerText(), 'HOME');
        assert.equal(await page.locator('.wr-tutorial-bubble').getAttribute('role'), 'dialog');
      };
      await page.getByRole('button', { name: '훈련 시작', exact: true }).click(); await checkpoint('start');
      await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
      await page.evaluate(() => { window.__tutorialInitialLayout.operation = 'resume'; });
      await page.getByRole('button', { name: '이어하기', exact: true }).click(); await checkpoint('resume');
      const beforeReload = await page.evaluate(() => window.__tutorialInitialLayout);
      await page.reload();
      await page.evaluate(() => { window.__tutorialInitialLayout.operation = 'F5-resume'; });
      await page.getByRole('button', { name: '이어하기', exact: true }).click(); await checkpoint('F5-resume');
      for (let cycle = 1; cycle <= 3; cycle++) {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '여기서 종료', exact: true }).click();
        await page.evaluate(cycle => { window.__tutorialInitialLayout.operation = `dismiss-restart-${cycle}`; }, cycle);
        await page.getByRole('button', { name: '다시 시작', exact: true }).click(); await checkpoint(`dismiss-restart-${cycle}`);
      }
      const afterReload = await page.evaluate(() => window.__tutorialInitialLayout);
      const measured = { width, samples: [...beforeReload.samples, ...afterReload.samples], violations: [...beforeReload.violations, ...afterReload.violations] };
      report.initialLayouts.push(measured);
      await page.evaluate(() => { window.__tutorialInitialLayout.recording = false; });
      for (const operation of ['start', 'resume', 'F5-resume', 'dismiss-restart-1', 'dismiss-restart-2', 'dismiss-restart-3']) assert.ok(measured.samples.some(sample => sample.operation === operation), operation);
      assert.deepEqual(measured.violations, [], 'Every ready W00 commit must fit before the next observer frame');
      await page.screenshot({ path: new URL(`w00-first-ready-${width}.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
    });
    await check(`${width}px actual W00 bubble resize is observed after replacing the loading node`, async () => {
      const before = await page.locator('.wr-tutorial-bubble').boundingBox();
      // A fixed bubble does not resize documentElement. Style attributes are not
      // in the app MutationObserver filter: its own ResizeObserver must react.
      await page.locator('.wr-tutorial-bubble').evaluate(element => { element.style.height = (Math.ceil(element.getBoundingClientRect().height) + 108) + 'px'; });
      await page.waitForFunction(() => {
        const rect = document.querySelector('.wr-tutorial-bubble').getBoundingClientRect();
        return Math.abs(rect.bottom - (visualViewport.offsetTop + visualViewport.height - 12)) < 1;
      }, null, { timeout: 3000 });
      const expanded = await page.locator('.wr-tutorial-bubble').boundingBox();
      assert.ok(expanded.height > before.height + 90);
      assert.ok(expanded.y < before.y - 90, 'new real section resize repositions the bottom dock');
      await page.locator('.wr-tutorial-bubble').evaluate(element => { element.style.removeProperty('height'); });
      await page.waitForFunction(expected => Math.abs(document.querySelector('.wr-tutorial-bubble').getBoundingClientRect().top - expected) < 1, before.y, { timeout: 3000 });
      assert.equal(await page.locator('.wr-tutorial-layer').getAttribute('data-step'), 'W00');
      assert.equal(await page.locator('.wr-tutorial-layer').getAttribute('data-ready'), 'true');
      report.initialLayouts.find(item => item.width === width).resize = { before, expanded, restored: await page.locator('.wr-tutorial-bubble').boundingBox() };
    });
    await initial.ctx.close();
  }
  const reported = await context(390);
  await check('390px S04 keeps the next fruit link visible; S05 spotlights and clicks the same protected link', async () => {
    const { page } = reported;
    await page.goto(base);
    await page.getByRole('button', { name: '훈련 시작', exact: true }).click(); await at(page, 'W00');
    await next(page, 'H01'); await next(page, 'H02');
    await page.locator('[data-tutorial-anchor="home.start"]').click(); await at(page, 'P01');
    await next(page, 'P02'); await next(page, 'P03');
    await page.locator('[data-tutorial-anchor="play.solo"]').click(); await at(page, 'S01');
    await page.getByRole('button', { name: '연습 출발', exact: true }).click(); await at(page, 'S02');
    await next(page, 'S03');
    // Reproduce the reported integrated geometry using actual fixture DOM anchors.
    // This fixture-only style applies to S04; S05 returns to its normal layout.
    await page.addStyleTag({ content: 'body:has(.wr-tutorial-layer[data-step="S04"]) [data-tutorial-anchor="solo.target"] { position:fixed !important;left:12px !important;top:130px !important;width:366px !important;height:28px !important; } body:has(.wr-tutorial-layer[data-step="S04"]) [data-tutorial-anchor="solo.timer"] { position:fixed !important;left:12px !important;top:180px !important;width:366px !important;height:28px !important; } body:has(.wr-tutorial-layer[data-step="S04"]) [data-tutorial-anchor="solo.link.fruit"] { position:fixed !important;left:32px !important;top:368px !important;width:40px !important;height:20px !important; }' });
    await next(page, 'S04'); await page.waitForTimeout(90);
    report.s04LinkGeometry = await page.evaluate(() => {
      const link = document.querySelector('[data-tutorial-anchor="solo.link.fruit"]');
      const fruit = link.getBoundingClientRect();
      const bubble = document.querySelector('.wr-tutorial-bubble').getBoundingClientRect();
      return { protected: link.hasAttribute('data-tutorial-protect'),
        link: { left:fruit.left, top:fruit.top, width:fruit.width, height:fruit.height },
        bubble: { left:bubble.left, top:bubble.top, width:bubble.width, height:bubble.height },
        overlap: fruit.left < bubble.right && fruit.right > bubble.left && fruit.top < bubble.bottom && fruit.bottom > bubble.top,
        visible: fruit.width > 0 && fruit.height > 0 && fruit.top >= 0 && fruit.bottom <= innerHeight };
    });
    await page.screenshot({ path: new URL('s04-fruit-visible-390.png', out).pathname.replace(/^\/(\w:)/, '$1') });
    assert.equal(report.s04LinkGeometry.overlap, false, 'S04 explanation must not cover the upcoming fruit link');
    assert.equal(report.s04LinkGeometry.visible, true);
    assert.equal(await page.locator('.wr-tutorial-target').count(), 1, 'S04 timer spotlight remains active');
    assert.deepEqual(await noCover(page), { overlap: false, fits: true, overflow: false });
    await next(page, 'S05');
    assert.equal(await page.locator('.wr-tutorial-target').count(), 1, 'protected current target still receives its spotlight');
    assert.deepEqual(await noCover(page), { overlap: false, fits: true, overflow: false });
    await page.screenshot({ path: new URL('s05-protected-fruit-target-390.png', out).pathname.replace(/^\/(\w:)/, '$1') });
    await page.getByRole('link', { name: '과일', exact: true }).click(); await at(page, 'S06');
  });
  await reported.ctx.close();
  for (const width of [320, 390, 430, 768, 1440]) {
    const { ctx, page } = await context(width);
    await page.goto(base);
    await check(`${width}: start, HOME action, PLAY action, SOLO links, detour, result, completion`, async () => {
      await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
      await at(page, 'W00');
      assert.equal(await page.locator('.wr-tutorial-layer').getAttribute('data-context'), 'HOME');
      assert.equal(await page.locator('.wr-tutorial-dim > rect').getAttribute('opacity'), '0.28');
      assert.equal(await page.locator('.wr-tutorial-context [aria-current="step"]').innerText(), 'HOME');
      const overview = await page.locator('.wr-tutorial-bubble').boundingBox();
      assert.ok(overview.y + overview.height >= 887 || overview.y <= 13, 'HOME overview uses a viewport edge');
      assert.equal(await page.locator('.wr-tutorial-layer').evaluate(element => getComputedStyle(element).filter), 'none');
      assert.equal(await page.locator('.wr-tutorial-layer').evaluate(element => getComputedStyle(element).backdropFilter), 'none');
      await page.screenshot({ path: new URL(`overview-home-${width}.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
      await next(page, 'H01'); await next(page, 'H02');
      assert.equal(await page.getByRole('button', { name: '다음', exact: true }).count(), 0);
      assert.deepEqual(await noCover(page), { overlap: false, fits: true, overflow: false });
      await page.screenshot({ path: new URL(`home-${width}.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
      await page.locator('[data-tutorial-anchor="home.start"]').click();
      await at(page, 'P01'); assert.equal(await page.locator('.wr-tutorial-layer').getAttribute('data-context'), 'PLAY'); await next(page, 'P02'); await next(page, 'P03');
      assert.deepEqual(await noCover(page), { overlap: false, fits: true, overflow: false });
      await page.screenshot({ path: new URL(`play-${width}.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
      await page.locator('[data-tutorial-anchor="play.solo"]').click();
      await at(page, 'S01'); assert.equal(await page.locator('.wr-tutorial-layer').getAttribute('data-context'), 'SOLO'); await page.getByRole('button', { name: '연습 출발', exact: true }).click();
      await at(page, 'S02'); await next(page, 'S03'); await next(page, 'S04');
      await page.waitForTimeout(70);
      assert.equal(await page.locator('[data-tutorial-anchor="solo.link.fruit"]').evaluate(link => {
        const fruit = link.getBoundingClientRect(); const bubble = document.querySelector('.wr-tutorial-bubble').getBoundingClientRect();
        return fruit.left < bubble.right && fruit.right > bubble.left && fruit.top < bubble.bottom && fruit.bottom > bubble.top;
      }), false, 'ordinary S04 also keeps the next fruit link uncovered');
      await next(page, 'S05');
      assert.deepEqual(await noCover(page), { overlap: false, fits: true, overflow: false });
      await page.screenshot({ path: new URL(`wiki-${width}.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
      await page.getByRole('link', { name: '과일', exact: true }).click();
      await at(page, 'S06'); await next(page, 'S07');
      await page.getByRole('link', { name: '요리', exact: true }).click(); await at(page, 'S08');
      await page.getByRole('button', { name: '연습 전용 · 직전 선택 다시 하기', exact: true }).click(); await at(page, 'S07');
      await page.getByRole('link', { name: '식물', exact: true }).click(); await at(page, 'S09');
      await page.getByRole('button', { name: '연습 결과 보기', exact: true }).click(); await at(page, 'R01');
      await next(page, 'F01'); await page.getByRole('button', { name: '훈련 마치기', exact: true }).click();
      assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'completed');
      assert.equal(await page.locator('.wr-tutorial-layer').count(), 0);
      assert.equal(await page.locator('[inert]').count(), 0);
      assert.equal(await page.locator('[data-tutorial-return-focus]').evaluate(element => document.activeElement === element), true);
    });
    await ctx.close();
  }
  const { ctx, page } = await context(390, { reducedMotion: 'reduce' });
  await page.goto(base);
  await check('keyboard: Tab/Shift+Tab stay in target + controls; Enter + Space perform actions', async () => {
    await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
    await next(page, 'H01'); await next(page, 'H02');
    await page.locator('[data-tutorial-anchor="home.start"]').focus();
    await page.keyboard.press('Enter'); await at(page, 'P01');
    await next(page, 'P02'); await next(page, 'P03');
    await page.locator('[data-tutorial-anchor="play.solo"]').focus();
    await page.keyboard.press('Space'); await at(page, 'S01');
    for (const key of ['Tab', 'Shift+Tab', 'Tab', 'Tab']) {
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.wr-tutorial-bubble, [data-tutorial-anchor="practice.start"]')), true);
    }
    await page.locator('[data-tutorial-anchor="practice.start"]').focus(); await page.keyboard.press('Enter');
    await at(page, 'S02'); await next(page, 'S03'); await next(page, 'S04'); await next(page, 'S05');
    const animation = await page.locator('.wr-tutorial-arrow').evaluate(element => getComputedStyle(element).animationName);
    assert.equal(animation, 'none');
    await page.getByRole('link', { name: '과일', exact: true }).focus(); await page.keyboard.press('Space'); await at(page, 'S06');
  });
  await check('Escape confirmation, continue, pause + F5 + explicit resume checkpoint route', async () => {
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('heading', { name: '튜토리얼을 여기서 마칠까요?' }).count(), 1);
    await page.getByRole('button', { name: '계속하기', exact: true }).click();
    await at(page, 'S06'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
    await page.reload();
    assert.equal(await page.locator('.wr-tutorial-layer').count(), 0);
    await page.getByRole('button', { name: '이어하기', exact: true }).click(); await at(page, 'S06');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-route'), '/tutorial/practice/solo');
  });
  await check('route mismatch does not navigate/click implicitly; explicit recovery restores checkpoint', async () => {
    await page.evaluate(() => { location.hash = '/lobby'; });
    await page.getByRole('button', { name: '연습 화면으로 돌아가기', exact: true }).click();
    await page.waitForFunction(() => location.hash === '#/tutorial/practice/solo');
    await at(page, 'S06');
  });
  await check('missing anchor stops action safely with retry / pause controls', async () => {
    await next(page, 'S07');
    await page.locator('[data-tutorial-anchor="solo.choices"]').evaluate(element => element.removeAttribute('data-tutorial-anchor'));
    await page.setViewportSize({ width: 391, height: 900 });
    await page.getByRole('button', { name: '다시 찾기', exact: true }).waitFor();
    assert.equal(await step(page), 'S07');
    assert.equal(await page.locator('.wr-tutorial-target').count(), 0);
    await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.reload(); await page.getByRole('button', { name: '이어하기', exact: true }).click(); await at(page, 'S07');
  });
  await check('account switch separates guest/A/B; dismissed version survives F5; manual restart works', async () => {
    await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
    await page.getByLabel('검증 계정').selectOption('member-a');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'unseen');
    await page.getByRole('button', { name: '훈련 시작', exact: true }).click(); await at(page, 'W00');
    await next(page, 'H01'); await next(page, 'H02');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '여기서 종료', exact: true }).click();
    await page.getByLabel('검증 계정').selectOption('member-b');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'unseen');
    await page.getByLabel('검증 계정').selectOption('member-a');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'dismissed');
    await page.getByRole('button', { name: '다시 시작', exact: true }).click(); await at(page, 'W00');
  });
  await check('virtual keyboard approximation: visualViewport resize/offset remains within visible space or blocks target', async () => {
    await next(page, 'H01'); await next(page, 'H02');
    await page.evaluate(() => {
      const fake = new EventTarget();
      Object.assign(fake, { width: 390, height: 360, offsetLeft: 0, offsetTop: 30 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: fake });
      window.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(120);
    const geometry = await noCover(page);
    assert.equal(geometry.fits, true);
    assert.equal(geometry.overlap, false);
    await page.screenshot({ path: new URL('visual-viewport-keyboard-approximation.png', out).pathname.replace(/^\/(\w:)/, '$1') });
  });
  await ctx.close();
  const doubleClick = await context(390);
  await doubleClick.page.goto(base);
  await check('rapid double click advances only one observe step', async () => {
    const page = doubleClick.page;
    await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).dblclick();
    await at(page, 'H01');
    assert.equal(await step(page), 'H01');
  });
  await doubleClick.ctx.close();
  const replacement = await context(390);
  await replacement.page.goto(base);
  await check('same-step same-coordinate DOM anchor replacement accepts the new real WikiViewer link', async () => {
    const page = replacement.page;
    await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
    await next(page, 'H01'); await next(page, 'H02');
    await page.locator('[data-tutorial-anchor="home.start"]').click(); await at(page, 'P01');
    await next(page, 'P02'); await next(page, 'P03');
    await page.locator('[data-tutorial-anchor="play.solo"]').click(); await at(page, 'S01');
    await page.getByRole('button', { name: '연습 출발', exact: true }).click(); await at(page, 'S02');
    await next(page, 'S03'); await next(page, 'S04'); await next(page, 'S05');
    const anchor = page.locator('[data-tutorial-anchor="solo.link.fruit"]');
    const before = await anchor.boundingBox();
    await anchor.evaluate(element => { const clone = element.cloneNode(true); element.replaceWith(clone); });
    await page.waitForTimeout(100);
    const after = await anchor.boundingBox();
    assert.deepEqual(after, before);
    await anchor.click(); await at(page, 'S06');
  });
  await check('real match signal pauses coaching and prevents start while match is active', async () => {
    const page = replacement.page;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tutorial-fixture:match', { detail: true })));
    await page.waitForFunction(() => document.querySelector('[data-testid="tutorial-state"]')?.dataset.status === 'paused');
    assert.equal(await page.locator('.wr-tutorial-layer').count(), 0);
    assert.equal(await page.getByRole('button', { name: '이어하기', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tutorial-fixture:match', { detail: false })));
    await page.getByRole('button', { name: '이어하기', exact: true }).click(); await at(page, 'S06');
  });
  await replacement.ctx.close();
  const storageBlocked = await context(390);
  await storageBlocked.page.addInitScript(() => {
    Storage.prototype.getItem = function() { throw new DOMException('denied', 'SecurityError'); };
    Storage.prototype.setItem = function() { throw new DOMException('denied', 'SecurityError'); };
  });
  await storageBlocked.page.goto(base);
  await check('blocked localStorage: warning + guest/member/guest continuity within one tab', async () => {
    const page = storageBlocked.page;
    await page.getByRole('button', { name: '훈련 시작', exact: true }).click();
    await next(page, 'H01'); await next(page, 'H02');
    assert.equal(await page.getByText('이 탭에서만 진행을 기억해요.').count(), 1);
    await page.getByRole('button', { name: '다음에 이어서', exact: true }).click();
    await page.getByLabel('검증 계정').selectOption('member-a');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'unseen');
    await page.getByLabel('검증 계정').selectOption('guest');
    await page.getByRole('button', { name: '이어하기', exact: true }).click(); await at(page, 'H02');
  });
  await storageBlocked.ctx.close();
  const automatic = await context(390);
  await check('automatic offer requires verified first-login signal; unknown members receive no offer', async () => {
    const page = automatic.page;
    await page.goto(`${base}?auto=1&identity=member-a`);
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'unseen');
    await page.getByLabel('검증 계정').selectOption('new-member');
    await page.waitForFunction(() => document.querySelector('[data-testid="tutorial-state"]')?.dataset.status === 'offered');
    assert.equal(await page.locator('.wr-tutorial-layer').count(), 0);
    await page.getByRole('button', { name: '다시 보지 않기', exact: true }).click();
    await page.getByLabel('검증 계정').selectOption('member-b');
    await page.getByLabel('검증 계정').selectOption('new-member');
    assert.equal(await page.locator('[data-testid="tutorial-state"]').getAttribute('data-status'), 'dismissed');
  });
  await automatic.ctx.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.forbiddenRequests, []);
  assert.deepEqual(report.applicationCommands, []);
  report.success = true;
} catch (error) {
  report.success = false; report.failure = error.stack; console.error(error);
  const pages = browser.contexts().flatMap(context => context.pages());
  if (pages.length) { console.error((await pages.at(-1).locator('body').innerText()).slice(-2000)); await pages.at(-1).screenshot({ path: new URL('failure.png', out).pathname.replace(/^\/(\w:)/, '$1') }); }
  process.exitCode = 1;
} finally {
  await writeFile(new URL('browser-report.json', out), JSON.stringify(report, null, 2));
  await browser.close();
}
