import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  isDisabledDuelItem,
  MULTI_ITEM_IDS,
} from "../data/itemPools.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const swapMigration = read("supabase/migrations/20260814094000_duel_item_authority_v2.sql");
const multiplayerPage = read("pages/MultiplayerGamePage.jsx");

test("신규 듀얼 아이템 풀에는 비활성화된 SWAP이 없다", () => {
  assert.equal(MULTI_ITEM_IDS.includes("swap_current"), false);
  assert.equal(isDisabledDuelItem({ id: "swap_current" }), true);
  assert.equal(isDisabledDuelItem({ id: "go_back" }), false);
});

test("기존 localStorage의 SWAP은 사용할 수 없고 다른 아이템은 유지한다", () => {
  const saved = [
    { id: "swap_current", instanceId: "swap-1", used: false },
    { id: "go_back", instanceId: "back-1", used: false },
  ];
  const restored = saved.filter((item) => !isDisabledDuelItem(item));
  assert.deepEqual(restored.map((item) => item.id), ["go_back"]);
  assert.equal(isDisabledDuelItem(saved[0]), true);
  assert.equal(isDisabledDuelItem(saved[1]), false);
});

test("SWAP RPC는 어떤 입력에서도 SWAP_DISABLED 무변경 응답만 반환하도록 정의된다", () => {
  assert.match(swapMigration, /return jsonb_build_object\('ok', false, 'code', 'SWAP_DISABLED'\)/);
  assert.doesNotMatch(swapMigration, /update public\.(game_rooms|room_players)/);
  assert.doesNotMatch(swapMigration, /insert into public\.(game_move_events|game_mutation_requests|match_history)/);
  assert.match(swapMigration, /p_expected_version bigint/);
});

/**
 * ⚠ **이 검사는 분기 개수를 세지 않는다** `[P6에서 교체, 2026-09-04]`.
 *
 * 옛 형태는 `case "swap_current"` 분기가 **2개 이상**임을 요구했다. P6이 아이템 ID별
 * 분기를 없애면서 그 값이 3 → 1 → 0으로 내려가 검사가 못 쓰게 됐다 — 그런데
 * **없어진 쪽이 더 안전하다.** 분기가 있으면서 `handleMove`를 부르지 않는 것보다
 * **분기가 아예 없는 것**이 강한 보장이다. 즉 개수 불변식이 **더 안전해진 코드를
 * 실패로 판정했다.**
 *
 * 같은 성격의 사례가 이 저장소에 둘 더 있다 (`docs/agent/TRACK-C-HANDOFF.md` §1) —
 * `highlight_links`와 **싱글 아이템 저장 키**. 그 둘은 **주석 한 줄이 개수를 늘려서**
 * 깨졌고, 이것은 **정당한 제거가 개수를 줄여서** 깨졌다. 개수 세기는 양방향으로
 * 취약하다. 그래서 개수가 아니라 **그 개수가 지키려던 사실**을 assert한다.
 */
test("위조 room_events는 swap_current로 이 클라이언트를 움직이지 못한다", () => {
  // ① 클라이언트가 `room_events`에 쓰는 경로가 없다 — 위조 행을 만들 자리가 없고,
  //    아이템 알림은 `use_duel_item_v3`가 security definer로 넣는다 (수용조건 ②).
  assert.equal(multiplayerPage.includes('from("room_events")'), false);
  assert.doesNotMatch(multiplayerPage, /emitRoomEvent\(/);

  // ② 사용 경로가 아이템 ID로 갈라지지 않는다 — 서버가 판정한 `result`만 읽는다.
  //    그래서 payload가 고를 수 있는 아이템별 클라이언트 경로가 존재하지 않는다.
  const [usePath] = multiplayerPage.match(/const handleUseItem[\s\S]*?\n  \};/) || [];
  assert.ok(usePath, "handleUseItem을 찾지 못했다");
  assert.doesNotMatch(usePath, /case "/);
  assert.match(usePath, /useDuelItem\(/);

  // ③ 수신 경로도 아이템 ID로 갈라지지 않는다. `duel_item_event` 하나를 받아 서버가
  //    판정한 `result`로 가르므로, **위조 payload가 아이템 ID를 골라도 갈 곳이 없다.**
  //    이것이 옛 "분기는 있되 handleMove를 안 부른다"보다 강한 보장이다.
  for (const id of [...MULTI_ITEM_IDS, "swap_current", "mini_game"]) {
    assert.doesNotMatch(
      multiplayerPage,
      new RegExp(`case "${id}"`),
      `${id}로 갈라지는 분기가 남아 있다`
    );
  }
  assert.match(multiplayerPage, /normalizeDuelItemEvent\(/);

  // ④ 그러면서 `mini_game_*` 수신 3분기는 살아 있다 — 구버전 번들이 보낸 이벤트가
  //    `default`로 조용히 사라지지 않게 하는 것이 Q5 조건이다. 이들은 event_type이지
  //    아이템 ID가 아니다.
  for (const eventType of ["mini_game_start", "mini_game_choice", "mini_game_reward"]) {
    assert.match(multiplayerPage, new RegExp(`case "${eventType}"`));
  }

  // ⑤ 비활성 판정은 카탈로그와 지급 풀 양쪽에 그대로 있다.
  assert.equal(MULTI_ITEM_IDS.includes("swap_current"), false);
  assert.equal(isDisabledDuelItem({ id: "swap_current" }), true);
});
