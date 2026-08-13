export function buildGroupMatchHistoryRows(results = [], roomId) {
  if (!roomId) return [];

  return results
    .filter(
      (result) =>
        result?.result_status === "finished" &&
        result?.user_id &&
        !String(result.user_id).startsWith("guest-") &&
        Number.isInteger(result.rank)
    )
    .sort((a, b) => a.rank - b.rank)
    .map((result) => ({
      room_id: result.room_id || roomId,
      user_id: result.user_id,
      rank: result.rank,
      elapsed_seconds: result.elapsed_seconds,
      move_count: result.move_count,
    }));
}
