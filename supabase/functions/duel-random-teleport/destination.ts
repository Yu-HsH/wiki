// MediaWiki identity is resolved again on the server; no client destination input.
export async function chooseDestination({ wikiJson, snapshot, player, maxAttempts = 12 }: any) {
  const key = (title: unknown) => String(title ?? "").replaceAll("_", " ").trim().replace(/\s+/g, " ").toLowerCase();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const random = await wikiJson({ action: "query", list: "random", rnnamespace: "0", rnlimit: "1", format: "json" });
      const id = random?.query?.random?.[0]?.id;
      if (!id) continue;
      const canonical = await wikiJson({ action: "query", pageids: String(id), redirects: "1", prop: "info|revisions", rvprop: "ids", format: "json" });
      const page: any = Object.values(canonical?.query?.pages ?? {})[0];
      if (!page || page.ns !== 0 || page.missing !== undefined || page.invalid !== undefined || !page.pageid || !page.title || !page.revisions?.[0]?.revid) continue;
      const pageId = String(page.pageid);
      if ([player.current_page_id, player.target_page_id].includes(pageId)
        || [key(player.current_title), key(player.target_title)].includes(key(page.title))) continue;
      const saved = await snapshot({ pageId, revisionId: String(page.revisions[0].revid), title: page.title });
      if (String(saved?.pageId) !== pageId || String(saved?.revisionId) !== String(page.revisions[0].revid)
        || key(saved?.canonicalTitle) !== key(page.title) || !saved?.snapshotId || !saved?.links?.length) continue;
      return { pageId, revisionId: String(saved.revisionId), namespace: 0 };
    } catch { /* bounded retry; failure never calls the consuming RPC */ }
  }
  return null;
}
