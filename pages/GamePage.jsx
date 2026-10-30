import useRaceMotion from "../hooks/useRaceMotion.js";
import useGameAudio from "../hooks/useGameAudio.js";
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageLoadingOverlay from "../components/PageLoadingOverlay";
import {
  fetchRandomTitle,
  fetchDistinctRandomTitle,
  fetchSummary,
  fetchPageSummary,
  fetchPageData,
  createWikiMoveTimer,
  normalizeTitle,
} from "../services/wikiService";

import SuccessOverlay from "../components/SuccessOverlay";
import WikiViewer from "../components/WikiViewer";
import {
  HudArrow,
  HudBrand,
  MobileRouteNotes,
  HudDoc,
  HudExit,
  HudStat,
  HudStatus,
  HudTimer,
  RaceFrame,
  RaceHold,
  RaceHud,
  RouteRail,
} from "../components/wiki-race/race/RaceParts";
import ScrollToTopButton from "../components/ScrollToTopButton";
import { isSupabaseConfigured } from "../supabaseClient";
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
import { fetchTodayDailyChallenge } from "../services/dailyChallengeService";
import { requireDailyCourse } from "../utils/dailyCourse";
import SingleStartCinematic, { LegacySingleStartCinematic } from "../components/cinematic/SingleStartCinematic.jsx";
import { requestSingleStart, normalizeSinglePreparedPage } from "../services/singleStartService.js";
import { SINGLE_START_CONTRACT, isReservedSingle, createSingleServerClock, singleServerElapsed } from "../utils/singleStart.js";


const PHASE = {
  PREPARING: "PREPARING",
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
  const [moveMotion, approveMoveMotion] = useRaceMotion();
  const { user } = useAuth();
  const isGuestGame = Boolean(user?.isGuest || guestRecovery);

  const [phase, setPhase] = useState(PHASE.SELECTING);
  const [isLoading, setIsLoading] = useState(true);
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


  // Reserved runs contain only the target snapshot. Fetch its public encyclopedia
  // description independently: never delay the authoritative start/countdown.
  // The same path restores the brief after F5 or an in-progress reconnect.
  const [targetBrief, setTargetBrief] = useState({ title: "", text: "", status: "idle" });
  const [targetBriefRetry, setTargetBriefRetry] = useState(0);
  useEffect(() => {
    if (!target.title || target.summary) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    const title = target.title;
    setTargetBrief({ title, text: "", status: "loading" });
    fetchPageSummary(title, { signal: controller.signal })
      .then(({ extract, description }) => {
        if (cancelled) return;
        const text = extract || description || "";
        setTargetBrief({ title, text, status: text ? "success" : "empty" });
      })
      .catch(error => {
        if (cancelled || isAbortError(error)) return;
        setTargetBrief({ title, text: "", status: "error" });
      });
    return () => { cancelled = true; controller.abort(); };
  }, [target.title, target.summary, targetBriefRetry]);

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
  useGameAudio({ identity: `single:${serverRun?.id || 'pending'}:${user?.id || 'guest'}`, route: '/game',
    playing: phase === PHASE.PLAYING,
    ended: phase === PHASE.SUCCESS || ['completed', 'expired', 'abandoned'].includes(serverRun?.status) });

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const autoStarted = useRef(false);
  const restoredFromStorageRef = useRef(false);
  const resultRecoveredRef = useRef(false);
  const playStartTrackedRef = useRef(false);
  const moveInFlightRef = useRef(false);
  const pageRequestManagerRef = useRef(createLatestRequestManager());
  const serverRunRef = useRef(null);
  const reservedClockRef = useRef(() => Date.now());
  const preparedRootRef = useRef(null);
  const reservePendingRef = useRef(false);
  const [visibilityEpoch, setVisibilityEpoch] = useState(0);
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

  const createAuthoritativeRun = useCallback(async ({ runId, startPage, targetData, guestToken, runMode }) => {
    if (!isSupabaseConfigured || !startPage?.pageId || !startPage?.revisionId || !targetData?.pageId) return null;

    const result = isGuestGame
      ? await invokeGuestSingleRun("create", {
        guestToken,
        run: {
          runId,
          runMode,
          start: startPage,
          target: targetData,
        },
      })
      : await createAuthenticatedSingleRun({ runId, start: startPage, target: targetData, runMode });
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

  // ----------------------------
  // 타이머
  // ----------------------------
  useEffect(() => {
    const visible = () => { if (!document.hidden) setVisibilityEpoch(value => value + 1); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, []);

  useEffect(() => {
    if (phase === PHASE.PLAYING) {
      if (isReservedSingle(serverRunRef.current)) {
        const update = () => setElapsedSeconds(singleServerElapsed(serverRunRef.current, reservedClockRef.current()));
        update(); timerRef.current = setInterval(update, 200);
        return () => clearInterval(timerRef.current);
      }
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
      // Members retain only recovery state; the server remains the result/XP authority.
      if (!isGuestGame && serverFinalized && serverRunRef.current?.id) {
        saveLocalGameState({
          phase: PHASE.SUCCESS,
          serverRunId: serverRunRef.current.id,
          target: { title: targetTitle, mode: serverRunRef.current.run_mode },
          ...(isReservedSingle(serverRunRef.current) ? { timingContract: SINGLE_START_CONTRACT } : {}),
          startTitle,
          currentTitle: reachedTitle,
          pathTitles: finalPath,
          elapsedSeconds: timeSec,
          clickCount: clicks,
        });
      }

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
    [onGameComplete, startTitle, clearSingleGameState, isGuestGame, saveLocalGameState]
  );

  const handleGiveUp = useCallback(async () => {
    pageRequestManagerRef.current.cancel();
    const activeRun = serverRunRef.current;
    if (isReservedSingle(activeRun) && ['prepared','scheduled','active'].includes(activeRun.status)) {
      try {
        await requestSingleStart('leave_v1', { isGuest: isGuestGame, guestToken: loadLocalGameState()?.guestToken, runId: activeRun.id });
      } catch (failure) { setError(failure.message); return; }
    } else if (isSupabaseConfigured && activeRun?.status === "active") {
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

  // Phase 4 결과 행동 — 재도전 계약이 없으므로 "새 게임 선택"은 기존 /play 모드 선택으로 간다.
  // 완료된 런이라 이탈 RPC는 없다. 로컬 진행 상태만 정리한다.
  const handleChooseNewGame = useCallback(() => {
    pageRequestManagerRef.current.cancel();
    clearSingleGameState();
    navigate("/play", { replace: true });
  }, [clearSingleGameState, navigate]);

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
      const wikiTimer = createWikiMoveTimer("single");
      let failed = false;
      const request = pageRequestManagerRef.current.begin();
      setClickCount((prev) => prev + 1);
      setIsLoading(true);
      setIsPageLoading(true);
      setError("");

      try {
        const page = await fetchPageData(nextTitle, { signal: request.signal });
        wikiTimer.stage("fetch");
        if (!pageRequestManagerRef.current.isCurrent(request.id)) return;

        let authoritativeMove = null;
        const activeRun = serverRunRef.current;
        if (isReservedSingle(activeRun) && activeRun.status !== 'active') throw new Error('서버에서 탐험 시작 상태를 확인해주세요.');
        if (isSupabaseConfigured && activeRun?.status === "active") {
          await ensureWikiSnapshot(page);
          wikiTimer.stage("snapshot");
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
          wikiTimer.stage("moveRpc");
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
        if (authoritativeMove?.run?.id && authoritativeMove.run.state_version != null) {
          approveMoveMotion(`${authoritativeMove.run.id}:${authoritativeMove.run.state_version}`, newPath.length > pathTitles.length);
        }

        saveLocalGameState({
          phase: PHASE.PLAYING,
          currentTitle: page.title,
          pathTitles: newPath,
          clickCount: nextClickCount,
          elapsedSeconds,
          serverRunId: authoritativeMove?.run?.id || activeRun?.id,
          serverStateVersion: authoritativeMove?.run?.state_version ?? activeRun?.state_version,
        });

        window.scrollTo({ top: 0, behavior: "smooth" });

        const serverSolved = authoritativeMove?.run?.status === "completed";
        if (serverSolved || (!authoritativeMove && checkWin(page.title, target.title))) {
          const finalElapsed = isReservedSingle(authoritativeMove?.run)
            ? singleServerElapsed(authoritativeMove.run, reservedClockRef.current()) : elapsedSeconds;
          setElapsedSeconds(finalElapsed);
          handleWin(
            page.title,
            target.title,
            finalElapsed,
            authoritativeMove?.run?.move_count ?? clickCount + 1,
            newPath,
            Boolean(authoritativeMove)
          );
        }
      } catch (e) {
        failed = true;
        if (!isAbortError(e) && pageRequestManagerRef.current.isCurrent(request.id)) {
          setError(e.message || "문서를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        wikiTimer.finish(failed ? "error" : "complete");
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

  const handleReservedDue = useCallback(() => {
    const run = serverRunRef.current;
    if (!isReservedSingle(run) || !run.scheduled_start_at || reservedClockRef.current() < Date.parse(run.scheduled_start_at)) return;
    if (!playStartTrackedRef.current) {
      playStartTrackedRef.current = true;
      trackEvent('play_start', { user, mode: 'single', targetTitle: run.target_title_snapshot });
    }
    const optimistic = { ...run, status: 'active', started_at: run.scheduled_start_at };
    setAuthoritativeRun(optimistic);
    setElapsedSeconds(singleServerElapsed(optimistic, reservedClockRef.current()));
    saveLocalGameState({ phase: PHASE.PLAYING, startedAt: Date.parse(run.scheduled_start_at) });
    setPhase(PHASE.PLAYING);
    // Reservation is the grant. Do not add a final network round trip to the cover.
    requestSingleStart('start', { isGuest: isGuestGame, guestToken: loadLocalGameState()?.guestToken, runId: run.id }).then(response => {
      const current = serverRunRef.current;
      if (current?.id !== run.id || ['completed','abandoned','expired'].includes(current.status)
        || Number(response.run.state_version) < Number(current.state_version)) return;
      if (response.run.status === 'active') setAuthoritativeRun(response.run);
      else if (['expired','abandoned'].includes(response.run.status)) { setAuthoritativeRun(response.run); setPhase(PHASE.PREPARING); setError('종료된 탐험입니다. 새 탐험을 준비해주세요.'); }
    }).catch(() => { /* The first move / recovery resolves the same immutable server reservation. */ });
  }, [isGuestGame, loadLocalGameState, saveLocalGameState, setAuthoritativeRun, user]);

  const prepareReservedGame = useCallback(async (saved, setup = {}) => {
    const request = pageRequestManagerRef.current.begin();
    let session = saved;
    if (saved) restoredFromStorageRef.current = true;
    setPhase(PHASE.PREPARING); setIsLoading(true); setError('');
    try {
      if (!session) {
        session = { timingContract: SINGLE_START_CONTRACT, allocationRequestId: crypto.randomUUID(), phase: PHASE.PREPARING,
          guestToken: isGuestGame ? crypto.randomUUID()+crypto.randomUUID() : undefined,
          target: { mode: setup.mode, title: setup.targetTitle || '', requestedKeyword: setup.keyword || '' } };
        saveLocalGameState(session);
        if (loadLocalGameState()?.allocationRequestId !== session.allocationRequestId) throw new Error('복구 정보를 저장할 수 없습니다. 브라우저 저장소를 허용해주세요.');
      }
      const owner = { isGuest: isGuestGame, guestToken: session.guestToken };
      let response;
      if (session.serverRunId) response = await requestSingleStart('snapshot_v1', { ...owner, runId: session.serverRunId });
      else {
        response = await requestSingleStart('allocate', { ...owner, requestId: session.allocationRequestId, mode: session.target.mode, customTarget: session.target.mode === 'random' ? undefined : session.target.title });
        while (response.code === 'ALLOCATION_PENDING') {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!pageRequestManagerRef.current.isCurrent(request.id)) return;
          response = await requestSingleStart('allocate', { ...owner, requestId: session.allocationRequestId, mode: session.target.mode, customTarget: session.target.mode === 'random' ? undefined : session.target.title });
        }
      }
      if (!pageRequestManagerRef.current.isCurrent(request.id)) return;
      let run = response.run;
      if (!isReservedSingle(run)) throw new Error('서버 시작 계약을 확인하지 못했습니다.');
      reservedClockRef.current = createSingleServerClock(response.server_now);
      setAuthoritativeRun(run);
      saveLocalGameState({ serverRunId: run.id, target: { ...session.target, title: run.target_title_snapshot, mode: run.run_mode }, phase: PHASE.PREPARING });
      setTarget({ ...session.target, title: run.target_title_snapshot, mode: run.run_mode, pageId: run.target_page_id });
      setStartTitle(run.start_title_snapshot); setCurrentTitle(run.current_title_snapshot);
      if (run.status === 'active') run = await replayPendingMutation(run, session, request.signal);
      if (run.status === 'completed') {
        resultRecoveredRef.current = true;
        if (isGuestGame) clearSingleGameState();
        else saveLocalGameState({ phase: PHASE.SUCCESS, serverRunId: run.id, timingContract: SINGLE_START_CONTRACT,
          target: { title: run.target_title_snapshot, mode: run.run_mode }, startTitle: run.start_title_snapshot,
          currentTitle: run.current_title_snapshot, pathTitles: run.path_title_snapshots, clickCount: run.move_count,
          elapsedSeconds: singleServerElapsed(run, reservedClockRef.current()) });
        setPathTitles(run.path_title_snapshots); setClickCount(run.move_count);
        setElapsedSeconds(singleServerElapsed(run, reservedClockRef.current())); setPhase(PHASE.SUCCESS); return;
      }
      if (['expired','abandoned'].includes(run.status)) throw new Error('준비 기한이 지났거나 종료된 탐험입니다. 로비에서 새 탐험을 시작해주세요.');
      const documentResponse = await requestSingleStart('document', { ...owner, runId: run.id });
      if (!pageRequestManagerRef.current.isCurrent(request.id)) return;
      run = documentResponse.run;
      if (!documentResponse.page || !['prepared','scheduled','active'].includes(run.status)) throw new Error('문서 준비 중 탐험이 만료됐습니다.');
      const page = normalizeSinglePreparedPage(documentResponse.page);
      setAuthoritativeRun(run); reservedClockRef.current = createSingleServerClock(documentResponse.server_now);
      setCurrentTitle(page.title); setCurrentSummary(page.summary); setCurrentDocumentHtml(page.documentHtml);
      setLinks(page.links); setQuickLinks(page.quickLinks); setPathTitles(run.path_title_snapshots); setClickCount(run.move_count);
      setElapsedSeconds(singleServerElapsed(run, reservedClockRef.current()));
      saveLocalGameState({ phase: run.status === 'active' ? PHASE.PLAYING : run.status === 'scheduled' ? PHASE.COUNTDOWN : PHASE.PREPARING,
        timingContract: SINGLE_START_CONTRACT, allocationRequestId: session.allocationRequestId, guestToken: session.guestToken,
        serverRunId: run.id, serverStateVersion: run.state_version, startTitle: run.start_title_snapshot, currentTitle: page.title,
        pathTitles: run.path_title_snapshots, clickCount: run.move_count, elapsedSeconds: singleServerElapsed(run, reservedClockRef.current()),
        ...(run.scheduled_start_at ? { startedAt: Date.parse(run.scheduled_start_at) } : {}) });
      if (run.status === 'active') setPhase(PHASE.PLAYING);
      else if (run.status === 'scheduled') setPhase(PHASE.COUNTDOWN);
    } catch (failure) {
      if (pageRequestManagerRef.current.isCurrent(request.id)) setError(failure.message || '탐험을 준비하지 못했습니다.');
    } finally {
      if (pageRequestManagerRef.current.isCurrent(request.id)) { setIsLoading(false); pageRequestManagerRef.current.complete(request.id); }
    }
  }, [isGuestGame, clearSingleGameState, loadLocalGameState, replayPendingMutation, saveLocalGameState, setAuthoritativeRun]);

  useLayoutEffect(() => {
    if (phase !== PHASE.PREPARING || isLoading || !currentDocumentHtml || !preparedRootRef.current || serverRun?.status !== 'prepared'
      || !isReservedSingle(serverRun) || error || document.hidden || reservePendingRef.current) return;
    let cancelled = false, first, second;
    const reserve = async () => {
      if (cancelled || document.hidden) return;
      reservePendingRef.current = true;
      try {
        const response = await requestSingleStart('reserve_start', { isGuest: isGuestGame, guestToken: loadLocalGameState()?.guestToken, runId: serverRun.id });
        if (cancelled || serverRunRef.current?.id !== serverRun.id) return;
        if (!['scheduled','active'].includes(response.run.status)) throw new Error('준비 기한이 지났습니다. 로비에서 다시 시작해주세요.');
        setAuthoritativeRun(response.run); reservedClockRef.current = createSingleServerClock(response.server_now);
        saveLocalGameState({ phase: PHASE.COUNTDOWN, startedAt: Date.parse(response.run.scheduled_start_at) });
        setPhase(PHASE.COUNTDOWN);
      } catch (failure) { if (!cancelled) setError(failure.message); }
      finally { reservePendingRef.current = false; }
    };
    // Actual article DOM commit + layout and essential fonts precede reservation.
    Promise.resolve(document.fonts?.ready).then(() => { if (!cancelled) first = requestAnimationFrame(() => { second = requestAnimationFrame(reserve); }); });
    return () => { cancelled = true; cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [phase, isLoading, currentDocumentHtml, serverRun?.id, serverRun?.status, error, visibilityEpoch, isGuestGame, loadLocalGameState, saveLocalGameState, setAuthoritativeRun]);

  // ----------------------------
  // 게임 준비 로직
  // ----------------------------
  const handleSetupComplete = useCallback(
    async ({ mode, keyword, targetTitle: requestedTarget }) => {
      clearSingleGameState();
      if (!isGuestGame) {
        clearGuestSingleGameProgress();
      }

      // New random creation requires server allocation; legacy saved runs still
      // use the existing recovery path below without changing their time basis.
      if (mode === 'random' && !isSupabaseConfigured) {
        setPhase(PHASE.PREPARING);
        setError('싱글 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      if (isSupabaseConfigured && ['random','custom','daily'].includes(mode)) {
        await prepareReservedGame(null, { mode, keyword, targetTitle: requestedTarget || location.state?.targetTitle || '' });
        return;
      }

      const request = pageRequestManagerRef.current.begin();
      setIsLoading(true);
      setError("");

      try {
        let start;
        let targetTitle = "";

        if (mode === "daily") {
          // Re-read at game creation: navigation state can be stale or forged.
          const course = requireDailyCourse(await fetchTodayDailyChallenge(), { online: isSupabaseConfigured });
          start = course.startTitle;
          targetTitle = course.targetTitle;
        } else if (mode === "custom" || mode === "daily") {
          start = await fetchRandomTitle();
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
        } else throw new Error('지원하지 않는 싱글 모드입니다.');

        const [targetSummaryData, startPage] = await Promise.all([
          fetchSummary(targetTitle, { signal: request.signal }),
          fetchPageData(start, { signal: request.signal }),
        ]);
        if (!pageRequestManagerRef.current.isCurrent(request.id)) return;
        if (mode === "daily" && isSupabaseConfigured &&
            (!startPage.pageId || !startPage.revisionId || !targetSummaryData.pageId)) {
          throw new Error("오늘 코스의 문서 ID를 확인하지 못했습니다. 다시 시도해주세요.");
        }

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
          // daily RPC는 클라이언트 제목뿐 아니라 서버의 page identity도 검증한다.
          if (mode === "daily") await ensureWikiSnapshot(targetSummaryData);
          const runId = initialState?.serverRunId || crypto.randomUUID();
          const run = await createAuthoritativeRun({
            runId,
            runMode: mode,
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
          clearSingleGameState();
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
      prepareReservedGame,
    ]
  );

  // ----------------------------
  // 마운트 시 게임 시작 또는 복구 통합 관리
  // ----------------------------
  useEffect(() => {
    if (autoStarted.current) return;

    let saved = loadLocalGameState();
    const state = location.state;
    if (saved?.timingContract === SINGLE_START_CONTRACT && !(saved.phase === PHASE.SUCCESS && state?.mode)) {
      autoStarted.current = true; restoredFromStorageRef.current = true; playStartTrackedRef.current = true;
      prepareReservedGame(saved); window.history.replaceState({}, document.title); return;
    }
    // An explicit new request replaces a completed result, while active runs
    // still retain the existing recovery priority.
    if (saved?.phase === PHASE.SUCCESS && state?.mode) {
      clearSingleGameState();
      saved = null;
    }

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
            resultRecoveredRef.current = true;
            setStartTitle(authoritative.start_title_snapshot);
            setTarget({ title: authoritative.target_title_snapshot, pageId: authoritative.target_page_id });
            setCurrentTitle(authoritative.current_title_snapshot);
            setPathTitles(authoritative.path_title_snapshots || []);
            setClickCount(authoritative.move_count);
            setElapsedSeconds(saved.elapsedSeconds || 0);
            setPhase(PHASE.SUCCESS);
            return;
          }
          const restoredTitle = authoritative?.current_title_snapshot || saved.currentTitle;
          const page = await fetchPageData(restoredTitle, { signal: request.signal });
          if (authoritative) await ensureWikiSnapshot(page);
          if (!pageRequestManagerRef.current.isCurrent(request.id)) return;

          setTarget({
            ...saved.target,
            title: authoritative?.target_title_snapshot || saved.target.title,
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
    prepareReservedGame,
  ]);

  const showRace =
    (phase === PHASE.PREPARING && isReservedSingle(serverRun) && Boolean(currentDocumentHtml)) ||
    phase === PHASE.PLAYING ||
    phase === PHASE.COUNTDOWN ||
    phase === PHASE.SUCCESS;

  // Phase 3 — 싱글은 가장 가벼운 race HUD. 본문이 주인공이고 HUD는 목표·현재·이동·경과·나가기만.
  return (
    <>
      {isPageLoading && <PageLoadingOverlay />}

      {/* SELECTING 단계의 로딩 UI / 폴백 */}
      {(phase === PHASE.SELECTING || phase === PHASE.PREPARING) && (
        <RaceFrame motion={moveMotion} mode="single" label="싱글 탐험">
          <RaceHud>
            <HudBrand mode="싱글" />
          </RaceHud>
          {(hasPresetMode || isLoading || phase === PHASE.PREPARING) && !error ? (
            <RaceHold kicker="SINGLE · 준비" title="위키 문서를 준비하는 중...">
              <p>목표 문서와 시작 문서를 불러오고 있습니다.</p>
            </RaceHold>
          ) : (
            <RaceHold kicker="SINGLE" title="게임을 설정할 수 없습니다.">
              {error && <p className="state-text error" role="alert">{error}</p>}
              <p>{phase === PHASE.PREPARING ? '준비 상태를 다시 확인하거나 로비로 돌아갈 수 있습니다.' : '메인 페이지로 이동합니다...'}</p>
              {phase === PHASE.PREPARING && <><button onClick={() => prepareReservedGame(loadLocalGameState())}>준비 다시 확인</button><button onClick={handleGiveUp}>로비로 돌아가기</button></>}
            </RaceHold>
          )}
        </RaceFrame>
      )}

      {/* 게임 진행 및 성공 화면 */}
      {showRace && (
        <div ref={preparedRootRef} className={phase === PHASE.COUNTDOWN || isReservedSingle(serverRun) && phase === PHASE.PREPARING ? 'wr-single-prefetch' : undefined}>
        <RaceFrame motion={moveMotion} mode="single" label="싱글 탐험" inert={phase === PHASE.SUCCESS || phase === PHASE.COUNTDOWN || isReservedSingle(serverRun) && phase !== PHASE.PLAYING}>
          <RaceHud>
            <HudBrand mode="싱글" sub={{ random: "랜덤", custom: "목표 지정", daily: "오늘의 코스" }[target.mode]} />
            <HudDoc kind="current" label="현재 문서" title={currentTitle} />
            <HudArrow />
            <HudDoc kind="goal" label="목표 문서" title={target.title} />
            <HudStatus />
            <HudStat label="이동" value={clickCount} />
            <HudTimer label="경과" seconds={elapsedSeconds} />
            <HudExit label="나가기" onClick={requestExit} disabled={phase !== PHASE.PLAYING} />
          </RaceHud>

          {error && <p className="state-text error" role="alert">{error}</p>}

          <div className="wr-race-body">
            <aside className="wr-race-side">
              <RouteRail path={pathTitles} currentTitle={currentTitle} />
            </aside>
            <main className="wr-race-main">
              <MobileRouteNotes path={pathTitles} startTitle={startTitle} />
              <WikiViewer
                target={{
                  ...target,
                  summary: target.summary || (targetBrief.title === target.title ? targetBrief.text : ""),
                  ...(!target.summary && target.title ? {
                    summaryStatus: targetBrief.title === target.title ? targetBrief.status : "loading",
                    onSummaryRetry: () => setTargetBriefRetry(value => value + 1),
                  } : {}),
                }}
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
                readOnly={isReservedSingle(serverRun) && phase !== PHASE.PLAYING}
              />
            </main>
          </div>

        </RaceFrame>
        </div>
      )}

      {/* 카운트다운 오버레이 */}
      {phase === PHASE.COUNTDOWN && isReservedSingle(serverRun) && (
        <SingleStartCinematic run={serverRun} getServerNow={reservedClockRef.current} recovered={restoredFromStorageRef.current} onDue={handleReservedDue} onCancel={handleGiveUp} />
      )}
      {phase === PHASE.COUNTDOWN && !isReservedSingle(serverRun) && (
        <LegacySingleStartCinematic onComplete={handleCountdownComplete} run={serverRun} startTitle={startTitle} targetTitle={target.title} onCancel={handleGiveUp} />
      )}

      {/* 결과 화면 — Phase 4 RESULT. 진입 흐름(handleWin)은 기존 그대로 */}
      {phase === PHASE.SUCCESS && (
        <SuccessOverlay
          runId={serverRun?.id ?? null}
          motionEligible={!resultRecoveredRef.current}
          startTitle={startTitle}
          targetTitle={target.title}
          elapsedSeconds={elapsedSeconds}
          clickCount={clickCount}
          pathTitles={pathTitles}
          isGuest={isGuestGame}
          onNewGame={handleChooseNewGame}
          onReturnToLobby={handleGiveUp}
        />
      )}

      {phase === PHASE.PLAYING && <ScrollToTopButton />}

      {exitDialog}
    </>
  );
}
