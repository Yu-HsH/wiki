import React, { useCallback, useEffect, useRef, useState } from "react";
import "./wiki.css";

const WIKI_API = "https://ko.wikipedia.org/w/api.php";
const SUMMARY_API = "https://ko.wikipedia.org/api/rest_v1/page/summary";
const MAX_LINKS = 20;
const RANDOM_RETRY_LIMIT = 12;
const COUNTDOWN_STEPS = [3, 2, 1, "시작!"];
const COUNTDOWN_DELAY_MS = 650;
const COUNTDOWN_LAST_DELAY_MS = 520;

const TARGET_MODE = {
  RANDOM: "random",
  CUSTOM: "custom",
};

const BLOCKED_PREFIXES = [
  "분류:",
  "파일:",
  "틀:",
  "위키백과:",
  "도움말:",
  "포털:",
  "특수:",
  "토론:",
  "사용자:",
  "모듈:",
  "미디어위키:",
  "Category:",
  "File:",
  "Template:",
  "Wikipedia:",
  "Help:",
  "Portal:",
  "Special:",
  "Talk:",
  "User:",
  "Module:",
];

const BLOCKED_CONTENT_SELECTORS = [
  "style",
  "script",
  "table",
  "figure",
  "img",
  "audio",
  "video",
  "math",
  "sup.reference",
  ".reflist",
  ".mw-editsection",
  ".infobox",
  ".navbox",
  ".toc",
  ".thumb",
  ".metadata",
  ".hatnote",
];

const ALLOWED_ARTICLE_TAGS = new Set([
  "P",
  "H2",
  "H3",
  "H4",
  "UL",
  "OL",
  "LI",
  "B",
  "STRONG",
  "I",
  "EM",
  "SMALL",
  "BLOCKQUOTE",
  "CODE",
  "PRE",
  "BR",
  "SUP",
  "SUB",
]);

function normalizeTitle(title = "") {
  return decodeURIComponent(title).replace(/_/g, " ").trim().toLowerCase();
}

function formatDuration(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function pickRandomSubset(items, maxCount) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, maxCount);
}

function trimDescription(text, maxLength = 260) {
  if (!text) return "해당 문서의 요약 정보가 아직 없습니다.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function isSpecialTitle(title) {
  const trimmed = title.trim();
  if (BLOCKED_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true;
  return /^[^\s:]{1,40}:/.test(trimmed);
}

function isValidInternalLink(link) {
  if (!link || typeof link.title !== "string") return false;
  const title = link.title.trim();
  if (title.replace(/\s/g, "").length < 2) return false;
  if (typeof link.ns === "number" && link.ns !== 0) return false;
  if (isSpecialTitle(title)) return false;
  return true;
}

function dedupeTitles(titles) {
  const uniqueMap = new Map();
  titles.forEach((title) => {
    const key = normalizeTitle(title);
    if (!uniqueMap.has(key)) uniqueMap.set(key, title);
  });
  return Array.from(uniqueMap.values());
}

function buildWikiQueryUrl(params) {
  const search = new URLSearchParams({ ...params, origin: "*" });
  return `${WIKI_API}?${search.toString()}`;
}

function extractTitleFromWikiHref(href = "") {
  if (!href.startsWith("/wiki/")) return null;

  const raw = href.slice("/wiki/".length).split("#")[0];
  if (!raw) return null;

  const title = decodeURIComponent(raw).replace(/_/g, " ").trim();
  if (!title) return null;
  if (isSpecialTitle(title)) return null;
  if (title.replace(/\s/g, "").length < 2) return null;

  return title;
}

function sanitizeWikiDocumentHtml(rawHtml) {
  if (!rawHtml) return "<p>문서 내용을 불러오지 못했습니다.</p>";
  if (typeof DOMParser === "undefined") return "<p>문서 미리보기를 표시할 수 없습니다.</p>";

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const sourceRoot = doc.querySelector(".mw-parser-output") || doc.body;
  sourceRoot.querySelectorAll(BLOCKED_CONTENT_SELECTORS.join(",")).forEach((node) => node.remove());

  const sanitizeNode = (node) => {
    if (node.nodeType === 3) {
      return doc.createTextNode(node.textContent || "");
    }

    if (node.nodeType !== 1) {
      return null;
    }

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

async function fetchJson(url, errorMessage) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

async function fetchRandomTitle() {
  const url = buildWikiQueryUrl({
    action: "query",
    list: "random",
    rnnamespace: "0",
    rnlimit: "1",
    format: "json",
  });

  const data = await fetchJson(url, "랜덤 시작 문서를 불러오지 못했습니다.");
  const title = data?.query?.random?.[0]?.title;
  if (!title) throw new Error("랜덤 시작 문서를 찾지 못했습니다.");
  return title;
}

async function fetchDistinctRandomTitle(excludedTitles, maxAttempts = RANDOM_RETRY_LIMIT) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const title = await fetchRandomTitle();
    if (!excludedTitles.has(normalizeTitle(title))) return title;
  }
  throw new Error("중복되지 않는 랜덤 문서를 찾지 못했습니다. 다시 시도해주세요.");
}

async function fetchRelatedTargetTitle(keyword) {
  const query = keyword.trim();
  if (!query) {
    throw new Error("타겟 키워드를 입력해주세요.");
  }

  const url = buildWikiQueryUrl({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "0",
    srlimit: "1",
    format: "json",
  });

  const data = await fetchJson(url, "입력한 키워드의 관련 문서를 찾지 못했습니다.");
  const title = data?.query?.search?.[0]?.title;
  if (!title) {
    throw new Error(`"${query}" 관련 문서를 찾지 못했습니다.`);
  }
  return title;
}

async function fetchSummary(title) {
  const url = `${SUMMARY_API}/${encodeURIComponent(title)}`;
  const data = await fetchJson(url, "문서 요약을 불러오지 못했습니다.");
  if (!data?.title) throw new Error("위키백과 요약 응답 형식이 올바르지 않습니다.");
  return data;
}

async function fetchLinks(title) {
  const url = buildWikiQueryUrl({
    action: "query",
    prop: "links",
    titles: title,
    pllimit: "max",
    format: "json",
  });

  const data = await fetchJson(url, "내부 링크를 불러오지 못했습니다.");
  const pages = data?.query?.pages || {};
  const firstPage = Object.values(pages)[0];
  return Array.isArray(firstPage?.links) ? firstPage.links : [];
}

async function fetchDocumentHtml(title) {
  const url = buildWikiQueryUrl({
    action: "parse",
    page: title,
    prop: "text",
    redirects: "1",
    format: "json",
  });

  const data = await fetchJson(url, "문서 본문을 불러오지 못했습니다.");
  return data?.parse?.text?.["*"] || "";
}

async function fetchPageData(title) {
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

function createInitialTargetState(mode = TARGET_MODE.RANDOM) {
  if (mode === TARGET_MODE.CUSTOM) {
    return {
      title: "",
      summary: "원하는 키워드를 입력하면 관련 문서를 타겟으로 설정합니다.",
      mode,
      requestedKeyword: "",
    };
  }

  return {
    title: "",
    summary: "랜덤 타겟 문서를 생성하는 중입니다.",
    mode,
    requestedKeyword: "",
  };
}

export default function WikiGame({ onGameComplete, headerActions = null }) {
  const [targetMode, setTargetMode] = useState(TARGET_MODE.RANDOM);
  const [targetInput, setTargetInput] = useState("");
  const [target, setTarget] = useState(createInitialTargetState(TARGET_MODE.RANDOM));
  const [startTitle, setStartTitle] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentSummary, setCurrentSummary] = useState("");
  const [currentDocumentHtml, setCurrentDocumentHtml] = useState("");
  const [links, setLinks] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isWon, setIsWon] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [countdownValue, setCountdownValue] = useState(null);
  const [error, setError] = useState("");

  const requestTokenRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const victoryReportedRef = useRef(false);
  const modeRef = useRef(targetMode);
  const inputRef = useRef(targetInput);

  useEffect(() => {
    modeRef.current = targetMode;
  }, [targetMode]);

  useEffect(() => {
    inputRef.current = targetInput;
  }, [targetInput]);

  const checkWin = useCallback((pageTitle, targetTitle) => {
    if (!pageTitle || !targetTitle) return false;
    return normalizeTitle(pageTitle) === normalizeTitle(targetTitle);
  }, []);

  const waitMs = useCallback((ms) => new Promise((resolve) => setTimeout(resolve, ms)), []);

  const runStartCountdown = useCallback(
    async (token) => {
      for (let i = 0; i < COUNTDOWN_STEPS.length; i += 1) {
        if (token !== requestTokenRef.current) return false;
        setCountdownValue(COUNTDOWN_STEPS[i]);
        await waitMs(i === COUNTDOWN_STEPS.length - 1 ? COUNTDOWN_LAST_DELAY_MS : COUNTDOWN_DELAY_MS);
      }

      if (token !== requestTokenRef.current) return false;

      setCountdownValue(null);
      setElapsedSeconds(0);
      startTimeRef.current = Date.now();
      setIsRunning(true);
      return true;
    },
    [waitMs]
  );

  const applyPageResult = useCallback(
    (page, targetTitle, options = {}) => {
      const { startRunning = true } = options;
      setCurrentTitle(page.title);
      setCurrentSummary(page.summary);
      setCurrentDocumentHtml(page.documentHtml);
      setLinks(page.links);
      const won = checkWin(page.title, targetTitle);
      setIsWon(won);
      if (won) {
        setIsRunning(false);
        return;
      }
      if (startRunning) {
        setIsRunning(true);
      } else {
        setIsRunning(false);
      }
    },
    [checkWin]
  );

  const loadPage = useCallback(
    async (title, targetTitle, token = ++requestTokenRef.current) => {
      setIsLoading(true);
      setError("");

      try {
        const page = await fetchPageData(title);
        if (token !== requestTokenRef.current) return;
        applyPageResult(page, targetTitle);
      } catch (e) {
        if (token !== requestTokenRef.current) return;
        setError(e instanceof Error ? e.message : "문서를 불러오는 중 오류가 발생했습니다.");
        setIsRunning(false);
      } finally {
        if (token === requestTokenRef.current) {
          setIsLoading(false);
        }
      }
    },
    [applyPageResult]
  );

  const resetBoard = useCallback((mode) => {
    setTarget(createInitialTargetState(mode));
    setStartTitle("");
    setCurrentTitle("");
    setCurrentSummary("");
    setCurrentDocumentHtml("");
    setLinks([]);
    setElapsedSeconds(0);
    setClickCount(0);
    setIsWon(false);
    setError("");
    setIsLoading(true);
    setIsRunning(false);
    setCountdownValue(null);
    startTimeRef.current = Date.now();
    victoryReportedRef.current = false;
  }, []);

  const startNewGame = useCallback(
    async ({ mode, customKeyword } = {}) => {
      const selectedMode = mode || modeRef.current;
      const selectedKeyword = (customKeyword ?? inputRef.current).trim();

      const token = ++requestTokenRef.current;
      resetBoard(selectedMode);

      try {
        let start = await fetchRandomTitle();
        let targetTitle = "";

        if (selectedMode === TARGET_MODE.CUSTOM) {
          targetTitle = await fetchRelatedTargetTitle(selectedKeyword);
          if (normalizeTitle(start) === normalizeTitle(targetTitle)) {
            start = await fetchDistinctRandomTitle(new Set([normalizeTitle(targetTitle)]));
          }
        } else {
          targetTitle = await fetchDistinctRandomTitle(new Set([normalizeTitle(start)]));
        }

        const [targetSummaryData, startPage] = await Promise.all([
          fetchSummary(targetTitle),
          fetchPageData(start),
        ]);

        if (token !== requestTokenRef.current) return;

        setStartTitle(startPage.title);
        setTarget({
          title: targetSummaryData.title,
          summary: trimDescription(targetSummaryData.extract),
          mode: selectedMode,
          requestedKeyword: selectedMode === TARGET_MODE.CUSTOM ? selectedKeyword : "",
        });

        applyPageResult(startPage, targetSummaryData.title, { startRunning: false });

        setIsLoading(false);
        await runStartCountdown(token);
      } catch (e) {
        if (token !== requestTokenRef.current) return;
        setError(e instanceof Error ? e.message : "새 게임 시작에 실패했습니다.");
        setIsRunning(false);
        setCountdownValue(null);
      } finally {
        if (token === requestTokenRef.current) {
          setIsLoading(false);
        }
      }
    },
    [applyPageResult, resetBoard, runStartCountdown]
  );

  useEffect(() => {
    startNewGame({ mode: TARGET_MODE.RANDOM });
  }, [startNewGame]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const intervalId = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isRunning]);

  const handleMove = useCallback(
    (nextTitle) => {
      if (isLoading || isWon || !target.title || countdownValue !== null) return;
      setClickCount((prev) => prev + 1);
      loadPage(nextTitle, target.title);
    },
    [countdownValue, isLoading, isWon, loadPage, target.title]
  );

  useEffect(() => {
    if (!isWon || victoryReportedRef.current || !target.title) return;
    victoryReportedRef.current = true;
    onGameComplete?.({
      startTitle,
      targetTitle: target.title,
      elapsedSeconds,
      clickCount,
      reachedTitle: currentTitle,
    });
  }, [clickCount, currentTitle, elapsedSeconds, isWon, onGameComplete, startTitle, target.title]);

  const handleDocumentClick = useCallback(
    (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element) return;

      const link = element.closest("a[data-wiki-title]");
      if (!link) return;

      event.preventDefault();
      const nextTitle = link.getAttribute("data-wiki-title");
      if (!nextTitle) return;
      handleMove(nextTitle);
    },
    [handleMove]
  );

  const activateRandomMode = () => {
    if (isLoading && targetMode === TARGET_MODE.RANDOM) return;
    setTargetMode(TARGET_MODE.RANDOM);
    startNewGame({ mode: TARGET_MODE.RANDOM });
  };

  const activateCustomMode = () => {
    setTargetMode(TARGET_MODE.CUSTOM);
    setTarget((prev) => ({ ...createInitialTargetState(TARGET_MODE.CUSTOM), title: prev.title && prev.mode === TARGET_MODE.CUSTOM ? prev.title : "" }));
    setError("");
  };

  const handleCustomStart = (event) => {
    event.preventDefault();
    startNewGame({ mode: TARGET_MODE.CUSTOM, customKeyword: targetInput });
  };

  return (
    <div className="wiki-game-page">
      {countdownValue !== null && (
        <div className="countdown-overlay" aria-live="assertive" aria-atomic="true">
          <div className="countdown-number">{countdownValue}</div>
        </div>
      )}
      <main className="wiki-shell">
        <header className="hero-card">
          <div>
            <p className="badge">WIKI GAME</p>
            <h1>위키 문서 탐험 레이스</h1>
            <p className="hero-subtitle">
              문서 내부 링크만 클릭해서 목표 문서까지 도달하세요. 시간이 빠를수록 좋은 기록입니다.
            </p>

            <div className="mode-controls">
              <button
                type="button"
                className={targetMode === TARGET_MODE.RANDOM ? "mode-btn active" : "mode-btn"}
                onClick={activateRandomMode}
                disabled={(isLoading && targetMode === TARGET_MODE.RANDOM) || countdownValue !== null}
              >
                랜덤 타겟 모드
              </button>
              <button
                type="button"
                className={targetMode === TARGET_MODE.CUSTOM ? "mode-btn active" : "mode-btn"}
                onClick={activateCustomMode}
                disabled={countdownValue !== null}
              >
                타겟 직접 입력 모드
              </button>
            </div>

            {targetMode === TARGET_MODE.CUSTOM && (
              <form className="target-form" onSubmit={handleCustomStart}>
                <input
                  className="target-input"
                  value={targetInput}
                  onChange={(event) => setTargetInput(event.target.value)}
                  placeholder="예: 배추, 인공지능, 축구"
                  disabled={countdownValue !== null}
                />
                <button type="submit" className="target-start-btn" disabled={isLoading || countdownValue !== null}>
                  이 키워드로 시작
                </button>
              </form>
            )}
          </div>
          <div className="hero-actions">
            {headerActions}
            <button className="restart-btn" onClick={() => startNewGame()} disabled={isLoading || countdownValue !== null}>
              {isLoading ? "준비 중..." : "새 게임"}
            </button>
          </div>
        </header>

        <section className="mission-card">
          <div className="mission-head">
            <span className="mission-label">목표 문서</span>
            <span className="timer-pill">{formatDuration(elapsedSeconds)}</span>
          </div>
          <h2>{target.title || "목표 문서 생성 중..."}</h2>
          {target.mode === TARGET_MODE.CUSTOM && target.requestedKeyword && (
            <p className="target-meta">
              입력 키워드: <strong>{target.requestedKeyword}</strong>
              {normalizeTitle(target.requestedKeyword) !== normalizeTitle(target.title)
                ? ` -> 관련 문서: ${target.title}`
                : ""}
            </p>
          )}
          <p>{target.summary}</p>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <p className="stat-label">시작 문서</p>
            <p className="stat-value">{startTitle || "..."}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">현재 문서</p>
            <p className="stat-value">{currentTitle || "로딩 중..."}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">클릭 수</p>
            <p className="stat-value">{clickCount}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">진행 상태</p>
            <p className="stat-value">{isWon ? "목표 도달" : "진행 중"}</p>
          </article>
        </section>

        {error && <p className="state-text error">{error}</p>}
        {isLoading && <p className="state-text loading">위키 문서를 불러오는 중입니다...</p>}
        {isWon && (
          <div className="win-banner">
            <strong>목표 도달 성공!</strong>
            <span>
              {target.title}에 {formatDuration(elapsedSeconds)} 만에 도착했습니다. (클릭 {clickCount}회)
            </span>
          </div>
        )}

        <section className="current-page-card">
          <div className="article-head">
            <h3>{currentTitle || "현재 문서"}</h3>
            <span>본문에서 강조된 링크를 클릭하면 다음 문서로 이동합니다.</span>
          </div>
          <div className="article-summary-preview">{currentSummary || "문서 요약이 이곳에 표시됩니다."}</div>
          <article
            className="article-content"
            onClick={handleDocumentClick}
            dangerouslySetInnerHTML={{
              __html: currentDocumentHtml || "<p>문서 본문을 불러오는 중입니다...</p>",
            }}
          />
        </section>

        <section className="links-card">
          <div className="links-header">
            <h3>빠른 이동 링크</h3>
            <span className="links-count">{links.length} / {MAX_LINKS}</span>
          </div>

          {!isLoading && links.length === 0 && (
            <p className="state-text">이 문서에는 이동 가능한 내부 링크가 없습니다. 새 게임을 눌러주세요.</p>
          )}

          <div className="links-grid">
            {links.map((linkTitle) => (
              <button
                key={linkTitle}
                className="link-chip"
                onClick={() => handleMove(linkTitle)}
                disabled={isLoading || isWon}
              >
                {linkTitle}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
