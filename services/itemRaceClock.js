const recentSampleMs = 30_000;
const fastRoundTripMs = 200;

// At receipt the server's current time is between its observation and that
// observation plus the round trip. A slow first read cannot place it at the
// midpoint reliably, so start from the observation until a fast read arrives.
export function createItemRaceClock() {
  let anchor = null;
  let best = null;
  function now(local = performance.now()) {
    return anchor === null ? null : anchor.server + Math.max(0, local - anchor.local);
  }
  function observe(server, elapsed, local = performance.now()) {
    if (!Number.isFinite(server) || !Number.isFinite(elapsed) || elapsed < 0) return now(local);
    const recent = best && local - best.local < recentSampleMs;
    const latest = server + elapsed;
    // Ignore an observation older than the recent sample permits. The 1ms
    // tolerance accounts for parsing PostgreSQL timestamps as JavaScript dates.
    if (recent && latest + 1 < best.server + local - best.local) return now(local);
    if (!recent || elapsed <= best.elapsed) {
      best = { server, elapsed, local };
    }
    const offset = best.elapsed <= fastRoundTripMs ? best.elapsed / 2 : 0;
    const predicted = best.server + offset + local - best.local;
    const estimate = Math.min(latest, Math.max(server, predicted));
    anchor = { server: estimate, local };
    return estimate;
  }
  return { now, observe };
}
