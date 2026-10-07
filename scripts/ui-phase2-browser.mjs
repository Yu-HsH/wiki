// Phase 2 lobby presentation regression. Every Supabase/Wikipedia request is answered by an
// in-memory fixture inside this script (REST, RPC, Edge Function, Realtime websocket).
// No request reaches a real backend and no fixture enters production code. The fixture
// mirrors only the room facts the pages read; the server contracts themselves are not tested here.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";

const base = "http://127.0.0.1:5187";
const api = "http://127.0.0.1:54330";
const output = "test-results/packet13-b1/ui-phase2";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5187", "--strictPort"], {
  env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: "ui-test-only", VITE_MAINTENANCE: "false" }, stdio: "ignore",
});

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const consoleErrors = [];
const externalResources = new Set();
const rpcCalls = [];
const rpcByUser = [];
const LOCAL_GUEST = "localGuest";

const USERS = {
  host: { id: "11111111-1111-4111-8111-111111111111", nickname: "정원" },
  guest: { id: "22222222-2222-4222-8222-222222222222", nickname: "수현" },
  p3: { id: "33333333-3333-4333-8333-333333333333", nickname: "민경" },
  p4: { id: "44444444-4444-4444-8444-444444444444", nickname: "유진" },
  p5: { id: "55555555-5555-4555-8555-555555555555", nickname: "도윤" },
  p6: { id: "66666666-6666-4666-8666-666666666666", nickname: "하람" },
  p7: { id: "77777777-7777-4777-8777-777777777777", nickname: "서준" },
  p8: { id: "88888888-8888-4888-8888-888888888888", nickname: "지우" },
};
const byToken = Object.fromEntries(Object.entries(USERS).map(([key, u]) => [`tok-${key}`, u]));
const PAGES = { "르네상스": 101, "세종대왕": 102, "반도체": 103, "금강산": 104, "남극": 105, "커피": 106, "오페라": 107, "한지": 108 };

// ── in-memory room store ──────────────────────────────────────────
const rooms = new Map();
const players = new Map();
let seq = 0;
const now = () => new Date(Date.UTC(2026, 9, 7, 0, 0, seq++)).toISOString();
function createRoom({ mode, host, code, maxPlayers = mode === "group" ? 6 : 2, useItems = mode === "duel" }) {
  const id = `${mode === "duel" ? "d" : "g"}0000000-0000-4000-8000-${String(rooms.size + 1).padStart(12, "0")}`;
  rooms.set(id, { id, room_code: code, mode, status: "waiting", host_user_id: host.id, max_players: maxPlayers, min_players: mode === "group" ? 3 : 2, use_items: useItems, state_version: 1 });
  players.set(id, []);
  addPlayer(id, host, "host");
  return rooms.get(id);
}
function addPlayer(roomId, user, role = "guest") {
  const list = players.get(roomId);
  if (list.some((p) => p.user_id === user.id)) return list.find((p) => p.user_id === user.id);
  const row = { id: `${roomId.slice(0, 8)}-${user.id.slice(0, 8)}`, room_id: roomId, user_id: user.id, role, nickname_snapshot: user.nickname, profile_image_snapshot: null, is_ready: false, target_title: null, target_page_id: null, submitted_target_title: null, submitted_target_page_id: null, player_status: "waiting", created_at: now() };
  list.push(row);
  return row;
}
function removePlayer(roomId, userId) {
  const room = rooms.get(roomId);
  players.set(roomId, players.get(roomId).filter((p) => p.user_id !== userId));
  const rest = players.get(roomId);
  // waiting-room succession mirrors the existing DB trigger: earliest created_at becomes host (group only).
  if (room.mode === "group" && room.host_user_id === userId && rest.length) {
    const next = [...rest].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    rest.forEach((p) => { p.role = p.user_id === next.user_id ? "host" : "guest"; });
    room.host_user_id = next.user_id;
  }
}
function submit(roomId, userId, title) {
  const row = players.get(roomId).find((p) => p.user_id === userId);
  Object.assign(row, { submitted_target_title: title, submitted_target_page_id: String(PAGES[title] ?? 999), is_ready: true });
}

// ── realtime websocket fixture (phoenix vsn 2.0.0 array frames) ───────
const sockets = new Set();
function notify(roomId) {
  setTimeout(() => {
    for (const s of sockets) {
      for (const [topic, sub] of s.topics) {
        if (!topic.endsWith(roomId)) continue;
        sub.bindings.forEach((binding) => {
          s.ws.send(JSON.stringify([null, null, topic, "postgres_changes", { ids: [binding.id], data: { schema: "public", table: binding.table, type: "UPDATE", commit_timestamp: new Date().toISOString(), columns: [], record: {}, old_record: {}, errors: null } }]));
        });
      }
    }
  }, 30);
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-range": "0-0/0" }, body: JSON.stringify(body) });
}
const rpcError = (route, message) => json(route, { code: "P0001", message, details: null, hint: null }, 400);

async function handleApi(route, userKey) {
  const request = route.request();
  if (request.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  const url = new URL(request.url());
  const token = (request.headers().authorization || "").replace("Bearer ", "");
  const me = byToken[token] ?? (userKey ? USERS[userKey] : null);
  const path = url.pathname;
  const body = request.postDataJSON?.() ?? null;
  if (path.includes("/auth/")) return json(route, me ? { id: me.id, email: `${me.id}@example.invalid`, user_metadata: { nickname: me.nickname } } : {});
  if (path.endsWith("/functions/v1/wiki-snapshot")) return json(route, { snapshotId: `snap-${body.title}`, pageId: String(PAGES[body.title] ?? 999), revisionId: "5000", canonicalTitle: body.title });
  if (path.startsWith("/rest/v1/rpc/")) {
    const name = path.split("/").pop();
    rpcCalls.push(name);
    rpcByUser.push(`${me?.id ?? "anon"}:${name}`);
    const p = body || {};
    switch (name) {
      case "get_duel_room_players_v1": return json(route, players.get(p.p_room_id) ?? []);
      case "get_profile_cards_v1": return json(route, { ok: true, cards: {} });
      case "get_profile_card_v1": return json(route, { ok: true, card: null });
      case "create_duel_room_v2": { const r = createRoom({ mode: "duel", host: me, code: "TR4B9K", useItems: p.p_use_items }); return json(route, r); }
      case "create_group_room": { const r = createRoom({ mode: "group", host: me, code: "KQ7F2M", maxPlayers: p.p_max_players }); return json(route, r); }
      case "join_duel_room_v2": {
        const room = [...rooms.values()].find((r) => r.room_code === p.p_room_code);
        if (!room) return rpcError(route, "ROOM_NOT_FOUND");
        const exists = players.get(room.id).some((x) => x.user_id === me.id);
        if (!exists && players.get(room.id).length >= 2) return rpcError(route, "DUEL_ROOM_FULL");
        const row = addPlayer(room.id, me); notify(room.id); return json(route, row);
      }
      case "join_group_room": {
        const room = rooms.get(p.p_room_id);
        const exists = players.get(room.id).some((x) => x.user_id === me.id);
        if (!exists && players.get(room.id).length >= room.max_players) return rpcError(route, "GROUP_ROOM_FULL");
        const row = addPlayer(room.id, me); notify(room.id); return json(route, row);
      }
      case "set_duel_target_v2": {
        const row = players.get(p.p_room_id).find((x) => x.user_id === me.id);
        Object.assign(row, { target_title: p.p_target_title, target_page_id: p.p_target_page_id });
        notify(p.p_room_id); return json(route, [row]);
      }
      case "leave_duel_room_v2": case "leave_group_waiting_room": {
        removePlayer(p.p_room_id, me.id); notify(p.p_room_id); return json(route, rooms.get(p.p_room_id));
      }
      case "submit_group_target_v2": {
        const row = players.get(p.p_room_id).find((x) => x.user_id === me.id);
        Object.assign(row, { submitted_target_title: p.p_submitted_target_title, submitted_target_page_id: p.p_submitted_target_page_id });
        notify(p.p_room_id); return json(route, null);
      }
      case "set_group_ready": {
        const row = players.get(p.p_room_id).find((x) => x.user_id === me.id);
        row.is_ready = p.p_is_ready; notify(p.p_room_id); return json(route, row);
      }
      case "start_duel_room_v2": case "start_group_room_game_v2": return rpcError(route, "FIXTURE_START_NOT_EXERCISED");
      case "ensure_today_daily_challenge": return json(route, [{ target_title: "검증 목표", start_title: "검증 출발", hint: "", challenge_date: "2026-10-07" }]);
      case "get_xp_summary_v1": return json(route, { ok: true, total_xp: 321, level: 3, current_level_xp: 21, next_level_xp: 200 });
      case "get_my_achievements_v1": return json(route, { ok: true, unseenCount: 0, achievements: [], hidden: { discovered: 0, achievements: [] } });
      default: return json(route, []);
    }
  }
  if (path === "/rest/v1/game_rooms") {
    let list = [...rooms.values()];
    for (const [key, value] of url.searchParams) {
      if (!value.startsWith("eq.") || !["id", "room_code", "mode"].includes(key)) continue;
      list = list.filter((r) => String(r[key]) === value.slice(3));
    }
    if ((request.headers().accept || "").includes("vnd.pgrst.object")) {
      return list.length === 1 ? json(route, list[0]) : json(route, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows" }, 406);
    }
    return json(route, list);
  }
  if (path === "/rest/v1/room_players") {
    const roomId = (url.searchParams.get("room_id") || "").slice(3);
    return json(route, [...(players.get(roomId) ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }
  return json(route, []);
}

let browser;
async function context(userKey, { width = 1440, height = 1000 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || url.origin === api) return route.continue();
    if (url.hostname === "ko.wikipedia.org") {
      if (url.pathname.endsWith("/w/api.php")) {
        const q = url.searchParams.get("srsearch") || "";
        const hits = Object.keys(PAGES).filter((t) => t.includes(q) || q === "*").slice(0, 4);
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ query: { search: hits.map((title) => ({ title, snippet: `${title} 검증 설명` })) } }) });
      }
      const title = decodeURIComponent(url.pathname.split("/").pop());
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ title, pageid: PAGES[title] ?? 999, revision: 5000 }) });
    }
    externalResources.add(url.origin);
    return route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  await ctx.route(`${api}/**`, (route) => handleApi(route, userKey));
  await ctx.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const entry = { ws, topics: new Map() };
    sockets.add(entry);
    ws.onMessage((raw) => {
      let frame; try { frame = JSON.parse(String(raw)); } catch { return; }
      const [joinRef, ref, topic, event, payload] = frame;
      if (event === "heartbeat" || event === "access_token") return ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      if (event === "phx_join") {
        const bindings = (payload?.config?.postgres_changes ?? []).map((b, i) => ({ ...b, id: 9000 + i }));
        entry.topics.set(topic, { bindings });
        return ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: bindings } }]));
      }
      if (event === "phx_leave") { entry.topics.delete(topic); return ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }])); }
    });
    ws.onClose(() => sockets.delete(entry));
  });
  if (userKey === LOCAL_GUEST) {
    await ctx.addInitScript(() => localStorage.setItem("wiki_game_local_user", JSON.stringify({ id: "guest-ui-check", displayName: "게스트", isGuest: true, mode: "local" })));
  }
  await ctx.addInitScript(({ token, user }) => {
    if (!token) return;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: `${token}-refresh`, token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
  }, { token: USERS[userKey] ? `tok-${userKey}` : null, user: USERS[userKey] ? { id: USERS[userKey].id, email: `${USERS[userKey].id}@example.invalid`, user_metadata: { nickname: USERS[userKey].nickname } } : null });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`${userKey}: ${e.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`${userKey}: ${msg.text()}`); });
  return { ctx, page };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const bodyText = (page) => page.locator("main").innerText();
const shot = (page, name) => page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });

try {
  await fs.mkdir(output, { recursive: true });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true });

  // ══ DUEL ═══════════════════════════════════════════════════════
  const H = await context("host");
  await H.page.goto(`${base}/play`);
  await H.page.locator(".wr-mode").nth(1).click();
  await H.page.locator(".mp-mode-panel").waitFor();
  check("30 PLAY → duel entry keeps existing create/join", new URL(H.page.url()).searchParams.get("mode") === "duel" && await H.page.getByRole("button", { name: "1 vs 1" }).getAttribute("aria-pressed") === "true");
  check("entry: no overflow 1440", await noOverflow(H.page));
  await shot(H.page, "entry-duel-desktop");
  await H.page.getByRole("button", { name: "게임 설명" }).click();
  const helpText = await H.page.locator(".help-modal").innerText();
  check("H1 stale duel help copy is gone", !/서로 다른 목표 문서를 가지고|상대가 설정한 목표/.test(helpText));
  check("H2 duel help states host shared target · no READY · host starts", helpText.includes("방장이 대기실에서 두 사람이 함께 쓸 목표 문서 하나를 고릅니다") && helpText.includes("READY 단계는 없습니다") && helpText.includes("방장이 고른 목표를 바로 확인"));
  await H.page.locator(".help-modal .text-btn").click();
  await H.page.locator(".mp-mode-panel").getByRole("button", { name: "방 생성", exact: true }).click();
  await H.page.waitForURL(/\/multiplayer\/room\//);
  const duelId = H.page.url().split("/").pop();
  await H.page.locator(".wr-duel-stage").waitFor();
  const hostStart = H.page.getByRole("button", { name: "게임 시작" });
  check("1 host alone: empty opponent slot", (await H.page.locator(".wr-duel-player--empty").innerText()).includes("빈 자리"));
  check("7 host START disabled before requirements", await hostStart.isDisabled());
  check("6 no READY anywhere (host)", !/READY|준비 완료/.test(await bodyText(H.page)));
  check("duel rule label from room.use_items", (await H.page.locator(".wr-duel-setup").innerText()).includes("아이템전"));
  await shot(H.page, "duel-desktop-host-alone");

  const G = await context("guest");
  await G.page.goto(`${base}/multiplayer?mode=duel`);
  await G.page.locator(".mp-mode-panel input[placeholder='ROOM CODE']").fill("tr4b9k");
  await G.page.locator(".mp-mode-panel").getByRole("button", { name: "참가", exact: true }).click();
  await G.page.waitForURL(/\/multiplayer\/room\//);
  await G.page.locator(".wr-duel-stage").waitFor();
  await expect(H.page.locator(".wr-duel-player:not(.wr-duel-player--empty)")).toHaveCount(2);
  check("2 guest joins (host sees via realtime)", (await H.page.locator(".wr-lobby-count").innerText()) === "2 / 2");
  check("7b START still disabled without target", await hostStart.isDisabled());
  check("8b guest pending copy", (await G.page.locator(".wr-target-pending").innerText()).includes("방장이 목표를 고르는 중"));
  check("9 guest has no START / no search", await G.page.getByRole("button", { name: "게임 시작" }).count() === 0 && await G.page.locator(".room-target-input").count() === 0);
  check("guest wait copy", (await G.page.locator(".wr-wait-note").innerText()).includes("방장이 시작하기를 기다리는 중"));
  check("6 no READY anywhere (guest)", !/READY|준비 완료/.test(await bodyText(G.page)));
  check("current player marked with text label", await G.page.locator(".wr-duel-player.wr-is-me .wr-me-tag").count() === 1 && await G.page.locator(".wr-host-tag").count() === 1);

  // 3/4 keyboard search + selection
  const input = H.page.locator(".room-target-input");
  await input.focus();
  await H.page.keyboard.type("르네");
  await H.page.keyboard.press("Enter");
  const result = H.page.locator(".search-item").filter({ hasText: "르네상스" });
  await result.waitFor();
  check("3 host target search (Enter submits)", await result.count() === 1);
  await result.focus();
  await H.page.keyboard.press("Enter");
  await H.page.locator(".wr-target-chosen .wr-gold-pill").waitFor();
  check("4 host target selection → gold target", (await H.page.locator(".room-target-section").first().innerText()).includes("르네상스"));
  await expect(G.page.getByText("방장이 고른 목표: 르네상스").first()).toBeVisible();
  check("5 guest sees selected target immediately", true);
  await expect(hostStart).toBeEnabled();
  check("8 host START enabled after opponent + target", await hostStart.isEnabled());
  await H.page.getByRole("button", { name: "목표 문서 변경" }).click();
  await H.page.locator(".room-target-input").fill("세종");
  await H.page.locator(".room-target-input").press("Enter");
  await H.page.locator(".search-item").filter({ hasText: "세종대왕" }).click();
  await expect(G.page.getByText("방장이 고른 목표: 세종대왕").first()).toBeVisible();
  check("target change before START allowed (existing behavior) and mirrored", true);
  await H.page.mouse.move(0, 0);
  await shot(H.page, "duel-desktop-target-selected");
  await shot(G.page, "duel-desktop-guest");

  // 10 copy
  await H.page.locator(".wr-duel-setup").getByRole("button", { name: "방 코드 TR4B9K 복사" }).click();
  await expect(H.page.locator(".wr-duel-setup .wr-copy-feedback")).toHaveText("복사됨");
  check("10 duel copy writes real room code", await H.page.evaluate(() => navigator.clipboard.readText()) === "TR4B9K");

  // responsive duel
  for (const [w, who] of [[390, H], [320, H], [390, G], [320, G]]) {
    await who.page.setViewportSize({ width: w, height: 844 });
    check(`duel ${who === H ? "host" : "guest"} no overflow at ${w}px`, await noOverflow(who.page));
    if (who === H) check(`13/14 host START reachable at ${w}px`, await hostStart.isVisible() && (await hostStart.boundingBox()).width > 200);
    await shot(who.page, `duel-${w}-${who === H ? "host" : "guest"}`);
  }
  await H.page.setViewportSize({ width: 1440, height: 1000 });
  // 32 refresh
  await G.page.reload();
  await G.page.getByText("방장이 고른 목표: 세종대왕").first().waitFor();
  check("32 duel refresh restores lobby (target + no duplicate join)", players.get(duelId).length === 2);
  // reduced motion
  await G.page.emulateMedia({ reducedMotion: "reduce" });
  check("reduced motion disables lobby animation", await G.page.locator(".wr-duel-player").first().evaluate((n) => getComputedStyle(n).animationName === "none"));
  await G.page.emulateMedia({ reducedMotion: "no-preference" });
  // 11 host leaves
  await H.page.getByRole("button", { name: "방 나가기" }).click();
  await H.page.waitForURL(/\/multiplayer$/);
  await expect(G.page.locator(".wr-duel-player--empty")).toHaveCount(1);
  check("11 host leave: existing leave RPC; guest sees empty host slot, still no START", rpcCalls.includes("leave_duel_room_v2") && await G.page.getByRole("button", { name: "게임 시작" }).count() === 0);
  // 33 back
  await G.page.goBack();
  check("33 browser back from lobby returns to entry without error", new URL(G.page.url()).pathname === "/multiplayer");

  // N1 duel header HOME → existing leave RPC first, membership removed
  const navDuel = createRoom({ mode: "duel", host: USERS.p3, code: "NAV111" });
  await G.page.goto(`${base}/multiplayer/room/${navDuel.id}`);
  await G.page.locator(".wr-duel-stage").waitFor();
  check("N1a guest is a member before header navigation", players.get(navDuel.id).some((p) => p.user_id === USERS.guest.id));
  const leavesBefore = rpcByUser.filter((x) => x === `${USERS.guest.id}:leave_duel_room_v2`).length;
  await G.page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "HOME", exact: true }).click();
  await G.page.waitForURL(/\/lobby$/);
  check("N1 duel header HOME calls existing leave RPC and removes membership", rpcByUser.filter((x) => x === `${USERS.guest.id}:leave_duel_room_v2`).length === leavesBefore + 1 && !players.get(navDuel.id).some((p) => p.user_id === USERS.guest.id));

  // R loading-screen back action during the initial direct-entry join (join held back 1.5s)
  for (const [mode, joinRpc] of [["duel", "join_duel_room_v2"], ["group", "join_group_room"]]) {
    const r = createRoom({ mode, host: USERS.p4, code: mode === "duel" ? "RACE01" : "RACE02" });
    let joinDone = false;
    const pattern = `**/rest/v1/rpc/${joinRpc}`;
    await G.page.route(pattern, async (route) => { await new Promise((res) => setTimeout(res, 1500)); await route.fallback(); joinDone = true; });
    await G.page.goto(`${base}/multiplayer/${mode === "duel" ? "room" : "group/room"}/${r.id}`);
    await G.page.getByRole("button", { name: "← 온라인 플레이로" }).click();
    const clickedBeforeJoin = !joinDone;
    await G.page.waitForURL(/\/multiplayer$/);
    await G.page.unroute(pattern);
    await G.page.waitForTimeout(500);
    check(`R ${mode} ← 온라인 플레이로 during initial join → entry, membership gone, no late re-join`, clickedBeforeJoin && joinDone && !players.get(r.id).some((p) => p.user_id === USERS.guest.id));
  }

  // ══ GROUP ══════════════════════════════════════════════════════
  await H.page.goto(`${base}/play`);
  await H.page.locator(".wr-mode").nth(2).click();
  await H.page.locator(".mp-mode-panel").waitFor();
  check("31 PLAY → group entry", new URL(H.page.url()).searchParams.get("mode") === "group");
  await H.page.locator(".mp-mode-panel").getByRole("button", { name: "방 생성", exact: true }).click();
  await H.page.waitForURL(/\/multiplayer\/group\/room\//);
  const groupId = H.page.url().split("/").pop();
  await H.page.locator(".wr-roster").waitFor();
  check("group capacity uses real room.max_players", (await H.page.locator(".wr-party-count").innerText()).replace(/\s/g, "") === "1/6");
  check("rule strip 3–8명 · 20분 · 무아이템 · 동일 코스", (await H.page.locator(".wr-lobby-head").innerText()).includes("3–8명 · 20분 · 무아이템 · 동일 코스"));
  // guest joins second (so succession goes to guest later)
  await G.page.goto(`${base}/multiplayer?mode=group`);
  await G.page.locator(".mp-mode-panel input[placeholder='ROOM CODE']").fill("KQ7F2M");
  await G.page.locator(".mp-mode-panel").getByRole("button", { name: "참가", exact: true }).click();
  await G.page.waitForURL(/\/multiplayer\/group\/room\//);
  await G.page.locator(".wr-roster").waitFor();
  const groupStart = H.page.getByRole("button", { name: "게임 시작" });
  await expect(H.page.locator(".wr-roster-row:not(.wr-roster-row--empty)")).toHaveCount(2);
  check("15 two players → START blocked with reason", await groupStart.isDisabled() && (await H.page.locator("#wr-group-status").innerText()).includes("최소 3명"));
  addPlayer(groupId, USERS.p3); notify(groupId);
  await expect(H.page.locator(".wr-roster-row:not(.wr-roster-row--empty)")).toHaveCount(3);
  check("16 three players unready → blocked", await groupStart.isDisabled() && (await H.page.locator("#wr-group-status").innerText()).includes("준비 중"));
  check("roster shows 준비 중 text status", (await H.page.locator(".wr-roster").innerText()).includes("준비 중"));
  // 17 local search/select
  const gInput = H.page.locator(".wr-group-mine input");
  await gInput.fill("금강");
  await gInput.press("Enter");
  await H.page.locator(".wr-group-mine .search-item").filter({ hasText: "금강산" }).click();
  const readyBtn = H.page.getByRole("button", { name: "READY", exact: true });
  check("17 local candidate selected; READY enabled; search hidden", await H.page.locator(".wr-candidate-card").innerText().then((t) => t.includes("금강산")) && await readyBtn.isEnabled() && await gInput.count() === 0);
  check("17b no submit before READY", !rpcCalls.includes("submit_group_target_v2"));
  await H.page.getByRole("button", { name: "다시 선택" }).click();
  check("17c 다시 선택 returns to search with READY disabled", await gInput.isVisible() && await readyBtn.isDisabled());
  await gInput.fill("금강");
  await gInput.press("Enter");
  await H.page.locator(".wr-group-mine .search-item").filter({ hasText: "금강산" }).click();
  await readyBtn.click();
  await H.page.locator(".wr-candidate-card.is-locked").waitFor();
  check("18 READY submits through existing handler", rpcCalls.includes("submit_group_target_v2") && rpcCalls.includes("set_group_ready"));
  check("19 prepared candidate locked (no search, READY mark)", await gInput.count() === 0 && (await H.page.locator(".wr-candidate-card.is-locked").innerText()).includes("READY"));
  await H.page.getByRole("button", { name: "준비 취소" }).click();
  await readyBtn.waitFor();
  check("20 준비 취소 restores editable state with candidate kept", await readyBtn.isEnabled() && (await H.page.locator(".wr-candidate-card").innerText()).includes("금강산"));
  await readyBtn.click();
  await H.page.locator(".wr-candidate-card.is-locked").waitFor();
  // others ready with the same candidate as host → one distinct
  submit(groupId, USERS.p3.id, "금강산"); notify(groupId);
  await G.page.locator(".wr-group-mine input").fill("금강");
  await G.page.locator(".wr-group-mine input").press("Enter");
  await G.page.locator(".wr-group-mine .search-item").filter({ hasText: "금강산" }).click();
  await G.page.getByRole("button", { name: "READY", exact: true }).click();
  await expect(H.page.locator("#wr-group-status")).toContainText("서로 다른 후보");
  check("21 all READY but one distinct candidate → blocked", await groupStart.isDisabled() && (await H.page.locator(".wr-course-count").innerText()).endsWith("1"));
  check("other players' candidate titles hidden in roster", !(await H.page.locator(".wr-roster").innerText()).includes("금강산"));
  submit(groupId, USERS.p3.id, "남극"); notify(groupId);
  await expect(groupStart).toBeEnabled();
  check("22 all valid → host START enabled", (await H.page.locator("#wr-group-status").innerText()).includes("시작할 수 있습니다"));
  check("23 group guest has no START", await G.page.getByRole("button", { name: "게임 시작" }).count() === 0 && (await G.page.locator(".wr-wait-note").innerText()).includes("방장이 시작하기를 기다리는 중"));
  check("READY uses text + teal status", await H.page.locator(".wr-roster .wr-status--teal").count() === 3);
  await H.page.locator(".wr-head-code").getByRole("button", { name: "방 코드 KQ7F2M 복사" }).click();
  await expect(H.page.locator(".wr-head-code .wr-copy-feedback")).toHaveText("복사됨");
  check("26 group copy writes real code", await H.page.evaluate(() => navigator.clipboard.readText()) === "KQ7F2M");
  await H.page.mouse.move(0, 0);
  await shot(H.page, "group-desktop-host");
  await shot(G.page, "group-desktop-guest");
  for (const w of [390, 320]) {
    for (const who of [H, G]) {
      await who.page.setViewportSize({ width: w, height: 844 });
      check(`group ${who === H ? "host" : "guest"} no overflow at ${w}px`, await noOverflow(who.page));
    }
    check(`28/29 START reachable at ${w}px`, await groupStart.isVisible());
    await H.page.getByRole("button", { name: "접기" }).click();
    check(`mobile roster collapses at ${w}px (aria-expanded)`, await H.page.locator(".wr-roster").isHidden() && await H.page.getByRole("button", { name: "펼치기" }).getAttribute("aria-expanded") === "false");
    await H.page.getByRole("button", { name: "펼치기" }).click();
    await shot(H.page, `group-${w}-host`);
    await shot(G.page, `group-${w}-guest`);
  }
  await H.page.setViewportSize({ width: 1440, height: 1000 });
  await G.page.setViewportSize({ width: 1440, height: 1000 });
  // 32 refresh group
  await G.page.reload();
  await G.page.locator(".wr-candidate-card.is-locked").waitFor();
  check("32 group refresh keeps locked candidate", (await G.page.locator(".wr-candidate-card.is-locked").innerText()).includes("금강산"));
  // 25 host succession
  await H.page.getByRole("button", { name: "방 나가기" }).click();
  await H.page.waitForURL(/\/multiplayer$/);
  await G.page.locator(".wr-host-notice").waitFor();
  check("25 host succession: notice + START authority move to guest", (await G.page.locator(".wr-host-notice").innerText()).includes("방장이 넘어왔습니다") && await G.page.getByRole("button", { name: "게임 시작" }).count() === 1);
  check("25b succession keeps room state (READY kept)", await G.page.locator(".wr-candidate-card.is-locked").count() === 1);
  await shot(G.page, "group-desktop-succession");
  await G.page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "PLAY", exact: true }).click();
  await G.page.waitForURL(/\/play$/);
  check("N2 group header PLAY calls existing leave RPC and removes membership", rpcByUser.includes(`${USERS.guest.id}:leave_group_waiting_room`) && !players.get(groupId).some((p) => p.user_id === USERS.guest.id));
  check("N2b group succession continues for the remaining player", rooms.get(groupId).host_user_id === USERS.p3.id);

  // 24 eight-player layout
  const eight = createRoom({ mode: "group", host: USERS.host, code: "EIGHT8", maxPlayers: 8 });
  ["p3", "p4", "p5", "p6", "p7", "p8", "guest"].forEach((k) => addPlayer(eight.id, USERS[k]));
  const titles = Object.keys(PAGES);
  [USERS.host, USERS.p3, USERS.p4, USERS.p5, USERS.p6, USERS.p7, USERS.p8, USERS.guest].forEach((u, i) => submit(eight.id, u.id, titles[i]));
  await H.page.goto(`${base}/multiplayer/group/room/${eight.id}`);
  await H.page.locator(".wr-roster").waitFor();
  await expect(H.page.getByRole("button", { name: "게임 시작" })).toBeEnabled();
  check("24 eight players: 8 compact rows, no empty slots, START enabled", await H.page.locator(".wr-roster-row:not(.wr-roster-row--empty)").count() === 8 && await H.page.locator(".wr-roster-row--empty").count() === 0);
  check("24b 8-player roster rows are compact (≤64px)", (await H.page.locator(".wr-roster-row").evaluateAll((n) => n.map((x) => x.getBoundingClientRect().height))).every((h) => h <= 64));
  await H.page.mouse.move(0, 0);
  await shot(H.page, "group-desktop-8-ready");
  await H.page.setViewportSize({ width: 390, height: 844 });
  check("8 players no overflow at 390", await noOverflow(H.page));
  await shot(H.page, "group-390-8-ready");
  await H.page.setViewportSize({ width: 1440, height: 1000 });

  // keyboard: Tab reaches copy, leave, READY/START; focus visible
  await H.page.goto(`${base}/multiplayer/group/room/${eight.id}`);
  await H.page.locator(".wr-roster").waitFor();
  await H.page.getByRole("button", { name: "방 코드 EIGHT8 복사" }).focus();
  check("focus visible on copy control", await H.page.getByRole("button", { name: "방 코드 EIGHT8 복사" }).evaluate((n) => getComputedStyle(n).outlineStyle !== "none"));
  check("single h1 heading in lobby", await H.page.locator("main h1").count() === 1);

  // L local guest cannot enter online routes by direct URL
  const localGuest = await context(LOCAL_GUEST);
  for (const path of ["/multiplayer", "/multiplayer?mode=duel", `/multiplayer/room/${navDuel.id}`, `/multiplayer/group/room/${eight.id}`]) {
    await localGuest.page.goto(`${base}${path}`);
    await localGuest.page.waitForURL(/\/play$/);
    check(`L local guest ${path} → /play`, new URL(localGuest.page.url()).pathname === "/play" && await localGuest.page.locator(".wr-room, .mp-mode-panel").count() === 0);
  }
  check("L local guest triggered no online RPC", !rpcByUser.some((x) => x.startsWith("anon:") && /join_|create_|leave_|get_duel_room_players/.test(x)));
  // G online in-game URLs: redirect happens before any online room/game request or realtime socket.
  const ONLINE_REQUEST = /\/rest\/v1\/(game_rooms|room_players|room_events|group_match_results)|\/rest\/v1\/rpc\/(.*duel.*|.*group.*|.*room.*|heartbeat_.*|finalize_.*|initialize_.*|apply_.*)|\/functions\/v1\//;
  for (const path of [`/multiplayer/game/${navDuel.id}`, `/multiplayer/group/game/${eight.id}`]) {
    const seen = [];
    const onRequest = (request) => { const url = new URL(request.url()); if (url.origin === api) seen.push(url.pathname); };
    // Only the Supabase realtime socket counts; Vite's own dev-server HMR socket is not an app request.
    const onSocket = (socket) => { if (new URL(socket.url()).port === new URL(api).port) seen.push(`ws:${socket.url()}`); };
    localGuest.page.on("request", onRequest);
    localGuest.page.on("websocket", onSocket);
    await localGuest.page.goto(`${base}${path}`);
    await localGuest.page.waitForURL(/\/play$/);
    await localGuest.page.locator(".wr-mode").first().waitFor();
    await localGuest.page.waitForTimeout(300);
    localGuest.page.off("request", onRequest);
    localGuest.page.off("websocket", onSocket);
    const online = seen.filter((p) => ONLINE_REQUEST.test(p) || p.startsWith("ws:"));
    if (online.length) console.log(path, online);
    check(`G local guest ${path.replace(/[^/]+$/, ":roomId")} → /play before any online request`, new URL(localGuest.page.url()).pathname === "/play" && online.length === 0);
  }
  check("L PLAY still shows online modes as login-only for the guest", (await localGuest.page.locator(".wr-mode").nth(1).getAttribute("aria-disabled")) === "true");
  await localGuest.ctx.close();

  // 34 auth restriction
  const anon = await context(null);
  await anon.page.goto(`${base}/multiplayer/group/room/${groupId}`);
  await anon.page.waitForURL(/\/login/);
  check("34 unauthenticated lobby URL redirects to login", new URL(anon.page.url()).pathname === "/login");
  // not found — the existing page logs its own refresh failure; only this step's expected errors are exempt.
  const beforeNotFound = consoleErrors.length;
  await G.page.goto(`${base}/multiplayer/room/d0000000-0000-4000-8000-999999999999`);
  await G.page.locator(".wr-lobby-state").waitFor();
  await G.page.waitForTimeout(300);
  check("room not found keeps real error in shell", (await G.page.locator(".wr-lobby-state").innerText()).includes("방 정보를 불러오지 못했습니다"));
  const notFoundErrors = consoleErrors.splice(beforeNotFound);
  const unexpected = notFoundErrors.filter((e) => !/게임 방이 삭제되었거나|406|PGRST116/.test(e));
  consoleErrors.push(...unexpected);

  for (const c of [H, G, anon]) await c.ctx.close();
  if (consoleErrors.length) console.log(JSON.stringify(consoleErrors, null, 2));
  check("35 browser console/page errors absent", consoleErrors.length === 0);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ basis: "62105a3 + uncommitted Phase 2 working tree", date: "2026-10-07", fixtureOnly: true, externalResources: [...externalResources], rpcCalls: [...new Set(rpcCalls)], checks, consoleErrors }, null, 2));
  console.log(`PASS ${checks.length} browser checks (isolated API/realtime fixtures; real backend not exercised)`);
} finally { await browser?.close(); server.kill(); }
