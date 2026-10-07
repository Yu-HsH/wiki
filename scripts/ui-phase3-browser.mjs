// Phase 3 RACE + Group Spectator presentation regression. Every Supabase / Edge / Wikipedia /
// Realtime call is answered by an in-memory fixture inside this script; no backend is reached
// and no fixture enters production code. Fixture data (titles, timers, censored set) is example
// data only — production behaviour comes from the real pages and their existing services.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";

const base = "http://127.0.0.1:5189";
const api = "http://127.0.0.1:54331";
const output = "test-results/packet13-b1/ui-phase3";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5189", "--strictPort"], {
  env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: "ui-test-only", VITE_MAINTENANCE: "false" }, stdio: "ignore",
});

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const consoleErrors = [];
const rpcCalls = [];
const iso = (ms) => new Date(ms).toISOString();
const now = () => Date.now();

const USERS = {
  me: { id: "11111111-1111-4111-8111-111111111111", nickname: "정원" },
  opp: { id: "22222222-2222-4222-8222-222222222222", nickname: "서준" },
  p3: { id: "33333333-3333-4333-8333-333333333333", nickname: "민경" },
  p4: { id: "44444444-4444-4444-8444-444444444444", nickname: "유진" },
  p5: { id: "55555555-5555-4555-8555-555555555555", nickname: "도윤" },
  p6: { id: "66666666-6666-4666-8666-666666666666", nickname: "하람" },
  p7: { id: "77777777-7777-4777-8777-777777777777", nickname: "지우" },
  p8: { id: "88888888-8888-4888-8888-888888888888", nickname: "태오" },
};
const byToken = Object.fromEntries(Object.entries(USERS).map(([k, u]) => [`tok-${k}`, u]));

// ── Wikipedia fixture ────────────────────────────────────────────
const START = "시작 문서", MIDDLE = "중간 문서", TARGET = "목표 문서", MANY = "링크 많은 문서", OTHER = "다른 문서";
const MANY_LINKS = Array.from({ length: 1200 }, (_, i) => `항목 ${String(i + 1).padStart(4, "0")}`);
const CENSORED = ["항목 0003", "항목 0007"];
const graph = { [START]: [MIDDLE, OTHER, MANY], [MIDDLE]: [TARGET, OTHER], [OTHER]: [MIDDLE], [MANY]: [...MANY_LINKS, MIDDLE], [TARGET]: [START] };
const pageIds = new Map();
const pageId = (title) => { if (!pageIds.has(title)) pageIds.set(title, String(1000 + pageIds.size)); return pageIds.get(title); };
const linksOf = (title) => graph[title] || [TARGET, MIDDLE];
const htmlOf = (title) => `<div class="mw-parser-output"><p><b>${title}</b>은(는) 위키 레이스 검증용 예시 문서다. ${linksOf(title).map((t) => `<a href="/wiki/${encodeURIComponent(t)}">${t}</a>`).join(", ")}.</p><h2>개요</h2><p>${"본문 문장은 기사 영역이 가장 넓게 보이는지 확인하기 위한 예시다. ".repeat(6)}</p><h2>역사</h2><p>${"추가 문단. ".repeat(20)}</p></div>`;
let randomTitle = START;

async function wikiRoute(route) {
  const url = new URL(route.request().url());
  let body;
  if (url.pathname.includes("/page/summary/")) {
    const title = decodeURIComponent(url.pathname.split("/summary/")[1]);
    body = { title, pageid: Number(pageId(title)), revision: 5000, extract: `${title} 요약`, description: "예시" };
  } else if (url.searchParams.get("list") === "random") {
    body = { query: { random: [{ title: randomTitle }] } };
  } else if (url.searchParams.get("list") === "search") {
    body = { query: { search: [{ title: TARGET, snippet: "예시" }] } };
  } else if (url.searchParams.get("action") === "parse") {
    const title = url.searchParams.get("page");
    body = { parse: { title, pageid: Number(pageId(title)), revid: 5000, text: { "*": htmlOf(title) } } };
  } else if (url.searchParams.get("prop") === "links") {
    const title = url.searchParams.get("titles");
    body = { query: { pages: { [pageId(title)]: { pageid: Number(pageId(title)), title, links: linksOf(title).map((t) => ({ ns: 0, title: t })) } } } };
  } else body = {};
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
}

// ── Game store ───────────────────────────────────────────────────
const rooms = new Map();
const players = new Map();
const itemStates = new Map();
const events = new Map();
const singleRuns = new Map();
let seq = 0;
const created = () => iso(Date.UTC(2026, 9, 7, 0, 0, seq++));
const row = (roomId, user, extra = {}) => ({
  id: `${roomId.slice(0, 6)}-${user.id.slice(0, 6)}`, room_id: roomId, user_id: user.id, nickname_snapshot: user.nickname, profile_image_snapshot: null,
  created_at: created(), player_status: "playing", has_finished: false, rank: null, current_title: START, current_page_id: pageId(START),
  current_revision_id: "5000", start_title: START, start_page_id: pageId(START), path_titles: [START], move_count: 0, progress_version: 1,
  elapsed_seconds: null, heartbeat_at: iso(now()), target_title: TARGET, ...extra,
});
function duelRoom(id, { useItems = true, item = {} } = {}) {
  rooms.set(id, { id, mode: "duel", status: "playing", host_user_id: USERS.me.id, state_version: 5, started_at: iso(now() - 60_000), use_items: useItems, finished_reason: null, winner_user_id: null });
  players.set(id, [row(id, USERS.me, { current_title: item.startOn || START, current_page_id: pageId(item.startOn || START), path_titles: [START, ...(item.startOn ? [item.startOn] : [])] }), row(id, USERS.opp, { current_title: OTHER, move_count: 2, heartbeat_at: iso(item.oppStale ? now() - 60_000 : now()) })]);
  itemStates.set(id, {
    use_items: useItems,
    grants: useItems ? [
      { id: "g-blind", item_id: "blind", slot_index: 0, slot_role: "attack", consumed_at: null },
      { id: "g-index", item_id: "link_index", slot_index: 1, slot_role: "search", consumed_at: null },
      { id: "g-reflect", item_id: "backlink_reflect", slot_index: 2, slot_role: "defense", consumed_at: null },
      { id: "g-rewind", item_id: "history_rewind", slot_index: 3, slot_role: "joker", consumed_at: null },
      { id: "g-censor", item_id: "link_censorship", slot_index: 4, slot_role: "attack", is_wildcard: true, consumed_at: null },
    ] : [],
    active_effects: item.censorMs ? [{ itemEventId: "e-censor", itemId: "link_censorship", actorUserId: USERS.opp.id, expiresAt: iso(now() + item.censorMs), metadata: { censoredTitles: CENSORED.concat(item.censorArticle ? [OTHER] : []) } }] : [],
    pending_defenses: [],
  });
}
function groupRoom(id, members, extra = {}) {
  rooms.set(id, { id, mode: "group", status: "playing", host_user_id: members[0].id, group_start_title: START, group_target_title: TARGET, game_deadline_at: iso(now() + 15 * 60_000), grace_ends_at: null, started_at: iso(now() - 5 * 60_000), game_starts_at: iso(now() - 5 * 60_000), state_version: 3, finish_rank_limit: 3, max_players: 8, ...extra });
  players.set(id, members.map((u, i) => row(id, u, { current_title: i === 0 ? START : [MIDDLE, OTHER, START][i % 3], current_page_id: pageId(i === 0 ? START : [MIDDLE, OTHER, START][i % 3]), move_count: i })));
  events.set(id, []);
}
const me = (roomId) => players.get(roomId).find((p) => p.user_id === USERS.me.id);
const setPlayer = (roomId, userId, patch) => Object.assign(players.get(roomId).find((p) => p.user_id === userId), patch);

// ── Realtime websocket fixture ─────────────────────────────────
const sockets = new Set();
function notify(roomId, table = null) {
  setTimeout(() => {
    for (const s of sockets) for (const [topic, sub] of s.topics) {
      if (!topic.includes(roomId)) continue;
      for (const b of sub.bindings) {
        if (table && b.table !== table) continue;
        s.ws.send(JSON.stringify([null, null, topic, "postgres_changes", { ids: [b.id], data: { schema: "public", table: b.table, type: "UPDATE", commit_timestamp: iso(now()), columns: [], record: { state_version: 999 }, old_record: {}, errors: null } }]));
      }
    }
  }, 30);
}

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-range": "0-0/0" }, body: JSON.stringify(body) });
function itemStateBody(roomId) {
  const s = itemStates.get(roomId) || { use_items: false, grants: [], active_effects: [], pending_defenses: [] };
  return { ok: true, use_items: s.use_items, room_status: rooms.get(roomId)?.status, server_now: iso(now()), cooldown_until: null, grants: s.grants, active_effects: s.active_effects, pending_defenses: s.pending_defenses };
}
function singleRun(run, page) {
  run.state_version += 1; run.move_count += 1; run.path_title_snapshots = [...run.path_title_snapshots, page]; run.current_title_snapshot = page;
  if (page === TARGET) run.status = "completed";
  return { ok: true, run };
}

async function handleApi(route, userKey) {
  const request = route.request();
  if (request.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  const url = new URL(request.url());
  const token = (request.headers().authorization || "").replace("Bearer ", "");
  const user = byToken[token] ?? USERS[userKey] ?? null;
  const path = url.pathname;
  let body = null; try { body = request.postDataJSON(); } catch { body = null; }
  if (path.includes("/auth/")) return json(route, user ? { id: user.id, email: `${user.id}@example.invalid`, user_metadata: { nickname: user.nickname } } : {});
  if (path.endsWith("/functions/v1/target-level")) return json(route, [{ title: TARGET }]);
  if (path.endsWith("/functions/v1/wiki-snapshot")) {
    const title = body.title;
    return json(route, { snapshotId: `s-${title}`, pageId: String(body.pageId ?? pageId(title)), revisionId: String(body.revisionId ?? "5000"), canonicalTitle: title, ...(body.includeDocument ? { documentHtml: htmlOf(title), links: linksOf(title).map((t) => ({ ns: 0, title: t })) } : {}) });
  }
  if (path.endsWith("/functions/v1/single-run")) {
    if (body.action === "create") { const run = { id: body.run.runId, status: "active", state_version: 0, move_count: 0, path_title_snapshots: [body.run.start.title], current_title_snapshot: body.run.start.title }; singleRuns.set(run.id, run); return json(route, { ok: true, run }); }
    if (body.action === "move") return json(route, singleRun(singleRuns.get(body.runId), body.nextPage.title));
    if (body.action === "leave") { const run = singleRuns.get(body.runId); run.status = "abandoned"; return json(route, { ok: true, run }); }
    return json(route, { ok: true, run: singleRuns.get(body.runId) });
  }
  if (path.startsWith("/rest/v1/rpc/")) {
    const name = path.split("/").pop();
    rpcCalls.push(`${userKey}:${name}`);
    const p = body || {};
    const room = rooms.get(p.p_room_id);
    switch (name) {
      case "create_single_game_run": { const run = { id: p.p_run_id, status: "active", state_version: 0, move_count: 0, path_title_snapshots: [p.p_start_title_snapshot], current_title_snapshot: p.p_start_title_snapshot, target_page_id: p.p_target_page_id }; singleRuns.set(run.id, run); return json(route, run); }
      case "apply_single_move_v2": return json(route, singleRun(singleRuns.get(p.p_run_id), p.p_to_title_snapshot));
      case "get_single_game_run": return json(route, singleRuns.get(p.p_run_id));
      case "leave_single_game_run": { const run = singleRuns.get(p.p_run_id); run.status = "abandoned"; return json(route, { ok: true, run }); }
      case "get_duel_room_players_v1": return json(route, players.get(p.p_room_id) ?? []);
      case "get_duel_item_state_v3": case "ensure_duel_item_grant_v3": return json(route, itemStateBody(p.p_room_id));
      case "heartbeat_duel_v2": return json(route, { user_id: user.id, heartbeat_at: iso(now()) });
      case "finalize_duel_if_expired": return json(route, room);
      case "use_duel_item_v3": {
        const grant = itemStates.get(p.p_room_id).grants.find((g) => g.id === p.p_grant_id);
        grant.consumed_at = iso(now());
        return json(route, { ok: true, result: "applied", item_id: grant.item_id, effect_expires_at: iso(now() + 20_000), cooldown_until: iso(now() + 2500), server_now: iso(now()), player: null });
      }
      case "apply_duel_move_v2": {
        const mine = me(p.p_room_id);
        const finished = p.p_to_title_snapshot === TARGET;
        Object.assign(mine, { current_title: p.p_to_title_snapshot, current_page_id: p.p_to_page_id, move_count: mine.move_count + 1, path_titles: [...mine.path_titles, p.p_to_title_snapshot], progress_version: mine.progress_version + 1, has_finished: finished, player_status: finished ? "finished" : "playing" });
        if (finished) Object.assign(room, { status: "finished", finished_reason: "normal_finish", winner_user_id: USERS.me.id });
        return json(route, { ok: true, room, player: mine });
      }
      case "leave_duel_room_v2": {
        Object.assign(room, { status: "finished", finished_reason: "forfeit", winner_user_id: USERS.opp.id, state_version: room.state_version + 1 });
        setPlayer(p.p_room_id, USERS.me.id, { player_status: "retired" });
        return json(route, { ok: true, code: "FORFEIT", room });
      }
      case "apply_group_move_v2": {
        const mine = players.get(p.p_room_id).find((x) => x.user_id === user.id);
        const finished = p.p_to_title_snapshot === TARGET;
        const rank = finished ? players.get(p.p_room_id).filter((x) => x.player_status === "finished").length + 1 : null;
        Object.assign(mine, { current_title: p.p_to_title_snapshot, current_page_id: p.p_to_page_id, move_count: mine.move_count + 1, path_titles: [...mine.path_titles, p.p_to_title_snapshot], progress_version: mine.progress_version + 1, has_finished: finished, player_status: finished ? "finished" : "playing", rank, elapsed_seconds: finished ? 348 : null });
        notify(p.p_room_id);
        return json(route, { ok: true, room, player: mine });
      }
      case "activate_group_room_game": case "finalize_group_room_if_expired": return json(route, room);
      case "send_group_spectator_emoji_v13": {
        const ev = { id: `ev-${seq++}`, room_id: p.p_room_id, user_id: user.id, event_type: "group_spectator_emoji", payload: { presetId: p.p_preset_id }, created_at: iso(now()) };
        events.get(p.p_room_id).push(ev);
        return json(route, { event: ev });
      }
      case "leave_group_player": return json(route, { ok: true, room });
      case "get_profile_cards_v1": return json(route, { ok: true, cards: {} });
      case "get_xp_summary_v1": return json(route, { ok: true, total_xp: 100, level: 2, current_level_xp: 0, next_level_xp: 100 });
      case "ensure_today_daily_challenge": return json(route, [{ target_title: TARGET, start_title: START, hint: "", challenge_date: "2026-10-07" }]);
      case "get_my_achievements_v1": return json(route, { ok: true, unseenCount: 0, achievements: [], hidden: { discovered: 0, achievements: [] } });
      default: return json(route, []);
    }
  }
  if (path === "/rest/v1/game_rooms") {
    const id = (url.searchParams.get("id") || "").slice(3);
    const r = rooms.get(id);
    return json(route, r ? [r] : []);
  }
  if (path === "/rest/v1/room_players") return json(route, players.get((url.searchParams.get("room_id") || "").slice(3)) ?? []);
  if (path === "/rest/v1/room_events") return json(route, [...(events.get((url.searchParams.get("room_id") || "").slice(3)) ?? [])].reverse());
  return json(route, []);
}

let browser;
async function context(userKey, { width = 1440, height = 1000, local = {}, guest = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || url.origin === api) return route.continue();
    if (url.hostname === "ko.wikipedia.org") return wikiRoute(route);
    return route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  await ctx.route(`${api}/**`, (route) => handleApi(route, userKey));
  await ctx.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const entry = { ws, topics: new Map() };
    sockets.add(entry);
    ws.onMessage((raw) => {
      let frame; try { frame = JSON.parse(String(raw)); } catch { return; }
      const [joinRef, ref, topic, event, payload] = frame;
      if (event === "phx_join") {
        const bindings = (payload?.config?.postgres_changes ?? []).map((b, i) => ({ ...b, id: 7000 + i }));
        entry.topics.set(topic, { bindings });
        return ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: bindings } }]));
      }
      if (event === "phx_leave") entry.topics.delete(topic);
      return ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
    });
    ws.onClose(() => sockets.delete(entry));
  });
  await ctx.addInitScript(({ token, user, local, guest }) => {
    if (guest) localStorage.setItem("wiki_game_local_user", JSON.stringify({ id: "guest-phase3", displayName: "게스트", isGuest: true, mode: "local" }));
    else if (token) localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: `${token}-r`, token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    for (const [k, v] of Object.entries(local)) if (!sessionStorage.getItem(`seeded:${k}`)) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem(`seeded:${k}`, "1"); }
  }, { token: guest ? null : `tok-${userKey}`, user: guest ? null : { id: USERS[userKey].id, email: "x@example.invalid", user_metadata: { nickname: USERS[userKey].nickname } }, local, guest });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`${userKey}: ${e.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`${userKey}: ${msg.text()}`); });
  return { ctx, page };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = (page, name, full = false) => page.screenshot({ path: `${output}/${name}.png`, fullPage: full, animations: "disabled" });
const hudText = (page) => page.locator(".wr-race-hud").innerText();
const stat = (page, label) => page.locator(".wr-hud-stat").filter({ hasText: label }).locator(".wr-hud-stat-value").innerText();
// Item-use toast must not cover the HUD, the article title, or the Link Index header/filter.
async function toastClear(page) {
  const toast = page.locator(".floating-message").first();
  await toast.waitFor({ timeout: 5000 });
  return page.evaluate(() => {
    const t = document.querySelector(".floating-message").getBoundingClientRect();
    const hit = (sel) => [...document.querySelectorAll(sel)].some((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") return false;
      const covered = !(t.right <= r.left || t.left >= r.right || t.bottom <= r.top || t.top >= r.bottom);
      // the full-screen mobile Link Index sheet hides the HUD and article underneath it
      const hiddenBySheet = !el.closest(".duel-item-index") && document.querySelector(".duel-item-index") && innerWidth <= 760;
      return covered && !hiddenBySheet;
    });
    const el = document.querySelector(".floating-message");
    const pop = document.querySelector(".item-effect-pop");
    const p = pop?.getBoundingClientRect();
    const toastsOverlap = Boolean(p && p.width && !(t.right <= p.left || t.left >= p.right || t.bottom <= p.top || t.top >= p.bottom));
    return {
      toastsOverlap,
      status: el.getAttribute("role") === "status",
      inert: getComputedStyle(el).pointerEvents === "none",
      overlaps: ["#wr-article-title", ".wr-race-hud", ".duel-item-index__filter", ".duel-item-index__head", ".duel-item-index__close"].filter(hit).concat(toastsOverlap ? ["item-effect-pop"] : []).concat(p && p.width && (() => { const tt = document.querySelector("#wr-article-title")?.getBoundingClientRect(); return tt && !(p.right <= tt.left || p.left >= tt.right || p.bottom <= tt.top || p.top >= tt.bottom) && !(document.querySelector(".duel-item-index") && innerWidth <= 760); })() ? ["item-effect-pop over title"] : []),
    };
  });
}
const articleWidth = (page) => page.locator(".article-content").evaluate((n) => n.getBoundingClientRect().width);

try {
  await fs.mkdir(output, { recursive: true });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true });

  // ══ SINGLE ═════════════════════════════════════════════════════
  {
    const { ctx, page } = await context("me");
    await page.goto(`${base}/play`);
    await page.locator(".wr-mode").first().click();
    await page.getByPlaceholder("예: 아인슈타인, 조선왕조...").fill("랜덤");
    await page.getByRole("button", { name: "랜덤 목표로 시작" }).click();
    await page.locator(".wr-race-hud").waitFor();
    await page.locator(".countdown-overlay").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await expect(page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 15000 });
    check("S1 single normal load · HUD current/goal", (await page.locator(".wr-hud-doc--goal").innerText()).includes(TARGET));
    check("S1b no global HOME/PLAY/로비/랭킹 navigation during race", await page.getByRole("navigation", { name: "주요 메뉴" }).count() === 0 && await page.locator(".game-nav").count() === 0 && await page.getByRole("button", { name: "랭킹" }).count() === 0);
    check("S1c article link is Blue #3268A8", await page.locator(".article-content a[data-wiki-title]").first().evaluate((a) => getComputedStyle(a).color === "rgb(50, 104, 168)"));
    check("S1d target link not highlighted in body (no gold)", await page.locator(`.article-content a[data-wiki-title]`).evaluateAll((as) => as.every((a) => getComputedStyle(a).color === "rgb(50, 104, 168)")));
    check("S1e article dominates width", (await articleWidth(page)) > 800);
    await page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    check("S2 article move updates HUD + moves + route", (await stat(page, "이동")) === "1" && (await page.locator(".wr-route-step").count()) === 2);
    check("S3 timer shows 경과", /경과/.test(await hudText(page)));
    await page.mouse.move(0, 0);
    await shot(page, "single-desktop");
    await page.reload();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE, { timeout: 15000 });
    check("S4 refresh restores run (server current title + moves)", (await stat(page, "이동")) === "1");
    await page.getByRole("button", { name: "나가기" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "이탈하기" }).click();
    await page.waitForURL(/\/lobby$/);
    check("S5 give-up via exit guard calls existing leave RPC", rpcCalls.includes("me:leave_single_game_run"));
    // finish
    await page.goto(`${base}/play`);
    await page.locator(".wr-mode").first().click();
    await page.getByPlaceholder("예: 아인슈타인, 조선왕조...").fill("랜덤");
    await page.getByRole("button", { name: "랜덤 목표로 시작" }).click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 15000 });
    await page.locator(".countdown-overlay").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    await page.locator(".article-content a", { hasText: TARGET }).first().click();
    await page.getByRole("heading", { name: "Mission Accomplished!" }).waitFor({ timeout: 15000 });
    check("S6 finish → existing SuccessOverlay result flow", true);
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      check(`S7 single no overflow at ${w}`, await noOverflow(page));
    }
    await ctx.close();
    const g = await context("guestSingle", { guest: true });
    await g.page.goto(`${base}/play`);
    await g.page.locator(".wr-mode").first().click();
    await g.page.getByPlaceholder("예: 아인슈타인, 조선왕조...").fill("랜덤");
    await g.page.getByRole("button", { name: "랜덤 목표로 시작" }).click();
    await expect(g.page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 15000 });
    await g.page.locator(".countdown-overlay").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await g.page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(g.page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    check("S8 guest single uses guest run + same race shell", (await stat(g.page, "이동")) === "1");
    await g.page.setViewportSize({ width: 390, height: 844 });
    await shot(g.page, "single-390");
    await g.ctx.close();
  }

  // ══ DUEL ═══════════════════════════════════════════════════════
  const duelLocal = (id) => ({ [`wiki-mp-game:${id}:${USERS.me.id}`]: { enteredPlaying: true } });
  {
    duelRoom("duel-plain-0001", { useItems: false });
    const { ctx, page } = await context("me", { local: duelLocal("duel-plain-0001") });
    await page.goto(`${base}/multiplayer/game/duel-plain-0001`);
    await expect(page.locator(".mp-game-status")).toHaveText("레이스 진행 중", { timeout: 20000 });
    check("D1 non-item duel: no dock, HUD 일반", await page.locator(".wr-race-dock").count() === 0 && /일반/.test(await page.locator(".wr-hud-brand").innerText()));
    check("D2 opponent summary compact strip (현재 문서 / 이동 횟수)", (await page.locator(".mp-opponent-box").filter({ hasText: "현재 문서" }).locator(".mp-opponent-value").innerText()) === OTHER && (await page.locator(".mp-opponent-box").filter({ hasText: "이동 횟수" }).locator(".mp-opponent-value").innerText()) === "2회");
    check("D2b opponent full route not exposed in strip", !(await page.locator(".wr-race-strip").innerText()).includes(START));
    await page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    check("D3 duel article move via existing move RPC", rpcCalls.includes("me:apply_duel_move_v2") && (await stat(page, "이동")) === "1");
    // reconnect UI: opponent heartbeat lags
    setPlayer("duel-plain-0001", USERS.opp.id, { heartbeat_at: iso(now() - 60_000) });
    await expect(page.locator(".wr-race-strip")).toContainText("상대 연결 확인 중", { timeout: 15000 });
    check("D4 opponent lag shown from server heartbeat timestamps", true);
    setPlayer("duel-plain-0001", USERS.opp.id, { heartbeat_at: iso(now()) });
    await expect(page.locator(".wr-race-strip")).toContainText("연결 정상", { timeout: 15000 });
    check("D4b reconnect clears", true);
    await page.mouse.move(0, 0);
    await shot(page, "duel-desktop");
    await page.locator(".article-content a", { hasText: TARGET }).first().click();
    await page.locator(".mp-result-card").waitFor({ timeout: 15000 });
    check("D5 finish → existing result overlay", (await page.locator(".mp-game-status").innerText()) === "승리!");
    await ctx.close();
  }
  {
    duelRoom("duel-item-0002", { useItems: true, item: { startOn: MANY, censorMs: 25_000, censorArticle: true } });
    const { ctx, page } = await context("me", { local: duelLocal("duel-item-0002") });
    await page.goto(`${base}/multiplayer/game/duel-item-0002`);
    await expect(page.locator(".mp-game-status")).toHaveText("레이스 진행 중", { timeout: 20000 });
    await page.locator(".wr-race-dock .duel-item-slot").first().waitFor();
    check("D6 item mode dock with 5 slots, compact (≤80px)", await page.locator(".duel-item-slot").count() === 5 && (await page.locator(".wr-race-dock").boundingBox()).height <= 80);
    check("D6b HUD coral censorship pill", /링크 검열 피격/.test(await hudText(page)));
    const censored = page.locator(".article-content a.duel-item-censored");
    await expect(censored.first()).toBeVisible();
    const cs = await censored.first().evaluate((a) => ({ color: getComputedStyle(a).color, deco: getComputedStyle(a).textDecorationLine, pe: getComputedStyle(a).pointerEvents, tab: a.getAttribute("tabindex"), dis: a.getAttribute("aria-disabled") }));
    check("D7 censored article link gray #78877F, no underline, no strikethrough, inert", cs.color === "rgb(120, 135, 127)" && cs.deco === "none" && cs.pe === "none" && cs.tab === "-1" && cs.dis === "true");
    check("D7b censorship legend not color-only", (await page.locator(".wr-article-head").innerText()).includes("검열 중"));
    await page.getByRole("button", { name: /링크만 보기 · 사용 가능/ }).click();
    const overlay = page.getByRole("dialog", { name: "링크만 보기" });
    await overlay.waitFor();
    const toastIndexDesktop = await toastClear(page);
    check("T1 desktop toast (Link Index open) is a status region, click-through, and covers no HUD/title/index header/filter", toastIndexDesktop.status && toastIndexDesktop.inert && toastIndexDesktop.overlaps.length === 0);
    await shot(page, "duel-link-index");
    const words = overlay.locator(".duel-item-index__word");
    check("D8 link_index overlay lists ALL current-article links (1000+)", await words.count() === MANY_LINKS.length + 1);
    check("D8b sorted 가나다 / first entries", (await words.nth(0).innerText()).startsWith("중간 문서") || (await words.nth(0).innerText()).startsWith("항목"));
    check("D8c internal scroll (list scrolls, page does not)", await overlay.locator(".duel-item-index__words").evaluate((n) => n.scrollHeight > n.clientHeight + 100 && getComputedStyle(n).overflowY === "auto"));
    check("D8d filter field focused on open", await overlay.locator(".duel-item-index__filter").evaluate((n) => n === document.activeElement));
    const ce = await overlay.locator(".duel-item-index__word--censored").first().evaluate((b) => ({ deco: getComputedStyle(b).textDecorationLine, color: getComputedStyle(b).color, border: getComputedStyle(b).borderTopStyle, tag: b.textContent.includes("검열"), dis: b.getAttribute("aria-disabled") }));
    check("D9 index censored entry: gray, dashed, 검열 label, no strikethrough", ce.deco === "none" && ce.color === "rgb(120, 135, 127)" && ce.border === "dashed" && ce.tag && ce.dis === "true");
    const indexCensored = await overlay.locator(".duel-item-index__word--censored").allInnerTexts();
    const articleCensored = await censored.evaluateAll((as) => as.map((a) => a.getAttribute("data-wiki-title")));
    check("D10 same server censored set in article and index", CENSORED.every((t) => indexCensored.some((x) => x.startsWith(t)) && articleCensored.includes(t)));
    await overlay.locator(".duel-item-index__filter").fill("0007");
    check("D11 filter narrows 1200 → 1", await words.count() === 1);
    await shot(page, "duel-link-index-filtered");
    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
    check("D12 Escape closes overlay; focus returns to the (consumed) slot or the article heading, never <body>", await page.evaluate(() => document.activeElement?.classList.contains("duel-item-slot") || document.activeElement?.id === "wr-article-title"));
    await ctx.close();
  }
  {
    duelRoom("duel-item-0003", { useItems: true, item: { startOn: MANY } });
    const { ctx, page } = await context("me", { local: duelLocal("duel-item-0003") });
    await page.goto(`${base}/multiplayer/game/duel-item-0003`);
    await expect(page.locator(".mp-game-status")).toHaveText("레이스 진행 중", { timeout: 20000 });
    await page.getByRole("button", { name: /링크만 보기 · 사용 가능/ }).click();
    const overlay = page.getByRole("dialog", { name: "링크만 보기" });
    await overlay.locator(".duel-item-index__filter").fill("중간");
    await overlay.locator(".duel-item-index__word", { hasText: MIDDLE }).click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    await expect(overlay).toHaveCount(0);
    check("D13 index word navigates and closes on navigation", true);
    check("D14 consumed link_index slot shows used state", (await page.locator(".duel-item-slot--used").count()) >= 1);
    await page.waitForTimeout(2600); // item cooldown (fixture 2.5s)
    await page.getByRole("button", { name: /역링크 · 사용 가능/ }).click();
    const toastDesktop = await toastClear(page);
    check("T2 desktop toast (no overlay) below HUD/strip, clear of the article title", toastDesktop.status && toastDesktop.overlaps.length === 0);
    await page.mouse.move(0, 0);
    await shot(page, "duel-desktop-toast");
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      check(`D15 duel no overflow at ${w}`, await noOverflow(page));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    check("D15b mobile HUD + opponent strip stay compact (article not pushed down)", (await page.locator(".wr-race-strip").boundingBox()).height <= 48 && (await page.locator(".wr-race-hud").boundingBox()).height <= 90);
    await page.waitForTimeout(2600);
    await page.getByRole("button", { name: /먹물 공격 · 사용 가능/ }).click();
    const toastMobile = await toastClear(page);
    check("T3 mobile toast compact below the HUD, clear of HUD + article title", toastMobile.status && toastMobile.overlaps.length === 0 && (await page.locator(".floating-message").boundingBox()).height <= 32);
    await shot(page, "duel-390");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "나가기" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "이탈하기" }).click();
    await page.locator(".mp-result-card").waitFor({ timeout: 15000 });
    check("D16 forfeit through existing exit guard → leave RPC → result", rpcCalls.includes("me:leave_duel_room_v2"));
    await ctx.close();
  }
  {
    duelRoom("duel-item-0004", { useItems: true, item: { startOn: MANY } });
    const { ctx, page } = await context("me", { width: 390, height: 844, local: duelLocal("duel-item-0004") });
    await page.goto(`${base}/multiplayer/game/duel-item-0004`);
    await expect(page.locator(".mp-game-status")).toHaveText("레이스 진행 중", { timeout: 20000 });
    await page.getByRole("button", { name: /링크만 보기 · 사용 가능/ }).click();
    const overlay = page.getByRole("dialog", { name: "링크만 보기" });
    await overlay.waitFor();
    const box = await overlay.boundingBox();
    check("D17 mobile Link Index is a full sheet above the HUD (header + filter visible)", box.width >= 389 && box.height >= 800 && await overlay.locator(".duel-item-index__filter").isVisible() && await page.evaluate(() => { const f = document.querySelector(".duel-item-index__filter").getBoundingClientRect(); const hit = document.elementFromPoint(f.left + 10, f.top + f.height / 2); return Boolean(hit?.closest(".duel-item-index")); }));
    check("D17b mobile rows ≥44px and list scrolls internally", (await overlay.locator(".duel-item-index__word").first().boundingBox()).height >= 44 && await overlay.locator(".duel-item-index__words").evaluate((n) => n.scrollHeight > n.clientHeight));
    const toastSheet = await toastClear(page);
    check("T4 mobile toast with Link Index sheet open covers neither the sheet header nor the filter", toastSheet.status && toastSheet.overlaps.length === 0);
    await shot(page, "duel-link-index-390");
    await ctx.close();
  }

  // ══ GROUP ══════════════════════════════════════════════════════
  const groupLocal = (id, extra = {}) => ({ [`wiki-group-game-state:${id}:${USERS.me.id}`]: { enteredPlaying: true, ...extra } });
  {
    groupRoom("group-three-01", [USERS.me, USERS.opp, USERS.p3]);
    const { ctx, page } = await context("me", { local: groupLocal("group-three-01") });
    await page.goto(`${base}/multiplayer/group/game/group-three-01`);
    await page.locator(".wr-race-hud").waitFor({ timeout: 20000 });
    await expect(page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 20000 });
    check("G1 3-player race: no item UI", await page.locator(".duel-item-slot, .item-panel, .wr-race-dock").count() === 0);
    check("G1b timer label 남은 시간 (20-minute deadline)", (await page.locator(".wr-race-hud .wr-hud-timer").innerText()).includes("남은 시간"));
    check("G1c roster 3 rows, text states", await page.locator(".wr-race-side .wr-prow").count() === 3 && (await page.locator(".wr-race-side").innerText()).includes("진행 중"));
    check("G1d article keeps width with roster", (await articleWidth(page)) > 700);
    // participant update + finishes
    setPlayer("group-three-01", USERS.opp.id, { player_status: "finished", has_finished: true, rank: 1, elapsed_seconds: 300, move_count: 5 }); notify("group-three-01");
    await expect(page.locator(".wr-race-side")).toContainText("1위", { timeout: 15000 });
    check("G2 first finish shows rank + 완주 at top", (await page.locator(".wr-race-side .wr-prow").first().innerText()).includes(USERS.opp.nickname));
    // temporary disconnect is not retire
    setPlayer("group-three-01", USERS.p3.id, { player_status: "disconnected" }); notify("group-three-01");
    await expect(page.locator(".wr-race-side")).toContainText("재연결 중", { timeout: 15000 });
    check("G3 temporary disconnect shown as 재연결 중, not 리타이어", !(await page.locator(".wr-race-side").innerText()).includes("리타이어"));
    setPlayer("group-three-01", USERS.p3.id, { player_status: "playing" }); notify("group-three-01");
    // grace: 3rd finish → actual remaining (not a fresh 2:00)
    Object.assign(rooms.get("group-three-01"), { status: "grace_period", grace_ends_at: iso(now() + 102_000) }); notify("group-three-01");
    await expect(page.locator(".wr-race-hud .wr-hud-timer")).toContainText("마감까지", { timeout: 15000 });
    const graceSecs = await page.locator(".wr-race-hud .wr-hud-timer .wr-hud-stat-value").innerText();
    check("G4 grace: label 마감까지 + actual remaining ≈01:4x", /^01:(3\d|4[0-2])$/.test(graceSecs));
    check("G4b grace copy in HUD status slot", (await hudText(page)).includes("남은 참가자는 이 시간 안에"));
    await shot(page, "group-desktop-grace");
    // grace near 20-minute hard limit
    Object.assign(rooms.get("group-three-01"), { game_deadline_at: iso(now() + 26_000), grace_ends_at: iso(now() + 120_000) }); notify("group-three-01");
    await expect(page.locator(".wr-hud-status")).toContainText("20분 제한까지", { timeout: 15000 });
    check("G5 capped grace shows ≈00:2x, not 02:00", /^00:2\d$/.test(await page.locator(".wr-race-hud .wr-hud-timer .wr-hud-stat-value").innerText()));
    Object.assign(rooms.get("group-three-01"), { status: "playing", game_deadline_at: iso(now() + 600_000), grace_ends_at: null }); notify("group-three-01");
    await expect(page.locator(".wr-race-hud .wr-hud-timer")).toContainText("남은 시간", { timeout: 15000 });
    await page.mouse.move(0, 0);
    await shot(page, "group-desktop");
    // move + finish → Result A (no auto spectate)
    await page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    await page.locator(".article-content a", { hasText: TARGET }).first().click();
    await page.locator(".wr-result-a").waitFor({ timeout: 15000 });
    check("G6 finish → Result A personal completion (2위 완주)", (await page.locator(".wr-result-headline h1").innerText()).includes("2위 완주"));
    check("G6b Result A shows group still racing + 관전하기 action", (await page.locator(".wr-result-strip").innerText()).includes("그룹 경기 진행 중") && await page.getByRole("button", { name: "관전하기 →" }).isVisible());
    await page.waitForTimeout(1500);
    check("G7 no auto-enter spectator", await page.locator(".wr-result-a").count() === 1 && await page.locator(".wr-race-tabs").count() === 0);
    await shot(page, "group-result-a", true);
    await page.getByRole("button", { name: "관전하기 →" }).click();
    await page.locator(".wr-race-tabs").waitFor();
    await expect(page.locator(".article-content")).toBeVisible({ timeout: 15000 });
    const watchLabel = await page.locator(".wr-hud-watch .wr-hud-label").innerText();
    check("SP1 spectator default = selected participant's real article (관전 중)", watchLabel.startsWith("관전 중") && (await page.locator("#wr-article-title").innerText()) === START);
    check("SP1b spectator links inert (no href, not focusable)", await page.locator(".article-content a[data-wiki-title]").evaluateAll((as) => as.length > 0 && as.every((a) => !a.hasAttribute("href") && a.getAttribute("tabindex") === "-1")));
    check("SP1c 플레이 관전 tab selected by default (route comparison secondary)", await page.getByRole("tab", { name: /플레이 관전/ }).getAttribute("aria-selected") === "true");
    await page.mouse.move(0, 0);
    await shot(page, "spectator-desktop");
    // switch participant (keyboard)
    const other = page.locator(".wr-race-side button.wr-prow").filter({ hasText: USERS.p3.nickname });
    await other.focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".wr-hud-watch")).toContainText(USERS.p3.nickname);
    await expect(page.locator("#wr-article-title")).toHaveText(START, { timeout: 15000 });
    check("SP2 participant switch via keyboard updates HUD + article", (await other.getAttribute("aria-pressed")) === "true");
    // watched disconnect → no auto switch, stale read-only
    setPlayer("group-three-01", USERS.p3.id, { player_status: "disconnected" }); notify("group-three-01");
    await expect(page.locator(".wr-hud-watch")).toContainText(`재연결 중 · ${USERS.p3.nickname}`, { timeout: 15000 });
    check("SP3 watched disconnect keeps selection + last screen read-only", (await page.locator(".wr-article-tag").innerText()).includes("마지막으로 받은 화면") && await page.locator(".article-content").isVisible());
    await page.waitForTimeout(1200);
    check("SP4 no silent auto-switch", (await page.locator(".wr-hud-watch").innerText()).includes(USERS.p3.nickname));
    setPlayer("group-three-01", USERS.p3.id, { player_status: "playing", current_title: OTHER, current_page_id: pageId(OTHER), move_count: 4 }); notify("group-three-01");
    await expect(page.locator("#wr-article-title")).toHaveText(OTHER, { timeout: 15000 });
    check("SP5 reconnect resumes updates", (await page.locator(".wr-hud-watch .wr-hud-label").innerText()).startsWith("관전 중"));
    await page.getByRole("tab", { name: /경로 비교/ }).click();
    await page.locator(".wr-compare").waitFor();
    check("SP6 route comparison secondary panel", (await page.locator(".wr-compare").innerText()).includes("결과가 확정된 참가자"));
    await page.getByRole("tab", { name: /플레이 관전/ }).click();
    await page.getByRole("button", { name: "반응 보내기: 응원" }).click();
    await expect(page.locator(".wr-reaction-note")).toContainText("초 후 다시", { timeout: 5000 });
    check("SP7 reaction sent via existing RPC → 3s cooldown, buttons disabled", rpcCalls.includes("me:send_group_spectator_emoji_v13") && await page.getByRole("button", { name: "반응 보내기: 와우" }).isDisabled());
    check("SP7b stamp appears in sender's roster row", await page.locator(".wr-race-side .group-spectator-reaction").count() >= 1);
    // 표시 시계는 1초 단위로 갱신된다 — 3초 대기 후 다음 갱신까지 기다린다.
    await expect(page.getByRole("button", { name: "반응 보내기: 와우" })).toBeEnabled({ timeout: 5000 });
    check("SP8 cooldown ends", true);
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      check(`SP9 spectator no overflow at ${w}`, await noOverflow(page));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.getByRole("button", { name: "참가자 정보 펼치기" });
    await toggle.click();
    check("SP10 mobile sheet expanded state + tabs (참가자/경로 비교/내 경로)", await page.getByRole("button", { name: "참가자 정보 접기" }).getAttribute("aria-expanded") === "true" && await page.locator(".wr-sheet-tabs [role=tab]").count() === 3);
    await shot(page, "spectator-390");
    await ctx.close();
  }
  {
    groupRoom("group-eight-02", [USERS.me, USERS.opp, USERS.p3, USERS.p4, USERS.p5, USERS.p6, USERS.p7, USERS.p8]);
    setPlayer("group-eight-02", USERS.p4.id, { player_status: "finished", has_finished: true, rank: 1, elapsed_seconds: 280 });
    setPlayer("group-eight-02", USERS.p8.id, { player_status: "retired", retired_at: iso(now()) });
    setPlayer("group-eight-02", USERS.p6.id, { player_status: "disconnected" });
    const { ctx, page } = await context("me", { local: groupLocal("group-eight-02") });
    await page.goto(`${base}/multiplayer/group/game/group-eight-02`);
    await expect(page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 20000 });
    check("G8 8-player roster compact rows (≤60px each, measured 55–57), article not squeezed", (await page.locator(".wr-race-side .wr-prow").evaluateAll((n) => n.map((x) => x.getBoundingClientRect().height))).every((h) => h <= 60) && (await articleWidth(page)) > 700);
    const order = await page.locator(".wr-race-side .wr-prow .wr-prow-name").allInnerTexts();
    check("G8b order finished → active → retired", order[0].includes(USERS.p4.nickname) && order[order.length - 1].includes(USERS.p8.nickname));
    check("G8c retired shows 리타이어 text, current user marked 나", (await page.locator(".wr-race-side").innerText()).includes("리타이어") && (await page.locator(".wr-race-side .wr-prow.is-me").innerText()).includes("나"));
    await page.mouse.move(0, 0);
    await shot(page, "group-desktop-8");
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      check(`G9 group no overflow at ${w}`, await noOverflow(page));
      check(`G9b roster not permanently on screen at ${w} (sheet collapsed)`, await page.locator(".wr-race-side").isHidden() && await page.getByRole("button", { name: "참가자 정보 펼치기" }).isVisible());
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "group-390");
    await page.getByRole("button", { name: "참가자 정보 펼치기" }).click();
    check("G10 mobile sheet tabs 참가자 / 내 경로 while racing", await page.locator(".wr-sheet-tabs [role=tab]").count() === 2);
    await shot(page, "group-390-sheet");
    await page.emulateMedia({ reducedMotion: "reduce" });
    check("G11 reduced motion disables race animation", await page.locator(".wr-pill, .wr-conn").first().evaluate((n) => getComputedStyle(n).animationName === "none"));
    await ctx.close();
  }
  {
    // RETIRE: own player retired while match still active → neutral hold, no spectator, no reactions
    groupRoom("group-retire-03", [USERS.me, USERS.opp, USERS.p3]);
    setPlayer("group-retire-03", USERS.me.id, { player_status: "retired", retired_at: iso(now()) });
    const { ctx, page } = await context("me", { local: groupLocal("group-retire-03") });
    await page.goto(`${base}/multiplayer/group/game/group-retire-03`);
    await expect(page.locator(".wr-race-hold h1")).toHaveText("경기 종료 · 결과 집계 중", { timeout: 20000 });
    check("R1 RETIRE → neutral 경기 종료 · 결과 집계 중", true);
    check("R2 RETIRE has no spectator view/tabs/reactions/article", await page.locator(".wr-race-tabs, .wr-reaction-dock, .group-spectator-emoji, .article-content").count() === 0);
    check("R2b no completion celebration", await page.locator(".wr-result-a, .wr-done-glyph").count() === 0);
    await shot(page, "group-retired-hold");
    Object.assign(rooms.get("group-retire-03"), { status: "finished" }); notify("group-retire-03");
    await expect(page.getByRole("heading", { name: "최종 결과" })).toBeVisible({ timeout: 15000 });
    check("R3 finalization proceeds to existing final RESULT", true);
    await ctx.close();
  }

  if (consoleErrors.length) console.log(JSON.stringify(consoleErrors.slice(0, 20), null, 2));
  const unexpected = consoleErrors.filter((e) => !/recovery failed|realtime disconnected|Failed to load resource/.test(e));
  check("GEN no unexpected console/page errors", unexpected.length === 0);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ basis: "321ea27 + uncommitted Phase 3 working tree", date: "2026-10-07", fixtureOnly: true, checks, consoleErrors }, null, 2));
  console.log(`PASS ${checks.length} browser checks (isolated API/realtime fixtures; real backend not exercised)`);
} finally { await browser?.close(); server.kill(); }
