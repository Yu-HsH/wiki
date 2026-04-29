import { supabase, isSupabaseConfigured } from "../supabaseClient";

/**
 * 프로필 전적 조회 서비스
 * - 싱글 플레이, 1vs1, 그룹 모드 전적을 조회합니다.
 * - 게스트 유저는 전적 대상에서 제외됩니다.
 */

/**
 * 1. 싱글 플레이 전적 조회
 * @param {string} userId
 */
export async function fetchSinglePlayerStats(userId) {
  if (!isSupabaseConfigured || !userId || userId.startsWith("guest-")) {
    return { totalWins: 0, bestTime: null, bestClicks: null };
  }

  // game_records 테이블 활용
  const { data, error } = await supabase
    .from("game_records")
    .select("elapsed_seconds, click_count")
    .eq("user_id", userId);

  if (error) {
    console.error("싱글 플레이 전적 조회 오류:", error);
    return { totalWins: 0, bestTime: null, bestClicks: null };
  }

  const records = data || [];
  if (records.length === 0) {
    return { totalWins: 0, bestTime: null, bestClicks: null };
  }

  const bestTime = Math.min(...records.map((r) => r.elapsed_seconds));
  const bestClicks = Math.min(...records.map((r) => r.click_count));

  return {
    totalWins: records.length,
    bestTime,
    bestClicks,
  };
}

/**
 * 2. 1vs1 멀티플레이 전적 조회
 * @param {string} userId
 */
export async function fetch1v1Stats(userId) {
  if (!isSupabaseConfigured || !userId || userId.startsWith("guest-")) {
    return { wins: 0, losses: 0, winRate: 0 };
  }

  const { count: wins, error: winError } = await supabase
    .from("match_history")
    .select("*", { count: "exact", head: true })
    .eq("winner_user_id", userId);

  const { count: losses, error: lossError } = await supabase
    .from("match_history")
    .select("*", { count: "exact", head: true })
    .eq("loser_user_id", userId);

  if (winError || lossError) {
    console.error("1vs1 전적 조회 오류:", winError || lossError);
    return { wins: 0, losses: 0, winRate: 0 };
  }

  const total = (wins || 0) + (losses || 0);
  const winRate = total > 0 ? Math.round(((wins || 0) / total) * 100) : 0;

  return {
    wins: wins || 0,
    losses: losses || 0,
    winRate,
  };
}

/**
 * 3. 그룹 모드 전적 (1/2/3등 횟수) 조회
 * @param {string} userId
 */
export async function fetchGroupStats(userId) {
  if (!isSupabaseConfigured || !userId || userId.startsWith("guest-")) {
    return { first: 0, second: 0, third: 0 };
  }

  try {
    const { data, error } = await supabase
      .from("group_match_history")
      .select("rank")
      .eq("user_id", userId);

    if (error) throw error;

    const stats = { first: 0, second: 0, third: 0 };
    if (data) {
      data.forEach((row) => {
        if (row.rank === 1) stats.first += 1;
        else if (row.rank === 2) stats.second += 1;
        else if (row.rank === 3) stats.third += 1;
      });
    }
    return stats;
  } catch (error) {
    console.error("그룹 모드 전적 조회 오류:", error);
    return { first: 0, second: 0, third: 0 };
  }
}

/**
 * 특정 유저의 전체 전적(종합)을 한 번에 조회
 * @param {string} userId
 */
export async function fetchAllProfileStats(userId) {
  const [single, pvp, group] = await Promise.all([
    fetchSinglePlayerStats(userId),
    fetch1v1Stats(userId),
    fetchGroupStats(userId),
  ]);

  return {
    single,
    pvp,
    group,
  };
}

/**
 * 그룹 모드 결과 저장 (게임 종료 시 호출)
 * @param {string} roomId
 */
export async function recordGroupMatchHistory(roomId) {
  if (!isSupabaseConfigured || !roomId) return;

  try {
    // 1. 방의 모든 플레이어 정보 조회
    const { data: players, error: playerError } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId);

    if (playerError) throw playerError;

    // 2. 완주한 플레이어들을 순위 또는 종료 시간 기준으로 정렬
    const finishedPlayers = players
      .filter((p) => p.has_finished)
      .sort((a, b) => {
        if (a.rank && b.rank) return a.rank - b.rank;
        const timeA = a.finished_at ? new Date(a.finished_at).getTime() : Infinity;
        const timeB = b.finished_at ? new Date(b.finished_at).getTime() : Infinity;
        return timeA - timeB;
      });

    if (finishedPlayers.length === 0) return;

    // 3. 기록 데이터 생성 (게스트 유저 제외)
    const historyData = finishedPlayers
      .filter((p) => p.user_id && !p.user_id.startsWith("guest-"))
      .map((p, index) => ({
        room_id: roomId,
        user_id: p.user_id,
        rank: p.rank || (index + 1),
        elapsed_seconds: p.elapsed_seconds || 0,
        move_count: p.move_count || 0,
        created_at: new Date().toISOString(),
      }));

    if (historyData.length === 0) return;

    // 4. Upsert를 통해 중복 저장 방지 (room_id, user_id 유니크 제약 조건 필요)
    const { error: insertError } = await supabase
      .from("group_match_history")
      .upsert(historyData, { onConflict: "room_id, user_id" });

    if (insertError) throw insertError;

    console.log(`[Success] Group match history recorded for room: ${roomId}`);
  } catch (error) {
    console.error("그룹 모드 결과 저장 중 오류 발생:", error);
  }
}
