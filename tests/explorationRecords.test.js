import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  fetchSingleGameRecords,
  fetchSingleRunResult,
  fetchUserStats,
} from "../rankingService.js";
import {
  fetchAllProfileStats,
  fetchSinglePlayerStats,
} from "../services/profileStatsService.js";
import { clearGuestSingleGameProgress } from "../utils/singleGameSession.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

/**
 * 싱글 아이템 저장 키를 **소유자 파일에서 읽어 옵니다.**
 *
 * 이 키는 import되지 않고 문자열이 여러 파일에 복제돼 있습니다 (`TRACKS.md` §2.3-④).
 * 테스트가 리터럴을 또 하나 복제하면 복제 지점만 늘어나므로, `hooks/useItemSystem.js`가
 * 쓰는 값을 읽어 와서 지우는 쪽 파일들이 같은 값을 쓰는지 확인합니다.
 */
async function readSingleItemStorageKey() {
  const source = await readProjectFile("hooks/useItemSystem.js");
  const match = source.match(/mode === "single" \? "([^"]+)" : null/);

  assert.ok(match, "useItemSystem에서 싱글 아이템 저장 키를 찾지 못했다");
  return match[1];
}

function createMemoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    get size() {
      return values.size;
    },
  };
}

function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = String(a);
  const right = String(b);
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * PostgREST 쿼리 빌더의 최소 대역.
 * `select(columns, { count, head })` · `eq` · `lt` · `order` · `limit`만 흉내 냅니다.
 * 모든 호출을 기록하므로 "순위를 누가 셌는가"를 테스트가 직접 확인할 수 있습니다.
 */
function createFakeClient(rows) {
  const calls = [];

  return {
    calls,
    from(table) {
      const state = {
        table,
        columns: null,
        count: null,
        head: false,
        filters: [],
        order: [],
        limit: null,
      };

      const builder = {
        select(columns, options = {}) {
          state.columns = columns;
          state.count = options.count ?? null;
          state.head = Boolean(options.head);
          return builder;
        },
        eq(column, value) {
          state.filters.push(["eq", column, value]);
          return builder;
        },
        lt(column, value) {
          state.filters.push(["lt", column, value]);
          return builder;
        },
        order(column, options) {
          state.order.push([column, options]);
          return builder;
        },
        limit(value) {
          state.limit = value;
          return builder;
        },
        then(resolve, reject) {
          calls.push(state);
          try {
            resolve(runQuery());
          } catch (error) {
            reject(error);
          }
        },
      };

      function runQuery() {
        let result = rows.filter((row) =>
          state.filters.every(([operator, column, value]) => {
            if (operator === "eq") return row[column] === value;
            if (operator === "lt") return compareValues(row[column], value) < 0;
            return true;
          })
        );

        for (const [column, options] of [...state.order].reverse()) {
          const direction = options?.ascending === false ? -1 : 1;
          result = [...result].sort(
            (a, b) => direction * compareValues(a[column], b[column])
          );
        }

        if (state.limit != null) result = result.slice(0, state.limit);
        if (state.head) return { data: null, count: result.length, error: null };
        return { data: result, count: null, error: null };
      }

      return builder;
    },
  };
}

/**
 * 이 고정 데이터의 핵심은 `run-mine`과 `run-twin`이 **시간·이동 횟수·목표 문서가 전부 같다**는
 * 점입니다. 옛 클라이언트 매칭(`findIndex`)은 이 둘을 구분하지 못했습니다.
 */
const RECORDS = [
  {
    id: "rec-fast",
    run_id: "run-fast",
    user_id: "user-a",
    player_name: "빠른발",
    start_title: "시작",
    target_title: "다른 목표",
    elapsed_seconds: 30,
    click_count: 4,
    path_titles: ["시작", "다른 목표"],
    result_status: "completed",
    created_at: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "rec-twin",
    run_id: "run-twin",
    user_id: "user-b",
    player_name: "쌍둥이기록",
    start_title: "시작",
    target_title: "목표 문서",
    elapsed_seconds: 45,
    click_count: 7,
    path_titles: ["시작", "목표 문서"],
    result_status: "completed",
    created_at: "2026-09-02T00:00:00.000Z",
  },
  {
    id: "rec-mine",
    run_id: "run-mine",
    user_id: "user-me",
    player_name: "나",
    start_title: "시작",
    target_title: "목표 문서",
    elapsed_seconds: 45,
    click_count: 7,
    path_titles: ["시작", "중간", "목표 문서"],
    result_status: "completed",
    created_at: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "rec-slow",
    run_id: "run-slow",
    user_id: "user-me",
    player_name: "나",
    start_title: "시작",
    target_title: "느린 목표",
    elapsed_seconds: 60,
    click_count: 12,
    path_titles: ["시작", "느린 목표"],
    result_status: "completed",
    created_at: "2026-09-03T01:00:00.000Z",
  },
];

/* ────────────────────────────────────────────────────────────
 * (1) 싱글 결과 순위가 서버 값에서 온다 — 클라이언트 매칭 부재
 * ──────────────────────────────────────────────────────────── */

test("(1) 순위는 서버 count가 센 값이다 — 나보다 앞선 기록 수 + 1", async () => {
  const client = createFakeClient(RECORDS);
  const result = await fetchSingleRunResult({ runId: "run-mine", client });

  // 30초 1건(더 빠름) + 45초 동률 중 먼저 기록된 1건 = 앞선 기록 2건
  assert.equal(result.rank, 3);
  assert.equal(result.totalCount, 4);
  assert.equal(result.record.id, "rec-mine");
});

test("(1) 순위 계산이 head count 쿼리로 서버에서 일어난다", async () => {
  const client = createFakeClient(RECORDS);
  await fetchSingleRunResult({ runId: "run-mine", client });

  const countCalls = client.calls.filter(
    (call) => call.head === true && call.count === "exact"
  );

  assert.equal(countCalls.length, 3, "더 빠른 건·동률 선행 건·전체 건을 서버가 센다");
  assert.ok(
    countCalls.every((call) => call.table === "game_records"),
    "순위는 game_records에서 나온다"
  );
});

test("(1) 시간·이동·목표가 같은 남의 기록을 자기 것으로 오인하지 않는다", async () => {
  const client = createFakeClient(RECORDS);
  const result = await fetchSingleRunResult({ runId: "run-mine", client });
  const twin = RECORDS.find((record) => record.id === "rec-twin");

  // 옛 findIndex 매칭 기준(3값 일치)으로는 두 기록이 구분되지 않았다.
  assert.equal(result.record.elapsedSeconds, twin.elapsed_seconds);
  assert.equal(result.record.clickCount, twin.click_count);
  assert.equal(result.record.targetTitle, twin.target_title);

  // 그런데 run_id로 조회하므로 실제로 집힌 행은 내 것이다.
  assert.equal(result.record.runId, "run-mine");
  assert.notEqual(result.record.id, twin.id);
  assert.deepEqual(result.record.pathTitles, ["시작", "중간", "목표 문서"]);
});

test("(1) 결과 화면이 랭킹 목록을 훑어 자기 순위를 추측하지 않는다", async () => {
  const overlaySource = await readProjectFile("components/SuccessOverlay.jsx");

  assert.doesNotMatch(overlaySource, /findIndex/);
  assert.doesNotMatch(overlaySource, /myRankIndex/);
  assert.match(overlaySource, /fetchSingleRunResult\(\{ runId \}\)/);
});

test("(1) 결과 화면에 서버 런 식별자가 전달된다", async () => {
  const gamePageSource = await readProjectFile("pages/GamePage.jsx");

  assert.match(gamePageSource, /runId=\{serverRun\?\.id \?\? null\}/);
  assert.match(gamePageSource, /onReturnToLobby=\{handleGiveUp\}/);
});

test("(1) 서버에 확정된 기록이 없으면 순위를 지어내지 않는다", async () => {
  const client = createFakeClient(RECORDS);

  assert.equal(await fetchSingleRunResult({ runId: "run-missing", client }), null);
  assert.equal(await fetchSingleRunResult({ runId: null, client }), null);
  assert.equal(await fetchSingleRunResult({ client }), null);
});

/* ────────────────────────────────────────────────────────────
 * (2) 결과 화면과 프로필 history가 같은 조회 경로를 쓴다
 * ──────────────────────────────────────────────────────────── */

test("(2) 같은 런의 값이 결과 화면과 기록 조회에서 일치한다", async () => {
  const resultClient = createFakeClient(RECORDS);
  const historyClient = createFakeClient(RECORDS);

  const result = await fetchSingleRunResult({
    runId: "run-mine",
    client: resultClient,
  });
  const [historyRecord] = await fetchSingleGameRecords({
    runId: "run-mine",
    client: historyClient,
  });

  assert.deepEqual(result.record, historyRecord);
});

test("(2) 결과 화면과 history가 같은 컬럼 목록을 읽는다", async () => {
  const resultClient = createFakeClient(RECORDS);
  const historyClient = createFakeClient(RECORDS);

  await fetchSingleRunResult({ runId: "run-mine", client: resultClient });
  await fetchSingleGameRecords({ userId: "user-me", client: historyClient });

  const resultColumns = resultClient.calls.find((call) => !call.head).columns;
  const historyColumns = historyClient.calls.find((call) => !call.head).columns;

  assert.equal(resultColumns, historyColumns);
  assert.match(resultColumns, /run_id/);
  assert.match(resultColumns, /result_status/);
});

test("(2) 단일 조회 경로가 시간 → 기록 시각 순서를 유지한다", async () => {
  const client = createFakeClient(RECORDS);
  const records = await fetchSingleGameRecords({ userId: "user-me", client });

  assert.deepEqual(
    records.map((record) => record.id),
    ["rec-mine", "rec-slow"]
  );
  assert.equal(records[0].elapsedSeconds, 45);
});

test("(2) fetchUserStats가 단일 조회 경로를 지난다", async () => {
  const source = await readProjectFile("rankingService.js");

  assert.match(
    source,
    /export async function fetchUserStats\(userId\) \{[\s\S]*?await fetchSingleGameRecords\(\{ userId \}\)/
  );

  // 게스트 식별자는 조회 이전에 막힌다.
  const stats = await fetchUserStats("guest-abcdefg");
  assert.deepEqual(stats, { gamesPlayed: 0, bestTime: null, recentRecords: [] });
});

test("(2) 프로필 전적이 결과 화면과 같은 조회 경로를 지난다", async () => {
  const statsClient = createFakeClient(RECORDS);
  const resultClient = createFakeClient(RECORDS);

  const stats = await fetchSinglePlayerStats("user-me", { client: statsClient });
  const result = await fetchSingleRunResult({ runId: "run-mine", client: resultClient });

  const statsColumns = statsClient.calls.find((call) => !call.head).columns;
  const resultColumns = resultClient.calls.find((call) => !call.head).columns;

  assert.equal(statsColumns, resultColumns);
  assert.equal(stats.totalWins, 2);
  assert.equal(stats.bestTime, 45);
  assert.equal(stats.bestClicks, 7);

  // 프로필이 최고 기록으로 보는 값과 결과 화면이 표시하는 값이 같은 행에서 나온다.
  assert.equal(stats.bestTime, result.record.elapsedSeconds);
});

test("(2) fetchAllProfileStats의 반환 형태는 바뀌지 않는다", async () => {
  const stats = await fetchAllProfileStats("guest-abcdefg");

  assert.deepEqual(Object.keys(stats).sort(), ["group", "pvp", "single"]);
  assert.deepEqual(stats.single, { totalWins: 0, bestTime: null, bestClicks: null });
  assert.deepEqual(stats.pvp, { wins: 0, losses: 0, winRate: 0 });
  assert.deepEqual(stats.group, { first: 0, second: 0, third: 0 });
});

test("(2) 게스트 식별자는 전적 조회 이전에 막힌다", async () => {
  const client = createFakeClient(RECORDS);
  const stats = await fetchSinglePlayerStats("guest-abcdefg", { client });

  assert.deepEqual(stats, { totalWins: 0, bestTime: null, bestClicks: null });
  assert.equal(client.calls.length, 0, "게스트는 쿼리 자체가 나가지 않는다");
});

/* ────────────────────────────────────────────────────────────
 * (3) 게스트 완주·포기 후 영구 행 0
 * ──────────────────────────────────────────────────────────── */

test("(3) 게스트 식별자로는 기록이 저장되지 않는다", async (t) => {
  const storage = createMemoryStorage();
  const original = globalThis.localStorage;
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.localStorage = original;
  });

  const { saveGameRecord } = await import("../rankingService.js");

  await saveGameRecord({
    userId: "guest-abcdefg",
    playerName: "게스트",
    startTitle: "시작",
    targetTitle: "목표 문서",
    elapsedSeconds: 45,
    clickCount: 7,
    pathTitles: ["시작", "목표 문서"],
  });

  assert.equal(storage.size, 0, "게스트 완주가 로컬 기록조차 만들지 않는다");
  assert.equal(storage.getItem("wiki_game_records"), null);
});

test("(3) 게스트 완주는 서버에서도 game_records 행을 만들지 않는다", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260814091000_server_authority_rpc_v2.sql"
  );

  const guestMove = migration.slice(
    migration.indexOf("function public.apply_guest_single_move_v2"),
    migration.indexOf("function public.leave_single_game_run")
  );

  assert.ok(guestMove.length > 0, "게스트 이동 RPC를 찾지 못했다");
  assert.doesNotMatch(guestMove, /insert into public\.game_records/);

  // 로그인 사용자 경로에는 그 insert가 있다 — 두 경로가 실제로 다르다는 확인이다.
  const authedMove = migration.slice(
    migration.indexOf("function public.apply_single_move_v2"),
    migration.indexOf("function public.apply_guest_single_move_v2")
  );
  assert.match(authedMove, /insert into public\.game_records/);
});

test("(3) 게스트 포기는 런 상태만 바꾸고 영구 기록을 남기지 않는다", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260814091000_server_authority_rpc_v2.sql"
  );

  const leaveRun = migration.slice(
    migration.indexOf("function public.leave_single_game_run")
  );

  assert.doesNotMatch(leaveRun, /insert into public\.game_records/);
  assert.match(leaveRun, /set status = 'abandoned'/);
});

test("(3) 결과 저장 경로가 게스트를 가장 먼저 판정한다", async () => {
  const appSource = await readProjectFile("App.jsx");

  const handler = appSource.slice(
    appSource.indexOf("const handleSaveRecord"),
    appSource.indexOf("const handleReturnLobby")
  );

  const guestBranch = handler.indexOf("if (isGuestGame)");
  const finalizedBranch = handler.indexOf("if (result?.serverFinalized)");

  assert.ok(guestBranch >= 0 && finalizedBranch >= 0);
  assert.ok(
    guestBranch < finalizedBranch,
    "게스트에게 '랭킹 기록을 확정했습니다'라고 알리면 안 된다"
  );
  assert.doesNotMatch(handler, /saveGameRecord\([\s\S]*guest/i);
});

test("(3) 온라인 경로는 게스트에게 열리지 않는다", async () => {
  const mainPageSource = await readProjectFile("pages/MainPage.jsx");

  assert.match(mainPageSource, /disabled=\{user\.isGuest\}/);
  assert.match(
    mainPageSource,
    /if \(user\.isGuest\) return;[\s\S]*?navigate\("\/multiplayer"\);/
  );
});

test("(3) 로그인 창은 단일 modal 상태로만 열린다", async () => {
  const introSource = await readProjectFile("pages/IntroPage.jsx");

  const modalStates = introSource.match(/useState\(false\)/g) || [];
  assert.equal(modalStates.length, 1, "로그인 modal 상태는 하나뿐이어야 한다");
  assert.match(introSource, /const \[showLogin, setShowLogin\] = useState\(false\);/);
  assert.equal((introSource.match(/<LoginPage isEmbedded \/>/g) || []).length, 1);
});

/* ────────────────────────────────────────────────────────────
 * (4) 게스트 세션 정리가 아이템 저장 키까지 지운다
 * ──────────────────────────────────────────────────────────── */

test("(4) 게스트 세션 정리가 싱글 아이템 상태까지 지운다", async () => {
  const itemStorageKey = await readSingleItemStorageKey();
  const storage = createMemoryStorage({
    "wiki-guest-single-game-state": "guest-session",
    "wiki-single-game-state": "legacy-session",
    [itemStorageKey]: "guest-items",
    "wiki-online-game-state": "server-session-marker",
  });

  clearGuestSingleGameProgress(storage);

  assert.equal(storage.getItem("wiki-guest-single-game-state"), null);
  assert.equal(storage.getItem("wiki-single-game-state"), null);
  assert.equal(storage.getItem(itemStorageKey), null);
  // 1:1·그룹 세션은 싱글 정리의 대상이 아니다.
  assert.equal(storage.getItem("wiki-online-game-state"), "server-session-marker");
});

test("(4) 로그인 사용자 정리 경로도 같은 아이템 키를 지운다", async () => {
  const gamePageSource = await readProjectFile("pages/GamePage.jsx");

  const clearFn = gamePageSource.slice(
    gamePageSource.indexOf("const clearSingleGameState"),
    gamePageSource.indexOf("const setAuthoritativeRun")
  );

  assert.match(clearFn, /clearGuestSingleGameProgress\(\)/);
  assert.ok(
    clearFn.includes(`removeItem("${await readSingleItemStorageKey()}")`),
    "로그인 사용자 경로가 아이템 저장 키를 지우지 않는다"
  );
});

test("(4) TRACKS §2.3-④ — 쓰는 쪽과 지우는 쪽이 같은 저장 키를 쓴다", async () => {
  // 쓰는 쪽은 `hooks/useItemSystem.js`(트랙 C), 지우는 쪽은 아래 셋(트랙 B)이다.
  // 한쪽만 이름을 바꾸면 컴파일러도 기존 테스트도 잡지 못하고,
  // 게스트 아이템 상태가 조용히 다음 게임으로 새어 나간다 (패킷 17 §6).
  const itemStorageKey = await readSingleItemStorageKey();
  const erasers = [
    "utils/singleGameSession.js",
    "pages/GamePage.jsx",
    "tests/guestSingleSession.test.js",
  ];

  for (const eraser of erasers) {
    const source = await readProjectFile(eraser);
    assert.ok(
      source.includes(`"${itemStorageKey}"`),
      `${eraser}가 ${itemStorageKey}를 더 이상 지우지 않는다`
    );
  }
});
