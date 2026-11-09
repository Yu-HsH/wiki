import { supabase, isSupabaseConfigured } from "../supabaseClient.js";

/**
 * Server-authoritative, invitation-only rematch. The finished source room
 * stays unchanged; all operations are scoped to its authenticated members.
 */
function requireRematchClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("온라인 서버에 연결할 수 없습니다.");
  }
}

async function invokeRematch(name, sourceRoomId) {
  requireRematchClient();
  if (!sourceRoomId) throw new Error("이전 경기 정보가 없습니다.");
  const { data, error } = await supabase.rpc(name, {
    p_source_room_id: sourceRoomId,
  });
  if (error) throw error;
  return data || null;
}

export function fetchRematchRoom(sourceRoomId) {
  return invokeRematch("get_rematch_room_v1", sourceRoomId);
}

export function createRematchRoom(sourceRoomId) {
  return invokeRematch("create_rematch_room_v1", sourceRoomId);
}

export function joinRematchRoom(sourceRoomId) {
  return invokeRematch("join_rematch_room_v1", sourceRoomId);
}
