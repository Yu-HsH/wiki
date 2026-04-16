import { isSupabaseConfigured, supabase } from "./supabaseClient";

const LOCAL_RECORDS_KEY = "wiki_game_records";

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

  if (!isSupabaseConfigured) {
    const localRecords = readLocalRecords();
    localRecords.push({ id: crypto.randomUUID(), ...payload });
    writeLocalRecords(localRecords);
    return;
  }

  const { error } = await supabase.from("game_records").insert(payload);
  if (error) throw error;
}

export async function fetchUserStats(userId) {
  if (!userId) {
    return { gamesPlayed: 0, bestTime: null, recentRecords: [] };
  }

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

export async function fetchRankings({ weekly = false, limit = 50 } = {}) {
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
