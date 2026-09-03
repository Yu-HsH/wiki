import React, { useState, useCallback, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageLoadingOverlay from "../components/PageLoadingOverlay";
import {
  fetchRandomTitle,
  fetchDistinctRandomTitle,
  fetchSummary,
  fetchPageData,
  normalizeTitle,
} from "../services/wikiService";

import CountdownOverlay from "../components/CountdownOverlay";
import SuccessOverlay from "../components/SuccessOverlay";
import WikiViewer from "../components/WikiViewer";
import FloatingHud from "../components/FloatingHud";
import ScrollToTopButton from "../components/ScrollToTopButton";
import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { useAuth } from "../authContext";
import { trackEvent } from "../services/analyticsService";
import { createLatestRequestManager, isAbortError } from "../utils/latestRequest";
import {
  clearGuestSingleGameProgress,
  getRestoredGuestElapsedSeconds,
  readGuestSingleGameSession,
  saveGuestSingleGameSession,
} from "../utils/singleGameSession";
import { LOBBY_PATH } from "../utils/appRoutes";

import ItemBar from "../components/ItemBar";
import EffectOverlay from "../components/EffectOverlay";
import useItemSystem from "../hooks/useItemSystem";
import {
  applyAuthenticatedSingleMove,
  applyGuestSingleMove,
  createAuthenticatedSingleRun,
  fetchAuthenticatedSingleRun,
  invokeGuestSingleRun,
  leaveAuthenticatedSingleRun,
} from "../services/singleGameService";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService";
import { createPendingRequestStore } from "../utils/serverAuthority";
import { useExitGuard } from "../components/ExitGuard";


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

const LEGACY_SINGLE_GAME_STORAGE_KEY = "wiki-single-game-state";

export default function GamePage({
  onGameComplete,
  onReturnLobby,
  guestRecovery = false,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuestGame = Boolean(user?.isGuest || guestRecovery);

  const [phase, setPhase] = useState(PHASE.SELECTING);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPageLoading, setIsPageLoading] = useState(false);

  const hasPresetMode = Boolean(location.state?.mode);

  const [target, setTarget] = useState({
    title: "",
    summary: "",
    requestedKeyword: "",
    mode: "random",
    pageId: null,
    revisionId: null,
  });

  const [startTitle, setStartTitle] = useState("");
  const [pathTitles, setPathTitles] = useState([]);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentSummary, setCurrentSummary] = useState("");
  const [currentDocumentHtml, setCurrentDocumentHtml] = useState("");
  const [links, setLinks] = useState([]);
  const [quickLinks, setQuickLinks] = useState([]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [serverRun, setServerRun] = useState(null);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const autoStarted = useRef(false);
  const restoredFromStorageRef = useRef(false);
  const playStartTrackedRef = useRef(false);
  const moveInFlightRef = useRef(false);
  const pageRequestManagerRef = useRef(createLatestRequestManager());
  const serverRunRef = useRef(null);
  const pendingRequestStoreRef = useRef(null);
  if (!pendingRequestStoreRef.current) {
    pendingRequestStoreRef.current = createPendingRequestStore(
      typeof window !== "undefined" ? window.localStorage : null,
      "wiki-single-pending-mutation"
    );
  }

  useEffect(() => {
    serverRunRef.current = serverRun;
  }, [serverRun]);

  const saveLocalGameState = useCallback((patch = {}) => {
    if (isGuestGame) {
      return saveGuestSingleGameSession(patch);
    }

    try {
      const prev = JSON.parse(
        localStorage.getItem(LEGACY_SINGLE_GAME_STORAGE_KEY) || "{}"
      );

      localStorage.setItem(
        LEGACY_SINGLE_GAME_STORAGE_KEY,
        JSON.stringify({
          ...prev,
          ...patch,
          savedAt: Date.now(),
        })
      );
    } catch {
      localStorage.removeItem(LEGACY_SINGLE_GAME_STORAGE_KEY);
    }
    return null;
  }, [isGuestGame]);

  const loadLocalGameState = useCallback(() => {
    if (isGuestGame) {
      return readGuestSingleGameSession();
    }

    try {
      return JSON.parse(
        localStorage.getItem(LEGACY_SINGLE_GAME_STORAGE_KEY) || "null"
      );
    } catch {
      localStorage.removeItem(LEGACY_SINGLE_GAME_STORAGE_KEY);
      return null;
    }
  }, [isGuestGame]);

  const clearSingleGameState = useCallback(() => {
    if (isGuestGame) {
      clearGuestSingleGameProgress();
    } else {
      localStorage.removeItem(LEGACY_SINGLE_GAME_STORAGE_KEY);
      localStorage.removeItem("wiki-single-items");
    }
  }, [isGuestGame]);

  const setAuthoritativeRun = useCallback((run) => {
    if (!run) return;
    setServerRun(run);
    serverRunRef.current = run;
  }, []);

  const createAuthoritativeRun = useCallback(async ({ runId, startPage, targetData, guestToken }) => {
    if (!isSupabaseConfigured || !startPage?.pageId || !startPage?.revisionId || !targetData?.pageId) return null;

    const result = isGuestGame
      ? await invokeGuestSingleRun("create", {
        guestToken,
        run: {
          runId,
          start: startPage,
          target: targetData,
        },
      })
      : await createAuthenticatedSingleRun({ runId, start: startPage, target: targetData });
    setAuthoritativeRun(result.run);
    return result.run;
  }, [isGuestGame, setAuthoritativeRun]);

  const loadAuthoritativeRun = useCallback(async (saved) => {
    if (!isSupabaseConfigured || !saved?.serverRunId) return null;
    const run = isGuestGame
      ? (await invokeGuestSingleRun("snapshot", {
        guestToken: saved.guestToken,
        runId: saved.serverRunId,
      })).run
      : await fetchAuthenticatedSingleRun(saved.serverRunId);
    setAuthoritativeRun(run);
    return run;
  }, [isGuestGame, setAuthoritativeRun]);

  const replayPendingMutation = useCallback(async (run, saved, signal) => {
    const pending = pendingRequestStoreRef.current.read();
    if (!run || !pending || pending.runId !== run.id || !pending.nextPage?.title) {
      return run;
    }

    const page = await fetchPageData(pending.nextPage.title, { signal });
    await ensureWikiSnapshot(page);
    const guestToken = loadLocalGameState()?.guestToken || saved?.guestToken;
    const response = isGuestGame
      ? await applyGuestSingleMove({
        guestToken,
        runId: run.id,
        expectedVersion: pending.expectedVersion ?? run.state_version,
        nextPage: page,
        clickedRawTitle: pending.clickedRawTitle,
        requestId: pending.requestId,
        correlationId: pending.correlationId,
      })
      : await applyAuthenticatedSingleMove({
        runId: run.id,
        expectedVersion: pending.expectedVersion ?? run.state_version,
        nextPage: page,
        clickedRawTitle: pending.clickedRawTitle,
        requestId: pending.requestId,
        correlationId: pending.correlationId,
      });
    pendingRequestStoreRef.current.clear(pending.requestId);
    setAuthoritativeRun(response.run);
    return response.run;
  }, [isGuestGame, loadLocalGameState, setAuthoritativeRun]);

  const handleCountdownComplete = useCallback(() => {
    if (!playStartTrackedRef.current) {
      playStartTrackedRef.current = true;
      trackEvent("play_start", {
        user,
        mode: "single",
        targetTitle: target.title,
      });
    }

    setPhase(PHASE.PLAYING);
    saveLocalGameState({
      phase: PHASE.PLAYING,
      elapsedSeconds,
      startedAt: Date.now() - elapsedSeconds * 1000,
    });
  }, [elapsedSeconds, saveLocalGameState, target.title, user]);

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
    (reachedTitle, targetTitle, timeSec, clicks, finalPath, serverFinalized = false) => {
      setPhase(PHASE.SUCCESS);
      clearSingleGameState();

      if (onGameComplete) {
        onGameComplete({
          startTitle,
          targetTitle,
          elapsedSeconds: timeSec,
          clickCount: clicks,
          reachedTitle,
          pathTitles: finalPath,
          serverFinalized,
        });
      }
    },
    [onGameComplete, startTitle, clearSingleGameState]
  );

  const handleGiveUp = useCallback(async () => {
    pageRequestManagerRef.current.cancel();
    const activeRun = serverRunRef.current;
    if (isSupabaseConfigured && activeRun?.status === "active") {
      try {
        if (isGuestGame) {
          await invokeGuestSingleRun("leave", {
            guestToken: loadLocalGameState()?.guestToken,
            runId: activeRun.id,
          });
        } else {
          await leaveAuthenticatedSingleRun({ runId: activeRun.id });
        }
      } catch (error) {
        setError(error?.message || "게임 이탈 상태를 서버에 저장하지 못했습니다.");
        return;
      }
    }
    clearSingleGameState();
    if (onReturnLobby) {
      onReturnLobby();
    }
  }, [clearSingleGameState, isGuestGame, loadLocalGameState, onReturnLobby]);

  const { requestExit, dialog: exitDialog } = useExitGuard({
    enabled: phase === PHASE.COUNTDOWN || phase === PHASE.PLAYING,
    onConfirm: handleGiveUp,
  });

  // ----------------------------
  // 문서 이동
  // ----------------------------
  const handleMove = useCallback(
    async (nextTitle) => {
      if (phase !== PHASE.PLAYING || isLoading || moveInFlightRef.current) return;

      moveInFlightRef.current = true;
      const request = pageRequestManagerRef.current.begin();
      const previousTitle = currentTitle;
      setClickCount((prev) => prev + 1);
      setIsLoading(true);
      setIsPageLoading(true);
      setError("");

      try {
        const page = await fetchPageData(nextTitle, { signal: request.signal });
        if (!pageRequestManagerRef.current.isCurrent(request.id)) return;

        let authoritativeMove = null;
        const activeRun = serverRunRef.current;
        if (isSupabaseConfigured && activeRun?.status === "active") {
          await ensureWikiSnapshot(page);
          const pendingMutation = pendingRequestStoreRef.current.begin({
            runId: activeRun.id,
            mode: "single",
            expectedVersion: activeRun.state_version,
            clickedRawTitle: nextTitle,
            nextPage: {
              title: page.title,
              canonicalTitle: page.canonicalTitle || page.title,
              pageId: page.pageId,
              revisionId: page.revisionId,
            },
          });
          authoritativeMove = isGuestGame
            ? await applyGuestSingleMove({
              guestToken: loadLocalGameState()?.guestToken,
              runId: activeRun.id,
              expectedVersion: activeRun.state_version,
              nextPage: page,
              clickedRawTitle: nextTitle,
              requestId: pendingMutation.requestId,
              correlationId: pendingMutation.correlationId,
            })
            : await applyAuthenticatedSingleMove({
              runId: activeRun.id,
              expectedVersion: activeRun.state_version,
              nextPage: page,
              clickedRawTitle: nextTitle,
              requestId: pendingMutation.requestId,
              correlationId: pendingMutation.correlationId,
            });
          pendingRequestStoreRef.current.clear(pendingMutation.requestId);
          setAuthoritativeRun(authoritativeMove.run);
        }

        setCurrentTitle(page.title);
        setCurrentSummary(page.summary);
        setCurrentDocumentHtml(page.documentHtml);
        setLinks(page.links);
        setQuickLinks(page.quickLinks);

        const newPath = authoritativeMove?.run?.path_title_snapshots || [...pathTitles, page.title];
        const nextClickCount = authoritativeMove?.run?.move_count ?? clickCount + 1;
        setPathTitles(newPath);

        saveLocalGameState({
          phase: PHASE.PLAYING,
          currentTitle: page.title,
          pathTitles: newPath,
          clickCount: nextClickCount,
          elapsedSeconds,
          serverRunId: authoritativeMove?.run?.id || activeRun?.id,
          serverStateVersion: authoritativeMove?.run?.state_version ?? activeRun?.state_version,
        });

        if (previousTitle) {
          itemSystem.pushHistory(previousTitle);
        }

        itemSystem.clearPageScopedEffects();
        window.scrollTo({ top: 0, behavior: "smooth" });

        const serverSolved = authoritativeMove?.run?.status === "completed";
        if (serverSolved || (!authoritativeMove && checkWin(page.title, target.title))) {
          handleWin(
            page.title,
            target.title,
            elapsedSeconds,
            authoritativeMove?.run?.move_count ?? clickCount + 1,
            newPath,
            Boolean(authoritativeMove)
          );
        }
      } catch (e) {
        if (!isAbortError(e) && pageRequestManagerRef.current.isCurrent(request.id)) {
          setError(e.message || "문서를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        moveInFlightRef.current = false;
        if (pageRequestManagerRef.current.isCurrent(request.id)) {
          setIsLoading(false);
          setIsPageLoading(false);
          pageRequestManagerRef.current.complete(request.id);
        }
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
      saveLocalGameState,
      isGuestGame,
      loadLocalGameState,
      setAuthoritativeRun,
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
  // 게임 준비 로직
  // ----------------------------
  const handleSetupComplete = useCallback(
    async ({ mode, keyword }) => {
      clearSingleGameState();
      if (!isGuestGame) {
        clearGuestSingleGameProgress();
      }

      const request = pageRequestManagerRef.current.begin();
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
            console.error("AI Target fetch failed:", err);
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
          fetchSummary(targetTitle, { signal: request.signal }),
          fetchPageData(start, { signal: request.signal }),
        ]);
        if (!pageRequestManagerRef.current.isCurrent(request.id)) return;

        setStartTitle(startPage.title);
        setTarget({
          title: targetSummaryData.title,
          summary: targetSummaryData.extract || "요약이 없습니다.",
          requestedKeyword: mode === "custom" ? keyword : "",
          mode,
          pageId: targetSummaryData.pageId || null,
          revisionId: targetSummaryData.revisionId || null,
        });

        setCurrentTitle(startPage.title);
        setCurrentSummary(startPage.summary);
        setCurrentDocumentHtml(startPage.documentHtml);
        setLinks(startPage.links);
        setQuickLinks(startPage.quickLinks);

        const initialState = saveLocalGameState({
          phase: PHASE.COUNTDOWN,
          target: {
            title: targetSummaryData.title,
            summary: targetSummaryData.extract || "요약이 없습니다.",
            requestedKeyword: mode === "custom" ? keyword : "",
            mode,
            pageId: targetSummaryData.pageId || null,
            revisionId: targetSummaryData.revisionId || null,
          },
          startTitle: startPage.title,
          currentTitle: startPage.title,
          pathTitles: [startPage.title],
          clickCount: 0,
          elapsedSeconds: 0,
        });

        if (isSupabaseConfigured && startPage.pageId && startPage.revisionId && targetSummaryData.pageId) {
          await ensureWikiSnapshot(startPage);
          const runId = initialState?.serverRunId || crypto.randomUUID();
          const run = await createAuthoritativeRun({
            runId,
            startPage,
            targetData: {
              title: targetSummaryData.title,
              canonicalTitle: targetSummaryData.canonicalTitle || targetSummaryData.title,
              pageId: targetSummaryData.pageId,
              revisionId: targetSummaryData.revisionId,
            },
            guestToken: initialState?.guestToken,
          });
          if (run) {
            saveLocalGameState({
              serverRunId: run.id,
              serverStateVersion: run.state_version,
              guestToken: initialState?.guestToken,
            });
          }
        }

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
        if (!isAbortError(e) && pageRequestManagerRef.current.isCurrent(request.id)) {
          setError(e.message || "게임을 준비하는 중 오류가 발생했습니다.");
        }
      } finally {
        if (pageRequestManagerRef.current.isCurrent(request.id)) {
          setIsLoading(false);
          pageRequestManagerRef.current.complete(request.id);
        }
      }
    },
    [
      checkWin,
      clearSingleGameState,
      createAuthoritativeRun,
      handleWin,
      isGuestGame,
      location.state,
      saveLocalGameState,
    ]
  );

  // ----------------------------
  // 마운트 시 게임 시작 또는 복구 통합 관리
  // ----------------------------
  useEffect(() => {
    if (autoStarted.current) return;

    const saved = loadLocalGameState();
    const state = location.state;

    // 게스트가 메인 화면에서 새 게임을 요청했다면 이전 진행보다 새 요청을 우선합니다.
    if (isGuestGame && !guestRecovery && state?.mode) {
      autoStarted.current = true;
      handleSetupComplete({
        mode: state.mode,
        keyword: state.keyword ?? "",
        targetTitle: state.targetTitle,
      });
      window.history.replaceState({}, document.title);
      return;
    }

    // 1. 저장된 게임이 있으면 무조건 복구 우선 (새로고침 대응)
    if (saved?.currentTitle && saved?.target?.title) {
      autoStarted.current = true;
      restoredFromStorageRef.current = true;
      playStartTrackedRef.current = true;

      const restoreGame = async () => {
        const request = pageRequestManagerRef.current.begin();
        try {
          setIsLoading(true);
          setError("");
          localStorage.removeItem("wiki-single-items");
          let authoritative = await loadAuthoritativeRun(saved);
          authoritative = await replayPendingMutation(authoritative, saved, request.signal);
          if (authoritative && ["abandoned", "expired"].includes(authoritative.status)) {
            clearSingleGameState();
            navigate(LOBBY_PATH, { replace: true });
            return;
          }
          if (authoritative?.status === "completed") {
            clearSingleGameState();
            navigate(LOBBY_PATH, { replace: true });
            return;
          }
          const restoredTitle = authoritative?.current_title_snapshot || saved.currentTitle;
          const page = await fetchPageData(restoredTitle, { signal: request.signal });
          if (authoritative) await ensureWikiSnapshot(page);
          if (!pageRequestManagerRef.current.isCurrent(request.id)) return;

          setTarget({
            ...saved.target,
            pageId: authoritative?.target_page_id || saved.target?.pageId || null,
            revisionId: authoritative?.target_revision_id || saved.target?.revisionId || null,
          });
          setStartTitle(authoritative?.start_title_snapshot || saved.startTitle || "");
          setCurrentTitle(page.title);
          setCurrentSummary(page.summary);
          setCurrentDocumentHtml(page.documentHtml);
          setLinks(page.links);
          setQuickLinks(page.quickLinks);
          const restoredPath = authoritative?.path_title_snapshots || saved.pathTitles || [page.title];
          const restoredClicks = authoritative?.move_count ?? saved.clickCount ?? 0;
          const restoredElapsed = isGuestGame
            ? getRestoredGuestElapsedSeconds(saved)
            : saved.elapsedSeconds || 0;
          const restoredStartedAt =
            saved.startedAt || Date.now() - restoredElapsed * 1000;

          setPathTitles(restoredPath);
          setClickCount(restoredClicks);
          setElapsedSeconds(restoredElapsed);
          saveLocalGameState({
            phase: PHASE.PLAYING,
            currentTitle: page.title,
            pathTitles: restoredPath,
            clickCount: restoredClicks,
            elapsedSeconds: restoredElapsed,
            startedAt: restoredStartedAt,
            serverRunId: authoritative?.id || saved.serverRunId,
            serverStateVersion: authoritative?.state_version ?? saved.serverStateVersion,
            guestToken: saved.guestToken,
          });
          // 복구 시에는 카운트다운 없이 바로 진행
          setPhase(PHASE.PLAYING);
        } catch (e) {
          if (isAbortError(e) || !pageRequestManagerRef.current.isCurrent(request.id)) return;
          console.error("싱글 게임 복구 실패:", e);
          clearSingleGameState();
          navigate(LOBBY_PATH, { replace: true });
        } finally {
          if (pageRequestManagerRef.current.isCurrent(request.id)) {
            setIsLoading(false);
            pageRequestManagerRef.current.complete(request.id);
          }
        }
      };
      restoreGame();
    }
    // 2. 저장된 게임이 없고 새 게임 요청(state)이 있으면 시작
    else if (state?.mode && !restoredFromStorageRef.current) {
      autoStarted.current = true;
      handleSetupComplete({
        mode: state.mode,
        keyword: state.keyword ?? "",
        targetTitle: state.targetTitle,
      });

      // 시작 후 히스토리 state를 비워 새로고침 시 중복 시작 방지
      window.history.replaceState({}, document.title);
    }
    // 3. 둘 다 없으면 로비로 이동
    else if (!state?.mode) {
      navigate(LOBBY_PATH, { replace: true });
    }
  }, [
    clearSingleGameState,
    loadAuthoritativeRun,
    replayPendingMutation,
    guestRecovery,
    handleSetupComplete,
    isGuestGame,
    loadLocalGameState,
    location.state,
    navigate,
    saveLocalGameState,
  ]);

  return (
    <div className="wiki-game-page">
      {isPageLoading && <PageLoadingOverlay />}
      {error && <div className="state-text error">{error}</div>}


      {/* SELECTING 단계의 로딩 UI */}
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

      {/* 게임 진행 및 성공 화면 */}
      {(phase === PHASE.PLAYING ||
        phase === PHASE.COUNTDOWN ||
        phase === PHASE.SUCCESS) && (
          <WikiViewer
            target={target}
            currentTitle={currentTitle}
            currentSummary={currentSummary}
            currentDocumentHtml={currentDocumentHtml}
            links={links}
            quickLinks={quickLinks}
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

      {/* 아이템 관련 UI */}
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

      {/* 카운트다운 오버레이 */}
      {phase === PHASE.COUNTDOWN && (
        <CountdownOverlay onComplete={handleCountdownComplete} />
      )}

      {/* 결과 화면 */}
      {phase === PHASE.SUCCESS && (
        <SuccessOverlay
          runId={serverRun?.id ?? null}
          targetTitle={target.title}
          elapsedSeconds={elapsedSeconds}
          clickCount={clickCount}
          pathTitles={pathTitles}
          onReturnToLobby={handleGiveUp}
        />
      )}

      {/* 게임 도중 HUD 및 조작 버튼 */}
      {phase === PHASE.PLAYING && (
        <>
          <FloatingHud
            targetTitle={target.title}
            elapsedSeconds={elapsedSeconds}
            clickCount={clickCount}
          />

          <button
            type="button"
            className="single-giveup-button"
            onClick={requestExit}
          >
            포기하고 로비로
          </button>

          <ScrollToTopButton />
        </>
      )}

      {/* 아무 상태도 아닐 때의 폴백 */}
      {phase === PHASE.SELECTING && (!hasPresetMode || error) && (
        <div style={{ textAlign: "center", marginTop: "15vh" }}>
          <h2>게임을 설정할 수 없습니다.</h2>
          <p>메인 페이지로 이동합니다...</p>
        </div>
      )}

      {exitDialog}
    </div>
  );
}
