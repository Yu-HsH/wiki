import { supabase, isSupabaseConfigured } from "../supabaseClient";

function requireOnline() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("온라인 멀티플레이 연결이 설정되지 않았습니다.");
  }
}

/** Public, waiting, non-full rooms only. The server returns a safe projection. */
export async function listPublicRooms(mode) {
  requireOnline();
  if (!["duel", "group"].includes(mode)) throw new Error("올바른 모드를 선택해주세요.");
  const { data, error } = await supabase.rpc("list_public_waiting_rooms_v1", {
    p_mode: mode,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Server checks visibility, waiting state and mode-specific capacity atomically. */
export async function joinPublicRoom(roomId) {
  requireOnline();
  if (!roomId) throw new Error("방 정보가 없습니다.");
  const { data, error } = await supabase.rpc("join_public_room_v1", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data;
}
