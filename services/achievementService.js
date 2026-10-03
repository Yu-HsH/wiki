import { isSupabaseConfigured, supabase } from "../supabaseClient.js";

/**
 * 업적 조회 서비스 — 16a 읽기 RPC 3개의 클라이언트 측 (트랙 16c).
 *
 * 업적 테이블은 `authenticated`에 권한이 0이다 (`16-HANDOFF.md` §4 G5). 그래서 여기에는
 * 테이블 select가 없고 RPC만 있다. 히든 업적의 이름·조건은 **서버 응답에서만** 온다 —
 * 이 파일과 화면 코드에 히든 문자열을 두지 않는다 (16c 수용조건).
 *
 * - `get_my_achievements_v1()` — 업적 화면 · 로비 알림(`unseenCount`) · 프로필 요약
 * - `get_result_achievements_v1(scope, result_id)` — 결과 화면 reveal. 결과 ID는 15c와 같다
 * - `mark_achievements_seen_v1(ids)` — NEW 해제. `null`이면 본인 해금 전부
 */

function resolveClient(client) {
  if (client) return client;
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase가 설정되지 않았습니다.");
  }
  return supabase;
}

function unwrap(data, fallbackCode) {
  const response = Array.isArray(data) ? data[0] || null : data || null;
  if (!response || response.ok === false) {
    const code = response?.code || fallbackCode;
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return response;
}

/** 업적 화면 전체 — `{achievements, hidden:{discovered, achievements}, unseenCount}`. */
export async function fetchMyAchievements({ client } = {}) {
  const db = resolveClient(client);
  const { data, error } = await db.rpc("get_my_achievements_v1");
  if (error) throw error;
  return unwrap(data, "AUTH_REQUIRED");
}

/**
 * 결과 하나가 본인에게 연 해금 — 업적별로 묶이고 히든이 앞에 온다 (G9).
 *
 * @param {{scope: "single"|"duel"|"group", resultId: string}} input
 */
export async function fetchResultAchievements({ scope, resultId, client } = {}) {
  if (!resultId) return { achievements: [], xpTotal: 0 };
  const db = resolveClient(client);
  const { data, error } = await db.rpc("get_result_achievements_v1", {
    p_scope: scope,
    p_result_id: resultId,
  });
  if (error) throw error;
  return unwrap(data, "RESULT_ID_REQUIRED");
}

/** NEW 해제. `unlockIds`가 없으면 본인 해금 전부. 남의 ID는 서버가 조용히 무시한다. */
export async function markAchievementsSeen({ unlockIds = null, client } = {}) {
  const db = resolveClient(client);
  const ids = Array.isArray(unlockIds) ? unlockIds.filter(Boolean) : null;
  if (ids && ids.length === 0) return { marked: 0 };
  const { data, error } = await db.rpc("mark_achievements_seen_v1", { p_unlock_ids: ids });
  if (error) throw error;
  return unwrap(data, "AUTH_REQUIRED");
}

/**
 * 누적 XP가 몇 레벨인지 서버에 묻는다 — 결과 화면의 다중 레벨업 판정(판정 9)이
 * "이번 획득 전" 레벨을 얻는 데 쓴다. **공식은 DB의 `level_from_total_xp`에만 있다**
 * (C3 §3·§4) — 여기서는 그 함수를 부를 뿐 다시 쓰지 않는다.
 */
export async function fetchLevelAtTotalXp(totalXp, { client } = {}) {
  const db = resolveClient(client);
  const value = Math.max(0, Math.trunc(Number(totalXp) || 0));
  const { data, error } = await db.rpc("level_from_total_xp", { p_total_xp: value });
  if (error) throw error;
  const level = Number(Array.isArray(data) ? data[0] : data);
  if (!Number.isFinite(level)) throw new Error("LEVEL_UNAVAILABLE");
  return level;
}
