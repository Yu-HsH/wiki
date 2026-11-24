import { normalizeTitle } from "../../services/wikiLinkPolicy.js";
import { productId, wikiId } from "./productContract.js";

const title = value => typeof value === "string" && value.trim().length > 0;
const fail = () => { throw new Error("STALE_DOCUMENT"); };

export async function loadProductWikiDocument(frame, descriptor, loadPinnedHtml, signal) {
  if (!wikiId(frame?.pageId) || !wikiId(frame.revisionId) || !productId(frame.snapshotId) ||
      !/^(0|[1-9][0-9]{0,18})$/.test(frame.progressVersion ?? "") ||
      !["pageId", "revisionId", "snapshotId", "progressVersion"].every(key => descriptor?.[key] === frame[key]) ||
      !productId(descriptor.wikiSnapshotId) || !title(descriptor.canonicalTitle) || !Array.isArray(descriptor.links)) fail();

  const byId = new Map(), byTitle = new Map();
  const claimTitle = (name, id) => {
    const key = normalizeTitle(name);
    if (!key || (byTitle.has(key) && byTitle.get(key) !== id)) fail();
    byTitle.set(key, id);
  };
  claimTitle(descriptor.canonicalTitle, frame.pageId);
  for (const link of descriptor.links) {
    if (!wikiId(link?.pageId) || link.pageId === frame.pageId || !title(link.canonicalTitle) ||
        !Array.isArray(link.aliases) || !link.aliases.every(title)) fail();
    const previous = byId.get(link.pageId);
    if (previous && previous.canonicalTitle !== link.canonicalTitle) fail();
    claimTitle(link.canonicalTitle, link.pageId);
    const edge = previous ?? { pageId: link.pageId, canonicalTitle: link.canonicalTitle, aliases: new Set() };
    for (const alias of link.aliases) {
      claimTitle(alias, link.pageId);
      edge.aliases.add(alias);
    }
    byId.set(edge.pageId, edge);
  }
  signal?.throwIfAborted();
  const pinned = await loadPinnedHtml({ pageId: frame.pageId, revisionId: frame.revisionId, canonicalTitle: descriptor.canonicalTitle }, signal);
  signal?.throwIfAborted();
  if (pinned?.pageId !== frame.pageId || pinned.revisionId !== frame.revisionId || pinned.snapshotId !== descriptor.wikiSnapshotId ||
      pinned.canonicalTitle !== descriptor.canonicalTitle || typeof pinned.documentHtml !== "string" || !pinned.documentHtml.trim()) fail();
  return {
    ...frame, title: descriptor.canonicalTitle, html: pinned.documentHtml,
    links: [...byId.values()].map(({ pageId, canonicalTitle }) => ({ pageId, title: canonicalTitle, canonicalTitle })),
    approvedAliases: [...byId.values()].flatMap(({ aliases, canonicalTitle }) => [...aliases].map(title => ({ title, canonicalTitle }))),
  };
}
