import {
  createAllowedTitleMap,
  dedupeLinkItems,
  dedupeTitles,
  extractTitleFromWikiHref,
  isSpecialTitle,
  isValidInternalLink,
  normalizeRequestedTitle,
  normalizeTitle,
  selectAllowedLinkTitlesFromHtml,
  selectDeterministicQuickLinks,
} from "./wikiLinkPolicy.js";

export {
  dedupeTitles,
  extractTitleFromWikiHref,
  isSpecialTitle,
  isValidInternalLink,
  normalizeRequestedTitle,
  normalizeTitle,
  selectDeterministicQuickLinks,
} from "./wikiLinkPolicy.js";

const WIKI_API = "https://ko.wikipedia.org/w/api.php";
const SUMMARY_API = "https://ko.wikipedia.org/api/rest_v1/page/summary";

export const SANITIZER_BLOCKED_SELECTORS = [
  "style", "script", "iframe", "object", "embed", "form", "audio", "video", "math",
  "sup.reference", ".reflist", ".mw-editsection", ".toc"
];

export const SANITIZER_ALLOWED_TAGS = new Set([
  "DIV", "SPAN", "SECTION", "P", "H2", "H3", "H4", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "SMALL",
  "BLOCKQUOTE", "CODE", "PRE", "BR", "SUP", "SUB", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "CAPTION",
  "DL", "DT", "DD", "FIGURE", "FIGCAPTION", "IMG"
]);

const MAX_LINK_API_PAGES = 100;
/**
 * AI 기반 랜덤 타겟 문서를 가져옵니다.
 * @param {string} difficulty - 난이도 (easy, medium, hard)
 */
export async function fetchAiSelectedTarget(difficulty = "easy") {
  // supabase 객체가 전역 또는 import 되어 있어야 합니다.
  const { data, error } = await supabase.functions.invoke("target-level", {
    body: { difficulty },
  });

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("AI 타겟을 불러오지 못했습니다.");

  const randomIndex = Math.floor(Math.random() * data.length);
  return data[randomIndex].title;
}

export function formatDuration(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function pickRandomSubset(items, maxCount) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, maxCount);
}

export function trimDescription(text, maxLength = 260) {
  if (!text) return "해당 문서의 요약 정보가 아직 없습니다.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

export function buildWikiQueryUrl(params) {
  const search = new URLSearchParams({ ...params, origin: "*" });
  return `${WIKI_API}?${search.toString()}`;
}

export function getSafeWikiImageSource(source = "") {
  try {
    const url = new URL(source, "https://ko.wikipedia.org");
    if (url.protocol !== "https:" || url.hostname !== "upload.wikimedia.org") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function sanitizeWikiDocument(rawHtml, { currentTitle = "", apiLinks = [] } = {}) {
  if (!rawHtml) {
    return {
      html: "<p>문서 내용을 불러오지 못했습니다.</p>",
      linkTitles: [],
      rawAnchorCount: 0,
    };
  }
  if (typeof DOMParser === "undefined") {
    return {
      html: "<p>문서 미리보기를 표시할 수 없습니다.</p>",
      linkTitles: selectAllowedLinkTitlesFromHtml(rawHtml, apiLinks, currentTitle),
      rawAnchorCount: (rawHtml.match(/<a\b/gi) || []).length,
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const sourceRoot = doc.querySelector(".mw-parser-output") || doc.body;
  const rawAnchorCount = sourceRoot.querySelectorAll("a").length;
  sourceRoot.querySelectorAll(SANITIZER_BLOCKED_SELECTORS.join(",")).forEach((node) => node.remove());
  const allowedTitles = createAllowedTitleMap(apiLinks);
  const discoveredTitles = [];

  const sanitizeNode = (node) => {
    if (node.nodeType === 3) return doc.createTextNode(node.textContent || "");
    if (node.nodeType !== 1) return null;

    const element = node;
    const tagName = element.tagName.toUpperCase();

    if (tagName === "IMG") {
      const source = getSafeWikiImageSource(element.getAttribute("src") || "");
      if (!source) return null;

      const image = doc.createElement("img");
      image.setAttribute("src", source);
      image.setAttribute("alt", element.getAttribute("alt") || "");
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      for (const attribute of ["width", "height"]) {
        const value = element.getAttribute(attribute);
        if (/^\d{1,5}$/.test(value || "")) image.setAttribute(attribute, value);
      }
      return image;
    }

    if (tagName === "A") {
      const unwrapChildren = () => {
        const fragment = doc.createDocumentFragment();
        Array.from(element.childNodes).forEach((child) => {
          const safeChild = sanitizeNode(child);
          if (safeChild) fragment.appendChild(safeChild);
        });
        return fragment;
      };

      if (element.classList.contains("new")) return unwrapChildren();
      const candidate = extractTitleFromWikiHref(element.getAttribute("href") || "", currentTitle);
      const wikiTitle = candidate ? allowedTitles.get(normalizeTitle(candidate)) : null;
      if (!wikiTitle) return unwrapChildren();
      discoveredTitles.push(wikiTitle);

      const anchor = doc.createElement("a");
      anchor.setAttribute("href", "#");
      anchor.setAttribute("data-wiki-title", wikiTitle);
      anchor.className = "wiki-inline-link";

      Array.from(element.childNodes).forEach((child) => {
        const safeChild = sanitizeNode(child);
        if (safeChild) anchor.appendChild(safeChild);
      });

      if (!anchor.textContent?.trim()) {
        anchor.textContent = wikiTitle;
      }

      return anchor;
    }

    if (!SANITIZER_ALLOWED_TAGS.has(tagName)) {
      const fragment = doc.createDocumentFragment();
      Array.from(element.childNodes).forEach((child) => {
        const safeChild = sanitizeNode(child);
        if (safeChild) fragment.appendChild(safeChild);
      });
      return fragment;
    }

    const cleanElement = doc.createElement(tagName.toLowerCase());
    if (tagName === "TD" || tagName === "TH") {
      for (const attribute of ["colspan", "rowspan"]) {
        const value = element.getAttribute(attribute);
        if (/^\d{1,2}$/.test(value || "")) cleanElement.setAttribute(attribute, value);
      }
    }
    Array.from(element.childNodes).forEach((child) => {
      const safeChild = sanitizeNode(child);
      if (safeChild) cleanElement.appendChild(safeChild);
    });

    if (
      (tagName === "P" || tagName === "LI" || tagName === "H2" || tagName === "H3" || tagName === "H4") &&
      !cleanElement.textContent?.trim()
    ) {
      return null;
    }

    return cleanElement;
  };

  const safeRoot = doc.createElement("div");
  Array.from(sourceRoot.childNodes).forEach((child) => {
    const safeChild = sanitizeNode(child);
    if (safeChild) safeRoot.appendChild(safeChild);
  });

  if (!safeRoot.textContent?.trim()) {
    return {
      html: "<p>문서 내용을 불러오지 못했습니다.</p>",
      linkTitles: [],
      rawAnchorCount,
    };
  }

  return {
    html: safeRoot.innerHTML,
    linkTitles: dedupeTitles(discoveredTitles),
    rawAnchorCount,
  };
}

export function sanitizeWikiDocumentHtml(rawHtml, options) {
  return sanitizeWikiDocument(rawHtml, options).html;
}

export async function fetchJson(url, errorMessage, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

export async function fetchRandomTitle() {
  const url = buildWikiQueryUrl({ action: "query", list: "random", rnnamespace: "0", rnlimit: "1", format: "json" });
  const data = await fetchJson(url, "랜덤 시작 문서를 불러오지 못했습니다.");
  const title = data?.query?.random?.[0]?.title;
  if (!title) throw new Error("랜덤 시작 문서를 찾지 못했습니다.");
  return title;
}

export async function fetchDistinctRandomTitle(excludedTitles, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const title = await fetchRandomTitle();
    if (!excludedTitles.has(normalizeTitle(title))) return title;
  }
  throw new Error("중복되지 않는 랜덤 문서를 찾지 못했습니다. 다시 시도해주세요.");
}

export async function fetchRelatedTargetTitle(keyword) {
  const query = keyword.trim();
  if (!query) throw new Error("타겟 키워드를 입력해주세요.");
  const url = buildWikiQueryUrl({ action: "query", list: "search", srsearch: query, srnamespace: "0", srlimit: "1", format: "json" });
  const data = await fetchJson(url, "입력한 키워드의 관련 문서를 찾지 못했습니다.");
  const title = data?.query?.search?.[0]?.title;
  if (!title) throw new Error(`"${query}" 관련 문서를 찾지 못했습니다.`);
  return title;
}

export async function fetchSummary(title, { signal } = {}) {
  const url = `${SUMMARY_API}/${encodeURIComponent(title)}`;
  const data = await fetchJson(url, "문서 요약을 불러오지 못했습니다.", { signal });
  if (!data?.title) throw new Error("위키백과 요약 응답 형식이 올바르지 않습니다.");
  return data;
}

function normalizeSummaryText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * 목표 문서 카드처럼 본문과 링크가 필요하지 않은 화면을 위한 요약 전용 요청입니다.
 * REST 응답의 일반 텍스트 필드만 반환하며 extract_html은 사용하지 않습니다.
 */
export async function fetchPageSummary(
  title,
  { signal, fetchImpl = fetch } = {}
) {
  const requestedTitle = normalizeRequestedTitle(title);
  if (!requestedTitle) throw new Error("불러올 문서 제목이 올바르지 않습니다.");

  const url = `${SUMMARY_API}/${encodeURIComponent(requestedTitle)}`;
  const response = await fetchImpl(url, {
    signal,
    headers: { accept: "application/json" },
  });

  if (response.status === 404) {
    const error = new Error(`"${requestedTitle}" 문서를 찾을 수 없습니다.`);
    error.code = "WIKI_PAGE_NOT_FOUND";
    throw error;
  }
  if (!response.ok) {
    throw new Error("문서 요약을 불러오지 못했습니다.");
  }

  const data = await response.json();
  const canonicalTitle = normalizeRequestedTitle(data?.title) || requestedTitle;

  return {
    requestedTitle,
    canonicalTitle,
    revisionId: data?.revision ?? null,
    description: normalizeSummaryText(data?.description),
    extract: normalizeSummaryText(data?.extract),
    thumbnailUrl: getSafeWikiImageSource(data?.thumbnail?.source || "") || null,
  };
}

export async function fetchAllLinkPages(
  title,
  { signal, fetchJsonImpl = fetchJson, maxPages = MAX_LINK_API_PAGES } = {}
) {
  const collectedLinks = [];
  const pageCounts = [];
  const seenContinuationTokens = new Set();
  let continuation = {};
  let canonicalTitle = title;
  let normalized = [];
  let redirects = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const url = buildWikiQueryUrl({
      action: "query",
      prop: "links",
      titles: title,
      redirects: "1",
      plnamespace: "0",
      pllimit: "max",
      format: "json",
      ...continuation,
    });
    const data = await fetchJsonImpl(url, "내부 링크를 불러오지 못했습니다.", { signal });
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page || "missing" in page) {
      throw new Error("내부 링크 응답에 유효한 문서가 없습니다.");
    }

    const pageLinks = Array.isArray(page.links) ? page.links : [];
    canonicalTitle = page.title || canonicalTitle;
    normalized = data?.query?.normalized || normalized;
    redirects = data?.query?.redirects || redirects;
    collectedLinks.push(...pageLinks);
    pageCounts.push(pageLinks.length);

    const nextContinuation = data?.continue;
    if (!nextContinuation?.plcontinue) {
      return {
        canonicalTitle,
        links: dedupeLinkItems(collectedLinks),
        pageCounts,
        normalized,
        redirects,
      };
    }

    const continuationKey = `${nextContinuation.continue || ""}|${nextContinuation.plcontinue}`;
    if (seenContinuationTokens.has(continuationKey)) {
      throw new Error("내부 링크 페이지네이션 토큰이 반복되었습니다.");
    }
    seenContinuationTokens.add(continuationKey);
    continuation = nextContinuation;
  }

  throw new Error(`내부 링크 페이지가 안전 한도(${maxPages})를 초과했습니다.`);
}

export async function fetchLinks(title, options) {
  return (await fetchAllLinkPages(title, options)).links;
}

export async function fetchDocumentData(title, { signal } = {}) {
  const url = buildWikiQueryUrl({ action: "parse", page: title, prop: "text|revid", redirects: "1", format: "json" });
  const data = await fetchJson(url, "문서 본문을 불러오지 못했습니다.", { signal });
  if (!data?.parse?.title) throw new Error("문서 본문 응답 형식이 올바르지 않습니다.");
  return {
    canonicalTitle: data.parse.title,
    revisionId: data.parse.revid ?? null,
    html: data?.parse?.text?.["*"] || "",
  };
}

export async function fetchDocumentHtml(title, options) {
  return (await fetchDocumentData(title, options)).html;
}

export async function fetchPageData(title, options = {}) {
  const requestOptions = typeof options === "number"
    ? { maxQuickLinks: options }
    : options || {};
  const { signal, maxQuickLinks = 20 } = requestOptions;
  const requestedTitle = normalizeRequestedTitle(title);
  if (!requestedTitle) throw new Error("불러올 문서 제목이 올바르지 않습니다.");

  const [summaryData, linkData, documentData] = await Promise.all([
    fetchSummary(requestedTitle, { signal }),
    fetchAllLinkPages(requestedTitle, { signal }),
    fetchDocumentData(requestedTitle, { signal }),
  ]);

  const canonicalTitle = documentData.canonicalTitle || linkData.canonicalTitle || summaryData.title;
  if (
    linkData.canonicalTitle &&
    normalizeTitle(linkData.canonicalTitle) !== normalizeTitle(canonicalTitle)
  ) {
    throw new Error("본문과 링크 API의 최종 문서 제목이 일치하지 않습니다.");
  }

  const sanitized = sanitizeWikiDocument(documentData.html, {
    currentTitle: canonicalTitle,
    apiLinks: linkData.links,
  });
  const links = sanitized.linkTitles;
  const quickLinks = selectDeterministicQuickLinks(links, {
    canonicalTitle,
    revisionId: documentData.revisionId,
    maxCount: maxQuickLinks,
  });

  return {
    requestedTitle,
    canonicalTitle,
    revisionId: documentData.revisionId,
    title: canonicalTitle,
    summary: summaryData.extract || "해당 문서의 요약이 없습니다.",
    html: sanitized.html,
    documentHtml: sanitized.html,
    links,
    quickLinks,
    linkDiagnostics: {
      rawHtmlAnchorCount: sanitized.rawAnchorCount,
      apiPageCounts: linkData.pageCounts,
      apiLinkCount: linkData.links.length,
      finalAllowedCount: links.length,
      normalized: linkData.normalized,
      redirects: linkData.redirects,
    },
  };
}
export async function resolveWikiTitle(input) {
  const url = `https://ko.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    input
  )}&format=json&origin=*`;

  const res = await fetch(url);
  const data = await res.json();

  const first = data?.query?.search?.[0];

  if (!first) return null;

  return first.title;
}
/**
 * 입력한 제목과 정확히 일치하는 위키백과 문서가 존재하는지 확인
 * - 자동 치환하지 않음
 * - 문서가 실제로 있으면 true, 없으면 false
 */
export async function checkExactWikiTitleExists(title) {
  const trimmed = title?.trim();
  if (!trimmed) return false;

  const url = `https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
    trimmed
  )}&format=json&origin=*`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("위키백과 문서 확인에 실패했습니다.");
  }

  const data = await response.json();
  const pages = data?.query?.pages;

  if (!pages) return false;

  const firstPage = Object.values(pages)[0];
  return !!firstPage && !("missing" in firstPage);
}

// 기존 searchWikiTitleCandidates 함수를 아래 내용으로 덮어쓰거나 교체하세요.
/**
 * 입력값으로 위키백과 검색 후보를 가져옴
 * - 자동 저장용이 아니라 사용자 선택용 리스트 반환
 * - 제목(title)과 짧은 요약(snippet)을 함께 제공
 */
export async function searchWikiTitleCandidates(input, limit = 5) {
  const trimmed = input?.trim();
  if (!trimmed) return [];

  const url = `https://ko.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    trimmed
  )}&format=json&origin=*`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("위키백과 검색 후보를 불러오지 못했습니다.");
  }

  const data = await response.json();

  return (data?.query?.search || [])
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      snippet: item.snippet, // 검색어 강조 HTML <span> 태그 등이 포함된 짧은 설명
    }))
    .filter((item) => item.title);
}

// 주의: 이제 fetchRelatedTargetTitle 함수는 싱글플레이에서 사용하지 않으므로 삭제하거나 무시해도 됩니다.
