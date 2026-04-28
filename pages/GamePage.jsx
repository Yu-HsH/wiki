import React, { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  fetchRandomTitle,
  fetchDistinctRandomTitle,
  fetchSummary,
  fetchPageData,
  normalizeTitle,
} from "../services/wikiService";

import GameSetup from "../components/GameSetup";
import CountdownOverlay from "../components/CountdownOverlay";
import SuccessOverlay from "../components/SuccessOverlay";
import WikiViewer from "../components/WikiViewer";
import FloatingHud from "../components/FloatingHud";
import ScrollToTopButton from "../components/ScrollToTopButton";
import { supabase } from "../supabaseClient";

import ItemBar from "../components/ItemBar";
import EffectOverlay from "../components/EffectOverlay";
import useItemSystem from "../hooks/useItemSystem";

const pickDifficulty = () => {
  const r = Math.random();
  if (r < 0.5) return "easy";
  if (r < 0.9) return "medium";
  return "hard";
};

const fetchAiTargetTitle = async () => {
  const difficulty = pickDifficulty();
  const { data, error } = await supabase.functions.invoke("target-level", {
    body: { difficulty },
  });

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("No data returned");

  const randomIndex = Math.floor(Math.random() * data.length);
  return data[randomIndex].title;
};

const PHASE = {
  SELECTING: "SELECTING",
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  SUCCESS: "SUCCESS",
};

export default function GamePage({ onGameComplete, onReturnMain }) {
  const location = useLocation();

  const [phase, setPhase] = useState(PHASE.SELECTING);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const hasPresetMode = Boolean(location.state?.mode);

  const [target, setTarget] = useState({
    title: "",
    summary: "",
    requestedKeyword: "",
    mode: "random",
  });

  const [startTitle, setStartTitle] = useState("");
  const [pathTitles, setPathTitles] = useState([]);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentSummary, setCurrentSummary] = useState("");
  const [currentDocumentHtml, setCurrentDocumentHtml] = useState("");
  const [links, setLinks] = useState([]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clickCount, setClickCount] = useState(0);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const autoStarted = useRef(false);

  const storageKey = "wiki-single-game-state";

  const saveLocalGameState = useCallback((patch = {}) => {
    const prev = JSON.parse(localStorage.getItem(storageKey) || "{}");

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...prev,
        ...patch,
        savedAt: Date.now(),
      })
    );
  }, []);

  const loadLocalGameState = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  }, []);

  const handleCountdownComplete = useCallback(() => {
    setPhase(PHASE.PLAYING);
  }, []);
  const useItems = location.state?.useItems ?? true;
  // ----------------------------
  // 타이머
  // ----------------------------
  useEffect(() => {
    if (phase === PHASE.PLAYING) {
      startTimeRef.current = Date.now() - elapsedSeconds * 1000;

      timerRef.current = setInterval(() => {
        setElapsedSeconds(
          Math.floor((Date.now() - startTimeRef.current) / 1000)
        );
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, elapsedSeconds]);

  const checkWin = useCallback((pageTitle, tgtTitle) => {
    return (
      pageTitle &&
      tgtTitle &&
      normalizeTitle(pageTitle) === normalizeTitle(tgtTitle)
    );
  }, []);

  const handleWin = useCallback(
    (reachedTitle, targetTitle, timeSec, clicks, finalPath) => {
      setPhase(PHASE.SUCCESS);

      localStorage.removeItem(storageKey);

      if (onGameComplete) {
        onGameComplete({
          startTitle,
          targetTitle,
          elapsedSeconds: timeSec,
          clickCount: clicks,
          reachedTitle,
          pathTitles: finalPath,
        });
      }
    },
    [onGameComplete, startTitle]
  );

  // ----------------------------
  // 문서 이동
  // ----------------------------
  const handleMove = useCallback(
    async (nextTitle) => {
      if (phase !== PHASE.PLAYING || isLoading) return;

      const previousTitle = currentTitle;

      setClickCount((prev) => prev + 1);
      setIsLoading(true);
      setError("");

      try {
        const page = await fetchPageData(nextTitle);

        setCurrentTitle(page.title);
        setCurrentSummary(page.summary);
        setCurrentDocumentHtml(page.documentHtml);
        setLinks(page.links);

        const newPath = [...pathTitles, page.title];
        setPathTitles(newPath);

        saveLocalGameState({
          phase: PHASE.PLAYING,
          currentTitle: page.title,
          pathTitles: newPath,
          clickCount: clickCount + 1,
          elapsedSeconds,
        });

        if (previousTitle) {
          itemSystem.pushHistory(previousTitle);
        }

        itemSystem.clearPageScopedEffects();

        window.scrollTo({ top: 0, behavior: "smooth" });

        if (checkWin(page.title, target.title)) {
          handleWin(
            page.title,
            target.title,
            elapsedSeconds,
            clickCount + 1,
            newPath
          );
        }
      } catch (e) {
        setError(e.message || "문서를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [
      phase,
      isLoading,
      currentTitle,
      pathTitles,
      checkWin,
      target.title,
      elapsedSeconds,
      clickCount,
      handleWin,
    ]
  );

  // ----------------------------
  // 아이템 시스템
  // ----------------------------
  const itemSystem = useItemSystem({
    mode: "single",
    links,
    targetTitle: target.title,
    onMove: async (title) => {
      await handleMove(title);
    },
    onRandomTeleport: async () => {
      const randomTitle = await fetchDistinctRandomTitle(
        new Set([normalizeTitle(currentTitle)])
      );
      await handleMove(randomTitle);
    },
  });

  // COUNTDOWN 진입 시 아이템 초기화
  useEffect(() => {
    if (phase === PHASE.COUNTDOWN) {
      itemSystem.initializeItems({ total: 4, rareCount: 1 });
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------
  // 게임 준비
  // ----------------------------
  const handleSetupComplete = useCallback(

    async ({ mode, keyword }) => {
      setIsLoading(true);
      setError("");

      try {
        let start = await fetchRandomTitle();
        let targetTitle = "";

        if (mode === "custom") {
          const state = location.state || {};
          targetTitle = state.targetTitle;

          if (!targetTitle) {
            throw new Error(
              "목표 문서가 선택되지 않았습니다. 메인 화면에서 다시 선택해주세요."
            );
          }

          if (normalizeTitle(start) === normalizeTitle(targetTitle)) {
            start = await fetchDistinctRandomTitle(
              new Set([normalizeTitle(targetTitle)])
            );
          }
        } else {
          try {
            targetTitle = await fetchAiTargetTitle();
          } catch (err) {
            console.error(
              "AI Target fetch failed, falling back to Wikipedia random:",
              err
            );
            targetTitle = await fetchDistinctRandomTitle(
              new Set([normalizeTitle(start)])
            );
          }

          if (normalizeTitle(start) === normalizeTitle(targetTitle)) {
            start = await fetchDistinctRandomTitle(
              new Set([normalizeTitle(targetTitle)])
            );
          }
        }

        const [targetSummaryData, startPage] = await Promise.all([
          fetchSummary(targetTitle),
          fetchPageData(start),
        ]);

        setStartTitle(startPage.title);
        setTarget({
          title: targetSummaryData.title,
          summary: targetSummaryData.extract || "요약이 없습니다.",
          requestedKeyword: mode === "custom" ? keyword : "",
          mode,
        });

        setCurrentTitle(startPage.title);
        setCurrentSummary(startPage.summary);
        setCurrentDocumentHtml(startPage.documentHtml);
        setLinks(startPage.links);

        saveLocalGameState({
          phase: PHASE.COUNTDOWN,
          target: {
            title: targetSummaryData.title,
            summary: targetSummaryData.extract || "요약이 없습니다.",
            requestedKeyword: mode === "custom" ? keyword : "",
            mode,
          },
          startTitle: startPage.title,
          currentTitle: startPage.title,
          pathTitles: [startPage.title],
          clickCount: 0,
          elapsedSeconds: 0,
        });

        setElapsedSeconds(0);
        setClickCount(0);

        const newPath = [startPage.title];
        setPathTitles(newPath);

        if (checkWin(startPage.title, targetSummaryData.title)) {
          handleWin(startPage.title, targetSummaryData.title, 0, 0, newPath);
        } else {
          setPhase(PHASE.COUNTDOWN);
        }
      } catch (e) {
        setError(e.message || "게임을 준비하는 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [checkWin, handleWin, location.state]
  );

  useEffect(() => {
    if (autoStarted.current) return;

    const saved = loadLocalGameState();
    if (!saved?.currentTitle || !saved?.target?.title) return;

    const restoreGame = async () => {
      try {
        autoStarted.current = true;
        setIsLoading(true);
        setError("");

        const page = await fetchPageData(saved.currentTitle);

        setTarget(saved.target);
        setStartTitle(saved.startTitle || "");
        setCurrentTitle(page.title);
        setCurrentSummary(page.summary);
        setCurrentDocumentHtml(page.documentHtml);
        setLinks(page.links);
        setPathTitles(saved.pathTitles || [page.title]);
        setClickCount(saved.clickCount || 0);
        setElapsedSeconds(saved.elapsedSeconds || 0);
        setPhase(PHASE.PLAYING);
      } catch (e) {
        console.error("싱글 게임 복구 실패:", e);
        localStorage.removeItem(storageKey);
      } finally {
        setIsLoading(false);
      }
    };

    restoreGame();
  }, [loadLocalGameState]);

  // ----------------------------
  // 메인 빠른 시작
  // ----------------------------
  useEffect(() => {
    const state = location.state;

    if (state?.mode && !autoStarted.current) {
      autoStarted.current = true;
      handleSetupComplete({
        mode: state.mode,
        keyword: state.keyword ?? "",
      });
    }
  }, [location.state, handleSetupComplete]);

  return (
    <div className="wiki-game-page">
      {error && <div className="state-text error">{error}</div>}

      {/* 직접 /game 진입 시 */}
      {phase === PHASE.SELECTING && (!hasPresetMode || error) && (
        <GameSetup onStart={handleSetupComplete} isLoading={isLoading} />
      )}

      {/* preset 모드 준비 중 */}
      {phase === PHASE.SELECTING && hasPresetMode && !error && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "15vh",
            gap: "1rem",
            textAlign: "center",
          }}
        >
          <h2 style={{ marginBottom: "0.5rem" }}>위키 문서를 준비하는 중...</h2>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid rgba(0,0,0,0.1)",
              borderTop: "4px solid #3498db",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ color: "#666" }}>
            AI 타겟과 시작 문서를 불러오고 있습니다
          </p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {phase === PHASE.COUNTDOWN && (
        <CountdownOverlay onComplete={handleCountdownComplete} />
      )}

      {(phase === PHASE.PLAYING ||
        phase === PHASE.COUNTDOWN ||
        phase === PHASE.SUCCESS) && (
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
            highlightRequestId={itemSystem.highlightRequestId}
            searchAvailable={itemSystem.searchAvailable}
            onConsumeSearch={itemSystem.consumeSearchAvailable}
            status={itemSystem.status}
          />
        )}

      {useItems && itemSystem &&
        (phase === PHASE.PLAYING ||
          phase === PHASE.COUNTDOWN ||
          phase === PHASE.SUCCESS) && (
          <>
            <ItemBar
              inventory={itemSystem.inventory}
              canUseItem={itemSystem.canUseItem}
              onUseItem={itemSystem.useItem}
            />

            <EffectOverlay
              blindActive={itemSystem.activeEffects.self.some(
                (e) => e.id === "blind"
              )}
              floatingMessage={itemSystem.floatingMessage}
              immune={Date.now() < itemSystem.immunityUntil.self}
            />
          </>
        )}

      {phase === PHASE.SUCCESS && (
        <SuccessOverlay
          targetTitle={target.title}
          elapsedSeconds={elapsedSeconds}
          clickCount={clickCount}
          pathTitles={pathTitles}
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