import { isSupabaseConfigured, supabase } from "./supabaseClient";

/**
 * 게임 기록 및 랭킹 관리 서비스
 * - 온라인 서비스(Supabase)와 로컬 모드(LocalStorage)를 모두 지원합니다.
 */

const LOCAL_RECORDS_KEY = "wiki_game_records";

/**
 * 기록 목록을 소요 시간순(오름차순)으로 정렬하는 도우미 함수
 * 시간이 같다면 생성일(created_at) 순으로 정렬합니다.
 */
function sortByBestTime(records) {
  return [...records].sort((a, b) => {
    if (a.elapsed_seconds !== b.elapsed_seconds) {
      return a.elapsed_seconds - b.elapsed_seconds;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function readLocalRecords() {
  try {
    const raw = localStorage.getItem(LOCAL_RECORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalRecords(records) {
  localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
}

/**
 * 새로운 게임 완료 기록을 저장합니다.
 * @param {Object} record - {userId, playerName, startTitle, targetTitle, elapsedSeconds, clickCount}
 */
export async function saveGameRecord(record) {
  if (!record?.userId) return;

  const payload = {
    user_id: record.userId,
    player_name: record.playerName,
    start_title: record.startTitle,
    target_title: record.targetTitle,
    elapsed_seconds: record.elapsedSeconds,
    click_count: record.clickCount,
    path_titles: record.pathTitles ?? [],
    created_at: new Date().toISOString(),
  };

  // 1. 데모 모드 전용 (로컬 스토리지에 저장)
  if (!isSupabaseConfigured) {
    const localRecords = readLocalRecords();
    localRecords.push({ id: crypto.randomUUID(), ...payload });
    writeLocalRecords(localRecords);
    return;
  }

  // 2. 온라인 모드 (Supabase game_records 테이블에 삽입)
  const { error } = await supabase.from("game_records").insert(payload);
  if (error) throw error;
}

/**
 * 특정 유저의 플레이 통계(총 플레이 횟수, 최고 기록 등)를 가져옵니다.
 */
export async function fetchUserStats(userId) {
  if (!userId || userId.startsWith("guest-")) {
    return { gamesPlayed: 0, bestTime: null, recentRecords: [] };
  }

  // 로컬 데모 모드 통계 계산
  if (!isSupabaseConfigured) {
    const records = readLocalRecords().filter((record) => record.user_id === userId);
    const bestTime = records.length > 0 ? Math.min(...records.map((r) => r.elapsed_seconds)) : null;
    const recentRecords = sortByBestTime(records)
      .slice(0, 5)
      .map((record) => ({
        targetTitle: record.target_title,
        elapsedSeconds: record.elapsed_seconds,
        clickCount: record.click_count,
        createdAt: record.created_at,
      }));

    return {
      gamesPlayed: records.length,
      bestTime,
      recentRecords,
    };
  }

  // Supabase로부터 유저 데이터 조회
  const { data, error } = await supabase
    .from("game_records")
    .select("target_title, elapsed_seconds, click_count, created_at")
    .eq("user_id", userId)
    .order("elapsed_seconds", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const records = data || [];
  return {
    gamesPlayed: records.length,
    bestTime: records.length > 0 ? records[0].elapsed_seconds : null,
    recentRecords: records.slice(0, 5).map((record) => ({
      targetTitle: record.target_title,
      elapsedSeconds: record.elapsed_seconds,
      clickCount: record.click_count,
      createdAt: record.created_at,
    })),
  };
}
/**
 * 한국 시간(KST) 기준 특정 시점의 ISO 문자열을 구하는 헬퍼 함수
 */
function getKSTPeriodStartIso(period) {
  if (period === "all") return null;

  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  // 현재 시간을 KST 기준 날짜 객체로 변환 (UTC 시각에 9시간 더함)
  const kstNow = new Date(now.getTime() + kstOffset);

  const startKST = new Date(kstNow);
  startKST.setUTCHours(0, 0, 0, 0);

  if (period === "daily") {
    // KST 00:00:00에 해당하는 실제 UTC ISO 문자열 반환
    return new Date(startKST.getTime() - kstOffset).toISOString();
  }

  if (period === "weekly") {
    const day = startKST.getUTCDay(); // 일요일 0, 월요일 1
    // 월요일까지의 차이 계산 (월:0, 화:1 ... 일:6)
    const diffToMonday = day === 0 ? 6 : day - 1;
    startKST.setUTCDate(startKST.getUTCDate() - diffToMonday);
    return new Date(startKST.getTime() - kstOffset).toISOString();
  }

  return null;
}
/**
 * 일간/주간/전체 랭킹 데이터를 가져옵니다.
 * @param {Object} options - {period: "daily"|"weekly"|"all", limit: number}
 */
export async function fetchRankings({ period = "all", limit = 50 } = {}) {
  // 1. 로컬 데모 모드 랭킹 산출
  if (!isSupabaseConfigured) {
    let records = readLocalRecords();
    const periodStartIso = getKSTPeriodStartIso(period);

    if (periodStartIso) {
      const startTime = new Date(periodStartIso).getTime();

      records = records.filter(
        (r) => new Date(r.created_at).getTime() >= startTime
      );
    }

    return sortByBestTime(records)
      .slice(0, limit)
      .map((record) => ({
        id: record.id,
        userId: record.user_id,
        playerName: record.player_name,
        targetTitle: record.target_title,
        elapsedSeconds: record.elapsed_seconds,
        clickCount: record.click_count,
        pathTitles: record.path_titles ?? [],
        createdAt: record.created_at,
        profileImageUrl: null,
        nickname: null
      }));
  }

  // 2. Supabase 서버로부터 랭킹 데이터 조회
  let query = supabase
    .from("game_records")
    .select("id, user_id, player_name, target_title, elapsed_seconds, click_count, path_titles, created_at")
    .order("elapsed_seconds", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  const periodStartIso = getKSTPeriodStartIso(period);

  if (periodStartIso) {
    query = query.gte("created_at", periodStartIso);
  }

  const { data: records, error: recordError } = await query;
  if (recordError) throw recordError;

  const resultRecords = records || [];
  if (resultRecords.length === 0) return [];

  // 3. 연관된 프로필 정보 가져오기
  const userIds = [...new Set(resultRecords.map(r => r.user_id).filter(Boolean))];
  let profiles = [];

  if (userIds.length > 0) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, nickname, profile_image_url")
      .in("id", userIds);
    profiles = profileData || [];
  }

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));

  // 4. 결과 병합
  return resultRecords.map((record) => {
    const profile = profileMap[record.user_id];
    return {
      id: record.id,
      userId: record.user_id,
      playerName: record.player_name,
      targetTitle: record.target_title,
      elapsedSeconds: record.elapsed_seconds,
      clickCount: record.click_count,
      pathTitles: record.path_titles ?? [],
      createdAt: record.created_at,
      profileImageUrl: profile?.profile_image_url || null,
      nickname: profile?.nickname || null
    };
  });
}
