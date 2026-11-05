// Local Chromium only. Auth, daily course, analytics and other API calls are fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { getKstCourseDate } from "../utils/dailyCourse.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = process.argv.includes("--baseline");
const source = baseline ? path.join(root, ".temp/jungle-baseline") : root;
const port = baseline ? 5277 : 5276;
const base = "http://127.0.0.1:" + port, api = "http://127.0.0.1:54329";
const out = path.join(root, ".temp/jungle-alive-browser", baseline ? "before" : "after");
fs.mkdirSync(out, { recursive: true });
const result = { checks: [], pageErrors: [], screenshots: [], measurements: [], backendCalls: 0 };
const check = (name, condition = true) => { assert.ok(condition, name); result.checks.push(name); console.log("PASS " + name); };
const server = await createServer({ root: source, configFile: false, envFile: false,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(api),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("local-test-public-only"),
    "import.meta.env.VITE_MAINTENANCE": JSON.stringify(""),
  },
  server: { host: "127.0.0.1", port, strictPort: true },
});
let browser;
const fixtureEmail = "jungle-qa@example.invalid";
const fixtureUser = { id: "43809350-d51f-4fc5-9272-9870f826a8f1", email: fixtureEmail, aud: "authenticated",
  role: "authenticated", user_metadata: { username: "jungle-qa", nickname: "정글 검수" } };

async function pageFor({ width = 1440, height = 900, mobile = false, reduce = false, dpr = 1, guest = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dpr,
    reducedMotion: reduce ? "reduce" : "no-preference", serviceWorkers: "block",
  });
  if (guest) await ctx.addInitScript(() => localStorage.setItem("wiki_game_local_user", JSON.stringify({
    id: "guest-jungle-ui", displayName: "정글 검수", isGuest: true, mode: "local",
  })));
  const authCalls = [];
  await ctx.route("**/*", route => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin === base) return route.continue();
    if (u.origin !== api) return route.fulfill({ status: 200, body: "", contentType: "text/plain" });
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "*",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*", "content-range": "0-0/0" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    result.backendCalls++;
    let json = [];
    if (u.pathname === "/functions/v1/username-lookup") {
      authCalls.push("lookup");
      assert.equal(req.postDataJSON().username, "jungle-qa");
      json = { syntheticEmail: fixtureEmail };
    } else if (u.pathname === "/functions/v1/username-signup") {
      authCalls.push("signup");
      assert.equal(req.postDataJSON().nickname, "정글 검수");
      json = { ok: true };
    } else if (u.pathname === "/auth/v1/token") {
      authCalls.push("token");
      assert.equal(req.postDataJSON().email, fixtureEmail);
      json = { access_token: "fixture-only", refresh_token: "fixture-refresh", expires_in: 3600,
        token_type: "bearer", user: fixtureUser };
    } else if (u.pathname === "/rest/v1/rpc/ensure_today_daily_challenge") {
      json = [{ challenge_date: getKstCourseDate(), start_title: "대한민국", target_title: "서울특별시", hint: "로컬 검증용 코스" }];
    }
    return route.fulfill({ status: 200, json, headers });
  });
  await ctx.routeWebSocket(url => new URL(url).host !== new URL(base).host, socket => socket.close());
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", e => result.pageErrors.push(e.message));
  return { ctx, page, authCalls };
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true, animations: "allow" });
  result.screenshots.push(name);
}

const artSelector = { landing: ".wr65-landing-picture", home: ".wr65-jungle-hero .wr-landscape" };
async function openScene(page, scene) {
  await page.goto(base + (scene === "home" ? "/lobby" : "/"), { waitUntil: "domcontentloaded" });
  await page.locator(artSelector[scene]).evaluate(img => img.decode());
  await page.locator(".wr65-atmosphere").waitFor({ state: "attached" });
}
async function measure(page, scene) {
  return page.locator(artSelector[scene]).evaluate((img) => {
    const box = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    const overlay = document.querySelector(".wr65-atmosphere");
    const countVisible = selector => getComputedStyle(overlay).display === "none" ? 0 :
      [...overlay.querySelectorAll(selector)].filter(e => getComputedStyle(e).display !== "none").length;
    const hot = (selector, x, y) => document.querySelector(selector)?.contains(
      document.elementFromPoint(box.x + box.width * x, box.y + box.height * y)) ?? false;
    return {
      viewport: innerWidth, dpr: devicePixelRatio, reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
      native: [img.naturalWidth, img.naturalHeight], rendered: [box.width, box.height],
      devicePixelsPerSourcePixel: +(box.width * devicePixelRatio / img.naturalWidth).toFixed(3),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      transform: style.transform, objectFit: style.objectFit,
      canopies: overlay.querySelectorAll(".wr65-alive-canopy").length,
      leaves: countVisible(".wr65-alive-leaf-track"), fireflies: countVisible(".wr65-alive-firefly"),
      safe: img.classList.contains("wr65-landing-picture") ? {
        login: hot(".wr65-landing-hit-login", .43, .615),
        signup: hot(".wr65-landing-hit-signup", .58, .615),
        lantern: hot(".wr65-hotspot--lantern", .075, .702),
        compass: hot(".wr65-hotspot--compass", .219, .82),
      } : {
        play: hot(".wr65-hero-art-entry button", .5385, .672),
        first: hot(".wr65-hotspot--marker-one", .357, .726),
        second: hot(".wr65-hotspot--marker-two", .751, .606),
        third: hot(".wr65-hotspot--marker-three", .933, .462),
        firstFlag: hot(".wr65-hotspot--marker-one", .402, .673),
        secondFlag: hot(".wr65-hotspot--marker-two", .801, .545),
        thirdFlag: hot(".wr65-hotspot--marker-three", .978, .359),
      },
    };
  });
}

async function expectPulse(page, selector, name, { reduced = false } = {}) {
  const pulse = page.locator(selector);
  await expect.poll(() => pulse.evaluate(e => e.getAnimations().some(a => a.id === "wr65-scene-pulse"))).toBe(true);
  const frames = await pulse.evaluate(e => e.getAnimations().find(a => a.id === "wr65-scene-pulse")?.effect.getKeyframes() || []);
  check(name, frames.length >= 2 && frames.some(f => "opacity" in f) && (!reduced || frames.every(f => !("transform" in f))));
}

async function changeMotion(page, reducedMotion) {
  // Wait for the media change handlers to finish cancelling the old pulses.
  await page.evaluate(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    window.qaMotionChanged = false;
    preference.addEventListener("change", () => { window.qaMotionChanged = true; }, { once: true });
  });
  await page.emulateMedia({ reducedMotion });
  await expect.poll(() => page.evaluate(() => window.qaMotionChanged)).toBe(true);
}

const motionLayer = (page, id) => page.locator(`[data-jungle-prop="${id}"]`);
async function verifyIdle(page, scene, label, reduce) {
  const layers = page.locator(".wr65-prop-layers");
  await expect(layers).toBeVisible();
  const evidence = await layers.evaluate((svg, reduce) => {
    const art = svg.parentElement.querySelector("img");
    const bounds = svg.getBoundingClientRect();
    const source = art.getBoundingClientRect();
    const objects = [...svg.querySelectorAll("[data-jungle-prop], .wr65-prop-flame")];
    const motion = objects.map(object => {
      const animation = object.getAnimations()[0];
      if (reduce || !animation) return { count: object.getAnimations().length };
      const original = animation.currentTime;
      const { duration, delay } = animation.effect.getTiming();
      const sample = fraction => {
        animation.currentTime = duration * (1 + fraction) + delay;
        return getComputedStyle(object).transform;
      };
      const a = sample(0), b = sample(.5);
      animation.currentTime = original;
      return { duration, delay, a, b };
    });
    return { aligned: ["x", "y", "width", "height"].every(key => Math.abs(bounds[key] - source[key]) < .5), motion };
  }, reduce);
  result.measurements.push({ label, layers: evidence });
  check(label + ": sprites share the artwork frame and have the expected motion",
    evidence.aligned && evidence.motion.length === (scene === "home" ? 3 : 2) &&
    evidence.motion.every(item => reduce ? item.count === 0 : item.duration && item.a !== item.b));
  if (scene === "home" && !reduce) check(label + ": three distinct wind periods and phases",
    new Set(evidence.motion.map(item => item.duration)).size === 3 &&
    new Set(evidence.motion.map(item => item.delay)).size === 3);
}

async function verifyPropReply(page, id, { tap = false } = {}) {
  await expect.poll(() => page.locator(".wr65-prop-reply").evaluateAll(layers =>
    layers.every(layer => !layer.getAnimations().length))).toBe(true);
  const hit = page.locator(".wr65-hotspot--" + id);
  const idle = motionLayer(page, id);
  await hit.scrollIntoViewIfNeeded();
  await expect(page.locator(".wr65-atmosphere")).not.toHaveClass(/is-paused/);
  await idle.evaluate(el => { el.qaIdle = el.getAnimations()[0]; });
  const reply = idle.locator(".wr65-prop-reply");
  await reply.evaluate((el, id) => {
    // The document listener runs after React's click handler. Hold the reply
    // before Playwright returns from the click on a busy runner.
    document.addEventListener("click", event => {
      if (!event.target.closest(".wr65-hotspot--" + id)) return;
      el.qaReply = el.getAnimations()[0];
      el.qaReply?.pause();
    }, { once: true });
  }, id);
  if (tap) await hit.tap();
  else await hit.click();
  const motion = await reply.evaluate(async el => {
    const animation = el.qaReply;
    if (!animation) return null;
    await animation.ready;
    const current = animation.currentTime;
    const sprite = el.querySelector("image").getBBox();
    const [x, y] = el.style.transformOrigin.split(" ").map(parseFloat);
    const sample = async time => {
      animation.currentTime = time;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const matrix = el.parentElement.getCTM().inverse().multiply(el.getCTM());
      const points = [new DOMPoint(sprite.x + sprite.width, sprite.y), new DOMPoint(x, y)]
        .map(point => point.matrixTransform(matrix)).map(point => [point.x, point.y]);
      return { transform: getComputedStyle(el).transform, points };
    };
    const peakTime = animation.effect.getTiming().duration * .27;
    const first = await sample(0);
    const peak = await sample(peakTime);
    animation.currentTime = current ?? 0;
    animation.play();
    return { first, peak, peakTime, active: [...el.closest("svg").querySelectorAll(".wr65-prop-reply")]
      .filter(reply => reply.getAnimations().length).map(reply => reply.parentElement.dataset.jungleProp) };
  });
  const delta = index => Math.hypot(...motion.first.points[index].map((value, axis) => value - motion.peak.points[index][axis]));
  if (motion) result.measurements.push({ id, tap, ...motion, tipDelta: delta(0), pivotDelta: delta(1) });
  const valid = motion?.active.join() === id && delta(0) > 1 && delta(1) < .05;
  if (!valid) console.log(JSON.stringify({ id, tap, motion }));
  check(id + ": only selected sprite moves, with its pivot fixed", valid);
  await expect.poll(() => idle.locator(".wr65-prop-reply").evaluate(el => el.getAnimations().length)).toBe(0);
  check(id + ": reply returns to the same idle animation", await idle.evaluate(el => el.getAnimations()[0] === el.qaIdle));
}

async function openVeil(page) {
  await page.goto(base + "/lobby", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".wr-veil-trigger")).toBeVisible();
}

async function measureVeil(page) {
  return page.locator(".wr-veil").evaluate(async veil => {
    const frame = document.querySelector(".wr-page.wr-home").getBoundingClientRect();
    const shell = document.querySelector(".wr-page.wr-home .wr-shell").getBoundingClientRect();
    const gutters = [...document.querySelectorAll(".wr-home-side-art > span")];
    const banner = veil.getBoundingClientRect();
    const trigger = veil.querySelector(".wr-veil-trigger");
    const points = [[.02, .05], [.98, .05], [.02, .95], [.98, .95], [.5, .5]];
    const cue = veil.querySelector(".wr-veil-cue").getBoundingClientRect();
    const copy = veil.querySelector(".wr-veil-sub").getBoundingClientRect();
    const art = [...veil.querySelectorAll("image")];
    await Promise.all(art.map(layer => {
      const img = new Image();
      img.src = layer.getAttribute("href");
      return img.decode();
    }));
    return {
      aligned: Math.abs(shell.left - (frame.left + (frame.width - shell.width) / 2)) < 2 &&
        Math.abs(banner.left - shell.left) < 2 && Math.abs(banner.width - shell.width) <= 2,
      shellWidth: shell.width,
      sideArt: gutters.length === 2 && gutters.every(gutter =>
        Math.abs(gutter.getBoundingClientRect().width - (frame.width - shell.width) / 2) < 2),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      fullHit: points.every(([x, y]) => document.elementFromPoint(
        banner.left + banner.width * x, banner.top + banner.height * y) === trigger),
      copyClear: cue.top >= copy.bottom && cue.left >= banner.left && cue.right <= banner.right,
      layers: art.length,
      buttonCount: veil.querySelectorAll("button").length,
      legacyOverlay: Boolean(veil.querySelector(".wr65-hotspot, .wr65-prop-layers, .wr65-route-light, .wr65-home-speech")),
    };
  });
}

async function verifyEntry(page, trigger, activate, reduce, label) {
  await page.evaluate(() => {
    const veil = document.querySelector(".wr-veil");
    document.addEventListener("click", event => {
      if (veil.contains(event.target)) window.veilClickAt = performance.now();
    }, { capture: true, once: true });
    const pushState = history.pushState;
    history.pushState = function (state, unused, url) {
      if (url && new URL(url, location.href).pathname === "/play") {
        window.veilNavigationMs = performance.now() - window.veilClickAt;
      }
      return pushState.apply(this, arguments);
    };
  });
  await activate();
  if (!reduce) {
    await expect(trigger).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".wr-veil-cue")).toHaveText("탐험을 시작합니다…");
    await expect.poll(() => page.locator(".wr-veil-world").evaluate(el => {
      const transform = getComputedStyle(el).transform;
      return transform === "none" ? 1 : new DOMMatrix(transform).a;
    }), { intervals: [30, 45, 60] }).toBeGreaterThan(1.04);
  }
  await expect(page).toHaveURL(base + "/play");
  await expect(page.getByRole("heading", { name: "탐험 모드를 선택하세요" })).toBeVisible();
  const ms = await page.evaluate(() => Math.round(window.veilNavigationMs));
  result.measurements.push({ label, navigationMs: ms, reducedMotion: reduce });
  check(label + ": existing mode selection reached within expected delay (" + ms + "ms)",
    Number.isFinite(ms) && (reduce ? ms < 100 : ms >= 400 && ms <= 700));
}

async function verifyHome(width, height, dpr, reduce) {
  const mobile = width < 700;
  const { page, ctx } = await pageFor({ width, height, mobile, reduce, dpr, guest: true });
  const label = ["home", width, "dpr" + dpr, reduce ? "reduced" : "motion"].join("-");
  try {
    await openVeil(page);
    if (width === 390 && dpr === 1 && !reduce) {
      const samples = await page.evaluate(() => [".daily-card", ".wr-explorer-featured",
        ".wr-my-explorer", ".weekly-card", ".recent-card", ".wr-base-board"].map(selector => {
        const el = document.querySelector(selector);
        if (!el) return { selector, missing: true };
        const box = el.getBoundingClientRect(), style = getComputedStyle(el);
        return { selector, top: Math.round(box.top), height: Math.round(box.height),
          display: style.display, visibility: style.visibility, opacity: style.opacity,
          bg: style.backgroundColor, text: el.textContent?.trim().slice(0, 60) };
      }));
      console.log("MOBILE-HOME-LAYOUT " + JSON.stringify(samples));
    }
    const layout = await measureVeil(page);
    result.measurements.push({ label, ...layout });
    check(label + ": centered and full banner hit area, four art layers and readable copy",
      layout.aligned && layout.fullHit && layout.copyClear && !layout.overflow &&
      layout.layers === 4 && layout.buttonCount === 1 && !layout.legacyOverlay &&
      (width < 1280 || (Math.abs(layout.shellWidth - 1120) < 2 && layout.sideArt)));
    const veil = page.locator(".wr-veil");
    const trigger = veil.getByRole("button");
    await expect(trigger).toHaveAccessibleName("Wiki Race 눌러서 탐험 시작");
    await expect(veil.getByRole("heading")).toHaveCSS("font-family", /Noto Serif CJK KR/);
    const layers = veil.locator(".wr-veil-left, .wr-veil-right");
    if (reduce) await expect(layers.first()).toHaveCSS("transition-duration", "0s");
    if (!reduce && dpr === 1) await screenshot(page, label + "-idle");
    if (!mobile) {
      await trigger.hover();
      await expect(trigger).toHaveAccessibleName("Wiki Race 숲길로 들어가기");
      await expect.poll(() => layers.evaluateAll(elements => elements.map(el => {
        const transform = getComputedStyle(el).transform;
        return transform === "none" ? 0 : Math.round(new DOMMatrix(transform).e);
      }))).toEqual([-141, 132]);
      check(label + ": hover reveals the trail by opening both curtains");
      if (!reduce && dpr === 1) await screenshot(page, label + "-hover");
      await page.mouse.move(0, 0);
      await expect(trigger).toHaveAccessibleName("Wiki Race 눌러서 탐험 시작");
    }
    const box = await trigger.boundingBox();
    const x = box.x + box.width - 12, y = box.y + box.height - 12;
    await verifyEntry(page, trigger, () => mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y),
      reduce, label + (mobile ? " first tap" : " corner click"));
  } finally { await ctx.close(); }
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  for (const [width, height] of [[1440, 900], [1920, 1080], [320, 760], [390, 844]]) {
    const mobile = width < 700;
    for (const dpr of [1, 2]) for (const reduce of baseline ? [false] : [false, true]) {
      for (const scene of baseline ? ["landing", "home"] : ["landing"]) {
        const { page, ctx } = await pageFor({ width, height, mobile, reduce, dpr, guest: scene === "home" });
        try {
          await openScene(page, scene);
          if (baseline && scene === "home") await page.waitForTimeout(760); // v1 entrance animation.
          const state = await measure(page, scene);
          const label = [scene, width, "dpr" + dpr, reduce ? "reduced" : "motion"].join("-");
          result.measurements.push({ scene, ...state });
          const dimensions = scene === "landing" ? "1672,941" : "1535,436";
          check(label + ": original decoded, fixed geometry, no horizontal overflow",
            String(state.native) === dimensions && !state.overflow && state.transform === "none" && state.objectFit === "contain");
          if (!baseline) {
            const targets = Object.entries(state.safe).filter(([name]) => !mobile || !["login", "signup"].includes(name));
            check(label + ": no canopy, input aligned, particle budget",
              state.canopies === 0 && targets.every(([, safe]) => safe) &&
              state.leaves === (reduce ? 0 : mobile ? 4 : 8) && state.fireflies === (reduce ? 0 : mobile ? 3 : 7));
            if (scene === "landing" && mobile) await expect(page.locator(".wr65-landing-start")).toBeVisible();
            await verifyIdle(page, scene, label, reduce);
          }
          if (!reduce) await screenshot(page, label);
        } finally { await ctx.close(); }
      }
      if (!baseline) await verifyHome(width, height, dpr, reduce);
    }
  }

  if (!baseline) {
    const landing = await pageFor();
    const { page } = landing;
    await openScene(page, "landing");
    const box = await page.locator(".wr65-landing-art").boundingBox();
    await page.mouse.move(box.x + box.width * .88, box.y + box.height * .7);
    const atmosphere = page.locator(".wr65-atmosphere");
    await expect.poll(() => atmosphere.evaluate(e => e.style.getPropertyValue("--wr65-near-x"))).not.toBe("0px");
    check("fine pointer moves parallax without transforming the artwork",
      await page.locator(artSelector.landing).evaluate(e => getComputedStyle(e).transform === "none"));
    const lantern = page.getByRole("button", { name: "랜턴 불빛 밝히기" });
    await lantern.hover();
    await expect.poll(() => lantern.evaluate(el => getComputedStyle(el, "::before").opacity)).toBe("0.45");
    check("lantern hover increases localized brightness");
    await verifyPropReply(page, "lantern");
    await lantern.click();
    await expectPulse(page, ".wr65-hotspot--lantern .wr65-hotspot-pulse", "lantern click brightens original lamp");
    await screenshot(page, "landing-lantern-pressed");
    const compass = page.getByRole("button", { name: "나침반 반짝임 보기" });
    await compass.press("Enter");
    await expectPulse(page, ".wr65-hotspot--compass .wr65-hotspot-pulse", "compass Enter flashes");
    check("hotspots are visual only", new URL(page.url()).pathname === "/" && !landing.authCalls.length);
    await changeMotion(page, "reduce");
    await expect(atmosphere).toBeHidden();
    await compass.press("Space");
    await expectPulse(page, ".wr65-hotspot--compass .wr65-hotspot-pulse", "reduced motion keeps a stationary light response", { reduced: true });
    await lantern.press("Enter");
    await expectPulse(page, ".wr65-hotspot--lantern .wr65-hotspot-pulse", "reduced motion lantern keeps light feedback", { reduced: true });
    check("reduced motion lantern stays still on activation",
      await motionLayer(page, "lantern").locator(".wr65-prop-reply").evaluate(el => getComputedStyle(el).transform === "none"));
    await changeMotion(page, "no-preference");
    await expect(page.locator(".wr65-landing-wordmark")).toBeVisible();
    await expect(page.locator(".wr65-landing-description")).toBeVisible();
    check("landing renders the selected PR 19 HTML text");
    const signin = page.getByRole("button", { name: "Wiki Race 로그인" });
    await signin.hover();
    await expect.poll(() => signin.evaluate(e => Number(getComputedStyle(e, "::after").opacity))).toBeGreaterThan(.7);
    await page.mouse.down();
    check("login has press feedback before any navigation", await signin.evaluate(e => getComputedStyle(e, "::after").opacity === "1"));
    await page.mouse.up();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".auth-tab.active")).toHaveText("로그인");
    await page.keyboard.press("Escape");
    await expect(signin).toBeFocused();
    await signin.press("Enter");
    await dialog.getByLabel("아이디").fill("jungle-qa");
    await dialog.getByLabel("비밀번호").fill("fixture-password");
    await dialog.locator("button[type=submit]").click();
    await expect(page).toHaveURL(base + "/lobby");
    check("real login form reaches HOME using fixture", String(landing.authCalls) === "lookup,token");
    await landing.ctx.close();

    const signup = await pageFor({ width: 390, height: 844, mobile: true, dpr: 2 });
    await openScene(signup.page, "landing");
    await signup.page.getByRole("button", { name: "랜턴 불빛 밝히기" }).tap();
    await expectPulse(signup.page, ".wr65-hotspot--lantern .wr65-hotspot-pulse", "mobile lantern responds to tap");
    await verifyPropReply(signup.page, "lantern", { tap: true });
    await signup.page.locator(".wr65-landing-signup").tap();
    const signDialog = signup.page.getByRole("dialog");
    await expect(signDialog.locator(".auth-tab.active")).toHaveText("회원가입");
    await signDialog.getByLabel("아이디").fill("jungle-qa");
    await signDialog.getByLabel("닉네임").fill("정글 검수");
    await signDialog.getByLabel("비밀번호").fill("fixture-password");
    await signDialog.locator("button[type=submit]").tap();
    await expect(signup.page).toHaveURL(base + "/lobby");
    check("real signup form signs in using fixture", String(signup.authCalls) === "signup,lookup,token");
    await signup.ctx.close();

    const home = await pageFor({ guest: true });
    const hp = home.page;
    await openVeil(hp);
    const daily = hp.getByRole("region", { name: "오늘의 도전" });
    await expect(daily.getByRole("button")).toBeEnabled();
    await daily.hover();
    check("daily card responds to hover", await daily.evaluate(e => getComputedStyle(e).boxShadow.includes("inset")));
    const tab = hp.locator(".ranking-tabs button").nth(1);
    await tab.press("Enter");
    await expect(tab).toHaveAttribute("aria-pressed", "true");
    check("ranking selector still works via keyboard");
    const updates = hp.getByRole("link", { name: /소식/ });
    await expect(updates.locator(".wr-updates-dot")).toBeVisible();
    await updates.click();
    await expect(hp.getByRole("heading", { name: "탐험대 소식", exact: true })).toBeVisible();
    await hp.getByRole("button", { name: /Wiki Race 2\.0 업데이트/ }).click();
    await expect(hp.locator(".wr-updates-article h2")).toHaveText("Wiki Race 2.0 업데이트");
    await hp.getByRole("link", { name: "HOME", exact: true }).click();
    await expect(hp.getByRole("link", { name: "소식" }).locator(".wr-updates-dot")).toHaveCount(0);
    check("updates list, details and read indicator work");
    await home.ctx.close();

    for (const [key, reduce] of [["Enter", false], ["Space", false], ["Space", true]]) {
      const keyboard = await pageFor({ guest: true, reduce });
      const { page } = keyboard;
      await openVeil(page);
      const trigger = page.locator(".wr-veil-trigger");
      for (let index = 0; index < 20 && !await trigger.evaluate(el => el === document.activeElement); index++) {
        await page.keyboard.press("Tab");
      }
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveCSS("outline-style", "solid");
      await expect(trigger).toHaveAccessibleName("Wiki Race 숲길로 들어가기");
      await verifyEntry(page, trigger, () => page.keyboard.press(key), reduce, "keyboard " + key + " reduce=" + reduce);
      await keyboard.ctx.close();
    }

    const fallback = await pageFor({ guest: true, reduce: true });
    await fallback.page.route("**/jungle-veil/*.svg", route => route.fulfill({ status: 404, body: "" }));
    await openVeil(fallback.page);
    await expect(fallback.page.locator(".wr-veil-cue")).toBeVisible();
    await expect(fallback.page.locator(".wr-veil-fallback")).toBeVisible();
    await fallback.page.locator(".wr-veil-trigger").click();
    await expect(fallback.page).toHaveURL(base + "/play");
    check("missing HOME artwork leaves the text and full navigation target");
    await fallback.ctx.close();

    const missing = await pageFor();
    const tile = "lantern-flame.png";
    await missing.page.route("**/" + tile, route => route.fulfill({ status: 404, body: "" }));
    const failure = missing.page.waitForResponse(response => response.url().endsWith(tile) && response.status() === 404);
    await openScene(missing.page, "landing");
    await failure;
    await expect(missing.page.locator(".wr65-prop-layers")).toHaveCount(0);
    await expect(missing.page.locator(artSelector.landing)).toBeVisible();
    check("landing missing sprite leaves complete original artwork");
    await missing.ctx.close();
  }
  check("no browser runtime exceptions", result.pageErrors.length === 0);
} catch (error) { result.failure = String(error.stack || error); throw error; }
finally {
  try { await browser?.close(); } catch {}
  await server.close();
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.checks.length, failure: result.failure || null }));
}
