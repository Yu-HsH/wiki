import { supabase, isSupabaseConfigured } from "../supabaseClient";

/**
 * 방 코드 생성
 * - 너무 길지 않고 사람이 입력하기 쉬운 형태
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
 * 현재 로그인한 사용자의 프로필 조회
 * - room_players에 닉네임 snapshot을 저장할 때 사용
 */
export async function fetchMyProfile(userId) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("id, nickname")
        .eq("id", userId)
        .single();

    if (error) throw error;
    return data;
}

/**
 * 방 생성
 * 1. game_rooms 생성
 * 2. room_players에 host 추가
 */
export async function createRoom(userId) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const profile = await fetchMyProfile(userId);

    let roomCode = generateRoomCode();

    // 중복 room_code 방지용 간단 재시도
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

    const { error: playerError } = await supabase
        .from("room_players")
        .insert({
            room_id: room.id,
            user_id: userId,
            role: "host",
            nickname_snapshot: profile.nickname,
            profile_image_snapshot: null,//profile.profile_image_url,
            is_ready: false,
            move_count: 0,
            has_finished: false,
        });

    if (playerError) throw playerError;

    return room;
}

/**
 * 방 코드로 방 찾기
 */
export async function findRoomByCode(roomCode) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

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
 * 방 입장
 * - 이미 참가 중이면 기존 row 재사용
 * - 아니면 guest row 추가
 */
export async function joinRoom(roomId, userId) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const profile = await fetchMyProfile(userId);

    // 이미 참가 중인지 확인
    const { data: existingPlayer, error: existingError } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) throw existingError;
    if (existingPlayer) return existingPlayer;

    // guest 슬롯이 이미 차 있는지 확인
    const { data: players, error: playersError } = await supabase
        .from("room_players")
        .select("id, role")
        .eq("room_id", roomId);

    if (playersError) throw playersError;

    if ((players ?? []).length >= 2) {
        throw new Error("이미 가득 찬 방입니다.");
    }

    const { data, error } = await supabase
        .from("room_players")
        .insert({
            room_id: roomId,
            user_id: userId,
            role: "guest",
            nickname_snapshot: profile.nickname,
            profile_image_snapshot: profile.profile_image_url,
            is_ready: false,
            move_count: 0,
            has_finished: false,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 방 참가자 조회
 */
export async function fetchRoomPlayers(roomId) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

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
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    const { data, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

    if (error) throw error;
    return data;
}
/**
 * 
 * 현재 로그인 플레이어의 room_playes rows를 업데이트
 */
export async function updateMyRoomPlayer(roomId, userId, updates) {
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

export async function leaveRoom(roomId, userId) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    // 1. 내 room_players row 삭제
    const { error: deletePlayerError } = await supabase
        .from("room_players")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId);

    if (deletePlayerError) throw deletePlayerError;

    // 2. 남은 플레이어 수 확인
    const { data: remainingPlayers, error: remainingError } = await supabase
        .from("room_players")
        .select("id")
        .eq("room_id", roomId);

    if (remainingError) throw remainingError;

    // 3. 아무도 안 남았으면 room도 삭제
    if (!remainingPlayers || remainingPlayers.length === 0) {
        const { error: deleteRoomError } = await supabase
            .from("game_rooms")
            .delete()
            .eq("id", roomId);

        if (deleteRoomError) throw deleteRoomError;
    }
}