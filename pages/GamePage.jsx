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

import { generateInitialInventory } from "../data/items";
import {
  addEffect,
  buildTimedEffect,
  canUseItem as canUseItemBase,
  clearExpiredEffects,
  markItemUsed,
  removeEffect,
} from "../utils/itemSystem";
import ItemBar from "../components/ItemBar";
import EffectOverlay from "../components/EffectOverlay";

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

  // ----------------------------
  // 아이템 상태
  // ----------------------------
  const [inventory, setInventory] = useState([]);
  const [activeEffects, setActiveEffects] = useState({ self: [], opponent: [] });
  const [immunityUntil, setImmunityUntil] = useState({ self: 0, opponent: 0 });
  const [translateCurrentPage, setTranslateCurrentPage] = useState(false);
  const [historyStack, setHistoryStack] = useState([]);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [highlightedLinks, setHighlightedLinks] = useState([]);
  const [floatingMessage, setFloatingMessage] = useState("");

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const autoStarted = useRef(false);

  // ----------------------------
  // 타이머
  // ----------------------------
  const handleCountdownComplete = useCallback(() => {
    setPhase(PHASE.PLAYING);
  }, []);
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

  // 지속 효과 만료 정리
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveEffects((prev) => ({
        self: clearExpiredEffects(prev.self),
        opponent: clearExpiredEffects(prev.opponent),
      }));
    }, 500);

    return () => clearInterval(interval);
  }, []);

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

        setElapsedSeconds(0);
        setClickCount(0);

        const newPath = [startPage.title];
        setPathTitles(newPath);

        // 아이템 초기화
        setInventory(generateInitialInventory({ total: 4, rareCount: 1 }));
        setActiveEffects({ self: [], opponent: [] });
        setImmunityUntil({ self: 0, opponent: 0 });
        setTranslateCurrentPage(false);
        setHistoryStack([]);
        setSearchAvailable(false);
        setHighlightedLinks([]);
        setFloatingMessage("");

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

  // 메인 빠른 시작
  useEffect(() => {
    const state = location.state;
    if (state?.mode && !autoStarted.current) {
      autoStarted.current = true;
      handleSetupComplete({ mode: state.mode, keyword: state.keyword ?? "" });
    }
  }, [location.state, handleSetupComplete]);

  // ----------------------------
  // 문서 이동
  // ----------------------------
  const handleMove = async (nextTitle) => {
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

      // 이동 기록 저장
      if (previousTitle) {
        setHistoryStack((prev) => [...prev, previousTitle]);
      }

      // 현재 문서에만 적용되는 효과 해제
      if (translateCurrentPage) {
        setTranslateCurrentPage(false);
      }

      // 하이라이트는 현재 페이지 기준이라 이동 시 해제
      setHighlightedLinks([]);

      window.scrollTo({ top: 0, behavior: "smooth" });

      if (checkWin(page.title, target.title)) {
        handleWin(page.title, target.title, elapsedSeconds, clickCount + 1, newPath);
      }
    } catch (e) {
      setError(e.message || "문서를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------
  // 아이템 사용
  // ----------------------------
  const useItem = async (item) => {
    const usable = canUseItemBase(item, { historyStack, links });
    if (!usable || item.used) return;

    setInventory((prev) => markItemUsed(prev, item.instanceId));

    switch (item.id) {
      case "blind": {
        setActiveEffects((prev) => ({
          ...prev,
          self: addEffect(prev.self, buildTimedEffect("blind", item.duration)),
        }));
        setFloatingMessage("시야 가리기!");
        break;
      }

      case "cleanse_shield": {
        setActiveEffects((prev) => ({
          ...prev,
          self: removeEffect(removeEffect(prev.self, "blind"), "translate_current"),
        }));
        setImmunityUntil((prev) => ({
          ...prev,
          self: Date.now() + 10000,
        }));
        setFloatingMessage("방해 해제 + 10초 면역");
        break;
      }

      case "search_once": {
        setSearchAvailable(true);
        setFloatingMessage("페이지 내 검색 1회 가능");
        break;
      }

      case "go_back": {
        if (!historyStack.length) break;
        const previousTitle = historyStack[historyStack.length - 1];
        setHistoryStack((prev) => prev.slice(0, -1));
        await handleMove(previousTitle);
        setFloatingMessage("뒤로가기 사용");
        break;
      }

      case "highlight_links": {
        const candidates = (links || []).slice(0, 3);
        setHighlightedLinks(candidates);
        setFloatingMessage("링크 하이라이트!");
        break;
      }

      case "random_teleport": {
        const randomTitle = await fetchDistinctRandomTitle(
          new Set([normalizeTitle(currentTitle)])
        );
        await handleMove(randomTitle);
        setFloatingMessage("랜덤 텔레포트!");
        break;
      }

      default: {
        setFloatingMessage(`${item.name} 사용`);
        break;
      }
    }

    setTimeout(() => setFloatingMessage(""), 1800);
  };

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
            highlightedLinks={highlightedLinks}
            searchAvailable={searchAvailable}
          />
        )}

      {(phase === PHASE.PLAYING ||
        phase === PHASE.COUNTDOWN ||
        phase === PHASE.SUCCESS) && (
          <>
            <ItemBar
              inventory={inventory}
              canUseItem={(item) =>
                canUseItemBase(item, {
                  historyStack,
                  links,
                })
              }
              onUseItem={(instanceId) => {
                const item = inventory.find((i) => i.instanceId === instanceId);
                if (!item) return;
                useItem(item);
              }}
            />

            <EffectOverlay
              blindActive={activeEffects.self.some((e) => e.id === "blind")}
              floatingMessage={floatingMessage}
              immune={Date.now() < immunityUntil.self}
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