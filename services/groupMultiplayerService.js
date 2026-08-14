import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { fatalSessionError } from "../utils/onlineGameSession";
import { createCorrelationId, createRequestId } from "../utils/serverAuthority";

function assertSupabase() {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }
}

function normalizeRpcRow(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

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

export async function findGroupRoomByCode(roomCode) {
    assertSupabase();
    const normalized = roomCode?.trim().toUpperCase();
    if (!normalized) throw new Error("방 코드를 입력해주세요.");
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
            "단체 모드 방이 삭제되었거나 더 이상 접근할 수 없습니다."
        );
    }
    return data;
}

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
            "단체 모드 방이 삭제되었거나 더 이상 접근할 수 없습니다."
        );
    }
    return data;
}

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

export async function joinGroupRoom(roomId) {
    assertSupabase();
    if (!roomId) throw new Error("방 정보가 없습니다.");
    const { data, error } = await supabase.rpc("join_group_room", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function leaveGroupRoom(roomId) {
    assertSupabase();
    if (!roomId) return null;
    const { data, error } = await supabase.rpc("leave_group_waiting_room", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function submitGroupKeyword(roomId, payload) {
    assertSupabase();
    const { rawKeyword, selectedTitle } = payload;
    if (!roomId) throw new Error("방 정보가 없습니다.");
    if (!selectedTitle) throw new Error("목표 문서를 선택해주세요.");
    if (!payload.selectedPageId) throw new Error("목표 문서의 페이지 ID를 확인할 수 없습니다.");

    const { error } = await supabase.rpc("submit_group_target_v2", {
        p_room_id: roomId,
        p_submitted_keyword: rawKeyword || selectedTitle,
        p_submitted_target_title: selectedTitle,
        p_submitted_target_page_id: String(payload.selectedPageId),
        p_submitted_target_revision_id: payload.selectedRevisionId == null
            ? null
            : String(payload.selectedRevisionId),
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

export async function unreadyGroupPlayer(roomId) {
    return setGroupReady(roomId, false);
}

export async function startGroupRoomGame(roomId) {
    assertSupabase();
    const { data, error } = await supabase.rpc("start_group_room_game_v2", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function applyGroupMoveV2({
    roomId,
    expectedVersion,
    nextPage,
    clickedRawTitle,
    eventType = "NORMAL_LINK",
    requestId = createRequestId(),
    correlationId = createCorrelationId(),
}) {
    assertSupabase();
    const { data, error } = await supabase.rpc("apply_group_move_v2", {
        p_room_id: roomId,
        p_request_id: requestId,
        p_correlation_id: correlationId,
        p_expected_version: expectedVersion,
        p_to_page_id: nextPage?.pageId == null ? null : String(nextPage.pageId),
        p_to_revision_id: nextPage?.revisionId == null ? null : String(nextPage.revisionId),
        p_to_title_snapshot: nextPage?.canonicalTitle || nextPage?.title || null,
        p_clicked_raw_title:
            clickedRawTitle || nextPage?.requestedTitle || nextPage?.title || null,
        p_event_type: eventType,
    });
    if (error) throw error;
    const response = normalizeRpcRow(data);
    if (!response?.ok) {
        const authorityError = new Error(
            response?.code || "단체 이동이 서버에서 거부되었습니다."
        );
        authorityError.code = response?.code || "GROUP_MOVE_REJECTED";
        authorityError.recoverable = response?.code === "STATE_VERSION_CONFLICT";
        authorityError.snapshot = response;
        throw authorityError;
    }
    return response;
}

export async function activateGroupRoomGame(roomId) {
    assertSupabase();
    const { data, error } = await supabase.rpc("activate_group_room_game", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function finalizeGroupRoomIfExpired(roomId) {
    assertSupabase();
    const { data, error } = await supabase.rpc("finalize_group_room_if_expired", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function leaveGroupGame(
    roomId,
    userId,
    { roomStatus, status, reason, retireReason } = {}
) {
    assertSupabase();
    if (!roomId || !userId) return null;

    const effectiveRoomStatus = roomStatus || status || "playing";
    if (effectiveRoomStatus === "waiting") {
        await leaveGroupRoom(roomId);
        return null;
    }
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
