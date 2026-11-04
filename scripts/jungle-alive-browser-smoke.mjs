// Local Chromium only. Auth, daily course, analytics and other API calls are fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

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
      json = [{ challenge_date: "2026-11-04", start_title: "대한민국", target_title: "서울특별시", hint: "로컬 검증용 코스" }];
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
  await idle.evaluate(el => { el.qaIdle = el.getAnimations()[0]; });
  if (tap) await hit.tap();
  else await hit.click();
  const motion = await idle.locator(".wr65-prop-reply").evaluate(async el => {
    const animation = el.getAnimations()[0];
    if (!animation) return null;
    await animation.ready;
    const current = animation.currentTime;
    const sprite = el.querySelector("image").getBBox();
    const [x, y] = el.style.transformOrigin.split(" ").map(parseFloat);
    const sample = () => {
      const matrix = el.parentElement.getCTM().inverse().multiply(el.getCTM());
      const points = [new DOMPoint(sprite.x + sprite.width, sprite.y), new DOMPoint(x, y)]
        .map(point => point.matrixTransform(matrix)).map(point => [point.x, point.y]);
      return { transform: getComputedStyle(el).transform, points };
    };
    animation.currentTime = 0;
    const first = sample();
    const peakTime = animation.effect.getTiming().duration * .27;
    animation.currentTime = peakTime;
    const peak = sample();
    animation.currentTime = current;
    return { first, peak, peakTime, active: [...el.closest("svg").querySelectorAll(".wr65-prop-reply")]
      .filter(reply => reply.getAnimations().length).map(reply => reply.parentElement.dataset.jungleProp) };
  });
  const delta = index => Math.hypot(...motion.first.points[index].map((value, axis) => value - motion.peak.points[index][axis]));
  if (motion) result.measurements.push({ id, tap, ...motion, tipDelta: delta(0), pivotDelta: delta(1) });
  check(id + ": only selected sprite moves, with its pivot fixed", motion?.active.join() === id && delta(0) > 1 && delta(1) < .05);
  await expect.poll(() => idle.locator(".wr65-prop-reply").evaluate(el => el.getAnimations().length)).toBe(0);
  check(id + ": reply returns to the same idle animation", await idle.evaluate(el => el.getAnimations()[0] === el.qaIdle));
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const [width, height] of [[1440, 900], [1920, 1080], [320, 760], [390, 844]]) {
    const mobile = width < 700;
    for (const dpr of [1, 2]) for (const reduce of baseline ? [false] : [false, true]) {
      for (const scene of ["landing", "home"]) {
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
            if (scene === "home" && mobile) await expect(page.locator(".wr65-hero-mobile-entry button")).toBeVisible();
            await verifyIdle(page, scene, label, reduce);
          }
          if (!reduce) await screenshot(page, label);
        } finally { await ctx.close(); }
      }
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
    await lantern.click();
    await expectPulse(page, ".wr65-hotspot--lantern .wr65-hotspot-pulse", "lantern click brightens original lamp");
    await screenshot(page, "landing-lantern-pressed");
    await verifyPropReply(page, "lantern");
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
    await openScene(hp, "home");
    const marker = hp.getByRole("button", { name: "두 번째 경로 마커와 깃발에 빛 비추기" });
    await marker.focus();
    check("keyboard focus is visible on a marker", await marker.evaluate(e => getComputedStyle(e).outlineStyle === "solid"));
    await marker.press("Space");
    await expectPulse(hp, ".wr65-hotspot--marker-two .wr65-hotspot-pulse", "HOME marker flashes on keyboard activation");
    const route = hp.locator(".wr65-route-light path");
    const offsets = await route.evaluate(e => e.getAnimations().find(a => a.id === "wr65-scene-pulse")
      ?.effect.getKeyframes().map(f => parseFloat(f.strokeDashoffset)));
    check("route light traverses the painted route in one pass", offsets?.[0] > 0 && offsets.at(-1) === -100);
    await screenshot(hp, "home-route-pressed");
    for (const id of ["marker-one", "marker-two", "marker-three"]) await verifyPropReply(hp, id);
    check("marker leaves route and auth unchanged", new URL(hp.url()).pathname === "/lobby" && !home.authCalls.length);
    await hp.locator(".wr65-atmosphere").evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(hp.locator(".wr65-atmosphere")).toHaveClass(/is-paused/);
    check("offscreen effects pause", await hp.locator(".wr65-alive-leaf").first().evaluate(e => getComputedStyle(e).animationPlayState === "paused"));
    check("offscreen flags pause", await motionLayer(hp, "marker-one").evaluate(e => getComputedStyle(e).animationPlayState === "paused"));
    await hp.evaluate(() => {
      window.scrollTo(0, 0);
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(hp.locator(".wr-home-side-art")).toHaveClass(/is-paused/);
    await expect(hp.locator(".wr65-atmosphere")).toHaveClass(/is-paused/);
    check("hidden flags pause", await motionLayer(hp, "marker-three").evaluate(e => getComputedStyle(e).animationPlayState === "paused"));
    await hp.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(hp.locator(".wr65-atmosphere")).not.toHaveClass(/is-paused/);
    check("visibility change pauses and restores ambient effects");

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
    await expect(hp.getByRole("heading", { name: "탐험대 소식" })).toBeVisible();
    await hp.locator(".wr-updates-item").nth(1).click();
    await expect(hp.locator(".wr-updates-article h2")).toHaveText("Wiki Race 2.0 업데이트");
    await hp.getByRole("link", { name: "HOME", exact: true }).click();
    await expect(hp.getByRole("link", { name: "소식" }).locator(".wr-updates-dot")).toHaveCount(0);
    check("updates list, details and read indicator work");
    const play = hp.locator(".wr65-hero-art-entry button");
    await play.hover();
    await expect.poll(() => play.evaluate(e => Number(getComputedStyle(e, "::after").opacity))).toBeGreaterThan(.7);
    await hp.mouse.down();
    check("HOME CTA has press feedback before navigation", await play.evaluate(e => getComputedStyle(e, "::after").opacity === "1"));
    await hp.mouse.up();
    await expect(hp).toHaveURL(base + "/play");
    check("HOME banner CTA routes to PLAY on desktop");
    await home.ctx.close();

    const touch = await pageFor({ width: 320, height: 760, mobile: true, dpr: 2, guest: true });
    await openScene(touch.page, "home");
    await touch.page.locator(".wr65-hotspot--marker-three").tap();
    await expectPulse(touch.page, ".wr65-hotspot--marker-three .wr65-hotspot-pulse", "HOME marker responds on 320px touch viewport");
    await verifyPropReply(touch.page, "marker-three", { tap: true });
    await touch.page.locator(".wr65-hero-art-entry button").tap();
    await expect(touch.page).toHaveURL(base + "/play");
    await touch.page.goBack();
    await expect(touch.page.locator(".wr65-hero-mobile-entry button")).toBeVisible();
    await touch.page.locator(".wr65-hero-mobile-entry button").tap();
    await expect(touch.page).toHaveURL(base + "/play");
    check("both the painted and legible mobile CTA route to PLAY");
    await touch.ctx.close();

    const fallback = await pageFor({ guest: true });
    await fallback.page.route("**/hero-jungle-expedition.webp", route => route.fulfill({ status: 404, body: "" }));
    await fallback.page.goto(base + "/lobby");
    await expect(fallback.page.locator(".wr65-hero-fallback .wr65-hotspot")).toHaveCount(0);
    await fallback.page.locator(".wr65-hero-fallback .wr-play-launcher").click();
    await expect(fallback.page).toHaveURL(base + "/play");
    check("missing HOME art still offers the original fallback action");
    await fallback.ctx.close();

    for (const scene of ["landing", "home"]) {
      const missing = await pageFor({ guest: scene === "home" });
      const tile = scene === "landing" ? "lantern-flame.png" : "flag-three-sprite.png";
      await missing.page.route("**/" + tile, route => route.fulfill({ status: 404, body: "" }));
      const failure = missing.page.waitForResponse(response => response.url().endsWith(tile) && response.status() === 404);
      await openScene(missing.page, scene);
      await failure;
      await expect(missing.page.locator(".wr65-prop-layers")).toHaveCount(0);
      await expect(missing.page.locator(artSelector[scene])).toBeVisible();
      check(scene + ": missing sprite leaves complete original artwork");
      await missing.ctx.close();
    }
  }
  check("no browser runtime exceptions", result.pageErrors.length === 0);
} catch (error) { result.failure = String(error.stack || error); throw error; }
finally {
  try { await browser?.close(); } catch {}
  await server.close();
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.checks.length, failure: result.failure || null }));
}
