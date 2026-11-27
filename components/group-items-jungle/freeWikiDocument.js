import { fetchPageSummary } from "../../services/wikiService.js";
import { ensureWikiSnapshot } from "../../services/wikiSnapshotService.js";

export async function prepareFreeWikiDestination({ pageId, canonicalTitle, title }) {
  const document = await fetchPageSummary(canonicalTitle ?? title);
  if (pageId != null && String(document.pageId) !== String(pageId)) throw new Error("LINK_NOT_VERIFIED");
  const snapshot = await ensureWikiSnapshot(document);
  if (String(document.pageId) !== snapshot.pageId) throw new Error("LINK_NOT_VERIFIED");
  return snapshot.snapshotId;
}
