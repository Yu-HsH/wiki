import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../authContext";
import {
  fetchRandomTitle,
  fetchRelatedTargetTitle,
  fetchSummary,
  fetchPageData,
  normalizeTitle,
} from "../services/wikiService";
import WikiViewer from "../components/WikiViewer";
import ScrollToTopButton from "../components/ScrollToTopButton";
import CountdownOverlay from "../components/CountdownOverlay";

/**
 * 멀티플레이어 게임 페이지
 * - 왼쪽: 내 위키 브라우징 영역
 * - 오른쪽: 상대 상태 패널 (닉네임, 현재 문서, 이동 횟수, 완료 상태)
 * - 상단 HUD: 목표, 시작 문서, 타이머, 이동 횟수
 */

const PHASE = {
  LOADING: "LOADING",
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  SUCCESS: "SUCCESS",
  OPPONENT_WIN: "OPPONENT_WIN",
};

export default function MultiplayerGamePage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { role, myTarget: targetKeyword, opponentName } = location.state || {};

  const [phase, setPhase] = useState(PHASE.LOADING);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // 내 게임 상태
  const [target, setTarget] = useState({ title: "", summary: "" });
  const [startTitle, setStartTitle] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentSummary, setCurrentSummary] = useState("");
  const [currentDocumentHtml, setCurrentDocumentHtml] = useState("");
  const [links, setLinks] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clickCount, setClickCount] = useState(0);

  // 상대 mock 상태
  const [opponentStatus, setOpponentStatus] = useState({
    nickname: opponentName || "상대 플레이어",
    currentArticle: "로딩 중...",
    moveCount: 0,
    finished: false,
    finishTime: null,
    targetReached: false,
  });

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const opponentTimerRef = useRef(null);

  // --- 타이머 ---
  useEffect(() => {
    if (phase === PHASE.PLAYING) {
      startTimeRef.current = Date.now() - elapsedSeconds * 1000;
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // --- Mock 상대 상태 업데이트 ---
  useEffect(() => {
    if (phase !== PHASE.PLAYING) return;
    const mockArticles = [
      "대한민국", "서울특별시", "한국어", "유네스코",
      "문화유산", "역사", "동아시아", "태평양",
    ];
    let idx = 0;
    opponentTimerRef.current = setInterval(() => {
      idx++;
      if (idx <= mockArticles.length) {
        setOpponentStatus((prev) => {
          const isFinished = idx === mockArticles.length;
          return {
            ...prev,
            currentArticle: isFinished ? prev.currentArticle : mockArticles[idx % mockArticles.length],
            moveCount: idx,
            finished: isFinished,
            targetReached: isFinished,
          };
        });
      } else {
        if (opponentTimerRef.current) clearInterval(opponentTimerRef.current);
      }
    }, 4500 + Math.random() * 3000);
    return () => {
      if (opponentTimerRef.current) clearInterval(opponentTimerRef.current);
    };
  }, [phase]);

  const checkWin = useCallback((pageTitle, tgtTitle) => {
    return (
      pageTitle &&
      tgtTitle &&
      normalizeTitle(pageTitle) === normalizeTitle(tgtTitle)
    );
  }, []);

  // --- 게임 초기화 ---
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsLoading(true);
      setError("");
      try {
        const start = await fetchRandomTitle();
        let targetTitle = "";
        if (targetKeyword) {
          targetTitle = await fetchRelatedTargetTitle(targetKeyword);
        } else {
          targetTitle = await fetchRandomTitle();
        }

        const [targetSummaryData, startPage] = await Promise.all([
          fetchSummary(targetTitle),
          fetchPageData(start),
        ]);

        if (cancelled) return;

        setStartTitle(startPage.title);
        setTarget({
          title: targetSummaryData.title,
          summary: targetSummaryData.extract || "요약이 없습니다.",
        });
        setCurrentTitle(startPage.title);
        setCurrentSummary(startPage.summary);
        setCurrentDocumentHtml(startPage.documentHtml);
        setLinks(startPage.links);
        setElapsedSeconds(0);
        setClickCount(0);

        setOpponentStatus((prev) => ({
          ...prev,
          currentArticle: "게임 시작 대기 중...",
        }));

        setPhase(PHASE.COUNTDOWN);
      } catch (e) {
        if (!cancelled) setError(e.message || "게임을 준비하는 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [targetKeyword]);

  // --- 위키 링크 클릭 ---
  const handleMove = async (nextTitle) => {
    if (phase !== PHASE.PLAYING || isLoading) return;
    setClickCount((prev) => prev + 1);
    setIsLoading(true);
    setError("");
    try {
      const page = await fetchPageData(nextTitle);
      setCurrentTitle(page.title);
      setCurrentSummary(page.summary);
      setCurrentDocumentHtml(page.documentHtml);
      setLinks(page.links);
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (checkWin(page.title, target.title)) {
        setPhase(PHASE.SUCCESS);
      }
    } catch (e) {
      setError(e.message || "문서를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (s) => {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="mp-game-page">
      {/* 상단 HUD */}
      <div className="mp-game-hud">
        <div className="mp-hud-group">
          <div className="mp-hud-item">
            <span className="mp-hud-label">🎯 목표</span>
            <span className="mp-hud-value mp-hud-value--target">
              {target.title || "..."}
            </span>
          </div>
          <div className="mp-hud-item">
            <span className="mp-hud-label">📄 시작</span>
            <span className="mp-hud-value">{startTitle || "..."}</span>
          </div>
        </div>
        <div className="mp-hud-group mp-hud-group--stats">
          <div className="mp-hud-item">
            <span className="mp-hud-label">⏱️ 시간</span>
            <span className="mp-hud-value mp-hud-value--time">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
          <div className="mp-hud-item">
            <span className="mp-hud-label">🖱️ 이동</span>
            <span className="mp-hud-value">{clickCount}</span>
          </div>
          <button
            type="button"
            className="mp-hud-exit"
            onClick={() => navigate("/multiplayer")}
          >
            나가기
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="mp-game-body">
        {/* 왼쪽: 위키 뷰어 */}
        <div className="mp-game-main">
          {error && <div className="state-text error">{error}</div>}

          {phase === PHASE.LOADING && (
            <div className="mp-game-loading">
              <div className="mp-loading-spinner" />
              <p>위키 문서를 준비하는 중...</p>
            </div>
          )}

          {phase === PHASE.COUNTDOWN && (
            <CountdownOverlay onComplete={() => setPhase(PHASE.PLAYING)} />
          )}

          {(phase === PHASE.PLAYING ||
            phase === PHASE.SUCCESS ||
            phase === PHASE.COUNTDOWN) && (
            <WikiViewer
              target={target}
              currentTitle={currentTitle}
              currentSummary={currentSummary}
              currentDocumentHtml={currentDocumentHtml}
              links={links}
              isLoading={isLoading}
              elapsedSeconds={elapsedSeconds}
              clickCount={clickCount}
              startTitle={startTitle}
              onLinkClick={handleMove}
            />
          )}

          {phase === PHASE.SUCCESS && (
            <div className="mp-win-overlay">
              <div className="mp-win-card">
                <div className="mp-win-icon">🏆</div>
                <h2 className="mp-win-title">목표 도달!</h2>
                <p className="mp-win-detail">
                  {formatTime(elapsedSeconds)} · {clickCount}회 이동
                </p>
                <div className="mp-win-actions">
                  <button
                    type="button"
                    className="mp-action-btn mp-action-btn--primary"
                    onClick={() => navigate("/multiplayer")}
                  >
                    로비로 돌아가기
                  </button>
                  <button
                    type="button"
                    className="mp-action-btn mp-action-btn--secondary-dark"
                    onClick={() => navigate("/main")}
                  >
                    메인으로
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === PHASE.PLAYING && <ScrollToTopButton />}
        </div>

        {/* 오른쪽: 상대 상태 패널 */}
        <aside className="mp-opponent-panel">
          <div className="mp-opp-header">
            <span className="mp-opp-badge">OPPONENT</span>
          </div>

          <div className="mp-opp-avatar">
            {opponentStatus.nickname?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="mp-opp-name">{opponentStatus.nickname}</div>

          <div className="mp-opp-stats">
            <div className="mp-opp-stat">
              <span className="mp-opp-stat-label">현재 문서</span>
              <span className="mp-opp-stat-value mp-opp-stat-value--article">
                {opponentStatus.currentArticle}
              </span>
            </div>
            <div className="mp-opp-stat">
              <span className="mp-opp-stat-label">이동 횟수</span>
              <span className="mp-opp-stat-value">
                {opponentStatus.moveCount}
              </span>
            </div>
            <div className="mp-opp-stat">
              <span className="mp-opp-stat-label">상태</span>
              <span
                className={`mp-opp-stat-value ${
                  opponentStatus.finished
                    ? "mp-opp-stat-value--done"
                    : "mp-opp-stat-value--racing"
                }`}
              >
                {opponentStatus.finished ? "🏁 완료!" : "🏃 레이싱 중..."}
              </span>
            </div>
          </div>

          {/* 실시간 활동 표시기 */}
          {!opponentStatus.finished && phase === PHASE.PLAYING && (
            <div className="mp-opp-activity">
              <span className="mp-opp-dot" />
              <span className="mp-opp-dot mp-opp-dot--delay1" />
              <span className="mp-opp-dot mp-opp-dot--delay2" />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
