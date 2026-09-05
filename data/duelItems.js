/**
 * 1:1 아이템전 카탈로그 — 패킷 14 (트랙 C).
 *
 * 이 파일이 1:1 아이템의 **표시·역할·수치 단일 기준**이다.
 * `data/items.js`의 `ITEM_DEFS`는 그대로 둔다 (AGENTS.md §4 — 임의 삭제 금지).
 * 싱글 아이템은 `SINGLE_ITEM_IDS` + `ITEM_DEFS`를 계속 쓴다.
 *
 * ## G7 결정 (사용자 확정, 2026-09-04) — A안
 * 기존 7개 아이템 ID를 그대로 쓴다. `14-DUEL-ITEMS.md` §2의 이름(`ink_blind` 등)은
 * **표시명으로만** 쓴다. 그 문서 자체가 "ID는 예시다"라고 적었다.
 * ID 정리는 서버 권위 이전이 끝난 뒤 별도 작업이다.
 *
 * ## 권위의 소재
 * **이 카탈로그는 표시와 사전 검증용이다.** 지급·소비·차단·반사·지속 종료를 확정하는 것은
 * 서버다 (`01-CONFIRMED-SPEC.md` §5.1, `14-DUEL-ITEMS.md` §8).
 * 서버는 같은 값을 `supabase/migrations/20260904090000_duel_item_authority_v3.sql`에
 * 자기 사본으로 갖고, 두 사본이 어긋나지 않는 것을 `tests/duelItemAuthority.test.js`가 확인한다.
 *
 * ## 등재된 부채 1건 — `random_teleport` `[사용자 확정, 2026-09-04 / Q3]`
 * 확정 스펙 §5.5의 "특수:임의 문서"는 **이동 가능한 무작위 문서**를 요구하지만,
 * 이번 범위는 **기존 동작(현재 문서의 유효 링크 중 무작위)** 을 유지한다.
 * 서버는 `apply_duel_move_v2`와 같은 방식으로 현재 스냅샷 링크에서 고른다
 * (`20260814092000_duel_authority_v2.sql:124-130`). **표시명만 "특수:임의 문서"다.**
 * 진짜 무작위 문서 풀(`wiki_pages` 기반)과 "목표 직접 도착 제외"·"링크가 거의 없는 문서 제외"는
 * **후속 작업**이며 이 주석이 그 부채의 등재 지점이다.
 */

/** 5슬롯의 역할 축 (`01-CONFIRMED-SPEC.md` §5.1) */
export const DUEL_ITEM_ROLE = {
    ATTACK: "attack",
    SEARCH: "search",
    DEFENSE: "defense",
    JOKER: "joker",
};

export const DUEL_ROLE_LABELS = Object.freeze({
    [DUEL_ITEM_ROLE.ATTACK]: "공격",
    [DUEL_ITEM_ROLE.SEARCH]: "탐색",
    [DUEL_ITEM_ROLE.DEFENSE]: "방어",
    [DUEL_ITEM_ROLE.JOKER]: "조커",
});

/** 효과 대상 */
export const DUEL_ITEM_TARGET = {
    SELF: "self",
    OPPONENT: "opponent",
    BOTH: "both",
};

/**
 * 서버가 확정하는 사용 결과 4값 (Q6 A안의 `payload.result`).
 * 클라이언트는 이 값을 **읽기만 한다.** 스스로 차단·반사를 판정하지 않는다.
 */
export const DUEL_ITEM_RESULT = {
    APPLIED: "applied",
    BLOCKED: "blocked",
    REFLECTED: "reflected",
    VOID: "void",
};

/**
 * `room_events.event_type` — **단일 값**이다 `[사용자 확정, 2026-09-04 / Q6 A안]`.
 * `room_events.event_type`에는 CHECK가 없으므로(`baseline:643`) 값 폭발을 막기 위해
 * 하나로 묶고 판별은 payload가 한다. 기존 `mini_game_*` 3종은 **보존**한다 (Q5 조건).
 */
export const DUEL_ITEM_EVENT_TYPE = "duel_item_event";

/** 공통 쿨타임 (`01-CONFIRMED-SPEC.md` §5.1). 서버가 강제하고 여기서는 표시에만 쓴다. */
export const DUEL_ITEM_COOLDOWN_MS = 2500;

/**
 * 아이템 정의 11종 — 활성 10 + 비활성 1.
 *
 * `duration`: 지속 ms. `0`이면 즉발이다.
 * `charges`: 방어 대기 상태가 받아내는 공격 횟수.
 * `blockable`/`reflectable`: 상호작용 매트릭스 (`14-DUEL-ITEMS.md` §4).
 *   조커 3종은 편집 보호·되돌리기·역링크로 막거나 취소하지 못한다.
 * `moveEventType`: 이동을 만들면 `game_move_events.event_type`의 값.
 *   **CHECK 6값 안에서만 고른다** (`20260814090000_server_authority_v2.sql:55-58`).
 *   새 값은 하나도 필요하지 않다.
 */
export const DUEL_ITEM_DEFS = Object.freeze([
    Object.freeze({
        id: "blind",
        name: "먹물 공격",
        role: DUEL_ITEM_ROLE.ATTACK,
        target: DUEL_ITEM_TARGET.OPPONENT,
        duration: 4000,
        blockable: true,
        reflectable: true,
        moveEventType: null,
        description: "상대 문서 영역을 4초간 가리고 문서 이동 입력을 막습니다. HUD와 아이템은 유지됩니다.",
    }),
    Object.freeze({
        id: "random_link_move",
        name: "잘못된 링크",
        role: DUEL_ITEM_ROLE.ATTACK,
        target: DUEL_ITEM_TARGET.OPPONENT,
        duration: 0,
        blockable: true,
        reflectable: true,
        moveEventType: "FORCED_LINK",
        description: "상대를 현재 문서의 유효한 무작위 링크로 강제 이동시킵니다. 이동 +1.",
    }),
    Object.freeze({
        id: "link_censorship",
        name: "링크 검열",
        role: DUEL_ITEM_ROLE.ATTACK,
        target: DUEL_ITEM_TARGET.OPPONENT,
        duration: 6000,
        blockable: true,
        reflectable: true,
        moveEventType: null,
        description: "6초 동안 상대의 유효 링크 약 50%를 봉인합니다. 최소 2개는 남습니다.",
    }),
    Object.freeze({
        id: "search_once",
        name: "문서 내 검색",
        role: DUEL_ITEM_ROLE.SEARCH,
        target: DUEL_ITEM_TARGET.SELF,
        duration: 15000,
        blockable: false,
        reflectable: false,
        moveEventType: null,
        description: "15초 동안 현재 문서 안에서 검색어·결과 이동을 사용합니다. 문서를 떠나면 종료됩니다.",
    }),
    Object.freeze({
        id: "link_preview",
        name: "링크 미리보기",
        role: DUEL_ITEM_ROLE.SEARCH,
        target: DUEL_ITEM_TARGET.SELF,
        duration: 15000,
        maxPreviews: 3,
        blockable: false,
        reflectable: false,
        moveEventType: null,
        description: "15초 동안 최대 3개 링크의 연결 문서 첫 문장을 이동 전에 확인합니다.",
    }),
    Object.freeze({
        id: "cleanse_shield",
        name: "편집 보호",
        role: DUEL_ITEM_ROLE.DEFENSE,
        target: DUEL_ITEM_TARGET.SELF,
        duration: 8000,
        charges: 1,
        blockable: false,
        reflectable: false,
        moveEventType: null,
        description: "8초 안에 들어오는 첫 공격 하나를 차단하고 종료합니다. 차단된 공격은 소비됩니다.",
    }),
    Object.freeze({
        id: "go_back",
        name: "되돌리기",
        role: DUEL_ITEM_ROLE.DEFENSE,
        target: DUEL_ITEM_TARGET.SELF,
        duration: 0,
        blockable: false,
        reflectable: false,
        moveEventType: "UNDO",
        description: "직전 문서로 돌아갑니다. 강제 이동 직후면 이동 횟수와 지속 방해까지 되돌립니다.",
    }),
    Object.freeze({
        id: "backlink_reflect",
        name: "역링크",
        role: DUEL_ITEM_ROLE.DEFENSE,
        target: DUEL_ITEM_TARGET.SELF,
        duration: 6000,
        charges: 1,
        blockable: false,
        reflectable: false,
        moveEventType: null,
        description: "6초 안에 들어오는 첫 공격을 공격자에게 반사합니다. 조커는 반사하지 못합니다.",
    }),
    Object.freeze({
        id: "random_teleport",
        name: "특수:임의 문서",
        role: DUEL_ITEM_ROLE.JOKER,
        target: DUEL_ITEM_TARGET.SELF,
        duration: 0,
        blockable: false,
        reflectable: false,
        moveEventType: "RANDOM_TELEPORT",
        description: "무작위 문서로 이동합니다. 이동 +1로 기록됩니다.",
    }),
    Object.freeze({
        id: "history_rewind",
        name: "역사 되감기",
        role: DUEL_ITEM_ROLE.JOKER,
        target: DUEL_ITEM_TARGET.BOTH,
        duration: 0,
        blockable: false,
        reflectable: false,
        moveEventType: "REWIND",
        description: "두 사람을 각자의 직전 문서로 동시에 이동시킵니다. 양쪽 이동 +1.",
    }),
    Object.freeze({
        id: "swap_current",
        name: "문서 맞교환",
        role: DUEL_ITEM_ROLE.JOKER,
        target: DUEL_ITEM_TARGET.BOTH,
        duration: 0,
        blockable: false,
        reflectable: false,
        moveEventType: "SWAP",
        disabled: true,
        description: "두 사람의 현재 문서를 교환합니다. (일시 비활성)",
    }),
]);

/**
 * 비활성 아이템 — 지급되지 않고 사용도 거부된다.
 * 클라이언트(`DISABLED_DUEL_ITEM_IDS`)와 서버(`apply_duel_swap_v2` → `SWAP_DISABLED`)가
 * 이미 양쪽에서 막고 있고, C는 그 상태를 **유지**한다 (G7 결정: `swap_current` 비활성 유지).
 */
export const DISABLED_DUEL_ITEM_IDS_V3 = Object.freeze(
    DUEL_ITEM_DEFS.filter((item) => item.disabled === true).map((item) => item.id)
);

export const ACTIVE_DUEL_ITEM_IDS = Object.freeze(
    DUEL_ITEM_DEFS.filter((item) => item.disabled !== true).map((item) => item.id)
);

/**
 * 5슬롯 구성 (`01-CONFIRMED-SPEC.md` §5.1, `14-DUEL-ITEMS.md` §3).
 * 마지막이 변칙 슬롯이고 그 역할은 아래 확률로 정해진다.
 */
export const DUEL_SLOT_PLAN = Object.freeze([
    DUEL_ITEM_ROLE.ATTACK,
    DUEL_ITEM_ROLE.SEARCH,
    DUEL_ITEM_ROLE.DEFENSE,
    DUEL_ITEM_ROLE.JOKER,
    "wildcard",
]);

export const DUEL_SLOT_COUNT = DUEL_SLOT_PLAN.length;

/** 변칙 슬롯 역할 확률. **조커는 나오지 않는다.** 합은 100이다. */
export const WILDCARD_ROLE_WEIGHTS = Object.freeze({
    [DUEL_ITEM_ROLE.ATTACK]: 50,
    [DUEL_ITEM_ROLE.SEARCH]: 25,
    [DUEL_ITEM_ROLE.DEFENSE]: 25,
});

export function getDuelItem(itemId) {
    return DUEL_ITEM_DEFS.find((item) => item.id === itemId) || null;
}

export function isDisabledDuelItemV3(itemId) {
    return DISABLED_DUEL_ITEM_IDS_V3.includes(itemId);
}

export function getDuelItemsByRole(role) {
    return DUEL_ITEM_DEFS.filter(
        (item) => item.role === role && item.disabled !== true
    );
}

/**
 * 서버 지급 행을 HUD가 그릴 수 있는 형태로 옮긴다.
 *
 * 서버가 진실이므로 **카탈로그에 없는 `item_id`는 조용히 버리지 않고 그대로 남긴다** —
 * 이름을 못 찾으면 ID를 보여 주는 편이 슬롯이 사라지는 것보다 낫다.
 * `instanceId`는 `components/ItemBar.jsx`가 쓰던 key 이름을 그대로 유지한 것이다
 * (`TRACKS.md` §2.3-③ — 기존 prop 계약을 흔들지 않는다).
 */
export function buildDuelInventory(grantRows = []) {
    return (Array.isArray(grantRows) ? grantRows : [])
        .slice()
        .sort((a, b) => (a?.slot_index ?? 0) - (b?.slot_index ?? 0))
        .map((row) => {
            const definition = getDuelItem(row?.item_id);
            return {
                ...(definition || {}),
                id: row?.item_id ?? definition?.id ?? "",
                // 서버 지급 행의 PK 열 이름은 `id`다 — `to_jsonb(grant_row)`가 열 이름을
                // 그대로 내보낸다 (migration `:593`·`:643`). `grant_id`는 `duel_item_events`
                // 쪽 열 이름이라 원장 행이 들어오는 경로도 있어 둘 다 받는다.
                // `id`만 보고 `item_id`로 착각하지 않도록 위의 `id`와는 다른 값임에 주의.
                grantId: row?.grant_id ?? row?.id ?? null,
                instanceId:
                    row?.grant_id ?? row?.id ?? `${row?.item_id}-${row?.slot_index}`,
                slotIndex: row?.slot_index ?? 0,
                slotRole: row?.slot_role ?? definition?.role ?? null,
                isWildcard: row?.is_wildcard === true,
                name: definition?.name || row?.item_id || "알 수 없는 아이템",
                description: definition?.description || "",
                used: row?.consumed_at != null,
                consumedAt: row?.consumed_at ?? null,
            };
        });
}

/**
 * HUD가 슬롯을 눌러도 되는지 미리 거른다.
 *
 * **이것은 사전 검증일 뿐 권위가 아니다.** 최종 판정은 `use_duel_item_v3`가 하고,
 * 여기서 통과해도 서버가 거부할 수 있다 (쿨타임 경계, 완주 확정, 링크 없음 등).
 */
export function canUseDuelItem(item, context = {}) {
    if (!item || item.used) return false;
    if (item.disabled === true || isDisabledDuelItemV3(item.id)) return false;
    if (context.phaseReady === false) return false;
    if (context.cooldownUntil && Date.now() < context.cooldownUntil) return false;

    if (item.id === "go_back") {
        return (context.historyLength ?? 0) > 0;
    }
    if (item.id === "random_link_move" || item.id === "random_teleport") {
        return (context.linkCount ?? 0) > 0;
    }
    return true;
}
