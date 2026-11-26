import { supabase } from "../supabaseClient.js";
import { readProductBinding, readProductRoomAction } from "../components/group-items-jungle/productContract.js";
import { duelV4 } from "./duelV4Service.js";

const env = import.meta.env;
const entryChannel = env.MODE === "s4-product-candidate" ? "review" : "production";
const supportsItems = {
  duel: env.VITE_DUEL_ITEMS_V4_ENTRY === "1",
  group: entryChannel === "review" || env.VITE_GROUP_ITEMS_S5_ENTRY === "1",
};

export const itemModeEnabled = mode => supportsItems[mode] === true;
export const itemRoomPath = (mode, roomId) => `/multiplayer/${mode === "duel" ? "duel-v4" : "group-items"}/${roomId}`;

export function makeRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function readIdentity() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || !session.access_token) throw new Error("AUTH_REQUIRED");
  return {
    actorId: session.user.id,
    authenticationEpoch: session.user.last_sign_in_at ?? session.user.id,
    accessToken: session.access_token,
  };
}

export async function itemModeRpc(name, args, accessToken, signal) {
  let query = supabase.rpc(name, args).setHeader("Authorization", "Bearer " + accessToken);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function readItemAdmission(mode, actorId, signal) {
  if (!itemModeEnabled(mode)) return { available: false };
  if (mode === "duel") {
    const entry = await duelV4.entry();
    if (typeof entry?.available !== "boolean") throw new Error("ITEM_ENTRY_UNAVAILABLE");
    return entry;
  }
  const identity = await readIdentity();
  if (identity.actorId !== actorId) throw new Error("AUTH_REQUIRED");
  const entry = await itemModeRpc("get_group_items_entry_v1", { p_channel: entryChannel }, identity.accessToken, signal);
  if (entry?.available === false || entry?.admissionEnabled === false) return { available: false };
  if (entry?.available !== true || entry.admissionEnabled !== true) throw new Error("ITEM_ENTRY_UNAVAILABLE");
  return { ...entry, binding: readProductBinding(entry.binding) };
}

export async function actGroupItemsRoom(binding, actorId, operation, roomId, version, payload = {}) {
  const identity = await readIdentity();
  if (identity.actorId !== actorId) throw new Error("AUTH_REQUIRED");
  const key = "group-items-product-room:" + JSON.stringify([actorId, binding.policyDigest, operation, roomId, version, payload]);
  const requestId = sessionStorage.getItem(key) ?? makeRequestId();
  sessionStorage.setItem(key, requestId);
  try {
    const result = await itemModeRpc("act_group_items_product_room_v1", {
      p_operation: operation, p_room: roomId, p_request: requestId,
      p_expected_version: version, p_binding: binding, p_payload: payload,
    }, identity.accessToken);
    const current = await readIdentity();
    if (current.actorId !== actorId || current.authenticationEpoch !== identity.authenticationEpoch) throw new Error("AUTH_REQUIRED");
    const receipt = readProductRoomAction(result, { actorId, requestId, operation, binding, roomId });
    sessionStorage.removeItem(key);
    return receipt;
  } catch (error) {
    if (error.settled) sessionStorage.removeItem(key);
    throw error;
  }
}

export async function enterItemRoom(mode, actorId, operation, code) {
  const entry = await readItemAdmission(mode, actorId);
  if (!entry.available) throw new Error("ITEM_ENTRY_CLOSED");
  if (mode === "group") {
    const receipt = await actGroupItemsRoom(entry.binding, actorId, operation, null, null,
      operation === "join" ? { roomCode: code } : {});
    return receipt.roomId;
  }
  if (operation === "join") return duelV4.join(code);
  const key = "duel-v4-create:" + actorId;
  const requestId = sessionStorage.getItem(key) ?? makeRequestId();
  sessionStorage.setItem(key, requestId);
  const roomId = await duelV4.create(requestId);
  sessionStorage.removeItem(key);
  return roomId;
}
