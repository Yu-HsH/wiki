import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

/**
 * 게임 기록 및 랭킹 관리 서비스
 * - 온라인 서비스(Supabase)와 로컬 모드(LocalStorage)를 모두 지원합니다.
 */

const LOCAL_RECORDS_KEY = "wiki_game_records";

/**
 * 싱글 기록 단일 조회 경로가 읽는 컬럼.
 *
 * 결과 화면과 프로필 history가 **같은 조회 경로**를 써야 한다 (패킷 17 §4·§8).
 * 그래서 컬럼 목록도 한 곳에만 있다.
 */
const SINGLE_RECORD_COLUMNS =
  "id, run_id, user_id, player_name, start_title, target_title, elapsed_seconds, click_count, path_titles, result_status, created_at";

/**
 * `game_records` 행을 프론트 표기로 정규화합니다.
 * 로컬 데모 기록에는 `run_id`·`result_status`가 없으므로 서버 기본값과 같게 채웁니다.
 */
function normalizeGameRecord(record) {
  return {
    id: record.id,
    runId: record.run_id ?? null,
    userId: record.user_id ?? null,
    playerName: record.player_name ?? null,
    startTitle: record.start_title ?? null,
    targetTitle: record.target_title ?? null,
    elapsedSeconds: record.elapsed_seconds,
    clickCount: record.click_count,
    pathTitles: record.path_titles ?? [],
    resultStatus: record.result_status ?? "completed",
    createdAt: record.created_at,
  };
}

/**
 * 조회에 쓸 Supabase 클라이언트를 정합니다.
 * 명시적으로 넘어온 클라이언트가 있으면 그것을 쓰고(테스트 주입), 없으면 전역 설정을 따릅니다.
 * `null`이면 서버가 없다는 뜻이고 호출부는 로컬 데모 경로로 떨어집니다.
 */
function resolveRecordsClient(client) {
  if (client) return client;
  return isSupabaseConfigured ? supabase : null;
}

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
 * 싱글 기록 **단일 조회 경로**.
 *
 * 결과 화면(`SuccessOverlay`)과 프로필 history(`profileStatsService`)가 둘 다 이 함수를 지납니다 —
 * 두 화면이 서로 다른 쿼리를 쓰면 같은 런에 서로 다른 값이 표시될 수 있습니다 (패킷 17 §4).
 *
 * @param {Object} [options]
 * @param {string|null} [options.userId] 지정하면 그 사용자의 기록만
 * @param {string|null} [options.runId] 지정하면 그 런의 기록만 (`game_records.run_id`는 유니크)
 * @param {number|null} [options.limit] 상위 N건
 * @param {Object} [options.client] 조회에 쓸 Supabase 클라이언트 (미지정 시 전역 설정)
 * @returns {Promise<Array<Object>>} 소요 시간 오름차순, 동률은 기록 시각 오름차순
 */
export async function fetchSingleGameRecords({
  userId = null,
  runId = null,
  limit = null,
  client,
} = {}) {
  const db = resolveRecordsClient(client);

  // 로컬 데모 모드
  if (!db) {
    let records = readLocalRecords();
    if (userId) records = records.filter((record) => record.user_id === userId);
    if (runId) records = records.filter((record) => record.run_id === runId);

    const sorted = sortByBestTime(records).map(normalizeGameRecord);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  let query = db
    .from("game_records")
    .select(SINGLE_RECORD_COLUMNS)
    .order("elapsed_seconds", { ascending: true })
    .order("created_at", { ascending: true });

  if (userId) query = query.eq("user_id", userId);
  if (runId) query = query.eq("run_id", runId);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(normalizeGameRecord);
}

/**
 * 조건에 맞는 `game_records` 행 수를 **서버가 셉니다.**
 * `head: true`라 행 본문은 내려오지 않고 count만 옵니다.
 */
async function countGameRecords(db, applyFilters) {
  const query = applyFilters(
    db.from("game_records").select("id", { count: "exact", head: true })
  );

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * 서버 권위 결과에서 싱글 런의 순위를 얻습니다.
 *
 * **클라이언트가 랭킹 목록에서 자기 기록을 찾아내지 않습니다.** 순위는
 * "나보다 앞선 기록이 서버에 몇 개인가"를 서버가 센 값입니다. 정렬 기준은
 * `fetchRankings`와 같은 소요 시간 → 기록 시각 순서입니다.
 *
 * @param {Object} [options]
 * @param {string} options.runId `single_game_runs.id` (= `game_records.run_id`)
 * @param {Object} [options.client] 조회에 쓸 Supabase 클라이언트
 * @returns {Promise<{record: Object, rank: number, totalCount: number}|null>}
 *   서버에 확정된 기록이 없으면 `null`. **게스트 런은 영구 행을 만들지 않으므로 항상 `null`입니다.**
 */
export async function fetchSingleRunResult({ runId, client } = {}) {
  if (!runId) return null;

  const db = resolveRecordsClient(client);
  if (!db) return null;

  const [record] = await fetchSingleGameRecords({ runId, limit: 1, client: db });
  if (!record) return null;

  const [fasterCount, tiedEarlierCount, totalCount] = await Promise.all([
    countGameRecords(db, (query) =>
      query.lt("elapsed_seconds", record.elapsedSeconds)
    ),
    countGameRecords(db, (query) =>
      query
        .eq("elapsed_seconds", record.elapsedSeconds)
        .lt("created_at", record.createdAt)
    ),
    countGameRecords(db, (query) => query),
  ]);

  return {
    record,
    rank: fasterCount + tiedEarlierCount + 1,
    totalCount,
  };
}

/**
 * 새로운 게임 완료 기록을 저장합니다.
 * @param {Object} record - {userId, playerName, startTitle, targetTitle, elapsedSeconds, clickCount}
 */
export async function saveGameRecord(record) {
  if (!record?.userId) return;

  // 게스트는 어떤 경로로도 영구 기록을 만들지 않는다 (패킷 17 §6).
  // 호출부(`App.jsx`)의 가드에만 의존하면 새 호출자가 생겼을 때 조용히 뚫린다.
  if (String(record.userId).startsWith("guest-")) return;

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
  throw new Error("온라인 게임 기록은 서버에서 자동 저장됩니다.");
}

/**
 * 특정 유저의 플레이 통계(총 플레이 횟수, 최고 기록 등)를 가져옵니다.
 *
 * 조회는 `fetchSingleGameRecords`를 지납니다 — 결과 화면과 같은 경로입니다.
 */
export async function fetchUserStats(userId) {
  if (!userId || userId.startsWith("guest-")) {
    return { gamesPlayed: 0, bestTime: null, recentRecords: [] };
  }

  const records = await fetchSingleGameRecords({ userId });

  return {
    gamesPlayed: records.length,
    bestTime: records.length > 0 ? records[0].elapsedSeconds : null,
    recentRecords: records.slice(0, 5).map((record) => ({
      targetTitle: record.targetTitle,
      elapsedSeconds: record.elapsedSeconds,
      clickCount: record.clickCount,
      createdAt: record.createdAt,
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
