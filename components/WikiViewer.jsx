import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "../services/wikiService";

export default function WikiViewer({
  target,
  currentTitle,
  currentSummary,
  currentDocumentHtml,
  links,
  isLoading,
  elapsedSeconds,
  clickCount,
  startTitle,
  onLinkClick,
  highlightedLinks = [],
  searchAvailable = false,
}) {
  const articleRef = useRef(null);
  const [headings, setHeadings] = useState([]);
  const [showFindToast, setShowFindToast] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [hoveredHeading, setHoveredHeading] = useState(null); // { text, top, right }

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

  return (
    <div className="wiki-shell">
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
          <span className="links-count">{links.length} 개 제공됨</span>
        </div>
        {!isLoading && links.length === 0 && (
          <p className="state-text">이 문서에는 이동 가능한 내부 링크가 없습니다.</p>
        )}
        <div className="links-grid">
          {links.map((linkTitle) => {
            const isHighlighted = highlightedLinks.includes(linkTitle);

            return (
              <button
                key={linkTitle}
                className={`link-chip ${isHighlighted ? "wiki-link--highlighted" : ""}`}
                onClick={() => onLinkClick(linkTitle)}
                disabled={isLoading}
              >
                {linkTitle}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
