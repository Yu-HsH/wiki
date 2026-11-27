export function readWikiBacklinks(data, targetPageId, excluded) {
  const target = (data?.query?.pages ?? []).find(row => String(row.pageid) === targetPageId && row.ns === 0);
  if (!target || data.error) throw new Error("WIKIPEDIA_BACKLINKS_UNAVAILABLE");
  const entries = new Map();
  const skip = new Set([targetPageId, ...excluded]);
  for (const row of target.linkshere ?? []) {
    const id = String(row.pageid ?? "");
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (row.ns !== 0 || row.redirect || !/^[1-9][0-9]{0,18}$/.test(id) || skip.has(id) ||
        !title || title.length > 240) continue;
    entries.set(id, { page_id: id, title });
    if (entries.size === 3) break;
  }
  return [...entries.values()];
}
