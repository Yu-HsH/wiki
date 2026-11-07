/**
 * Offline Wiki Race *last-mile discoverability* evidence.
 * Input: real-but-incomplete latest cached snapshot inbound links.
 * Research only: NEVER used by current course allocation or room validation.
 *
 * Separates measurements from claims: a missing cached link is NOT "unreachable".
 * Anchor ordinal is NOT visual viewport position.
 */

const count = x => Number.isSafeInteger(x) && x >= 0 ? x : null;
const title = x => typeof x === "string" ? x.trim().replace(/_/g, " ") : "";
export function gatewaySourceKind(source) {
  const s = title(source);
  if (!s) return "unknown";
  if (/^(?:\d{3,4}년|\d{1,2}월\s+\d{1,2}일)$/.test(s)) return "calendar";
  if (/\(동음이의(?:어)?\)/.test(s)) return "disambiguation";
  if (/목록/.test(s)) return "index_or_list";
  return "encyclopedia_article";
}

export function assessGoalEntryway(evidence, { verifiedDisambiguation = null } = {}) {
  const all = count(evidence?.cachedIncomingSources);
  const early = count(evidence?.cachedFirst50Links);
  const alias = count(evidence?.aliasLabeledIncoming);
  const sample = Array.isArray(evidence?.incomingSample) ? evidence.incomingSample : [];
  const valid = sample.filter(x => title(x?.sourceTitle)
    && count(x?.ordinal) !== null && count(x?.sourceLinkCount) !== null
    && x.sourceLinkCount > x.ordinal);
  const fullySampled = all !== null && valid.length === all;
  const calendar = valid.filter(x => gatewaySourceKind(x.sourceTitle) === "calendar");
  const list = valid.filter(x => gatewaySourceKind(x.sourceTitle) === "index_or_list");
  const aliases = valid.filter(x => title(x.label).toLocaleLowerCase("ko")
    !== title(evidence?.goal).toLocaleLowerCase("ko"));

  const flags = [];
  if (verifiedDisambiguation === true) flags.push("VERIFIED_DISAMBIGUATION");
  if (all === 0) flags.push("CACHED_INBOUND_NOT_OBSERVED");
  if (fullySampled && all > 0 && calendar.length === all) flags.push("CALENDAR_ONLY_CACHED_GATEWAY");
  if (all > 0 && early === 0) flags.push("NO_CACHED_INBOUND_IN_FIRST_50");
  if (alias !== null && alias > 0) flags.push("GATEWAY_LABEL_ALIAS");
  if (fullySampled && all > 0 && valid.every(x =>
    x.sourceLinkCount > 1 && x.ordinal / (x.sourceLinkCount - 1) >= 0.75)) {
    flags.push("ALL_CACHED_GATEWAYS_LATE_BY_ANCHOR_ORDER");
  }
  if (all !== null && sample.length < all) flags.push("INBOUND_SAMPLE_CAPPED");

  const reviewState = verifiedDisambiguation === true ? "confirm_target_identity"
    : all === null || early === null ? "unknown_evidence"
    : all === 0 ? "need_external_backlinks"
    : flags.includes("CALENDAR_ONLY_CACHED_GATEWAY") ? "review_calendar_bottleneck"
    : flags.includes("ALL_CACHED_GATEWAYS_LATE_BY_ANCHOR_ORDER") ? "review_link_visibility"
    : "no_strong_cached_warning";

  return {
    reviewState,
    flags,
    cachedIncomingSources: all,
    cachedFirst50Links: early,
    verifiedDisambiguation,
    candidateSourceKinds: {
      calendar: calendar.length, indexOrList: list.length,
      encyclopediaArticle: valid.length - calendar.length - list.length,
    },
    sampledEntries: valid.length,
    sampleComplete: fullySampled,
    sampledAliases: aliases.length,
    // Safety-first: do not enforce or claim difficulty based on partial evidence.
    autoReject: false,
    globallyReachable: null,
    difficultyScore: null,
    outputKind: "RESEARCH_ONLY",
  };
}

export function summarizeEntrywayValidation(rows = []) {
  const valid = Array.isArray(rows) ? rows.filter(r => count(r.players) !== null
    && r.players >= 3 && count(r.finished) !== null && r.finished <= r.players) : [];
  const grouped = valid.map(r => ({
    caseId: r.caseId,
    players: r.players,
    finished: r.finished,
    observedNoFinisher: r.finished === 0,
    analysis: assessGoalEntryway(r),
  }));
  return {
    rooms: grouped.length,
    observedNoFinisherRooms: grouped.filter(r => r.observedNoFinisher).length,
    noFinisherWithCachedGap: grouped.filter(r => r.observedNoFinisher
      && r.analysis.reviewState === "need_external_backlinks").length,
    anyFinisherWithCachedGap: grouped.filter(r => r.finished > 0
      && r.analysis.reviewState === "need_external_backlinks").length,
    highFinishWithReviewFlags: grouped.filter(r => r.finished >= Math.ceil(r.players * 0.5)
      && ["review_calendar_bottleneck", "review_link_visibility", "confirm_target_identity"].includes(r.analysis.reviewState)).length,
    cases: grouped,
    // Not a validity score; only 17 handpicked rooms with correlated players.
    interpretation: "OBSERVATIONAL_GROUP_ROOM_COUNTS_NOT_DIFFICULTY_GROUND_TRUTH",
  };
}
