const BLOCKED_NAMESPACE_PREFIXES = [
  "분류:", "파일:", "틀:", "위키백과:", "도움말:", "포털:", "특수:", "토론:", "사용자:", "모듈:", "미디어위키:",
  "category:", "file:", "template:", "wikipedia:", "help:", "portal:", "special:", "talk:", "user:", "module:", "mediawiki:",
];

function decodeTitle(value, { strict = false } = {}) {
  try {
    return decodeURIComponent(value);
  } catch {
    return strict ? null : value;
  }
}

export function normalizeRequestedTitle(title = "") {
  const value = String(title).trim();
  const decoded = decodeTitle(value) ?? "";
  const withoutFragment = decoded.split("#", 1)[0];
  return withoutFragment.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTitle(title = "") {
  return normalizeRequestedTitle(title).toLocaleLowerCase("ko-KR");
}

export function isSpecialTitle(title = "") {
  const normalized = normalizeTitle(title);
  return BLOCKED_NAMESPACE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isValidInternalLink(link) {
  if (!link || typeof link.title !== "string") return false;
  const title = normalizeRequestedTitle(link.title);
  if (!title) return false;
  if (typeof link.ns === "number" && link.ns !== 0) return false;
  return !isSpecialTitle(title);
}

export function dedupeTitles(titles) {
  const unique = new Map();
  for (const title of titles) {
    if (typeof title !== "string") continue;
    const normalizedTitle = normalizeRequestedTitle(title);
    const key = normalizeTitle(normalizedTitle);
    if (key && !unique.has(key)) unique.set(key, normalizedTitle);
  }
  return [...unique.values()];
}

export function dedupeLinkItems(links) {
  const unique = new Map();
  for (const link of links) {
    if (!isValidInternalLink(link)) continue;
    const key = normalizeTitle(link.title);
    if (!unique.has(key)) {
      unique.set(key, { ...link, title: normalizeRequestedTitle(link.title) });
    }
  }
  return [...unique.values()];
}

export function extractTitleFromWikiHref(href = "", currentTitle = "") {
  if (typeof href !== "string" || !href.startsWith("/wiki/")) return null;
  if (href.includes("?")) return null;

  const rawPath = href.slice("/wiki/".length);
  const rawTitle = rawPath.split("#", 1)[0];
  if (!rawTitle) return null;

  const decoded = decodeTitle(rawTitle, { strict: true });
  if (decoded === null) return null;
  const title = normalizeRequestedTitle(decoded);
  if (!title || isSpecialTitle(title)) return null;
  if (currentTitle && normalizeTitle(title) === normalizeTitle(currentTitle)) return null;
  return title;
}

export function createAllowedTitleMap(apiLinks) {
  const allowed = new Map();
  for (const link of dedupeLinkItems(apiLinks)) {
    allowed.set(normalizeTitle(link.title), link.title);
  }
  return allowed;
}

export function selectAllowedLinkTitles(hrefs, apiLinks, currentTitle = "") {
  const allowed = createAllowedTitleMap(apiLinks);
  const selected = [];

  for (const href of hrefs) {
    const candidate = extractTitleFromWikiHref(href, currentTitle);
    if (!candidate) continue;
    const apiTitle = allowed.get(normalizeTitle(candidate));
    if (apiTitle) selected.push(apiTitle);
  }

  return dedupeTitles(selected);
}

export function extractHrefsFromHtml(rawHtml = "") {
  const hrefs = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match;
  while ((match = pattern.exec(rawHtml)) !== null) {
    hrefs.push((match[1] ?? match[2] ?? match[3] ?? "").replaceAll("&amp;", "&"));
  }
  return hrefs;
}

export function selectAllowedLinkTitlesFromHtml(rawHtml, apiLinks, currentTitle = "") {
  return selectAllowedLinkTitles(extractHrefsFromHtml(rawHtml), apiLinks, currentTitle);
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectDeterministicQuickLinks(
  links,
  { canonicalTitle = "", revisionId = "", maxCount = 20 } = {}
) {
  const shuffled = dedupeTitles(links);
  const random = createSeededRandom(hashSeed(`${normalizeTitle(canonicalTitle)}:${revisionId}`));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(0, Math.max(0, maxCount));
}
