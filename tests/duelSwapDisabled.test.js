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

test("위조 room_events의 swap_current는 문서 이동 함수를 호출하지 않는다", () => {
  const swapCase = multiplayerPage.match(/case "swap_current"[\s\S]*?break;/g) || [];
  assert.ok(swapCase.length >= 2);
  for (const branch of swapCase) {
    assert.doesNotMatch(branch, /handleMove\(/);
    assert.doesNotMatch(branch, /emitRoomEvent\(/);
  }
});
