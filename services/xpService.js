import { isSupabaseConfigured, supabase } from "../supabaseClient.js";

/**
 * XP 조회 서비스 — 요약과 본인 원장 (트랙 15a).
 *
 * ## 지급 래퍼가 없는 이유
 *
 * `grant_xp_v1`은 **`authenticated`에 execute가 없다** (C2 §7). 그룹 결과 하나가 여덟
 * 명에게 지급하므로 RPC가 `p_user_id`를 인자로 받고, 그래서 로그인한 클라이언트가
 * 그것을 호출할 수 있으면 남의 XP를 만들 수 있다. 호출자는 `service_role`과 다른
 * `security definer` 함수뿐이다.
 *
 * → **여기에 `grantXp()`를 두면 anon 키로 호출돼 항상 42501로 실패한다.** 죽은 경로를
 * 만들지 않는다. 결과 확정 경로에 지급을 붙이는 일은 **15c**다
 * (`docs/agent/TRACKS.md` §6.3). 감쇠·카탈로그 계산은 `utils/xpRules.js`에 있다.
 *
 * ## 읽기 범위
 *
 * - `get_xp_summary_v1` — 누적·레벨·진행도. 레벨과 누적 XP는 랭킹과 참가자 행이
 *   **남의 것도 읽어야 하는 값**이라 본인 제한이 없다 (C3 §2).
 * - 원장 **행**은 본인만 읽는다. RLS 정책이 강제하므로 여기서 `user_id` 조건을 걸지
 *   않아도 남의 행은 오지 않는다 (C2 §6).
 */

/** `get_xp_summary_v1`이 XP가 하나도 없는 탐험가에게 돌려주는 것과 같은 형태. */
export const EMPTY_XP_SUMMARY = Object.freeze({
  totalXp: 0,
  level: 1,
  currentLevelXp: 0,
  nextLevelXp: 100,
});

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase가 설정되지 않았습니다.");
  }
}

function normalizeRpcRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

/**
 * `{ok:false, code}` 응답을 오류로 바꾼다. 계약이 정한 실패 코드를 그대로 `code`에
 * 실어 호출자가 문구를 고를 수 있게 한다.
 */
function unwrapRpcResponse(data, fallbackCode) {
  const response = normalizeRpcRow(data);
  if (!response) {
    const error = new Error(fallbackCode);
    error.code = fallbackCode;
    return { error };
  }
  if (response.ok === false) {
    const code = response.code || fallbackCode;
    const error = new Error(code);
    error.code = code;
    return { error };
  }
  return { response };
}

/**
 * 누적 XP·레벨·현재 레벨 진행도를 읽는다.
 *
 * `current/next`는 `15` §6의 "프로필에 현재 레벨·현재/다음 XP 표시"가 쓰는 쌍이다.
 * 레벨 공식은 프론트에 두지 않는다 — `level_from_total_xp`가 단일 정의다 (C3 §3·§4).
 *
 * @returns {Promise<{totalXp:number, level:number, currentLevelXp:number, nextLevelXp:number}>}
 */
export async function fetchXpSummary(userId) {
  requireSupabase();
  if (!userId) {
    const error = new Error("PROFILE_NOT_FOUND");
    error.code = "PROFILE_NOT_FOUND";
    throw error;
  }

  const { data, error } = await supabase.rpc("get_xp_summary_v1", {
    p_user_id: userId,
  });
  if (error) throw error;

  const { response, error: domainError } = unwrapRpcResponse(data, "PROFILE_NOT_FOUND");
  if (domainError) throw domainError;

  return {
    totalXp: Number(response.total_xp ?? 0),
    level: Number(response.level ?? 1),
    currentLevelXp: Number(response.current_level_xp ?? 0),
    nextLevelXp: Number(response.next_level_xp ?? 100),
  };
}

/** `xp_ledger` 행을 프론트 표기로 정규화한다. */
export function normalizeXpLedgerEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    xpClass: row.xp_class,
    sourceType: row.source_type,
    sourceId: row.source_id,
    baseAmount: Number(row.base_amount ?? 0),
    amount: Number(row.amount ?? 0),
    // null이면 감쇠가 없었다는 뜻이고, 그때 amount는 baseAmount와 같다 (C2 §5).
    decayReason: row.decay_reason ?? null,
    grantedAt: row.granted_at ?? null,
  };
}

/**
 * 본인 XP 원장을 최근 순으로 읽는다.
 *
 * RLS가 `auth.uid() = user_id`를 강제하므로 로그인한 사용자에게는 자기 행만 온다.
 * 게스트는 테이블 select 권한 자체가 없어 빈 배열을 받는다 (C2 §6).
 * `xp_ledger_user_granted_idx`가 이 정렬을 그대로 받는다.
 */
export async function fetchOwnXpLedger({ limit = 20 } = {}) {
  requireSupabase();
  const { data, error } = await supabase
    .from("xp_ledger")
    .select(
      "id, xp_class, source_type, source_id, base_amount, amount, decay_reason, granted_at"
    )
    .order("granted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(normalizeXpLedgerEntry).filter(Boolean);
}
