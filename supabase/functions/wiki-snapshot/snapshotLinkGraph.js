// Pure, dependency-free portion of the authoritative snapshot graph builder.
// Imported by the Deno Edge function and exercised in Node regression tests.
// Never cap the number of article anchors or resolved links.
const blockedNamespaces = /^(분류|파일|틀|위키백과|도움말|포털|특수|토론|사용자|모듈|미디어위키|category|file|template|wikipedia|help|portal|special|talk|user|module|mediawiki):/i;

export const snapshotTitle = value =>
  String(value ?? "").trim().replaceAll("_", " ").replace(/\s+/g, " ");
export const snapshotTitleKey = value =>
  snapshotTitle(value).toLocaleLowerCase("ko-KR");

export function extractSnapshotBodyLinks(html = "") {
  const links = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(anchorPattern)) {
    const href = match[1] ?? "";
    if (!href.startsWith("/wiki/") || href.includes("?")) continue;
    let raw = href.slice("/wiki/".length).split("#", 1)[0];
    try { raw = decodeURIComponent(raw); } catch { /* keep raw title */ }
    const title = snapshotTitle(raw);
    if (!title || blockedNamespaces.test(title)) continue;
    const linkText = (match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    links.push({ title, linkText });
  }
  return links;
}

export function buildSnapshotLinkRows(bodyLinks, pageIdentities, pageId) {
  const uniqueLinks = new Map();
  const sourceId = String(pageId);
  for (const bodyLink of bodyLinks) {
    const identity = pageIdentities.get(snapshotTitleKey(bodyLink.title));
    if (!identity) continue;
    const targetPageId = String(identity.pageId);
    if (targetPageId === sourceId || uniqueLinks.has(targetPageId)) continue;
    uniqueLinks.set(targetPageId, {
      targetPageId,
      targetTitle: identity.title,
      linkText: bodyLink.linkText || identity.title,
    });
  }
  return [...uniqueLinks.values()];
}

/**
 * Check that the final graph includes every resolvable distinct page identity
 * in the full rendered body, including those near the middle and last anchors.
 * Redirect aliases and duplicate hrefs can legitimately collapse to one ID.
 * This validation does not trust a browser-supplied link set.
 */
export function auditSnapshotLinkRows(bodyLinks, pageIdentities, pageId, links) {
  const expected = buildSnapshotLinkRows(bodyLinks, pageIdentities, pageId);
  const actual = new Set(links.map(row => String(row.targetPageId)));
  const missing = expected.filter(row => !actual.has(row.targetPageId));
  const picks = [0, Math.floor((expected.length - 1) / 2), expected.length - 1];
  return {
    expectedCount: expected.length,
    actualCount: links.length,
    missingCount: missing.length,
    samplePresent: picks.filter(index => index >= 0).map(index => actual.has(expected[index].targetPageId)),
  };
}
