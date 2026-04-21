const WIKI_API = "https://ko.wikipedia.org/w/api.php";
const SUMMARY_API = "https://ko.wikipedia.org/api/rest_v1/page/summary";

const BLOCKED_PREFIXES = [
  "분류:", "파일:", "틀:", "위키백과:", "도움말:", "포털:", "특수:", "토론:", "사용자:", "모듈:", "미디어위키:",
  "Category:", "File:", "Template:", "Wikipedia:", "Help:", "Portal:", "Special:", "Talk:", "User:", "Module:"
];

const BLOCKED_CONTENT_SELECTORS = [
  "style", "script", "table", "figure", "img", "audio", "video", "math",
  "sup.reference", ".reflist", ".mw-editsection", ".infobox", ".navbox", ".toc", ".thumb", ".metadata", ".hatnote"
];

const ALLOWED_ARTICLE_TAGS = new Set([
  "P", "H2", "H3", "H4", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "SMALL", "BLOCKQUOTE", "CODE", "PRE", "BR", "SUP", "SUB"
]);

export function normalizeTitle(title = "") {
  return decodeURIComponent(title).replace(/_/g, " ").trim().toLowerCase();
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

export function isSpecialTitle(title) {
  const trimmed = title.trim();
  if (BLOCKED_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true;
  return /^[^\s:]{1,40}:/.test(trimmed);
}

export function isValidInternalLink(link) {
  if (!link || typeof link.title !== "string") return false;
  const title = link.title.trim();
  if (title.replace(/\s/g, "").length < 2) return false;
  if (typeof link.ns === "number" && link.ns !== 0) return false;
  if (isSpecialTitle(title)) return false;
  return true;
}

export function dedupeTitles(titles) {
  const uniqueMap = new Map();
  titles.forEach((title) => {
    const key = normalizeTitle(title);
    if (!uniqueMap.has(key)) uniqueMap.set(key, title);
  });
  return Array.from(uniqueMap.values());
}

export function buildWikiQueryUrl(params) {
  const search = new URLSearchParams({ ...params, origin: "*" });
  return `${WIKI_API}?${search.toString()}`;
}

export function extractTitleFromWikiHref(href = "") {
  if (!href.startsWith("/wiki/")) return null;
  const raw = href.slice("/wiki/".length).split("#")[0];
  if (!raw) return null;
  const title = decodeURIComponent(raw).replace(/_/g, " ").trim();
  if (!title) return null;
  if (isSpecialTitle(title)) return null;
  if (title.replace(/\s/g, "").length < 2) return null;
  return title;
}

export function sanitizeWikiDocumentHtml(rawHtml) {
  if (!rawHtml) return "<p>문서 내용을 불러오지 못했습니다.</p>";
  if (typeof DOMParser === "undefined") return "<p>문서 미리보기를 표시할 수 없습니다.</p>";

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const sourceRoot = doc.querySelector(".mw-parser-output") || doc.body;
  sourceRoot.querySelectorAll(BLOCKED_CONTENT_SELECTORS.join(",")).forEach((node) => node.remove());

  const sanitizeNode = (node) => {
    if (node.nodeType === 3) return doc.createTextNode(node.textContent || "");
    if (node.nodeType !== 1) return null;

    const element = node;
    const tagName = element.tagName.toUpperCase();

    if (tagName === "A") {
      const wikiTitle = extractTitleFromWikiHref(element.getAttribute("href") || "");
      if (!wikiTitle) return doc.createTextNode(element.textContent || "");

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

    if (!ALLOWED_ARTICLE_TAGS.has(tagName)) {
      const fragment = doc.createDocumentFragment();
      Array.from(element.childNodes).forEach((child) => {
        const safeChild = sanitizeNode(child);
        if (safeChild) fragment.appendChild(safeChild);
      });
      return fragment;
    }

    const cleanElement = doc.createElement(tagName.toLowerCase());
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
    return "<p>문서 내용을 불러오지 못했습니다.</p>";
  }

  return safeRoot.innerHTML;
}

export async function fetchJson(url, errorMessage) {
  const response = await fetch(url);
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

export async function fetchSummary(title) {
  const url = `${SUMMARY_API}/${encodeURIComponent(title)}`;
  const data = await fetchJson(url, "문서 요약을 불러오지 못했습니다.");
  if (!data?.title) throw new Error("위키백과 요약 응답 형식이 올바르지 않습니다.");
  return data;
}

export async function fetchLinks(title) {
  const url = buildWikiQueryUrl({ action: "query", prop: "links", titles: title, pllimit: "max", format: "json" });
  const data = await fetchJson(url, "내부 링크를 불러오지 못했습니다.");
  const pages = data?.query?.pages || {};
  const firstPage = Object.values(pages)[0];
  return Array.isArray(firstPage?.links) ? firstPage.links : [];
}

export async function fetchDocumentHtml(title) {
  const url = buildWikiQueryUrl({ action: "parse", page: title, prop: "text", redirects: "1", format: "json" });
  const data = await fetchJson(url, "문서 본문을 불러오지 못했습니다.");
  return data?.parse?.text?.["*"] || "";
}

export async function fetchPageData(title, MAX_LINKS = 20) {
  const [summary, rawLinks, rawDocumentHtml] = await Promise.all([
    fetchSummary(title),
    fetchLinks(title),
    fetchDocumentHtml(title),
  ]);

  const linkTitles = dedupeTitles(rawLinks.filter(isValidInternalLink).map((link) => link.title));

  return {
    title: summary.title,
    summary: summary.extract || "해당 문서의 요약이 없습니다.",
    links: pickRandomSubset(linkTitles, MAX_LINKS),
    documentHtml: sanitizeWikiDocumentHtml(rawDocumentHtml),
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