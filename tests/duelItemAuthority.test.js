import test from "node:test";
import assert from "node:assert/strict";

import { SINGLE_ITEM_IDS, MULTI_ITEM_IDS } from "../data/itemPools.js";
import { ACTIVE_DUEL_ITEM_IDS } from "../data/duelItems.js";

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
