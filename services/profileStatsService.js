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
 * 유저의 공개 프로필 정보(아이디, 닉네임, 프로필 이미지)를 가져옵니다.
 * @param {string} userId
 */
export async function fetchPublicProfile(userId) {
  if (!userId || userId.startsWith("guest-")) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("username, nickname, profile_image_url")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("fetchPublicProfile error:", error);
    return null;
  }
  return data;
}
