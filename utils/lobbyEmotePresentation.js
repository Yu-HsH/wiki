/** Display only: received events do not affect room readiness or game rules. */
export const KION_LOBBY_VISIBLE_MS = 6_000;

export function visibleRoomLobbyReactions(events, roomId, now, players) {
  const joined = new Set((players || []).map((player) => player.user_id));
  return (events || []).filter((event) =>
    event && joined.has(event.userId) &&
    event.roomId === roomId &&
    event.createdAt <= now + 500 &&
    now - event.createdAt >= -500 &&
    now - event.createdAt < KION_LOBBY_VISIBLE_MS
  );
}

export function mergeRoomLobbySnapshots(previous, incoming) {
  const latest = new Map();
  for (const event of [...(previous || []), ...(incoming || [])]) {
    if (!event?.userId || !event?.id) continue;
    const existing = latest.get(event.userId);
    if (!existing || event.createdAt > existing.createdAt ||
      (event.createdAt === existing.createdAt && event.id > existing.id)) {
      latest.set(event.userId, event);
    }
  }
  return [...latest.values()].sort((a, b) =>
    a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
