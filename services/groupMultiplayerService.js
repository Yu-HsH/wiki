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

/**
 * 단체모드 방 생성
 */
export async function createGroupRoom(options = {}) {
    assertSupabase();

    const {
        maxPlayers = 6,
        minPlayers = 3,
        finishRankLimit = 3,
    } = options;

    const { data, error } = await supabase.rpc("create_group_room", {
        p_max_players: maxPlayers,
        p_min_players: minPlayers,
        p_finish_rank_limit: finishRankLimit,
    });

    if (error) throw error;

    return normalizeRpcRow(data);
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
export async function joinGroupRoom(roomId) {
    assertSupabase();

    if (!roomId) {
        throw new Error("방 정보가 없습니다.");
    }

    const { data, error } = await supabase.rpc("join_group_room", {
        p_room_id: roomId,
    });

    if (error) throw error;

    return normalizeRpcRow(data);
}

/**
 * 단체모드 방 나가기
 */
export async function leaveGroupRoom(roomId) {
    assertSupabase();

    if (!roomId) return null;

    const { data, error } = await supabase.rpc("leave_group_waiting_room", {
        p_room_id: roomId,
    });

    if (error) throw error;

    return normalizeRpcRow(data);
}

/**
 * 키워드/목표 문서 제출 + 준비 완료
 */
export async function submitGroupKeyword(roomId, payload) {
    assertSupabase();

    const { rawKeyword, selectedTitle } = payload;

    if (!roomId) {
        throw new Error("방 정보가 없습니다.");
    }

    if (!selectedTitle) {
        throw new Error("목표 문서를 선택해주세요.");
    }

    const { error } = await supabase.rpc("submit_group_target", {
        p_room_id: roomId,
        p_submitted_keyword: rawKeyword || selectedTitle,
        p_submitted_target_title: selectedTitle,
    });

    if (error) throw error;

    return setGroupReady(roomId, true);
}

export async function setGroupReady(roomId, isReady) {
    assertSupabase();

    const { data, error } = await supabase.rpc("set_group_ready", {
        p_room_id: roomId,
        p_is_ready: isReady,
    });

    if (error) throw error;

    return normalizeRpcRow(data);
}

/**
 * 준비 해제
 */
export async function unreadyGroupPlayer(roomId) {
    return setGroupReady(roomId, false);
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

    const { data: rpcData, error } = await supabase.rpc("update_group_progress", {
        p_room_id: roomId,
        p_current_title: currentTitle,
        p_move_count: moveCount,
        p_path_titles: pathTitles || [],
        p_expected_move_count: Number.isInteger(expectedMoveCount)
            ? expectedMoveCount
            : null,
    });

    if (error) throw error;

    const data = normalizeRpcRow(rpcData);

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

function normalizeRpcRow(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

/**
 * 카운트다운 종료 후 서버에 경기 활성화를 요청한다.
 *
 * RPC는 이미 playing인 방을 다시 호출해도 현재 방 행을 반환하는
 * 멱등 계약을 전제로 한다. 따라서 클라이언트는 이 함수의 반환값을
 * 최신 game_rooms 행으로 사용하고, 직접 status를 변경하지 않는다.
 */
export async function activateGroupRoomGame(roomId) {
    assertSupabase();

    const { data, error } = await supabase.rpc("activate_group_room_game", {
        p_room_id: roomId,
    });

    if (error) throw error;

    return normalizeRpcRow(data);
}

/**
 * 제한시간 또는 유예시간 만료 시 방 최종화를 요청한다.
 */
export async function finalizeGroupRoomIfExpired(roomId) {
    assertSupabase();

    const { data, error } = await supabase.rpc("finalize_group_room_if_expired", {
        p_room_id: roomId,
    });

    if (error) throw error;

    return normalizeRpcRow(data);
}

/**
 * 진행 중인 단체 게임 나가기
 *
 * 대기실에서만 기존 참가자 행 삭제 흐름을 사용한다. 경기 시작 후에는
 * leave_group_player RPC가 실패해도 직접 DELETE로 대체하지 않는다.
 */
export async function leaveGroupGame(
    roomId,
    userId,
    {
        hasFinished = false,
        roomStatus,
        status,
        reason,
        retireReason,
    } = {}
) {
    assertSupabase();

    if (!roomId || !userId) return null;

    const effectiveRoomStatus = roomStatus || status || "playing";

    if (effectiveRoomStatus === "waiting") {
        await leaveGroupRoom(roomId);
        return null;
    }

    // finished 방은 결과를 다시 쓰지 않고 화면 이탈만 처리한다.
    // hasFinished는 기존 호출부 호환을 위해 받지만, 실제 결과 보호 기준은
    // 서버가 반환한 방 상태다.
    if (effectiveRoomStatus === "finished") return null;

    const effectiveReason = reason || retireReason || "left";
    if (!["left", "forfeited"].includes(effectiveReason)) {
        throw new Error("유효하지 않은 RETIRE 사유입니다.");
    }

    const { data, error } = await supabase.rpc("leave_group_player", {
        p_room_id: roomId,
        p_retire_reason: effectiveReason,
    });

    if (error) throw error;

    return normalizeRpcRow(data);
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
