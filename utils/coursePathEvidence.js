/**
 * Wiki Race route-discoverability research only.
 * Operates on explicitly supplied observed snapshot-link subsets.
 *
 * IMPORTANT:
 * - No full-Wikipedia reachability or semantic "intuitiveness" claim.
 * - Anchor order is NOT viewport/scroll position or a player's attention.
 * - "No path observed" can never mean "impossible".
 * - Never used to reject a player's selected target or reroll a live game.
 */

const isCount = n => Number.isSafeInteger(n) && n >= 0;
const normalize = text => typeof text === "string" ? text.trim().replaceAll("_", " ") : "";

export function anchorOrderEvidence(ordinal, totalLinks) {
  if (!isCount(ordinal) || !isCount(totalLinks) || totalLinks === 0 || ordinal >= totalLinks) {
    return { valid: false, orderRatio: null, ordinalCost: null, band: "unknown" };
  }
  const orderRatio = totalLinks === 1 ? 0 : ordinal / (totalLinks - 1);
  return {
    valid: true,
    orderRatio,
    // Cost is an observational rank surrogate; never interpreted as actual search time.
    ordinalCost: Math.log2(ordinal + 2),
    band: orderRatio >= 0.75 ? "late_anchor_order" : orderRatio >= 0.25 ? "middle_anchor_order" : "early_anchor_order",
  };
}

/** Produce a *partial* graph containing only observed two-hop witnesses. */
export function buildTwoHopWitnessGraph(course) {
  const pages = new Map();
  const routes = Array.isArray(course?.route_sample) ? course.route_sample : [];
  const start = normalize(course?.start);
  const goal = normalize(course?.goal);
  const setPage = (title, count) => {
    const key = normalize(title);
    if (!pages.has(key)) pages.set(key, { title: key, outboundTotal: count, links: [] });
    return pages.get(key);
  };
  const source = setPage(start, routes.length ? routes[0].firstOutbound : null);
  for (const route of routes) {
    const via = normalize(route.via);
    if (!via || via === start || via === goal) continue;
    source.links.push({
      to: via,
      ordinal: route.firstOrdinal,
      label: via,
    });
    const midpoint = setPage(via, route.secondOutbound);
    midpoint.links.push({ to: goal, ordinal: route.secondOrdinal, label: goal });
  }
  return { start, goal, pages: [...pages.values()], graphScope: "two_hop_witness_subset" };
}

/**
 * Bounded BFS over a *partial* observed graph. The label describes WHAT WAS
 * FOUND, never what may or may not exist outside the stored sample.
 */
export function inspectObservedPaths(
  { start, goal, pages = [], graphScope = "provided_partial_graph" },
  { maxHops = 4, maxStates = 2000, maxEdges = 12000, maxPaths = 30 } = {},
) {
  if (!Number.isSafeInteger(maxHops) || maxHops < 1 || maxHops > 6
    || !Number.isSafeInteger(maxStates) || maxStates < 1
    || !Number.isSafeInteger(maxEdges) || maxEdges < 1
    || !Number.isSafeInteger(maxPaths) || maxPaths < 1) throw new Error("INVALID_BOUNDED_GRAPH_LIMITS");

  const index = new Map();
  for (const page of pages) {
    const name = normalize(page?.title);
    if (!name) continue;
    const links = Array.isArray(page.links) ? page.links : [];
    const unique = new Map();
    for (const edge of links) {
      const to = normalize(edge?.to);
      if (!to || !isCount(edge.ordinal)) continue;
      const prior = unique.get(to);
      if (!prior || edge.ordinal < prior.ordinal) unique.set(to, { ...edge, to });
    }
    index.set(name, { links: [...unique.values()].sort((a, b) => a.ordinal - b.ordinal), total: page.outboundTotal });
  }
  const first = normalize(start), last = normalize(goal);
  if (!first || !last || first === last) return {
    status: "invalid_pair", graphScope, foundCount: 0, paths: [],
    distinctFirstHops: 0, exploredStates: 0, inspectedEdges: 0,
    missingPageSnapshots: 0, truncated: false, verifiedReachable: false,
  };

  const queue = [{ titles: [first], edges: [], orderCost: 0 }];
  const results = [];
  const missing = new Set();
  let expanded = 0;
  let seenEdges = 0;
  let truncated = false;
  outer: while (queue.length) {
    if (expanded >= maxStates || results.length >= maxPaths) { truncated = true; break; }
    const path = queue.shift();
    expanded++;
    if (path.edges.length >= maxHops) continue;
    const page = index.get(path.titles.at(-1));
    if (!page) { missing.add(path.titles.at(-1)); continue; }
    for (const link of page.links) {
      if (seenEdges >= maxEdges) { truncated = true; break outer; }
      seenEdges++;
      if (path.titles.includes(link.to)) continue;
      const evidence = anchorOrderEvidence(link.ordinal, page.total);
      const step = {
        from: path.titles.at(-1), to: link.to, ordinal: link.ordinal,
        orderRatio: evidence.orderRatio, band: evidence.band,
      };
      const next = {
        titles: [...path.titles, link.to],
        edges: [...path.edges, step],
        orderCost: path.orderCost + (evidence.ordinalCost ?? 20),
      };
      if (link.to === last) results.push(next);
      else if (next.edges.length < maxHops) queue.push(next);
      if (results.length >= maxPaths) { truncated = true; break outer; }
    }
  }
  const ordered = results.sort((a, b) => a.edges.length - b.edges.length || a.orderCost - b.orderCost);
  const firstHops = new Set(ordered.map(x => x.titles[1]));
  return {
    status: ordered.length ? "paths_observed_in_subset" : "no_path_observed_in_subset",
    graphScope, foundCount: ordered.length,
    shortestObservedHops: ordered.length ? ordered[0].edges.length : null,
    distinctFirstHops: firstHops.size,
    bestAnchorOrderCost: ordered.length ? Math.min(...ordered.map(x => x.orderCost)) : null,
    paths: ordered,
    exploredStates: expanded, inspectedEdges: seenEdges,
    missingPageSnapshots: missing.size, truncated,
    // Even a successful cached witness is not a guaranteed LIVE playable route
    // if the document revision has changed or the anchor is suppressed in the UI.
    verifiedReachable: false,
  };
}

export function summarizeTwoHopWitness(course) {
  const graph = buildTwoHopWitnessGraph(course);
  const observed = inspectObservedPaths(graph, { maxHops: 2, maxPaths: 30 });
  const knownTotal = isCount(course?.cached_two_hop_total) ? course.cached_two_hop_total : null;
  const first = (course?.route_sample || []).map(x => anchorOrderEvidence(x.firstOrdinal, x.firstOutbound));
  return {
    start: graph.start, goal: graph.goal,
    cachedTwoHopMidpoints: knownTotal,
    inspectedWitnesses: observed.foundCount,
    witnessesTruncated: knownTotal !== null && knownTotal > observed.foundCount,
    distinctFirstHops: observed.distinctFirstHops,
    earliestFirstLinkOrdinal: first.length ? Math.min(...course.route_sample.map(x => x.firstOrdinal)) : null,
    firstLinkInFirst50Count: (course?.route_sample || []).filter(x => isCount(x.firstOrdinal) && x.firstOrdinal < 50).length,
    firstAnchorPercentileMin: first.some(x => x.valid) ? Math.min(...first.filter(x => x.valid).map(x => x.orderRatio)) : null,
    // A "0" does not mean unreachable or even no 2-hop path on the full wiki.
    scope: "cached_two_hop_graph_only",
    autoReject: false,
    shortestWorldwide: null,
  };
}

/**
 * Historical completed sessions are positive route witnesses, not a
 * representative difficulty sample or ground-truth labels.
 */
export function summarizeCompletedPathProfiles(rows = []) {
  const valid = Array.isArray(rows) ? rows.filter(x => isCount(x.path_steps)
    && isCount(x.matched_steps) && isCount(x.cached_step_sources)
    && x.matched_steps <= x.cached_step_sources
    && x.cached_step_sources <= x.path_steps) : [];
  const totalSteps = valid.reduce((n, x) => n + x.path_steps, 0);
  const matchedSteps = valid.reduce((n, x) => n + x.matched_steps, 0);
  return {
    sessions: valid.length,
    totalSteps, matchedSteps,
    coverageRatio: totalSteps ? matchedSteps / totalSteps : null,
    fullyObservedSessions: valid.filter(x => x.path_steps === x.matched_steps).length,
    missingEvidenceSessions: valid.filter(x => x.path_steps > x.matched_steps).length,
    sessionsWithRepeatedTitles: valid.filter(x => x.repeated_titles > 0).length,
    sessionsWithLateOrderAnchor: valid.filter(x => x.late_order_steps > 0).length,
    // Long browser elapsed time may include breaks; it is NOT "time struggling".
    longElapsedBuckets: valid.filter(x => x.elapsed_bucket === "15_plus_minutes").length,
    inference: "COMPLETED_PATHS_ONLY_NOT_PERCEIVED_DIFFICULTY",
  };
}
