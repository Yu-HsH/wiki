/**
 * Research-only Korean Wikipedia *goal document* review.
 * Do not import from gameplay or DB migrations. No path-length or starting-page criteria.
 */
export function interpretWikipediaIdentity(response, requestedTitle) {
  if (!response || response.error || !Array.isArray(response?.query?.pages) || response.query.pages.length !== 1) {
    return { requestedTitle, state: 'unavailable', canonicalTitle: null, pageId: null, reason: 'INVALID_MEDIAWIKI_RESPONSE' };
  }
  const page = response.query.pages[0];
  const canonicalTitle = typeof page.title === 'string' ? page.title : null;
  if (page.missing === true || page.invalid === true || !Number.isInteger(page.pageid) || page.pageid <= 0) {
    return { requestedTitle, state: 'missing', canonicalTitle, pageId: null, reason: 'NO_GENERAL_ARTICLE' };
  }
  if (page.ns !== 0) {
    return { requestedTitle, state: 'not_general_article', canonicalTitle, pageId: page.pageid, reason: 'NON_MAIN_NAMESPACE' };
  }
  // pageprops.disambiguation may be an empty string; key presence is decisive.
  if (Object.hasOwn(page.pageprops ?? {}, 'disambiguation')) {
    return { requestedTitle, state: 'disambiguation', canonicalTitle, pageId: page.pageid, reason: 'DISAMBIGUATION_TARGET' };
  }
  return { requestedTitle, state: 'eligible_metadata', canonicalTitle, pageId: page.pageid, reason: null };
}

export function summarizeBacklinkSample(response, { requestedLimit = 100 } = {}) {
  if (!response || response.error || !Array.isArray(response?.query?.backlinks)) {
    return { state: 'unavailable', observedSources: null, truncated: null, sources: [] };
  }
  const sources = [...new Set(response.query.backlinks.filter(x => x?.ns === 0 && typeof x.title === 'string').map(x => x.title))];
  return {
    state: 'sampled',
    observedSources: sources.length,
    truncated: Boolean(response.continue) || response.query.backlinks.length >= requestedLimit,
    sources,
  };
}

export function reviewGoalTarget({ candidate, identity = null, backlinks = null }) {
  if (!candidate || typeof candidate.title !== 'string' || !candidate.title.trim()) {
    throw new Error('INVALID_GOAL_CANDIDATE');
  }
  if (!identity || identity.state === 'unavailable') {
    return { title: candidate.title, reviewState: 'identity_unverified', readyForAutomaticPool: false };
  }
  if (['missing', 'disambiguation', 'not_general_article'].includes(identity.state)) {
    return { title: candidate.title, reviewState: 'invalid_target_identity', readyForAutomaticPool: false };
  }
  if (identity.state !== 'eligible_metadata') {
    return { title: candidate.title, reviewState: 'identity_unverified', readyForAutomaticPool: false };
  }
  const sampled = backlinks?.state === 'sampled';
  return {
    title: candidate.title,
    reviewState: sampled ? 'manual_gateway_and_wikiviewer_review' : 'backlinks_unverified',
    readyForAutomaticPool: false,
    // Even a nonempty backlink sample does not establish actual WikiViewer clickability.
  };
}
