import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  fetchRoom,
  fetchRoomPlayers,
  initializeMyGameProgress,
  applyDuelMoveV2,
  heartbeatDuel,
  finalizeDuelIfExpired,
  leaveRoom,
} from "../services/multiplayerService";

import {
  fetchPageData,
  normalizeTitle,
} from "../services/wikiService";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService";

import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";
import { trackEvent } from "../services/analyticsService";

import CountdownOverlay from "../components/CountdownOverlay";
import ScrollToTopButton from "../components/ScrollToTopButton";
import WikiViewer from "../components/WikiViewer";
import VsIntroOverlay from "../components/VsIntroOverlay";

import DuelItemBar from "../components/DuelItemBar";
import EffectOverlay from "../components/EffectOverlay";
import { ITEM_DEFS } from "../data/items";
import { isDisabledDuelItem } from "../data/itemPools";
import { DUEL_ITEM_RESULT } from "../data/duelItems";
import {
  ensureDuelItemGrant,
  fetchDuelItemState,
  useDuelItem,
} from "../services/duelItemService";

import PageLoadingOverlay from "../components/PageLoadingOverlay";
import OnlineGameRecoveryPanel from "../components/OnlineGameRecoveryPanel";
import {
  elapsedSecondsFromServer,
  normalizeOnlineGameError,
  retryRecoverable,
  validateDuelGameSession,
} from "../utils/onlineGameSession";
import {
  classifyRealtimeVersion,
  SERVER_HEARTBEAT_INTERVAL_MS,
} from "../utils/serverAuthority";
import { useExitGuard } from "../components/ExitGuard";

/**
 * 서버가 확정한 `result` 4값을 그대로 문구로 옮긴다. **클라이언트가 판정하지 않는다** —
 * 차단·반사는 상대의 방어를 서버가 소진시킨 결과이고, 이 화면은 그 결과를 읽는다.
 */
const DUEL_ITEM_RESULT_MESSAGE = Object.freeze({
  [DUEL_ITEM_RESULT.APPLIED]: "아이템이 적용됐습니다!",
  [DUEL_ITEM_RESULT.BLOCKED]: "상대가 막았습니다.",
  [DUEL_ITEM_RESULT.REFLECTED]: "반사됐습니다! 내가 대신 맞았습니다.",
  [DUEL_ITEM_RESULT.VOID]: "효과가 없었습니다.",
});

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
  const roomRef = useRef(null);
  const playersRef = useRef([]);

  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  useEffect(() => {
    roomRef.current = room;
    playersRef.current = players;
  }, [room, players]);

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

  /**
   * 서버가 준 아이템 상태. **어느 것도 localStorage에서 오지 않는다.**
   *
   * `useItems`의 초기값은 `true`다 — 아직 모른다는 뜻이고, 지급·복구 응답이 실제 값을
   * 덮는다. `false`로 시작하면 조회가 실패한 방을 "아이템을 쓰지 않는 경기"로
   * **거짓 표시**한다. 슬롯이 빈 것은 사실이지만 규칙이 다르다고 말하는 것은 거짓이다.
   */
  const [useItems, setUseItems] = useState(true);
  const [activeEffects, setActiveEffects] = useState([]);
  const [pendingDefenses, setPendingDefenses] = useState([]);

  /**
   * 응답을 기다리는 슬롯. 대기 중 HUD 전체가 잠긴다 — 낙관적으로 `used`를 칠하지
   * 않으므로, 두 번 누르는 것을 막는 것은 이 값뿐이다.
   */
  const [pendingGrantId, setPendingGrantId] = useState(null);

  /**
   * 실패 봉투를 **객체 그대로** 담는다. `DuelItemBar`가 봉투의 정체성으로 중복
   * `onRequestStateRefresh`를 막으므로, 매 렌더 새로 만들면 그 방어가 무력해진다.
   */
  const [itemFailure, setItemFailure] = useState(null);
  const [linkPreview, setLinkPreview] = useState(null);

  const applyDuelItemState = useCallback((itemState) => {
    setUseItems(itemState.useItems);
    setInventory(itemState.inventory);
    setItemCooldownUntil(itemState.cooldownUntil ?? 0);
    setActiveEffects(itemState.activeEffects);
    setPendingDefenses(itemState.pendingDefenses);
  }, []);

  /**
   * HUD가 `failure.refetchState`를 받았을 때 서버와 슬롯 관점을 맞추는 경로다.
   * **같은 실패 봉투로 두 번 불리지 않는다** — `DuelItemBar`가 봉투의 정체성으로 막는다.
   */
  const refreshDuelItemState = useCallback(async () => {
    if (!roomId) return;
    try {
      applyDuelItemState(await fetchDuelItemState(roomId));
    } catch (refreshError) {
      console.error("duel item state refresh failed:", refreshError);
    }
  }, [roomId, applyDuelItemState]);

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

  /*
   * `emitRoomEvent`가 있던 자리다. 저장소에서 클라이언트가 `room_events`에 쓰는
   * **유일한 지점**이었고, 그 0건이 수용조건 ②이며 G2-② 창의 선행 조건이다
   * (`TRACKS.md` §7.4-③·§8-C).
   *
   * 지금은 `use_duel_item_v3`가 `security definer`로 알림 행을 넣는다. 브라우저는
   * **읽기만 한다** — 그래서 위조 행을 만들 자리가 없다.
   */

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
        async (payload) => {
          const incoming = payload?.new?.state_version;
          const relation = incoming == null
            ? "next"
            : classifyRealtimeVersion(roomRef.current?.state_version, incoming);
          if (relation === "stale") return;
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
        async (payload) => {
          const incoming = payload?.new?.progress_version;
          const playerId = payload?.new?.user_id;
          const current = playersRef.current.find((player) => player.user_id === playerId);
          const relation = incoming == null
            ? "next"
            : classifyRealtimeVersion(current?.progress_version, incoming);
          if (relation === "stale") return;
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

          if (!session.me.start_page_id || !session.me.current_page_id) {
            await initializeMyGameProgress(roomId, user.id, null, {});
            playerData = await fetchRoomPlayers(roomId);
            session = validateDuelGameSession({
              room: roomData,
              players: playerData,
              userId: user.id,
            });
          }

          const page = await fetchPageData(session.currentTitle);
          await ensureWikiSnapshot(page);
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

      /**
       * 아이템 상태는 **서버가 권위다** — 쿨타임까지 서버 시각으로 온다.
       * localStorage에서 인벤토리를 되살리는 경로는 여기서 끝난다. 남은 키의
       * 이동 상태(`currentTitle`·`pathTitles`·`historyStack`·`clickCount`)는 그대로 쓴다.
       *
       * **실패해도 게임 복구를 실패시키지 않는다.** 세션은 이미 복구됐고, 아이템을
       * 못 읽은 것으로 화면을 되돌리면 못 읽은 쪽이 더 큰 것을 잃는다.
       */
      try {
        const itemState = await fetchDuelItemState(roomId);
        if (recoveryGenerationRef.current !== generation) return;
        applyDuelItemState(itemState);
      } catch (itemError) {
        console.error("duel item state recovery failed:", itemError);
      }

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
    applyDuelItemState,
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

    if (room.status === "starting") return;

    if (room.status === "playing" && phase === PHASE.LOADING) {
      const saved = loadLocalGameState();

      if (saved?.enteredPlaying === true) {
        setPhase(PHASE.PLAYING);
      } else {
        setPhase(PHASE.VS_INTRO);
      }
    }
  }, [room, myPlayer, opponentPlayer, roomId, phase, loadLocalGameState]);

  /**
   * 5슬롯 지급. **`ensure_duel_item_grant_v3`는 멱등이다** — 행이 이미 있으면 그대로
   * 읽어 온다. 그래서 카운트다운마다 불러도 되고, **F5로 새 아이템을 뽑을 수 없다.**
   * 클라이언트가 풀에서 직접 뽑던 경로(joker 1 · rare 1 · normal 3)는 여기서 끝난다.
   *
   * `use_items = false` 방은 **성공(`ok:true`)에 `ITEMS_DISABLED`** 로 온다 — 지급할
   * 것이 없는 정상 상태다. 그 값을 HUD에 내려 "아이템을 쓰지 않는 경기"를 그리게 한다.
   */
  useEffect(() => {
    if (phase !== PHASE.COUNTDOWN) return;
    if (!roomId) return;

    let cancelled = false;

    (async () => {
      try {
        const granted = await ensureDuelItemGrant(roomId);
        if (cancelled) return;
        setUseItems(granted.useItems);
        setInventory(granted.inventory);
        setItemCooldownUntil(granted.cooldownUntil ?? 0);
      } catch (grantError) {
        // 복구 경로와 같은 이유로 비치명이다 — 지급을 못 받은 것으로 카운트다운을
        // 막으면 경기가 시작되지 않는다. 복구·새로고침이 같은 행을 다시 읽는다.
        console.error("duel item grant failed:", grantError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, roomId]);

  /**
   * 완주 확정. **이동 경로와 아이템 경로가 같은 것을 쓴다** — 아이템이 강제한 이동도
   * 목표에 닿을 수 있고(`random_link_move`·`random_teleport`), 그때 화면이 성공으로
   * 가지 않으면 복구가 그것을 "이미 종료된 게임"으로 잡는다.
   *
   * 이 함수가 **로비 복귀 이동을 한 곳에 모은다** — 두 경로가 각자 부르면
   * §2.3의 3곳 불변식이 4곳이 된다. (그 불변식은 주석까지 세므로 여기에 그 호출을
   * 그대로 인용할 수도 없다. 인용 한 줄이 게이트를 깨는 것이 §1이 말하는 결함이다.)
   */
  const enterSolvedState = () => {
    clearLocalGameState();
    setPhase(PHASE.SUCCESS);

    resultNavigationTimerRef.current = setTimeout(() => {
      navigate("/multiplayer", { replace: true });
    }, 2200);
  };

  const handleMove = async (nextTitle, { eventType = "NORMAL_LINK" } = {}) => {
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

      const serverSelectedMove = ["FORCED_LINK", "RANDOM_TELEPORT"].includes(eventType);
      const nextPage = serverSelectedMove
        ? pageDataRef.current
        : await fetchPageData(nextTitle);
      await ensureWikiSnapshot(nextPage);
      if (!serverSelectedMove && eventType === "NORMAL_LINK"
        && normalizeTitle(nextPage.title) === normalizeTitle(pageData?.title || "")) {
        return false;
      }

      const moveResponse = await applyDuelMoveV2({
        roomId,
        expectedVersion: Number(myPlayer?.progress_version) || 0,
        nextPage,
        clickedRawTitle: nextTitle,
        eventType,
      });
      const updatedPlayer = moveResponse.player;
      const authoritativeTitle = updatedPlayer?.current_title || nextPage.title;
      const requestedPageId = String(nextPage?.pageId ?? "");
      const authoritativePageId = String(updatedPlayer?.current_page_id ?? "");
      const renderedPage = eventType === "NORMAL_LINK" && requestedPageId === authoritativePageId
        ? nextPage
        : await fetchPageData(authoritativeTitle);
      await ensureWikiSnapshot(renderedPage);
      const nextMoveCount = Number(updatedPlayer?.move_count) || 0;
      const nextPath = Array.isArray(updatedPlayer?.path_titles)
        ? updatedPlayer.path_titles
        : [...historyStack, pageData?.title, nextPage.title].filter(Boolean);
      const solved = updatedPlayer?.player_status === "finished" || updatedPlayer?.has_finished === true;
      if (moveResponse.room) setRoom(moveResponse.room);

      setPageData(renderedPage);
      setHistoryStack(nextPath.slice(0, -1));
      setPlayers((prev) => prev.map((player) =>
        player.user_id === user.id ? updatedPlayer : player
      ));

      if (solved) {
        enterSolvedState();
      } else {
        saveLocalGameState({
          currentTitle: renderedPage.title,
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

  const forceMoveByItem = async (nextTitle, eventType = "FORCED_LINK") => {
    const moved = await handleMove(nextTitle, { eventType });
    if (moved) showMessage(`${nextTitle || "서버가 선택한 문서"}로 이동했습니다.`);
  };

  /**
   * 아이템이 성공한 뒤의 동기화. **`applyDuelMoveV2`를 부르지 않는다** —
   * `use_duel_item_v3`가 `private.apply_duel_move_internal_v3`로 이동을 이미 끝냈고
   * (`current_page_id`·`current_title`·`move_count` 갱신과 `game_move_events` 행까지),
   * 여기서 다시 부르면 **한 번의 사용이 두 번 이동한다.**
   *
   * 그래서 이 함수는 서버가 준 권위 행을 화면에 반영하기만 한다. 아이템 ID로 갈라지지
   * 않는다 — 이동이 있었는지는 `player.current_title`이 말해 준다.
   */
  const syncAfterItemUse = async (outcome) => {
    if (outcome.room) setRoom(outcome.room);

    const authoritative = [outcome.player, outcome.opponent].filter(
      (row) => row?.user_id
    );
    if (authoritative.length > 0) {
      setPlayers((prev) => prev.map((player) => {
        const fresh = authoritative.find((row) => row.user_id === player.user_id);
        return fresh || player;
      }));
    }

    const me = outcome.player;
    if (!me?.user_id || me.user_id !== user?.id) return;

    const authoritativeTitle = me.current_title || "";
    const movedAway =
      !!authoritativeTitle &&
      normalizeTitle(authoritativeTitle) !==
        normalizeTitle(pageDataRef.current?.title || "");

    if (movedAway) {
      setIsPageLoading(true);
      setIsLoading(true);
      try {
        const renderedPage = await fetchPageData(authoritativeTitle);
        await ensureWikiSnapshot(renderedPage);
        setPageData(renderedPage);
        setStatus((prev) => ({ ...prev, translateCurrent: false }));
      } finally {
        setIsPageLoading(false);
        setIsLoading(false);
      }
    }

    const nextPath = Array.isArray(me.path_titles)
      ? me.path_titles.filter(Boolean)
      : [];
    if (nextPath.length > 0) setHistoryStack(nextPath.slice(0, -1));

    if (me.player_status === "finished" || me.has_finished === true) {
      enterSolvedState();
      return;
    }

    if (movedAway) {
      saveLocalGameState({
        currentTitle: authoritativeTitle,
        pathTitles: nextPath,
        historyStack: nextPath.slice(0, -1),
        clickCount: Number(me.move_count) || 0,
        enteredPlaying: true,
      });
    }
  };

  /**
   * 서버가 성공을 확정한 뒤에만 도는 **내 화면 쪽 연출**이다. 상대에게 걸리는 방해와
   * 방어 소진은 여기서 하지 않는다 — 전자는 상대 클라이언트가 수신 경로에서 받고,
   * 후자는 `pendingDefenses`로 서버에서 온다.
   */
  const applyLocalItemEffect = (item, outcome) => {
    if (item.id === "search_once") {
      setSearchAvailable(true);
      return;
    }

    if (item.id === "link_preview") {
      const censored = new Set(
        activeEffects
          .filter((effect) => effect.itemId === "link_censorship")
          .flatMap((effect) => effect.metadata?.censoredTitles || [])
          .map((title) => normalizeTitle(title))
      );

      setLinkPreview({
        active: true,
        expiresAt: outcome.effectExpiresAt,
        // `pageData.links`는 제목 문자열 배열이다 (`wikiService`의 `dedupeTitles`).
        candidates: (pageDataRef.current?.links || [])
          .filter(Boolean)
          .map((title) => ({
            title,
            censored: censored.has(normalizeTitle(title)),
          })),
        entries: {},
        selectedTitle: null,
        usedPreviews: 0,
        // 서버 권위가 없는 값이다 — 부채 ②. 카탈로그 정의에서 읽는다.
        maxPreviews: item.maxPreviews ?? 3,
      });
    }
  };

  /**
   * 아이템 한 번. **저장소에서 아이템을 쓰는 유일한 경로다.**
   *
   * 아이템 ID로 갈라지던 12분기가 사라졌다 — `use_duel_item_v3`가 대상 선정·차단·반사·
   * 이동을 전부 판정하고 `result` 4값으로 답한다. 클라이언트는 그 값을 읽는다.
   *
   * `DuelItemBar`가 넘기는 것은 **`grantId`** 다 (`instanceId`가 아니다 — `ItemBar`와
   * 다른 계약이다). 실패 12+3종은 throw가 아니라 봉투로 오므로 쿨타임 거부에
   * `try/catch`를 쓰지 않는다. **봉투는 state에 그대로 담는다** — 매 렌더 새 객체로
   * 만들면 `DuelItemBar`의 중복 조회 방어가 무력해져 거부 하나가 조회 폭풍이 된다.
   */
  const handleUseItem = async (grantId) => {
    if (!roomId || !grantId || pendingGrantId) return;

    const item = inventory.find((entry) => entry.grantId === grantId);
    if (!item) return;

    setPendingGrantId(grantId);
    setItemFailure(null);

    try {
      const outcome = await useDuelItem({ roomId, grantId });

      if (!outcome.ok) {
        setItemFailure(outcome.failure);
        return;
      }

      setItemCooldownUntil(outcome.cooldownUntil ?? 0);
      showItemEffect(item.name);
      showMessage(
        DUEL_ITEM_RESULT_MESSAGE[outcome.result] ||
        `${item.name} 사용`
      );

      if (outcome.result === DUEL_ITEM_RESULT.APPLIED) {
        applyLocalItemEffect(item, outcome);
      }

      await syncAfterItemUse(outcome);
      // 슬롯의 `used`와 지속효과·보호 대기는 서버 행에서만 온다. HUD는 낙관적으로
      // 칠하지 않으므로 응답 뒤에 새 상태를 내려 준다.
      await refreshDuelItemState();
    } catch (error) {
      // 여기까지 오는 것은 세션·호출 오류 6종과 전송 오류뿐이다 (경기 중 판정은 봉투다).
      console.error("duel item use failed:", error);
      showMessage(error?.message || "아이템을 사용하지 못했습니다.");
    } finally {
      setPendingGrantId(null);
    }
  };

  /**
   * ⚠ **부채 ① 미해결.** 확정 스펙 §5.5의 "연결 문서 첫 문장"은
   * `services/wikiService.js`의 `fetchPageSummary(title)`가 주는 `extract`이고 새 RPC가
   * 필요하지 않다. 여기서는 **선택만 기록하고 `entries`를 채우지 않는다** — 패널이
   * "요약 연결은 준비 중"을 그리는, 문서에 등재된 상태다 (`DuelItemBar.jsx` 머리말).
   *
   * **선택이 남은 횟수를 소진시키지 않는다.** `entries[title]`이 비어 있으면 HUD가
   * `seen`을 false로 보므로, 여기서 `usedPreviews`를 올리면 아무것도 못 보여 준 클릭이
   * 3회 제한을 깎는다. 요약을 실제로 가져오는 커밋이 그 카운트도 함께 가져간다.
   */
  const handlePreviewLink = (title) => {
    setLinkPreview((prev) => (prev ? { ...prev, selectedTitle: title } : prev));
  };

  const handleClosePreview = () => setLinkPreview(null);

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
        // A forged room_events row must not move or mutate this client.
        console.warn("무시한 비활성화 SWAP 이벤트:", payload);
        break;

      case "random_link_move": {
        console.log("random_link_move 수신");

        if (isImmune()) {
          showMessage("방어 성공! 랜덤 이동을 막았습니다");
          return;
        }

        const currentTitle = pageDataRef.current?.title;
        await forceMoveByItem(currentTitle, "FORCED_LINK");

        showMessage("🌀 상대 아이템! 서버가 유효한 링크를 선택했습니다.");
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

        if (isDisabledDuelItem({ id: payload.rewardId })) {
          console.warn("무시한 비활성화 SWAP 보상:", payload);
          return;
        }

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
    if (phase !== PHASE.PLAYING || !roomId || !user?.id) return undefined;

    const sendHeartbeat = async () => {
      try {
        const player = await heartbeatDuel(roomId);
        if (player) setPlayers((previous) => previous.map((item) =>
          item.user_id === user.id ? { ...item, ...player } : item
        ));
      } catch (error) {
        console.warn("duel heartbeat failed:", error);
      }
    };

    void sendHeartbeat();
    const interval = setInterval(sendHeartbeat, SERVER_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase, roomId, user?.id]);

  useEffect(() => {
    if (phase !== PHASE.PLAYING || !roomId || !user?.id) return undefined;

    // Finalization is deliberately decoupled from the local heartbeat. A
    // client must not refresh its own row and immediately classify the other
    // client as timed out in the same request turn.
    const interval = setInterval(async () => {
      try {
        const latestRoom = await finalizeDuelIfExpired(roomId);
        if (latestRoom?.status === "finished") recoverGameRef.current?.();
      } catch (error) {
        console.warn("duel timeout finalizer failed:", error);
      }
    }, SERVER_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase, roomId, user?.id]);

  /**
   * 미니게임은 이 창에서 **비활성이고 표시 전용이다** `[사용자 확정 (c), 2026-09-04]`.
   *
   * 예전에는 여기서 가위바위보 승패를 판정하고 이긴 쪽이 보상 아이템을 발동했다.
   * **그 둘이 전부 발신 경로였다** — 판정 결과를 `mini_game_reward`로 쏘고 보상을
   * `emitRoomEvent`로 쏘았다. 발신이 사라졌으므로 판정도 사라진다.
   *
   * 남은 일은 구버전 번들이 보낸 진행을 잠깐 보여 주고 스스로 닫는 것이다.
   */
  useEffect(() => {
    if (!miniGame) return;
    const timer = setTimeout(() => setMiniGame(null), 4000);
    return () => clearTimeout(timer);
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

    if (resultNavigationTimerRef.current) {
      clearTimeout(resultNavigationTimerRef.current);
    }

    const shouldNotifyServer =
      room &&
      ["starting", "playing"].includes(room.status) &&
      myPlayer &&
      !myPlayer.has_finished;

    try {
      if (shouldNotifyServer) await leaveRoom(roomId, user.id);

      // Keep the recovery snapshot until the authoritative leave succeeds.
      clearLocalGameState();
      const channels = [gameChannelRef.current, eventChannelRef.current].filter(Boolean);
      gameChannelRef.current = null;
      eventChannelRef.current = null;
      await Promise.all(channels.map((channel) => supabase.removeChannel(channel).catch(() => { })));
      navigate("/multiplayer", { replace: true });
    } catch (error) {
      console.error("leave duel game failed:", error);
      setLeaving(false);
      setRecovery({
        mode: "retryable",
        message: "게임 이탈을 서버에 확정하지 못했습니다. 현재 진행 상태를 유지합니다.",
      });
    }
  };

  const { requestExit, dialog: exitDialog } = useExitGuard({
    enabled:
      phase === PHASE.VS_INTRO ||
      phase === PHASE.COUNTDOWN ||
      phase === PHASE.PLAYING,
    onConfirm: handleReturnToLobby,
  });

  if (pending || recovery || phase === PHASE.LOADING) {
    return (
      <>
        <OnlineGameRecoveryPanel
          mode={recovery?.mode || "recovering"}
          message={recovery?.message}
          onRetry={recoverGame}
          onLeave={requestExit}
          leaving={leaving}
        />
        {exitDialog}
      </>
    );
  }

  return (
    <div className="mp-game-page">
      {exitDialog}
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
            <DuelItemBar
              inventory={inventory}
              useItems={useItems}
              phaseReady={room?.status === "playing" && !myPlayer?.has_finished}
              cooldownUntil={itemCooldownUntil || null}
              linkCount={pageData?.links?.length || 0}
              historyLength={historyStack.length}
              activeEffects={activeEffects}
              pendingDefenses={pendingDefenses}
              pendingGrantId={pendingGrantId}
              failure={itemFailure}
              linkPreview={linkPreview}
              onUseItem={handleUseItem}
              onDismissFailure={() => setItemFailure(null)}
              onRequestStateRefresh={refreshDuelItemState}
              onPreviewLink={handlePreviewLink}
              onClosePreview={handleClosePreview}
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
                  <p>
                    미니게임은 이 버전에서 비활성입니다. 구버전 상대가 보낸
                    진행만 표시합니다.
                  </p>
                  {miniGame.resultMessage && <h3>{miniGame.resultMessage}</h3>}
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
