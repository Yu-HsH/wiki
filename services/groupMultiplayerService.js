import { supabase, isSupabaseConfigured } from "../supabaseClient";
import {
    fatalSessionError,
    isProgressAlreadyApplied,
    recoverableSessionError,
} from "../utils/onlineGameSession";

function assertSupabase() {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }
}

function generateRoomCode(length = 6) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";

    for (let i = 0; i < length; i += 1) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }

    return result;
}

export async function fetchMyProfile(userId) {
    assertSupabase();

    const { data, error } = await supabase
        .from("profiles")
        .select("id, nickname, profile_image_url")
        .eq("id", userId)
        .single();

    if (error) throw error;
    return data;
}

/**
 * 단체모드 방 생성
 */
export async function createGroupRoom(userId, options = {}) {
    assertSupabase();

    if (!userId) {
        throw new Error("로그인이 필요합니다.");
    }

    const profile = await fetchMyProfile(userId);

    const {
        maxPlayers = 6,
        minPlayers = 3,
        finishRankLimit = 3,
    } = options;

    let roomCode = generateRoomCode();

    // room_code 중복 방지용 간단 재시도
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
            mode: "group",
            max_players: maxPlayers,
            min_players: minPlayers,
            finish_rank_limit: finishRankLimit,
        })
        .select("*")
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
        path_titles: [],
    });

    if (playerError) throw playerError;

    return room;
}

/**
 * 방 코드로 단체모드 방 찾기
 */
export async function findGroupRoomByCode(roomCode) {
    assertSupabase();

    const normalized = roomCode?.trim().toUpperCase();

    if (!normalized) {
        throw new Error("방 코드를 입력해주세요.");
    }

    const { data, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("room_code", normalized)
        .eq("mode", "group")
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        throw fatalSessionError(
            "ROOM_NOT_FOUND",
            "단체모드 방이 삭제되었거나 더 이상 접근할 수 없습니다."
        );
    }

    return data;
}

/**
 * 단체모드 방 정보 조회
 */
export async function fetchGroupRoom(roomId) {
    assertSupabase();

    const { data, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .eq("mode", "group")
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        throw fatalSessionError(
            "ROOM_NOT_FOUND",
            "단체모드 방이 삭제되었거나 더 이상 접근할 수 없습니다."
        );
    }

    return data;
}

/**
 * 단체모드 참가자 목록 조회
 */
export async function fetchGroupRoomPlayers(roomId) {
    assertSupabase();

    const { data, error } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
}

/**
 * 단체모드 방 참가
 */
export async function joinGroupRoom(roomId, userId) {
    assertSupabase();

    if (!roomId || !userId) {
        throw new Error("방 정보 또는 사용자 정보가 없습니다.");
    }

    const room = await fetchGroupRoom(roomId);
    const profile = await fetchMyProfile(userId);

    const { data: existingPlayer, error: existingError } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) throw existingError;
    if (existingPlayer) return existingPlayer;

    if (room.status !== "waiting") {
        throw new Error("이미 시작된 방에는 참가할 수 없습니다.");
    }

    const players = await fetchGroupRoomPlayers(roomId);

    if (players.length >= room.max_players) {
        throw new Error("방 인원이 가득 찼습니다.");
    }

    const { error } = await supabase.from("room_players").insert({
        room_id: roomId,
        user_id: userId,
        role: "guest",
        nickname_snapshot: profile.nickname || "참가자",
        profile_image_snapshot: profile.profile_image_url || null,
        is_ready: false,
        move_count: 0,
        has_finished: false,
        path_titles: [],
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

    return await fetchGroupRoom(roomId);
}

/**
 * 단체모드 방 나가기
 */
export async function leaveGroupRoom(roomId, userId) {
    assertSupabase();

    if (!roomId || !userId) return;

    const { error: deletePlayerError } = await supabase
        .from("room_players")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId);

    if (deletePlayerError) throw deletePlayerError;

    const { data: remainingPlayers, error: remainingError } = await supabase
        .from("room_players")
        .select("id")
        .eq("room_id", roomId);

    if (remainingError) throw remainingError;

    if (!remainingPlayers || remainingPlayers.length === 0) {
        const { error: deleteRoomError } = await supabase
            .from("game_rooms")
            .delete()
            .eq("id", roomId);

        if (deleteRoomError) throw deleteRoomError;
    }
}

/**
 * 키워드/목표 문서 제출 + 준비 완료
 */
export async function submitGroupKeyword(roomId, userId, payload) {
    assertSupabase();

    const { rawKeyword, selectedTitle } = payload;

    if (!roomId || !userId) {
        throw new Error("방 정보 또는 사용자 정보가 없습니다.");
    }

    if (!selectedTitle) {
        throw new Error("목표 문서를 선택해주세요.");
    }

    const { data, error } = await supabase
        .from("room_players")
        .update({
            submitted_keyword: rawKeyword || selectedTitle,
            submitted_target_title: selectedTitle,
            target_title: selectedTitle,
            is_ready: true,
            updated_at: new Date().toISOString(),
        })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .select("*")
        .single();

    if (error) throw error;

    await insertRoomEvent(roomId, userId, "submit_keyword", {
        rawKeyword,
        selectedTitle,
    }).catch(() => { });

    return data;
}

/**
 * 준비 해제
 */
export async function unreadyGroupPlayer(roomId, userId) {
    assertSupabase();

    const { data, error } = await supabase
        .from("room_players")
        .update({
            is_ready: false,
            updated_at: new Date().toISOString(),
        })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .select("*")
        .single();

    if (error) throw error;

    await insertRoomEvent(roomId, userId, "ready_toggle", {
        isReady: false,
    }).catch(() => { });

    return data;
}

/**
 * 방장이 단체모드 시작
 */
export async function startGroupRoomGame(roomId) {
    assertSupabase();

    const { data, error } = await supabase.rpc("start_group_room_game", {
        p_room_id: roomId,
    });

    if (error) throw error;

    return data;
}

/**
 * 게임 중 현재 상태 업데이트
 */
export async function updateGroupPlayerProgress(roomId, userId, updates) {
    assertSupabase();

    const { currentTitle, moveCount, pathTitles, expectedMoveCount } = updates;

    let query = supabase
        .from("room_players")
        .update({
            current_title: currentTitle,
            move_count: moveCount,
            path_titles: pathTitles || [],
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("has_finished", false);

    if (Number.isInteger(expectedMoveCount)) {
        query = query.eq("move_count", expectedMoveCount);
    }

    const { data, error } = await query
        .select("*")
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const { data: latest, error: latestError } = await supabase
            .from("room_players")
            .select("*")
            .eq("room_id", roomId)
            .eq("user_id", userId)
            .maybeSingle();

        if (latestError) throw latestError;

        const alreadyApplied = isProgressAlreadyApplied(latest, {
            currentTitle,
            moveCount,
            hasFinished: false,
        });

        if (alreadyApplied) return latest;

        throw recoverableSessionError(
            "PROGRESS_CONFLICT",
            "다른 탭에서 진행 상태가 변경되어 서버 상태를 다시 확인해야 합니다."
        );
    }

    return data;
}

function isMissingLeaveRpc(error) {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || "").toLowerCase();
    return (
        code === "PGRST202" ||
        code === "42883" ||
        message.includes("leave_group_player") && message.includes("function")
    );
}

/**
 * 진행 중인 단체 게임 나가기
 *
 * 신규 RPC가 적용된 환경에서는 참가자 행과 결과 스냅샷을 보존해 DNF로 처리합니다.
 * 아직 마이그레이션이 적용되지 않은 환경에서는 미완주자만 기존 삭제 방식으로
 * 정리하고, 완주자의 기록 행은 결과 조회 권한과 순위 보존을 위해 유지합니다.
 */
export async function leaveGroupGame(roomId, userId, { hasFinished = false } = {}) {
    assertSupabase();

    if (!roomId || !userId) return null;

    const { data, error } = await supabase.rpc("leave_group_player", {
        p_room_id: roomId,
    });

    if (!error) return Array.isArray(data) ? data[0] : data;
    if (!isMissingLeaveRpc(error)) throw error;

    if (hasFinished) return null;
    await leaveGroupRoom(roomId, userId);
    return null;
}

/**
 * 목표 도착 처리
 */
export async function finishGroupPlayer(roomId, payload) {
    assertSupabase();

    const { elapsedSeconds, moveCount, currentTitle, pathTitles } = payload;

    const { data, error } = await supabase.rpc("finish_group_player", {
        p_room_id: roomId,
        p_elapsed_seconds: elapsedSeconds,
        p_move_count: moveCount,
        p_current_title: currentTitle,
        p_path_titles: pathTitles || [],
    });

    if (error) throw error;

    return Array.isArray(data) ? data[0] : data;
}

/**
 * 단체모드 결과 조회
 */
export async function fetchGroupResults(roomId) {
    assertSupabase();

    const { data, error } = await supabase
        .from("group_match_results")
        .select("*")
        .eq("room_id", roomId)
        .order("rank", { ascending: true, nullsFirst: false })
        .order("finished_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
}

/**
 * room_events 기록
 */
export async function insertRoomEvent(roomId, userId, eventType, payload = {}) {
    assertSupabase();

    const { error } = await supabase.from("room_events").insert({
        room_id: roomId,
        user_id: userId,
        event_type: eventType,
        payload,
    });

    if (error) throw error;

    return true;
}
