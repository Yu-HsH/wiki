import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "../services/wikiService";




export default function WikiViewer({
  target,
  currentTitle,
  currentSummary,
  currentDocumentHtml,
  links,
  quickLinks,
  isLoading,
  elapsedSeconds,
  clickCount,
  startTitle,
  onLinkClick,
  searchAvailable = false,
  onConsumeSearch,
  highlightRequestId = 0,
  status = {},
}) {
  const articleRef = useRef(null);
  const stableQuickLinks = Array.isArray(quickLinks) ? quickLinks : links.slice(0, 20);
  const [headings, setHeadings] = useState([]);
  const [showFindToast, setShowFindToast] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [hoveredHeading, setHoveredHeading] = useState(null); // { text, top, right }
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [articleHighlightedLinks, setArticleHighlightedLinks] = useState([]);
  // 1. 페이지에서 찾기(Ctrl+F/Cmd+F) 및 우클릭 방지 (100% 차단은 불가능함을 주석으로 명시)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 브라우저 기본 검색 기능 차단 시도
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setShowFindToast(true);
        setTimeout(() => setShowFindToast(false), 2000);
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      setShowFindToast(true);
      setTimeout(() => setShowFindToast(false), 2000);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);
  useEffect(() => {
    if (searchAvailable) {
      setSearchPanelOpen(true);
      setSearchQuery("");
      setSearchMessage("검색어를 입력하고 찾기를 누르세요.");
    }
  }, [searchAvailable]);
  // 2. 문서 내 h2, h3 추출하여 네비게이션 바 생성
  useEffect(() => {
    if (!articleRef.current || isLoading) {
      setHeadings([]);
      return;
    }

    // 렌더링된 HTML 내부에서 h2, h3 요소 찾기
    const elements = Array.from(articleRef.current.querySelectorAll("h2, h3"));
    const extracted = elements.map((el, index) => {
      // 고유 ID가 없으면 자동 부여
      if (!el.id) {
        el.id = `wiki-heading-${index}`;
      }
      return {
        id: el.id,
        text: el.textContent || `섹션 ${index}`,
        level: el.tagName.toLowerCase() === "h2" ? 2 : 3,
        element: el
      };
    });

    // 빠른 이동 링크 영역도 네비게이션 마지막에 추가
    extracted.push({
      id: "quick-links-section",
      text: "빠른 이동 링크",
      level: 2,
      element: document.getElementById("quick-links-section")
    });

    setHeadings(extracted);

    // 스크롤 시 현재 읽고 있는 섹션 하이라이트
    const handleScroll = () => {
      let currentActive = "";
      const targets = [...elements];
      const quickLinks = document.getElementById("quick-links-section");
      if (quickLinks) targets.push(quickLinks);

      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        // 화면 상단에서 100px 정도 아래를 기준으로 활성 섹션 판단
        if (rect.top <= 100) {
          currentActive = el.id;
        } else {
          break; // 아래쪽 요소들은 무시
        }
      }
      setActiveId(currentActive);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [currentDocumentHtml, isLoading]);
  {
    status?.translateCurrent && (
      <div className="language-chaos">
        <div className="language-chaos-title">LANGUAGE CONFUSION</div>
        <p>
          Opponent changed your document language temporarily.
          Read carefully and find the next link!
        </p>
      </div>
    )
  }
  useEffect(() => {
    if (!highlightRequestId) return;
    if (!articleRef.current) return;

    const anchors = Array.from(
      articleRef.current.querySelectorAll("a[data-wiki-title]")
    );

    const titles = anchors.map((a) =>
      (a.getAttribute("data-wiki-title") || "").toLowerCase()
    );

    const targetText = target?.title?.toLowerCase() || "";

    const scored = titles.map((title) => {
      let score = 0;

      if (title.includes(targetText)) score += 10;

      const words = targetText.split(" ");
      words.forEach((word) => {
        if (word.length > 1 && title.includes(word)) {
          score += 3;
        }
      });

      score -= title.length * 0.01;

      return { title, score };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((v) => v.title);

    setArticleHighlightedLinks(top);
  }, [highlightRequestId, currentDocumentHtml, target]);

  useEffect(() => {
    if (!articleRef.current) return;

    const set = new Set(articleHighlightedLinks);

    const anchors = Array.from(
      articleRef.current.querySelectorAll("a[data-wiki-title]")
    );

    anchors.forEach((a) => {
      const title = (a.getAttribute("data-wiki-title") || "").toLowerCase();

      if (set.has(title)) {
        a.classList.add("wiki-link--highlighted");
      } else {
        a.classList.remove("wiki-link--highlighted");
      }
    });
  }, [articleHighlightedLinks, currentDocumentHtml]);

  const scrollToHeading = (id) => {
    const el = document.getElementById(id);
    if (el) {
      // 브라우저 기본 부드러운 스크롤 이동
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const handleDocumentClick = useCallback((event) => {

    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;
    const link = element.closest("a[data-wiki-title]");
    if (!link) return;

    event.preventDefault();
    const nextTitle = link.getAttribute("data-wiki-title");
    if (!nextTitle) return;
    onLinkClick(nextTitle);
  }, [onLinkClick]);
  const escapeRegExp = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const clearSearchHighlights = useCallback(() => {
    if (!articleRef.current) return;

    const marks = Array.from(
      articleRef.current.querySelectorAll("mark.game-search-highlight")
    );

    marks.forEach((mark) => {
      const textNode = document.createTextNode(mark.textContent || "");
      mark.replaceWith(textNode);
    });

    articleRef.current.normalize();
  }, []);

  const highlightTextInNode = (root, query) => {
    const escaped = escapeRegExp(query.trim());
    if (!escaped) return 0;

    const regex = new RegExp(escaped, "gi");
    let count = 0;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !regex.test(node.nodeValue)) {
            regex.lastIndex = 0;
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (
            parent &&
            ["SCRIPT", "STYLE", "MARK"].includes(parent.tagName)
          ) {
            regex.lastIndex = 0;
            return NodeFilter.FILTER_REJECT;
          }

          regex.lastIndex = 0;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((textNode) => {
      const text = textNode.nodeValue;
      const fragment = document.createDocumentFragment();

      let lastIndex = 0;
      text.replace(regex, (match, offset) => {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));

        const mark = document.createElement("mark");
        mark.className = "game-search-highlight";
        mark.textContent = match;
        fragment.appendChild(mark);

        lastIndex = offset + match.length;
        count += 1;
        return match;
      });

      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      textNode.replaceWith(fragment);
    });

    return count;
  };

  const handleGameSearch = useCallback(() => {
    if (!articleRef.current) return;

    const query = searchQuery.trim();
    if (!query) {
      setSearchMessage("검색어를 입력해주세요.");
      return;
    }

    clearSearchHighlights();

    const count = highlightTextInNode(articleRef.current, query);

    if (count === 0) {
      setSearchMessage(`"${query}" 검색 결과가 없습니다.`);
      return;
    }

    const firstMatch = articleRef.current.querySelector(".game-search-highlight");
    if (firstMatch) {
      firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    setSearchMessage(`"${query}" ${count}개 발견`);
    onConsumeSearch?.();
  }, [searchQuery, clearSearchHighlights, onConsumeSearch]);

  const handleCloseSearchPanel = useCallback(() => {
    setSearchPanelOpen(false);
    setSearchQuery("");
    setSearchMessage("");
    clearSearchHighlights();
  }, [clearSearchHighlights]);
  useEffect(() => {
    setSearchPanelOpen(false);
    setSearchQuery("");
    setSearchMessage("");
    setArticleHighlightedLinks([]);
  }, [currentDocumentHtml]);
  return (
    <div className="wiki-shell">
      {
        status?.translateCurrent && (
          <div className="language-chaos">
            <div className="language-chaos-title">
              LANGUAGE CONFUSION
            </div>
            <p>
              This document has been temporarily translated by your opponent.
              Find the next link carefully.
            </p>
          </div>
        )
      }
      {/* 단축키 사용 시 토스트 안내 */}
      {showFindToast && (
        <div className="wiki-find-block-toast">
          !!!찾기 금지!!! 우측 네비게이션 바를 이용해 주세요.
        </div>
      )}

      {/* 우측 네비게이션 미니맵 */}
      {headings.length > 0 && (
        <nav className="wiki-nav-rail">
          {headings.map((h) => (
            <div
              key={h.id}
              className={`wiki-nav-item ${activeId === h.id ? 'active' : ''}`}
              onClick={() => scrollToHeading(h.id)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredHeading({
                  text: h.text,
                  top: rect.top + rect.height / 2,
                  right: window.innerWidth - rect.left + 8
                });
              }}
              onMouseLeave={() => setHoveredHeading(null)}
            >
              <div className={`wiki-nav-dot level-${h.level}`} />
            </div>
          ))}
        </nav>
      )}

      {/* 별도 레이어의 Floating 툴팁 (overflow 잘림 방지) */}
      {hoveredHeading && (
        <div
          className="wiki-nav-floating-tooltip"
          style={{
            top: hoveredHeading.top,
            right: hoveredHeading.right
          }}
        >
          {hoveredHeading.text}
        </div>

      )}
      {searchPanelOpen && (
        <div className="game-search-panel">
          <div className="game-search-panel__head">
            <strong>아이템 검색</strong>
            <button type="button" onClick={handleCloseSearchPanel}>
              닫기
            </button>
          </div>

          <div className="game-search-panel__body">
            <input
              type="text"
              value={searchQuery}
              placeholder="현재 문서에서 찾을 단어"
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGameSearch();
              }}
              autoFocus
            />

            <button type="button" onClick={handleGameSearch}>
              찾기
            </button>
          </div>

          {searchMessage && (
            <p className="game-search-panel__message">{searchMessage}</p>
          )}
        </div>
      )}
      <section className="mission-card">
        <div className="mission-head">
          <span className="mission-label">목표 문서</span>
          <span className="timer-pill">{formatDuration(elapsedSeconds)}</span>
        </div>
        <h2>{target.title || "목표 문서"}</h2>
        {target.requestedKeyword && (
          <p className="target-meta">입력 키워드: <strong>{target.requestedKeyword}</strong></p>
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
          <p className="stat-label">이동 횟수</p>
          <p className="stat-value">{clickCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">진행 시간</p>
          <p className="stat-value">{formatDuration(elapsedSeconds)}</p>
        </article>
      </section>

      {isLoading && <p className="state-text loading">위키 문서를 불러오는 중입니다...</p>}

      <section className="current-page-card">
        <div className="article-head">
          <h3>{currentTitle || "현재 문서"}</h3>
          <span>본문에서 강조된 파란색 링크를 클릭하면 다음 문서로 이동합니다.</span>
        </div>
        <div className="article-summary-preview">{currentSummary || "..."}</div>
        <article
          ref={articleRef}
          className="article-content"
          onClick={handleDocumentClick}
          dangerouslySetInnerHTML={{ __html: currentDocumentHtml || "<p>내용을 불러오는 중...</p>" }}
        />
      </section>

      <section className="links-card" id="quick-links-section">
        <div className="links-header">
          <h3>빠른 이동 링크</h3>
          <span className="links-count">{stableQuickLinks.length} 개 제공됨</span>
        </div>
        {!isLoading && links.length === 0 && (
          <p className="state-text">이 문서에는 이동 가능한 내부 링크가 없습니다.</p>
        )}
        <div className="links-grid">
          {stableQuickLinks.map((linkTitle) => {
            const isHighlighted = articleHighlightedLinks.includes(
              linkTitle.trim().toLowerCase()
            );

            return (
              <button
                key={linkTitle}
                className={`link-chip ${isHighlighted ? "wiki-link--highlighted" : ""}`}
                onClick={() => onLinkClick(linkTitle)}
                disabled={isLoading}
              >
                {isHighlighted ? "⭐ " : ""}
                {linkTitle}
              </button>
            );
          })}
        </div>
        {status?.blind && (
          <div className="blind-overlay">
            <div className="blind-text">시야 방해 중...</div>
          </div>
        )}
      </section>
    </div>

  );
}
