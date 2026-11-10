import { supabase, isSupabaseConfigured } from "../supabaseClient";
import {
  isRoomEmoteId,
  normalizeRoomEmoteRpcResponse,
  normalizeRoomEmoteEvent,
} from "../utils/roomEmoteEvents.js";

function assertSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase가 설정되지 않았습니다.");
  }
}

/** PR-2 only: UI wiring comes in PR-3/4. Identity and payload are server-owned. */
export async function sendRoomEmote(roomId, emoteId) {
  assertSupabase();
  if (!roomId) throw new Error("방 정보가 없습니다.");
  if (!isRoomEmoteId(emoteId)) throw new Error("지원하지 않는 이모티콘입니다.");

  const { data, error } = await supabase.rpc("send_room_emote_v1", {
    p_room_id: roomId,
    p_emote_id: emoteId,
  });
  if (error) throw error;
  const result = normalizeRoomEmoteRpcResponse(data);
  if (!result) throw new Error("이모티콘 서버 응답이 없습니다.");
  return result; // {accepted, code, event_id, event} or {accepted:false, code}
}

/** Existing room_events RLS limits reads to joined members. */
export async function fetchRecentRoomEmotes(roomId, { limit = 30 } = {}) {
  assertSupabase();
  if (!roomId) throw new Error("방 정보가 없습니다.");
  const safeLimit = Number.isFinite(limit)
    ? Math.min(40, Math.max(1, Math.floor(limit)))
    : 30;
  const { data, error } = await supabase
    .from("room_events")
    .select("id, room_id, user_id, event_type, payload, created_at")
    .eq("room_id", roomId)
    .eq("event_type", "room_emote")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data || []).reverse().map(normalizeRoomEmoteEvent).filter(Boolean);
}
