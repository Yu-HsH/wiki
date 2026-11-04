// Local-only real Chromium UI check. External APIs/fonts are intercepted.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = 5276, base = "http://127.0.0.1:" + port, api = "http://127.0.0.1:54329";
const out = path.join(root, ".temp/jungle-alive-browser");
fs.mkdirSync(out, { recursive: true });
const result = { checks: [], pageErrors: [], screenshots: [], backendCalls: 0 };
const check = (name, condition) => { assert.ok(condition, name); result.checks.push(name); console.log("PASS " + name); };
const server = await createServer({ root, configFile: false, envFile: false,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(api),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("local-test-public-only"),
    "import.meta.env.VITE_MAINTENANCE": JSON.stringify(""),
  },
  server: { host: "127.0.0.1", port, strictPort: true },
});
let browser;
async function pageFor({ width = 1440, height = 900, mobile = false, reduce = false, guest = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, isMobile: mobile, hasTouch: mobile,
    reducedMotion: reduce ? "reduce" : "no-preference", serviceWorkers: "block",
  });
  if (guest) await ctx.addInitScript(() => localStorage.setItem("wiki_game_local_user", JSON.stringify({
    id: "guest-jungle-ui", displayName: "정글 검수", isGuest: true, mode: "local",
  })));
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.origin === base) return route.continue();
    if (u.origin === api) { result.backendCalls++; return route.fulfill({ status: 200, json: [],
      headers: { "access-control-allow-origin": "*", "content-range": "0-0/0" } }); }
    return route.fulfill({ status: 200, body: "", contentType: "text/plain" });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", e => result.pageErrors.push(e.message));
  return { ctx, page };
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true, animations: "allow" });
  result.screenshots.push(name);
}
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const landing = await pageFor({});
  await landing.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await landing.page.locator(".wr65-landing-art .wr65-atmosphere").waitFor();
  const state = await landing.page.evaluate(() => {
    const root = document.querySelector(".wr65-landing-art .wr65-atmosphere");
    const img = document.querySelector(".wr65-landing-picture");
    const btn = document.querySelector(".wr65-landing-hit-login");
    const r = btn.getBoundingClientRect();
    return {
      width: img.naturalWidth, height: img.naturalHeight,
      leaves: root.querySelectorAll(".wr65-alive-leaf-track").length,
      fireflies: root.querySelectorAll(".wr65-alive-firefly").length,
      canopies: root.querySelectorAll(".wr65-alive-canopy").length,
      safe: document.elementFromPoint(r.left + r.width/2, r.top + r.height/2) === btn,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      imageTransform: getComputedStyle(img).transform,
    };
  });
  check("landing native 1672x941 preserved", state.width === 1672 && state.height === 941);
  check("two vector canopies, eight leaves and seven fireflies", state.canopies === 2 && state.leaves === 8 && state.fireflies === 7);
  check("login hit target unobstructed and image unmoved", state.safe && state.imageTransform === "none");
  check("desktop landing no horizontal overflow", !state.overflow);
  const r = await landing.page.locator(".wr65-landing-art").boundingBox();
  await landing.page.mouse.move(r.x + r.width * .88, r.y + r.height * .7);
  await expect.poll(() => landing.page.locator(".wr65-atmosphere").evaluate(e =>
    e.style.getPropertyValue("--wr65-near-x"))).not.toBe("0px");
  check("mouse updates only decoration parallax", true);
  await screenshot(landing.page, "landing-1440");
  await landing.page.getByRole("button", { name: "Wiki Race 로그인" }).click();
  await expect(landing.page.locator(".intro-modal-card")).toBeVisible();
  check("real login modal still opens", true);
  await landing.ctx.close();

  const home = await pageFor({ guest: true });
  await home.page.goto(base + "/lobby", { waitUntil: "domcontentloaded" });
  await home.page.locator(".wr65-jungle-hero .wr65-atmosphere").waitFor();
  await home.page.waitForTimeout(950); // Existing 720ms notebook entrance must finish.
  const hero = await home.page.evaluate(() => {
    const img = document.querySelector(".wr65-jungle-hero .wr-landscape");
    const btn = document.querySelector(".wr65-jungle-hero .wr-play-launcher");
    const r = btn.getBoundingClientRect();
    return { width: img.naturalWidth, height: img.naturalHeight,
      safe: btn.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),
      moved: getComputedStyle(img).transform !== "none" };
  });
  console.log("HOME hit diagnostics " + JSON.stringify(hero));
  check("HOME native 1535x436 preserved", hero.width === 1535 && hero.height === 436);
  check("HOME CTA remains clickable", hero.safe && !hero.moved);
  await screenshot(home.page, "home-1440");
  await home.ctx.close();

  const mobile = await pageFor({ width: 390, height: 844, mobile: true });
  await mobile.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await mobile.page.locator(".wr65-landing-mobile-controls").waitFor();
  check("mobile login visible", await mobile.page.locator(".wr65-landing-start").isVisible());
  check("mobile no horizontal overflow", await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
  await screenshot(mobile.page, "landing-390");
  await mobile.ctx.close();

  const reduced = await pageFor({ reduce: true });
  await reduced.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await reduced.page.locator(".wr65-atmosphere").waitFor();
  check("reduced motion hides animated overlay", await reduced.page.locator(".wr65-atmosphere").evaluate(e => getComputedStyle(e).display === "none"));
  await reduced.ctx.close();
  check("no browser runtime exceptions", result.pageErrors.length === 0);
} catch (error) { result.failure = String(error.stack || error); throw error; }
finally {
  try { await browser?.close(); } catch {}
  await server.close();
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.checks.length, failure: result.failure || null }));
}
