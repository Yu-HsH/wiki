// Frontend-only browser checks. All backend responses are local UI fixtures;
// no database, Edge Function, authentication service or production is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const before = process.argv.includes('--before');
const nativeZoom = process.argv.includes('--native-zoom');
const port = Number(process.env.JUNGLE65_DESIGN_PORT) || (nativeZoom ? 5198 : 5197);
const runDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const output = process.env.JUNGLE65_DESIGN_OUTPUT ? path.resolve(root, process.env.JUNGLE65_DESIGN_OUTPUT) : path.join(root, `.temp/jungle65-final-${runDate.replaceAll('-', '')}`, nativeZoom ? 'native-zoom' : before ? 'before' : 'browser');
const sourceRoot = process.env.JUNGLE65_DESIGN_SOURCE_ROOT && path.resolve(root, process.env.JUNGLE65_DESIGN_SOURCE_ROOT);
const visualBaseline = process.env.JUNGLE65_DESIGN_VISUAL_BASELINE && path.resolve(root, process.env.JUNGLE65_DESIGN_VISUAL_BASELINE);
const fontCache = new Map();
fs.mkdirSync(output, { recursive: true });
const api = 'http://127.0.0.1:54329'; // Intercepted in the browser, never sent.
const user = { id: '00000000-0000-4000-8000-000000000065', aud: 'authenticated', role: 'authenticated', email: 'design@example.invalid', user_metadata: { nickname: '디자인 검수' } };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = [ { alg: 'HS256', typ: 'JWT' }, { sub: user.id, exp: expires, role: 'authenticated' } ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.ui-fixture';
const session = { user, access_token: token, refresh_token: 'ui-fixture', token_type: 'bearer', expires_at: expires, expires_in: 3600 };
const report = { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), date: runDate, uncommitted: true, baseline: before, fixtureBackend: true, checks: [], functionalChecks: [], visualChecks: [], screens: [], errors: [], warnings: [], images: [], externalRequests: [], visualPolicy: { preserved: ['landing', 'home', 'play'], changesCheckedSeparately: ['group camp mobile compression', 'reproduced mobile item sheet overlap'], baseline: visualBaseline || null } };
const check = (name, kind = 'functional') => { report.checks.push(name); report[`${kind}Checks`].push(name); console.log(`PASS ${kind}: ${name}`); };
const server = await createServer({
  root, configFile: false, envFile: false,
  cacheDir: path.join(output, 'vite-cache'),
  plugins: sourceRoot ? [{name: 'preserved-design-source', enforce: 'pre', load(id) {const rel = path.relative(root, id.split('?')[0]);const saved = path.join(sourceRoot, rel);if (!rel.startsWith('..') && /\.(?:[cm]?jsx?|css)$/.test(rel) && fs.existsSync(saved) && fs.statSync(saved).isFile()) return fs.readFileSync(saved, 'utf8');}}] : [],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(api),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('ui-fixture-public-key'),
    'import.meta.env.VITE_MAINTENANCE': JSON.stringify(''),
  },
  server: { host: '127.0.0.1', port, strictPort: true, watch: { ignored: ['**/.temp/**'] } },
});
let browser;
let nativeContext;
const base = `http://127.0.0.1:${port}`;

async function makePage(viewport, actor = null, touch = false) {
  const context = nativeContext || await browser.newContext({ viewport, isMobile: touch, hasTouch: touch });
  if (actor) await context.addInitScript(({ actor, session }) => {
    if (actor === 'member') localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
    else localStorage.setItem('wiki_game_local_user', JSON.stringify({ id: 'guest-design', mode: 'local', isGuest: true, displayName: '게스트 검수' }));
  }, { actor, session });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome:') return route.continue();
    if (url.origin === base) return route.continue();
    // Original official webfonts only. Backend/Wikipedia requests stay synthetic.
    if (/^(cdn.jsdelivr.net|img.cafe24.com|hangeul.pstatic.net)$/.test(url.hostname)) {
      if (!fontCache.has(url.href)) fontCache.set(url.href, (async () => {const response = await route.fetch();return {status: response.status(), body: await response.body(), headers: {'content-type': response.headers()['content-type'], 'access-control-allow-origin': '*'}};})());
      return route.fulfill(await fontCache.get(url.href));
    }
    if (url.origin === api) {
      let data = [];
      if (url.pathname.startsWith('/auth/v1/')) data = user;
      else if (url.pathname.endsWith('/ensure_today_daily_challenge')) data = [{ start_title: '대한민국', target_title: '한글', challenge_date: runDate, hint: '디자인 검수용 코스' }];
      else if (url.pathname.endsWith('/get_xp_summary_v1')) data = { ok: true, total_xp: 435, level: 5, current_level_xp: 35, next_level_xp: 200 };
      else if (url.pathname.endsWith('/get_my_achievements_v1')) data = { ok: true, achievements: [], hidden: { discovered: 0, achievements: [] }, unseenCount: 0 };
      else if (url.pathname.endsWith('/get_profile_cards_v1')) data = { ok: true, cards: {} };
      else if (url.pathname.endsWith('/profiles')) data = route.request().headers().accept?.includes('object') ? { id: user.id, nickname: '디자인 검수' } : [];
      return route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/0' } });
    }
    // Wikipedia, ads and web fonts are fixtures too, making this check offline.
    report.externalRequests.push(url.origin + url.pathname);
    return route.fulfill({ status: 200, contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'application/json', body: '{}' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  // Stable HOME query labels make protected-screen pixel comparisons reproducible.
  await page.clock.setFixedTime(new Date(`${runDate}T12:00:00+09:00`));
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(message.text());
    else if (message.type() === 'warning') report.warnings.push(message.text());
  });
  page.on('response', response => {
    if (response.url().includes('/assets/wiki-race/jungle65/')) report.images.push({ path: new URL(response.url()).pathname, status: response.status(), type: response.headers()['content-type'] });
  });
  return page;
}

async function saveScreenshot(page, label) {
  await page.mouse.move(0, 0);
  if (!nativeZoom) return page.screenshot({ path: path.join(output, label + '.png'), fullPage: true, animations: 'disabled' });
  const cdp = await page.context().newCDPSession(page);
  try {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    // captureScreenshot's clip is in DIP, whereas the layout assertions use CSS
    // pixels. At real browser zoom these differ; using CSS clips crops the PNG.
    const { x, y, width, height } = metrics.cssContentSize;
    const zoom = report.nativeZoom.settingAfter;
    const clip = { x: x * zoom, y: y * zoom, width: width * zoom, height: height * zoom, scale: 1 };
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true, clip });
    fs.writeFileSync(path.join(output, label + '.png'), Buffer.from(shot.data, 'base64'));
    report.captures ??= [];
    report.captures.push({ label, clipDIP: clip, cssContentSize: metrics.cssContentSize });
  } finally { await cdp.detach(); }
}

async function screen(page, label) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900); // Allow the existing once-only scene entrances to finish.
  await saveScreenshot(page, label);
  const data = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, windowInnerWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    images: [...document.querySelectorAll('img')].map(img => ({ src: new URL(img.currentSrc).pathname, width: img.naturalWidth, height: img.naturalHeight, box: { width: img.clientWidth, height: img.clientHeight } })),
  }));
  report.screens.push({ label, ...data });
  if (!before) {
    assert.ok(data.scrollWidth <= data.viewport + 1, `${label}: horizontal overflow`);
    assert.ok(data.images.every(img => img.width > 0), `${label}: broken image`);
    const art = data.images.filter(img => /jungle65\//.test(img.src));
    assert.equal(art.length, label.startsWith('play') ? 3 : 1, `${label}: new artwork must not fall back to old art`);
    if (label.startsWith('play')) {
      const heights = art.map(img => img.box.height);
      assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, 'mode artwork heights match');
    }
    check(`${label}: loaded images, no horizontal overflow`, 'visual');
  }
}

async function actionStyle(card) {
  return card.locator('.wr-mode-action').evaluate(element => {
    const style = getComputedStyle(element), parent = getComputedStyle(element.closest('button'));
    return { color: style.color, background: style.backgroundImage, opacity: style.opacity, filter: style.filter, parentOpacity: parent.opacity, parentFilter: parent.filter, disabled: element.closest('button').disabled, ariaDisabled: element.closest('button').getAttribute('aria-disabled') };
  });
}

async function landingAlignment(page, label) {
  const samples = await page.evaluate(() => {
    const img = document.querySelector('.wr65-landing-picture');
    const rect = img.getBoundingClientRect();
    // Painted button bounds measured in the supplied 1672 x 941 artwork.
    return [
      { selector: '.wr65-landing-hit-login', x: 607, y: 545, width: 230, height: 71 },
      { selector: '.wr65-landing-hit-signup', x: 865, y: 545, width: 225, height: 71 },
    ].map(art => {
      const button = document.querySelector(art.selector);
      const bounds = button.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return { selector: art.selector, hiddenForMobile: true };
      const hits = [.2, .5, .8].map(fraction => {
        const x = rect.x + (art.x + art.width * fraction) / img.naturalWidth * rect.width;
        const y = rect.y + (art.y + art.height / 2) / img.naturalHeight * rect.height;
        return document.elementFromPoint(x, y)?.closest('button') === button;
      });
      return { selector: art.selector, hits, box: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
    });
  });
  report.hotspots ??= [];
  report.hotspots.push({ label, samples });
  for (const sample of samples) if (!sample.hiddenForMobile) assert.ok(sample.hits.every(Boolean), `${label}: painted button must hit its real HTML button`);
  check(`${label}: painted login/signup buttons align with real targets (mobile uses separate controls)`, 'visual');
}

async function keyboardAuth(page, controls, label, signup = false) {
  const login = controls.getByRole('button', { name: signup ? /회원가입/ : /로그인/ });
  await login.focus();
  await login.press('Enter');
  const dialog = page.getByRole('dialog', { name: signup ? '새 탐험가 등록' : '탐험가 로그인', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByPlaceholder('사용할 아이디')).toBeFocused();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < 14; step++) {
      await page.keyboard.press(key);
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, `${label}: ${key} remains inside the dialog`);
    }
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(login).toBeFocused();
  await saveScreenshot(page, `${label}-keyboard-focus`);
  check(`${label}: Enter opens auth; Tab/Shift+Tab stay inside; Escape closes and restores focus`);
}

async function reviewNativeZoom() {
  const page = await makePage(null);
  await page.goto(base);
  await expect(page.locator('.wr65-landing-picture')).toBeVisible();
  await page.evaluate(() => { document.title = 'Jungle65 browser zoom review'; });
  const baseline = await page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, outerHeight, dpr: devicePixelRatio, visualScale: visualViewport.scale }));
  fs.writeFileSync(path.join(output, 'ready.json'), JSON.stringify(baseline, null, 2));
  // This is Chromium's real browser zoom setting in its own temporary profile,
  // not CSS zoom, a narrowed viewport, or CDP pinch/pageScaleFactor emulation.
  const settings = await page.context().newPage();
  await settings.goto('chrome://settings/appearance');
  const settingBefore = await settings.evaluate(() => new Promise(resolve => chrome.settingsPrivate.getDefaultZoom(resolve)));
  const changed = await settings.evaluate(() => new Promise(resolve => chrome.settingsPrivate.setDefaultZoom(2, resolve)));
  assert.equal(changed, true, 'Chromium accepts browser zoom setting');
  const settingAfter = await settings.evaluate(() => new Promise(resolve => chrome.settingsPrivate.getDefaultZoom(resolve)));
  assert.equal(settingAfter, 2);
  await settings.screenshot({ path: path.join(output, 'browser-zoom-setting.png'), fullPage: true });
  await settings.close();
  await page.bringToFront();
  await expect.poll(() => page.evaluate(dpr => devicePixelRatio / dpr, baseline.dpr), { timeout: 10000 }).toBeCloseTo(2, 1);
  report.nativeZoom = { method: 'Chromium settingsPrivate.setDefaultZoom in isolated temporary browser profile', settingBefore, settingAfter, baseline, at200: await page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, outerHeight, dpr: devicePixelRatio, visualScale: visualViewport.scale })) };
  assert.ok(Math.abs(report.nativeZoom.at200.innerWidth * 2 - baseline.innerWidth) <= 4, 'native browser zoom reflows the layout');
  assert.equal(report.nativeZoom.at200.visualScale, 1, 'browser zoom, rather than pinch zoom');
  await screen(page, 'landing-native-200');
  await landingAlignment(page, 'landing-native-200');
  const mobile = await page.locator('.wr65-landing-mobile-controls').isVisible();
  await keyboardAuth(page, page.locator(mobile ? '.wr65-landing-mobile-controls' : '.wr65-landing-art'), 'landing-native-200');
  await page.evaluate(session => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)), session);
  await page.goto(base + '/lobby');
  await expect(page.locator('.wr-hero')).toBeVisible();
  await screen(page, 'home-native-200');
  await page.getByRole('button', { name: '탐험 시작 · 모드 선택으로 이동' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(base + '/play');
  await screen(page, 'play-native-200');
  for (const index of [0, 1, 2]) {
    const card = page.locator('.wr-mode').nth(index);
    await card.locator('.wr-mode-action').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await checkAction(card, `native 200% mode ${index + 1} keyboard focus`);
    await page.keyboard.press('Enter');
    if (index === 0) await expect(page.locator('.qs-modal-backdrop')).toBeVisible();
    else await expect(page).toHaveURL(base + '/multiplayer?mode=' + (index === 1 ? 'duel' : 'group'));
    await page.goto(base + '/play');
  }
  check('native browser 200%: all three mode keyboard destinations retained');
  await page.context().close();
}

function contrast(style) {
  const rgb = value => value.match(/[\d.]+/g).map(Number).slice(0, 3);
  const light = values => values.map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  const fg = light(rgb(style.color));
  return Math.min(...style.background.match(/rgb\([^)]+\)/g).map(color => {
    const bg = light(rgb(color));
    return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
  }));
}

async function checkAction(card, name) {
  const state = await actionStyle(card);
  state.contrast = contrast(state);
  assert.ok(state.contrast >= 4.5, `${name}: contrast ${state.contrast}`);
  assert.equal(state.opacity, '1');
  assert.equal(state.parentOpacity, '1');
  assert.equal(state.filter, 'none');
  assert.equal(state.parentFilter, 'none');
  check(`${name}: readable CTA (${state.contrast.toFixed(2)}:1)`);
  return state;
}

try {
  await server.listen();
  if (nativeZoom) {
    nativeContext = await chromium.launchPersistentContext(path.join(output, `profile-${Date.now()}`), { headless: false, viewport: null, args: ['--window-size=1440,1000'] });
    browser = nativeContext.browser();
  } else browser = await chromium.launch({ headless: true, ...(process.env.JUNGLE65_BROWSER_PATH ? {executablePath: process.env.JUNGLE65_BROWSER_PATH} : {}) });
  if (nativeZoom) await reviewNativeZoom();
  else {
  if (!before) {
    report.assets = [];
    for (const name of fs.readdirSync(path.join(root, 'public/assets/wiki-race/jungle65')).filter(name => name.endsWith('.webp'))) {
      const assetPath = 'public/assets/wiki-race/jungle65/' + name;
      const sourcePath = path.join(root, 'WikiRace_Jungle65_Design_Assets_20261030', assetPath);
      const installed = fs.readFileSync(path.join(root, assetPath));
      const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath) : null;
      if (source) assert.deepEqual(installed, source, name + ': approved original is preserved');
      report.assets.push({ name, bytes: installed.length, originalMatches: source ? true : null, sha256: createHash('sha256').update(installed).digest('hex') });
    }
    assert.equal(report.assets.length, 5);
    check('all five assets installed; supplied originals match when available');
  }
  for (const [size, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await makePage(viewport, null, size === 'mobile');
    await page.goto(base);
    await expect(page.locator('.wr65-intro')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('.wr65-landing-picture')?.complete || document.querySelector('.wr65-landing-fallback'));
    await screen(page, `landing-${size}`);
    const controls = page.locator(size === 'mobile' ? '.wr65-landing-mobile-controls' : '.wr65-landing-art');
    // Before assets are installed the desktop fallback has one combined button.
    if (!before) {
      await landingAlignment(page, `landing-${size}`);
      await controls.getByRole('button', { name: /로그인/ }).click();
      await expect(page.getByRole('dialog', { name: '탐험가 로그인', exact: true })).toBeVisible();
      await expect(page.locator('.auth-tab.active')).toHaveText('로그인');
      report.keyboardOpening ??= [];
      report.keyboardOpening.push(await page.evaluate(() => ({ focused: document.activeElement?.outerHTML, insideDialog: document.querySelector('[role="dialog"]')?.contains(document.activeElement) })));
      await expect(page.getByPlaceholder('사용할 아이디')).toBeFocused();
      await page.getByRole('button', { name: '로그인 창 닫기' }).click();
      await controls.getByRole('button', { name: /회원가입/ }).click();
      await expect(page.getByRole('dialog', { name: '새 탐험가 등록', exact: true })).toBeVisible();
      await expect(page.locator('.auth-tab.active')).toHaveText('회원가입');
      await expect(page.getByPlaceholder('게임에서 표시될 이름')).toBeVisible();
      await page.getByPlaceholder('사용할 아이디').fill('design-check');
      const field = await page.locator('.auth-input').first().evaluate(el => {
        const style = getComputedStyle(el);
        return { color: style.color, background: `linear-gradient(${style.backgroundColor}, ${style.backgroundColor})` };
      });
      assert.ok(contrast(field) >= 4.5, 'light auth modal must use readable input text');
      await page.locator('.intro-modal-card').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      const modalBounds = await page.locator('.intro-modal-card').boundingBox();
      const soundBounds = await page.locator('.wr-audio').boundingBox();
      assert.ok(modalBounds.y >= soundBounds.y + soundBounds.height, 'auth modal must not be clipped by the sound toolbar');
      await page.screenshot({ path: path.join(output, `signup-${size}.png`), fullPage: true });
      check(`landing-${size}: parchment auth input text remains readable`);
      await page.getByRole('button', { name: '로그인 창 닫기' }).click();
      check(`landing-${size}: login and signup forms open in the correct mode`);
      await keyboardAuth(page, controls, `landing-${size}`);
      await keyboardAuth(page, controls, `signup-${size}`, true);
      await page.getByRole('button', { name: '사운드 설정', exact: true }).click();
      await page.getByLabel('전체 음소거').check();
      const volume = page.getByRole('slider', { name: '배경음악 음량' });
      await volume.focus();
      await volume.press('Home');
      await volume.press('ArrowRight');
      await expect(volume).toHaveValue('1');
      await page.getByRole('button', { name: '소리 설정 닫기' }).click();
      check(`landing-${size}: sound controls remain usable`);
    }
    await page.context().close();

    const member = await makePage(viewport, 'member', size === 'mobile');
    await member.goto(base + '/lobby');
    await expect(member.locator('.wr-hero')).toBeVisible();
    await member.waitForFunction(() => document.querySelector('.wr-landscape')?.complete);
    await screen(member, `home-${size}`);
    if (!before) {
      await expect(member.getByRole('region', { name: '오늘의 도전', exact: true })).toBeVisible();
      await expect(member.locator('.wr-my-explorer')).toContainText('435');
      await expect(member.locator('.weekly-card')).toBeVisible();
      await expect(member.locator('.wr-my-explorer a[href="/profile"]')).toBeVisible();
      check(`home-${size}: daily, XP, profile and ranking widgets retained (fixture data)`);
    }
    await member.getByRole('button', { name: '탐험 시작 · 모드 선택으로 이동' }).click();
    await expect(member).toHaveURL(base + '/play');
    await expect(member.locator('.wr-mode')).toHaveCount(3);
    await member.waitForFunction(() => [...document.querySelectorAll('.wr65-mode-art')].every(img => img.complete));
    await screen(member, `play-${size}`);
    report[size] = [];
    for (let index = 0; index < 3; index++) {
      const card = member.locator('.wr-mode').nth(index);
      await member.mouse.move(0, 0);
      const normal = await actionStyle(card);
      if (!before) await checkAction(card, `${size} mode ${index + 1} normal`);
      await card.locator('.wr-mode-action').hover();
      await member.waitForTimeout(200);
      const hover = await actionStyle(card);
      if (!before) {
        await checkAction(card, `${size} mode ${index + 1} hover`);
        await member.mouse.down();
        assert.equal(await card.evaluate(el => el.matches(':active')), true);
        await checkAction(card, `${size} mode ${index + 1} active`);
        await member.mouse.move(0, 0);
        await member.mouse.up();
        const action = card.locator('.wr-mode-action');
        await action.focus();
        await member.keyboard.press('Tab');
        await member.keyboard.press('Shift+Tab');
        await expect(action).toBeFocused();
        assert.equal(await action.evaluate(el => el.matches(':focus-visible')), true);
        const outline = await action.evaluate(el => getComputedStyle(el).outlineWidth);
        assert.equal(outline, '3px');
        await member.waitForTimeout(200);
        const focus = await checkAction(card, `${size} mode ${index + 1} keyboard focus`);
        report[size].push({ index, normal, hover, focus });
      } else report[size].push({ index, normal, hover });
    }
    if (!before) {
      await member.locator('.wr-mode').nth(1).hover();
      await member.screenshot({ path: path.join(output, `play-hover-${size}.png`), fullPage: true });
      const disabled = member.locator('.wr-mode').first();
      await disabled.locator('.wr-mode-action').evaluate(el => { el.disabled = true; });
      await disabled.locator('.wr-mode-action').hover();
      await checkAction(disabled, `${size} native disabled`);
      await disabled.locator('.wr-mode-action').evaluate(el => { el.disabled = false; });
      for (let index = 0; index < 3; index++) {
        const card = member.locator('.wr-mode').nth(index);
        const action = card.locator('.wr-mode-action');
        if (size === 'mobile') await action.tap();
        else { await action.focus(); await action.press('Enter'); }
        if (index === 0) {
          await expect(member.locator('.qs-modal-backdrop')).toBeVisible();
          await member.goto(base + '/play');
        } else {
          await expect(member).toHaveURL(base + '/multiplayer?mode=' + (index === 1 ? 'duel' : 'group'));
          await member.goto(base + '/play');
        }
        check(`${size} mode ${index + 1}: ${size === 'mobile' ? 'touch' : 'keyboard'} navigation retained`);
      }
      const guest = await makePage(viewport, 'guest', size === 'mobile');
      await guest.goto(base + '/play');
      for (const index of [1, 2]) {
        const card = guest.locator('.wr-mode').nth(index);
        await expect(card.locator('.wr-mode-action')).toHaveAttribute('aria-disabled', 'true');
        await expect(card.locator('.wr-mode-action')).toHaveText('로그인 후 이용 가능');
        await card.hover();
        await checkAction(card, `${size} guest mode ${index + 1} disabled`);
        // Playwright correctly treats aria-disabled as unavailable for click().
        // A physical pointer verifies that the existing handler also refuses it.
        const bounds = await card.locator('.wr-mode-action').boundingBox();
        await guest.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await expect(guest).toHaveURL(base + '/play');
      }
      await guest.screenshot({ path: path.join(output, `play-guest-${size}.png`), fullPage: true });
      await guest.context().close();
      check(`${size}: guest online restriction retained, separate from active hover`);
    }
    await member.context().close();
  }
  if (!before) {
    for (const [width, height] of [[320, 844], [768, 1024], [1024, 768]]) {
      const page = await makePage({ width, height }, 'member');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const [label, route] of [['home', '/lobby'], ['play', '/play']]) {
        await page.goto(base + route);
        await expect(page.locator('.wr-header')).toBeVisible();
        await page.waitForFunction(() => [...document.querySelectorAll('img')].every(img => img.complete));
        await screen(page, `${label}-${width}`);
      }
      // A signed-in session intentionally redirects away from the landing page.
      await page.context().close();
      const landing = await makePage({ width, height });
      await landing.goto(base);
      await expect(landing.locator('.wr65-landing-picture')).toBeVisible();
      await screen(landing, `landing-${width}`);
      await landing.context().close();
    }
  }
  if (!before) {
    assert.ok(report.images.every(img => img.status === 200 && img.type.startsWith('image/webp')), 'every jungle artwork response is an actual WebP');
    assert.equal(report.errors.length, 0, report.errors.join('\n'));
    check('browser: no page/console errors; every artwork response is HTTP 200 image/webp');
  }
  }
  if (nativeZoom) assert.equal(report.errors.length, 0, report.errors.join('\n'));
  if (visualBaseline && !before) {
    const previous = JSON.parse(fs.readFileSync(path.join(visualBaseline, 'report.json'), 'utf8'));
    report.pixelComparisons = [];
    for (const screen of report.screens) {
      assert.ok(previous.screens.some(old => old.label === screen.label), `${screen.label}: protected baseline must exist`);
      const file = `${screen.label}.png`;
      const oldHash = createHash('sha256').update(fs.readFileSync(path.join(visualBaseline, file))).digest('hex');
      const newHash = createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex');
      report.pixelComparisons.push({label: screen.label, oldHash, newHash});
      assert.equal(newHash, oldHash, `${screen.label}: protected screen must remain pixel-identical`);
      check(`${screen.label}: protected pixel regression`, 'visual');
    }
  }
} catch (error) { report.failure = error.stack; throw error; } finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors, output }, null, 2));
