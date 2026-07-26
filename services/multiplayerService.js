import { supabase, isSupabaseConfigured } from "../supabaseClient";
import {
    fatalSessionError,
    isProgressAlreadyApplied,
    recoverableSessionError,
} from "../utils/onlineGameSession";

/**
 * 방 코드 생성
 */
function generateRoomCode(length = 6) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < length; i += 1) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

/**
 * 내 프로필 조회
 */
async function fetchMyProfile(userId) {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, nickname, profile_image_url")
        .eq("id", userId)
        .single();

    if (error) throw error;
    return data;
}

/**
 * 방 생성
 */
export async function createRoom(userId, options = {}) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const profile = await fetchMyProfile(userId);

    let roomCode = generateRoomCode();

    for (let i = 0; i < 3; i += 1) {
        const { data: existing } = await supabase
            .from("game_rooms")
            .select("id")
            .eq("room_code", roomCode)
            .maybeSingle();

        if (!existing) break;
        roomCode = generateRoomCode();
    }

    const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .insert({
            room_code: roomCode,
            host_user_id: userId,
            status: "waiting",
            use_items: options.useItems ?? true,
        })
        .select()
        .single();

    if (roomError) throw roomError;

    const { error: playerError } = await supabase.from("room_players").insert({
        room_id: room.id,
        user_id: userId,
        role: "host",
        nickname_snapshot: profile.nickname || "방장",
        profile_image_snapshot: profile.profile_image_url || null,
        is_ready: false,
        move_count: 0,
        has_finished: false,
    });

    if (playerError) throw playerError;

    return room;
}

/**
 * 방 찾기
 */
export async function findRoomByCode(roomCode) {
    const normalized = roomCode.trim().toUpperCase();

    const { data, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("room_code", normalized)
        .single();

    if (error) throw error;
    return data;
}

/**
 * 방 참가 (🔥 핵심 수정 완료)
 */
export async function joinRoom(roomId, userId) {
    const profile = await fetchMyProfile(userId);

    // 이미 참가 여부
    const { data: existingPlayer } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();

    if (existingPlayer) return existingPlayer;

    // 인원 제한
    const { data: players } = await supabase
        .from("room_players")
        .select("id")
        .eq("room_id", roomId);

    if ((players ?? []).length >= 2) {
        throw new Error("이미 가득 찬 방입니다.");
    }

    // ✅ 중요: select 제거
    const { error } = await supabase.from("room_players").insert({
        room_id: roomId,
        user_id: userId,
        role: "guest",
        nickname_snapshot: profile.nickname || "참가자",
        profile_image_snapshot: profile.profile_image_url || null,
        is_ready: false,
        move_count: 0,
        has_finished: false,
    });

    if (error?.code === "23505") {
        const { data: joinedPlayer, error: joinedError } = await supabase
            .from("room_players")
            .select("*")
            .eq("room_id", roomId)
            .eq("user_id", userId)
            .maybeSingle();

        if (joinedError) throw joinedError;
        if (joinedPlayer) return joinedPlayer;
    }

    if (error) throw error;

    return await fetchRoom(roomId);
}

/**
 * 방 플레이어 조회
 */
export async function fetchRoomPlayers(roomId) {
    const { data, error } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/**
 * 방 정보 조회
 */
export async function fetchRoom(roomId) {
    const { data, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        throw fatalSessionError(
            "ROOM_NOT_FOUND",
            "게임 방이 삭제되었거나 더 이상 접근할 수 없습니다."
        );
    }
    return data;
}

/**
 * 내 상태 업데이트
 */
export async function updateMyRoomPlayer(roomId, userId, updates) {
    const { data, error } = await supabase
        .from("room_players")
        .update(updates)
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 방 나가기
 */
export async function leaveRoom(roomId, userId) {
    await supabase
        .from("room_players")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId);

    const { data: remaining } = await supabase
        .from("room_players")
        .select("id")
        .eq("room_id", roomId);

    if (!remaining || remaining.length === 0) {
        await supabase.from("game_rooms").delete().eq("id", roomId);
    }
}

/**
 * 게임 시작
 */
export async function startRoomGame(roomId, userId) {
    const { data: room } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

    if (room.host_user_id !== userId) {
        throw new Error("호스트만 시작 가능");
    }

    const { data: players } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId);

    if (!players || players.length < 2) {
        throw new Error("상대 필요");
    }

    const { data, error } = await supabase
        .from("game_rooms")
        .update({
            status: "starting",
            started_at: new Date().toISOString(),
        })
        .eq("id", roomId)
        .select()
        .single();

    if (error) throw error;
    return data;
}
export async function updateGameRoomStatus(roomId, updates, options = {}) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    let query = supabase
        .from("game_rooms")
        .update(updates)
        .eq("id", roomId);

    if (options.expectedStatus) {
        query = query.eq("status", options.expectedStatus);
    }

    const { data, error } = await query
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const latest = await fetchRoom(roomId);
        if (updates.status && latest.status === updates.status) return latest;
        throw recoverableSessionError(
            "ROOM_STATUS_CONFLICT",
            "게임 상태가 변경되어 서버 상태를 다시 확인해야 합니다."
        );
    }

    return data;
}

export async function updateMyGameProgress(roomId, userId, updates) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const { data, error } = await supabase
        .from("room_players")
        .update(updates)
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function initializeMyGameProgress(roomId, userId, startTitle) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const { data, error } = await supabase
        .from("room_players")
        .update({
            start_title: startTitle,
            current_title: startTitle,
            move_count: 0,
            path_titles: [startTitle],
        })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .is("start_title", null)
        .is("current_title", null)
        .select("*")
        .maybeSingle();

    if (error) throw error;
    if (data) return data;

    const players = await fetchRoomPlayers(roomId);
    const latest = players.find((player) => player.user_id === userId);
    if (latest?.start_title && latest?.current_title) return latest;

    throw fatalSessionError(
        "MISSING_PROGRESS",
        "서버에 시작 문서를 설정하지 못했습니다."
    );
}

export async function advanceMyGameProgress(roomId, userId, updates) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const {
        currentTitle,
        moveCount,
        pathTitles,
        expectedMoveCount,
        hasFinished = false,
        finishedAt = null,
    } = updates;

    let query = supabase
        .from("room_players")
        .update({
            current_title: currentTitle,
            move_count: moveCount,
            path_titles: pathTitles || [],
            has_finished: hasFinished,
            finished_at: finishedAt,
        })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("has_finished", false);

    if (Number.isInteger(expectedMoveCount)) {
        query = query.eq("move_count", expectedMoveCount);
    }

    const { data, error } = await query.select("*").maybeSingle();
    if (error) throw error;
    if (data) return { ...data, __alreadyApplied: false };

    const players = await fetchRoomPlayers(roomId);
    const latest = players.find((player) => player.user_id === userId);
    const alreadyApplied = isProgressAlreadyApplied(latest, {
        currentTitle,
        moveCount,
        hasFinished,
    });

    if (alreadyApplied) return { ...latest, __alreadyApplied: true };

    throw recoverableSessionError(
        "PROGRESS_CONFLICT",
        "다른 탭에서 진행 상태가 변경되어 서버 상태를 다시 확인해야 합니다."
    );
}

export async function createMatchHistory(payload) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const { data, error } = await supabase
        .from("match_history")
        .insert(payload)
        .select()
        .single();

    if (error) throw error;
    return data;
}
// ... (기존 코드 하단에 추가 또는 수정)

/**
 * 1vs1 대전 결과 저장
 */
export async function saveMatchHistory({
    roomId,
    winnerUserId,
    loserUserId,
    durationSeconds,
    winnerStartTitle,
    loserStartTitle,
    winnerTargetTitle,
    loserTargetTitle
}) {
    if (!isSupabaseConfigured || !supabase) return;

    // 1. 게스트 유저 필터링 (UUID가 아닌 'guest-' 문자열은 skip)
    const isGuest = (id) => !id || id.startsWith('guest-');
    if (isGuest(winnerUserId) || isGuest(loserUserId)) {
        console.log("게스트 플레이어가 포함되어 전적을 저장하지 않습니다.");
        return;
    }

    try {
        // 2. 중복 저장 방지 (이미 해당 방의 기록이 있는지 확인)
        const { data: existing, error: existingError } = await supabase
            .from("match_history")
            .select("id")
            .eq("room_id", roomId)
            .limit(1)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
            console.log("이미 저장된 대전 기록입니다.");
            return;
        }

        // 3. 기록 저장
        const { error } = await supabase.from("match_history").insert({
            room_id: roomId,
            winner_user_id: winnerUserId,
            loser_user_id: loserUserId,
            duration_seconds: durationSeconds,
            winner_start_title: winnerStartTitle,
            loser_start_title: loserStartTitle,
            winner_target_title: winnerTargetTitle,
            loser_target_title: loserTargetTitle,
            created_at: new Date().toISOString()
        });

        if (error?.code === "23505") {
            console.log("다른 요청에서 이미 저장한 대전 기록입니다.");
            return;
        }
        if (error) throw error;
        console.log("대전 기록 저장 성공");
    } catch (err) {
        console.error("대전 기록 저장 중 오류 발생:", err);
    }
}
