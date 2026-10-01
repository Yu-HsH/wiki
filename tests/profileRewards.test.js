import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROFILE_CARD_SLOTS,
  applyEquipment,
  buildProfileCard,
  cardFromServer,
  equipErrorMessage,
  equippedAt,
  mergeRewardSlots,
  normalizeRewardRef,
} from "../utils/profileCard.js";
import {
  PROFILE_CARDS_BATCH_LIMIT,
  cardLookupIds,
  equipProfileReward,
  fetchOwnRewardInventory,
  fetchProfileCard,
  fetchProfileCards,
  unequipProfileReward,
} from "../services/profileRewardService.js";

/*
 * 트랙 17b — C1 보상 3테이블의 클라이언트 측.
 * DB 동작은 supabase/tests/c1_reward_tables_v1.sql이 검증한다. 여기는 매핑과 호출 계약만 본다.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const migration = read("supabase/migrations/20261001090000_c1_reward_tables_v1.sql");

const U1 = "00000000-0000-0000-017b-000000000001";
const U2 = "00000000-0000-0000-017b-000000000002";

const serverCard = {
  userId: U1,
  nickname: "C1 1",
  level: 4,
  icon: { rewardId: "icon_default_book", kind: "profile_icon", displayName: "펼친 책", assetRef: "/profile-icons/book.svg", slotIndex: 1, retired: false },
  title: { rewardId: "t1", kind: "title", displayName: "첫 칭호", assetRef: null, slotIndex: 1, retired: false },
  badges: [
    { rewardId: "b3", kind: "badge", displayName: "셋", assetRef: null, slotIndex: 3, retired: true },
    { rewardId: "b1", kind: "badge", displayName: "하나", assetRef: null, slotIndex: 1, retired: false },
  ],
  frame: null,
  background: { rewardId: "bg", kind: "background", displayName: "배경", assetRef: null, slotIndex: 1, retired: false },
  legacyImageUrl: "https://example.test/legacy.png",
  source: "live",
};

/** RPC·select 호출을 기록하는 가짜 클라이언트. `rpcData[name]`을 돌려준다. */
function createFakeClient({ rpcData = {}, rows = [] } = {}) {
  const calls = [];
  const builder = {
    select(columns) { calls.push(["select", columns]); return builder; },
    order(column, options) {
      calls.push(["order", column, options]);
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return {
    calls,
    from(table) { calls.push(["from", table]); return builder; },
    rpc(name, args) {
      calls.push(["rpc", name, args]);
      const data = typeof rpcData[name] === "function" ? rpcData[name](args) : rpcData[name];
      return Promise.resolve({ data, error: null });
    },
  };
}

/* ── 매핑 ─────────────────────────────────────────────────────── */

test("PROFILE_CARD_SLOTS: 카드 요소 5종, 배지만 자리 3개 (C1 §3 slot_index CHECK)", () => {
  assert.deepEqual(PROFILE_CARD_SLOTS.map((s) => s.slot), ["profile_icon", "title", "badge", "frame", "background"]);
  for (const s of PROFILE_CARD_SLOTS) {
    assert.deepEqual([...s.indexes], s.slot === "badge" ? [1, 2, 3] : [1]);
  }
});

test("normalizeRewardRef: snake·camel 둘 다 받고, ID가 없으면 null", () => {
  assert.deepEqual(normalizeRewardRef({ reward_id: "x", kind: "badge", display_name: "엑스", asset_ref: "/a.svg" }), {
    rewardId: "x", kind: "badge", displayName: "엑스", assetRef: "/a.svg", slotIndex: null, retired: false,
  });
  assert.equal(normalizeRewardRef({ displayName: "이름만" }), null);
  assert.equal(normalizeRewardRef(null), null);
  assert.equal(normalizeRewardRef({ rewardId: "y" }).displayName, "y", "표시명이 없으면 ID로 떨어진다 — 빈 이름 금지");
});

test("cardFromServer: 서버 카드 → C5 §2 형태, retired 표식 보존", () => {
  const card = cardFromServer(serverCard);
  assert.equal(card.userId, U1);
  assert.equal(card.level, 4);
  assert.equal(card.icon.assetRef, "/profile-icons/book.svg");
  assert.equal(card.title.displayName, "첫 칭호");
  assert.equal(card.frame, null);
  assert.equal(card.badges.length, 2);
  assert.equal(card.badges.find((b) => b.rewardId === "b3").retired, true, "C1-②: 은퇴 보상도 장착 유지·표시");
  assert.equal(card.source, "live");
  assert.deepEqual(Object.keys(card).sort(), Object.keys(buildProfileCard()).sort(), "C5 §2 키 집합 그대로");
});

test("mergeRewardSlots: 보상 슬롯만 덮고 닉네임·레벨·이미지·source는 행 값을 유지", () => {
  const base = buildProfileCard({ userId: U1, nickname: "행 닉네임", level: 9, legacyImageUrl: "/row.png", source: "snapshot" });
  const merged = mergeRewardSlots(base, serverCard);
  assert.equal(merged.nickname, "행 닉네임");
  assert.equal(merged.level, 9);
  assert.equal(merged.legacyImageUrl, "/row.png");
  assert.equal(merged.source, "snapshot");
  assert.equal(merged.title.rewardId, "t1");
  assert.equal(merged.icon.rewardId, "icon_default_book");
  assert.deepEqual(mergeRewardSlots(base, undefined), base, "배치 결과에 없으면 행 그대로");
});

test("applyEquipment: equip 응답의 전체 장착 상태로만 카드 슬롯을 다시 만든다", () => {
  const base = cardFromServer(serverCard);
  const next = applyEquipment(base, [
    { slot: "badge", slotIndex: 2, rewardId: "b2", reward: { rewardId: "b2", kind: "badge", displayName: "둘", slotIndex: 2 } },
    { slot: "badge", slotIndex: 1, rewardId: "b1", reward: { rewardId: "b1", kind: "badge", displayName: "하나", slotIndex: 1 } },
    { slot: "frame", slotIndex: 1, rewardId: "f", reward: { rewardId: "f", kind: "frame", displayName: "틀", slotIndex: 1 } },
    { slot: "path_color", slotIndex: 1, rewardId: "p", reward: { rewardId: "p", kind: "path_color", displayName: "색", slotIndex: 1 } },
  ]);
  assert.deepEqual(next.badges.map((b) => b.rewardId), ["b1", "b2"], "slot_index 순");
  assert.equal(next.frame.rewardId, "f");
  assert.equal(next.title, null, "응답에 없는 슬롯은 비운다 — 추측하지 않는다");
  assert.equal(next.icon, null);
  assert.equal(next.nickname, base.nickname);
  assert.ok(!("pathColor" in next), "경기 표현 슬롯은 카드에 없다");
});

test("equippedAt: 배지는 자리별, 나머지는 슬롯 하나", () => {
  const card = cardFromServer(serverCard);
  assert.equal(equippedAt(card, "badge", 1).rewardId, "b1");
  assert.equal(equippedAt(card, "badge", 2), null);
  assert.equal(equippedAt(card, "badge", 3).rewardId, "b3");
  assert.equal(equippedAt(card, "title").rewardId, "t1");
  assert.equal(equippedAt(card, "frame"), null);
  assert.equal(equippedAt(card, "hat"), null);
});

test("equipErrorMessage: C1 §4 실패 코드 6종 + 기본 문구", () => {
  for (const code of ["AUTH_REQUIRED", "REWARD_NOT_OWNED", "SLOT_KIND_MISMATCH", "SLOT_INDEX_INVALID", "REWARD_RETIRED", "SLOT_EMPTY"]) {
    assert.ok(equipErrorMessage(code).length > 0);
    assert.notEqual(equipErrorMessage(code), equipErrorMessage("UNKNOWN"));
  }
});

/* ── 서비스 호출 계약 ────────────────────────────────────────── */

test("cardLookupIds: 중복·게스트·빈 값 제거", () => {
  assert.deepEqual(cardLookupIds([U1, U1, "guest-abc", "", null, U2]), [U1, U2]);
});

test("fetchProfileCards: 50행은 배치 RPC 1회 (N+1 아님)", async () => {
  const ids = Array.from({ length: 50 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
  const client = createFakeClient({ rpcData: { get_profile_cards_v1: { ok: true, cards: { [ids[0]]: serverCard } } } });
  const cards = await fetchProfileCards([...ids, ...ids], { client });
  const rpcCalls = client.calls.filter((c) => c[0] === "rpc");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0][1], "get_profile_cards_v1");
  assert.equal(rpcCalls[0][2].p_user_ids.length, 50);
  assert.equal(cards[ids[0]].nickname, "C1 1");
});

test("fetchProfileCards: 상한을 넘으면 나눠 부르고, 빈 입력은 호출하지 않는다", async () => {
  const ids = Array.from({ length: PROFILE_CARDS_BATCH_LIMIT + 1 }, (_, i) => `id-${i}`);
  const client = createFakeClient({ rpcData: { get_profile_cards_v1: { ok: true, cards: {} } } });
  await fetchProfileCards(ids, { client });
  assert.equal(client.calls.filter((c) => c[0] === "rpc").length, 2);

  const empty = createFakeClient();
  assert.deepEqual(await fetchProfileCards(["guest-1"], { client: empty }), {});
  assert.equal(empty.calls.length, 0);
});

test("fetchProfileCard: 단건 RPC, PROFILE_NOT_FOUND는 error.code로", async () => {
  const ok = createFakeClient({ rpcData: { get_profile_card_v1: { ok: true, card: serverCard } } });
  assert.equal((await fetchProfileCard(U1, { client: ok })).userId, U1);
  assert.deepEqual(ok.calls[0], ["rpc", "get_profile_card_v1", { p_user_id: U1 }]);

  const missing = createFakeClient({ rpcData: { get_profile_card_v1: { ok: false, code: "PROFILE_NOT_FOUND" } } });
  await assert.rejects(fetchProfileCard(U2, { client: missing }), (e) => e.code === "PROFILE_NOT_FOUND");
});

test("equip/unequip: RPC 인자 이름과 실패 코드 전달", async () => {
  const equipment = [{ slot: "title", slotIndex: 1, rewardId: "t1", reward: { rewardId: "t1" } }];
  const client = createFakeClient({
    rpcData: {
      equip_profile_reward_v1: { ok: true, equipment },
      unequip_profile_reward_v1: { ok: false, code: "SLOT_EMPTY" },
    },
  });
  assert.deepEqual(await equipProfileReward({ slot: "title", rewardId: "t1" }, { client }), equipment);
  assert.deepEqual(client.calls[0], ["rpc", "equip_profile_reward_v1", { p_slot: "title", p_slot_index: 1, p_reward_id: "t1" }]);
  await assert.rejects(unequipProfileReward({ slot: "badge", slotIndex: 2 }, { client }), (e) => e.code === "SLOT_EMPTY");
  assert.deepEqual(client.calls[1], ["rpc", "unequip_profile_reward_v1", { p_slot: "badge", p_slot_index: 2 }]);
});

test("fetchOwnRewardInventory: 카탈로그 embed, 은퇴·숨김(null) 보상은 뺀다", async () => {
  const client = createFakeClient({
    rows: [
      { reward_id: "icon_default_map", reward_catalog: { reward_id: "icon_default_map", kind: "profile_icon", display_name: "지도", asset_ref: "/profile-icons/map.svg", retired: false } },
      { reward_id: "old", reward_catalog: null },
      { reward_id: "old2", reward_catalog: { reward_id: "old2", kind: "badge", display_name: "x", retired: true } },
    ],
  });
  const owned = await fetchOwnRewardInventory({ client });
  assert.deepEqual(owned.map((r) => r.rewardId), ["icon_default_map"]);
  assert.equal(owned[0].kind, "profile_icon");
  assert.deepEqual(client.calls[0], ["from", "user_reward_inventory"]);
  assert.ok(!client.calls.some((c) => c[0] === "eq"), "user_id 조건 없음 — RLS가 본인 행만 준다");
});

/* ── migration 정적 계약 ─────────────────────────────────────── */

test("migration: RPC 4개가 authenticated 전용이고 anon에서 회수된다", () => {
  for (const signature of [
    "equip_profile_reward_v1(text, smallint, text)",
    "unequip_profile_reward_v1(text, smallint)",
    "get_profile_card_v1(uuid)",
    "get_profile_cards_v1(uuid[])",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature.replace(/[()[\]]/g, "\\$&")} from public, anon;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature.replace(/[()[\]]/g, "\\$&")} to authenticated, service_role;`));
  }
});

test("migration: 파괴적 DDL 0 (drop table·truncate·delete from profiles 없음)", () => {
  const body = migration.replace(/^--.*$/gm, "");
  assert.doesNotMatch(body, /\bdrop\s+table\b/i);
  assert.doesNotMatch(body, /\btruncate\b/i);
  assert.doesNotMatch(body, /\bdelete\s+from\s+public\.profiles\b/i);
  assert.doesNotMatch(body, /\balter\s+table\s+public\.profiles\b/i);
});
