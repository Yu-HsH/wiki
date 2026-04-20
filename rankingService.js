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
 * 전체 랭킹 또는 주간 TOP 랭킹을 가져옵니다.
 * @param {Object} options - {weekly: boolean, limit: number}
 */
export async function fetchRankings({ weekly = false, limit = 50 } = {}) {
  // 로컬 데모 모드 랭킹 산출
  if (!isSupabaseConfigured) {
    let records = readLocalRecords();
    if (weekly) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      records = records.filter((record) => new Date(record.created_at).getTime() >= sevenDaysAgo);
    }
    return sortByBestTime(records)
      .slice(0, limit)
      .map((record) => ({
        id: record.id,
        playerName: record.player_name,
        targetTitle: record.target_title,
        elapsedSeconds: record.elapsed_seconds,
        clickCount: record.click_count,
        createdAt: record.created_at,
        userId: record.user_id,
      }));
  }

  // Supabase 서버로부터 랭킹 데이터 조회
  let query = supabase
    .from("game_records")
    .select("id, user_id, player_name, target_title, elapsed_seconds, click_count, created_at")
    .order("elapsed_seconds", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (weekly) {
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", sevenDaysAgoIso);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((record) => ({
    id: record.id,
    playerName: record.player_name,
    targetTitle: record.target_title,
    elapsedSeconds: record.elapsed_seconds,
    clickCount: record.click_count,
    createdAt: record.created_at,
    userId: record.user_id,
  }));
}
