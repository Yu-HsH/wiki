import { isSupabaseConfigured, supabase } from "../supabaseClient.js";
import { normalizeRewardRef } from "../utils/profileCard.js";

/**
 * 프로필 보상 서비스 — C1 보상 3테이블의 클라이언트 측 (트랙 17b).
 *
 * ## 읽기
 *
 * - **카드**: `get_profile_card_v1`(단건) · `get_profile_cards_v1`(배치). 랭킹 50행은
 *   배치 **한 번**으로 읽는다 — 행마다 단건을 부르면 N+1이다.
 *   두 RPC는 같은 서버 빌더를 쓰므로 카드 형태가 같다.
 * - **보유 목록**: `user_reward_inventory`를 카탈로그와 함께 select한다. RLS가 본인 행만
 *   돌려주므로 `user_id` 조건을 걸지 않는다 (C1 §2). 은퇴 보상은 카탈로그 RLS가 숨겨
 *   `reward_catalog`가 `null`로 온다 — 다시 장착할 수 없으므로(C1-②) 목록에서 뺀다.
 *
 * ## 쓰기
 *
 * 테이블 쓰기 grant가 없다. 장착·해제는 RPC뿐이고 응답은 **갱신 후 전체 장착 상태**다.
 * 호출자는 그 응답으로만 화면을 바꾼다 (spec §10 "서버가 확정한 장착 상태만 표시").
 */

/** `get_profile_cards_v1`의 서버 상한과 같다. */
export const PROFILE_CARDS_BATCH_LIMIT = 100;

function resolveClient(client) {
  if (client) return client;
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase가 설정되지 않았습니다.");
  }
  return supabase;
}

function domainError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function unwrap(data, fallbackCode) {
  const response = Array.isArray(data) ? data[0] || null : data || null;
  if (!response) throw domainError(fallbackCode);
  if (response.ok === false) throw domainError(response.code || fallbackCode);
  return response;
}

/** 서버 계정 ID만 남긴다. 게스트 ID(`guest-…`)·빈 값은 조회하지 않는다. */
export function cardLookupIds(userIds) {
  const seen = new Set();
  for (const id of userIds ?? []) {
    if (typeof id !== "string" || id.length === 0 || id.startsWith("guest-")) continue;
    seen.add(id);
  }
  return [...seen];
}

/** 한 사용자의 카드 (C5 §2 서버 형태). 모달·프로필이 쓴다. */
export async function fetchProfileCard(userId, { client } = {}) {
  const db = resolveClient(client);
  if (!userId) throw domainError("PROFILE_NOT_FOUND");
  const { data, error } = await db.rpc("get_profile_card_v1", { p_user_id: userId });
  if (error) throw error;
  return unwrap(data, "PROFILE_NOT_FOUND").card;
}

/**
 * 여러 사용자의 카드를 `{ [userId]: card }`로 읽는다.
 * 상한(100)을 넘으면 나눠 부른다 — 랭킹 50행은 1회다. 프로필이 없는 ID는 결과에 없다.
 */
export async function fetchProfileCards(userIds, { client } = {}) {
  const ids = cardLookupIds(userIds);
  if (ids.length === 0) return {};
  const db = resolveClient(client);

  const cards = {};
  for (let offset = 0; offset < ids.length; offset += PROFILE_CARDS_BATCH_LIMIT) {
    const chunk = ids.slice(offset, offset + PROFILE_CARDS_BATCH_LIMIT);
    const { data, error } = await db.rpc("get_profile_cards_v1", { p_user_ids: chunk });
    if (error) throw error;
    Object.assign(cards, unwrap(data, "PROFILE_NOT_FOUND").cards || {});
  }
  return cards;
}

/** 본인 보유 목록 — 장착 가능한(은퇴하지 않은) 보상만, kind별 편집 UI 입력. */
export async function fetchOwnRewardInventory({ client } = {}) {
  const db = resolveClient(client);
  const { data, error } = await db
    .from("user_reward_inventory")
    .select("reward_id, acquired_at, reward_catalog(reward_id, kind, display_name, asset_ref, retired)")
    .order("acquired_at", { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((row) => row?.reward_catalog && row.reward_catalog.retired !== true)
    .map((row) => normalizeRewardRef(row.reward_catalog))
    .filter(Boolean);
}

/** 장착. 반환값은 갱신 후 전체 장착 상태(`equipment[]`). 실패는 C1 §4 코드를 `error.code`에 싣는다. */
export async function equipProfileReward({ slot, slotIndex = 1, rewardId }, { client } = {}) {
  const db = resolveClient(client);
  const { data, error } = await db.rpc("equip_profile_reward_v1", {
    p_slot: slot,
    p_slot_index: slotIndex,
    p_reward_id: rewardId,
  });
  if (error) throw error;
  return unwrap(data, "EQUIP_FAILED").equipment || [];
}

/** 해제. 반환값은 장착과 같다. */
export async function unequipProfileReward({ slot, slotIndex = 1 }, { client } = {}) {
  const db = resolveClient(client);
  const { data, error } = await db.rpc("unequip_profile_reward_v1", {
    p_slot: slot,
    p_slot_index: slotIndex,
  });
  if (error) throw error;
  return unwrap(data, "EQUIP_FAILED").equipment || [];
}
