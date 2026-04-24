import { supabase, isSupabaseConfigured } from "../supabaseClient";

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
export async function createRoom(userId) {
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
        .single();

    if (error) throw error;
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
export async function updateGameRoomStatus(roomId, updates) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const { data, error } = await supabase
        .from("game_rooms")
        .update(updates)
        .eq("id", roomId)
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        throw new Error("game_rooms 업데이트 결과가 없습니다. RLS policy를 확인하세요.");
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