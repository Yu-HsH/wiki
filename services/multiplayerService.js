import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { fatalSessionError } from "../utils/onlineGameSession";
import { createCorrelationId, createRequestId } from "../utils/serverAuthority";

function requireSupabase() {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }
}

function normalizeRpcRow(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

export async function createRoom(userId, options = {}) {
    requireSupabase();
    const { data, error } = await supabase.rpc("create_duel_room_v2", {
        p_use_items: options.useItems ?? true,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function findRoomByCode(roomCode) {
    requireSupabase();
    const { data, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("room_code", roomCode.trim().toUpperCase())
        .single();
    if (error) throw error;
    return data;
}

export async function joinRoom(roomId, userId) {
    const room = await fetchRoom(roomId);
    const { data, error } = await supabase.rpc("join_duel_room_v2", {
        p_room_code: room.room_code,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function fetchRoomPlayers(roomId) {
    requireSupabase();
    const { data, error } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
}

export async function fetchRoom(roomId) {
    requireSupabase();
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

export async function setDuelTargetV2(
    roomId,
    { title, pageId, revisionId, isReady = true }
) {
    requireSupabase();
    const { data, error } = await supabase.rpc("set_duel_target_v2", {
        p_room_id: roomId,
        p_target_title: title,
        p_target_page_id: pageId == null ? null : String(pageId),
        p_target_revision_id: revisionId == null ? null : String(revisionId),
        p_is_ready: isReady,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function leaveRoom(roomId, userId) {
    requireSupabase();
    const { data, error } = await supabase.rpc("leave_duel_room_v2", {
        p_room_id: roomId,
        p_request_id: createRequestId(),
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function startRoomGame(roomId, userId) {
    requireSupabase();
    const { data, error } = await supabase.rpc("start_duel_room_v2", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return data;
}

export async function initializeMyGameProgress(
    roomId,
    userId,
    startTitle,
    identity = {}
) {
    requireSupabase();
    const { data, error } = await supabase.rpc("initialize_duel_player_v2", {
        p_room_id: roomId,
        p_start_title: startTitle || null,
        p_start_page_id: identity.pageId == null ? null : String(identity.pageId),
        p_start_revision_id: identity.revisionId == null ? null : String(identity.revisionId),
    });
    if (error) throw error;
    if (data) return normalizeRpcRow(data);

    const players = await fetchRoomPlayers(roomId);
    const latest = players.find((player) => player.user_id === userId);
    if (latest?.start_title && latest?.current_title) return latest;
    throw fatalSessionError(
        "MISSING_PROGRESS",
        "서버에 시작 문서를 설정하지 못했습니다."
    );
}

export async function applyDuelMoveV2({
    roomId,
    expectedVersion,
    nextPage,
    clickedRawTitle,
    eventType = "NORMAL_LINK",
}) {
    requireSupabase();
    const rpcName = eventType === "SWAP" ? "apply_duel_swap_v2" : "apply_duel_move_v2";
    const rpcArgs = {
        p_room_id: roomId,
        p_request_id: createRequestId(),
        p_correlation_id: createCorrelationId(),
        p_expected_version: expectedVersion,
    };
    if (rpcName === "apply_duel_move_v2") {
        Object.assign(rpcArgs, {
            p_to_page_id: nextPage?.pageId == null ? null : String(nextPage.pageId),
            p_to_revision_id: nextPage?.revisionId == null ? null : String(nextPage.revisionId),
            p_to_title_snapshot: nextPage?.canonicalTitle || nextPage?.title || null,
            p_clicked_raw_title:
                clickedRawTitle || nextPage?.requestedTitle || nextPage?.title || null,
            p_event_type: eventType,
        });
    }
    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) throw error;
    const response = normalizeRpcRow(data);
    if (!response?.ok) {
        const authorityError = new Error(
            response?.code || "1:1 이동이 서버에서 거부되었습니다."
        );
        authorityError.code = response?.code || "DUEL_MOVE_REJECTED";
        authorityError.recoverable = response?.code === "STATE_VERSION_CONFLICT";
        authorityError.snapshot = response;
        throw authorityError;
    }
    return response;
}

export async function heartbeatDuel(roomId) {
    requireSupabase();
    const { data, error } = await supabase.rpc("heartbeat_duel_v2", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}

export async function finalizeDuelIfExpired(roomId) {
    requireSupabase();
    const { data, error } = await supabase.rpc("finalize_duel_if_expired", {
        p_room_id: roomId,
    });
    if (error) throw error;
    return normalizeRpcRow(data);
}
