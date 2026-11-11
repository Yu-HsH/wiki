// Shared PR-2 server event contract, independent of the PR-1 image catalogue.
export const ROOM_EMOTE_IDS = Object.freeze([
  "hello", "ready", "go", "good", "wait",
  "hurry", "wow", "lol", "sad", "gg",
]);

const ALLOWED_EMOTES = new Set(ROOM_EMOTE_IDS);

export function isRoomEmoteId(value) {
  return typeof value === "string" && ALLOWED_EMOTES.has(value);
}

export function normalizeRoomEmoteRpcResponse(value) {
  const data = Array.isArray(value) ? value[0] || null : value || null;
  return data && typeof data === "object" ? data : null;
}

export function normalizeRoomEmoteEvent(event) {
  if (!event || event.event_type !== "room_emote") return null;
  const id = event.id;
  const roomId = event.room_id;
  const userId = event.user_id;
  const emoteId = event.payload?.emoteId;
  const createdAt = Date.parse(event.created_at || "");
  if (!id || !roomId || !userId || !isRoomEmoteId(emoteId)) return null;
  if (!Number.isFinite(createdAt)) return null;
  return { id, roomId, userId, emoteId, createdAt };
}

// One current reaction per user. Server timestamp wins; stable id breaks ties.
export function upsertLatestRoomEmote(events = [], rawEvent) {
  const next = normalizeRoomEmoteEvent(rawEvent);
  if (!next) return events;
  const old = events.find((entry) => entry.userId === next.userId);
  if (
    old && (
      old.createdAt > next.createdAt ||
      (old.createdAt === next.createdAt && old.id >= next.id)
    )
  ) return events;
  return [...events.filter((entry) => entry.userId !== next.userId), next]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
