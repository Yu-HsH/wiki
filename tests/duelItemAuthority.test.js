import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SINGLE_ITEM_IDS, MULTI_ITEM_IDS } from "../data/itemPools.js";
import {
  ACTIVE_DUEL_ITEM_IDS,
  buildDuelInventory,
  canUseDuelItem,
  DUEL_ITEM_COOLDOWN_MS,
  DUEL_ITEM_RESULT,
  getDuelItem,
} from "../data/duelItems.js";
import {
  DUEL_ITEM_FAILURE_CODES,
  DUEL_ITEM_HELPER_FAILURE_CODES,
  DUEL_ITEM_THROWN_CODES,
  FAILURE_KIND,
  getDuelItemFailureMessage,
  isUnconsumedFailure,
  normalizeDuelItemEvent,
  normalizeDuelItemFailure,
  toClientTime,
  UNCONSUMED_FAILURE_CODES,
} from "../services/duelItemService.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

const MIGRATION_PATH = "supabase/migrations/20260904090000_duel_item_authority_v3.sql";
const migrationSource = read(MIGRATION_PATH);
const serviceSource = read("services/duelItemService.js");

/**
 * 트랙 C(패킷 14) 계약 테스트.
 *
 * P1 시점에는 **공유 자원 불변식**만 담는다. 서버 권위(migration·RPC·프론트 이전)의
 * 검사는 P2 이후 이 파일에 붙는다.
 *
 * ## 이 파일이 `TRACKS.md` §2.3-①의 grep을 대신한다
 * §2.3-①은 `grep -c 'highlight_links' data/itemPools.js = 2`를 불변식으로 적었다.
 * **G7 결정(A안) 이후 그 값은 달성할 수 없다** — 원래의 2는
 * `SINGLE_ITEM_IDS` 1 + `MULTI_ITEM_IDS` 1이었고, 후자를 빼는 것이 결정 자체다.
 * 게다가 `grep -c`는 주석까지 세므로 **숫자를 맞추려면 설명을 깎아야 한다.**
 * 지키려던 것은 개수가 아니라 **"`SINGLE_ITEM_IDS`가 그대로인가"** 이므로
 * 배열을 직접 검사한다 `[사용자 판정, 2026-09-04]`.
 *
 * 같은 형태의 선례가 이미 있다 — `tests/explorationRecords.test.js`가 §2.3-④의
 * 싱글 아이템 저장소 키를 설명하면서 **그 리터럴을 따옴표째로는 적지 않는다.**
 * 적는 순간 "4파일 6줄" 개수를 자기가 깨기 때문이다. **이 주석도 같은 이유로
 * 그 키를 인용하지 않는다** — 개수 기반 불변식은 이런 회피를 강요한다.
 */

/* ────────────────────────────────────────────────────────────
 * 1. §2.3-① — 싱글 풀은 이 트랙에서 동결이다
 * ──────────────────────────────────────────────────────────── */

test("§2.3-① SINGLE_ITEM_IDS는 4개 원소가 순서까지 그대로다", () => {
  // 소비자는 트랙 B의 pages/GamePage.jsx다 (useItemSystem 경유).
  // C가 여기를 건드리면 파일 소유권을 지켜도 싱글 아이템이 런타임에 깨진다.
  assert.deepEqual(SINGLE_ITEM_IDS, [
    "highlight_links",
    "search_once",
    "go_back",
    "random_teleport",
  ]);
});

test("§2.3-① highlight_links는 싱글 풀에 남고 1:1 풀에서만 빠진다", () => {
  assert.ok(
    SINGLE_ITEM_IDS.includes("highlight_links"),
    "highlight_links가 싱글 풀에서 사라지면 GamePage.jsx가 깨진다"
  );
  assert.equal(MULTI_ITEM_IDS.includes("highlight_links"), false);
});

/* ────────────────────────────────────────────────────────────
 * 2. G7 결정 — 1:1 풀에서 빠져야 하는 셋
 * ──────────────────────────────────────────────────────────── */

test("MULTI_ITEM_IDS에 highlight_links·mini_game·swap_current가 없다", () => {
  // highlight_links: spec §5.6이 기본 카탈로그에서 뺐다 (싱글에는 남는다).
  // mini_game:       기본 지급에서만 제외. 정의와 room_events event_type은 보존한다.
  // swap_current:    비활성 유지. 클라이언트와 서버(SWAP_DISABLED) 양쪽이 막는다.
  for (const excluded of ["highlight_links", "mini_game", "swap_current"]) {
    assert.equal(
      MULTI_ITEM_IDS.includes(excluded),
      false,
      `${excluded}는 1:1 지급 대상이 아니다`
    );
  }
});

test("mini_game과 swap_current의 정의는 지우지 않는다 (AGENTS.md §4)", async () => {
  const { ITEM_DEFS } = await import("../data/items.js");
  assert.ok(
    ITEM_DEFS.some((item) => item.id === "mini_game"),
    "지급에서 뺀 것이지 삭제한 것이 아니다"
  );
  assert.ok(ITEM_DEFS.some((item) => item.id === "swap_current"));
});

/* ────────────────────────────────────────────────────────────
 * 3. 카탈로그와 지급 목록이 어긋나지 않는다
 * ──────────────────────────────────────────────────────────── */

test("MULTI_ITEM_IDS는 duelItems의 활성 10종과 같은 집합이다", () => {
  assert.deepEqual(
    [...MULTI_ITEM_IDS].sort(),
    [...ACTIVE_DUEL_ITEM_IDS].sort(),
    "지급 목록과 카탈로그가 갈리면 이름 없는 슬롯이 생긴다"
  );
  assert.equal(MULTI_ITEM_IDS.length, 10);
  assert.equal(
    new Set(MULTI_ITEM_IDS).size,
    MULTI_ITEM_IDS.length,
    "중복 ID가 있으면 5슬롯 지급의 중복 배제가 성립하지 않는다"
  );
});

/* ────────────────────────────────────────────────────────────
 * 4. P4 — 서비스의 실패 코드 목록이 migration과 어긋나지 않는다
 *
 * 서비스는 서버 코드의 **사본**을 들고 있다. 사본이 갈리면 HUD가 모르는 코드를 받고
 * 아무 안내도 못 한다. 그래서 목록을 손으로 맞추지 않고 migration에서 뽑아 비교한다 —
 * 카탈로그와 지급 목록을 §3에서 이미 그렇게 묶었고 같은 이유다.
 * ──────────────────────────────────────────────────────────── */

/**
 * migration이 `{ok:false, code:'X'}`로 반환하는 코드 전량.
 *
 * 두 형태가 있다 — 리터럴과 `coalesce(v_move->>'code', 'ITEM_MOVE_REJECTED')`.
 * 후자를 빠뜨리면 `ITEM_MOVE_REJECTED`가 목록에서 사라진다. **그리고 그 coalesce가
 * 헬퍼 코드를 그대로 흘려보내는 지점이기도 하다** — 기본값만 세면 헬퍼 3종이
 * 도착하지 않는 것처럼 보인다.
 */
function returnedFailureCodes() {
  const matches = migrationSource.matchAll(
    /'ok',\s*false,\s*'code',\s*(?:'([A-Z_]+)'|coalesce\([^)]*,\s*'([A-Z_]+)'\))/g
  );
  return [...new Set([...matches].map((match) => match[1] || match[2]))].sort();
}

/** migration이 `raise exception 'X'`로 던지는 코드 전량 */
function raisedFailureCodes() {
  const matches = migrationSource.matchAll(/raise exception '([A-Z_]+)'/g);
  return [...new Set([...matches].map((match) => match[1]))].sort();
}

test("P4 — throw되는 6종이 migration의 raise exception과 정확히 같다", () => {
  assert.deepEqual([...DUEL_ITEM_THROWN_CODES].sort(), raisedFailureCodes());
});

test("P4 — 서비스가 아는 코드가 migration의 ok:false 전량을 덮는다", () => {
  // 계약이 이름 붙인 12종 + 헬퍼가 흘려보내는 3종 = 서버가 실제로 낼 수 있는 전부.
  const known = [
    ...DUEL_ITEM_FAILURE_CODES,
    ...DUEL_ITEM_HELPER_FAILURE_CODES,
  ].sort();
  assert.deepEqual(
    known,
    returnedFailureCodes(),
    "migration이 코드를 늘리면 이 테스트가 먼저 깨진다 — HUD가 모르는 코드를 받기 전에"
  );
});

test("P4 — 계약 12종과 헬퍼 3종은 겹치지 않는다", () => {
  // HANDOFF §3.3의 표는 12종이다. 헬퍼 3종은 그 표에 없는 실측 추가분이므로
  // 두 목록이 섞이면 "계약이 12종"이라는 사실 자체가 흐려진다.
  assert.equal(DUEL_ITEM_FAILURE_CODES.length, 12);
  assert.equal(DUEL_ITEM_HELPER_FAILURE_CODES.length, 3);
  for (const code of DUEL_ITEM_HELPER_FAILURE_CODES) {
    assert.equal(DUEL_ITEM_FAILURE_CODES.includes(code), false, code);
  }
});

test("P4 — 코드 18종 전부에 안내 문구가 있다", () => {
  const fallback = getDuelItemFailureMessage("__NO_SUCH_CODE__");
  for (const code of [
    ...DUEL_ITEM_FAILURE_CODES,
    ...DUEL_ITEM_HELPER_FAILURE_CODES,
    ...DUEL_ITEM_THROWN_CODES,
  ]) {
    const message = getDuelItemFailureMessage(code);
    assert.notEqual(message, fallback, `${code}에 문구가 없어 기본값으로 떨어진다`);
    assert.ok(message.length > 0);
  }
});

/* ────────────────────────────────────────────────────────────
 * 5. P4 — 미소비 3종이 나머지와 구분된다
 *
 * **이 절이 P4의 핵심 산출이다.** HUD는 `failure.slotRestored` 하나로 슬롯을 되살릴지
 * 정한다. 세 코드에서만 참이어야 하고, 그 세 코드는 계약 12종 안에 있어야 한다.
 * ──────────────────────────────────────────────────────────── */

test("P4 — 미소비 3종에서만 slotRestored가 참이다", () => {
  assert.deepEqual([...UNCONSUMED_FAILURE_CODES].sort(), [
    "NO_ELIGIBLE_LINK",
    "REWIND_UNAVAILABLE",
    "UNDO_UNAVAILABLE",
  ]);

  for (const code of DUEL_ITEM_FAILURE_CODES) {
    const failure = normalizeDuelItemFailure({ ok: false, code });
    const expected = UNCONSUMED_FAILURE_CODES.includes(code);
    assert.equal(failure.slotRestored, expected, `${code}의 슬롯 복구 판정이 틀렸다`);
    assert.equal(isUnconsumedFailure(code), expected, code);
    assert.equal(
      failure.kind === FAILURE_KIND.UNCONSUMED,
      expected,
      `${code}의 갈래가 미소비 여부와 어긋난다`
    );
  }
});

test("P4 — 미소비 3종은 계약 12종 안에 있다", () => {
  for (const code of UNCONSUMED_FAILURE_CODES) {
    assert.ok(
      DUEL_ITEM_FAILURE_CODES.includes(code),
      `${code}가 12종 밖으로 나가면 표와 코드가 갈린다`
    );
  }
});

test("P4 — 쿨타임은 남은 시간을 함께 준다", () => {
  const cooldownUntil = Date.now() + 1800;
  const failure = normalizeDuelItemFailure({
    ok: false,
    code: "ITEM_COOLDOWN",
    cooldown_until: new Date(cooldownUntil).toISOString(),
  });

  assert.equal(failure.kind, FAILURE_KIND.COOLDOWN);
  assert.equal(failure.slotRestored, false, "쿨타임은 슬롯 문제가 아니다");
  assert.ok(failure.retryAfterMs > 0);
  assert.ok(
    failure.retryAfterMs <= DUEL_ITEM_COOLDOWN_MS,
    "남은 시간이 공통 쿨타임보다 길 수 없다"
  );
});

test("P4 — 쿨타임이 이미 지났으면 남은 시간은 음수가 아니라 0이다", () => {
  const failure = normalizeDuelItemFailure({
    ok: false,
    code: "ITEM_COOLDOWN",
    cooldown_until: new Date(Date.now() - 5000).toISOString(),
  });
  assert.equal(failure.retryAfterMs, 0, "음수가 새면 setTimeout이 즉시 두 번 돈다");
});

test("P4 — 다시 눌러도 소용없는 것은 두 코드뿐이다", () => {
  const hopeless = DUEL_ITEM_FAILURE_CODES.filter(
    (code) => normalizeDuelItemFailure({ ok: false, code }).retryable === false
  );
  // 아이템이 없는 방(ITEMS_DISABLED)과 끝난 경기(GAME_NOT_ACTIVE)는 같은 답만 돌아온다.
  assert.deepEqual(hopeless.sort(), ["GAME_NOT_ACTIVE", "ITEMS_DISABLED"]);
});

test("P4 — 모르는 코드는 성공으로 새지 않고 REJECTED로 떨어진다", () => {
  const failure = normalizeDuelItemFailure({ ok: false, code: "SOMETHING_NEW_V4" });
  assert.equal(failure.code, "SOMETHING_NEW_V4", "코드 자체는 잃지 않는다");
  assert.equal(failure.kind, FAILURE_KIND.REJECTED);
  assert.equal(failure.slotRestored, false);
  assert.ok(failure.message.length > 0, "안내가 비면 화면이 조용히 아무 말도 안 한다");
});

test("P4 — 헬퍼 3종도 이름이 붙어 도착한다", () => {
  for (const code of DUEL_ITEM_HELPER_FAILURE_CODES) {
    const failure = normalizeDuelItemFailure({ ok: false, code });
    assert.equal(failure.kind, FAILURE_KIND.REJECTED, code);
    assert.equal(failure.retryable, true, code);
  }
});

test("P4 — GAME_NOT_ACTIVE는 서버가 준 room·player 스냅샷을 잃지 않는다", () => {
  // 완주 확정 뒤 도착한 사용이 여기로 온다. 결과 화면이 그 스냅샷을 읽는다.
  const failure = normalizeDuelItemFailure({
    ok: false,
    code: "GAME_NOT_ACTIVE",
    room: { status: "finished" },
    player: { player_status: "finished" },
  });
  assert.equal(failure.room.status, "finished");
  assert.equal(failure.player.player_status, "finished");
});

/* ────────────────────────────────────────────────────────────
 * 6. P4 — 서버 시계를 클라이언트 시계로 옮긴다
 *
 * HANDOFF §3.2가 시간 측정의 함정을 이미 한 번 적었다. 여기는 그 반대편이다 —
 * 서버가 제대로 잰 시각을 클라이언트가 다른 자로 읽으면 같은 버그가 재현된다.
 * ──────────────────────────────────────────────────────────── */

test("P4 — 서버가 앞서 있으면 그만큼 당겨서 준다", () => {
  const serverAhead = 3000;
  const serverExpiry = Date.now() + serverAhead + 2500;
  assert.equal(toClientTime(serverExpiry, serverAhead), serverExpiry - serverAhead);
});

test("P4 — 편차를 재지 못했으면 추정하지 않고 그대로 둔다", () => {
  const value = Date.now() + 1000;
  assert.equal(toClientTime(value, null), value, "server_now가 없는 응답도 있다");
  assert.equal(toClientTime(null, 500), null);
});

test("P4 — 보정된 쿨타임을 canUseDuelItem이 그대로 읽는다", () => {
  // 두 모듈이 같은 자를 쓴다는 것이 이 테스트의 요지다. canUseDuelItem은
  // `Date.now() < context.cooldownUntil`로 비교하므로 epoch ms여야 한다.
  const item = buildDuelInventory([
    { id: "g1", item_id: "blind", slot_index: 0, slot_role: "attack" },
  ])[0];

  const serverSkew = 4000;
  const serverCooldownUntil = Date.now() + serverSkew + 2000;
  const cooldownUntil = toClientTime(serverCooldownUntil, serverSkew);

  assert.equal(canUseDuelItem(item, { cooldownUntil }), false, "아직 쿨타임 중이다");
  assert.equal(
    canUseDuelItem(item, { cooldownUntil: Date.now() - 1 }),
    true,
    "지난 쿨타임은 막지 않는다"
  );
});

/* ────────────────────────────────────────────────────────────
 * 7. P4 — 서버 지급 행의 열 이름을 그대로 받는다
 * ──────────────────────────────────────────────────────────── */

test("P4 — 지급 행의 PK 열은 `id`이고 그것이 grantId가 된다", () => {
  // `ensure_duel_item_grant_v3`는 `to_jsonb(grant_row)`로 내보내므로 열 이름이 그대로다.
  // 테이블의 PK는 `id`다 — `grant_id`가 아니다. 이걸 놓치면 use RPC에 넘길
  // p_grant_id가 null이 되어 아이템을 영영 못 쓴다.
  assert.match(migrationSource, /jsonb_agg\(to_jsonb\(grant_row\)/);
  assert.match(
    migrationSource,
    /create table if not exists public\.duel_item_grants \(\s*\n\s*id uuid primary key/
  );

  const [slot] = buildDuelInventory([
    {
      id: "11111111-1111-1111-1111-111111111111",
      room_id: "room",
      user_id: "user",
      slot_index: 0,
      slot_role: "attack",
      is_wildcard: false,
      item_id: "blind",
      consumed_at: null,
    },
  ]);
  assert.equal(slot.grantId, "11111111-1111-1111-1111-111111111111");
  assert.equal(slot.instanceId, slot.grantId, "key가 슬롯마다 유일해야 한다");
});

test("P4 — 지급 행을 slot_index 순서로 세우고 소비 여부를 옮긴다", () => {
  const inventory = buildDuelInventory([
    { id: "b", item_id: "go_back", slot_index: 2, slot_role: "defense" },
    { id: "a", item_id: "blind", slot_index: 0, slot_role: "attack", consumed_at: "2026-09-04T00:00:00Z" },
    { id: "c", item_id: "link_preview", slot_index: 1, slot_role: "search", is_wildcard: true },
  ]);

  assert.deepEqual(inventory.map((slot) => slot.slotIndex), [0, 1, 2]);
  assert.equal(inventory[0].used, true, "소비된 슬롯은 눌리지 않아야 한다");
  assert.equal(canUseDuelItem(inventory[0], {}), false);
  assert.equal(inventory[1].isWildcard, true);
  assert.equal(inventory[1].name, getDuelItem("link_preview").name);
});

/* ────────────────────────────────────────────────────────────
 * 8. P4 — realtime payload 정규화 (P6이 쓸 입구)
 * ──────────────────────────────────────────────────────────── */

test("P4 — duel_item_event payload를 시각만 바꿔서 옮긴다", () => {
  const serverTimestamp = "2026-09-04T09:00:00.000Z";
  const event = normalizeDuelItemEvent({
    itemEventId: "e1",
    itemId: "link_censorship",
    slotRole: "attack",
    actorUserId: "u1",
    targetUserId: "u2",
    result: DUEL_ITEM_RESULT.APPLIED,
    effectExpiresAt: "2026-09-04T09:00:06.000Z",
    moveEventId: null,
    metadata: { censoredTitles: ["가", "나"] },
    serverTimestamp,
  });

  assert.equal(event.result, "applied");
  assert.equal(event.serverTimestamp, Date.parse(serverTimestamp));
  assert.equal(event.effectExpiresAt, Date.parse("2026-09-04T09:00:06.000Z"));
  assert.deepEqual(event.metadata.censoredTitles, ["가", "나"]);
});

test("P4 — 모르는 result는 void로 넘기지 않고 null로 둔다", () => {
  // void로 뭉개면 새 판정값이 생겼을 때 화면이 "아무 일도 없었다"로 조용히 군다.
  const event = normalizeDuelItemEvent({ result: "half_blocked" });
  assert.equal(event.result, null);
  assert.notEqual(event.result, DUEL_ITEM_RESULT.VOID);

  for (const result of Object.values(DUEL_ITEM_RESULT)) {
    assert.equal(normalizeDuelItemEvent({ result }).result, result);
  }
});

test("P4 — metadata가 없으면 빈 객체로 준다", () => {
  // HUD가 `metadata.censoredTitles`를 바로 읽는다. null이면 거기서 터진다.
  assert.deepEqual(normalizeDuelItemEvent({ itemId: "blind" }).metadata, {});
  assert.equal(normalizeDuelItemEvent(null), null);
});

/* ────────────────────────────────────────────────────────────
 * 9. P4 — 서비스가 지켜야 할 경계 (§8-C 범위 밖·동결 파일)
 * ──────────────────────────────────────────────────────────── */

test("P4 — RPC 3개만 부르고 다른 RPC는 부르지 않는다", () => {
  const called = [...serviceSource.matchAll(/supabase\.rpc\(\s*"([a-z_0-9]+)"/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(called.sort(), [
    "ensure_duel_item_grant_v3",
    "get_duel_item_state_v3",
    "use_duel_item_v3",
  ]);

  // 부르는 이름이 실제로 migration에 있는 함수여야 한다.
  for (const name of called) {
    assert.ok(
      migrationSource.includes(`create or replace function public.${name}(`),
      `${name}이 migration에 없다`
    );
  }
});

test("P4 — 동결 파일에서 요청 ID 두 개만 읽어 온다 (§2.1)", () => {
  const imports = [...serviceSource.matchAll(/import \{([^}]*)\} from "\.\.\/utils\/serverAuthority\.js"/g)];
  assert.equal(imports.length, 1);
  assert.deepEqual(
    imports[0][1].split(",").map((name) => name.trim()).filter(Boolean).sort(),
    ["createCorrelationId", "createRequestId"]
  );
});

test("P4 — multiplayerService의 export 목록을 넓히지 않는다", () => {
  // HANDOFF §3.3: requireSupabase·normalizeRpcRow는 복사해 쓴다. import하면
  // 그 파일이 새 export를 지게 되고 소비자가 늘어난다.
  // **주석이 그 파일을 언급하는 것은 자유다** — 검사 대상은 import 문뿐이다.
  const imported = [...serviceSource.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(
    imported.some((path) => path.includes("multiplayerService")),
    false,
    "복사해 쓰기로 한 것을 import하면 결정이 뒤집힌다"
  );
  assert.deepEqual(imported.sort(), [
    "../data/duelItems.js",
    "../supabaseClient.js",
    "../utils/serverAuthority.js",
  ]);

  assert.match(serviceSource, /function requireSupabase\(\)/);
  assert.match(serviceSource, /function normalizeRpcRow\(data\)/);
});

test("P4 — B 소유 resultReasonLabels는 읽기 전용으로만 닿는다 (§2.2)", () => {
  // 주석이 그 파일을 **언급**하는 것은 자유다. 검사 대상은 실제 import 문이다.
  const labelImports = [
    ...serviceSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*"[^"]*resultReasonLabels[^"]*"/g),
  ];

  // 아이템 거부 문구와 경기 결과 어휘는 축이 다르다 — 지금은 부르지 않는 것이 맞고,
  // 나중에 부르게 되더라도 읽기 전용 호출 하나여야 한다 (B 소유 파일).
  for (const [, names] of labelImports) {
    assert.deepEqual(
      names.split(",").map((name) => name.trim()).filter(Boolean),
      ["getDuelResultLabel"],
      "B 소유 모듈에서 그 밖의 것을 끌어오면 소유권 경계가 무너진다"
    );
  }
  assert.equal(labelImports.length, 0, "P4 시점에는 아직 부르지 않는다");
});

test("P4 — 서비스에 클라이언트 room_events INSERT 경로가 없다 (수용조건 ②)", () => {
  assert.equal(serviceSource.includes('from("room_events")'), false);
  assert.equal(/\.insert\(/.test(serviceSource), false, "쓰기는 전부 RPC 안에서 일어난다");
});

test("P4 — 서비스가 스스로 차단·반사를 판정하지 않는다", () => {
  // 클라이언트 판정 경로가 사라지는 것이 이 트랙의 목적이다 (HANDOFF §3.3 P6-2).
  for (const forbidden of ["isImmune", "cleanse_shield", "backlink_reflect"]) {
    assert.equal(
      serviceSource.includes(forbidden),
      false,
      `${forbidden}이 서비스에 있으면 판정이 다시 클라이언트로 샌다`
    );
  }
});

test("P4 — 신규 파일에 \"/main\" 리터럴이 없다 (§2.2)", () => {
  assert.equal(serviceSource.includes('"/main"'), false);
});
