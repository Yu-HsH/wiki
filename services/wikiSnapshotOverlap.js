import { normalizeTitle } from "./wikiLinkPolicy.js";

/**
 * Experimental latency overlap. A snapshot still comes from the authenticated
 * Edge function, which independently parses the exact MediaWiki revision and
 * derives its own graph. Browser HTML/links are NEVER sent as authority.
 *
 * When the article document arrives before the complete paginated link list,
 * we can start the authoritative snapshot request concurrently. The movement
 * RPC remains strictly after BOTH complete successfully.
 */
export function isWikiSnapshotOverlapEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem("wiki-race-snapshot-overlap") === "1";
  } catch {
    return false;
  }
}

function identityOf(page) {
  const canonicalTitle = page?.canonicalTitle || page?.title;
  const pageId = page?.pageId == null ? "" : String(page.pageId);
  const revisionId = page?.revisionId == null ? "" : String(page.revisionId);
  if (!canonicalTitle || !/^\d+$/.test(pageId) || !/^\d+$/.test(revisionId)) return null;
  return { canonicalTitle, pageId, revisionId };
}

function sameIdentity(a, b) {
  return Boolean(a && b &&
    a.pageId === b.pageId &&
    a.revisionId === b.revisionId &&
    normalizeTitle(a.canonicalTitle) === normalizeTitle(b.canonicalTitle));
}

export function createWikiSnapshotOverlap({
  ensureSnapshot,
  enabled = isWikiSnapshotOverlapEnabled(),
  signal,
} = {}) {
  if (typeof ensureSnapshot !== "function") throw new TypeError("ensureSnapshot must be a function");
  let pending = null;
  let expected = null;

  return {
    onDocumentReady(document) {
      const identity = identityOf(document);
      if (!enabled || signal?.aborted || !identity || pending) return;
      expected = identity;
      // Attach a rejection handler immediately so that an early server error
      // does not become unhandled while the remaining client links are loading.
      pending = Promise.resolve().then(() => ensureSnapshot(identity));
      pending.catch(() => {});
    },
    async ensure(page) {
      const actual = identityOf(page);
      if (pending && !signal?.aborted && sameIdentity(expected, actual)) return pending;
      // Any mismatch/abort takes the original trusted snapshot path.
      // No optimistic move is ever authorized by the pending result.
      return ensureSnapshot(page);
    },
  };
}
