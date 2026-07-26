import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  fetchRoom,
  fetchRoomPlayers,
  updateGameRoomStatus,
  saveMatchHistory,
  initializeMyGameProgress,
  advanceMyGameProgress,
  leaveRoom,
} from "../services/multiplayerService";

import {
  fetchDistinctRandomTitle,
  fetchPageData,
  normalizeTitle,
} from "../services/wikiService";

import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";
import { trackEvent } from "../services/analyticsService";

import CountdownOverlay from "../components/CountdownOverlay";
import ScrollToTopButton from "../components/ScrollToTopButton";
import WikiViewer from "../components/WikiViewer";
import VsIntroOverlay from "../components/VsIntroOverlay";

import ItemBar from "../components/ItemBar";
import EffectOverlay from "../components/EffectOverlay";
import { ITEM_DEFS } from "../data/items";
import { MULTI_ITEM_IDS } from "../data/itemPools";

import PageLoadingOverlay from "../components/PageLoadingOverlay";
import OnlineGameRecoveryPanel from "../components/OnlineGameRecoveryPanel";
import {
  elapsedSecondsFromServer,
  normalizeOnlineGameError,
  retryRecoverable,
  validateDuelGameSession,
} from "../utils/onlineGameSession";
export default function MultiplayerGamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const PHASE = {
    LOADING: "LOADING",
    VS_INTRO: "VS_INTRO",
    COUNTDOWN: "COUNTDOWN",
    PLAYING: "PLAYING",
    SUCCESS: "SUCCESS",
    OPPONENT_WIN: "OPPONENT_WIN",
  };

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pageData, setPageData] = useState(null);
  const pageDataRef = useRef(null);

  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  const [pending, setPending] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recovery, setRecovery] = useState({
    mode: "recovering",
    message: "서버에서 현재 게임 상태를 확인하고 있습니다.",
  });
  const [leaving, setLeaving] = useState(false);
  const [phase, setPhase] = useState(PHASE.LOADING);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(null);
  const playStartTrackedRef = useRef(false);
  const recoveryGenerationRef = useRef(0);
  const recoverGameRef = useRef(null);
  const gameChannelRef = useRef(null);
  const eventChannelRef = useRef(null);
  const moveInFlightRef = useRef(false);
  const resultNavigationTimerRef = useRef(null);

  const myPlayer = useMemo(
    () => players.find((p) => p.user_id === user?.id),
    [players, user?.id]
  );

  const opponentPlayer = useMemo(
    () => players.find((p) => p.user_id !== user?.id),
    [players, user?.id]
  );

  const [status, setStatus] = useState({
    blind: false,
    immuneUntil: 0,
    translateCurrent: false,
  });

  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const [inventory, setInventory] = useState([]);
  const [highlightRequestId, setHighlightRequestId] = useState(0);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [historyStack, setHistoryStack] = useState([]);
  const [floatingMessage, setFloatingMessage] = useState("");
  const [miniGame, setMiniGame] = useState(null);

  const storageKey = user?.id && roomId
    ? `wiki-mp-game:${roomId}:${user.id}`
    : null;

  const saveLocalGameState = useCallback((patch = {}) => {
    if (!storageKey) return;

    let prev = {};
    try {
      prev = JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      localStorage.removeItem(storageKey);
    }

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...prev,
        ...patch,
        savedAt: Date.now(),
      })
    );
  }, [storageKey]);

  const loadLocalGameState = useCallback(() => {
    if (!storageKey) return null;

    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  }, [storageKey]);

  const clearLocalGameState = useCallback(() => {
    if (storageKey) localStorage.removeItem(storageKey);
  }, [storageKey]);

  const [itemCooldownUntil, setItemCooldownUntil] = useState(0);
  const [itemEffect, setItemEffect] = useState(null);

  const showItemEffect = (text) => {
    setItemEffect(text);
    setTimeout(() => setItemEffect(null), 1200);
  };
  const myTargetTitle = opponentPlayer?.target_title || "";
  const opponentTargetTitle = myPlayer?.target_title || "";

  const targetForViewer = useMemo(
    () => ({
      title: myTargetTitle || "목표 문서",
      summary: "",
      requestedKeyword: myTargetTitle || "",
    }),
    [myTargetTitle]
  );

  const showMessage = (message) => {
    setFloatingMessage(message);
    setTimeout(() => setFloatingMessage(""), 1800);
  };

  const isImmune = () => Date.now() < statusRef.current.immuneUntil;

  const emitRoomEvent = async (eventType, payload = {}) => {
    if (!roomId || !user?.id) return;

    const { error } = await supabase.from("room_events").insert({
      room_id: roomId,
      user_id: user.id,
      event_type: eventType,
      payload,
    });

    if (error) {
      console.error("room_events insert 실패:", error);
    }
  };

  const applyCleanse = () => {
    setStatus((prev) => ({
      ...prev,
      blind: false,
      translateCurrent: false,
      immuneUntil: Date.now() + 7000,
    }));

    showMessage("방어 활성화! 7초 동안 방해 효과 면역");
  };

  const applyBlind = () => {
    if (Date.now() < statusRef.current.immuneUntil) {
      showMessage("방어 성공! 시야방해를 막았습니다");
      console.log("면역 상태라 blind 무시");
      return;
    }

    setStatus((prev) => ({
      ...prev,
      blind: true,
    }));

    setTimeout(() => {
      setStatus((prev) => ({
        ...prev,
        blind: false,
      }));
    }, 4000);
  };

  useEffect(() => {
    if (!roomId || !user?.id || !supabase) return;

    if (gameChannelRef.current) {
      const previousChannel = gameChannelRef.current;
      gameChannelRef.current = null;
      supabase.removeChannel(previousChannel);
    }

    const channel = supabase
      .channel(`game:${roomId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_rooms",
          filter: `id=eq.${roomId}`,
        },
        async () => {
          try {
            const latestRoom = await fetchRoom(roomId);
            setRoom(latestRoom);
            if (latestRoom.status === "finished") {
              recoverGameRef.current?.();
            }
          } catch (err) {
            console.error("game_rooms realtime refresh failed:", err);
            recoverGameRef.current?.();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          try {
            const latestPlayers = await fetchRoomPlayers(roomId);
            setPlayers(latestPlayers);
            const latestMe = latestPlayers.find((player) => player.user_id === user.id);
            const participantStatus = String(
              latestMe?.status || latestMe?.participant_status || ""
            ).toLowerCase();
            if (
              !latestMe ||
              latestMe.is_active === false ||
              latestMe.left_at ||
              latestMe.kicked_at ||
              ["kicked", "left", "removed", "banned"].includes(participantStatus)
            ) {
              recoverGameRef.current?.();
            }
          } catch (err) {
            console.error("room_players realtime refresh failed:", err);
            recoverGameRef.current?.();
          }
        }
      );

    gameChannelRef.current = channel;
    channel.subscribe((status, error) => {
      if (gameChannelRef.current !== channel) return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.error("duel realtime disconnected:", status, error);
        setPending(false);
        setPhase(PHASE.LOADING);
        setRecovery({
          mode: "retryable",
          message: "실시간 연결이 끊겼습니다. 서버 상태를 다시 확인해 주세요.",
        });
      }
    });

    return () => {
      if (gameChannelRef.current === channel) gameChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id]);

  const recoverGame = useCallback(async () => {
    if (!roomId || !user?.id) return;

    const generation = recoveryGenerationRef.current + 1;
    recoveryGenerationRef.current = generation;
    setPending(true);
    setPhase(PHASE.LOADING);
    setIsPageLoading(true);
    setRecovery({
      mode: "recovering",
      message: "서버에서 참가 상태와 현재 문서를 다시 확인하고 있습니다.",
    });

    try {
      const restored = await retryRecoverable(
        async () => {
          let [roomData, playerData] = await Promise.all([
            fetchRoom(roomId),
            fetchRoomPlayers(roomId),
          ]);

          let session = validateDuelGameSession({
            room: roomData,
            players: playerData,
            userId: user.id,
          });

          if (session.outcome === "finished") return { session, page: null };

          if (!session.me.start_title || !session.me.current_title) {
            const excluded = new Set([normalizeTitle(session.opponent.target_title)]);
            const startTitle = await fetchDistinctRandomTitle(excluded);
            await initializeMyGameProgress(roomId, user.id, startTitle);
            playerData = await fetchRoomPlayers(roomId);
            session = validateDuelGameSession({
              room: roomData,
              players: playerData,
              userId: user.id,
            });
          }

          const page = await fetchPageData(session.currentTitle);
          return { session, page };
        },
        {
          attempts: 3,
          delays: [500, 1200],
          fallbackMessage: "일시적으로 서버 또는 문서 API에 연결할 수 없습니다.",
        }
      );

      if (recoveryGenerationRef.current !== generation) return;

      const { session, page } = restored;
      setRoom(session.room);
      setPlayers(session.players);

      if (session.outcome === "finished") {
        clearLocalGameState();
        setPageData(null);
        setRecovery({
          mode: "fatal",
          message: session.me?.has_finished
            ? "이미 완료한 게임입니다. 온라인 플레이에서 새 게임을 시작해 주세요."
            : "이미 종료된 게임입니다. 이전 문서 화면으로 다시 들어갈 수 없습니다.",
        });
        return;
      }

      const saved = loadLocalGameState();
      const serverPath = Array.isArray(session.me.path_titles)
        ? session.me.path_titles.filter(Boolean)
        : [];
      const normalizedPath = serverPath.length > 0
        ? serverPath
        : [session.me.start_title, session.currentTitle].filter(
          (title, index, values) => title && values.indexOf(title) === index
        );

      setPageData(page);
      setHistoryStack(normalizedPath.slice(0, -1));
      setElapsedSeconds(session.elapsedSeconds);
      startedAtRef.current = session.room.started_at
        ? Date.parse(session.room.started_at)
        : Date.now() - session.elapsedSeconds * 1000;
      playStartTrackedRef.current = saved?.enteredPlaying === true;

      if (saved?.inventory?.length > 0) setInventory(saved.inventory);

      saveLocalGameState({
        currentTitle: session.currentTitle,
        pathTitles: normalizedPath,
        historyStack: normalizedPath.slice(0, -1),
        clickCount: session.moveCount,
        enteredPlaying: saved?.enteredPlaying === true || session.room.status === "playing",
      });

      setRecovery(null);
      setPhase(session.room.status === "playing" ? PHASE.PLAYING : PHASE.LOADING);
    } catch (error) {
      if (recoveryGenerationRef.current !== generation) return;
      const normalized = normalizeOnlineGameError(
        error,
        "일시적으로 게임 연결을 복구하지 못했습니다."
      );
      console.error("duel game recovery failed:", normalized.cause || error);
      if (!normalized.recoverable) clearLocalGameState();
      setRecovery({
        mode: normalized.recoverable ? "retryable" : "fatal",
        message: normalized.message,
      });
    } finally {
      if (recoveryGenerationRef.current === generation) {
        setPending(false);
        setIsPageLoading(false);
        setIsLoading(false);
      }
    }
  }, [
    roomId,
    user?.id,
    clearLocalGameState,
    loadLocalGameState,
    saveLocalGameState,
  ]);

  recoverGameRef.current = recoverGame;

  useEffect(() => {
    recoverGame();
    return () => {
      recoveryGenerationRef.current += 1;
    };
  }, [recoverGame]);

  useEffect(() => {
    const handleReconnectOpportunity = () => recoverGame();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") recoverGame();
    };

    window.addEventListener("online", handleReconnectOpportunity);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleReconnectOpportunity);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [recoverGame]);

  useEffect(() => {
    if (!room || !myPlayer || !opponentPlayer) return;

    const bothInitialized =
      !!myPlayer.start_title &&
      !!myPlayer.current_title &&
      !!opponentPlayer.start_title &&
      !!opponentPlayer.current_title;

    if (!bothInitialized) return;

    if (room.status === "starting") {
      updateGameRoomStatus(
        roomId,
        { status: "playing" },
        { expectedStatus: "starting" }
      )
        .then((latestRoom) => setRoom(latestRoom))
        .catch((error) => {
          console.error("duel start transition failed:", error);
          recoverGameRef.current?.();
        });
      return;
    }

    if (room.status === "playing" && phase === PHASE.LOADING) {
      const saved = loadLocalGameState();

      if (saved?.enteredPlaying === true) {
        setPhase(PHASE.PLAYING);
      } else {
        setPhase(PHASE.VS_INTRO);
      }
    }
  }, [room, myPlayer, opponentPlayer, roomId, phase, loadLocalGameState]);

  useEffect(() => {
    if (phase !== PHASE.COUNTDOWN) return;
    const saved = loadLocalGameState();
    if (saved?.inventory?.length > 0) {
      setInventory(saved.inventory);
      return;
    }

    const pool = ITEM_DEFS.filter((item) =>
      MULTI_ITEM_IDS.includes(item.id)
    );

    const joker = pool.filter((item) => item.category === "joker");
    const rareOnly = pool.filter(
      (item) => item.rarity === "rare" && item.category !== "joker"
    );
    const normalOnly = pool.filter(
      (item) => item.rarity !== "rare" && item.category !== "joker"
    );

    const pick = (arr, count) => {
      const copy = [...arr];
      const result = [];

      while (copy.length && result.length < count) {
        const idx = Math.floor(Math.random() * copy.length);
        result.push(copy.splice(idx, 1)[0]);
      }

      return result;
    };

    const selected = [
      ...pick(joker, 1),
      ...pick(rareOnly, 1),
      ...pick(normalOnly, 3),
    ].map((item, index) => ({
      ...item,
      instanceId: `${item.id}-${Date.now()}-${index}`,
      used: false,
    }));

    console.log("선택된 아이템:", selected.map((i) => i.id));


    setInventory(selected);

    saveLocalGameState({
      inventory: selected,
    });
  }, [phase]);

  const markUsed = (instanceId) => {
    setInventory((prev) => {
      const next = prev.map((item) =>
        item.instanceId === instanceId ? { ...item, used: true } : item
      );

      saveLocalGameState({
        inventory: next,
      });

      return next;
    });
  };
  const canUseItem = (item) => {
    if (!item || item.used) return false;

    if (Date.now() < itemCooldownUntil) {
      return false;
    }

    if (item.useCondition === "has_links") {
      return pageData?.links?.length > 0;
    }

    if (item.useCondition === "has_history") {
      return historyStack.length > 0;
    }

    return true;
  };

  const handleMove = async (nextTitle) => {
    if (
      !roomId ||
      !user?.id ||
      phase !== PHASE.PLAYING ||
      moveInFlightRef.current ||
      myPlayer?.has_finished
    ) return false;

    moveInFlightRef.current = true;
    try {
      setIsPageLoading(true);
      setIsLoading(true);

      setStatus((prev) => ({
        ...prev,
        translateCurrent: false,
      }));

      const nextPage = await fetchPageData(nextTitle);
      if (normalizeTitle(nextPage.title) === normalizeTitle(pageData?.title || "")) {
        return false;
      }

      const nextMoveCount = (myPlayer?.move_count || 0) + 1;
      const solved =
        normalizeTitle(nextPage.title) === normalizeTitle(myTargetTitle);
      const nextPath = [...historyStack, pageData?.title, nextPage.title].filter(Boolean);
      const finishedAt = solved ? new Date().toISOString() : null;

      const updatedPlayer = await advanceMyGameProgress(roomId, user.id, {
        currentTitle: nextPage.title,
        moveCount: nextMoveCount,
        pathTitles: nextPath,
        expectedMoveCount: myPlayer?.move_count || 0,
        hasFinished: solved,
        finishedAt,
      });

      setPageData(nextPage);
      setHistoryStack(nextPath.slice(0, -1));
      setPlayers((prev) => prev.map((player) =>
        player.user_id === user.id ? updatedPlayer : player
      ));

      if (solved) {
        if (updatedPlayer.__alreadyApplied) {
          clearLocalGameState();
          recoverGameRef.current?.();
          return true;
        }

        const duration = room?.started_at
          ? elapsedSecondsFromServer(room.started_at)
          : elapsedSeconds;

        await saveMatchHistory({
          roomId,
          winnerUserId: user.id,
          loserUserId: opponentPlayer?.user_id,
          durationSeconds: duration,
          winnerStartTitle: myPlayer?.start_title,
          loserStartTitle: opponentPlayer?.start_title,
          winnerTargetTitle: myTargetTitle,
          loserTargetTitle: opponentTargetTitle
        });

        await updateGameRoomStatus(
          roomId,
          { status: "finished", finished_at: finishedAt },
          { expectedStatus: "playing" }
        );

        clearLocalGameState();
        setPhase(PHASE.SUCCESS);

        resultNavigationTimerRef.current = setTimeout(() => {
          navigate("/multiplayer", { replace: true });
        }, 2200);
      } else {
        saveLocalGameState({
          currentTitle: nextPage.title,
          pathTitles: nextPath,
          historyStack: nextPath.slice(0, -1),
          clickCount: nextMoveCount,
          enteredPlaying: true,
        });
      }
      return true;
    } catch (err) {
      const normalized = normalizeOnlineGameError(
        err,
        "문서 또는 진행 상태를 일시적으로 저장하지 못했습니다."
      );
      console.error("duel move failed:", normalized.cause || err);
      if (!normalized.recoverable) clearLocalGameState();
      setPhase(PHASE.LOADING);
      setRecovery({
        mode: normalized.recoverable ? "retryable" : "fatal",
        message: normalized.message,
      });
      return false;
    } finally {
      moveInFlightRef.current = false;
      setIsPageLoading(false);
      setIsLoading(false);
    }
  };

  const forceMoveByItem = async (nextTitle) => {
    const moved = await handleMove(nextTitle);
    if (moved) showMessage(`${nextTitle} 문서로 이동했습니다.`);
  };

  const decideRpsWinner = (myChoice, opponentChoice) => {
    if (myChoice === opponentChoice) return "draw";

    const winMap = {
      rock: "scissors",
      scissors: "paper",
      paper: "rock",
    };

    return winMap[myChoice] === opponentChoice ? "me" : "opponent";
  };

  const handleMiniGameChoice = async (choice) => {
    if (!miniGame) return;
    if (miniGame.myChoice) return;

    setMiniGame((prev) => ({
      ...prev,
      myChoice: choice,
    }));

    await emitRoomEvent("mini_game_choice", {
      gameId: miniGame.gameId,
      choice,
    });
  };

  const triggerRandomMiniGameReward = async () => {
    const rewardIds = [
      "blind",
      "random_link_move",
      "translate_current",
      "swap_current",
      "highlight_links",
      "search_once",
      "random_teleport",
      "cleanse_shield",
    ];

    const randomId = rewardIds[Math.floor(Math.random() * rewardIds.length)];
    const rewardItem = ITEM_DEFS.find((item) => item.id === randomId);
    const rewardName = rewardItem?.name || randomId;

    showMessage(`🎲 미니게임 보상: ${rewardName}`);

    switch (randomId) {
      case "blind":
        await emitRoomEvent("blind");
        break;

      case "random_link_move":
        await emitRoomEvent("random_link_move");
        break;

      case "translate_current":
        await emitRoomEvent("translate_current");
        break;

      case "swap_current":
        await emitRoomEvent("swap_current", {
          senderCurrentTitle: pageDataRef.current?.title,
        });

        if (opponentPlayer?.current_title) {
          await forceMoveByItem(opponentPlayer.current_title);
        }
        break;

      case "highlight_links":
        setHighlightRequestId((prev) => prev + 1);
        break;

      case "search_once":
        setSearchAvailable(true);
        break;

      case "random_teleport": {
        const randomTitle = await fetchDistinctRandomTitle(
          new Set([normalizeTitle(pageDataRef.current?.title)])
        );

        await forceMoveByItem(randomTitle);
        break;
      }

      case "cleanse_shield":
        applyCleanse();
        break;

      default:
        break;
    }
    await emitRoomEvent("mini_game_reward", {
      gameId: miniGame?.gameId,
      rewardId: randomId,
      rewardName,
    });
    return rewardName;
  };

  const handleUseItem = async (instanceId) => {
    const item = inventory.find((i) => i.instanceId === instanceId);
    if (!canUseItem(item)) return;

    setItemCooldownUntil(Date.now() + 2500);
    markUsed(instanceId);
    showItemEffect(item.name);

    switch (item.id) {
      case "blind":
        await emitRoomEvent("blind");
        showMessage("상대에게 시야 방해!");
        break;

      case "double_blind":
        applyBlind();
        await emitRoomEvent("double_blind");
        showMessage("서로 화면 가리기!");
        break;

      case "cleanse_shield":
        applyCleanse();
        showMessage("상태 해제 + 10초 면역");
        break;

      case "random_link_move":
        await emitRoomEvent("random_link_move");
        showMessage("상대 랜덤 이동!");
        break;

      case "highlight_links":
        setHighlightRequestId((prev) => prev + 1);
        showMessage("유망 링크 표시!");
        break;

      case "search_once":
        setSearchAvailable(true);
        showMessage("검색 1회 사용 가능");
        break;

      case "go_back": {
        const prevTitle = historyStack[historyStack.length - 1];
        if (!prevTitle) return;

        setHistoryStack((prev) => prev.slice(0, -1));
        await handleMove(prevTitle);
        showMessage("뒤로가기 사용");
        break;
      }

      case "random_teleport": {
        const randomTitle = await fetchDistinctRandomTitle(
          new Set([normalizeTitle(pageDataRef.current?.title)])
        );
        await forceMoveByItem(randomTitle);
        showMessage("랜덤 텔레포트!");
        break;
      }

      case "translate_current":
        await emitRoomEvent("translate_current");
        showMessage("상대 현재 문서 언어 방해!");
        break;

      case "swap_current":
        await emitRoomEvent("swap_current", {
          senderCurrentTitle: pageDataRef.current?.title,
        });

        if (opponentPlayer?.current_title) {
          await forceMoveByItem(opponentPlayer.current_title);
        }

        showMessage("현재 문서 서로 교환!");
        break;

      case "mini_game": {
        const gameId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;

        setMiniGame({
          gameId,
          hostUserId: user.id,
          myChoice: null,
          opponentChoice: null,
          status: "choosing",
          resultMessage: "",
        });

        await emitRoomEvent("mini_game_start", {
          gameId,
          hostUserId: user.id,
        });

        showMessage("미니게임 시작!");
        break;
      }

      default:
        showMessage(`${item.name} 사용`);
    }
  };

  const handleIncomingEvent = async (event) => {
    console.log("받은 room_event:", event);

    const eventType = event.event_type;
    const payload = event.payload || {};

    switch (eventType) {
      case "blind":
        if (isImmune()) {
          showMessage("방어 성공! 시야방해를 막았습니다");
          console.log("blind 방어됨");
          return;
        }

        applyBlind();
        break;

      case "double_blind":
        if (isImmune()) {
          showMessage("방어 성공! 시야방해를 막았습니다");
          return;
        }

        applyBlind();
        break;

      case "translate_current":
        if (isImmune()) {
          showMessage("방어 성공! 언어 변경을 막았습니다");
          console.log("translate_current 방어됨");
          return;
        }

        setStatus((prev) => ({
          ...prev,
          translateCurrent: true,
        }));

        showMessage("상대가 언어 변경을 사용했습니다!");
        break;

      case "swap_current":
        console.log("swap_current 처리 진입:", payload);

        if (isImmune()) {
          showMessage("방어 성공! 현재 문서 교환을 막았습니다");
          return;
        }

        if (!payload.senderCurrentTitle) {
          console.log("senderCurrentTitle 없음");
          return;
        }

        console.log("상대 문서로 이동 시도:", payload.senderCurrentTitle);

        await forceMoveByItem(payload.senderCurrentTitle);

        showMessage("상대와 현재 문서를 교환했습니다!");
        break;

      case "random_link_move": {
        console.log("random_link_move 수신");

        if (isImmune()) {
          showMessage("방어 성공! 랜덤 이동을 막았습니다");
          return;
        }

        const currentPageData = pageDataRef.current;
        const links = currentPageData?.links || [];

        console.log("현재 pageDataRef:", currentPageData);
        console.log("현재 링크 개수:", links.length);

        if (!links.length) {
          console.log("이동할 링크 없음");
          showMessage("이동 가능한 링크가 없습니다");
          return;
        }

        const random = links[Math.floor(Math.random() * links.length)];

        console.log("랜덤 이동 대상:", random);

        await forceMoveByItem(random);

        showMessage(`🌀 상대 아이템! ${random}로 이동`);
        break;
      }

      case "mini_game_start": {
        setMiniGame({
          gameId: payload.gameId,
          hostUserId: payload.hostUserId,
          myChoice: null,
          opponentChoice: null,
          status: "choosing",
          resultMessage: "",
        });

        showMessage("상대가 미니게임을 시작했습니다!");
        break;
      }

      case "mini_game_choice": {
        setMiniGame((prev) => {
          if (!prev || prev.gameId !== payload.gameId) return prev;

          return {
            ...prev,
            opponentChoice: payload.choice,
          };
        });

        showMessage("상대가 선택을 완료했습니다!");
        break;
      }
      case "mini_game_reward": {
        console.log("mini_game_reward 수신:", payload);

        const rewardName =
          payload.rewardName ||
          ITEM_DEFS.find((item) => item.id === payload.rewardId)?.name ||
          payload.rewardId ||
          "알 수 없는 아이템";

        setMiniGame((prev) => {
          if (!prev || prev.gameId !== payload.gameId) return prev;

          return {
            ...prev,
            status: "result",
            resultMessage: `패배! 상대의 [${rewardName}] 아이템이 발동됐습니다.`,
          };
        });

        showMessage(`상대 미니게임 보상: ${rewardName}`);

        setTimeout(() => setMiniGame(null), 2200);
        break;
      }

      default:
        console.log("처리되지 않은 이벤트:", eventType);
        break;
    }
  };

  useEffect(() => {
    if (!roomId || !user?.id) return;

    if (eventChannelRef.current) {
      const previousChannel = eventChannelRef.current;
      eventChannelRef.current = null;
      supabase.removeChannel(previousChannel);
    }

    const channel = supabase
      .channel(`room-events-${roomId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_events",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const event = payload.new;

          if (event.user_id === user?.id) return;

          handleIncomingEvent(event);
        }
      );

    eventChannelRef.current = channel;
    channel.subscribe((status, error) => {
      if (eventChannelRef.current !== channel) return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.error("duel event realtime disconnected:", status, error);
        setPending(false);
        setPhase(PHASE.LOADING);
        setRecovery({
          mode: "retryable",
          message: "상대 상태 연결이 끊겼습니다. 서버 상태를 다시 확인해 주세요.",
        });
      }
    });

    return () => {
      if (eventChannelRef.current === channel) eventChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id]);

  useEffect(() => {
    if (phase !== PHASE.VS_INTRO) return;

    const timer = setTimeout(() => {
      setPhase(PHASE.COUNTDOWN);
    }, 5000);

    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.PLAYING) return;

    startedAtRef.current = room?.started_at
      ? Date.parse(room.started_at)
      : startedAtRef.current || Date.now();

    if (!playStartTrackedRef.current) {
      playStartTrackedRef.current = true;
      trackEvent("play_start", {
        user,
        mode: "1v1",
        roomId,
        targetTitle: myTargetTitle,
      });
    }

    const interval = setInterval(() => {
      if (!startedAtRef.current) return;
      setElapsedSeconds(room?.started_at
        ? elapsedSecondsFromServer(room.started_at)
        : Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, room?.started_at, roomId, myTargetTitle, user]);

  useEffect(() => {
    const resolveMiniGame = async () => {
      if (!miniGame) return;
      if (miniGame.status !== "choosing") return;
      if (!miniGame.myChoice || !miniGame.opponentChoice) return;

      const result = decideRpsWinner(
        miniGame.myChoice,
        miniGame.opponentChoice
      );

      if (result === "draw") {
        setMiniGame((prev) => ({
          ...prev,
          status: "result",
          resultMessage: "무승부! 아무 일도 일어나지 않았습니다.",
        }));

        setTimeout(() => setMiniGame(null), 1800);
        return;
      }

      if (result === "me") {
        const rewardName = await triggerRandomMiniGameReward();

        setMiniGame((prev) => ({
          ...prev,
          status: "result",
          resultMessage: `승리! [${rewardName}] 아이템이 발동됐습니다.`,
        }));

        setTimeout(() => setMiniGame(null), 2200);
        return;
      }

      // 패배한 쪽은 여기서 결과창을 확정하지 않음
      // 승자 쪽에서 보내는 mini_game_reward 이벤트를 기다림
      setMiniGame((prev) => ({
        ...prev,
        status: "waiting_reward",
        resultMessage: "패배... 상대 보상 아이템 확인 중입니다.",
      }));
    };

    resolveMiniGame();
  }, [miniGame]);

  useEffect(() => {
    if (!opponentPlayer?.has_finished) return;
    if (myPlayer?.has_finished) return;

    clearLocalGameState();
    setPhase(PHASE.OPPONENT_WIN);

    resultNavigationTimerRef.current = setTimeout(() => {
      navigate("/multiplayer", { replace: true });
    }, 2200);
  }, [
    opponentPlayer?.has_finished,
    myPlayer?.has_finished,
    navigate,
    clearLocalGameState,
  ]);

  useEffect(() => () => {
    if (resultNavigationTimerRef.current) {
      clearTimeout(resultNavigationTimerRef.current);
    }
  }, []);

  const handleReturnToLobby = async () => {
    if (leaving) return;
    setLeaving(true);
    recoveryGenerationRef.current += 1;
    clearLocalGameState();

    if (resultNavigationTimerRef.current) {
      clearTimeout(resultNavigationTimerRef.current);
    }

    const channels = [gameChannelRef.current, eventChannelRef.current].filter(Boolean);
    gameChannelRef.current = null;
    eventChannelRef.current = null;
    await Promise.all(channels.map((channel) => supabase.removeChannel(channel).catch(() => { })));

    const shouldNotifyServer =
      room &&
      ["starting", "playing"].includes(room.status) &&
      myPlayer &&
      !myPlayer.has_finished;

    try {
      if (shouldNotifyServer) await leaveRoom(roomId, user.id);
    } catch (error) {
      console.error("leave duel game failed:", error);
    } finally {
      navigate("/multiplayer", { replace: true });
    }
  };

  if (pending || recovery || phase === PHASE.LOADING) {
    return (
      <OnlineGameRecoveryPanel
        mode={recovery?.mode || "recovering"}
        message={recovery?.message}
        onRetry={recoverGame}
        onLeave={handleReturnToLobby}
        leaving={leaving}
      />
    );
  }

  return (
    <div className="mp-game-page">
      {isPageLoading && <PageLoadingOverlay />}
      {phase === PHASE.VS_INTRO && (
        <VsIntroOverlay
          myName={myPlayer?.nickname_snapshot || "나"}
          opponentName={opponentPlayer?.nickname_snapshot || "상대"}
          myTarget={myTargetTitle}
          opponentTarget={opponentTargetTitle}
          myInitial={(myPlayer?.nickname_snapshot || "나")
            .charAt(0)
            .toUpperCase()}
          opponentInitial={(opponentPlayer?.nickname_snapshot || "상대")
            .charAt(0)
            .toUpperCase()}
        />
      )}

      {phase === PHASE.COUNTDOWN && (
        <CountdownOverlay
          onComplete={() => {
            saveLocalGameState({ enteredPlaying: true });
            setPhase(PHASE.PLAYING);
          }}
        />
      )}

      <div className="mp-game-topbar">
        <div className="mp-game-goal">
          <span className="mp-game-goal-label">내 목표</span>
          <span className="mp-game-goal-value">{myTargetTitle || "..."}</span>
        </div>

        <div className="mp-game-status">
          {phase === PHASE.PLAYING && "레이스 진행 중"}
          {phase === PHASE.SUCCESS && "승리!"}
          {phase === PHASE.OPPONENT_WIN && "패배"}
        </div>
      </div>

      <div className="mp-game-layout">
        <div className="mp-game-main">
          <WikiViewer
            target={targetForViewer}
            currentTitle={pageData?.title || myPlayer?.current_title || ""}
            currentSummary={pageData?.summary || ""}
            currentDocumentHtml={pageData?.documentHtml || ""}
            links={pageData?.links || []}
            quickLinks={pageData?.quickLinks || []}
            isLoading={isLoading}
            elapsedSeconds={elapsedSeconds}
            clickCount={myPlayer?.move_count || 0}
            startTitle={myPlayer?.start_title || ""}
            onLinkClick={handleMove}
            blindActive={status.blind}
            highlightRequestId={highlightRequestId}
            searchAvailable={searchAvailable}
            onConsumeSearch={() => setSearchAvailable(false)}
            status={status}
          />
        </div>

        {phase === PHASE.PLAYING && (
          <>
            <ItemBar
              inventory={inventory}
              canUseItem={canUseItem}
              onUseItem={handleUseItem}
            />

            <EffectOverlay
              blindActive={status.blind}
              floatingMessage={floatingMessage}
              immune={Date.now() < status.immuneUntil}
            />
            {itemEffect && (
              <div className="item-effect-pop">
                <span>{itemEffect}</span>
              </div>
            )}
            {miniGame && (
              <div className="mini-game-overlay">
                <div className="mini-game-card">
                  <h2>🎲 미니게임</h2>
                  <p>가위바위보에서 이긴 사람이 랜덤 아이템을 발동합니다.</p>

                  {miniGame.status === "choosing" && (
                    <>
                      <div className="mini-game-buttons">
                        <button
                          type="button"
                          disabled={!!miniGame.myChoice}
                          onClick={() => handleMiniGameChoice("rock")}
                        >
                          ✊ 바위
                        </button>

                        <button
                          type="button"
                          disabled={!!miniGame.myChoice}
                          onClick={() => handleMiniGameChoice("scissors")}
                        >
                          ✌️ 가위
                        </button>

                        <button
                          type="button"
                          disabled={!!miniGame.myChoice}
                          onClick={() => handleMiniGameChoice("paper")}
                        >
                          ✋ 보
                        </button>
                      </div>

                      <div className="mini-game-status-text">
                        <p>내 선택: {miniGame.myChoice ? "완료" : "대기 중"}</p>
                        <p>
                          상대 선택:{" "}
                          {miniGame.opponentChoice ? "완료" : "대기 중"}
                        </p>
                      </div>
                    </>
                  )}

                  {(miniGame.status === "result" || miniGame.status === "waiting_reward") && (
                    <h3>{miniGame.resultMessage}</h3>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <aside className="mp-opponent-panel">
          <div className="mp-opponent-header">
            <div className="mp-opponent-avatar">
              {(opponentPlayer?.nickname_snapshot || "상대")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <div className="mp-opponent-name">
                {opponentPlayer?.nickname_snapshot || "상대"}
              </div>
              <div className="mp-opponent-sub">
                {opponentPlayer?.has_finished ? "도착 완료!" : "레이싱 중..."}
              </div>
            </div>
          </div>

          <div className="mp-opponent-box">
            <div className="mp-opponent-label">상대 목표</div>
            <div className="mp-opponent-value">
              {opponentTargetTitle || "설정 중..."}
            </div>
          </div>

          <div className="mp-opponent-box">
            <div className="mp-opponent-label">현재 문서</div>
            <div className="mp-opponent-value">
              {opponentPlayer?.current_title || "준비 중..."}
            </div>
          </div>

          <div className="mp-opponent-box">
            <div className="mp-opponent-label">이동 횟수</div>
            <div className="mp-opponent-value">
              {opponentPlayer?.move_count || 0}회
            </div>
          </div>
        </aside>
      </div>

      {phase === PHASE.SUCCESS && (
        <div className="mp-result-overlay">
          <div className="mp-result-card">
            <h2>🎉 승리!</h2>
            <p>목표 문서에 먼저 도착했습니다.</p>
          </div>
        </div>
      )}

      {phase === PHASE.OPPONENT_WIN && (
        <div className="mp-result-overlay">
          <div className="mp-result-card">
            <h2>😢 패배</h2>
            <p>상대가 먼저 목표 문서에 도착했습니다.</p>
          </div>
        </div>
      )}

      {pageData && <ScrollToTopButton />}
    </div>
  );
}
