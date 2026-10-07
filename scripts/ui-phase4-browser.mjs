// Phase 4 RESULT presentation regression (Single SuccessOverlay · Duel result · Group Result A → B,
// RETIRE hold → C → B). Harness copied from ui-phase3-browser.mjs. Every Supabase / Edge / Wikipedia /
// Realtime call is answered by an in-memory fixture inside this script; no backend is reached and no
// fixture enters production code. Fixture ranks / XP / achievements are example rows shaped like the
// server's finalized output — the pages only read and render them. Real authority is not exercised.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";

const base = "http://127.0.0.1:5190";
const api = "http://127.0.0.1:54332";
const output = "test-results/packet13-b1/ui-phase4";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5190", "--strictPort"], {
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
// ── Phase 4 result fixtures (finalized-server shaped rows; read-only for the pages) ──
const ledger = new Map();          // source_id → xp_ledger rows
const matchHistory = new Map();    // room_id → { id }
const groupResults = new Map();    // room_id → group_match_results rows
const unlocks = new Map();         // `${scope}:${resultId}` → achievement entries (tiers carry `seen`)
const markCalls = [];              // unlock ids sent to mark_achievements_seen_v1
const restHits = [];
const fixture = { singleNoRecord: false, singleRecordFail: false };
const ledgerRow = (sourceId, sourceType, amount, extra = {}) => ({ id: `xp-${sourceId}-${sourceType}`, xp_class: "result", source_type: sourceType, source_id: sourceId, base_amount: amount, amount, decay_reason: null, granted_at: iso(now()), ...extra });
const achievement = (id, name, unlockId, { hidden = false, xp = 30 } = {}) => ({ achievementId: id, category: "explore", hidden, hiddenKind: hidden ? "play" : null, name, condition: `${name} 조건 예시`, description: "", tierCount: 1, tiers: [{ unlockId, tier: 1, threshold: 1, xp: { amount: xp, ledgerId: `l-${unlockId}` }, rewards: [], unlockedAt: iso(now()), seen: false }], xpTotal: xp });
function achievementsBody(scope, resultId) {
  const list = unlocks.get(`${scope}:${resultId}`) || [];
  return { ok: true, scope, resultId, achievements: list, xpTotal: list.reduce((sum, a) => sum + a.xpTotal, 0) };
}
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

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "content-range" };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { ...CORS, "content-range": "0-0/0" }, body: JSON.stringify(body) });
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
        if (finished) {
          Object.assign(room, { status: "finished", finished_reason: "normal_finish", winner_user_id: USERS.me.id, finished_at: iso(now()), game_starts_at: room.game_starts_at || iso(now() - 83_000) });
          matchHistory.set(p.p_room_id, { id: `mh-${p.p_room_id}` });
          ledger.set(`mh-${p.p_room_id}`, [ledgerRow(`mh-${p.p_room_id}`, "duel_win_normal", 50)]);
        }
        return json(route, { ok: true, room, player: mine });
      }
      case "leave_duel_room_v2": {
        Object.assign(room, { status: "finished", finished_reason: "forfeit", winner_user_id: USERS.opp.id, state_version: room.state_version + 1, finished_at: iso(now()), game_starts_at: room.game_starts_at || iso(now() - 60_000) });
        setPlayer(p.p_room_id, USERS.me.id, { player_status: "retired", retire_reason: "forfeited" });
        matchHistory.set(p.p_room_id, { id: `mh-${p.p_room_id}` });
        ledger.set(`mh-${p.p_room_id}`, [ledgerRow(`mh-${p.p_room_id}`, "duel_loss_forfeit", 0)]);
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
      case "get_result_achievements_v1": restHits.push(`${userKey}:achievements:${p.p_scope}:${p.p_result_id}`); return json(route, achievementsBody(p.p_scope, p.p_result_id));
      case "mark_achievements_seen_v1": {
        const ids = p.p_unlock_ids || [];
        markCalls.push(...ids);
        for (const list of unlocks.values()) for (const a of list) for (const t of a.tiers) if (ids.includes(t.unlockId)) t.seen = true;
        return json(route, { ok: true, marked: ids.length });
      }
      case "level_from_total_xp": return json(route, 4);
      case "get_profile_cards_v1": return json(route, { ok: true, cards: {} });
      case "get_xp_summary_v1": return json(route, { ok: true, total_xp: 640, level: 4, current_level_xp: 140, next_level_xp: 175 });
      case "ensure_today_daily_challenge": return json(route, [{ target_title: TARGET, start_title: START, hint: "", challenge_date: "2026-10-07" }]);
      case "get_my_achievements_v1": return json(route, { ok: true, unseenCount: 0, achievements: [], hidden: { discovered: 0, achievements: [] } });
      default: return json(route, []);
    }
  }
  if (path === "/rest/v1/game_records") {
    restHits.push(`${userKey}:game_records`);
    const runId = (url.searchParams.get("run_id") || "").slice(3);
    if (runId && fixture.singleRecordFail) return json(route, { message: "fixture failure" }, 500);
    if (request.method() === "HEAD") {
      const elapsed = url.searchParams.get("elapsed_seconds") || "";
      const n = elapsed.startsWith("lt.") ? 2 : elapsed.startsWith("eq.") ? 0 : 12;
      return route.fulfill({ status: 200, headers: { ...CORS, "content-range": `*/${n}` } });
    }
    if (runId) {
      const run = singleRuns.get(runId);
      if (!run || fixture.singleNoRecord || run.status !== "completed") return json(route, []);
      return json(route, [{ id: `rec-${runId.slice(0, 8)}`, run_id: runId, user_id: USERS.me.id, player_name: USERS.me.nickname, start_title: START, target_title: TARGET, elapsed_seconds: 95, click_count: run.move_count, path_titles: run.path_title_snapshots, result_status: "completed", created_at: iso(now()) }]);
    }
    return json(route, [
      { id: "top-1", user_id: USERS.opp.id, player_name: USERS.opp.nickname, start_title: START, target_title: TARGET, elapsed_seconds: 41, click_count: 3, path_titles: [START, TARGET], created_at: iso(now() - 9e6) },
      { id: "top-2", user_id: USERS.p3.id, player_name: USERS.p3.nickname, start_title: START, target_title: TARGET, elapsed_seconds: 58, click_count: 4, path_titles: [START, TARGET], created_at: iso(now() - 8e6) },
      { id: "top-3", user_id: USERS.p4.id, player_name: USERS.p4.nickname, start_title: START, target_title: TARGET, elapsed_seconds: 77, click_count: 4, path_titles: [START, TARGET], created_at: iso(now() - 7e6) },
    ]);
  }
  if (path === "/rest/v1/xp_ledger") {
    const sourceId = (url.searchParams.get("source_id") || "").slice(3);
    restHits.push(`${userKey}:xp_ledger:${sourceId}`);
    return json(route, ledger.get(sourceId) || []);
  }
  if (path === "/rest/v1/match_history") {
    const found = matchHistory.get((url.searchParams.get("room_id") || "").slice(3)) || null;
    const wantsObject = (request.headers().accept || "").includes("vnd.pgrst.object");
    return json(route, wantsObject ? found : found ? [found] : []);
  }
  if (path === "/rest/v1/group_match_results") return json(route, groupResults.get((url.searchParams.get("room_id") || "").slice(3)) ?? []);
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
// ── Phase 4 helpers ──────────────────────────────────────────────
const resultRoot = (page) => page.locator(".wr-result");
const overflowFree = (page) => page.evaluate(() => {
  const doc = document.documentElement.scrollWidth <= innerWidth;
  const layers = [...document.querySelectorAll(".wr-result, .wr-result-frame, .wr-result-card")].every((n) => n.scrollWidth <= n.clientWidth + 1);
  return doc && layers;
});
const inViewport = (locator) => locator.evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
const focusedId = (page) => page.evaluate(() => document.activeElement?.id || "");
const xpText = (page) => page.getByTestId("result-xp").first().innerText();
const LONG = ["아주 긴 이름의 문서 제목 하나", "두 번째로 긴 문서 제목 예시 문장", "세 번째 문서", "네 번째 문서", "다섯 번째 문서", "여섯 번째 문서", "일곱 번째 매우 긴 문서 제목 예시"];

function finishedDuel(id, { reason = "normal_finish", winner = USERS.opp.id, meRetire = null, oppRetire = null, xp = null, useItems = false } = {}) {
  const startedAt = now() - 120_000;
  rooms.set(id, { id, mode: "duel", status: "finished", host_user_id: USERS.me.id, state_version: 9, started_at: iso(startedAt), game_starts_at: iso(startedAt), finished_at: iso(startedAt + 83_000), use_items: useItems, finished_reason: reason, winner_user_id: winner });
  players.set(id, [
    row(id, USERS.me, { player_status: meRetire ? "retired" : winner === USERS.me.id ? "finished" : "playing", retire_reason: meRetire, has_finished: winner === USERS.me.id && reason === "normal_finish", path_titles: [START, ...LONG, OTHER], current_title: OTHER, move_count: LONG.length + 1 }),
    row(id, USERS.opp, { player_status: oppRetire ? "retired" : winner === USERS.opp.id ? "finished" : "playing", retire_reason: oppRetire, has_finished: winner === USERS.opp.id && reason === "normal_finish", path_titles: [START, MIDDLE, TARGET], current_title: TARGET, move_count: 2 }),
  ]);
  itemStates.set(id, { use_items: useItems, grants: [], active_effects: [], pending_defenses: [] });
  if (reason !== "cancelled") matchHistory.set(id, { id: `mh-${id}` });
  if (xp) ledger.set(`mh-${id}`, [ledgerRow(`mh-${id}`, xp[0], xp[1])]);
}

const GROUP8 = [USERS.p4, USERS.me, USERS.opp, USERS.p3, USERS.p5, USERS.p6, USERS.p7, USERS.p8];
function finalizeGroup(id, members, spec) {
  // spec: user.id → { rank } | { retire: reason }
  Object.assign(rooms.get(id), { status: "finished", finished_at: iso(now()), state_version: (rooms.get(id).state_version || 3) + 1 });
  const list = players.get(id);
  const results = members.map((u) => {
    const s = spec[u.id];
    const player = list.find((p) => p.user_id === u.id);
    const finished = Number.isInteger(s.rank);
    Object.assign(player, finished
      ? { player_status: "finished", has_finished: true, rank: s.rank, elapsed_seconds: 200 + s.rank * 37 }
      : { player_status: "retired", retire_reason: s.retire, rank: null, elapsed_seconds: null });
    return {
      id: `gr-${id}-${u.id.slice(0, 4)}`, room_id: id, user_id: u.id, nickname_snapshot: u.nickname,
      result_status: finished ? "finished" : "retired", rank: finished ? s.rank : null, is_winner: finished && s.rank <= 3,
      elapsed_seconds: finished ? 200 + s.rank * 37 : null, move_count: finished ? 3 + s.rank : 6,
      path_titles: finished ? [START, MIDDLE, TARGET] : [START, OTHER, MIDDLE], retire_reason: finished ? null : s.retire,
      finished_at: iso(now() - (10 - (s.rank || 9)) * 1000),
    };
  });
  groupResults.set(id, results);
  return Object.fromEntries(results.map((r) => [r.user_id, r]));
}

try {
  await fs.mkdir(output, { recursive: true });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true });

  // ══ SINGLE ═════════════════════════════════════════════════════
  async function playSingleToFinish(page) {
    await page.goto(`${base}/play`);
    await page.locator(".wr-mode").first().click();
    await page.getByPlaceholder("예: 아인슈타인, 조선왕조...").fill("랜덤");
    await page.getByRole("button", { name: "랜덤 목표로 시작" }).click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 15000 });
    await page.locator(".countdown-overlay").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    // seed the finalized server rows the result screen will read (keyed by the run the page created)
    const runId = [...singleRuns.keys()].pop();
    const recordId = `rec-${runId.slice(0, 8)}`;
    ledger.set(recordId, [ledgerRow(recordId, "single_random_finish", 20)]);
    unlocks.set(`single:${recordId}`, [achievement("fixture_single_a", "첫 탐험 예시", `u-single-${runId.slice(0, 6)}`)]);
    await page.locator(".article-content a", { hasText: TARGET }).first().click();
    await page.getByTestId("single-result").waitFor({ timeout: 15000 });
    return { runId, recordId };
  }
  {
    const { ctx, page } = await context("me");
    const { runId } = await playSingleToFinish(page);
    const dialog = page.getByRole("dialog", { name: "완주" });
    check("S1 single result is a labelled modal dialog (heading 완주)", await dialog.count() === 1 && await dialog.getAttribute("aria-modal") === "true");
    check("S1b focus moves to the outcome heading", (await focusedId(page)) === "wr-single-result-title");
    check("S1c race underneath is inert", await page.locator(".wr-race:not(.wr-result)[inert]").count() === 1);
    await expect(page.getByTestId("result-xp")).toContainText("+20 XP", { timeout: 15000 });
    check("S2 XP from the ledger row: +20 XP · 랜덤 탐험 완주", (await xpText(page)).includes("랜덤 탐험 완주"));
    await expect(page.getByTestId("result-achievements").locator(".ach-reveal-card")).toHaveCount(1, { timeout: 5000 });
    check("S3 achievement revealed once and marked seen by the existing component", markCalls.includes(`u-single-${runId.slice(0, 6)}`));
    check("S4 server rank line, no client rank", (await page.locator(".wr-rrank").innerText()).includes("서버 확정 기록 12건 중 3위입니다"));
    check("S5 real actions only: 새 게임 선택 · 로비로 이동 (no 다시 도전)", await page.getByRole("button", { name: "새 게임 선택" }).isVisible() && await page.getByRole("button", { name: "로비로 이동" }).isVisible() && await page.getByRole("button", { name: "다시 도전" }).count() === 0);
    check("S6 route timeline lists the server path, last node Gold", (await page.locator(".wr-tl-item").count()) === 3 && await page.locator(".wr-tl-item.is-last .wr-tl-title").innerText() === TARGET);
    check("S6b no rematch copy", !(await resultRoot(page).innerText()).includes("재대결"));
    await page.mouse.move(0, 0);
    await shot(page, "single-result-desktop");
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 760 });
      check(`S7 single result no horizontal overflow at ${w}`, await overflowFree(page));
      check(`S7b primary action reachable at ${w}`, await inViewport(page.getByRole("button", { name: "새 게임 선택" })));
    }
    await shot(page, "single-result-320");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "single-result-390");
    await page.emulateMedia({ reducedMotion: "reduce" });
    check("S8 reduced motion: mascot/card animations off", await page.locator(".wr-rscene-mascot").evaluate((n) => getComputedStyle(n).animationName === "none"));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "새 게임 선택" }).click();
    await page.waitForURL(/\/play$/);
    check("S9 새 게임 선택 → existing /play mode selection", true);
    await ctx.close();
  }
  {
    // logged-in, finalized record missing / read failure — stable copy, never an endless spinner
    fixture.singleNoRecord = true;
    const { ctx, page } = await context("me");
    await playSingleToFinish(page);
    await expect(page.getByTestId("result-xp")).toHaveText("이 결과에 기록된 XP 지급 내역이 없습니다.", { timeout: 10000 });
    check("S10 no result record → stable no-grant copy (no fake XP)", !(await resultRoot(page).innerText()).includes("확인하는 중"));
    fixture.singleNoRecord = false;
    fixture.singleRecordFail = true;
    await playSingleToFinish(page);
    await expect(page.getByTestId("result-xp")).toHaveText("XP 지급 정보를 불러오지 못했습니다.", { timeout: 10000 });
    check("S11 record read failure → stable failure copy", true);
    fixture.singleRecordFail = false;
    await page.getByRole("button", { name: "로비로 이동" }).click();
    await page.waitForURL(/\/lobby$/);
    check("S12 로비로 이동 keeps the existing lobby return", true);
    await ctx.close();
  }
  {
    const g = await context("guestSingle", { guest: true });
    await g.page.goto(`${base}/play`);
    await g.page.locator(".wr-mode").first().click();
    await g.page.getByPlaceholder("예: 아인슈타인, 조선왕조...").fill("랜덤");
    await g.page.getByRole("button", { name: "랜덤 목표로 시작" }).click();
    await expect(g.page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 15000 });
    await g.page.locator(".countdown-overlay").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await g.page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(g.page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    await g.page.locator(".article-content a", { hasText: TARGET }).first().click();
    await g.page.getByTestId("single-result").waitFor({ timeout: 15000 });
    await expect(g.page.getByTestId("result-xp")).toContainText("로그인하면 XP와 레벨이 저장됩니다", { timeout: 10000 });
    check("S13 guest: existing guest XP contract, no spinner, not ranked", !(await resultRoot(g.page).innerText()).includes("확인하는 중") && (await g.page.locator(".wr-rrank").innerText()).includes("게스트는 랭킹에 등록되지 않습니다."));
    await g.page.setViewportSize({ width: 390, height: 844 });
    await shot(g.page, "single-guest-390");
    await g.ctx.close();
  }

  // ══ DUEL ═══════════════════════════════════════════════════════
  const duelLocal = (id) => ({ [`wiki-mp-game:${id}:${USERS.me.id}`]: { enteredPlaying: true } });
  {
    duelRoom("duel-win-0101", { useItems: false });
    setPlayer("duel-win-0101", USERS.opp.id, { path_titles: [START, OTHER, MIDDLE, OTHER, MIDDLE, OTHER, MIDDLE], move_count: 6 });
    rooms.get("duel-win-0101").game_starts_at = iso(now() - 60_000);
    const { ctx, page } = await context("me", { local: duelLocal("duel-win-0101") });
    await page.goto(`${base}/multiplayer/game/duel-win-0101`);
    await expect(page.locator(".mp-game-status")).toHaveText("레이스 진행 중", { timeout: 20000 });
    await page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    await page.locator(".article-content a", { hasText: TARGET }).first().click();
    await page.getByTestId("duel-result").waitFor({ timeout: 15000 });
    check("D1 win: dialog heading 승리, Gold tone, win mascot", await page.getByRole("dialog", { name: "승리" }).count() === 1 && await page.locator(".wr-result--win .wr-rscene-mascot--win").count() === 1);
    check("D1b win pill + reason from the room (normal_finish)", (await resultRoot(page).innerText()).includes("목표 도달 · 상대보다 먼저") && (await page.locator(".wr-rhead-detail").innerText()) === "목표 문서에 먼저 도착했습니다.");
    check("D1c focus on outcome heading; race inert", (await focusedId(page)) === "wr-duel-result-title" && await page.locator(".wr-race:not(.wr-result)[inert]").count() === 1);
    await expect(page.getByTestId("result-xp")).toContainText("+50 XP", { timeout: 15000 });
    check("D2 XP from the match ledger: +50 · 1:1 정상 승리", (await xpText(page)).includes("1:1 정상 승리"));
    check("D3 time from the finalized server boundary (mm:ss)", /^\d\d:\d\d$/.test((await page.locator(".wr-rstats > div").first().locator("dd").innerText()).trim()));
    check("D4 my route + opponent route revealed after finish", (await page.locator(".wr-rroute-sub").innerText()).includes("상대 경로") && await page.locator(".wr-rroute-sub .wr-chain-chip").count() >= 3);
    await page.getByRole("button", { name: "전체 경로 ▾" }).click();
    check("D4b full route toggle expands both routes, wraps without overflow", await page.locator(".wr-rroute-sub .wr-chain-chip").count() === 7 && await overflowFree(page));
    check("D5 single explicit action 게임 로비로 이동, no rematch", await page.getByRole("button", { name: "게임 로비로 이동" }).isVisible() && !(await resultRoot(page).innerText()).includes("재대결"));
    check("D6 HUD status still announces 승리! (Phase 3 contract)", (await page.locator(".mp-game-status").innerText()) === "승리!");
    await page.mouse.move(0, 0);
    await shot(page, "duel-win-desktop");
    const url = page.url();
    await page.waitForTimeout(7600);
    check("D7 no auto-redirect: still on the result after 7.6s (old hold 4s/6s removed)", page.url() === url && await page.getByTestId("duel-result").isVisible());
    const xpReadsBefore = restHits.filter((h) => h.startsWith("me:xp_ledger:mh-duel-win-0101")).length;
    await page.reload();
    await page.getByTestId("duel-result").waitFor({ timeout: 20000 });
    check("D8 F5 recovers the same finalized result (승리 · +50 XP)", await page.getByRole("dialog", { name: "승리" }).count() === 1);
    await expect(page.getByTestId("result-xp")).toContainText("+50 XP", { timeout: 15000 });
    check("D8b F5 only re-reads the ledger (no client grant path)", restHits.filter((h) => h.startsWith("me:xp_ledger:mh-duel-win-0101")).length > xpReadsBefore && !rpcCalls.some((c) => /grant/.test(c)));
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 760 });
      check(`D9 duel result no overflow at ${w}`, await overflowFree(page));
      check(`D9b lobby action reachable at ${w}`, await inViewport(page.getByRole("button", { name: "게임 로비로 이동" })));
    }
    await shot(page, "duel-win-320");
    await page.getByRole("button", { name: "게임 로비로 이동" }).click();
    await page.waitForURL(/\/multiplayer$/);
    check("D10 explicit 게임 로비로 이동 → /multiplayer", true);
    await ctx.close();
  }
  {
    finishedDuel("duel-loss-0102", { reason: "normal_finish", winner: USERS.opp.id, xp: ["duel_loss_normal", 25], useItems: true });
    const { ctx, page } = await context("me", { width: 390, height: 844, local: duelLocal("duel-loss-0102") });
    await page.goto(`${base}/multiplayer/game/duel-loss-0102`);
    await page.getByTestId("duel-result").waitFor({ timeout: 20000 });
    check("D11 loss (direct open of a finished room): 패배, neutral, lose mascot, no celebration", await page.getByRole("dialog", { name: "패배" }).count() === 1 && await page.locator(".wr-result--lose .wr-rscene-mascot--lose").count() === 1 && await page.locator(".wr-rscene--none").count() === 1 && await page.getByTestId("finish-effect").count() === 0);
    check("D11b loss copy from the room + item-mode label", (await resultRoot(page).innerText()).includes("상대 먼저 도달") && (await resultRoot(page).innerText()).includes("1:1 아이템전"));
    check("D11c loss heading is not Gold", await page.locator("#wr-duel-result-title").evaluate((n) => getComputedStyle(n).color === "rgb(120, 135, 127)"));
    await expect(page.getByTestId("result-xp")).toContainText("+25 XP", { timeout: 15000 });
    check("D12 loss XP from ledger: +25 · 1:1 정상 패배; route marks 목표 미도달", (await xpText(page)).includes("1:1 정상 패배") && (await page.locator(".wr-rroute-tail").innerText()) === "목표 미도달");
    check("D12b long route stays inside the card at 390", await overflowFree(page));
    await shot(page, "duel-loss-390");
    await page.setViewportSize({ width: 320, height: 700 });
    check("D12c 320: no overflow, lobby action reachable", await overflowFree(page) && await inViewport(page.getByRole("button", { name: "게임 로비로 이동" })));
    await shot(page, "duel-loss-320");
    await ctx.close();
  }
  {
    finishedDuel("duel-oppf-0103", { reason: "forfeit", winner: USERS.me.id, oppRetire: "disconnected_timeout", xp: ["duel_win_forfeit", 30] });
    const { ctx, page } = await context("me", { local: duelLocal("duel-oppf-0103") });
    await page.goto(`${base}/multiplayer/game/duel-oppf-0103`);
    await page.getByTestId("duel-result").waitFor({ timeout: 20000 });
    check("D13 opponent disconnect forfeit: 승리 + C4 secondary 상대 기권/이탈 + room reason copy", await page.getByRole("dialog", { name: "승리" }).count() === 1 && (await resultRoot(page).innerText()).includes("상대 기권/이탈") && (await page.locator(".wr-rhead-detail").innerText()).includes("복귀하지 못했습니다"));
    await expect(page.getByTestId("result-xp")).toContainText("+30 XP", { timeout: 15000 });
    check("D13b forfeit-win XP label from ledger", (await xpText(page)).includes("상대 기권으로 승리"));
    await ctx.close();
  }
  {
    finishedDuel("duel-void-0104", { reason: "cancelled", winner: null, meRetire: "disconnected_timeout", oppRetire: "disconnected_timeout" });
    const { ctx, page } = await context("me", { local: duelLocal("duel-void-0104") });
    await page.goto(`${base}/multiplayer/game/duel-void-0104`);
    await page.getByTestId("duel-result").waitFor({ timeout: 20000 });
    check("D14 void: 무효 heading, neutral tone, no mascot/celebration/finish effect", await page.getByRole("dialog", { name: "무효" }).count() === 1 && await page.locator(".wr-result--neutral").count() === 1 && await page.locator(".wr-rscene-mascot").count() === 0 && await page.getByTestId("finish-effect").count() === 0);
    check("D14b screen-reader status says 무효 (not 패배)", (await page.locator(".mp-game-status").innerText()) === "무효");
    await expect(page.locator(".wr-rxp-row .rxp-note")).toHaveText("이 결과에 기록된 XP 지급 내역이 없습니다.", { timeout: 15000 });
    check("D14c void has no XP row (server grants nothing) and says so", true);
    check("D14d mode label from the room row (일반전), not the default item flag", (await resultRoot(page).innerText()).includes("1:1 일반전"));
    await ctx.close();
  }
  {
    duelRoom("duel-ownf-0105", { useItems: false });
    const { ctx, page } = await context("me", { local: duelLocal("duel-ownf-0105") });
    await page.goto(`${base}/multiplayer/game/duel-ownf-0105`);
    await expect(page.locator(".mp-game-status")).toHaveText("레이스 진행 중", { timeout: 20000 });
    await page.getByRole("button", { name: "나가기" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "이탈하기" }).click();
    await page.getByTestId("duel-result").waitFor({ timeout: 15000 });
    check("D15 own forfeit via existing leave RPC → 패배 · 기권 result", rpcCalls.includes("me:leave_duel_room_v2") && await page.getByRole("dialog", { name: "패배" }).count() === 1 && (await resultRoot(page).innerText()).includes("기권"));
    await expect(page.getByTestId("result-xp")).toContainText("+0 XP", { timeout: 15000 });
    check("D15b forfeit loss shows the ledger's +0 XP", (await xpText(page)).includes("직접 기권·연결 이탈 패배"));
    await ctx.close();
  }

  // ══ GROUP ══════════════════════════════════════════════════════
  const groupLocal = (id, extra = {}) => ({ [`wiki-group-game-state:${id}:${USERS.me.id}`]: { enteredPlaying: true, ...extra } });
  {
    // Result A → 관전하기 → Spectator → finalization → Result B (achievement revealed exactly once)
    groupRoom("group-ab-0201", [USERS.me, USERS.opp, USERS.p3]);
    setPlayer("group-ab-0201", USERS.opp.id, { player_status: "finished", has_finished: true, rank: 1, elapsed_seconds: 240, move_count: 3 });
    const { ctx, page } = await context("me", { local: groupLocal("group-ab-0201") });
    await page.goto(`${base}/multiplayer/group/game/group-ab-0201`);
    await expect(page.locator(".wr-hud-doc--current")).toContainText(START, { timeout: 20000 });
    await page.locator(".article-content a", { hasText: MIDDLE }).first().click();
    await expect(page.locator(".wr-hud-doc--current")).toContainText(MIDDLE);
    await page.locator(".article-content a", { hasText: TARGET }).first().click();
    await page.locator(".wr-result-a").waitFor({ timeout: 15000 });
    check("G1 Result A unchanged: 2위 완주 + 관전하기, no XP / no achievements", (await page.locator(".wr-result-headline h1").innerText()).includes("2위 완주") && await page.getByRole("button", { name: "관전하기 →" }).isVisible() && await page.getByTestId("result-xp").count() === 0 && await page.getByTestId("result-achievements").count() === 0);
    await page.waitForTimeout(1200);
    check("G1b no auto-spectate", await page.locator(".wr-race-tabs").count() === 0);
    await page.reload();
    await page.locator(".wr-result-a").waitFor({ timeout: 20000 });
    check("G1c F5 on Result A stays on Result A", await page.getByRole("button", { name: "관전하기 →" }).isVisible());
    await page.getByRole("button", { name: "관전하기 →" }).click();
    await page.locator(".wr-race-tabs").waitFor();
    await page.reload();
    await page.locator(".wr-race-tabs").waitFor({ timeout: 20000 });
    check("G2 F5 while spectating stays spectating, still no XP/achievement mount", await page.getByTestId("result-xp").count() === 0);
    const rows = finalizeGroup("group-ab-0201", [USERS.me, USERS.opp, USERS.p3], { [USERS.opp.id]: { rank: 1 }, [USERS.me.id]: { rank: 2 }, [USERS.p3.id]: { retire: "grace_timeout" } });
    const myRowId = rows[USERS.me.id].id;
    ledger.set(myRowId, [ledgerRow(myRowId, "group_rank_2", 55)]);
    unlocks.set("group:group-ab-0201", [achievement("fixture_group_a", "그룹 탐험 예시", "u-group-ab", { hidden: true })]);
    notify("group-ab-0201");
    await page.getByTestId("group-final-result").waitFor({ timeout: 20000 });
    check("G3 spectator → finalization → Result B: 2위 완주 · 결과 확정", (await page.locator("#wr-group-result-title").innerText()) === "2위 완주" && (await resultRoot(page).innerText()).includes("결과 확정"));
    await expect(page.getByTestId("result-xp")).toContainText("+55 XP", { timeout: 15000 });
    check("G4 B XP from the finalized ledger: +55 · 그룹 2위 완주 (+ achievement XP line)", (await xpText(page)).includes("그룹 2위 완주") && (await xpText(page)).includes("업적 달성"));
    await expect(page.getByTestId("result-achievements").locator(".ach-reveal-card")).toHaveCount(1, { timeout: 5000 });
    check("G5 achievement revealed on B only, marked seen once", markCalls.filter((id) => id === "u-group-ab").length === 1);
    check("G6 one ResultXp mount on B", await page.getByTestId("result-xp").count() === 1);
    check("G7 standings: 3 rows, own row 나 + aria-current, retired –/리타이어 + reason", await page.locator(".wr-standings-list .wr-srow").count() === 3 && (await page.locator(".wr-srow.is-me").innerText()).includes("나") && await page.locator(".wr-srow.is-me").getAttribute("aria-current") === "true" && (await page.locator(".wr-srow.is-retired").innerText()).includes("리타이어") && (await page.locator(".wr-srow.is-retired").innerText()).includes("유예 시간 초과"));
    check("G7b B has no 관전하기 / 재대결; single lobby action", await page.getByRole("button", { name: "관전하기 →" }).count() === 0 && !(await resultRoot(page).innerText()).includes("재대결") && await page.getByRole("button", { name: "그룹 로비로" }).isVisible());
    check("G7c focus moved to the B heading", (await focusedId(page)) === "wr-group-result-title");
    const marksBefore = markCalls.length;
    await page.reload();
    await page.getByTestId("group-final-result").waitFor({ timeout: 20000 });
    await expect(page.getByTestId("result-xp")).toContainText("+55 XP", { timeout: 15000 });
    await page.waitForTimeout(1500);
    check("G8 F5 on final B: same result, the seen achievement is NOT revealed again", await page.getByTestId("result-achievements").count() === 0 && markCalls.length === marksBefore);
    await ctx.close();
  }
  {
    // 8 players direct open after finalization · ranks 1–5 + 3 retired · own rank 2
    groupRoom("group-b8-0202", GROUP8);
    const rows = finalizeGroup("group-b8-0202", GROUP8, {
      [USERS.p4.id]: { rank: 1 }, [USERS.me.id]: { rank: 2 }, [USERS.opp.id]: { rank: 3 }, [USERS.p3.id]: { rank: 4 }, [USERS.p5.id]: { rank: 5 },
      [USERS.p6.id]: { retire: "time_limit" }, [USERS.p7.id]: { retire: "forfeited" }, [USERS.p8.id]: { retire: "disconnected_timeout" },
    });
    ledger.set(rows[USERS.me.id].id, [ledgerRow(rows[USERS.me.id].id, "group_rank_2", 55)]);
    for (const u of GROUP8) players.get("group-b8-0202").find((p) => p.user_id === u.id).nickname_snapshot = u === USERS.p8 ? "아주아주긴닉네임을가진탐험가입니다" : u.nickname;
    groupResults.get("group-b8-0202").find((r) => r.user_id === USERS.p8.id).nickname_snapshot = "아주아주긴닉네임을가진탐험가입니다";
    const { ctx, page } = await context("me", { local: groupLocal("group-b8-0202") });
    await page.goto(`${base}/multiplayer/group/game/group-b8-0202`);
    await page.getByTestId("group-final-result").waitFor({ timeout: 20000 });
    const ranks = await page.locator(".wr-standings-list .wr-srow-rank").allInnerTexts();
    check("G9 direct B: 8 rows in server order 1–5 then retired –", ranks.length === 8 && ranks.slice(0, 5).map((r) => r.replace(/\D/g, "")).join(",") === "1,2,3,4,5" && ranks.slice(5).every((r) => r.startsWith("–")));
    check("G9b counts 완주 5 · 리타이어 3; retired reasons 제한 시간 초과 / 기권 / 몰수 · 재접속 유예 종료", (await page.locator(".wr-standings-head").innerText()).includes("완주 5 · 리타이어 3") && (await page.locator(".wr-standings-list").innerText()).includes("몰수 · 재접속 유예 종료"));
    check("G9c celebration for rank 2 = dots (not full), Gold heading", await page.locator(".wr-rscene--dots").count() === 1);
    await page.mouse.move(0, 0);
    await shot(page, "group-b-desktop", true);
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 760 });
      check(`G10 8-player standings no overflow at ${w}`, await overflowFree(page));
      check(`G10b lobby action reachable at ${w} (bottom bar)`, await inViewport(page.getByRole("button", { name: "그룹 로비로" })));
    }
    await shot(page, "group-b-320", true);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "group-b-390", true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    check("G10c last standings row not covered by the fixed action bar", await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".wr-standings-list .wr-srow")];
      const last = rows[rows.length - 1].getBoundingClientRect();
      const bar = document.querySelector(".wr-ractions").getBoundingClientRect();
      return last.bottom <= bar.top + 1;
    }));
    await ctx.close();
  }
  {
    // ranks 4–8 own result: no celebration, Gold "4위 완주"; rank 1: full celebration
    groupRoom("group-r4-0203", [USERS.p4, USERS.opp, USERS.p3, USERS.me]);
    const rows = finalizeGroup("group-r4-0203", [USERS.p4, USERS.opp, USERS.p3, USERS.me], { [USERS.p4.id]: { rank: 1 }, [USERS.opp.id]: { rank: 2 }, [USERS.p3.id]: { rank: 3 }, [USERS.me.id]: { rank: 4 } });
    ledger.set(rows[USERS.me.id].id, [ledgerRow(rows[USERS.me.id].id, "group_rank_other", 35)]);
    const { ctx, page } = await context("me", { local: groupLocal("group-r4-0203") });
    await page.goto(`${base}/multiplayer/group/game/group-r4-0203`);
    await page.getByTestId("group-final-result").waitFor({ timeout: 20000 });
    await expect(page.getByTestId("result-xp")).toContainText("+35 XP", { timeout: 15000 });
    check("G11 rank 4: 4위 완주, +35 XP 그룹 완주 from ledger, no celebration", (await page.locator("#wr-group-result-title").innerText()) === "4위 완주" && (await xpText(page)).includes("그룹 완주") && await page.locator(".wr-rscene--none").count() === 1);
    await ctx.close();
    groupRoom("group-r1-0204", [USERS.me, USERS.opp, USERS.p3]);
    const rows1 = finalizeGroup("group-r1-0204", [USERS.me, USERS.opp, USERS.p3], { [USERS.me.id]: { rank: 1 }, [USERS.opp.id]: { rank: 2 }, [USERS.p3.id]: { rank: 3 } });
    ledger.set(rows1[USERS.me.id].id, [ledgerRow(rows1[USERS.me.id].id, "group_rank_1", 70)]);
    const c1 = await context("me", { local: groupLocal("group-r1-0204") });
    await c1.page.goto(`${base}/multiplayer/group/game/group-r1-0204`);
    await c1.page.getByTestId("group-final-result").waitFor({ timeout: 20000 });
    await expect(c1.page.getByTestId("result-xp")).toContainText("+70 XP", { timeout: 15000 });
    check("G12 rank 1: 1위 완주, full celebration, +70 from ledger", (await c1.page.locator("#wr-group-result-title").innerText()) === "1위 완주" && await c1.page.locator(".wr-rscene--full").count() === 1);
    await c1.page.mouse.move(0, 0);
    await shot(c1.page, "group-b-rank1-desktop");
    await c1.ctx.close();
  }
  {
    // RETIRE: hold → finalization → Result C → 최종 결과 보기 → Result B (one ResultXp mount across C → B)
    groupRoom("group-ret-0205", [USERS.me, USERS.opp, USERS.p3]);
    setPlayer("group-ret-0205", USERS.me.id, { player_status: "retired", retired_at: iso(now()) });
    const { ctx, page } = await context("me", { local: groupLocal("group-ret-0205") });
    await page.goto(`${base}/multiplayer/group/game/group-ret-0205`);
    await expect(page.locator(".wr-race-hold h1")).toHaveText("경기 종료 · 결과 집계 중", { timeout: 20000 });
    check("R1 retired before final: existing neutral hold, no spectator/XP", await page.locator(".wr-race-tabs").count() === 0 && await page.getByTestId("result-xp").count() === 0);
    const rows = finalizeGroup("group-ret-0205", [USERS.me, USERS.opp, USERS.p3], { [USERS.opp.id]: { rank: 1 }, [USERS.p3.id]: { rank: 2 }, [USERS.me.id]: { retire: "time_limit" } });
    ledger.set(rows[USERS.me.id].id, [ledgerRow(rows[USERS.me.id].id, "group_retire", 0)]);
    notify("group-ret-0205");
    await page.getByTestId("group-final-result").waitFor({ timeout: 20000 });
    check("R2 Result C: 리타이어 heading, neutral, head-down mascot, no celebration", (await page.locator("#wr-group-result-title").innerText()) === "리타이어" && await page.locator(".wr-result--retire .wr-rscene-mascot--lose").count() === 1 && await page.locator(".wr-rscene--none").count() === 1);
    check("R2b C shows reason as secondary copy + 목표 미도달", (await page.locator(".wr-rhead-detail").innerText()) === "제한 시간 초과" && (await resultRoot(page).innerText()).includes("목표 미도달"));
    const stats = await page.locator(".wr-rstats > div").allInnerTexts();
    check("R2c C stats: 순위 – · 완주 시간 – (announced 기록 없음)", stats[0].includes("순위") && stats[0].includes("–") && stats[1].includes("완주 시간") && stats[1].includes("기록 없음"));
    await expect(page.getByTestId("result-xp")).toContainText("+0 XP", { timeout: 15000 });
    check("R3 C XP: +0 from the finalized ledger (그룹 미완주)", (await xpText(page)).includes("그룹 미완주"));
    check("R3b C: no 관전하기, primary 최종 결과 보기", await page.getByRole("button", { name: "관전하기 →" }).count() === 0 && await page.getByRole("button", { name: "최종 결과 보기 →" }).isVisible());
    check("R3c retired XP gain is not Gold", await page.locator(".rxp-gain").first().evaluate((n) => getComputedStyle(n).color === "rgb(120, 135, 127)"));
    await page.mouse.move(0, 0);
    await shot(page, "group-c-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    check("R4 C no overflow at 390; primary reachable", await overflowFree(page) && await inViewport(page.getByRole("button", { name: "최종 결과 보기 →" })));
    await shot(page, "group-c-390");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const ledgerReads = restHits.filter((h) => h.includes(`xp_ledger:${rows[USERS.me.id].id}`)).length;
    await page.getByRole("button", { name: "최종 결과 보기 →" }).click();
    await page.locator(".wr-standings").waitFor();
    check("R5 C → B: standings visible, own retired row 나 with – / 리타이어", (await page.locator(".wr-srow.is-me").innerText()).includes("나") && (await page.locator(".wr-srow.is-me").innerText()).includes("리타이어") && (await page.locator(".wr-srow.is-me .wr-srow-rank").innerText()).startsWith("–"));
    check("R5b B for a retiree keeps 리타이어 heading, focus moves to it", (await page.locator("#wr-group-result-title").innerText()) === "리타이어" && (await focusedId(page)) === "wr-group-result-title");
    await page.waitForTimeout(800);
    check("R6 C → B keeps the single ResultXp instance (no second ledger read)", restHits.filter((h) => h.includes(`xp_ledger:${rows[USERS.me.id].id}`)).length === ledgerReads && await page.getByTestId("result-xp").count() === 1);
    await page.mouse.move(0, 0);
    await shot(page, "group-b-retired-desktop", true);
    await page.getByRole("button", { name: "그룹 로비로" }).click();
    await page.waitForURL(/\/multiplayer$/);
    check("R7 그룹 로비로 → existing return handler", true);
    await ctx.close();
  }

  if (consoleErrors.length) console.log(JSON.stringify(consoleErrors.slice(0, 20), null, 2));
  const unexpected = consoleErrors.filter((e) => !/recovery failed|realtime disconnected|Failed to load resource|서버 확정 결과를 불러오지 못했습니다/.test(e));
  check("GEN no unexpected console/page errors", unexpected.length === 0);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ basis: "b6b6a2c + uncommitted Phase 4 working tree", date: "2026-10-07", fixtureOnly: true, checks, consoleErrors, markCalls }, null, 2));
  console.log(`PASS ${checks.length} browser checks (isolated API/realtime fixtures; real backend not exercised)`);
} finally { await browser?.close(); server.kill(); }
