/** Display-only, bounded per-mount gate. Recovery never calls this gate. */
export function createRaceMotionGate() {
  const seen = new Set();
  return (identity, visible = true, reduced = false) => {
    if (!identity || seen.has(identity) || seen.size >= 256) return false;
    seen.add(identity);
    return visible && !reduced;
  };
}

export function approvedItemAccent(outcome, item) {
  if (!outcome?.ok || !outcome.itemEventId || !["applied", "blocked", "reflected"].includes(outcome.result)) return null;
  return outcome.result === "blocked" && item?.slotRole === "attack" ? "attack"
    : outcome.result === "blocked" || item?.slotRole === "defense" ? "defense"
    : outcome.result === "reflected" || item?.slotRole === "attack" || item?.category === "attack" ? "attack" : "explore";
}

export function incomingItemAccent(incoming, { userId, startedAt, skewMs = 0, wasRewound = false }) {
  if (!incoming?.itemEventId || !Number.isFinite(incoming.serverTimestamp)
    || incoming.serverTimestamp - (skewMs || 0) < startedAt
    || !["applied", "blocked", "reflected"].includes(incoming.result)
    || !userId || !(incoming.targetUserId === userId || incoming.actorUserId === userId || wasRewound)) return null;
  if (incoming.result === "blocked" || incoming.result === "reflected") {
    return incoming.targetUserId === userId ? "defense" : "attack";
  }
  return "attack";
}
