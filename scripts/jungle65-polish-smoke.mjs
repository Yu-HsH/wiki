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
const port = 5197;
const runDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const output = path.join(root, `.temp/jungle65-visual-repair-${runDate.replaceAll('-', '')}`, before ? 'legacy-before' : 'browser');
fs.mkdirSync(output, { recursive: true });
if (before) {
  for (const name of ['pages/IntroPage.jsx', 'pages/PlayPage.jsx', 'pages/LoginPage.jsx', 'pages/MainPage.jsx', 'components/wiki-race/ExpeditionHero.jsx', 'css/jungle65.css']) {
    assert.ok(fs.existsSync(path.join(root, '.temp/jungle65-polish-20261102/preserved', name)), '--before requires the preserved source snapshot from 2026-11-02');
  }
}
const api = 'http://127.0.0.1:54329'; // Intercepted in the browser, never sent.
const user = { id: '00000000-0000-4000-8000-000000000065', aud: 'authenticated', role: 'authenticated', email: 'design@example.invalid', user_metadata: { nickname: '디자인 검수' } };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = [ { alg: 'HS256', typ: 'JWT' }, { sub: user.id, exp: expires, role: 'authenticated' } ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.ui-fixture';
const session = { user, access_token: token, refresh_token: 'ui-fixture', token_type: 'bearer', expires_at: expires, expires_in: 3600 };
const report = { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), date: runDate, uncommitted: true, baseline: before, fixtureBackend: true, checks: [], screens: [], errors: [], warnings: [], images: [], externalRequests: [] };
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
const server = await createServer({
  root, configFile: false, envFile: false,
  plugins: before ? [{
    name: 'preserved-polish-baseline', enforce: 'pre',
    load(id) {
      const relative = path.relative(root, id.split('?')[0]);
      const preserved = path.join(root, '.temp/jungle65-polish-20261102/preserved', relative);
      if (!relative.startsWith('..') && fs.existsSync(preserved) && fs.statSync(preserved).isFile()) return fs.readFileSync(preserved, 'utf8');
    },
  }] : [],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(api),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('ui-fixture-public-key'),
    'import.meta.env.VITE_MAINTENANCE': JSON.stringify(''),
  },
  server: { host: '127.0.0.1', port, strictPort: true, watch: { ignored: ['**/.temp/**'] } },
});
let browser;
const base = `http://127.0.0.1:${port}`;

async function makePage(viewport, actor = null, touch = false) {
  const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch });
  if (actor) await context.addInitScript(({ actor, session }) => {
    if (actor === 'member') localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
    else localStorage.setItem('wiki_game_local_user', JSON.stringify({ id: 'guest-design', mode: 'local', isGuest: true, displayName: '게스트 검수' }));
  }, { actor, session });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome:') return route.continue();
    if (url.origin === base) return route.continue();
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

async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(950);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll('.wr-mode')].map(el => ({ title: el.getAttribute('aria-labelledby') || el.getAttribute('aria-label'), height: el.getBoundingClientRect().height, ctaY: el.querySelector('.wr-mode-action').getBoundingClientRect().y })),
  }));
  report.screens.push({ name, ...metrics });
  assert.ok(metrics.scroll <= metrics.width, `${name}: horizontal overflow`);
  if (!before && name === 'play-mobile') assert.ok(metrics.cards.every(card => card.height <= 435), '390px PLAY cards retain the compact structure');
  if (!before && name.startsWith('play-') && metrics.width >= 1024 && metrics.cards.length) assert.ok(Math.max(...metrics.cards.map(c => c.ctaY)) - Math.min(...metrics.cards.map(c => c.ctaY)) < 1, `${name}: desktop CTAs align`);
  check(`${name}: no horizontal overflow`);
}

function contrast(fg, bg) {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => {
    x /= 255;
    return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  }).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

async function readableAction(action, name) {
  const style = await action.evaluate(el => {
    const css = getComputedStyle(el);
    return { color: css.color, background: css.backgroundImage, opacity: css.opacity, filter: css.filter };
  });
  const stops = style.background.match(/rgb\([^)]+\)/g);
  assert.ok(stops?.length, `${name}: gradient stops`);
  const ratio = Math.min(...stops.map(bg => contrast(style.color, bg)));
  assert.ok(ratio >= 4.5, `${name}: CTA contrast ${ratio}`);
  assert.equal(style.opacity, '1');
  assert.equal(style.filter, 'none');
  report.actionStyles ??= [];
  report.actionStyles.push({ name, ...style, contrast: ratio });
  check(`${name}: readable CTA ${ratio.toFixed(2)}:1`);
}

async function keyboardAuth(page, trigger, title, screenshotName) {
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByPlaceholder('사용할 아이디')).toBeFocused();
  for (const direction of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < 14; step++) {
      await page.keyboard.press(direction);
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), `${title}: focus stays in dialog`);
    }
  }
  await screenshot(page, screenshotName);
  const bounds = await dialog.boundingBox();
  const sound = await page.locator('.wr-audio').boundingBox();
  assert.ok(bounds.y >= sound.y + sound.height, 'dialog stays below sound toolbar');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  check(`${screenshotName}: Enter, Tab, Shift+Tab, Escape, focus return`);
}

async function authTriggers(page) {
  const separate = page.locator('.wr65-landing-mobile-controls');
  return await separate.isVisible()
    ? { primary: separate.getByRole('button', { name: '로그인', exact: true }), signup: separate.getByRole('button', { name: '회원가입', exact: true }) }
    : { primary: page.locator('.wr65-landing-hit-login'), signup: page.locator('.wr65-landing-hit-signup') };
}

async function landingComposition(page, size) {
  await expect(page.locator('.wr65-landing-panel')).toHaveCount(0);
  const result = await page.evaluate(() => {
    const img = document.querySelector('.wr65-landing-picture');
    const box = img.getBoundingClientRect();
    const samples = [[837, 340], [600, 230], [370, 480], [1350, 450]].map(([x, y]) => ({ x, y, unobscured: document.elementFromPoint(box.x + x / 1672 * box.width, box.y + y / 941 * box.height) === img }));
    const targets = [
      ['.wr65-landing-hit-login', 607, 545, 230, 71],
      ['.wr65-landing-hit-signup', 865, 545, 225, 71],
    ].map(([selector, x, y, width, height]) => {
      const el = document.querySelector(selector);
      if (!el.getClientRects().length) return { selector, separateControls: true };
      return { selector, hits: [.2, .5, .8].map(f => document.elementFromPoint(box.x + (x + width * f) / 1672 * box.width, box.y + (y + height / 2) / 941 * box.height) === el) };
    });
    return { natural: [img.naturalWidth, img.naturalHeight], width: box.width, height: box.height, objectFit: getComputedStyle(img).objectFit, samples, targets };
  });
  assert.deepEqual(result.natural, [1672, 941]);
  assert.equal(result.objectFit, 'contain');
  assert.ok(Math.abs(result.width / result.height - 1672 / 941) < .001);
  assert.ok(result.samples.every(p => p.unobscured), `${size}: logo, parchment, explorer and background remain unobscured`);
  for (const target of result.targets) if (!target.separateControls) assert.ok(target.hits.every(Boolean), `${size}: painted login/signup buttons match real targets`);
  report.compositions ??= [];
  report.compositions.push({ screen: `landing-${size}`, ...result });
  check(`${size}: full landing aspect ratio, unobscured logo/explorer and aligned controls`);
}

async function homeComposition(page, size) {
  const result = await page.evaluate(() => {
    const hero = document.querySelector('.wr65-jungle-hero');
    const img = hero.querySelector('.wr-landscape');
    const entry = hero.querySelector('.wr-hero-entry');
    const button = hero.querySelector('button');
    const imageBox = img.getBoundingClientRect(), entryBox = entry.getBoundingClientRect();
    const style = getComputedStyle(entry);
    const scale = Math.min(imageBox.width / img.naturalWidth, imageBox.height / img.naturalHeight);
    const painted = { x: imageBox.x + (imageBox.width - img.naturalWidth * scale) / 2, y: imageBox.y + (imageBox.height - img.naturalHeight * scale) / 2 };
    const below = entryBox.y >= imageBox.bottom - 1;
    const flags = [[1150, 290], [1430, 220], [880, 390]].map(([x, y]) => !document.elementFromPoint(painted.x + x * scale, painted.y + y * scale)?.closest('.wr-hero-entry'));
    const aligned = below || document.elementFromPoint(painted.x + 830 * scale, painted.y + 290 * scale)?.closest('button') === button;
    return { natural: [img.naturalWidth, img.naturalHeight], objectFit: getComputedStyle(img).objectFit, background: style.backgroundColor, entryWidth: entryBox.width, imageWidth: imageBox.width, below, flags, aligned };
  });
  assert.equal(result.objectFit, 'contain');
  assert.equal(result.background, 'rgba(0, 0, 0, 0)');
  assert.ok(result.flags.every(Boolean), `${size}: flags and bridge are not covered by the entry`);
  assert.ok(result.aligned, `${size}: HOME CTA is aligned with painted button or below artwork`);
  if (!result.below) assert.ok(result.entryWidth < result.imageWidth * .23);
  report.compositions.push({ screen: `home-${size}`, ...result });
  await page.locator('.wr-hero').screenshot({ path: path.join(output, `home-banner-${size}.png`) });
  check(`${size}: HOME path and flags unobscured; transparent CTA or button below art`);
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  if (!before) {
    report.assets = [];
    for (const name of ['landing-final', 'hero-jungle-expedition', 'solo-expedition', 'duel-expedition', 'group-expedition']) {
      const asset = `public/assets/wiki-race/jungle65/${name}.webp`;
      const bytes = fs.readFileSync(path.join(root, asset));
      const original = path.join(root, 'WikiRace_Jungle65_Design_Assets_20261030', asset);
      if (fs.existsSync(original)) assert.deepEqual(bytes, fs.readFileSync(original));
      report.assets.push({ name, originalMatches: fs.existsSync(original) ? true : null, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    check('all five Jungle65 artworks hashed; available supplied originals match byte-for-byte');
  }
  const sizes = before ? [['mobile', 390, 844]] : [['desktop', 1440, 1000], ['mobile', 390, 844], ['small', 320, 844], ['tablet', 768, 1024], ['landscape', 1024, 768], ['wide', 1920, 1080]];
  for (const [size, width, height] of sizes) {
    if (!before) {
      const landing = await makePage({ width, height }, null, width <= 390);
      await landing.goto(base);
      await expect(landing.locator('.wr65-landing-picture')).toBeVisible();
      await landing.waitForFunction(() => document.querySelector('.wr65-landing-picture')?.naturalWidth > 0);
      await screenshot(landing, `landing-${size}`);
      await landingComposition(landing, size);
      const { primary, signup } = await authTriggers(landing);
      if (['desktop', 'mobile', 'small', 'tablet'].includes(size)) {
        const style = el => { const css = getComputedStyle(el); return JSON.stringify([css.backgroundColor, css.boxShadow, css.outlineWidth]); };
        const normal = await primary.evaluate(style);
        await primary.hover();
        await landing.waitForTimeout(180);
        assert.notEqual(normal, await primary.evaluate(style));
        await landing.mouse.move(0, 0);
        await keyboardAuth(landing, primary, '탐험가 로그인', `login-${size}`);
        await keyboardAuth(landing, signup, '새 탐험가 등록', `signup-${size}`);
        await primary.click();
        await landing.getByRole('dialog').getByRole('button', { name: '회원가입', exact: true }).click();
        await expect(landing.getByRole('dialog', { name: '새 탐험가 등록' })).toBeVisible();
        await expect(landing.getByPlaceholder('게임에서 표시될 이름')).toBeVisible();
        await landing.getByRole('dialog').getByRole('button', { name: '로그인', exact: true }).click();
        await expect(landing.getByRole('dialog', { name: '탐험가 로그인' })).toBeVisible();
        await landing.keyboard.press('Escape');
        check(`${size}: auth headings and descriptions follow form mode`);
      }
      await landing.context().close();
    }
    const page = await makePage({ width, height }, 'member', width <= 390);
    await page.goto(base + '/lobby');
    await expect(page.locator('.wr-hero')).toBeVisible();
    await screenshot(page, `home-${size}`);
    if (!before) {
      await homeComposition(page, size);
      await expect(page.getByRole('region', { name: '오늘의 도전', exact: true })).toBeVisible();
      await expect(page.locator('.wr-my-explorer')).toContainText('435');
      await expect(page.locator('.weekly-card')).toBeVisible();
      await expect(page.getByRole('button', { name: '오늘의 탐험 출발' })).toBeEnabled();
      if (size === 'wide') {
        assert.equal(Math.round((await page.locator('.wr-shell').boundingBox()).width), 1400);
        check('wide HOME: 1400px content shell');
      }
    }
    await page.getByRole('button', { name: '탐험 시작 · 모드 선택으로 이동' }).click();
    await expect(page).toHaveURL(base + '/play');
    await expect(page.locator('.wr-mode')).toHaveCount(3);
    await screenshot(page, `play-${size}`);
    if (before) { await page.context().close(); continue; }
    await expect(page.getByRole('heading', { name: '탐험 모드를 선택하세요' })).toBeVisible();
    for (let index = 0; index < 3; index++) {
      const card = page.locator('.wr-mode').nth(index);
      assert.equal(await card.locator('.wr-mode-tags li').count(), 3);
      const details = card.locator('details');
      const summary = details.locator('summary');
      const collapsedStyle = await summary.evaluate(el => { const css = getComputedStyle(el); return { fontSize: css.fontSize, border: css.borderTopWidth, indicator: getComputedStyle(el, '::after').content, height: el.getBoundingClientRect().height }; });
      assert.equal(collapsedStyle.fontSize, '13px');
      assert.equal(collapsedStyle.border, '1px');
      assert.equal(collapsedStyle.indicator, '"+"');
      assert.ok(collapsedStyle.height >= 44);
      assert.equal(await details.evaluate(el => el.open), false);
      await summary.focus();
      await summary.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      assert.equal(await summary.evaluate(el => getComputedStyle(el, '::after').content), '"−"');
      await expect(card.getByText('출발과 목표', { exact: true })).toBeVisible();
      if (index === 0 && (size === 'desktop' || size === 'mobile')) await screenshot(page, `play-details-${size}`);
      await summary.press('Space');
      assert.equal(await details.evaluate(el => el.open), false);
      await expect(page).toHaveURL(base + '/play');
      check(`${size} mode ${index + 1}: three badges, native keyboard disclosure without navigation`);
      const action = card.locator('.wr-mode-action');
      await readableAction(action, `${size} mode ${index + 1} normal`);
      await action.hover();
      await readableAction(action, `${size} mode ${index + 1} hover`);
      await summary.focus();
      await page.keyboard.press('Tab');
      await expect(action).toBeFocused();
      assert.ok(await action.evaluate(el => el.matches(':focus-visible')));
      assert.equal(await action.evaluate(el => getComputedStyle(el).outlineWidth), '3px');
      await readableAction(action, `${size} mode ${index + 1} focus-visible`);
    }
    if (size === 'desktop' || size === 'mobile') {
      for (let index = 0; index < 3; index++) {
        const action = page.locator('.wr-mode-action').nth(index);
        if (size === 'mobile') await action.tap();
        else { await action.focus(); await action.press('Enter'); }
        if (index === 0) await expect(page.locator('.qs-modal-backdrop')).toBeVisible();
        else {
          await expect(page).toHaveURL(base + '/multiplayer?mode=' + (index === 1 ? 'duel' : 'group'));
          if (index === 1) {
            const items = page.getByRole('checkbox', { name: /아이템 사용/ });
            await items.uncheck();
            await expect(items).not.toBeChecked();
            await items.check();
            await expect(items).toBeChecked();
            check(`${size}: duel item selection retained without room creation`);
          }
        }
        await page.goto(base + '/play');
        check(`${size} mode ${index + 1}: original destination retained`);
      }
      const guest = await makePage({ width, height }, 'guest', size === 'mobile');
      await guest.goto(base + '/play');
      for (const index of [1, 2]) {
        const action = guest.locator('.wr-mode-action').nth(index);
        await expect(action).toHaveAttribute('aria-disabled', 'true');
        await expect(action).toHaveText('로그인 후 이용 가능');
        await readableAction(action, `${size} guest mode ${index + 1}`);
        await action.focus();
        await action.press('Enter');
        await action.press('Space');
        const bounds = await action.boundingBox();
        await guest.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await expect(guest).toHaveURL(base + '/play');
      }
      await screenshot(guest, `play-guest-${size}`);
      await guest.locator('.wr-mode-action').first().click();
      await expect(guest.locator('.qs-modal-backdrop')).toBeVisible();
      check(`${size}: guest single enabled, online modes blocked for pointer and keyboard`);
      await guest.context().close();
    }
    await page.context().close();
  }
  if (!before) {
    const fallbackErrorStart = report.errors.length;
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const fallback = await makePage({ width, height });
    await fallback.route('**/assets/wiki-race/jungle65/*.webp', route => route.fulfill({ status: 404, body: '' }));
    await fallback.goto(base);
    await expect(fallback.locator('.wr65-landing-fallback')).toBeVisible();
    await expect(fallback.locator('.wr65-landing-fallback-copy')).toHaveCount(0);
    assert.equal(await fallback.locator('.wr65-landing-fallback img').evaluate(el => getComputedStyle(el).objectFit), 'contain');
    await keyboardAuth(fallback, (await authTriggers(fallback)).primary, '탐험가 로그인', `login-fallback-${size}`);
    await screenshot(fallback, `landing-fallback-${size}`);
    await fallback.context().close();
    const memberFallback = await makePage({ width, height }, 'member');
    await memberFallback.route('**/assets/wiki-race/jungle65/*.webp', route => route.fulfill({ status: 404, body: '' }));
    await memberFallback.goto(base + '/lobby');
    await expect(memberFallback.locator('.wr-landscape')).toHaveAttribute('src', '/assets/wiki-race/hero-landscape.png');
    await screenshot(memberFallback, `home-fallback-${size}`);
    await memberFallback.getByRole('button', { name: '탐험 시작 · 모드 선택으로 이동' }).click();
    await expect.poll(() => memberFallback.locator('.wr65-mode-art').evaluateAll(images => images.every(img => img.currentSrc.endsWith('.svg') && img.naturalWidth > 0))).toBe(true);
    await screenshot(memberFallback, `play-fallback-${size}`);
    await memberFallback.locator('.wr-mode-action').first().click();
    await expect(memberFallback.locator('.qs-modal-backdrop')).toBeVisible();
    await memberFallback.context().close();
    check(`${size}: HOME and PLAY retain working artwork fallbacks`);
    }
    // Expected 404 console diagnostics are isolated from the ordinary checks.
    const fallbackErrors = report.errors.splice(fallbackErrorStart);
    report.expectedFallbackErrors = fallbackErrors.filter(message => message.includes('404'));
    report.errors.push(...fallbackErrors.filter(message => !message.includes('404')));
    const reduced = await makePage({ width: 390, height: 844 }, 'member');
    await reduced.emulateMedia({ reducedMotion: 'reduce' });
    await reduced.goto(base + '/play');
    assert.equal(await reduced.locator('.wr-mode-action').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await reduced.context().close();
    check('reduced motion honored');
    assert.equal(report.errors.length, 0, report.errors.join('\n'));
    check('ordinary screens: no page or console errors');
  }
} finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors, output }, null, 2));
