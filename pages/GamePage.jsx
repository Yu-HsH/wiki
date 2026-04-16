import React, { useState, useCallback, useRef, useEffect } from "react";
import { formatDuration, fetchRandomTitle, fetchDistinctRandomTitle, fetchRelatedTargetTitle, fetchSummary, fetchPageData, normalizeTitle } from "../services/wikiService";
import GameSetup from "../components/GameSetup";
import CountdownOverlay from "../components/CountdownOverlay";
import SuccessOverlay from "../components/SuccessOverlay";
import WikiViewer from "../components/WikiViewer";
import FloatingHud from "../components/FloatingHud";
import ScrollToTopButton from "../components/ScrollToTopButton";

const PHASE = {
  SELECTING: "SELECTING",
  READY: "READY",
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  SUCCESS: "SUCCESS"
};

export default function GamePage({ onGameComplete, onReturnMain }) {
  const [phase, setPhase] = useState(PHASE.SELECTING);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [target, setTarget] = useState({ title: "", summary: "", requestedKeyword: "", mode: "random" });
  const [startTitle, setStartTitle] = useState("");

  const [currentTitle, setCurrentTitle] = useState("");
  const [currentSummary, setCurrentSummary] = useState("");
  const [currentDocumentHtml, setCurrentDocumentHtml] = useState("");
  const [links, setLinks] = useState([]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clickCount, setClickCount] = useState(0);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (phase === PHASE.PLAYING) {
      startTimeRef.current = Date.now() - elapsedSeconds * 1000;
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, elapsedSeconds]);

  const checkWin = useCallback((pageTitle, targetTitle) => {
    return pageTitle && targetTitle && normalizeTitle(pageTitle) === normalizeTitle(targetTitle);
  }, []);

  const handleSetupComplete = async ({ mode, keyword }) => {
    setIsLoading(true);
    setError("");

    try {
      let start = await fetchRandomTitle();
      let targetTitle = "";

      if (mode === "custom") {
        targetTitle = await fetchRelatedTargetTitle(keyword);
        if (normalizeTitle(start) === normalizeTitle(targetTitle)) {
          start = await fetchDistinctRandomTitle(new Set([normalizeTitle(targetTitle)]));
        }
      } else {
        targetTitle = await fetchDistinctRandomTitle(new Set([normalizeTitle(start)]));
      }

      const [targetSummaryData, startPage] = await Promise.all([
        fetchSummary(targetTitle),
        fetchPageData(start)
      ]);

      setStartTitle(startPage.title);
      setTarget({
        title: targetSummaryData.title,
        summary: targetSummaryData.extract || "요약이 없습니다.",
        requestedKeyword: mode === "custom" ? keyword : "",
        mode
      });

      setCurrentTitle(startPage.title);
      setCurrentSummary(startPage.summary);
      setCurrentDocumentHtml(startPage.documentHtml);
      setLinks(startPage.links);
      setElapsedSeconds(0);
      setClickCount(0);

      if (checkWin(startPage.title, targetSummaryData.title)) {
        // Practically impossible but just in case
        handleWin(startPage.title, targetSummaryData.title, 0, 0);
      } else {
        setPhase(PHASE.COUNTDOWN);
      }
    } catch (e) {
      setError(e.message || "게임을 준비하는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

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

      if (checkWin(page.title, target.title)) {
        handleWin(page.title, target.title, elapsedSeconds, clickCount + 1);
      }
    } catch (e) {
      setError(e.message || "문서를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleWin = (reachedTitle, targetTitle, timeSec, clicks) => {
    setPhase(PHASE.SUCCESS);
    if (onGameComplete) {
      onGameComplete({ startTitle, targetTitle, elapsedSeconds: timeSec, clickCount: clicks, reachedTitle });
    }
  };

  return (
    <div className="wiki-game-page">
      {error && <div className="state-text error">{error}</div>}

      {phase === PHASE.SELECTING && (
        <GameSetup onStart={handleSetupComplete} isLoading={isLoading} />
      )}

      {phase === PHASE.COUNTDOWN && (
        <CountdownOverlay onComplete={() => setPhase(PHASE.PLAYING)} />
      )}

      {(phase === PHASE.PLAYING || phase === PHASE.COUNTDOWN || phase === PHASE.SUCCESS) && (
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
        <SuccessOverlay
          targetTitle={target.title}
          elapsedSeconds={elapsedSeconds}
          clickCount={clickCount}
          onReturnToMain={onReturnMain}
        />

      )}
      {phase === PHASE.PLAYING && (
        <>
          <FloatingHud
            targetTitle={target.title}
            elapsedSeconds={elapsedSeconds}
            clickCount={clickCount}
          />
          <ScrollToTopButton />
        </>
      )}
    </div>
  );
}

