export const SINGLE_ITEM_IDS = [
    "highlight_links",
    "search_once",
    "go_back",
    "random_teleport",
];

/**
 * 1:1(아이템전) 풀 — 패킷 14 서버 권위 이전으로 구성이 바뀌었다.
 *
 * **G7 결정 (사용자 확정, 2026-09-04) — A안.** 기존 ID를 그대로 쓰고 표시명만 14 문서를 따른다.
 * 정의·역할·수치의 단일 기준은 `data/duelItems.js`이며, 이 배열은 **지급 대상 ID 목록**이다.
 *
 * 제거 4: `translate_current`(언어 변경) · `highlight_links`(링크 하이라이트) ·
 *   `double_blind`(양쪽 화면 가리기) — `01-CONFIRMED-SPEC.md` §5.6이 기본 카탈로그에서 뺐다.
 *   `mini_game` — **기본 지급에서만 제외**한다. 정의(`data/items.js`)와
 *   `room_events`의 `mini_game_*` 3종은 **보존**한다 (AGENTS.md §4, 사용자 확정 Q5).
 * 추가 4: `link_censorship` · `link_preview` · `backlink_reflect` · `history_rewind`.
 *
 * ⚠ **위 제거 3종 중 가운데 하나는 이 파일의 `SINGLE_ITEM_IDS`에도 있다.
 * 거기서는 지우지 않는다.** 그 배열의 소비자는 `pages/GamePage.jsx`(트랙 B)이고,
 * 여기서 뺐다는 이유로 위에서도 빼면 **싱글 아이템이 런타임에 깨진다.**
 * 이 트랙에서 `SINGLE_ITEM_IDS`는 읽기 전용·동결이다 (`TRACKS.md` §2.3-①).
 */
export const MULTI_ITEM_IDS = [
    "blind",
    "random_link_move",
    "link_censorship",
    "search_once",
    "link_preview",
    "cleanse_shield",
    "go_back",
    "backlink_reflect",
    "random_teleport",
    "history_rewind",
];

export const DISABLED_DUEL_ITEM_IDS = new Set(["swap_current"]);

export function isDisabledDuelItem(item) {
    return DISABLED_DUEL_ITEM_IDS.has(item?.id);
}
