import React, { useCallback } from "react";
import { formatDuration } from "../services/wikiService";

export default function WikiViewer({
  target, currentTitle, currentSummary, currentDocumentHtml, links,
  isLoading, elapsedSeconds, clickCount, startTitle, onLinkClick
}) {
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
          className="article-content"
          onClick={handleDocumentClick}
          dangerouslySetInnerHTML={{ __html: currentDocumentHtml || "<p>내용을 불러오는 중...</p>" }}
        />
      </section>

      <section className="links-card">
        <div className="links-header">
          <h3>빠른 이동 링크</h3>
          <span className="links-count">{links.length} 개 제공됨</span>
        </div>
        {!isLoading && links.length === 0 && (
          <p className="state-text">이 문서에는 이동 가능한 내부 링크가 없습니다.</p>
        )}
        <div className="links-grid">
          {links.map((linkTitle) => (
            <button
              key={linkTitle}
              className="link-chip"
              onClick={() => onLinkClick(linkTitle)}
              disabled={isLoading}
            >
              {linkTitle}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
