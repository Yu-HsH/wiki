/** Read-only adapters. No ranking, elapsed or move counts are derived from a path. */
export function singleCinematicRecord(record) {
  if (record?.resultStatus !== "completed" || !record.startTitle || !record.targetTitle ||
      !Number.isFinite(record.elapsedSeconds) || record.elapsedSeconds < 0 ||
      !Number.isInteger(record.clickCount) || record.clickCount < 0) return null;
  return record;
}

export function groupPodiumGroups(rows = []) {
  return [3, 2, 1].map(rank => ({ rank, rows: rows.filter(row =>
    row.rank === rank && !row.retired && row.status === "완주"
  ) })).filter(group => group.rows.length > 0);
}
