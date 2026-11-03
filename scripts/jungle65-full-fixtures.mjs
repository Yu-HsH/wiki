// Phase 4 RESULT presentation regression (Single SuccessOverlay · Duel result · Group Result A → B,
// RETIRE hold → C → B). Harness copied from ui-phase3-browser.mjs. Every Supabase / Edge / Wikipedia /
// Realtime call is answered by an in-memory fixture inside this script; no backend is reached and no
// fixture enters production code. Fixture ranks / XP / achievements are example rows shaped like the
// server's finalized output — the pages only read and render them. Real authority is not exercised.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {createServer} from "vite";
import fsSync from "node:fs";
import pathModule from "node:path";
import { chromium, expect } from "@playwright/test";

const before=process.argv.includes('--before');
const root=process.cwd();
const task=process.env.JUNGLE65_FULL_TASK||'.temp/jungle65-full-review';
const preservedRoot=pathModule.join(root,task,'preserved');
if(before&&!fsSync.existsSync(pathModule.join(preservedRoot,'pages/GroupRoomPage.jsx')))throw new Error('Preserved baseline is required for --before; current source cannot substitute it.');
const port=Number(process.env.JUNGLE65_FULL_PORT)||(before?5225:5226);
const base='http://127.0.0.1:'+port,api='http://127.0.0.1:54332';
const output=pathModule.join(task,before?'before':'after');
const server=await createServer({root,configFile:false,envFile:false,cacheDir:pathModule.join(root,task,'vite-cache-'+port),
 plugins:before?[{name:'full-review-preserved',enforce:'pre',load(id){const rel=pathModule.relative(root,id.split('?')[0]);const p=pathModule.join(preservedRoot,rel);if(!rel.startsWith('..')&&fsSync.existsSync(p)&&fsSync.statSync(p).isFile())return fsSync.readFileSync(p,'utf8')}}]:[],
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(api),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('full-review-fixture-only'),'import.meta.env.VITE_MAINTENANCE':JSON.stringify('')},server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/.temp/**']}}});
let extension=async()=>false;
const extendApi=fn=>{extension=fn};
const fontCache=new Map(),fontNetwork=[];

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
  if(await extension(route,userKey))return;
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
async function launch(){await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.JUNGLE65_BROWSER_PATH||"C:/Users/SSAFY/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe"});}
async function close(){await browser?.close();await server.close();}
async function context(userKey, { width = 1440, height = 1000, local = {}, guest = false, anonymous = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height },reducedMotion:"reduce",serviceWorkers:"block",hasTouch:width<=390 });
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || url.origin === api) return route.continue();
    if (url.hostname === "ko.wikipedia.org") return wikiRoute(route);
    if (/^(cdn.jsdelivr.net|img.cafe24.com|hangeul.pstatic.net)$/.test(url.hostname)){if(!fontCache.has(url.href))fontCache.set(url.href,(async()=>{const r=await route.fetch();const body=await r.body();fontNetwork.push({url:url.href,status:r.status(),bytes:body.length});return {status:r.status(),body,headers:{"content-type":r.headers()["content-type"],"access-control-allow-origin":"*"}}})());return route.fulfill(await fontCache.get(url.href));}
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
  }, { token: guest || anonymous ? null : `tok-${userKey}`, user: guest || anonymous ? null : { id: USERS[userKey].id, email: "x@example.invalid", user_metadata: { nickname: USERS[userKey].nickname } }, local, guest });
  ctx.setDefaultTimeout(15000);
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

export {before,base,api,output,checks,check,consoleErrors,rpcCalls,fontNetwork,USERS,START,MIDDLE,TARGET,OTHER,MANY,graph,pageId,htmlOf,linksOf,rooms,players,itemStates,events,singleRuns,ledger,unlocks,ledgerRow,achievement,duelRoom,groupRoom,finishedDuel,finalizeGroup,notify,context,shot,noOverflow,stat,json,iso,now,extendApi,launch,close};
