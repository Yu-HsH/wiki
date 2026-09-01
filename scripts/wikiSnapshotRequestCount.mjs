// wiki-snapshot Edge Function의 **Wikipedia 요청 수**를 실측한다.
//
// npm test에 넣지 않는다 — 3자 API를 (최초 1회) 실제로 호출하므로
// verifyWikiLinks.mjs와 같은 명시 실행 스크립트다 (docs/agent/CURRENT.md §5.4).
//
// 방법: supabase/functions/wiki-snapshot/index.ts를 **그대로** 불러와 fetch를 세는 스텁으로
// 감싼다. 로직을 베끼지 않으므로 소스가 바뀌면 이 수치도 같이 바뀐다.
//   - Deno 전역과 esm.sh import만 치환한다 (Node에서 해석 불가).
//   - Wikipedia 응답은 실제 HTML 1건을 캐시해 두고 그것으로 합성한다.
//     실제 호출은 캐시가 없을 때 딱 1번, `action=parse` 하나뿐이다.
//
// 사용법:
//   node scripts/wikiSnapshotRequestCount.mjs [문서제목]
//
// 출력: 시나리오별 Wikipedia 요청 수. cold(최초) / warm(재사용) / 관전(warm+본문).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const TITLE = process.argv[2] || "대한민국";
const CACHE_DIR = join(root, "node_modules", ".cache", "wiki-snapshot-count");
const CACHE_FILE = join(CACHE_DIR, `${encodeURIComponent(TITLE)}.json`);
// 치환한 .ts는 node_modules 밖에 둬야 한다 — Node는 node_modules 아래에서
// 타입 스트리핑을 거부한다 (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
const MODULE_DIR =
  process.env.WIKI_SNAPSHOT_COUNT_TMP ||
  join(process.env.TEMP || process.env.TMPDIR || "/tmp", "wiki-snapshot-count");

const USER_AGENT =
  "WikiRace/2.0 (https://wiki-dusky-one.vercel.app) supabase-edge-functions";

// ── 1. 실제 Wikipedia 문서 1건 (캐시) ────────────────────────────────────────
async function loadRealPage() {
  if (existsSync(CACHE_FILE)) {
    const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    console.log(`캐시 사용: ${CACHE_FILE} (실제 Wikipedia 호출 0건)`);
    return cached;
  }
  const url =
    "https://ko.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "parse",
      page: TITLE,
      prop: "text|revid",
      redirects: "1",
      format: "json",
      origin: "*",
    });
  console.log(`실제 Wikipedia 호출 1건: action=parse&page=${TITLE}`);
  const response = await fetch(url, {
    headers: { accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
  const data = await response.json();
  const parse = data?.parse;
  if (!parse?.pageid || !parse?.revid) throw new Error("parse 응답이 비었다");
  const page = {
    pageid: String(parse.pageid),
    revid: String(parse.revid),
    title: parse.title,
    html: parse.text?.["*"] ?? "",
  };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(page), "utf8");
  return page;
}

// ── 2. index.ts를 Node에서 실행 가능하게 최소 치환 ───────────────────────────
// 로직은 건드리지 않는다. import 한 줄과 Deno 전역만 바꾼다.
function loadHandlerSource(source, tag) {
  const patched = source
    .replace(
      /^import \{ createClient \} from "https:\/\/esm\.sh\/@supabase\/supabase-js@2";$/m,
      "const createClient = globalThis.__createClient;"
    )
    .replace(/Deno\.env\.get\([^)]*\) \?\? ""/g, '""')
    .replace(/^Deno\.serve\(/m, "globalThis.__setHandler(");
  if (patched === source) throw new Error(`치환 실패 (${tag}) — index.ts 구조가 바뀌었다`);
  // Node는 node_modules 아래 .ts의 타입 스트리핑을 거부한다. 임시 디렉터리에 쓴다.
  const outDir = join(MODULE_DIR, "mod");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `wiki-snapshot.${tag}.ts`);
  writeFileSync(outFile, patched, "utf8");
  return outFile;
}

// HEAD에 커밋된 버전을 baseline으로 읽는다. 워킹 트리와 같으면 비교가 무의미하므로 알린다.
function readBaselineSource() {
  const relative = "supabase/functions/wiki-snapshot/index.ts";
  try {
    return execFileSync("git", ["show", `HEAD:${relative}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

async function loadHandler(source, tag) {
  const file = loadHandlerSource(source, tag);
  let captured;
  globalThis.__setHandler = (fn) => { captured = fn; };
  await import(`${pathToFileURL(file).href}?tag=${tag}`);
  if (typeof captured !== "function") throw new Error(`핸들러를 얻지 못했다 (${tag})`);
  return captured;
}

// ── 3. 스텁 ─────────────────────────────────────────────────────────────────
// index.ts는 모듈 최상단에서 createClient를 한 번만 부른다. 따라서 스텁은 **하나**를
// 만들어 두고 시나리오마다 내부 상태(state.cachedLinks)만 갈아 끼워야 한다.
// 시나리오마다 새 스텁을 만들면 모듈이 잡고 있는 첫 스텁만 계속 쓰인다.
const state = { cachedLinks: null, rpcCalls: [] };

function makeSupabaseStub() {
  const table = (name) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      // 실제 PostgREST처럼 잘라서 준다 — loadCachedSnapshot의 range 루프가 실제로 돈다.
      range: (from, to) =>
        Promise.resolve({ data: (state.cachedLinks ?? []).slice(from, to + 1), error: null }),
      maybeSingle: () => {
        if (name !== "wiki_page_snapshots") return Promise.resolve({ data: null, error: null });
        return Promise.resolve({
          data: state.cachedLinks
            ? { id: "00000000-0000-0000-0000-000000000001", canonical_title_snapshot: TITLE }
            : null,
          error: null,
        });
      },
    };
    return builder;
  };
  return {
    from: table,
    rpc: (fn, args) => {
      state.rpcCalls.push({ fn, linkCount: args?.p_links?.length ?? 0 });
      return Promise.resolve({
        data: [{ id: "00000000-0000-0000-0000-000000000002" }],
        error: null,
      });
    },
  };
}

function makeWikiFetchStub(page) {
  const calls = [];
  return {
    calls,
    fetch: async (input) => {
      const url = new URL(String(input));
      const params = url.searchParams;
      const action = params.get("action");
      const prop = params.get("prop");
      calls.push({
        action,
        prop,
        // 배치 크기를 같이 남겨 두면 dedup 효과가 눈에 보인다
        count:
          params.get("titles")?.split("|").length ??
          params.get("pageids")?.split("|").length ??
          1,
      });

      if (action === "parse") {
        return jsonResponse({
          parse: { pageid: Number(page.pageid), revid: Number(page.revid), title: page.title, text: { "*": page.html } },
        });
      }
      if (action === "query" && prop === "info") {
        const titles = (params.get("titles") || "").split("|").filter(Boolean);
        const pages = {};
        // 본문 링크는 대부분 실재하는 ns0 문서다. 전부 해석되는 것으로 둔다 —
        // 이 가정에서 baseline의 "제목만" 시나리오가 문서에 기록된 62건을 재현한다.
        titles.forEach((title) => {
          const id = 1000000 + hash(title);
          pages[String(id)] = { ns: 0, pageid: id, title };
        });
        return jsonResponse({ query: { pages } });
      }
      if (action === "query" && prop === "revisions") {
        const ids = (params.get("pageids") || "").split("|").filter(Boolean);
        const pages = {};
        for (const id of ids) {
          pages[id] = { pageid: Number(id), revisions: [{ revid: Number(id) + 7 }] };
        }
        return jsonResponse({ query: { pages } });
      }
      throw new Error(`스텁이 모르는 요청: ${url}`);
    },
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function hash(value) {
  let out = 0;
  for (let index = 0; index < value.length; index += 1) {
    out = (out * 31 + value.charCodeAt(index)) % 900000;
  }
  return out;
}

// ── 4. 시나리오 실행 ────────────────────────────────────────────────────────
async function run({ label, body, cachedLinks, page, handler, realFetch }) {
  const wiki = makeWikiFetchStub(page);
  state.cachedLinks = cachedLinks;
  state.rpcCalls = [];
  globalThis.fetch = wiki.fetch;

  const response = await handler(
    new Request("http://localhost/wiki-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  globalThis.fetch = realFetch;

  const payload = await response.json();
  const byKind = wiki.calls.reduce((acc, call) => {
    const key = call.action === "parse" ? "parse" : `${call.action}:${call.prop}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    label,
    status: response.status,
    total: wiki.calls.length,
    byKind,
    reused: payload?.reused === true,
    linkCount: payload?.links?.length ?? 0,
    hasHtml: Boolean(payload?.documentHtml),
  };
}

const page = await loadRealPage();
const realFetch = globalThis.fetch;
globalThis.__createClient = () => makeSupabaseStub();

const currentSource = readFileSync(
  join(root, "supabase/functions/wiki-snapshot/index.ts"),
  "utf8"
);
const baselineSource = readBaselineSource();

const identity = {
  requestId: null,
  title: page.title,
  pageId: page.pageid,
  revisionId: page.revid,
};
// warm 경로가 링크를 끝까지 읽는지 보려면 PostgREST 1페이지(1000)를 넘겨야 한다.
const warmLinks = Array.from({ length: 1500 }, (_, index) => ({
  target_page_id: String(2000000 + index),
  target_title_snapshot: `링크${index}`,
  link_text: `링크${index}`,
}));

const SCENARIOS = [
  { key: "coldIdentity", label: "cold — 최초 스냅샷 (신원 있음, 본문 불필요)",
    body: { ...identity, includeDocument: false }, cachedLinks: null },
  { key: "warmPlain", label: "warm — 재사용 (신원 있음, 본문 불필요)",
    body: { ...identity, includeDocument: false }, cachedLinks: warmLinks },
  { key: "warmSpectator", label: "warm — 관전 (본문 필요)",
    body: { ...identity, includeDocument: true }, cachedLinks: warmLinks },
  { key: "coldTitleOnly", label: "cold — 제목만 (신원 없음)",
    body: { requestId: null, title: page.title, includeDocument: false }, cachedLinks: null },
];

async function measure(source, tag) {
  const handler = await loadHandler(source, tag);
  const out = {};
  for (const scenario of SCENARIOS) {
    out[scenario.key] = await run({ ...scenario, page, handler, realFetch });
  }
  return out;
}

const after = await measure(currentSource, "after");
const before =
  baselineSource && baselineSource !== currentSource
    ? await measure(baselineSource, "before")
    : null;

console.log(`\n문서: ${page.title} (pageid ${page.pageid}, revid ${page.revid})`);
if (!before) {
  console.log("baseline 없음 — HEAD와 워킹 트리의 index.ts가 같다. 현재 값만 출력한다.\n");
} else {
  console.log("baseline = HEAD 커밋의 index.ts, after = 현재 워킹 트리\n");
}

const pad = (value, width) => String(value).padStart(width);
console.log("시나리오                                          before   after   차이");
console.log("-".repeat(76));
for (const scenario of SCENARIOS) {
  const a = after[scenario.key];
  const b = before?.[scenario.key];
  const delta = b ? a.total - b.total : null;
  console.log(
    `${scenario.label.padEnd(48)}${pad(b ? b.total : "—", 7)}${pad(a.total, 8)}` +
    `${pad(delta === null ? "—" : (delta > 0 ? `+${delta}` : delta), 7)}`
  );
}

console.log("\n내역 (after):");
for (const scenario of SCENARIOS) {
  const a = after[scenario.key];
  const kinds = Object.entries(a.byKind).map(([k, v]) => `${k}=${v}`).join(", ") || "없음";
  console.log(
    `  ${scenario.label}\n` +
    `    ${a.total}건 (${kinds})  status=${a.status} reused=${a.reused} ` +
    `links=${a.linkCount} html=${a.hasHtml}`
  );
}

const cold = after.coldIdentity.total;
const warm = after.warmPlain.total;
const coldBefore = before?.coldIdentity.total;
const warmBefore = before?.warmPlain.total;
console.log("\n4인 그룹 환산:");
console.log(
  `  게임 진입 (전원 같은 시작 문서): ` +
  (before ? `${coldBefore} + 3×${warmBefore} = ${coldBefore + 3 * warmBefore}건  →  ` : "") +
  `${cold} + 3×${warm} = ${cold + 3 * warm}건`
);
console.log(
  `  대기실 준비 (전원 다른 문서):   ` +
  (before ? `4×${coldBefore} = ${4 * coldBefore}건  →  ` : "") +
  `4×${cold} = ${4 * cold}건`
);
