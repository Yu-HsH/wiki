export const FIXED_PRODUCT_WIKI_POLICY = Object.freeze({
  schemaVersion: "candidate-v1",
  rulesVersion: "ink-s4-product-engine-v1",
  catalogVersion: "ink-s4-first-effects-v1",
  modePolicyVersion: "fixed-forest-three-v1",
  minimumPlayers: 3,
  maximumPlayers: 3,
  warningWindowMs: 2000,
  startPageId: "11",
  goalPageId: "44",
  pages: Object.freeze([
    ["11", "101", "숲", ["22", "33", "44"]],
    ["22", "102", "나무", ["11", "33", "44"]],
    ["33", "103", "생태계", ["11", "22", "44"]],
    ["44", "104", "광합성", ["11", "22"]],
  ].map(([pageId, revisionId, title, edges]) => Object.freeze([pageId, revisionId, title, Object.freeze(edges)]))),
});

const { schemaVersion, rulesVersion, catalogVersion, modePolicyVersion } = FIXED_PRODUCT_WIKI_POLICY;
export const FIXED_PRODUCT_WIKI_BINDING = Object.freeze({
  namespace: "ink-s4-product",
  schemaVersion,
  rulesVersion,
  catalogVersion,
  modePolicyVersion,
  policyDigest: "f58c660b204c03551a5d4b4290c74bb424a58febf83b71b7db3220b2b8cbce18",
});

const titles = new Map(FIXED_PRODUCT_WIKI_POLICY.pages.map(([pageId, , title]) => [pageId, title]));

export const FIXED_PRODUCT_WIKI_SNAPSHOTS = Object.freeze(FIXED_PRODUCT_WIKI_POLICY.pages.map(
  ([pageId, revisionId, canonicalTitle, edges]) => Object.freeze({
    pageId,
    revisionId,
    canonicalTitle,
    snapshotId: "a4f00000-0000-4000-8000-0000000000" + pageId,
    links: Object.freeze(edges.map(targetId => Object.freeze({
      pageId: targetId,
      canonicalTitle: titles.get(targetId),
      aliases: Object.freeze([]),
    }))),
  }),
));

// The server descriptor still authorizes every link. These HTML specimens are local to the fixed-course binding.
export function readFixedProductWikiDocument({ pageId, revisionId, canonicalTitle }, signal) {
  signal?.throwIfAborted();
  const snapshot = FIXED_PRODUCT_WIKI_SNAPSHOTS.find(page => page.pageId === pageId &&
    page.revisionId === revisionId && page.canonicalTitle === canonicalTitle);
  if (!snapshot) throw new Error("STALE_DOCUMENT");
  const links = snapshot.links.map(link =>
    `<a href="/wiki/${encodeURIComponent(link.canonicalTitle)}">${link.canonicalTitle}</a>`).join(" ");
  return {
    pageId,
    revisionId,
    canonicalTitle,
    snapshotId: snapshot.snapshotId,
    documentHtml: `<p>제품 후보 검증용 고정 문서입니다.</p><h2>${canonicalTitle}</h2><p>${links}</p>`,
  };
}
