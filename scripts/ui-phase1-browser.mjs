// Isolated presentation regression. API fixtures are confined to this browser;
// no requests reach a real Supabase project and no fixture enters production code.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";

const base = "http://127.0.0.1:5186";
const api = "http://127.0.0.1:54329";
const output = "test-results/packet13-b1/ui-phase1";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5186", "--strictPort"], {
  env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: "ui-test-only", VITE_MAINTENANCE: "false" }, stdio: "ignore",
});
let browser;
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const user = { id: "11111111-1111-4111-8111-111111111111", email: "fixture@example.invalid", user_metadata: { nickname: "검증 탐험가" } };
const requests = [];
const consoleErrors = [];
const externalResources = new Set();
try {
  await fs.mkdir(output, { recursive: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true });
  async function context(guest = false) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === base || url.origin === api) return route.continue();
      externalResources.add(url.origin);
      await route.fulfill({ status: 200, contentType: "text/css", body: "" });
    });
    await ctx.route(`${api}/**`, async route => {
      const url = new URL(route.request().url());
      requests.push(url.pathname);
      let body = [];
      if (url.pathname.includes("/auth/")) body = user;
      else if (url.pathname.endsWith("ensure_today_daily_challenge")) body = [{ target_title: "검증용 실제 응답 목표", start_title: "검증 출발", hint: "서비스 응답으로 표시되는 코스", challenge_date: "2026-10-07" }];
      else if (url.pathname.endsWith("get_xp_summary_v1")) body = { ok: true, total_xp: 321, level: 3, current_level_xp: 21, next_level_xp: 200 };
      else if (url.pathname.endsWith("get_my_achievements_v1")) body = { ok: true, unseenCount: 2, achievements: [], hidden: { discovered: 0, achievements: [] } };
      else if (url.pathname.endsWith("mark_achievements_seen_v1")) body = { ok: true, marked: 2 };
      else if (url.pathname.endsWith("get_profile_card_v1")) body = { ok: true, card: null };
      else if (url.pathname.endsWith("get_profile_cards_v1")) body = { ok: true, cards: {} };
      else if (url.pathname.endsWith("game_records")) body = [{ id: "record", user_id: user.id, player_name: "검증 탐험가", target_title: "서비스 기록 목표", start_title: "출발", elapsed_seconds: 92, click_count: 4, created_at: new Date().toISOString(), path_titles: ["출발", "서비스 기록 목표"] }];
      else if (url.pathname.endsWith("profiles")) body = [{ id: user.id, nickname: "검증 탐험가", total_xp: 321, profile_level: 3 }];
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/0" }, body: JSON.stringify(body) });
    });
    await ctx.route("https://ko.wikipedia.org/w/api.php?**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ query: { search: [{ title: "검색 응답 문서", snippet: "검증용 검색 설명" }] } }) }));
    await ctx.route("https://pagead2.googlesyndication.com/**", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await ctx.addInitScript(({ guest, user }) => {
      if (guest) localStorage.setItem("wiki_game_local_user", JSON.stringify({ id: "guest-ui-check", displayName: "게스트", isGuest: true, mode: "local" }));
      else localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "ui-fixture-token", refresh_token: "ui-fixture-refresh", token_type: "bearer", expires_at: Math.floor(Date.now()/1000) + 3600, user }));
    }, { guest, user });
    const page = await ctx.newPage();
    page.on("pageerror", e => consoleErrors.push(e.message));
    page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    return { ctx, page };
  }
  const { ctx, page } = await context();
  await page.goto(`${base}/lobby`);
  await page.getByRole("heading", { name: "검증 탐험가", exact: true }).waitFor();
  check("authenticated HOME and response-driven XP", (await page.locator(".wr-xp").innerText()).includes("321 XP"));
  check("daily data from existing service", (await page.locator(".daily-keyword").innerText()) === "검증용 실제 응답 목표");
  check("recent records from existing service", (await page.locator(".recent-list").innerText()).includes("서비스 기록 목표"));
  check("achievement notice visible", await page.locator(".ach-notice").isVisible());
  await page.getByRole("button", { name: "새 업적 알림 닫기" }).click();
  await page.reload();
  await page.locator(".wr-xp").waitFor();
  check("achievement dismiss persists without mark-seen RPC", await page.locator(".ach-notice").count() === 0 && !requests.some(x => x.endsWith("mark_achievements_seen_v1")));
  for (const [name, href] of [["랭킹", "/ranking"], ["업적", "/achievements"]]) {
    await page.getByRole("navigation").getByRole("link", { name, exact: true }).click();
    check(`HOME → ${href}`, new URL(page.url()).pathname === href);
    await page.goto(`${base}/lobby`);
  }
  await page.getByRole("link", { name: "검증 탐험가 프로필" }).click();
  check("HOME → profile", new URL(page.url()).pathname === "/profile");
  await page.goto(`${base}/lobby`);
  await page.getByRole("button", { name: "PLAY 탐험 시작 →" }).click();
  await page.locator(".wr-mode").first().waitFor();
  check("HOME → PLAY", new URL(page.url()).pathname === "/play");
  check("three equal desktop columns", (await page.locator(".wr-mode").evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().width))).every((v, _, a) => Math.abs(v - a[0]) < 1));
  check("no nested mode controls", await page.locator(".wr-mode button, .wr-mode a").count() === 0);
  // Capture base/hover/focus independently; previous screenshots retained both
  // restored single keyboard focus and the pointer over the duel column.
  const modeStyles = () => page.locator(".wr-mode").evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, shadow: style.boxShadow, hover: node.matches(":hover"), focus: node.matches(":focus-visible") };
  }));
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  await expect.poll(async () => (await modeStyles()).every(style => style.background === "rgba(0, 0, 0, 0)" && style.shadow === "none" && !style.hover && !style.focus)).toBe(true);
  const baseStyles = await modeStyles();
  check("desktop base hierarchy equal with no hover/focus", baseStyles.every(style => style.background === baseStyles[0].background && style.shadow === "none" && !style.hover && !style.focus));
  await page.screenshot({ path: `${output}/play-desktop-base.png`, fullPage: true, animations: "disabled" });
  for (let i = 0; i < 3; i++) {
    await page.locator(".wr-mode").nth(i).hover();
    await expect.poll(async () => (await modeStyles()).every((style, index) => style.background === (index === i ? "rgb(242, 246, 236)" : baseStyles[0].background))).toBe(true);
    const hovered = await modeStyles();
    check(`only hovered desktop mode ${i} changes background`, hovered[i].hover && hovered[i].background !== baseStyles[0].background && hovered.every((style, index) => index === i || style.background === baseStyles[0].background));
    if (i === 1) await page.screenshot({ path: `${output}/play-desktop-hover.png`, fullPage: true, animations: "disabled" });
  }
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await page.locator(".wr-mode").first().focus();
  await expect.poll(async () => (await modeStyles()).every((style, index) => style.background === (index === 0 ? "rgb(242, 246, 236)" : baseStyles[0].background))).toBe(true);
  await expect.poll(async () => (await modeStyles()).every((style, index) => index === 0 ? style.focus && style.shadow.includes("rgb(50, 104, 168)") : style.shadow === "none")).toBe(true);
  const focused = await modeStyles();

  check("keyboard focus uses blue whole-region outline only on focused mode", focused[0].focus && focused[0].shadow.includes("rgb(50, 104, 168)") && focused.slice(1).every(style => style.shadow === "none" && style.background === baseStyles[0].background));
  await page.screenshot({ path: `${output}/play-desktop-focus.png`, fullPage: true, animations: "disabled" });
  const contours = page.locator(".wr-play-contours");
  check("desktop contours are visible noninteractive decoration", await contours.evaluate(node => {
    const style = getComputedStyle(node);
    return node.getAttribute("aria-hidden") === "true" && node.getAttribute("focusable") === "false" && style.position === "absolute" && style.pointerEvents === "none" && Number(style.opacity) < 1 && node.querySelectorAll("path").length === 3;
  }));
  check("contours cause no layout shift", await contours.evaluate(node => {
    const measure = () => [...node.parentElement.querySelectorAll(".wr-mode")].map(mode => { const r = mode.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const before = measure(); node.style.display = "none"; const hidden = measure(); node.style.removeProperty("display");
    return JSON.stringify(before) === JSON.stringify(hidden);
  }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  check("contours stay static under reduced motion", await contours.evaluate(node => getComputedStyle(node).animationName === "none"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator(".wr-mode").first().focus();
  await page.keyboard.press("Tab");
  check("one tab stop per mode", await page.locator(".wr-mode").nth(1).evaluate(n => n === document.activeElement));
  check("visible keyboard focus", await page.locator(".wr-mode").nth(1).evaluate(n => getComputedStyle(n).boxShadow !== "none"));
  await page.keyboard.press("Enter");
  await page.locator(".mp-mode-panel").waitFor();
  check("Enter → real duel entry", new URL(page.url()).searchParams.get("mode") === "duel" && (await page.locator(".mp-mode-card--active").innerText()).includes("1 vs 1"));
  await page.goto(`${base}/play`);
  await page.locator(".wr-mode").nth(2).focus();
  await page.keyboard.press("Space");
  await page.locator(".mp-mode-panel").waitFor();
  check("Space → real group entry", new URL(page.url()).searchParams.get("mode") === "group" && (await page.locator(".mp-mode-card--active").innerText()).includes("단체"));
  await page.goto(`${base}/play`);
  await page.reload();
  await page.locator(".wr-mode").first().click();
  await page.getByRole("dialog").waitFor();
  check("direct/refresh PLAY → existing single setup", await page.getByRole("dialog").isVisible());
  await page.getByPlaceholder("예: 아인슈타인, 조선왕조...").fill("랜덤");
  check("existing random start available", await page.getByRole("button", { name: "랜덤 목표로 시작" }).isEnabled());
  await page.getByPlaceholder("예: 아인슈타인, 조선왕조...").fill("검색어");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const candidate = page.getByRole("button", { name: "검색 응답 문서 검증용 검색 설명" });
  await candidate.focus();
  await page.keyboard.press("Space");
  check("keyboard search selection uses real search service", await candidate.getAttribute("aria-pressed") === "true" && await page.getByRole("button", { name: "'검색 응답 문서' 시작" }).isEnabled());
  await page.getByRole("button", { name: "'검색 응답 문서' 시작" }).focus();
  await page.keyboard.press("Tab");
  check("single dialog traps Tab", await page.getByPlaceholder("예: 아인슈타인, 조선왕조...").evaluate(n => n === document.activeElement));
  await page.keyboard.press("Escape");
  await expect(page.locator(".wr-mode").first()).toBeFocused();
  check("dialog Escape restores focus", await page.locator(".wr-mode").first().evaluate(n => n === document.activeElement));
  await page.screenshot({ path: `${output}/play-desktop.png`, fullPage: true, animations: "disabled" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/play", "/lobby"]) {
      await page.goto(`${base}${path}`); await page.locator(".wr-shell").waitFor();
      check(`${path} no overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (path === "/play") {
        check(`stacked modes at ${width}px`, await page.locator(".wr-mode").evaluateAll(n => n[1].getBoundingClientRect().top >= n[0].getBoundingClientRect().bottom));
        check(`contours hidden at ${width}px`, await page.locator(".wr-play-contours").evaluate(node => getComputedStyle(node).display === "none"));
      }
      await page.screenshot({ path: `${output}/${path.slice(1)}-${width}.png`, fullPage: true, animations: "disabled" });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/lobby`);
  check("reduced motion disables entrance", await page.locator(".wr-explorer").evaluate(n => getComputedStyle(n).animationName === "none"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${output}/home-desktop.png`, fullPage: true, animations: "disabled" });
  await ctx.close();
  const guest = await context(true);
  await guest.page.goto(`${base}/lobby`);
  await guest.page.getByRole("heading", { name: "게스트", exact: true }).waitFor();
  check("guest HOME hides restricted header links", await guest.page.getByRole("navigation").getByRole("link", { name: "업적" }).count() === 0);
  await guest.page.goto(`${base}/play`);
  for (const i of [1, 2]) {
    await guest.page.locator(".wr-mode").nth(i).click({ force: true });
    await guest.page.locator(".wr-mode").nth(i).focus();
    await guest.page.keyboard.press("Enter");
    await guest.page.keyboard.press("Space");
    check(`guest mode ${i} cannot enter multiplayer with pointer/keyboard`, new URL(guest.page.url()).pathname === "/play");
  }
  await guest.page.locator(".wr-mode").first().click();
  check("guest single remains reachable", await guest.page.getByRole("dialog").isVisible());
  await guest.ctx.close();
  if (consoleErrors.length) console.log(JSON.stringify(consoleErrors));
  check("browser console/page errors absent", consoleErrors.length === 0);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ basis: "6629445 + uncommitted UI working tree", date: "2026-10-07", fixtureOnly: true, externalResources: [...externalResources], checks, consoleErrors }, null, 2));
  console.log(`PASS ${checks.length} browser checks (isolated API fixtures; real backend not exercised)`);
} finally { await browser?.close(); server.kill(); }
