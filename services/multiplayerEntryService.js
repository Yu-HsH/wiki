import { supabase } from "../supabaseClient.js";
import { readRoomCode } from "../utils/roomCode.js";
import { enterItemRoom, itemRoomPath } from "./itemModeEntryService.js";
import { joinDuelRoomByCode } from "./multiplayerService.js";
import { joinGroupRoom } from "./groupMultiplayerService.js";

async function findLegacyRoom(code, mode) {
  const { data, error } = await supabase.rpc("find_room_by_code_v1", { p_room_code: code, p_mode: mode });
  if (error?.message === "ROOM_NOT_FOUND") return null;
  if (error) throw error;
  return data;
}

export async function joinMultiplayerByCode(value, selectedMode, actorId) {
  const { code, family } = readRoomCode(value);
  if (family !== "legacy") {
    return itemRoomPath(family, await enterItemRoom(family, actorId, "join", code));
  }
  const modes = selectedMode === "group" ? ["group", "duel"] : ["duel", "group"];
  for (const mode of modes) {
    const roomId = await findLegacyRoom(code, mode);
    if (!roomId) continue;
    if (mode === "duel") {
      const player = await joinDuelRoomByCode(code);
      return `/multiplayer/room/${player.room_id}`;
    }
    await joinGroupRoom(roomId);
    return `/multiplayer/group/room/${roomId}`;
  }
  throw new Error("ROOM_NOT_FOUND");
}

export function multiplayerEntryError(error, fallback) {
  const messages = {
    AUTH_REQUIRED: "로그인이 필요합니다.",
    ROOM_CODE_REQUIRED: "방 코드를 입력해 주세요.",
    ROOM_CODE_INVALID: "공유받은 6자리, 12자리 또는 16자리 코드를 확인해 주세요.",
    ROOM_NOT_FOUND: "참가할 수 있는 방을 찾지 못했어요. 코드를 확인해 주세요.",
    DUEL_V4_ROOM_NOT_AVAILABLE: "참가할 수 있는 방을 찾지 못했어요. 코드를 확인해 주세요.",
    PRODUCT_ROOM_UNAVAILABLE: "참가할 수 있는 방을 찾지 못했어요. 코드를 확인해 주세요.",
    ITEM_ENTRY_CLOSED: "지금은 아이템전에 새로 입장할 수 없어요.",
    DUEL_V4_ENTRY_CLOSED: "지금은 아이템전에 새로 입장할 수 없어요.",
    PRODUCT_NEW_MATCHES_DISABLED: "지금은 아이템전에 새로 입장할 수 없어요.",
    S5_MEMBER_REQUIRED: "아이템전은 로그인한 회원이 이용할 수 있어요.",
    PR63_ENTRY_PAUSED: "잠시 새 방 입장이 중지되었어요. 잠시 후 다시 시도해 주세요.",
    PUBLIC_ROOM_EXPIRED: "공개방이 만료되었어요. 목록을 새로고침해 주세요.",
    DUEL_ROOM_FULL: "이미 정원이 찬 방이에요.",
    PRODUCT_ROOM_FULL: "이미 정원이 찬 방이에요.",
  };
  return messages[error?.message] ?? fallback;
}
