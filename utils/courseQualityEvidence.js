/**
 * Observational (not authoritative) Wiki Race course quality triage.
 * Counts are from the CACHED LATEST source snapshots, not all Wikipedia pages.
 * No rule in this module is a definitive path/difficulty decision.
 */
const finiteCount = value =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

export function assessDocumentEvidence(document) {
  const outbound = finiteCount(document?.outbound_links);
  const inbound = finiteCount(document?.cached_inbound_sources);
  const inboundEarly = finiteCount(document?.cached_inbound_early50);
  const flags = [];

  if (outbound == null) flags.push("OUTBOUND_NOT_MEASURED");
  else if (outbound <= 2) flags.push("VERY_FEW_OUTGOING_LINKS");
  else if (outbound < 20) flags.push("FEW_OUTGOING_LINKS");

  if (inbound == null) flags.push("INBOUND_NOT_MEASURED");
  else if (inbound === 0) flags.push("NO_INBOUND_IN_CACHED_SAMPLE");
  else if (inbound <= 2) flags.push("FEW_INBOUND_IN_CACHED_SAMPLE");

  if (inbound != null && inbound > 0 && inboundEarly === 0) {
    flags.push("NO_EARLY_INBOUND_IN_CACHED_SAMPLE");
  }
  return {
    flags,
    outboundLinks: outbound,
    cachedInboundSources: inbound,
    // Inbound is a lower bound from the cached sample, not Wikipedia's full graph.
    interpretation: "OBSERVATION_ONLY",
    autoReject: false,
  };
}

/** Triages the need for manual inspection; NEVER re-rolls a game. */
export function assessCourseEvidence(startDocument, goalDocument) {
  const start = assessDocumentEvidence(startDocument);
  const goal = assessDocumentEvidence(goalDocument);
  const startThin = start.outboundLinks !== null && start.outboundLinks < 20;
  const goalSparse = goal.cachedInboundSources !== null && goal.cachedInboundSources <= 2;
  const unknown = start.outboundLinks === null || goal.cachedInboundSources === null;
  const priority = unknown ? "unknown"
    : startThin && goalSparse ? "priority_review"
    : startThin || goalSparse ? "review"
    : "baseline_observed";
  return {
    priority,
    startFlags: start.flags,
    goalFlags: goal.flags,
    // A cache miss or a sparse backlink sample must never force course rejection.
    autoReject: false,
    verifiedReachable: false,
    explanation: "Cached graph observations cannot prove reachability or player difficulty.",
  };
}

export function summarizeEvidence(sample = []) {
  const valid = Array.isArray(sample) ? sample : [];
  return {
    total: valid.length,
    focus: valid.filter(row => row.cohort === "focus").length,
    randomSnapshot: valid.filter(row => row.cohort === "random_snapshot").length,
    sparseStartCandidates: valid.filter(row => {
      const n = finiteCount(row.outbound_links);
      return n !== null && n < 20;
    }).length,
    absentCachedInbound: valid.filter(row => row.cached_inbound_sources === 0).length,
    sparseCachedInbound: valid.filter(row => {
      const n = finiteCount(row.cached_inbound_sources);
      return n !== null && n <= 2;
    }).length,
    // This is NOT the number of truly unreachable pages.
  };
}

/**
 * Interpret an OFFLINE live-API observation (not a runtime request).
 * The API reports direct backlinks only, not necessarily clickable game links.
 * A truncated result is "at least N"; no exact count is invented.
 */
export function assessLiveBacklinkEvidence(live) {
  const count = finiteCount(live?.apiSampleCount);
  if (count === null || typeof live?.apiHasMore !== "boolean") {
    return { status: "unknown", lowerBound: null, exact: false, autoReject: false };
  }
  const exact = !live.apiHasMore;
  const status = !exact ? "at_least_limit"
    : count === 0 ? "no_direct_backlinks_observed"
    : count <= 2 ? "very_few_direct_backlinks"
    : count < 10 ? "few_direct_backlinks"
    : "direct_backlinks_observed";
  return { status, lowerBound: count, exact, autoReject: false };
}
