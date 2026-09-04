import { isSupabaseConfigured, supabase } from "../supabaseClient.js";
import { createCorrelationId, createRequestId } from "../utils/serverAuthority.js";
import { buildDuelInventory, DUEL_ITEM_RESULT } from "../data/duelItems.js";

/**
 * 1:1 아이템 서버 권위 RPC 래퍼 — 패킷 14 (트랙 C, P4).
 *
 * `supabase/migrations/20260904090000_duel_item_authority_v3.sql`의 RPC 3개를 감싸고
 * 응답을 HUD가 바로 쓸 수 있는 형태로 옮긴다. **판정은 하지 않는다** — 차단·반사·소비는
 * 서버가 확정하고 (`01-CONFIRMED-SPEC.md` §5.1, `14-DUEL-ITEMS.md` §8) 이 모듈은
 * snake_case를 camelCase로, 타임스탬프를 epoch ms로 옮길 뿐이다.
 *
 * ## 실패를 던지지 않고 돌려주는 이유
 *
 * `services/multiplayerService.js`의 `applyDuelMoveV2`는 `ok:false`를 throw로 바꾼다.
 * **여기서는 그러지 않는다.** 서버 자신이 실패를 두 갈래로 나눠 놓았기 때문이다:
 *
 * - `return {ok:false, code}` **12종** — 쿨타임, 링크 없음처럼 **경기 중 정상적으로 나오는 판정**이다.
 * - `raise exception` **6종** — 인증 없음, 참가자 아님처럼 **세션이나 호출이 틀린 것**이다.
 *
 * 쿨타임 중 버튼을 눌렀다는 이유로 try/catch를 강요하면 HUD가 정상 흐름을 예외로 다루게 된다.
 * 그래서 **12종은 `{ok:false, failure}` 봉투로 반환하고, 6종과 전송 오류만 throw한다.**
 * 서버가 그은 선을 그대로 옮긴 것이므로 pgTAP가 고정한 계약과 어긋나지 않는다.
 *
 * ## 미소비 3종 — HUD가 슬롯을 되살려야 한다
 *
 * `NO_ELIGIBLE_LINK` · `UNDO_UNAVAILABLE` · `REWIND_UNAVAILABLE`은 **아이템을 소비하지 않는다**
 * (`14-DUEL-ITEMS.md` §4). 서버는 아무것도 쓰지 않은 채 돌아오므로 슬롯은 여전히 살아 있다.
 * 나머지 9종은 슬롯 상태가 그대로다 — 되살릴 것이 없다. 이 갈림이 `failure.slotRestored`다.
 *
 * ## 시계 — 서버 시각을 클라이언트 시계로 옮겨서 준다
 *
 * `cooldown_until`과 `effect_expires_at`은 **서버 시계**의 값이고 HUD는 `Date.now()`로 잰다
 * (`data/duelItems.js`의 `canUseDuelItem`이 그렇게 비교한다). 두 시계가 어긋나면 쿨타임이
 * 일찍 풀리거나 영영 안 풀린다. 그래서 이 모듈이 `server_now`로 편차를 재서
 * **모든 만료 시각을 클라이언트 시계 기준 epoch ms로 바꿔서 내보낸다.** 소비자는 그대로
 * `Date.now()`와 비교하면 된다. 원본은 `serverNow`·`clockSkewMs`로 남겨 진단에만 쓴다.
 *
 * 관련: 서버가 `now()`가 아니라 `clock_timestamp()`를 쓰는 이유는
 * `docs/agent/TRACK-C-HANDOFF.md` §3.2에 있다 — `now()`는 트랜잭션 시각이라 경과를 못 잰다.
 *
 * ## 동결 파일 취급
 *
 * - `utils/serverAuthority.js` — 동결. `createRequestId`·`createCorrelationId`만 읽기 전용 import한다.
 * - `services/multiplayerService.js` — `requireSupabase`·`normalizeRpcRow`는 **복사해 쓴다.**
 *   그 파일의 export 목록을 넓히면 소비자가 늘어난다 (`TRACK-C-HANDOFF.md` §3.3).
 */

/* ────────────────────────────────────────────────────────────
 * 1. 실패 코드 18종 — 서버가 그은 두 갈래를 그대로 옮긴다
 * ──────────────────────────────────────────────────────────── */

/**
 * HUD가 실패마다 달리 행동해야 하는 축. 코드 12종을 그대로 나열하는 대신
 * **"무엇을 해야 하는가"** 로 묶는다. 코드는 `failure.code`에 그대로 남는다.
 */
export const FAILURE_KIND = Object.freeze({
    /** 미소비 — 슬롯을 되살린다. 다른 아이템을 고르거나 다시 눌러도 된다 */
    UNCONSUMED: "unconsumed",
    /** 공통 2.5초 쿨타임 — `retryAfterMs` 뒤에 다시 눌린다 */
    COOLDOWN: "cooldown",
    /** 이 경기에서는 아이템 자체가 성립하지 않는다 — 재시도가 의미 없다 */
    UNAVAILABLE: "unavailable",
    /** 서버가 거부했고 슬롯 상태가 클라이언트와 어긋났을 수 있다 — 상태를 다시 읽는다 */
    REJECTED: "rejected",
    /** `raise exception` 6종과 전송 오류 — throw된다 */
    FAULT: "fault",
});

/**
 * **아이템을 소비하지 않는 3종.** `14-DUEL-ITEMS.md` §4가 정하고 pgTAP가 고정했다.
 * 서버는 이 세 갈래에서 원장·`room_events`·`consumed_at` 어느 것도 쓰지 않는다.
 */
export const UNCONSUMED_FAILURE_CODES = Object.freeze([
    "NO_ELIGIBLE_LINK",
    "UNDO_UNAVAILABLE",
    "REWIND_UNAVAILABLE",
]);

/**
 * 계약이 이름 붙인 **12종.** `TRACK-C-HANDOFF.md` §3.3의 표이고 pgTAP가 고정한 것이다.
 * `use_duel_item_v3`가 자기 본문에서 직접 반환한다.
 */
export const DUEL_ITEM_FAILURE_CODES = Object.freeze([
    "ITEMS_DISABLED",
    "GAME_NOT_ACTIVE",
    "ITEM_NOT_OWNED",
    "ITEM_ALREADY_USED",
    "ITEM_COOLDOWN",
    "ITEM_NOT_IN_CATALOG",
    "OPPONENT_NOT_FOUND",
    "NO_ELIGIBLE_LINK",
    "UNDO_UNAVAILABLE",
    "REWIND_UNAVAILABLE",
    "LINK_SNAPSHOT_MISSING",
    "ITEM_MOVE_REJECTED",
]);

/**
 * **계약 표에 없지만 클라이언트까지 올라오는 3종** `[코드 실측, 2026-09-04]`.
 *
 * `private.apply_duel_move_internal_v3`가 반환하는 방어적 코드들이고(migration `:312`·`:316`·`:399`),
 * `use_duel_item_v3`가 헬퍼 실패를 `coalesce(v_move->>'code', 'ITEM_MOVE_REJECTED')`로
 * 그대로 흘려보낸다(`:938`). 즉 `ITEM_MOVE_REJECTED`로 뭉개지지 않고 **원래 코드로 도착한다.**
 * `TRACK-C-HANDOFF.md` §3.3의 12종 표에는 이 셋이 빠져 있다 — 표가 pgTAP가 주장한 것만
 * 옮겼기 때문이다. 이름을 붙여 두지 않으면 HUD가 "모르는 코드"로 받는다.
 *
 * 셋 다 `insert into duel_item_events`(`:970`) **앞에서** 반환되므로 슬롯은 소비되지 않는다.
 */
export const DUEL_ITEM_HELPER_FAILURE_CODES = Object.freeze([
    "PLAYER_NOT_FOUND",
    "PLAYER_NOT_PLAYING",
    "UNSUPPORTED_EVENT_TYPE",
]);

/** `raise exception`으로 던져지는 6종. throw되므로 `try/catch`가 필요하다. */
export const DUEL_ITEM_THROWN_CODES = Object.freeze([
    "AUTH_REQUIRED",
    "REQUEST_ID_REQUIRED",
    "DUEL_ROOM_NOT_FOUND",
    "NOT_A_PARTICIPANT",
    "DUEL_PARTICIPANTS_REQUIRED",
    "DUEL_ITEM_POOL_EXHAUSTED",
]);

/**
 * 코드 → 갈래. 12종 전부가 여기 있고, 없는 코드는 `REJECTED`로 떨어진다 —
 * 서버가 새 코드를 늘려도 HUD가 조용히 성공으로 읽지 않는다.
 */
const FAILURE_KIND_BY_CODE = Object.freeze({
    ITEMS_DISABLED: FAILURE_KIND.UNAVAILABLE,
    GAME_NOT_ACTIVE: FAILURE_KIND.UNAVAILABLE,
    ITEM_COOLDOWN: FAILURE_KIND.COOLDOWN,
    NO_ELIGIBLE_LINK: FAILURE_KIND.UNCONSUMED,
    UNDO_UNAVAILABLE: FAILURE_KIND.UNCONSUMED,
    REWIND_UNAVAILABLE: FAILURE_KIND.UNCONSUMED,
    ITEM_NOT_OWNED: FAILURE_KIND.REJECTED,
    ITEM_ALREADY_USED: FAILURE_KIND.REJECTED,
    ITEM_NOT_IN_CATALOG: FAILURE_KIND.REJECTED,
    OPPONENT_NOT_FOUND: FAILURE_KIND.REJECTED,
    LINK_SNAPSHOT_MISSING: FAILURE_KIND.REJECTED,
    ITEM_MOVE_REJECTED: FAILURE_KIND.REJECTED,
    // 헬퍼가 흘려보내는 3종. 상태를 다시 읽으면 어느 쪽이든 맞춰진다.
    PLAYER_NOT_FOUND: FAILURE_KIND.REJECTED,
    PLAYER_NOT_PLAYING: FAILURE_KIND.REJECTED,
    UNSUPPORTED_EVENT_TYPE: FAILURE_KIND.REJECTED,
});

/**
 * 표시 문구. 결과 사유 어휘(C4)와는 다른 축이다 — 저쪽은 **경기 결과**를 설명하고
 * 여기는 **아이템 한 번의 거부**를 설명한다. `utils/resultReasonLabels.js`는 B 소유이고
 * 이 트랙은 `getDuelResultLabel`을 읽기 전용으로만 부른다 (`TRACKS.md` §2.2).
 */
const FAILURE_MESSAGES = Object.freeze({
    ITEMS_DISABLED: "아이템을 쓰지 않는 방입니다.",
    GAME_NOT_ACTIVE: "지금은 아이템을 쓸 수 없습니다.",
    ITEM_NOT_OWNED: "가지고 있지 않은 아이템입니다.",
    ITEM_ALREADY_USED: "이미 사용한 아이템입니다.",
    ITEM_COOLDOWN: "아직 다음 아이템을 쓸 수 없습니다.",
    ITEM_NOT_IN_CATALOG: "서버가 모르는 아이템입니다.",
    OPPONENT_NOT_FOUND: "상대를 찾지 못했습니다.",
    NO_ELIGIBLE_LINK: "이동할 링크가 없어 아이템을 쓰지 않았습니다.",
    UNDO_UNAVAILABLE: "되돌릴 이동이 없어 아이템을 쓰지 않았습니다.",
    REWIND_UNAVAILABLE: "되감을 이동이 없어 아이템을 쓰지 않았습니다.",
    LINK_SNAPSHOT_MISSING: "문서 정보를 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    ITEM_MOVE_REJECTED: "서버가 이동을 거부했습니다.",
    PLAYER_NOT_FOUND: "플레이어 정보를 찾지 못했습니다.",
    PLAYER_NOT_PLAYING: "지금은 이동시킬 수 없는 상대입니다.",
    UNSUPPORTED_EVENT_TYPE: "서버가 처리할 수 없는 이동입니다.",
    AUTH_REQUIRED: "로그인이 필요합니다.",
    REQUEST_ID_REQUIRED: "요청 식별자가 없습니다.",
    DUEL_ROOM_NOT_FOUND: "1:1 방을 찾지 못했습니다.",
    NOT_A_PARTICIPANT: "이 방의 참가자가 아닙니다.",
    DUEL_PARTICIPANTS_REQUIRED: "상대가 아직 입장하지 않았습니다.",
    DUEL_ITEM_POOL_EXHAUSTED: "아이템을 지급하지 못했습니다.",
});

/** 미소비 3종인가 — HUD가 슬롯을 되살릴지 여기서 정해진다. */
export function isUnconsumedFailure(code) {
    return UNCONSUMED_FAILURE_CODES.includes(code);
}

export function getDuelItemFailureMessage(code) {
    return FAILURE_MESSAGES[code] || "아이템 사용이 거부되었습니다.";
}

/* ────────────────────────────────────────────────────────────
 * 2. 형태 도우미 — multiplayerService.js:6-14의 사본
 * ──────────────────────────────────────────────────────────── */

function requireSupabase() {
    if (!isSupabaseConfigured || !supabase) {
        const error = new Error("Supabase가 설정되지 않았습니다.");
        error.code = "SERVER_ITEMS_UNAVAILABLE";
        error.kind = FAILURE_KIND.FAULT;
        throw error;
    }
}

function normalizeRpcRow(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

/* ────────────────────────────────────────────────────────────
 * 3. 시각 — 서버 시계를 클라이언트 시계로
 * ──────────────────────────────────────────────────────────── */

function toEpochMs(value) {
    if (value == null) return null;
    const parsed = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 서버 시각을 클라이언트 시계로 옮긴다.
 *
 * `skewMs`는 `serverNow - 응답을 받은 순간`이다. 서버가 3초 앞서 있으면 서버가 준
 * 만료 시각도 3초 앞서 있으므로 그만큼 빼야 `Date.now()`와 같은 자 위에 놓인다.
 * 편차를 재지 못했으면(`server_now` 없음) 그대로 둔다 — 추정해서 틀리는 것보다 낫다.
 */
export function toClientTime(serverEpochMs, skewMs) {
    if (serverEpochMs == null) return null;
    if (!Number.isFinite(skewMs)) return serverEpochMs;
    return serverEpochMs - skewMs;
}

function measureSkew(response, receivedAt) {
    const serverNow = toEpochMs(response?.server_now);
    if (serverNow == null) return { serverNow: null, clockSkewMs: null };
    return { serverNow, clockSkewMs: serverNow - receivedAt };
}

/* ────────────────────────────────────────────────────────────
 * 4. 오류 정규화 — throw되는 것들
 * ──────────────────────────────────────────────────────────── */

/**
 * PostgREST 오류를 코드가 붙은 Error로 옮긴다.
 *
 * `raise exception 'AUTH_REQUIRED'`는 `error.code`가 아니라 **`error.message`** 로 온다
 * (SQLSTATE는 전부 `P0001`이다). 그래서 message를 먼저 보고, 아는 코드가 아니면
 * SQLSTATE를 남겨 둔다 — 삼켜서 정체불명의 실패로 만들지 않는다.
 */
function toDuelItemError(error, fallbackMessage) {
    const raised = String(error?.message || "").trim().toUpperCase();
    const code = DUEL_ITEM_THROWN_CODES.includes(raised)
        ? raised
        : String(error?.code || "").toUpperCase() || "DUEL_ITEM_RPC_FAILED";

    const normalized = new Error(FAILURE_MESSAGES[code] || fallbackMessage);
    normalized.code = code;
    normalized.kind = FAILURE_KIND.FAULT;
    // 상대가 아직 안 들어온 것뿐이면 입장 뒤 같은 호출이 성공한다. 나머지 5종은
    // 세션이나 호출 자체가 틀린 것이라 같은 인자로 다시 불러도 같은 결과다.
    normalized.recoverable = code === "DUEL_PARTICIPANTS_REQUIRED";
    normalized.cause = error;
    return normalized;
}

/* ────────────────────────────────────────────────────────────
 * 5. 응답 정규화
 * ──────────────────────────────────────────────────────────── */

function normalizeGrants(response, skewMs) {
    const rows = Array.isArray(response?.grants) ? response.grants : [];
    return {
        // 서버 행 원본. 소비자가 `slot_index` 같은 원래 키를 봐야 할 때 쓴다.
        grants: rows,
        // HUD 형태. `buildDuelInventory`가 slot_index 순서와 표시명을 맡는다.
        inventory: buildDuelInventory(rows),
        cooldownUntil: toClientTime(toEpochMs(response?.cooldown_until), skewMs),
    };
}

function normalizeEffectRow(row, skewMs) {
    return {
        itemEventId: row?.itemEventId ?? null,
        itemId: row?.itemId ?? null,
        actorUserId: row?.actorUserId ?? null,
        expiresAt: toClientTime(toEpochMs(row?.expiresAt), skewMs),
        // null이면 HUD가 `metadata.censoredTitles`에서 터진다. 빈 객체가 안전하다.
        metadata: row?.metadata ?? {},
    };
}

/**
 * 실패 봉투. **`failure.slotRestored`가 이 파일의 핵심 출력이다** —
 * HUD는 이 한 값으로 슬롯을 되살릴지 정한다.
 *
 * `slotRestored`는 계약이 이름 붙인 **미소비 3종에만** 참이다 (`TRACK-C-HANDOFF.md` §3.3).
 * 다만 코드를 읽어 보면 **어떤 실패도 `consumed_at`을 쓰지 않는다** — 모든 실패 반환이
 * `insert into duel_item_events`(migration `:970`)보다 앞에 있다. 즉 실패 뒤에
 * `fetchDuelItemState`를 다시 읽는 HUD는 어느 코드에서도 슬롯을 잃지 않는다.
 * `slotRestored`는 **다시 읽지 않고도 즉시 되살려야 하는 경우**를 가리키는 값이다.
 */
export function normalizeDuelItemFailure(response, { skewMs = null } = {}) {
    const code = response?.code || "ITEM_MOVE_REJECTED";
    const kind = FAILURE_KIND_BY_CODE[code] || FAILURE_KIND.REJECTED;
    const cooldownUntil = toClientTime(toEpochMs(response?.cooldown_until), skewMs);

    return {
        code,
        kind,
        slotRestored: kind === FAILURE_KIND.UNCONSUMED,
        // 아이템이 없는 방이거나 경기가 끝난 뒤다 — 다시 눌러도 같은 답이 온다.
        retryable: kind !== FAILURE_KIND.UNAVAILABLE,
        cooldownUntil,
        retryAfterMs:
            kind === FAILURE_KIND.COOLDOWN && cooldownUntil != null
                ? Math.max(0, cooldownUntil - Date.now())
                : null,
        message: getDuelItemFailureMessage(code),
        // GAME_NOT_ACTIVE는 room·player를 동봉한다. 나머지는 코드뿐이다.
        room: response?.room ?? null,
        player: response?.player ?? null,
        snapshot: response ?? null,
    };
}

/**
 * `room_events`의 `duel_item_event` payload를 HUD 형태로.
 *
 * 서버가 이미 camelCase로 넣어 두었으므로 하는 일은 **시각 보정과 result 검증**이다.
 * 알 수 없는 `result`는 `null`로 두고 `void`로 넘기지 않는다 — 그러면 새 값이 생겼을 때
 * 화면이 조용히 아무 일도 없던 것처럼 군다.
 */
export function normalizeDuelItemEvent(payload, { skewMs = null } = {}) {
    if (!payload) return null;
    const known = Object.values(DUEL_ITEM_RESULT);
    return {
        itemEventId: payload.itemEventId ?? null,
        itemId: payload.itemId ?? null,
        slotRole: payload.slotRole ?? null,
        actorUserId: payload.actorUserId ?? null,
        targetUserId: payload.targetUserId ?? null,
        result: known.includes(payload.result) ? payload.result : null,
        effectExpiresAt: toClientTime(toEpochMs(payload.effectExpiresAt), skewMs),
        moveEventId: payload.moveEventId ?? null,
        metadata: payload.metadata ?? {},
        serverTimestamp: toEpochMs(payload.serverTimestamp),
    };
}

/* ────────────────────────────────────────────────────────────
 * 6. RPC 3개
 * ──────────────────────────────────────────────────────────── */

/**
 * 5슬롯 지급을 보장한다. **멱등이다** — 행이 이미 있으면 그대로 읽어 온다.
 * F5로 다시 굴리지 못하는 것이 이 멱등성이고, 그래서 경기 시작 때마다 불러도 된다.
 *
 * `use_items = false` 방은 **성공(`ok:true`)에 `code: "ITEMS_DISABLED"`** 로 온다 —
 * 지급할 것이 없는 정상 상태다. 같은 코드가 `useDuelItem`에서는 실패다.
 */
export async function ensureDuelItemGrant(roomId) {
    requireSupabase();
    const { data, error } = await supabase.rpc("ensure_duel_item_grant_v3", {
        p_room_id: roomId,
    });
    if (error) throw toDuelItemError(error, "아이템을 지급받지 못했습니다.");

    const response = normalizeRpcRow(data);
    const { serverNow, clockSkewMs } = measureSkew(response, Date.now());
    return {
        ok: response?.ok === true,
        code: response?.code || "GRANTED",
        useItems: response?.use_items === true,
        ...normalizeGrants(response, clockSkewMs),
        serverNow,
        clockSkewMs,
        snapshot: response,
    };
}

/**
 * 새로고침·재접속 복구. **쿨타임·지속효과·보호 대기가 전부 서버에서 온다** —
 * 클라이언트는 localStorage에서 아무것도 되살리지 않는다.
 */
export async function fetchDuelItemState(roomId) {
    requireSupabase();
    const { data, error } = await supabase.rpc("get_duel_item_state_v3", {
        p_room_id: roomId,
    });
    if (error) throw toDuelItemError(error, "아이템 상태를 불러오지 못했습니다.");

    const response = normalizeRpcRow(data);
    const { serverNow, clockSkewMs } = measureSkew(response, Date.now());
    const effects = Array.isArray(response?.active_effects) ? response.active_effects : [];
    const defenses = Array.isArray(response?.pending_defenses) ? response.pending_defenses : [];

    return {
        ok: response?.ok === true,
        code: response?.code || "STATE",
        useItems: response?.use_items === true,
        roomStatus: response?.room_status ?? null,
        ...normalizeGrants(response, clockSkewMs),
        // 나에게 걸려 있는 방해. 차단·무효 행은 서버가 이미 걸러서 보내지 않는다.
        activeEffects: effects.map((row) => normalizeEffectRow(row, clockSkewMs)),
        // 아직 안 쓰인 편집 보호·역링크. 소진 여부도 서버가 판정한 결과다.
        pendingDefenses: defenses.map((row) => normalizeEffectRow(row, clockSkewMs)),
        serverNow,
        clockSkewMs,
        snapshot: response,
    };
}

/**
 * 아이템 한 번을 쓴다. **저장소에서 아이템 이벤트를 쓰는 유일한 경로다.**
 *
 * 실패 12종은 throw하지 않고 `{ok:false, failure}`로 돌아온다 (파일 머리말 참고).
 * `requestId`는 서버가 `game_mutation_requests`에 멱등 키로 쓰므로 **재시도할 때는
 * 같은 값을 다시 넘긴다** — 새로 만들면 같은 사용이 두 번 기록될 수 있다.
 */
export async function useDuelItem({
    roomId,
    grantId,
    requestId = createRequestId(),
    correlationId = createCorrelationId(),
}) {
    requireSupabase();
    const { data, error } = await supabase.rpc("use_duel_item_v3", {
        p_room_id: roomId,
        p_grant_id: grantId,
        p_request_id: requestId,
        p_correlation_id: correlationId,
    });
    if (error) throw toDuelItemError(error, "아이템을 사용하지 못했습니다.");

    const response = normalizeRpcRow(data);
    const { serverNow, clockSkewMs } = measureSkew(response, Date.now());

    if (response?.ok !== true) {
        return {
            ok: false,
            code: response?.code || "ITEM_MOVE_REJECTED",
            failure: normalizeDuelItemFailure(response, { skewMs: clockSkewMs }),
            requestId,
            serverNow,
            clockSkewMs,
            snapshot: response,
        };
    }

    return {
        ok: true,
        code: response.code || "ITEM_USED",
        failure: null,
        // 서버가 확정한 4값. 클라이언트는 스스로 차단·반사를 판정하지 않는다.
        result: response.result ?? null,
        itemId: response.item_id ?? null,
        targetUserId: response.target_user_id ?? null,
        itemEventId: response.item_event_id ?? null,
        roomEventId: response.room_event_id ?? null,
        effectExpiresAt: toClientTime(toEpochMs(response.effect_expires_at), clockSkewMs),
        cooldownUntil: toClientTime(toEpochMs(response.cooldown_until), clockSkewMs),
        metadata: response.metadata ?? {},
        room: response.room ?? null,
        player: response.player ?? null,
        opponent: response.opponent ?? null,
        requestId,
        serverNow,
        clockSkewMs,
        snapshot: response,
    };
}
