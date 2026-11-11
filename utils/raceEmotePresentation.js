export const RACE_EMOTE_VISIBLE_MS = 6000;

/** A short, non-intrusive reaction. Old F5 history must not replay as a new toast. */
export function getVisibleRaceEmotes(events, now, muted = false, roomId = null) {
  if (muted) return [];
  return (events || []).filter(
    (event) => event && (roomId === null || event.roomId === roomId) &&
      event.createdAt <= now + 500 &&
      now - event.createdAt >= -500 &&
      now - event.createdAt < RACE_EMOTE_VISIBLE_MS
  ).sort((a,b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));

}

/** Keep only the newest event from each sender, even after reconnect backfill. */
export function mergeRaceEmoteSnapshots(current, history) {
  return (history || []).reduce((events, event) => {
    if (!event?.id || !event?.userId) return events;
    const older = events.find((row) => row.userId === event.userId);
    if (
      older &&
      (older.createdAt > event.createdAt ||
        (older.createdAt === event.createdAt && older.id >= event.id))
    ) return events;
    return [...events.filter((row) => row.userId !== event.userId), event];
  }, current || []).sort((a, b) =>
    a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  );
}
