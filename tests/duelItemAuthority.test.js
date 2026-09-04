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
  DUEL_ITEM_ROLE,
  getDuelItem,
  getDuelItemsByRole,
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

// P5. JSX는 `node --test`가 import하지 못하므로(변환기가 없다) 소스를 읽어 계약을
// 검사한다 — `tests/profileCard.test.js`가 이미 쓰는 방식이다.
const barSource = read("components/DuelItemBar.jsx");
const cssSource = read("css/multiplayer.css");

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

/* ────────────────────────────────────────────────────────────
 * 10. P5 — 실패 봉투의 두 값이 서로 다른 것을 뜻한다
 *
 * `slotRestored`는 "로컬에서 증명되는 미소비", `refetchState`는 "서버와 갈렸을 수 있음"이다.
 * **`slotRestored === false`가 "소비됐다"가 아니라는 것**이 이 절의 요지다 —
 * 헬퍼 3종이 정확히 그 반례다.
 * ──────────────────────────────────────────────────────────── */

test("P5 — 어떤 실패 코드도 슬롯을 소비하지 않는다 (migration 실측)", () => {
  // consumed_at을 쓰는 곳이 하나뿐이고, 그것이 원장 INSERT보다 뒤에 있다는 것이
  // "실패는 슬롯을 먹지 않는다"의 증명이다. 둘 중 하나라도 어긋나면 HUD의
  // 낙관적 갱신 금지 규칙이 근거를 잃는다.
  const writes = [...migrationSource.matchAll(/set consumed_at = /g)];
  assert.equal(writes.length, 1, "consumed_at을 쓰는 지점이 늘면 이 판정을 다시 해야 한다");

  const consumeAt = migrationSource.indexOf("set consumed_at = ");
  const ledgerInsertAt = migrationSource.indexOf("insert into public.duel_item_events(");
  assert.ok(ledgerInsertAt > 0);
  assert.ok(
    consumeAt > ledgerInsertAt,
    "소비가 원장 INSERT보다 앞서면 실패 경로에서도 슬롯이 사라질 수 있다"
  );
});

test("P5 — 헬퍼 3종은 미소비인데 slotRestored가 거짓이다 — refetchState가 잡는다", () => {
  for (const code of DUEL_ITEM_HELPER_FAILURE_CODES) {
    const failure = normalizeDuelItemFailure({ ok: false, code });
    assert.equal(failure.slotRestored, false, `${code}: 로컬에서 증명되지 않는다`);
    assert.equal(
      failure.refetchState,
      true,
      `${code}: 소비되지 않았는데 재조회 신호까지 없으면 HUD가 슬롯을 잃은 것처럼 보인다`
    );
  }
});

test("P5 — slotRestored와 refetchState는 동시에 참이 되지 않는다", () => {
  // 겹치면 HUD가 즉시 되살리면서 동시에 재조회한다 — 되살린 슬롯이 깜빡인다.
  const codes = [
    ...DUEL_ITEM_FAILURE_CODES,
    ...DUEL_ITEM_HELPER_FAILURE_CODES,
    "SOMETHING_NEW_V4",
  ];
  for (const code of codes) {
    const failure = normalizeDuelItemFailure({ ok: false, code });
    assert.equal(
      failure.slotRestored && failure.refetchState,
      false,
      `${code}에서 두 신호가 겹친다`
    );
  }
});

test("P5 — 모든 실패 코드가 두 신호 중 하나로는 처리된다", () => {
  // 둘 다 거짓인 코드는 HUD가 "무엇을 해야 하는지" 모른다. 남는 것은 쿨타임과
  // 아이템 없는 방·끝난 경기 — 셋 다 슬롯 관점을 건드릴 필요가 없는 갈래다.
  const unhandled = [...DUEL_ITEM_FAILURE_CODES, ...DUEL_ITEM_HELPER_FAILURE_CODES].filter(
    (code) => {
      const failure = normalizeDuelItemFailure({ ok: false, code });
      return !failure.slotRestored && !failure.refetchState;
    }
  );
  assert.deepEqual(unhandled.sort(), [
    "GAME_NOT_ACTIVE",
    "ITEMS_DISABLED",
    "ITEM_COOLDOWN",
  ]);
});

test("P5 — 모르는 코드는 재조회로 떨어진다", () => {
  // 서버가 코드를 늘렸을 때 안전한 쪽으로 기울인다 — 물어보는 것이 잃는 것보다 낫다.
  const failure = normalizeDuelItemFailure({ ok: false, code: "SOMETHING_NEW_V4" });
  assert.equal(failure.refetchState, true);
});

/* ────────────────────────────────────────────────────────────
 * 11. P5 — HUD가 슬롯 상태를 스스로 만들지 않는다
 * ──────────────────────────────────────────────────────────── */

test("P5 — DuelItemBar는 used를 로컬에서 쓰지 않고 서버 값만 읽는다", () => {
  // `item.used`를 읽는 것은 표시이고, 그 값에 대입하면 낙관적 갱신이 된다.
  assert.match(barSource, /item\.used/, "서버가 준 소비 상태는 그려야 한다");
  assert.equal(
    /used\s*[:=][^=]/.test(barSource.replace(/item\.used/g, "")),
    false,
    "used에 값을 넣는 곳이 있으면 슬롯 상태의 출처가 둘이 된다"
  );

  // 대기 표시는 별도 prop이다 — 소비 표시와 섞지 않는다.
  assert.match(barSource, /pendingGrantId/);
});

test("P5 — 두 신호를 실제로 나눠 읽는다", () => {
  assert.match(barSource, /failure\.refetchState/);
  assert.match(barSource, /failure\.slotRestored/);
  assert.match(barSource, /onRequestStateRefresh/);
});

test("P5 — 같은 실패로 재조회를 두 번 부르지 않는다", () => {
  // 부모가 리렌더될 때마다 RPC가 나가면 거부 하나가 조회 폭풍이 된다.
  assert.match(barSource, /handledFailure/);
  assert.match(barSource, /useRef/);
});

test("P5 — HUD가 RPC를 직접 부르지 않는다", () => {
  // **주석이 서비스를 언급하는 것은 자유다** — 값의 출처를 적어 두는 것이 그 주석의
  // 일이다. 검사 대상은 import 문과 실제 호출뿐이다.
  const imported = [...barSource.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]);
  for (const forbidden of ["duelItemService", "supabaseClient"]) {
    assert.equal(
      imported.some((path) => path.includes(forbidden)),
      false,
      `${forbidden}을 import하면 HUD가 서버 호출을 갖게 된다 — 소유자는 부모다`
    );
  }
  assert.equal(/\.rpc\(/.test(barSource), false, "RPC 호출문이 없다");
  assert.equal(/await\s/.test(barSource), false, "HUD에 비동기 경로가 없다");
});

test("P5 — HUD도 차단·반사를 판정하지 않는다", () => {
  assert.equal(barSource.includes("isImmune"), false);
  // 서버가 이미 걸러 준 목록을 그리기만 한다.
  assert.match(barSource, /activeEffects/);
  assert.match(barSource, /pendingDefenses/);
});

test("P5 — ItemBar.jsx를 import하지 않고 그 prop 계약도 그대로다 (§2.3-③)", () => {
  // 주석은 그 파일을 언급한다 ("ItemBar.jsx는 건드리지 않는다"). 검사는 import만 본다.
  const imported = [...barSource.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(
    imported.some((path) => /ItemBar/.test(path)),
    false,
    "1:1과 싱글의 prop 계약을 얽지 않는다"
  );

  // ItemBar.jsx는 이 트랙에서 무수정이다 — 소비자가 트랙 B의 GamePage.jsx다.
  // 파일 전체를 붙여 놓는 대신 **동결된 것은 prop 계약**이므로 그것을 고정한다.
  const itemBarSource = read("components/ItemBar.jsx");
  const [, propBlock] = itemBarSource.match(
    /export default function ItemBar\(\{([^}]*)\}/
  );
  assert.deepEqual(
    propBlock
      .split(",")
      .map((name) => name.split("=")[0].trim())
      .filter(Boolean),
    ["inventory", "onUseItem", "canUseItem"]
  );
});

test("P5 — HUD가 끌어오는 모듈은 react와 1:1 카탈로그뿐이다", () => {
  const imported = [...barSource.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(imported.sort(), ["../data/duelItems.js", "react"]);
});

test("P5 — 신규 파일에 \"/main\" 리터럴과 room_events INSERT가 없다", () => {
  assert.equal(barSource.includes('"/main"'), false);
  assert.equal(barSource.includes('from("room_events")'), false);
});

/* ────────────────────────────────────────────────────────────
 * 12. P5 — CSS는 추가만 한다 (§2.3-⑤ · 수용조건 ⑥)
 *
 * 불변식이 **개수를 고정**하므로 새 규칙에 `mp-` 접두사를 쓸 수 없다.
 * 줄 맨 앞의 `.mp-`가 세어지기 때문에 하위 선택자로도 못 쓴다.
 * ──────────────────────────────────────────────────────────── */

test("P5 — ^.mp- 선택자가 131개이고 목록이 글자까지 같다", () => {
  const selectors = cssSource.split("\n").filter((line) => line.startsWith(".mp-"));
  assert.equal(selectors.length, 131, "§2.3-⑤은 개수를 고정한다 — 추가도 삭제도 0이다");
  // 기존 파일에 중복 정의가 2건 있다 — `.mp-game-page`와 `.mp-opponent-panel`이
  // 각각 두 번 선언된다. **P5가 만든 것이 아니고 고치는 것도 이 트랙 범위가 아니다**
  // (개명·삭제 0건). 여기서는 그 수가 늘지 않는 것만 고정한다.
  assert.equal(
    selectors.length - new Set(selectors).size,
    2,
    "중복이 늘거나 줄면 기존 규칙을 건드린 것이다"
  );

  // 새 어휘가 기존 어휘로 새어 들어가지 않는다. `.mp-game-main .duel-item-bar` 같은
  // 하위 선택자 한 줄만 있어도 개수가 132가 되므로, 이것이 개수 게이트의 실질적인
  // 방어선이다.
  for (const selector of selectors) {
    assert.equal(selector.includes("duel-item"), false, selector);
  }
});

test("P5 — 새 규칙은 파일 끝의 한 덩어리이고 전부 .duel-item- 접두사다", () => {
  const blockStart = cssSource.indexOf("   DUEL ITEM BAR");
  assert.ok(blockStart > 0, "추가 블록에 머리말이 있어야 다음 트랙이 경계를 안다");

  // 새 어휘가 그 덩어리 밖에 흩어져 있지 않다 — 되돌림 단위를 한 덩어리로 유지한다.
  assert.equal(
    cssSource.slice(0, blockStart).includes("duel-item"),
    false,
    "추가는 파일 끝에만 붙는다"
  );

  const newSelectors = cssSource
    .slice(blockStart)
    .split("\n")
    .filter((line) => /^\.[a-z]/.test(line))
    .map((line) => line.trim());

  assert.ok(newSelectors.length > 0, "P5는 CSS를 실제로 추가한다");
  for (const selector of newSelectors) {
    assert.ok(
      selector.startsWith(".duel-item-"),
      `${selector} — mp- 접두사는 개수 불변식을 깨고, 그 밖의 접두사는 어휘를 흩는다`
    );
  }
});

test("P5 — JSX가 쓰는 클래스와 CSS 규칙이 정확히 맞는다", () => {
  const pattern = /duel-item-[a-z]+(?:__[a-z-]+)?(?:--[a-z]+)?/g;
  const used = new Set([...barSource.matchAll(pattern)].map((match) => match[0]));
  const defined = new Set(
    [...cssSource.matchAll(new RegExp(`\\.(${pattern.source})`, "g"))].map(
      (match) => match[1]
    )
  );

  // 템플릿 리터럴로 만들어지는 이름은 정적으로 안 잡힌다 — 값의 출처가 정해져 있으니
  // 그 목록으로 펼친다. 역할 4종과 실패 갈래 5종이다.
  for (const role of ["attack", "search", "defense", "joker"]) {
    used.add(`duel-item-slot--${role}`);
  }
  for (const kind of Object.values(FAILURE_KIND)) {
    used.add(`duel-item-notice--${kind}`);
  }

  assert.deepEqual(
    [...used].filter((name) => !defined.has(name)).sort(),
    [],
    "CSS 규칙이 없는 클래스 — 화면에서 조용히 스타일 없이 그려진다"
  );
  assert.deepEqual(
    [...defined].filter((name) => !used.has(name)).sort(),
    [],
    "쓰이지 않는 규칙 — 남겨 두면 다음 트랙이 지워도 되는지 알 수 없다"
  );
});

/* ────────────────────────────────────────────────────────────
 * 13. P5 — link_preview: 범위 안에서 하는 것과 부채로 남기는 것
 * ──────────────────────────────────────────────────────────── */

test("P5 — 미리보기 UI가 DuelItemBar 안에 있다 (Q4 결정)", () => {
  assert.match(barSource, /DuelLinkPreviewPanel/);
  assert.match(barSource, /linkPreview/);
  // 별도 컴포넌트 파일을 만들지 않기로 한 결정이므로 파일이 늘지 않아야 한다.
  assert.equal(barSource.includes("LinkPreview.jsx"), false);
});

test("P5 — 미리보기 본문을 컴포넌트가 스스로 가져오지 않는다", () => {
  // 부채 ①. fetch를 여기 두면 abort·캐시·중복요청이 HUD로 들어온다.
  // 부채 주석이 `fetchPageSummary`를 **이름으로 지목한다** — 그것이 부채를 등재하는
  // 방식이다. 검사는 import와 실제 호출만 본다.
  const imported = [...barSource.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(
    imported.some((path) => path.includes("wikiService")),
    false,
    "요약 조회를 HUD가 갖게 되면 abort·캐시·중복요청까지 따라온다"
  );
  for (const call of [/fetchPageSummary\(/, /fetchSummary\(/, /[^a-zA-Z]fetch\(/]) {
    assert.equal(call.test(barSource.replace(/\/\*[\s\S]*?\*\//g, "")), false, String(call));
  }
  // 대신 부모가 내려 준 것을 그린다.
  assert.match(barSource, /entries\[selectedTitle\]/);
});

test("P5 — 범위 안에서 실제로 보여 주는 것: 제목·남은 횟수·카운트다운·봉인", () => {
  assert.match(barSource, /candidate\.censored/, "봉인된 링크 표시는 요약 없이도 쓸모가 있다");
  assert.match(barSource, /remainingPreviews/);
  assert.match(barSource, /formatSeconds/);
});

test("P5 — 요약이 없는 상태에도 빈 칸이 아니라 안내가 나온다", () => {
  // 부채 ①이 닫히기 전까지 실제로 보이는 화면이다.
  assert.match(barSource, /요약 연결은 준비 중입니다/);
});

test("P5 — 부채 2건이 파일에 등재돼 있고 ①은 닫힌 것으로 기록돼 있다", () => {
  // 부채가 조용히 사라지지 않게 고정한다. `random_teleport` 부채의 선례와 같은 방식이다.
  // **닫힌 부채도 지우지 않는다** — 왜 그렇게 돼 있는지가 기록으로 남아야 한다.
  assert.match(barSource, /부채 ① 닫힘/, "요약 본문 연결 — P7이 닫았다");
  assert.match(barSource, /부채 ②/, "maxPreviews 서버 권위 부재 — v4 범위로 열려 있다");
  assert.match(barSource, /maxPreviews/);
});

test("P5 — ⚠ maxPreviews에 서버 권위가 없다는 것이 사실이다 (실측)", () => {
  // 부채 ②의 근거. 서버가 미리보기를 세는 순간 이 테스트가 깨지고, 그때
  // 클라이언트 제한을 서버 값으로 바꿔야 한다.
  // "preview"가 migration에 나오는 곳은 카탈로그의 `link_preview` **아이템 ID 하나뿐**이다.
  // 카운터 열도, 한도 상수도, 원장 행도 없다.
  const previewMentions = [...migrationSource.matchAll(/preview[a-z_]*/gi)].map((m) => m[0]);
  assert.deepEqual(
    [...new Set(previewMentions)],
    ["preview"],
    "migration이 미리보기를 세기 시작했다 — 부채 ②를 닫을 때가 됐다"
  );
  // 두 곳이다 — 카탈로그 행(`:79`)과 지급 테이블의 item_id CHECK(`:135`).
  // 둘 다 **아이템 ID를 적은 것**이고 미리보기를 세는 것이 아니다.
  assert.equal(previewMentions.length, 2, "등장 지점이 늘면 서버가 미리보기를 다루기 시작한 것이다");
  assert.match(migrationSource, /duel_item_grants_item_id_check[\s\S]*?'link_preview'/);

  // 카탈로그 행은 지속 15초 · charges 0뿐이다.
  assert.match(migrationSource, /\('link_preview',\s*'search',\s*15000,\s*0,/);

  // 그래서 3회는 카탈로그(클라이언트)에만 있는 값이다.
  assert.equal(getDuelItem("link_preview").maxPreviews, 3);
});

/* ────────────────────────────────────────────────────────────
 * 8. P7 — 안내 문구
 * ──────────────────────────────────────────────────────────── */

test("P7 — 아이템 안내를 카탈로그에서 만든다 (베끼지 않는다)", () => {
  const pageSource = read("pages/MultiplayerPage.jsx");

  // ① 카탈로그를 읽는다. `getDuelItemsByRole`이 비활성 아이템을 이미 걸러 주므로
  //    안내가 `swap_current`를 그릴 방법이 없다.
  const imported = [...pageSource.matchAll(/from\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    imported.includes("../data/duelItems"),
    "안내가 카탈로그를 import하지 않는다"
  );
  assert.match(pageSource, /getDuelItemsByRole\(/);
  assert.equal(
    getDuelItemsByRole(DUEL_ITEM_ROLE.JOKER).some((item) => item.id === "swap_current"),
    false
  );

  // ② 손으로 적은 아이템 항목이 없다.
  //    옛 목록이 어긋난 이유가 정확히 이것이었다 — 10줄이 리터럴로 적혀 있어서
  //    지워진 셋(`translate_current`·`highlight_links`·`swap_current`)과 비활성된
  //    `mini_game`이 남고, 새로 들어온 넷은 빠졌다. **설명이 카탈로그를 베끼면
  //    카탈로그가 바뀔 때 같이 바뀌지 않는다.**
  assert.doesNotMatch(
    pageSource,
    /<li><strong>[^<{]/,
    "아이템 항목이 리터럴로 적혀 있다 — 카탈로그에서 만들어야 한다"
  );

  // ③ 지급되는 10종이 곧 안내에 나오는 10종이다. 역할 넷으로 나눠 그리므로
  //    합계가 지급 풀과 같아야 한다.
  const shown = [
    DUEL_ITEM_ROLE.ATTACK,
    DUEL_ITEM_ROLE.SEARCH,
    DUEL_ITEM_ROLE.DEFENSE,
    DUEL_ITEM_ROLE.JOKER,
  ].flatMap((role) => getDuelItemsByRole(role).map((item) => item.id));
  assert.deepEqual([...shown].sort(), [...MULTI_ITEM_IDS].sort());
});

test("P7 — 부모가 요약을 가져와 entries를 채운다 (부채 ①)", () => {
  const pageSource = read("pages/MultiplayerGamePage.jsx");

  // ① 요약은 위키백과 REST에서 온다. **새 RPC가 없다** — 부채 ①의 전제였다.
  assert.match(pageSource, /fetchPageSummary\(/);
  const rpcCalls = [...pageSource.matchAll(/supabase\.rpc\(\s*"([a-z_0-9]+)"/g)];
  assert.deepEqual(rpcCalls, [], "미리보기 때문에 새 RPC가 생기면 안 된다");

  // ② abort를 부모가 든다. HUD로 내려가지 않게 하는 것이 P5의 배정 이유였다.
  assert.match(pageSource, /AbortController\(/);
  assert.match(pageSource, /isAbortError\(/);

  // ③ 세는 대상은 `loading`과 `ready`뿐이다. 요약을 못 가져온 클릭(`unavailable`)은
  //    한도를 깎지 않는다 — 6c가 `usedPreviews`를 올리지 않은 이유와 같은 규칙이다.
  const [counter] = pageSource.match(/const countSpentPreviews[\s\S]*?\.length;/) || [];
  assert.ok(counter, "countSpentPreviews를 찾지 못했다");
  assert.match(counter, /"loading"/);
  assert.match(counter, /"ready"/);
  assert.doesNotMatch(counter, /"unavailable"/);
});

test("P7 — 부채 ②는 여전히 열려 있다 (maxPreviews는 카탈로그 값이다)", () => {
  // 부채 ①을 닫았다고 ②가 닫힌 것이 아니다. 한도는 아직 클라이언트만 세고,
  // 그 사실을 고정하는 것이 위의 migration 검사다.
  assert.equal(getDuelItem("link_preview").maxPreviews, 3);
  const pageSource = read("pages/MultiplayerGamePage.jsx");
  assert.match(pageSource, /item\.maxPreviews/, "한도는 카탈로그에서 읽는다 — 서버가 아니다");
});

