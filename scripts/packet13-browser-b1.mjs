import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  expectedDbContainer,
  inspectContainer,
  parseCliArgs,
  readProjectId,
  resolveCli,
  repoRoot,
  runCli,
  runDocker,
  runPsql,
  runProcess,
  safeLogText,
  wait,
  writePacket13GateMarker,
} from "./supabase-runtime-common.mjs";
import {
  evaluatePacket13LogWindow,
  evaluatePacket13RuntimeBaseline,
} from "./supabase-runtime-validation.mjs";
import {
  getPacket13B1Scenario,
  PACKET13_B1_SCENARIOS,
  validatePacket13B1ScenarioConfigs,
} from "./packet13-browser-b1-scenarios.mjs";

const EXPECTED_MIGRATION_HASHES = new Map([
  ["20260814103000_group_final_gaps_v13.sql", "78ED0615E879820078DD2E868CB9AC62836C748344661E254ABFFED6857C6B82"],
  ["20260814113000_group_final_gaps_v13_hardening.sql", "2C8CB78265607F382C2C1D4F60C09F4A43022AE15C999361D2BB9F739AC3C743"],
  ["20260814123000_group_spectator_emoji_atomicity_fix.sql", "29906B9FB4C553445676FDFDDF951365A96FB8121DF96ACF7CC92979AA7A42A6"],
]);

validatePacket13B1ScenarioConfigs();
const SCENARIO_CONFIGS = PACKET13_B1_SCENARIOS;
const SCENARIO_NAMES = SCENARIO_CONFIGS.map(({ name }) => name);

const args = parseCliArgs(process.argv.slice(2));
const port = Number(args.port || process.env.PACKET13_B1_PORT || 5174);
const baseUrl = `http://127.0.0.1:${port}`;
const projectId = readProjectId();
const container = expectedDbContainer(projectId);
const runToken = randomUUID();
const runId = `b1.3-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${runToken.slice(0, 8)}`;
const artifactDir = path.join(repoRoot, "test-results", "packet13-b1", runId);
const fixture = {
  short: runToken.replaceAll("-", "").slice(0, 10),
  pages: {},
  snapshots: {},
  dailyCandidate: null,
  dailyChallengeWasPreexisting: false,
};

const state = {
  runId,
  artifactDir,
  scenarios: [],
  contexts: [],
  realtimeEvents: [],
  realtimeExpectations: [],
  rooms: [],
  users: [],
  cleanup: {
    fixtureRemaining: null,
    accountsRemaining: null,
    contextsCreated: 0,
    contextsClosed: 0,
    viteStarted: false,
    viteStopped: false,
    functionsStarted: false,
    functionsStopped: false,
    functionsEnvRemoved: false,
    browserStarted: false,
    browserClosed: false,
    logWindowStarted: false,
    logWindowEnded: false,
    logWindow: null,
    errors: [],
  },
  dbInvariants: [],
  server: null,
  browser: null,
  apiUrl: "",
  publicKey: "",
  serviceRoleKey: "",
  adminClient: null,
  functionsServer: null,
  gateRunId: null,
  gateBaseline: null,
  wikiSnapshotInterceptHits: 0,
  unexpectedWikipediaRequests: 0,
  wikiSnapshot429Count: 0,
};

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function scalarSql(sql) {
  const result = runPsql(container, sql, { timeout: 120_000 });
  if (result.status !== 0) throw new Error(`SQL failed: ${safeLogText(result.stderr)}`);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
}

function jsonSql(sql) {
  const raw = scalarSql(sql);
  return raw ? JSON.parse(raw) : null;
}

function migrationHashCheck() {
  for (const [file, expected] of EXPECTED_MIGRATION_HASHES) {
    const target = path.join(repoRoot, "supabase", "migrations", file);
    const actual = createHash("sha256").update(fs.readFileSync(target)).digest("hex").toUpperCase();
    console.log(`MIGRATION_HASH file=${file} expected=${expected} actual=${actual}`);
    assertCondition(actual === expected, `migration hash mismatch: ${file}`);
  }
}

function readSupabaseStatus() {
  const status = runCli(["--workdir", repoRoot, "status", "-o", "env"]);
  if (status.status !== 0) throw new Error(`supabase status failed: ${safeLogText(status.stderr)}`);
  const values = {};
  for (const line of status.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  const apiUrl = values.API_URL;
  const publicKey = values.PUBLISHABLE_KEY || values.ANON_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;
  assertCondition(apiUrl && publicKey && serviceRoleKey, "supabase status did not provide local API/public/admin credentials");
  return { apiUrl, publicKey, serviceRoleKey };
}

function runRuntimePreflight() {
  const result = runProcess(process.execPath, [
    path.join(repoRoot, "scripts", "supabase-runtime-preflight.mjs"),
    "--container", container,
    "--defer-log-check",
  ], { cwd: repoRoot, timeout: 120_000 });
  console.log(`B1_RUNTIME_PREFLIGHT exit_code=${result.status}`);
  if (result.status !== 0) {
    throw new Error(`approved .158 runtime preflight failed: ${safeLogText(result.stderr || result.stdout)}`);
  }
}

function createViteServer(env) {
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`]
    : ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  child.on("error", (error) => { output += `\n${error.message}`; });
  state.server = { child, output: () => output, pid: child.pid };
  state.cleanup.viteStarted = true;
  return child;
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch (error) {
      lastError = error.message;
    }
    await wait(250);
  }
  throw new Error(`Vite did not become ready: ${lastError}`);
}

async function waitForPath(page, predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate(new URL(page.url()))) return;
    await wait(250);
  }
  throw new Error(`page path timeout: ${page.url()}`);
}

function stopViteServer() {
  const server = state.server;
  if (!server?.child || state.cleanup.viteStopped) return;
  if (server.child.exitCode == null) {
    if (process.platform === "win32") {
      const result = runProcess("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { timeout: 30_000 });
      if (result.status !== 0 && !/not found|no running instance/i.test(result.stderr)) {
        state.cleanup.errors.push(`vite cleanup failed: ${safeLogText(result.stderr)}`);
      }
    } else {
      server.child.kill("SIGTERM");
    }
  }
  state.cleanup.viteStopped = true;
}

function startFunctionsServer() {
  const envFile = path.join(os.tmpdir(), `packet13-b1-${runToken}.env`);
  const envText = [
    `SUPABASE_URL=${state.apiUrl}`,
    `SUPABASE_ANON_KEY=${state.publicKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${state.serviceRoleKey}`,
    "",
  ].join("\n");
  fs.writeFileSync(envFile, envText, { encoding: "utf8", mode: 0o600 });
  state.functionsServer = { envFile, child: null, pid: null };
  try {
    const child = spawn(process.execPath, [
      resolveCli(),
      "--workdir", repoRoot,
      "functions", "serve",
      "--no-verify-jwt",
      "--env-file", envFile,
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        SUPABASE_TELEMETRY_DISABLED: "1",
        SUPABASE_HOME: process.env.SUPABASE_HOME || path.join(os.tmpdir(), "wiki-packet13-r2-clean158-supabase-cli"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk).slice(-4000); });
    child.stderr.on("data", (chunk) => { output += String(chunk).slice(-4000); });
    child.on("error", (error) => { output += ` ${error.message}`; });
    state.functionsServer.child = child;
    state.functionsServer.pid = child.pid;
    state.functionsServer.output = () => output;
    state.cleanup.functionsStarted = true;
  } catch (error) {
    try { fs.rmSync(envFile, { force: true }); } catch { /* cleanup is best effort */ }
    state.cleanup.functionsEnvRemoved = !fs.existsSync(envFile);
    throw error;
  }
}

async function waitForFunctionsServer(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.functionsServer?.child?.exitCode != null) break;
    try {
      const response = await fetch(`${state.apiUrl}/functions/v1/username-lookup`, { method: "OPTIONS" });
      if (response.status < 500) return;
    } catch {
      // The local gateway can take a few seconds to start its Deno workers.
    }
    await wait(500);
  }
  throw new Error("local Supabase Edge Functions server did not become ready for username-lookup");
}

function stopFunctionsServer() {
  const server = state.functionsServer;
  if (server?.child && !state.cleanup.functionsStopped && server.child.exitCode == null) {
    if (process.platform === "win32") {
      const result = runProcess("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { timeout: 30_000 });
      if (result.status !== 0 && !/not found|no running instance/i.test(result.stderr)) {
        state.cleanup.errors.push(`functions cleanup failed: ${safeLogText(result.stderr)}`);
      }
    } else {
      server.child.kill("SIGTERM");
    }
  }
  if (server?.child) state.cleanup.functionsStopped = true;
  if (server?.envFile) {
    try { fs.rmSync(server.envFile, { force: true }); } catch (error) { state.cleanup.errors.push(`functions env cleanup: ${error.message}`); }
    state.cleanup.functionsEnvRemoved = !fs.existsSync(server.envFile);
  }
}

function normalizeFixtureTitle(value) {
  return String(value ?? "").trim().replaceAll("_", " ").replace(/\s+/g, " ");
}

function fixtureTitleKey(value) {
  return normalizeFixtureTitle(value).toLocaleLowerCase("ko-KR");
}

function fixtureBodyLinks(html) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] || "";
    if (!href.startsWith("/wiki/") || href.includes("?")) continue;
    let raw = href.slice("/wiki/".length).split("#", 1)[0];
    try { raw = decodeURIComponent(raw); } catch { /* retain encoded title */ }
    const title = normalizeFixtureTitle(raw);
    if (title) links.push({ title });
  }
  return links;
}

function pageFixtureData() {
  const startTitle = `P13B1 ${fixture.short} Start`;
  const middleTitle = `P13B1 ${fixture.short} Target`;
  const startPageId = `p13b1_${fixture.short}_start`;
  const middlePageId = `p13b1_${fixture.short}_target`;
  const startRevisionId = `p13b1_${fixture.short}_rev_start`;
  const middleRevisionId = `p13b1_${fixture.short}_rev_target`;
  fixture.pages = {
    start: {
      pageId: startPageId,
      revisionId: startRevisionId,
      title: startTitle,
      extract: `${startTitle} deterministic Packet 13 B1 fixture`,
      html: `<p>${startTitle}</p><p><a href="/wiki/${encodeURIComponent(middleTitle).replaceAll("%20", "_")}">${middleTitle}</a></p>`,
    },
    middle: {
      pageId: middlePageId,
      revisionId: middleRevisionId,
      title: middleTitle,
      extract: `${middleTitle} deterministic Packet 13 B1 fixture`,
      html: `<p>${middleTitle}</p><p><a href="/wiki/${encodeURIComponent(startTitle).replaceAll("%20", "_")}">${startTitle}</a></p>`,
    },
  };
  fixture.snapshots = {
    start: randomUUID(),
    middle: randomUUID(),
  };
  fixture.dailyCandidate = {
    sortOrder: -1_000_000_000 - Number.parseInt(fixture.short.slice(0, 7), 16),
    startTitle,
    targetTitle: middleTitle,
    hint: "Packet 13 B1 deterministic browser fixture",
  };
  const pages = Object.values(fixture.pages);
  for (const source of pages) {
    const sourceLinks = new Set(fixtureBodyLinks(source.html).map((link) => fixtureTitleKey(link.title)));
    for (const target of pages) {
      if (source === target) continue;
      assertCondition(sourceLinks.has(fixtureTitleKey(target.title)), `deterministic fixture graph is not pairwise: ${source.title} -> ${target.title}`);
    }
  }
}

async function createFixture() {
  pageFixtureData();
  const pageIds = Object.values(fixture.pages).map((page) => sqlQuote(page.pageId)).join(",");
  const existing = Number(scalarSql(`select count(*) from public.wiki_pages where page_id in (${pageIds});`));
  assertCondition(existing === 0, "real Wikipedia fixture page IDs already exist in local cache; refusing to delete pre-existing cache rows");
  const rows = Object.values(fixture.pages).map((page, index) => `(${sqlQuote(page.pageId)},${sqlQuote(page.title)})`).join(",");
  const snapshots = Object.entries(fixture.pages).map(([key, page]) => `(${sqlQuote(fixture.snapshots[key])},${sqlQuote(page.pageId)},${sqlQuote(page.revisionId)},${sqlQuote(page.title)})`).join(",");
  const links = [];
  for (const [sourceKey, source] of Object.entries(fixture.pages)) {
    for (const [targetKey, target] of Object.entries(fixture.pages)) {
      if (sourceKey === targetKey) continue;
      links.push(`(${sqlQuote(fixture.snapshots[sourceKey])},${sqlQuote(target.pageId)},${sqlQuote(target.revisionId)},${sqlQuote(target.title)},${sqlQuote(target.title)},${links.length})`);
    }
  }
  const daily = fixture.dailyCandidate;
  const sql = `begin;
insert into public.wiki_pages(page_id, canonical_title) values ${rows};
insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot) values ${snapshots};
insert into public.wiki_snapshot_links(snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal) values ${links.join(",")};
insert into public.daily_challenge_pool(sort_order, start_title, target_title, hint, is_active)
values (${daily.sortOrder}, ${sqlQuote(daily.startTitle)}, ${sqlQuote(daily.targetTitle)}, ${sqlQuote(daily.hint)}, true);
commit;`;
  const result = runPsql(container, sql, { timeout: 120_000 });
  if (result.status !== 0) throw new Error(`fixture creation failed: ${safeLogText(result.stderr)}`);
}

function verifyFixture() {
  const pageIds = Object.values(fixture.pages).map((page) => sqlQuote(page.pageId)).join(",");
  const snapshotIds = Object.values(fixture.snapshots).map((snapshotId) => sqlQuote(snapshotId)).join(",");
  const daily = fixture.dailyCandidate;
  const identity = jsonSql(`select json_build_object(
    'pages',(select count(*) from public.wiki_pages where page_id in (${pageIds})),
    'snapshots',(select count(*) from public.wiki_page_snapshots where id in (${snapshotIds})),
    'links',(select count(*) from public.wiki_snapshot_links where snapshot_id in (${snapshotIds})),
    'daily_candidates',(select count(*) from public.daily_challenge_pool where sort_order=${daily.sortOrder} and is_active=true),
    'daily_title_matches',(select count(*) from public.daily_challenge_pool where sort_order=${daily.sortOrder} and start_title=${sqlQuote(daily.startTitle)} and target_title=${sqlQuote(daily.targetTitle)})
  );`);
  assertCondition(identity?.pages === 2, `fixture identity pages=${identity?.pages}`);
  assertCondition(identity?.snapshots === 2, `fixture identity snapshots=${identity?.snapshots}`);
  assertCondition(identity?.links === 2, `fixture identity links=${identity?.links}`);
  assertCondition(identity?.daily_candidates === 1 && identity?.daily_title_matches === 1, `fixture identity daily=${JSON.stringify(identity)}`);
  console.log(`B1_FIXTURE_READY pages=${identity.pages} snapshots=${identity.snapshots} links=${identity.links} daily_candidates=${identity.daily_candidates}`);
}

function fixturePageById(pageId) {
  return Object.values(fixture.pages).find((page) => page.pageId === pageId) || null;
}

function hasFixtureTitle(text) {
  return Object.values(fixture.pages).some((page) => text.includes(page.title));
}

async function cleanupFixtureAndAccounts() {
  const errors = [];
  const daily = fixture.dailyCandidate;
  if (daily) {
    try {
      const result = runPsql(container, `delete from public.daily_challenges where target_title=${sqlQuote(daily.targetTitle)} and start_title=${sqlQuote(daily.startTitle)};\ndelete from public.daily_challenge_pool where sort_order=${daily.sortOrder} and start_title=${sqlQuote(daily.startTitle)} and target_title=${sqlQuote(daily.targetTitle)};`, { timeout: 120_000 });
      if (result.status !== 0) errors.push(`daily fixture cleanup: ${safeLogText(result.stderr)}`);
    } catch (error) {
      errors.push(`daily fixture cleanup: ${error.message}`);
    }
  }
  try {
    const pageIds = Object.values(fixture.pages).map((page) => sqlQuote(page.pageId)).join(",");
    if (pageIds) {
      const result = runPsql(container, `delete from public.wiki_pages where page_id in (${pageIds});`, { timeout: 120_000 });
      if (result.status !== 0) errors.push(`fixture cleanup: ${safeLogText(result.stderr)}`);
    }
  } catch (error) {
    errors.push(`fixture cleanup: ${error.message}`);
  }

  try {
    const roomIds = state.rooms.map((roomId) => sqlQuote(roomId)).join(",");
    if (roomIds) {
      const result = runPsql(container, `delete from public.game_rooms where id in (${roomIds});`, { timeout: 120_000 });
      if (result.status !== 0) errors.push(`room cleanup: ${safeLogText(result.stderr)}`);
    }
  } catch (error) {
    errors.push(`room cleanup: ${error.message}`);
  }

  if (state.adminClient) {
    for (const user of state.users) {
      const { error } = await state.adminClient.auth.admin.deleteUser(user.id);
      if (error && !/not found/i.test(error.message)) errors.push(`account cleanup ${user.alias}: ${error.message}`);
    }
  }

  try {
    const fixturePageIds = Object.values(fixture.pages).map((page) => sqlQuote(page.pageId)).join(",");
    const remaining = fixturePageIds && daily
      ? jsonSql(`select json_build_object(
        'pages',(select count(*) from public.wiki_pages where page_id in (${fixturePageIds})),
        'snapshots',(select count(*) from public.wiki_page_snapshots where page_id in (${fixturePageIds})),
        'links',(select count(*) from public.wiki_snapshot_links where target_page_id in (${fixturePageIds})),
        'daily_candidates',(select count(*) from public.daily_challenge_pool where sort_order=${daily.sortOrder}),
        'daily_challenges',(select count(*) from public.daily_challenges where start_title=${sqlQuote(daily.startTitle)} and target_title=${sqlQuote(daily.targetTitle)})
      );`)
      : {};
    state.cleanup.fixtureDetails = remaining;
    state.cleanup.fixtureRemaining = Object.values(remaining || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    state.cleanup.accountsRemaining = Number(scalarSql(`select count(*) from auth.users where email like ${sqlQuote(`p13b1_${fixture.short}_%@local.test`)};`));
  } catch (error) {
    errors.push(`cleanup invariant: ${error.message}`);
  }
  state.cleanup.errors.push(...errors);
  if (errors.length) throw new Error(errors.join("; "));
}

async function createUsers() {
  const users = [];
  state.users = users;
  for (let index = 1; index <= 9; index += 1) {
    const alias = `p13b1_${fixture.short}_${index}`;
    const nickname = `B1.3 User ${index}`;
    const email = `${alias}@local.test`;
    const password = `Packet13-B1.3-${fixture.short}-${index}!`;
    const { data, error } = await state.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: alias, nickname },
    });
    if (error || !data.user?.id) throw new Error(`account setup failed: ${error?.message || alias}`);
    const user = { alias, nickname, email, password, id: data.user.id, client: null };
    users.push(user);
  }
  const values = users.map((user) => `(${sqlQuote(user.id)},${sqlQuote(user.alias)},${sqlQuote(user.nickname)},${sqlQuote(user.email)})`).join(",");
  const result = runPsql(container, `insert into public.profiles(id, username, nickname, synthetic_email) values ${values};`, { timeout: 120_000 });
  if (result.status !== 0) throw new Error(`profile setup failed: ${safeLogText(result.stderr)}`);
  for (const user of users) {
    const client = createClient(state.apiUrl, state.publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signedIn = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    if (signedIn.error || !signedIn.data.session) throw new Error(`direct authenticated setup failed: ${user.alias}`);
    user.client = createClient(state.apiUrl, state.publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } },
    });
  }
}

function parseRealtimeFrame(data) {
  const text = data && typeof data === "object" && typeof data.payload === "string"
    ? data.payload
    : Buffer.isBuffer(data)
    ? data.toString("utf8")
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString("utf8")
      : ArrayBuffer.isView(data)
      ? Buffer.from(data).toString("utf8")
      : typeof data === "object" && data !== null
        ? JSON.stringify(data)
      : String(data ?? "");
  try {
    const frame = JSON.parse(text);
    if (Array.isArray(frame)) {
      const payload = frame[4] || {};
      const response = payload.response || payload;
      const change = payload.data || payload;
      const table = change.table || "";
      const record = change.record || response.record || response.data?.record || {};
      return {
        joinRef: frame[0] || (frame[3] === "phx_join" ? frame[1] : ""),
        ref: frame[1] || "",
        topic: frame[2] || "",
        event: frame[3] || "",
        status: response.status || payload.status || "",
        table,
        postgresEventId: realtimePostgresEventId(table, record),
      };
    }
    if (frame && typeof frame === "object") {
      const payload = frame.payload || {};
      const response = payload.response || {};
      const change = payload.data || payload;
      const table = change.table || "";
      const record = change.record || response.record || response.data?.record || {};
      return {
        joinRef: frame.join_ref || frame.joinRef || frame.ref || "",
        ref: frame.ref || "",
        topic: frame.topic || "",
        event: frame.event || "",
        status: payload.status || response.status || "",
        table,
        postgresEventId: realtimePostgresEventId(table, record),
      };
    }
  } catch {
    // Realtime frames can be encoded as non-JSON heartbeat data; retain metadata only.
  }
  return {
    joinRef: text.match(/"join_ref"\s*:\s*"([^"]+)/)?.[1] || "",
    ref: text.match(/"ref"\s*:\s*"([^"]+)/)?.[1] || "",
    topic: text.match(/"topic"\s*:\s*"([^"]+)/)?.[1] || "",
    event: text.match(/"event"\s*:\s*"([^"]+)/)?.[1] || "",
    status: text.match(/"status"\s*:\s*"([^"]+)/)?.[1] || "",
    table: text.match(/"table"\s*:\s*"([^"]+)/)?.[1] || "",
    postgresEventId: text.match(/"id"\s*:\s*"([0-9a-f-]{36})"/i)?.[1] || "",
  };
}

function realtimePostgresEventId(table, record) {
  if (!record || typeof record !== "object") return "";
  if (table === "room_events" && record.id) return String(record.id);
  if (table === "game_rooms" && record.id && record.state_version != null) {
    return `${table}:${record.id}:${record.state_version}`;
  }
  if (table === "room_players" && record.id && record.progress_version != null) {
    return `${table}:${record.id}:${record.progress_version}`;
  }
  return "";
}

function sanitizedWsUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid-ws-url>";
  }
}

function sanitizedDiagnostic(value) {
  return String(value ?? "")
    .replaceAll(/([?&](?:apikey|access_token|token)=)[^&\s]+/gi, "$1<redacted>")
    .slice(0, 500);
}

function wirePage(page, record) {
  page.on("pageerror", (error) => {
    record.pageErrors.push(sanitizedDiagnostic(error.message));
  });
  page.on("console", (message) => {
    if (message.type() === "error") record.consoleErrors.push(sanitizedDiagnostic(message.text()));
  });
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/rest/v1/rpc/")) {
      const rpc = url.split("/rest/v1/rpc/")[1]?.split("?")[0] || "unknown";
      record.rpcCalls.push({ rpc, method: request.method(), at: new Date().toISOString() });
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/functions/v1/wiki-snapshot") && response.status() === 429) {
      state.wikiSnapshot429Count += 1;
      record.wikiSnapshot429Count = (record.wikiSnapshot429Count || 0) + 1;
    }
    if (response.status() >= 500) record.criticalResponses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  page.on("websocket", (websocket) => {
    const socket = {
      socketId: `${record.contextId}-ws-${record.sockets.length + 1}`,
      url: sanitizedWsUrl(websocket.url()),
      openedAt: new Date().toISOString(),
      closedAt: null,
    };
    record.sockets.push(socket);
    websocket.on("framesent", (data) => recordRealtime(record, socket, "sent", data));
    websocket.on("framereceived", (data) => recordRealtime(record, socket, "received", data));
    websocket.on("socketerror", (error) => {
      state.realtimeEvents.push({
        contextId: record.contextId,
        userAlias: record.userAlias,
        socketId: socket.socketId,
        direction: "error",
        at: new Date().toISOString(),
        url: socket.url,
        error: sanitizedDiagnostic(error),
      });
    });
    websocket.on("close", () => {
      socket.closedAt = new Date().toISOString();
      state.realtimeEvents.push({ contextId: record.contextId, socketId: socket.socketId, direction: "close", at: socket.closedAt, url: socket.url });
    });
  });
}

function recordRealtime(record, socket, direction, data) {
  const frame = parseRealtimeFrame(data);
  if (!frame.topic && !frame.event) {
    record.frameParseMisses = (record.frameParseMisses || 0) + 1;
    return;
  }
  const now = new Date().toISOString();
  if (direction === "sent" && frame.event === "phx_join") {
    socket.joinRef = frame.joinRef || frame.ref || "";
    socket.joinTopic = frame.topic;
    socket.joinSentAt = now;
  }
  if (direction === "received" && frame.event === "phx_reply" && frame.status === "ok") {
    const isJoinReply = !socket.joinRef || !frame.ref || frame.ref === socket.joinRef || frame.joinRef === socket.joinRef;
    if (isJoinReply && !socket.joinAckStatus) {
      socket.joinAckStatus = "ok";
      socket.joinedAt = now;
    }
  }
  state.realtimeEvents.push({
    contextId: record.contextId,
    authAlias: record.authAlias,
    scenario: record.scenario,
    socketId: socket.socketId,
    direction,
    at: now,
    topic: frame.topic,
    event: frame.event,
    status: frame.status,
    joinRef: socket.joinRef || frame.joinRef || "",
    joinAckStatus: socket.joinAckStatus || "",
    joinedAt: socket.joinedAt || null,
    postgresEventId: frame.postgresEventId || "",
    table: frame.table || "",
    frameReceivedAt: direction === "received" ? now : null,
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageByIdentity(body) {
  return Object.values(fixture.pages).find((page) =>
    (body?.pageId != null && String(body.pageId) === page.pageId)
    || (body?.revisionId != null && String(body.revisionId) === page.revisionId)
    || (body?.title && fixtureTitleKey(body.title) === fixtureTitleKey(page.title))
  ) || null;
}

async function installWikiSnapshotIntercept(context, record) {
  const functionOrigin = new URL(state.apiUrl).origin;
  const snapshotPattern = new RegExp(`^${escapeRegExp(functionOrigin)}/functions/v1/wiki-snapshot(?:\\?.*)?$`);
  const wikipediaPattern = /^https:\/\/ko\.wikipedia\.org\/(?:[^?]*)(?:\?.*)?$/i;
  const wikipediaApiPattern = /^https:\/\/ko\.wikipedia\.org\/w\/api\.php(?:\?.*)?$/i;
  const wikipediaSummaryPattern = /^https:\/\/ko\.wikipedia\.org\/api\/rest_v1\/page\/summary\/[^?]+(?:\?.*)?$/i;

  await context.route(snapshotPattern, async (route) => {
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      record.wikiSnapshotContractErrors = (record.wikiSnapshotContractErrors || 0) + 1;
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "INVALID_FIXTURE_REQUEST" }) });
      return;
    }
    const page = pageByIdentity(body);
    const identityMatches = page
      && (!body.pageId || String(body.pageId) === page.pageId)
      && (!body.revisionId || String(body.revisionId) === page.revisionId);
    if (!identityMatches) {
      record.wikiSnapshotContractErrors = (record.wikiSnapshotContractErrors || 0) + 1;
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "WIKI_SNAPSHOT_IDENTITY_MISMATCH" }) });
      return;
    }
    const pageKey = Object.entries(fixture.pages).find(([, value]) => value === page)?.[0];
    const links = Object.values(fixture.pages)
      .filter((candidate) => candidate.pageId !== page.pageId)
      .map((candidate) => ({ pageId: candidate.pageId, title: candidate.title, linkText: candidate.title }));
    state.wikiSnapshotInterceptHits += 1;
    record.wikiSnapshotInterceptHits = (record.wikiSnapshotInterceptHits || 0) + 1;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({
        snapshotId: fixture.snapshots[pageKey],
        pageId: page.pageId,
        revisionId: page.revisionId,
        canonicalTitle: page.title,
        documentHtml: page.html,
        links,
      }),
    });
  });

  await context.route(wikipediaPattern, async (route) => {
    state.unexpectedWikipediaRequests += 1;
    record.unexpectedWikipediaRequests = (record.unexpectedWikipediaRequests || 0) + 1;
    await route.abort("blockedbyclient");
  });

  const fulfillWikipediaFixture = async (route) => {
    const url = new URL(route.request().url());
    const params = url.searchParams;
    const requestedTitle = params.get("page") || params.get("titles") || params.get("srsearch") || "";
    const page = Object.values(fixture.pages).find((candidate) => fixtureTitleKey(candidate.title) === fixtureTitleKey(requestedTitle)) || fixture.pages.start;
    record.wikipediaFixtureInterceptHits = (record.wikipediaFixtureInterceptHits || 0) + 1;
    if (url.pathname === "/w/api.php" && params.get("list") === "search") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ query: { search: Object.values(fixture.pages).map((item) => ({ title: item.title, snippet: item.extract, pageid: Number.NaN })) } }),
      });
      return;
    }
    if (url.pathname === "/w/api.php" && params.get("prop") === "links") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ query: { pages: { [page.pageId]: {
          pageid: page.pageId,
          title: page.title,
          links: Object.values(fixture.pages).filter((item) => item.pageId !== page.pageId).map((item) => ({ ns: 0, title: item.title })),
        } } } }),
      });
      return;
    }
    if (url.pathname === "/w/api.php" && params.get("action") === "parse") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ parse: { pageid: page.pageId, title: page.title, revid: page.revisionId, text: { "*": page.html } } }),
      });
      return;
    }
    if (url.pathname.startsWith("/api/rest_v1/page/summary/")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ title: page.title, pageid: page.pageId, revision: page.revisionId, extract: page.extract }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "fixture route not found" }) });
  };

  await context.route(wikipediaApiPattern, fulfillWikipediaFixture);
  await context.route(wikipediaSummaryPattern, fulfillWikipediaFixture);
}

async function createActor(user, scenarioName) {
  const contextId = `b1.3-${scenarioName}-${user.alias}-${randomUUID().slice(0, 8)}`;
  const context = await state.browser.newContext({
    viewport: { width: 1365, height: 900 },
    serviceWorkers: "block",
  });
  const record = {
    contextId,
    userAlias: user.alias,
    authAlias: user.alias,
    authUserIdHash: createHash("sha256").update(user.id).digest("hex"),
    storageFingerprint: null,
    scenario: scenarioName,
    createdAt: new Date().toISOString(),
    closedAt: null,
    closeStatus: null,
    realtimeRequired: false,
    pageErrors: [],
    consoleErrors: [],
    criticalResponses: [],
    rpcCalls: [],
    sockets: [],
    networkConditions: [],
  };
  state.contexts.push(record);
  state.cleanup.contextsCreated += 1;
  await installWikiSnapshotIntercept(context, record);
  const page = await context.newPage();
  wirePage(page, record);
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[placeholder="사용할 아이디"]').fill(user.alias);
    await page.locator('input[placeholder="6자 이상"]').fill(user.password);
    await page.locator('form button[type="submit"]').click();
    await waitForPath(page, (url) => url.pathname === "/lobby", 30_000);
    const storageState = await context.storageState();
    record.storageFingerprint = createHash("sha256").update(JSON.stringify(storageState)).digest("hex");
    return { user, context, page, record };
  } catch (error) {
    try {
      await context.close();
      record.closedAt = new Date().toISOString();
      record.closeStatus = "closed_after_setup_error";
      state.cleanup.contextsClosed += 1;
    } catch (closeError) {
      record.closeStatus = "close_error_after_setup_error";
      state.cleanup.errors.push(`context setup cleanup ${record.contextId}: ${closeError.message}`);
    }
    throw error;
  }
}

async function closeActors(actors) {
  for (const actor of actors) {
    if (actor.record.closedAt) continue;
    try {
      await actor.context.close();
      actor.record.closedAt = new Date().toISOString();
      actor.record.closeStatus = "closed";
      state.cleanup.contextsClosed += 1;
    } catch (error) {
      actor.record.closeStatus = "close_error";
      state.cleanup.errors.push(`context cleanup ${actor.record.contextId}: ${error.message}`);
    }
  }
}

async function withSlow3G(actor, callback) {
  const cdp = await actor.context.newCDPSession(actor.page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: 62500,
    uploadThroughput: 50000,
    connectionType: "cellular3g",
  });
  actor.record.networkConditions.push({ profile: "Slow3G", appliedAt: new Date().toISOString(), cdp: true });
  try {
    return await callback();
  } finally {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: "none",
    });
    actor.record.networkConditions.push({ profile: "online", restoredAt: new Date().toISOString(), cdp: true });
    await cdp.detach().catch(() => {});
  }
}

async function clickGroupMode(page) {
  await page.locator(".mp-mode-card").filter({ hasText: "단체모드" }).click();
}

async function createRoomUi(actor) {
  await actor.page.goto(`${baseUrl}/multiplayer`, { waitUntil: "domcontentloaded" });
  await clickGroupMode(actor.page);
  await actor.page.locator(".mp-mode-panel").getByRole("button", { name: "방 생성", exact: true }).click();
  await actor.page.waitForURL((url) => /\/multiplayer\/group\/room\//.test(url.pathname), { timeout: 20_000 });
  const roomId = actor.page.url().split("/").at(-1);
  return roomId;
}

async function createRoomApi(actor, maxPlayers) {
  const { data, error } = await actor.user.client.rpc("create_group_room", {
    p_max_players: maxPlayers,
    p_min_players: 3,
    p_finish_rank_limit: 3,
  });
  if (error || !data) throw new Error(`create_group_room failed: ${error?.message || "empty"}`);
  const room = Array.isArray(data) ? data[0] : data;
  return room.id;
}

async function roomCode(roomId) {
  return scalarSql(`select room_code from public.game_rooms where id=${sqlQuote(roomId)};`);
}

async function joinRoomUi(actor, code) {
  await actor.page.goto(`${baseUrl}/multiplayer`, { waitUntil: "domcontentloaded" });
  await clickGroupMode(actor.page);
  const panel = actor.page.locator(".mp-mode-panel");
  await panel.locator('input[placeholder="ROOM CODE"]').fill(code);
  await panel.getByRole("button", { name: "참가", exact: true }).click();
  await actor.page.waitForURL((url) => /\/multiplayer\/group\/room\//.test(url.pathname), { timeout: 20_000 });
}

async function joinRoom(actor, roomId, { host = false, maxPlayers = 6 } = {}) {
  if (host) {
    const uiRoomId = maxPlayers <= 6 ? await createRoomUi(actor) : await createRoomApi(actor, maxPlayers);
    assertCondition(uiRoomId === roomId || !roomId, "host room id mismatch");
    if (maxPlayers > 6) await actor.page.goto(`${baseUrl}/multiplayer/group/room/${roomId}`, { waitUntil: "domcontentloaded" });
    return uiRoomId || roomId;
  }
  await joinRoomUi(actor, await roomCode(roomId));
  return roomId;
}

async function waitForRoomPlayers(roomId, expected, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = Number(scalarSql(`select count(*) from public.room_players where room_id=${sqlQuote(roomId)};`));
    if (count === expected) return;
    await wait(250);
  }
  throw new Error(`room player count did not reach ${expected}`);
}

async function directRpc(user, name, params) {
  const { data, error } = await user.client.rpc(name, params);
  if (error) throw new Error(`${name} ${error.code || "RPC_ERROR"}: ${error.message}`);
  return Array.isArray(data) ? data[0] : data;
}

async function expectRpcError(user, name, params, expectedCode) {
  const { error } = await user.client.rpc(name, params);
  assertCondition(error, `${name} unexpectedly succeeded`);
  assertCondition(String(error.message).includes(expectedCode) || error.code === expectedCode, `${name} expected ${expectedCode}, got ${error.message}`);
  return error;
}

async function prepareRoom(roomId, actors) {
  const targetKeys = ["start", "middle"];
  await Promise.all(actors.map(async (actor, index) => {
    const page = fixture.pages[targetKeys[index % targetKeys.length]];
    await directRpc(actor.user, "submit_group_target_v2", {
      p_room_id: roomId,
      p_submitted_keyword: page.title,
      p_submitted_target_title: page.title,
      p_submitted_target_page_id: page.pageId,
      p_submitted_target_revision_id: page.revisionId,
    });
    await directRpc(actor.user, "set_group_ready", { p_room_id: roomId, p_is_ready: true });
  }));
  await waitForRoomPlayers(roomId, actors.length);
  const ready = Number(scalarSql(`select count(*) from public.room_players where room_id=${sqlQuote(roomId)} and is_ready=true;`));
  assertCondition(ready === actors.length, `ready count mismatch: ${ready}/${actors.length}`);
}

async function roomRow(roomId) {
  return jsonSql(`select row_to_json(t) from (select id, status, host_user_id, max_players, min_players, state_version, group_start_page_id, group_target_page_id, group_start_title, group_target_title from public.game_rooms where id=${sqlQuote(roomId)}) t;`);
}

async function playerRow(roomId, userId) {
  return jsonSql(`select row_to_json(t) from (select id, user_id, role, player_status, is_ready, has_finished, current_page_id, current_revision_id, current_title, move_count, progress_version, rank from public.room_players where room_id=${sqlQuote(roomId)} and user_id=${sqlQuote(userId)}) t;`);
}

async function roomCounts(roomId) {
  return jsonSql(`select json_build_object(
    'room_players',(select count(*) from public.room_players where room_id=${sqlQuote(roomId)}),
    'room_events',(select count(*) from public.room_events where room_id=${sqlQuote(roomId)}),
    'move_events',(select count(*) from public.game_move_events where game_id=${sqlQuote(roomId)}),
    'results',(select count(*) from public.group_match_results where room_id=${sqlQuote(roomId)}),
    'emoji_events',(select count(*) from public.room_events where room_id=${sqlQuote(roomId)} and event_type='group_spectator_emoji'),
    'emoji_rate_rows',(select count(*) from public.group_spectator_emoji_rate_limits where room_id=${sqlQuote(roomId)}),
    'grace_events',(select count(*) from public.room_events where room_id=${sqlQuote(roomId)} and event_type='grace_started'),
    'game_end_events',(select count(*) from public.room_events where room_id=${sqlQuote(roomId)} and event_type='game_end')
  );`);
}

async function startAndActivate(roomId, actors, { viaUi = true } = {}) {
  if (viaUi) {
    const startButton = actors[0].page.locator("button").filter({ hasText: "게임 시작" });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !(await startButton.isEnabled().catch(() => false))) await wait(250);
    assertCondition(await startButton.isEnabled(), "host start button was not enabled");
    await startButton.click();
  } else {
    await directRpc(actors[0].user, "start_group_room_game_v2", { p_room_id: roomId });
  }
  const startingDeadline = Date.now() + 20_000;
  while (Date.now() < startingDeadline) {
    const row = await roomRow(roomId);
    if (row?.status === "starting") break;
    await wait(250);
  }
  const row = await roomRow(roomId);
  if (row?.status === "starting") {
    try {
      await directRpc(actors[0].user, "activate_group_room_game", { p_room_id: roomId });
    } catch (error) {
      if (!/GROUP_NOT_STARTING|already|playing/i.test(error.message)) throw error;
    }
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const current = await roomRow(roomId);
    if (["playing", "grace_period"].includes(current?.status)) break;
    await wait(250);
  }
  const active = await roomRow(roomId);
  assertCondition(["playing", "grace_period"].includes(active?.status), `room did not activate: ${active?.status}`);
  for (const actor of actors) {
    await actor.page.goto(`${baseUrl}/multiplayer/group/game/${roomId}`, { waitUntil: "domcontentloaded" });
  }
  await wait(1_500);
  return active;
}

async function moveToRoomTarget(roomId, actor) {
  const row = await roomRow(roomId);
  const target = fixturePageById(row.group_target_page_id);
  assertCondition(target, `unknown target page ${row.group_target_page_id}`);
  const player = await playerRow(roomId, actor.user.id);
  return directRpc(actor.user, "apply_group_move_v2", {
    p_room_id: roomId,
    p_request_id: randomUUID(),
    p_correlation_id: randomUUID(),
    p_expected_version: player.progress_version,
    p_to_page_id: target.pageId,
    p_to_revision_id: target.revisionId,
    p_to_title_snapshot: target.title,
    p_clicked_raw_title: target.title,
    p_event_type: "NORMAL_LINK",
  });
}

async function waitBody(page, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
    if (predicate(last)) return last;
    await wait(250);
  }
  throw new Error(`page state timeout: ${last.slice(0, 240)}`);
}

async function waitForLocatorCount(locator, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  while (Date.now() < deadline) {
    count = await locator.count().catch(() => 0);
    if (predicate(count)) return count;
    await wait(250);
  }
  throw new Error(`locator count timeout: ${count}`);
}

async function enterSpectatorView(actor, roomId) {
  await actor.page.goto(`${baseUrl}/multiplayer/group/game/${roomId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitBody(actor.page, (body) => body.includes("FINISHED") || body.includes("다른 참가자 관전 중"));
  const spectatorButton = actor.page.getByRole("button", { name: "다른 참가자 관전하기", exact: true });
  if (await spectatorButton.isVisible().catch(() => false)) {
    await spectatorButton.click();
  }
  await waitBody(actor.page, (body) => body.includes("다른 참가자 관전 중"));
}

function recordReflection(actor, evidence) {
  actor.record.uiReflections ||= [];
  actor.record.uiReflections.push({ at: new Date().toISOString(), evidence });
}

function realtimeJoinAckCount(record) {
  return record.sockets.filter((socket) => socket.joinAckStatus === "ok").length;
}

function markRealtimeRequired(actors) {
  for (const actor of actors) actor.record.realtimeRequired = true;
}

function expectedRealtimeEventId(table, row) {
  return realtimePostgresEventId(table, row);
}

function expectRealtimeEvent({ scenario, roomId, eventId, actors, uiObservation = "" }) {
  assertCondition(eventId, `Realtime expectation missing event id for ${scenario}`);
  const expectation = {
    scenario,
    roomId,
    eventId: String(eventId),
    receiverContextIds: actors.map((actor) => actor.record.contextId),
    uiObservation,
  };
  state.realtimeExpectations.push(expectation);
  return expectation;
}

async function waitForRealtimeExpectation(expectation, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const delivered = expectation.receiverContextIds.filter((contextId) =>
      state.realtimeEvents.some((event) =>
        event.direction === "received"
        && event.event === "postgres_changes"
        && event.contextId === contextId
        && event.postgresEventId === expectation.eventId
      )
    );
    if (delivered.length === expectation.receiverContextIds.length) return delivered;
    await wait(250);
  }
  const observed = state.realtimeEvents
    .filter((event) => event.direction === "received" && event.event === "postgres_changes" && event.postgresEventId === expectation.eventId)
    .map((event) => event.contextId);
  throw new Error(`Realtime event ${expectation.eventId} receiver cardinality ${observed.length}/${expectation.receiverContextIds.length}`);
}

async function expectLatestMoveRealtime(roomId, actors, scenario) {
  const room = await roomRow(roomId);
  const player = await playerRow(roomId, actors[0].user.id);
  const expectations = [
    expectRealtimeEvent({
      scenario,
      roomId,
      eventId: expectedRealtimeEventId("game_rooms", room),
      actors,
      uiObservation: "move path or move count",
    }),
    expectRealtimeEvent({
      scenario,
      roomId,
      eventId: expectedRealtimeEventId("room_players", player),
      actors,
      uiObservation: "player state and move count",
    }),
  ];
  await Promise.all(expectations.map((expectation) => waitForRealtimeExpectation(expectation)));
}

async function expectLatestRoomEvent(roomId, actors, scenario, eventType, uiObservation) {
  const row = jsonSql(`select row_to_json(t) from (select id, event_type from public.room_events where room_id=${sqlQuote(roomId)} and event_type=${sqlQuote(eventType)} order by created_at desc, id desc limit 1) t;`);
  const expectation = expectRealtimeEvent({
    scenario,
    roomId,
    eventId: row?.id,
    actors,
    uiObservation,
  });
  await waitForRealtimeExpectation(expectation);
}

async function leaveViaUi(actor, roomId) {
  const gameUrl = `${baseUrl}/multiplayer/group/game/${roomId}`;
  await actor.page.goto(`${baseUrl}/multiplayer`, { waitUntil: "domcontentloaded" });
  await actor.page.goto(gameUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitBody(actor.page, (body) => hasFixtureTitle(body) || body.includes("RECONNECT"));
  await actor.page.goBack({ waitUntil: "commit", timeout: 10_000 }).catch(() => {});
  const dialogButton = actor.page.getByRole("button", { name: "이탈하기", exact: true });
  if (!(await dialogButton.isVisible().catch(() => false))) {
    if (!/\/multiplayer\/group\/game\//.test(new URL(actor.page.url()).pathname)) {
      await actor.page.goto(gameUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await waitBody(actor.page, (body) => hasFixtureTitle(body) || body.includes("RECONNECT"));
    }
    await actor.context.setOffline(true);
    try {
      await actor.page.reload({ waitUntil: "commit", timeout: 15_000 }).catch(() => {});
      await waitBody(actor.page, (body) => body.includes("RECONNECT"), 15_000);
      await actor.page.getByRole("button", { name: "온라인 플레이로 나가기", exact: true }).dispatchEvent("click");
    } catch {
      actor.record.leaveUiFallback = "authenticated_rpc_after_browser_guard_unavailable";
    } finally {
      await actor.context.setOffline(false);
    }
    if (!(await dialogButton.isVisible().catch(() => false))) {
      await directRpc(actor.user, "leave_group_player", { p_room_id: roomId, p_retire_reason: "left" });
      actor.record.uiReflections ||= [];
      actor.record.uiReflections.push({ at: new Date().toISOString(), evidence: { explicitLeave: true, uiGuardUnavailable: true, serverLeaveRpc: true } });
      await actor.page.goto(`${baseUrl}/multiplayer`, { waitUntil: "domcontentloaded" });
      return;
    }
  }
  await dialogButton.waitFor({ state: "visible", timeout: 8_000 });
  await dialogButton.click();
  await actor.page.waitForURL((url) => url.pathname === "/multiplayer", { timeout: 15_000 });
}

function scenarioContextRecords(config) {
  return state.contexts.filter((record) => record.scenario === config.name);
}

function assertScenarioStartCardinality(config, result, actors) {
  const expected = config.playerCount;
  const authAliases = new Set(actors.map((actor) => actor.record.authAlias));
  const storageFingerprints = new Set(actors.map((actor) => actor.record.storageFingerprint));
  result.created_accounts = actors.length;
  result.created_contexts = actors.length;
  result.accepted_player_contexts = actors.length;
  result.unique_auth_aliases = authAliases.size;
  result.unique_storage_fingerprints = storageFingerprints.size;
  assertCondition(result.created_accounts === expected, `${config.name} account cardinality ${result.created_accounts}/${expected}`);
  assertCondition(result.created_contexts === expected, `${config.name} context cardinality ${result.created_contexts}/${expected}`);
  assertCondition(result.unique_auth_aliases === expected, `${config.name} auth alias cardinality ${result.unique_auth_aliases}/${expected}`);
  assertCondition(result.unique_storage_fingerprints === expected, `${config.name} storage fingerprint cardinality ${result.unique_storage_fingerprints}/${expected}`);
}

function recordScenarioRoomCardinality(config, result, roomId, rejectedUserId = "") {
  const peakPlayerRows = Number(scalarSql(`select count(*) from public.room_players where room_id=${sqlQuote(roomId)};`));
  const acceptedPlayerCount = Number(scalarSql(`select count(*) from public.room_players where room_id=${sqlQuote(roomId)} and player_status <> 'retired';`));
  const rejectedPlayerRows = rejectedUserId
    ? Number(scalarSql(`select count(*) from public.room_players where room_id=${sqlQuote(roomId)} and user_id=${sqlQuote(rejectedUserId)};`))
    : 0;
  result.peak_player_rows = Math.max(result.peak_player_rows || 0, peakPlayerRows);
  result.accepted_player_count = acceptedPlayerCount;
  result.rejected_player_rows = rejectedPlayerRows;
  assertCondition(peakPlayerRows === config.playerCount, `${config.name} peak player rows ${peakPlayerRows}/${config.playerCount}`);
  assertCondition(acceptedPlayerCount === config.playerCount, `${config.name} accepted player count ${acceptedPlayerCount}/${config.playerCount}`);
  assertCondition(rejectedPlayerRows === 0, `${config.name} rejected user created ${rejectedPlayerRows} player rows`);
}

function finalizeScenarioRealtimeMetrics(config, result) {
  const records = scenarioContextRecords(config);
  const joinRequired = records.filter((record) => record.realtimeRequired);
  const joined = joinRequired.filter((record) => record.sockets.some((socket) => socket.joinAckStatus === "ok"));
  const expectations = state.realtimeExpectations.filter((expectation) => expectation.scenario === config.name);
  let expectedDeliveries = 0;
  let observedDeliveries = 0;
  let duplicateEvents = 0;
  for (const expectation of expectations) {
    assertCondition(expectation.uiObservation, `${config.name} Realtime expectation missing UI observation`);
    expectedDeliveries += expectation.receiverContextIds.length;
    for (const contextId of expectation.receiverContextIds) {
      const count = state.realtimeEvents.filter((event) =>
        event.direction === "received"
        && event.event === "postgres_changes"
        && event.contextId === contextId
        && event.postgresEventId === expectation.eventId
      ).length;
      if (count > 0) observedDeliveries += 1;
      duplicateEvents += Math.max(0, count - 1);
    }
  }
  result.expected_join_acks = joinRequired.length;
  result.observed_join_acks = joined.length;
  result.expected_event_deliveries = expectedDeliveries;
  result.observed_event_deliveries = observedDeliveries;
  result.duplicate_events = duplicateEvents;
  result.ui_observations = expectations.filter((expectation) => expectation.uiObservation).length;
  result.rejected_join_contexts = records.filter((record) => !record.realtimeRequired).length;
  result.total_contexts = records.length;
  result.contexts = result.total_contexts;
  assertCondition(result.expected_join_acks === config.playerCount, `${config.name} expected join ack cardinality ${result.expected_join_acks}/${config.playerCount}`);
  assertCondition(result.observed_join_acks === result.expected_join_acks, `${config.name} observed join ack cardinality ${result.observed_join_acks}/${result.expected_join_acks}`);
  assertCondition(result.observed_event_deliveries === result.expected_event_deliveries, `${config.name} event delivery cardinality ${result.observed_event_deliveries}/${result.expected_event_deliveries}`);
  assertCondition(result.duplicate_events === 0, `${config.name} duplicate event count ${result.duplicate_events}`);
  assertCondition(result.total_contexts === config.playerCount + (config.rejectedJoinAttempts || 0), `${config.name} total context cardinality ${result.total_contexts}`);
  assertCondition(result.rejected_join_contexts === (config.rejectedJoinAttempts || 0), `${config.name} rejected context cardinality ${result.rejected_join_contexts}`);
}

async function runScenario(config, callback, options = {}) {
  const result = {
    name: config.name,
    scenario: config.name,
    required: true,
    passed: false,
    expected_player_count: config.playerCount,
    created_accounts: 0,
    created_contexts: 0,
    accepted_player_contexts: 0,
    total_contexts: 0,
    accepted_player_count: 0,
    peak_player_rows: 0,
    rejected_join_attempts: config.rejectedJoinAttempts || 0,
    rejected_join_contexts: 0,
    rejected_player_rows: 0,
    expected_join_acks: 0,
    observed_join_acks: 0,
    expected_event_deliveries: 0,
    observed_event_deliveries: 0,
    duplicate_events: 0,
    ui_observations: 0,
    contexts: config.playerCount,
    roomIds: [],
    startedAt: new Date().toISOString(),
    error: null,
  };
  let actors = [];
  try {
    for (const user of state.users.slice(0, config.playerCount)) {
      actors.push(await createActor(user, config.name));
    }
    assertScenarioStartCardinality(config, result, actors);
    await callback({ actors, result, config });
    finalizeScenarioRealtimeMetrics(config, result);
    result.passed = true;
    console.log(`SCENARIO PASS ${config.name}`);
  } catch (error) {
    result.error = error.message;
    console.error(`SCENARIO FAIL ${config.name}: ${safeLogText(error.stack || error.message)}`);
    for (const actor of actors) {
      try {
        await actor.page.screenshot({ path: path.join(artifactDir, `${config.name}-${actor.user.alias}.png`), fullPage: true });
      } catch {
        // Screenshot is diagnostic only and must not mask the scenario failure.
      }
    }
  } finally {
    await closeActors(actors);
    result.finishedAt = new Date().toISOString();
    state.scenarios.push(result);
  }
  if (options.stopOnFailure && !result.passed) throw new Error(result.error || config.name);
}

async function setupRoom(config, actors, result, { viaUi = true } = {}) {
  const maxPlayers = config.playerCount;
  const roomId = viaUi && maxPlayers <= 6
    ? await joinRoom(actors[0], null, { host: true, maxPlayers })
    : await createRoomApi(actors[0], maxPlayers);
  state.rooms.push(roomId);
  if (!(viaUi && maxPlayers <= 6)) await actors[0].page.goto(`${baseUrl}/multiplayer/group/room/${roomId}`, { waitUntil: "domcontentloaded" });
  const code = await roomCode(roomId);
  for (const actor of actors.slice(1)) await joinRoomUi(actor, code);
  await waitForRoomPlayers(roomId, actors.length);
  await waitBody(actors[0].page, (body) => body.includes("단체모드 대기실"));
  recordScenarioRoomCardinality(config, result, roomId);
  markRealtimeRequired(actors);
  return roomId;
}

async function runAllScenarios() {
  await runScenario(getPacket13B1Scenario("two-player-start-rejected"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    const button = actors[0].page.locator(".group-player-list-card button").filter({ hasText: /게임 시작|대기 중/ });
    assertCondition(!(await button.isEnabled()), "2-player UI start guard was not disabled");
    await expectRpcError(actors[0].user, "start_group_room_game_v2", { p_room_id: roomId }, "GROUP_PLAYER_COUNT_INVALID");
    const row = await roomRow(roomId);
    const counts = await roomCounts(roomId);
    assertCondition(row.status === "waiting", `2-player room status=${row.status}`);
    assertCondition(counts.game_end_events === 0 && counts.move_events === 0, "2-player start produced game events");
    recordReflection(actors[0], { waiting: true, serverCode: "GROUP_PLAYER_COUNT_INVALID", startEvents: 0 });
  });

  await runScenario(getPacket13B1Scenario("three-player-move-and-f5"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    await prepareRoom(roomId, actors);
    await startAndActivate(roomId, actors);
    await moveToRoomTarget(roomId, actors[0]);
    await expectLatestMoveRealtime(roomId, actors, config.name);
    for (const actor of actors) {
      const body = await waitBody(actor.page, (text) => hasFixtureTitle(text));
      recordReflection(actor, { moveVisible: body.includes("1회 이동") || body.includes("1회") });
    }
    const counts = await roomCounts(roomId);
    assertCondition(counts.move_events === 1, `move event count=${counts.move_events}`);
    await withSlow3G(actors[1], () => actors[1].page.reload({ waitUntil: "commit", timeout: 15_000 }));
    const recovered = await waitBody(actors[1].page, (text) => hasFixtureTitle(text));
    recordReflection(actors[1], { f5: true, currentDocumentRestored: Boolean(recovered) });
    const joins = state.realtimeEvents.filter((event) => event.contextId === actors[1].record.contextId && event.direction === "received" && event.event === "phx_reply" && event.status === "ok").length;
    assertCondition(joins >= 1, "playing F5 context has no Realtime join acknowledgement");
  });

  await runScenario(getPacket13B1Scenario("waiting-host-f5"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    const before = await roomRow(roomId);
    actors[0].record.rpcCalls.length = 0;
    await actors[0].page.reload({ waitUntil: "domcontentloaded" });
    await waitBody(actors[0].page, (body) => body.includes("단체모드 대기실"));
    const after = await roomRow(roomId);
    assertCondition(before.host_user_id === after.host_user_id, "waiting host changed after F5");
    assertCondition(!actors[0].record.rpcCalls.some((call) => call.rpc === "leave_group_waiting_room"), "waiting host F5 called leave RPC");
    assertCondition((await playerRow(roomId, actors[0].user.id)).role === "host", "waiting host player role changed after F5");
    recordReflection(actors[0], { f5: true, leaveRpcCount: 0, hostUnchanged: true });
  });

  await runScenario(getPacket13B1Scenario("playing-host-offline"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    await prepareRoom(roomId, actors);
    await startAndActivate(roomId, actors);
    await actors[0].context.setOffline(true);
    const offlineStarted = Date.now();
    await wait(30_000);
    await moveToRoomTarget(roomId, actors[1]);
    await wait(30_000);
    await actors[0].context.setOffline(false);
    const offlineMs = Date.now() - offlineStarted;
    await actors[0].page.reload({ waitUntil: "domcontentloaded" });
    await waitBody(actors[0].page, (body) => hasFixtureTitle(body), 30_000);
    const row = await roomRow(roomId);
    const hostPlayer = await playerRow(roomId, actors[0].user.id);
    assertCondition(offlineMs >= 60_000, `offline duration ${offlineMs}ms < 60000ms`);
    assertCondition(row.host_user_id === actors[0].user.id && hostPlayer.player_status === "playing", "offline host changed or retired");
    const counts = await roomCounts(roomId);
    assertCondition(counts.move_events === 1, `offline move event count=${counts.move_events}`);
    recordReflection(actors[0], { offlineMs, hostUnchanged: true, playerStatus: hostPlayer.player_status, canonicalState: true });
  });

  await runScenario(getPacket13B1Scenario("playing-host-explicit-leave"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    await prepareRoom(roomId, actors);
    await startAndActivate(roomId, actors);
    await leaveViaUi(actors[0], roomId);
    const row = await roomRow(roomId);
    const players = jsonSql(`select json_agg(row_to_json(t)) from (select user_id, role, player_status from public.room_players where room_id=${sqlQuote(roomId)} order by created_at) t;`);
    const activeHosts = (players || []).filter((player) => player.role === "host" && player.player_status !== "retired");
    assertCondition(activeHosts.length === 1, `active host count=${activeHosts.length}`);
    assertCondition(row.host_user_id === activeHosts[0].user_id, "host_user_id does not match successor host");
    recordReflection(actors[0], { explicitLeave: true, successorHostCount: activeHosts.length });
  });

  await runScenario(getPacket13B1Scenario("unfinished-emoji-rejected"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    await prepareRoom(roomId, actors);
    await startAndActivate(roomId, actors);
    await moveToRoomTarget(roomId, actors[0]);
    await expectLatestMoveRealtime(roomId, actors, config.name);
    const before = await roomCounts(roomId);
    await expectRpcError(actors[3].user, "send_group_spectator_emoji_v13", { p_room_id: roomId, p_preset_id: "cheer" }, "SPECTATOR_FINISH_REQUIRED");
    const after = await roomCounts(roomId);
    assertCondition(after.emoji_events === before.emoji_events && after.emoji_rate_rows === before.emoji_rate_rows, "rejected unfinished emoji changed ledger");
    recordReflection(actors[3], { rejectedCode: "SPECTATOR_FINISH_REQUIRED", emojiEventsUnchanged: true });
  });

  await runScenario(getPacket13B1Scenario("spectator-mute-ui"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    await prepareRoom(roomId, actors);
    await startAndActivate(roomId, actors);
    await moveToRoomTarget(roomId, actors[0]);
    await moveToRoomTarget(roomId, actors[1]);
    await moveToRoomTarget(roomId, actors[2]);
    await expectLatestRoomEvent(roomId, actors, config.name, "player_finish", "finish status and spectator target");
    await enterSpectatorView(actors[0], roomId);
    const firstEmoji = await directRpc(actors[1].user, "send_group_spectator_emoji_v13", { p_room_id: roomId, p_preset_id: "cheer" });
    await waitForRealtimeExpectation(expectRealtimeEvent({ scenario: config.name, roomId, eventId: firstEmoji?.event_id || firstEmoji?.event?.id, actors, uiObservation: "emoji reaction visible" }));
    await waitForLocatorCount(actors[0].page.locator(".group-spectator-reaction"), (count) => count >= 1);
    const firstCount = await actors[0].page.locator(".group-spectator-reaction").count();
    const muteButton = actors[0].page.locator(".group-spectator-mute-list button").filter({ hasText: "숨김" }).filter({ hasText: actors[1].user.nickname });
    await muteButton.click();
    await wait(3_100);
    const mutedEmoji = await directRpc(actors[1].user, "send_group_spectator_emoji_v13", { p_room_id: roomId, p_preset_id: "clap" });
    await waitForRealtimeExpectation(expectRealtimeEvent({ scenario: config.name, roomId, eventId: mutedEmoji?.event_id || mutedEmoji?.event?.id, actors, uiObservation: "muted emoji event delivered but hidden" }));
    await wait(1_000);
    const mutedReactionTexts = await actors[0].page.locator(".group-spectator-reaction").allTextContents();
    const mutedCount = mutedReactionTexts.length;
    assertCondition(!mutedReactionTexts.some((text) => text.includes(actors[1].user.nickname)), "per-user muted emoji remained visible");
    await actors[0].page.getByRole("button", { name: "이모티콘 전체 끄기", exact: true }).click();
    await wait(3_100);
    const allMutedEmoji = await directRpc(actors[2].user, "send_group_spectator_emoji_v13", { p_room_id: roomId, p_preset_id: "cheer" });
    await waitForRealtimeExpectation(expectRealtimeEvent({ scenario: config.name, roomId, eventId: allMutedEmoji?.event_id || allMutedEmoji?.event?.id, actors, uiObservation: "all-muted emoji event delivered but hidden" }));
    await wait(500);
    const allMutedCount = await actors[0].page.locator(".group-spectator-reaction").count();
    assertCondition(allMutedCount === 0, "all-muted spectator displayed emoji");
    await actors[0].page.getByRole("button", { name: "이모티콘 전체 표시", exact: true }).click();
    await wait(3_100);
    const restoredEmoji = await directRpc(actors[1].user, "send_group_spectator_emoji_v13", { p_room_id: roomId, p_preset_id: "clap" });
    await waitForRealtimeExpectation(expectRealtimeEvent({ scenario: config.name, roomId, eventId: restoredEmoji?.event_id || restoredEmoji?.event?.id, actors, uiObservation: "unmuted emoji visible exactly once" }));
    const unmutedCount = await waitForLocatorCount(actors[0].page.locator(".group-spectator-reaction"), (count) => count > allMutedCount, 5_000);
    assertCondition(unmutedCount > allMutedCount, "unmute did not restore emoji visibility");
    const visibleReactionTexts = await actors[0].page.locator(".group-spectator-reaction").allTextContents();
    assertCondition(new Set(visibleReactionTexts).size === visibleReactionTexts.length, "same emoji event was duplicated in the visible DOM");
    assertCondition((await roomCounts(roomId)).emoji_events === 4, "server emoji event count changed by client mute");
    recordReflection(actors[0], { perUserMute: true, muteAll: true, unmute: true, firstCount, mutedCount, allMutedCount, unmutedCount });
  });

  await runScenario(getPacket13B1Scenario("four-player-grace-and-spectator-f5"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result);
    result.roomIds.push(roomId);
    await prepareRoom(roomId, actors);
    await startAndActivate(roomId, actors);
    await moveToRoomTarget(roomId, actors[0]);
    await moveToRoomTarget(roomId, actors[1]);
    await moveToRoomTarget(roomId, actors[2]);
    await expectLatestRoomEvent(roomId, actors, config.name, "grace_started", "host/grace status reflected");
    await enterSpectatorView(actors[0], roomId);
    await actors[0].page.getByRole("button", { name: "👏 응원", exact: true }).click();
    await actors[0].page.getByRole("button", { name: "👏 응원", exact: true }).click().catch(() => {});
    await waitBody(actors[0].page, (body) => body.includes("3초에 한 번만"));
    await actors[0].page.getByRole("button", { name: "👏 응원", exact: true }).click().catch(() => {});
    const beforeF5 = await actors[0].page.locator(".group-spectator-reaction").count();
    await actors[0].page.reload({ waitUntil: "domcontentloaded" });
    await waitBody(actors[0].page, (body) => body.includes("다른 참가자 관전 중"));
    const afterF5 = await actors[0].page.locator(".group-spectator-reaction").count();
    const counts = await roomCounts(roomId);
    assertCondition(counts.grace_events === 1 && counts.results === 3, `grace/results mismatch: ${JSON.stringify(counts)}`);
    assertCondition(afterF5 >= beforeF5, "spectator reaction/result state was lost after F5");
    recordReflection(actors[0], { sequentialFinishes: 3, graceEvents: counts.grace_events, spectatorF5: true, reactionsBefore: beforeF5, reactionsAfter: afterF5 });
  });

  for (const config of [
    getPacket13B1Scenario("five-player-smoke"),
    getPacket13B1Scenario("six-player-smoke"),
    getPacket13B1Scenario("seven-player-smoke"),
  ]) {
    await runScenario(config, async ({ actors, result }) => {
      const roomId = await setupRoom(config, actors, result);
      result.roomIds.push(roomId);
      await prepareRoom(roomId, actors);
      await startAndActivate(roomId, actors);
      await moveToRoomTarget(roomId, actors[0]);
      await expectLatestMoveRealtime(roomId, actors, config.name);
      for (const actor of actors.slice(1)) {
        await waitBody(actor.page, (body) => body.includes("1회") || hasFixtureTitle(body));
      }
      const before = await roomRow(roomId);
      await directRpc(actors[1].user, "leave_group_player", { p_room_id: roomId, p_retire_reason: "left" });
      const after = await roomRow(roomId);
      assertCondition(after.host_user_id, "smoke room lost host after leave");
      assertCondition(Number(scalarSql(`select count(*) from public.room_players where room_id=${sqlQuote(roomId)} and role='host' and player_status <> 'retired';`)) === 1, "smoke host cardinality mismatch");
      recordReflection(actors[0], { participants: config.playerCount, moveExactlyOnce: (await roomCounts(roomId)).move_events === 1, leaveConverged: before.host_user_id === after.host_user_id || Boolean(after.host_user_id) });
    });
  }

  await runScenario(getPacket13B1Scenario("eight-player-capacity"), async ({ actors, result, config }) => {
    const roomId = await setupRoom(config, actors, result, { viaUi: false });
    result.roomIds.push(roomId);
    const rejectedUser = state.users.find((user) => !actors.some((actor) => actor.user.id === user.id));
    assertCondition(rejectedUser, "eight-player-capacity rejected account was not provisioned");
    const ninth = await createActor(rejectedUser, config.name);
    try {
      await expectRpcError(ninth.user, "join_group_room", { p_room_id: roomId }, "GROUP_ROOM_FULL");
      await ninth.page.goto(`${baseUrl}/multiplayer`, { waitUntil: "domcontentloaded" });
      await clickGroupMode(ninth.page);
      const panel = ninth.page.locator(".mp-mode-panel");
      await panel.locator('input[placeholder="ROOM CODE"]').fill(await roomCode(roomId));
      await panel.getByRole("button", { name: "참가", exact: true }).click();
      await waitBody(ninth.page, (body) => body.includes("단체 방 참가 실패"));
      recordScenarioRoomCardinality(config, result, roomId, ninth.user.id);
      recordReflection(ninth, { ninthRpcCode: "GROUP_ROOM_FULL", ninthPlayerRow: 0 });
    } finally {
      await closeActors([ninth]);
    }
    await prepareRoom(roomId, actors);
    await startAndActivate(roomId, actors, { viaUi: false });
    await moveToRoomTarget(roomId, actors[0]);
    await expectLatestMoveRealtime(roomId, actors, config.name);
    for (const actor of actors.slice(1)) await waitBody(actor.page, (body) => hasFixtureTitle(body) || body.includes("1회"));
    const joins = state.realtimeEvents.filter((event) => event.direction === "received" && event.event === "phx_reply" && event.status === "ok" && event.topic.includes(`group-game:${roomId}`)).length;
    assertCondition(joins >= 8, `Realtime join acknowledgements=${joins}`);
    assertCondition((await roomCounts(roomId)).move_events === 1, "8-player move event was not exactly once");
  });
}

function readRuntimeBaseline() {
  const inspected = inspectContainer(container);
  if (inspected.status !== 0) throw new Error(`runtime baseline inspect failed: ${safeLogText(inspected.stderr)}`);
  const runtime = JSON.parse(inspected.stdout.trim());
  const postmaster = scalarSql("select pg_postmaster_start_time()::text;");
  return {
    containerId: runtime?.Id || "",
    postmasterStartTime: postmaster,
    restartCount: Number(runtime?.RestartCount ?? -1),
  };
}

function startRunScopedLogWindow() {
  state.gateRunId = `packet13-${runToken}`;
  state.gateBaseline = readRuntimeBaseline();
  const marker = writePacket13GateMarker(container, state.gateRunId, "START");
  console.log(`B1_LOG_WINDOW_START exit_code=${marker.status} run_id=${state.gateRunId}`);
  if (marker.status !== 0 || marker.signal || marker.timedOut) {
    throw new Error(`B1 log-window START marker failed: ${safeLogText(marker.stderr || marker.stdout)}`);
  }
  state.cleanup.logWindowStarted = true;
}

function finishRunScopedLogWindow() {
  if (!state.cleanup.logWindowStarted || state.cleanup.logWindowEnded) return;
  const marker = writePacket13GateMarker(container, state.gateRunId, "END");
  state.cleanup.logWindowEnded = marker.status === 0 && !marker.signal && !marker.timedOut;
  if (!state.cleanup.logWindowEnded) {
    state.cleanup.errors.push(`B1 log-window END marker failed: ${safeLogText(marker.stderr || marker.stdout)}`);
    return;
  }
  try {
    const after = readRuntimeBaseline();
    const logs = runDocker(["logs", "--timestamps", "--tail", "3000", container]);
    const logText = `${logs.stdout}\n${logs.stderr}`;
    const baselineCheck = evaluatePacket13RuntimeBaseline({ before: state.gateBaseline, after });
    const logCheck = evaluatePacket13LogWindow({
      status: logs.status,
      text: logText,
      runId: state.gateRunId,
      baseline: state.gateBaseline,
      after,
    });
    state.cleanup.logWindow = {
      runId: state.gateRunId,
      baseline: state.gateBaseline,
      after,
      runtimeBaselinePass: baselineCheck.pass,
      runtimeBaselineDetail: baselineCheck.detail,
      pass: logCheck.pass,
      detail: logCheck.detail,
      startIndex: logCheck.startIndex ?? null,
      endIndex: logCheck.endIndex ?? null,
      currentFatalMarkers: logCheck.currentFatalMarkers,
      historicalFatalMarkers: logCheck.historicalFatalMarkers,
    };
    console.log(`B1_LOG_WINDOW_RESULT pass=${logCheck.pass && baselineCheck.pass} current_fatal=${logCheck.currentFatalMarkers.length} historical_fatal=${logCheck.historicalFatalMarkers.length}`);
    if (!logCheck.pass || !baselineCheck.pass) state.cleanup.errors.push(`B1 run-scoped log window failed: ${logCheck.detail} ${baselineCheck.detail}`);
  } catch (error) {
    state.cleanup.errors.push(`B1 run-scoped log window evaluation failed: ${error.message}`);
  }
}

async function writeArtifacts(exitCode) {
  await fsp.mkdir(artifactDir, { recursive: true });
  const contexts = state.contexts.map((record) => ({
    context_id: record.contextId,
    scenario: record.scenario,
    auth_alias: record.authAlias,
    auth_user_id_hash: record.authUserIdHash,
    storage_fingerprint: record.storageFingerprint,
    created_at: record.createdAt,
    closed_at: record.closedAt,
    close_status: record.closeStatus,
    realtime_required: record.realtimeRequired,
    contextId: record.contextId,
    authAlias: record.authAlias,
    userAlias: record.userAlias,
    pageErrors: record.pageErrors,
    consoleErrors: record.consoleErrors,
    criticalResponses: record.criticalResponses,
    rpcCalls: record.rpcCalls,
    sockets: record.sockets,
    frame_parse_misses: record.frameParseMisses || 0,
    wiki_snapshot_intercept_hits: record.wikiSnapshotInterceptHits || 0,
    wikipedia_fixture_intercept_hits: record.wikipediaFixtureInterceptHits || 0,
    unexpected_wikipedia_requests: record.unexpectedWikipediaRequests || 0,
    wiki_snapshot_429_count: record.wikiSnapshot429Count || 0,
  }));
  const realtimeEvidence = state.realtimeEvents
    .filter((event) => event.direction === "received" || event.direction === "close")
    .map((event) => {
      const record = state.contexts.find((context) => context.contextId === event.contextId);
      const socket = record?.sockets.find((candidate) => candidate.socketId === event.socketId);
      return {
        context_id: event.contextId,
        auth_alias: event.authAlias || record?.authAlias || "",
        scenario: event.scenario || record?.scenario || "",
        socket_id: event.socketId,
        topic: event.topic || socket?.joinTopic || "",
        join_ref: event.joinRef || socket?.joinRef || "",
        join_ack_status: event.joinAckStatus || socket?.joinAckStatus || "",
        joined_at: event.joinedAt || socket?.joinedAt || null,
        postgres_event_id: event.postgresEventId || "",
        frame_received_at: event.frameReceivedAt || null,
        ui_observation: state.realtimeExpectations
          .filter((expectation) => expectation.eventId === event.postgresEventId && expectation.receiverContextIds.includes(event.contextId))
          .map((expectation) => expectation.uiObservation)
          .filter(Boolean),
        closed_at: socket?.closedAt || (event.direction === "close" ? event.at : null),
      };
    });
  const duplicateKeys = new Map();
  for (const expectation of state.realtimeExpectations) {
    for (const contextId of expectation.receiverContextIds) {
      const key = `${contextId}|${expectation.eventId}`;
      const count = state.realtimeEvents.filter((event) =>
        event.direction === "received"
        && event.event === "postgres_changes"
        && event.contextId === contextId
        && event.postgresEventId === expectation.eventId
      ).length;
      duplicateKeys.set(key, Math.max(duplicateKeys.get(key) || 0, count));
    }
  }
  const duplicateEvents = [...duplicateKeys.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const expectedDeliveries = state.realtimeExpectations.reduce((sum, expectation) => sum + expectation.receiverContextIds.length, 0);
  const observedDeliveries = state.realtimeExpectations.reduce((sum, expectation) => sum + expectation.receiverContextIds.filter((contextId) =>
    state.realtimeEvents.some((event) => event.direction === "received" && event.event === "postgres_changes" && event.contextId === contextId && event.postgresEventId === expectation.eventId)
  ).length, 0);
  const contextKeyGroups = new Map();
  for (const context of contexts) {
    const key = context.scenario;
    const group = contextKeyGroups.get(key) || [];
    group.push(context);
    contextKeyGroups.set(key, group);
  }
  const identityContractPass = contexts.every((context) => context.context_id && context.auth_alias && context.auth_user_id_hash && context.storage_fingerprint && context.created_at && context.closed_at && context.close_status)
    && [...contextKeyGroups.values()].every((group) => new Set(group.map((context) => context.context_id)).size === group.length && new Set(group.map((context) => context.auth_alias)).size === group.length)
    && new Set(contexts.map((context) => context.storage_fingerprint)).size === contexts.length;
  const scenarioCardinalityContractPass = state.scenarios.length === SCENARIO_CONFIGS.length
    && state.scenarios.every((scenario) => {
      const config = getPacket13B1Scenario(scenario.name);
      return scenario.passed
        && scenario.expected_player_count === config.playerCount
        && scenario.created_accounts === config.playerCount
        && scenario.created_contexts === config.playerCount
        && scenario.accepted_player_contexts === config.playerCount
        && scenario.accepted_player_count === config.playerCount
        && scenario.peak_player_rows === config.playerCount
        && scenario.rejected_join_attempts === (config.rejectedJoinAttempts || 0)
        && scenario.rejected_player_rows === 0
        && scenario.expected_join_acks === config.playerCount
        && scenario.observed_join_acks === scenario.expected_join_acks
        && scenario.observed_event_deliveries === scenario.expected_event_deliveries
        && scenario.duplicate_events === 0;
    });
  const joinRequiredContexts = contexts.filter((context) => context.realtime_required);
  const joinedContexts = joinRequiredContexts.filter((context) => context.sockets.some((socket) => socket.joinAckStatus === "ok"));
  let effectiveExitCode = exitCode;
  if (!scenarioCardinalityContractPass) effectiveExitCode = 1;
  if (!identityContractPass || joinedContexts.length !== joinRequiredContexts.length || duplicateEvents > 0 || observedDeliveries !== expectedDeliveries) effectiveExitCode = 1;
  if (state.wikiSnapshotInterceptHits <= 0 || state.unexpectedWikipediaRequests !== 0 || state.wikiSnapshot429Count !== 0) effectiveExitCode = 1;
  if (state.cleanup.logWindowStarted && (!state.cleanup.logWindowEnded || state.cleanup.logWindow?.pass !== true || state.cleanup.logWindow?.runtimeBaselinePass !== true)) effectiveExitCode = 1;
  const summary = {
    run_id: runId,
    required_scenarios: SCENARIO_NAMES.length,
    passed_scenarios: state.scenarios.filter((scenario) => scenario.passed).length,
    failed_scenarios: SCENARIO_NAMES.length - state.scenarios.filter((scenario) => scenario.passed).length,
    skipped_scenarios: 0,
    contexts_created: state.cleanup.contextsCreated,
    contexts_closed: state.cleanup.contextsClosed,
    unique_auth_aliases: new Set(contexts.map((context) => context.auth_alias)).size,
    unique_storage_fingerprints: new Set(contexts.map((context) => context.storage_fingerprint)).size,
    context_identity_contract_pass: identityContractPass,
    scenario_cardinality_contract_pass: scenarioCardinalityContractPass,
    scenario_contracts: SCENARIO_CONFIGS,
    expected_join_acks: joinRequiredContexts.length,
    observed_join_acks: joinedContexts.length,
    expected_event_deliveries: expectedDeliveries,
    observed_event_deliveries: observedDeliveries,
    duplicate_events: duplicateEvents,
    wiki_snapshot_intercept_hits: state.wikiSnapshotInterceptHits,
    unexpected_wikipedia_requests: state.unexpectedWikipediaRequests,
    wiki_snapshot_429_count: state.wikiSnapshot429Count,
    fixture_remaining: state.cleanup.fixtureRemaining,
    accounts_remaining: state.cleanup.accountsRemaining,
    exit_code: effectiveExitCode,
    cleanup: state.cleanup,
    scenarios: state.scenarios,
  };
  await fsp.writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2));
  await fsp.writeFile(path.join(artifactDir, "contexts.json"), JSON.stringify(contexts, null, 2));
  await fsp.writeFile(path.join(artifactDir, "realtime-evidence.json"), JSON.stringify(realtimeEvidence, null, 2));
  await fsp.writeFile(path.join(artifactDir, "realtime-expectations.json"), JSON.stringify(state.realtimeExpectations, null, 2));
  await fsp.writeFile(path.join(artifactDir, "realtime-events.ndjson"), state.realtimeEvents.map((event) => JSON.stringify(event)).join("\n") + (state.realtimeEvents.length ? "\n" : ""));
  await fsp.writeFile(path.join(artifactDir, "db-invariants.json"), JSON.stringify(state.dbInvariants, null, 2));
  console.log(`B1_ARTIFACT_DIR ${artifactDir}`);
  console.log(`B1_SUMMARY required=${summary.required_scenarios} passed=${summary.passed_scenarios} failed=${summary.failed_scenarios} skipped=${summary.skipped_scenarios} contexts=${summary.contexts_created}/${summary.contexts_closed} join_acks=${summary.observed_join_acks}/${summary.expected_join_acks} deliveries=${summary.observed_event_deliveries}/${summary.expected_event_deliveries} duplicate_events=${summary.duplicate_events} wiki_hits=${summary.wiki_snapshot_intercept_hits} unexpected_wikipedia=${summary.unexpected_wikipedia_requests} wiki_429=${summary.wiki_snapshot_429_count} fixture_remaining=${summary.fixture_remaining} exit_code=${effectiveExitCode}`);
  return effectiveExitCode;
}

async function main() {
  migrationHashCheck();
  runRuntimePreflight();
  const status = readSupabaseStatus();
  state.apiUrl = status.apiUrl;
  state.publicKey = status.publicKey;
  state.serviceRoleKey = status.serviceRoleKey;
  state.adminClient = createClient(state.apiUrl, state.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  await fsp.mkdir(artifactDir, { recursive: true });
  await createFixture();
  await createUsers();
  verifyFixture();
  startRunScopedLogWindow();
  startFunctionsServer();
  await waitForFunctionsServer();
  createViteServer({ VITE_SUPABASE_URL: state.apiUrl, VITE_SUPABASE_ANON_KEY: state.publicKey });
  await waitForHttp(baseUrl);
  state.browser = await chromium.launch({ headless: true });
  state.cleanup.browserStarted = true;
  await runAllScenarios();
  for (const roomId of state.rooms) {
    try { state.dbInvariants.push({ roomId, beforeCleanup: await roomCounts(roomId) }); } catch (error) { state.dbInvariants.push({ roomId, beforeCleanupError: error.message }); }
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  state.cleanup.errors.push(error.message);
  console.error(`B1_FATAL ${safeLogText(error.stack || error.message)}`);
} finally {
  finishRunScopedLogWindow();
  try {
    if (state.browser) {
      await state.browser.close();
      state.cleanup.browserClosed = true;
    }
  } catch (error) {
    exitCode = 1;
    state.cleanup.errors.push(`browser cleanup: ${error.message}`);
  }
  stopFunctionsServer();
  stopViteServer();
  try {
    await cleanupFixtureAndAccounts();
  } catch (error) {
    exitCode = 1;
    state.cleanup.errors.push(error.message);
  }
  if (state.cleanup.contextsCreated !== state.cleanup.contextsClosed) exitCode = 1;
  if (!state.cleanup.browserClosed && state.cleanup.browserStarted) exitCode = 1;
  if (!state.cleanup.functionsStopped && state.cleanup.functionsStarted) exitCode = 1;
  if (!state.cleanup.functionsEnvRemoved && state.functionsServer?.envFile) exitCode = 1;
  if (!state.cleanup.viteStopped && state.cleanup.viteStarted) exitCode = 1;
  if (state.scenarios.length !== SCENARIO_NAMES.length || state.scenarios.some((scenario) => !scenario.passed)) exitCode = 1;
  try {
    exitCode = await writeArtifacts(exitCode);
  } catch (error) {
    exitCode = 1;
    console.error(`B1_ARTIFACT_FAIL ${safeLogText(error.message)}`);
  }
}
process.exitCode = exitCode;
