import { isRoomEmoteId } from "../../utils/roomEmoteEvents.js";
import { mergeRaceEmoteSnapshots } from "../../utils/raceEmotePresentation.js";

// The S5 private schema is replicated, never exposed via REST. Reactions are
// addressed to individual recipients and are not game-authoritative events.
export function normalizeS5KionEvent(row, expectedRoom, expectedRecipient) {
  if (!row || row.room_id !== expectedRoom || row.recipient_id !== expectedRecipient ||
      !row.id || !row.sender_participant_id || !isRoomEmoteId(row.emote_id)) return null;
  const createdAt = Date.parse(row.sent_at ?? "");
  if (!Number.isFinite(createdAt)) return null;
  return { id: row.id, roomId: row.room_id, userId: row.sender_participant_id, emoteId: row.emote_id, createdAt };
}

export function mergeS5KionEvents(current, incoming, roomId, recipientId) {
  const rows = (Array.isArray(incoming) ? incoming : [incoming])
    .map(row => normalizeS5KionEvent(row, roomId, recipientId)).filter(Boolean);
  return mergeRaceEmoteSnapshots(current, rows);
}
