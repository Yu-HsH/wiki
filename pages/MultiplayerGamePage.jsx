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
  fetchPageSummary,
  normalizeTitle,
} from "../services/wikiService";
import { isAbortError } from "../utils/latestRequest";
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
import {
  DUEL_ITEM_EVENT_TYPE,
  DUEL_ITEM_RESULT,
  getDuelItem,
} from "../data/duelItems";
import {
  ensureDuelItemGrant,
  fetchDuelItemState,
  normalizeDuelItemEvent,
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

  /**
   * 화면 연출 상태만 남는다. **`immuneUntil`이 사라졌다** — 면역은 클라이언트가
   * 판정하던 것이고, 지금은 서버가 방어를 소진시켜 `result`로 답한다. `statusRef`도
   * 함께 사라진다: 그것을 읽던 곳이 면역 판정 둘뿐이었다.
   */
  const [status, setStatus] = useState({
    blind: false,
    translateCurrent: false,
  });

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

  /**
   * 마지막 RPC에서 잰 서버-클라이언트 시계 편차. `normalizeDuelItemEvent`가 알림의
   * 만료 시각을 내 시계로 옮길 때 쓴다. **없으면 보정하지 않는다** — 추정해서 틀리는
   * 것보다 낫고, 서비스의 `toClientTime`이 그렇게 굴러간다.
   */
  const clockSkewRef = useRef(null);

  /** 미리보기 창 하나에 붙는 취소 핸들. 창을 닫으면 진행 중인 요약이 전부 끊긴다. */
  const previewAbortRef = useRef(null);

  const applyDuelItemState = useCallback((itemState) => {
    clockSkewRef.current = itemState.clockSkewMs;
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

  /*
   * `emitRoomEvent`가 있던 자리다. 저장소에서 클라이언트가 `room_events`에 쓰는
   * **유일한 지점**이었고, 그 0건이 수용조건 ②이며 G2-② 창의 선행 조건이다
   * (`TRACKS.md` §7.4-③·§8-C).
   *
   * 지금은 `use_duel_item_v3`가 `security definer`로 알림 행을 넣는다. 브라우저는
   * **읽기만 한다** — 그래서 위조 행을 만들 자리가 없다.
   */

  /**
   * 시야 방해를 건다. **막을지 말지를 여기서 정하지 않는다** — 서버가 방어를 보고
   * `blocked`·`reflected`로 답하며, 이 함수는 `applied`가 온 뒤에만 불린다.
   *
   * 창을 서버가 준 만료 시각으로 연다. 카탈로그의 4초와 같은 값이지만, 둘이 갈라지면
   * **원장에 남은 쪽이 맞다.**
   */
  const applyBlind = (expiresAt = null) => {
    setStatus((prev) => ({
      ...prev,
      blind: true,
    }));

    const holdMs = expiresAt != null
      ? Math.max(0, expiresAt - Date.now())
      : getDuelItem("blind")?.duration ?? 4000;

    setTimeout(() => {
      setStatus((prev) => ({
        ...prev,
        blind: false,
      }));
    }, holdMs);
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
        clockSkewRef.current = granted.clockSkewMs;
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
  /**
   * 완주했는가. **어휘를 한 곳에만 둔다** — 아래 완주 상태값은 §2.3-⑥이 지키는 5값
   * 중 하나이고, 이동 경로와 아이템 경로가 각자 리터럴로 적으면 한쪽만 고쳐질 자리가
   * 생긴다. (그 불변식은 주석의 인용까지 세므로 여기에 값을 다시 적지도 않는다 — §1.)
   */
  const hasSolved = (row) =>
    row?.player_status === "finished" || row?.has_finished === true;

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
      const solved = hasSolved(updatedPlayer);
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

  /**
   * 아이템이 성공한 뒤의 동기화. **`applyDuelMoveV2`를 부르지 않는다** —
   * `use_duel_item_v3`가 `private.apply_duel_move_internal_v3`로 이동을 이미 끝냈고
   * (`current_page_id`·`current_title`·`move_count` 갱신과 `game_move_events` 행까지),
   * 여기서 다시 부르면 **한 번의 사용이 두 번 이동한다.**
   *
   * 그래서 이 함수는 서버가 준 권위 행을 화면에 반영하기만 한다. 아이템 ID로 갈라지지
   * 않는다 — 이동이 있었는지는 `player.current_title`이 말해 준다.
   */
  const applyMyAuthoritativeRow = async (me) => {
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

    if (hasSolved(me)) {
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

    await applyMyAuthoritativeRow(outcome.player);
  };

  /**
   * **맞은 쪽의 동기화.** 알림 행에는 내 진행이 실려 오지 않으므로 서버에서 다시 읽는다.
   *
   * 예전에는 맞은 쪽 클라이언트가 스스로 `applyDuelMoveV2`를 불러 이동했다 — 즉
   * 강제 이동의 실행자가 피해자 본인이었다. 지금은 `use_duel_item_v3`가 공격자의
   * 트랜잭션 안에서 이미 옮겼고, 여기서는 그 결과를 읽기만 한다.
   */
  const resyncFromServerMove = async () => {
    if (!roomId || !user?.id) return;
    try {
      const latestPlayers = await fetchRoomPlayers(roomId);
      setPlayers(latestPlayers);
      await applyMyAuthoritativeRow(
        latestPlayers.find((player) => player.user_id === user.id)
      );
    } catch (error) {
      console.error("duel item move resync failed:", error);
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

      previewAbortRef.current?.abort();
      previewAbortRef.current = new AbortController();

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
      clockSkewRef.current = outcome.clockSkewMs;

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
      } else if (outcome.result === DUEL_ITEM_RESULT.REFLECTED) {
        // 반사는 시전자에게 되돌아온다 — **내가 맞는다.** 서버는 이미 그렇게 기록했고
        // (`activeEffects`에 내 이름으로 남는다), 화면 연출만 여기서 맞춘다.
        if ((outcome.itemId || item.id) === "blind") {
          applyBlind(outcome.effectExpiresAt);
        }
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
   * 소진된 미리보기 수. **`entries`에서 매번 다시 센다** — 따로 든 카운터는 실패
   * 처리와 어긋나기 시작한다. `loading`은 예약이고 `ready`는 확정이며,
   * `unavailable`은 세지 않는다.
   */
  const countSpentPreviews = (entries) =>
    Object.values(entries || {}).filter(
      (entry) => entry?.status === "loading" || entry?.status === "ready"
    ).length;

  const closeLinkPreview = useCallback(() => {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setLinkPreview(null);
  }, []);

  /**
   * 부채 ① — 연결 문서 첫 문장 `[P7에서 닫음, 2026-09-04]`
   *
   * 확정 스펙 §5.5의 "첫 문장"은 `fetchPageSummary`의 `extract`다. **위키백과 REST를
   * 부르며 우리 Supabase가 아니다** — 새 RPC는 없다. P5가 컴포넌트에서 부르지 않은
   * 이유가 abort·중복요청을 컴포넌트가 갖게 되기 때문이었고, 그래서 그 셋을 이미
   * 들고 있는 이 화면으로 왔다.
   *
   * **횟수는 보여 준 것만 센다.** 6c가 `usedPreviews`를 올리지 않은 이유가 그것이었고
   * 여기서도 같다 — 요약을 못 가져오면 `unavailable`로 두고, 세는 대상에서 빠지므로
   * 횟수가 저절로 돌아온다. 이미 본 링크를 다시 눌러도 늘지 않는다.
   *
   * ⚠ 이 한도는 여전히 **클라이언트만 센다** — 부채 ②는 열려 있고 v4 범위다.
   */
  const handlePreviewLink = async (title) => {
    if (!title) return;

    // 진행 여부를 updater 안에서 정한다. 현재 상태를 안전하게 읽는 방법이 이것뿐이고,
    // updater 자체는 순수하다 (플래그는 한 방향으로만 켜진다).
    let shouldFetch = false;

    setLinkPreview((prev) => {
      if (!prev?.active) return prev;

      const existing = prev.entries[title];
      const alreadyHave =
        existing?.status === "ready" || existing?.status === "loading";
      const exhausted = countSpentPreviews(prev.entries) >= prev.maxPreviews;

      // 이미 가진 것과 한도 초과는 선택만 옮긴다. HUD도 막지만, 막는 쪽이 하나뿐이면
      // 그것이 틀렸을 때 한도가 사라진다.
      if (alreadyHave || exhausted) return { ...prev, selectedTitle: title };

      shouldFetch = true;
      const entries = { ...prev.entries, [title]: { status: "loading" } };
      return {
        ...prev,
        selectedTitle: title,
        entries,
        usedPreviews: countSpentPreviews(entries),
      };
    });

    if (!shouldFetch) return;

    const controller = previewAbortRef.current;

    const settle = (entry) => setLinkPreview((prev) => {
      // 창이 닫혔거나 다시 열렸으면 늦게 온 응답을 버린다.
      if (!prev?.active || prev.entries[title]?.status !== "loading") return prev;
      const entries = { ...prev.entries, [title]: entry };
      return { ...prev, entries, usedPreviews: countSpentPreviews(entries) };
    });

    try {
      const summary = await fetchPageSummary(title, { signal: controller?.signal });
      if (controller?.signal?.aborted) return;
      settle({
        status: "ready",
        extract: summary.extract || "",
        description: summary.description || "",
        thumbnailUrl: summary.thumbnailUrl || null,
      });
    } catch (error) {
      if (isAbortError(error)) return;
      console.error("link preview summary failed:", error);
      settle({ status: "unavailable" });
    }
  };

  const handleClosePreview = () => closeLinkPreview();

  /**
   * 15초 창이 끝나면 패널을 닫는다. HUD는 남은 시간을 그리기만 하므로, 0이 된 뒤에도
   * 부모가 닫지 않으면 만료된 패널이 화면에 남는다.
   */
  useEffect(() => {
    const expiresAt = linkPreview?.expiresAt;
    if (!expiresAt) return;

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      closeLinkPreview();
      return;
    }

    const timer = setTimeout(closeLinkPreview, remaining);
    return () => clearTimeout(timer);
  }, [linkPreview?.expiresAt, closeLinkPreview]);

  useEffect(() => () => previewAbortRef.current?.abort(), []);

  /**
   * 아이템 알림 하나. **아이템 ID로 갈라지지 않는다** — 서버가 대상 선정·차단·반사·
   * 이동을 이미 판정했고, 이 함수는 `result` 4값을 읽는다. 예전에는 여기서
   * `isImmune()`으로 클라이언트가 스스로 막았는데, 그러면 **두 화면이 서로 다른 판정을
   * 갖는다** — 서버는 적용, 내 화면은 방어. 지금은 판정이 하나다.
   */
  const handleDuelItemEvent = async (payload) => {
    const incoming = normalizeDuelItemEvent(payload, {
      skewMs: clockSkewRef.current,
    });
    if (!incoming) return;

    // 모르는 판정값은 서비스가 `null`로 준다 — `void`로 뭉개지 않는다. 새 판정값이
    // 생겼을 때 화면이 "아무 일도 없었다"로 조용히 구는 것을 막기 위해서다.
    // 그러면 연출은 건너뛰되 서버 상태는 다시 읽는다.
    if (incoming.result == null) {
      console.warn("알 수 없는 duel_item result:", payload?.result);
      await refreshDuelItemState();
      return;
    }

    const itemName = getDuelItem(incoming.itemId)?.name
      || incoming.itemId
      || "아이템";
    const iAmTarget = !!incoming.targetUserId && incoming.targetUserId === user?.id;

    switch (incoming.result) {
      case DUEL_ITEM_RESULT.APPLIED:
        if (iAmTarget) {
          if (incoming.itemId === "blind") applyBlind(incoming.effectExpiresAt);
          showMessage(`상대가 ${itemName}을(를) 사용했습니다!`);
        }
        break;

      case DUEL_ITEM_RESULT.BLOCKED:
        showMessage(
          iAmTarget
            ? `방어 성공! ${itemName}을(를) 막았습니다`
            : `상대가 ${itemName}을(를) 막았습니다`
        );
        break;

      case DUEL_ITEM_RESULT.REFLECTED:
        showMessage(
          iAmTarget
            ? `반사 성공! ${itemName}이(가) 되돌아갔습니다`
            : `${itemName}이(가) 반사됐습니다`
        );
        break;

      case DUEL_ITEM_RESULT.VOID:
        break;

      default:
        break;
    }

    // 이동은 서버가 이미 했다. 내 행이 움직였을 때만 화면을 맞춘다.
    if (incoming.moveEventId && iAmTarget) {
      await resyncFromServerMove();
    }

    // 지속효과·보호 대기·슬롯은 전부 서버 행에서 온다 — 봉인된 링크 목록도 여기 있다.
    await refreshDuelItemState();
  };

  const handleIncomingEvent = async (event) => {
    const eventType = event.event_type;
    const payload = event.payload || {};

    if (eventType === DUEL_ITEM_EVENT_TYPE) {
      await handleDuelItemEvent(payload);
      return;
    }

    /*
     * 아래 셋만 남는다. **미니게임은 이 버전에서 보내지 않지만 받기는 한다** —
     * 구버전 번들이 아직 그 이벤트를 쏠 수 있고, 받는 쪽이 없으면 상대 화면에서
     * 벌어진 일이 여기서는 `default` 로그로 조용히 사라진다 (Q5 조건, 판정 (c)).
     *
     * 표시 전용이다. 선택 버튼도 승패 판정도 없다 — 둘 다 발신 경로였다.
     */
    switch (eventType) {
      case "mini_game_start": {
        setMiniGame({
          gameId: payload.gameId,
          hostUserId: payload.hostUserId,
          status: "received",
          resultMessage: "",
        });

        showMessage("상대가 미니게임을 시작했습니다!");
        break;
      }

      case "mini_game_choice": {
        setMiniGame((prev) => (
          prev && prev.gameId === payload.gameId
            ? { ...prev, opponentChoice: payload.choice }
            : prev
        ));

        showMessage("상대가 선택을 완료했습니다!");
        break;
      }

      case "mini_game_reward": {
        if (isDisabledDuelItem({ id: payload.rewardId })) {
          console.warn("무시한 비활성화 SWAP 보상:", payload);
          return;
        }

        const rewardName =
          payload.rewardName ||
          ITEM_DEFS.find((item) => item.id === payload.rewardId)?.name ||
          payload.rewardId ||
          "알 수 없는 아이템";

        setMiniGame((prev) => (
          prev && prev.gameId === payload.gameId
            ? {
              ...prev,
              status: "result",
              resultMessage: `상대의 [${rewardName}] 아이템이 발동됐습니다.`,
            }
            : prev
        ));

        showMessage(`상대 미니게임 보상: ${rewardName}`);
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
              immune={pendingDefenses.length > 0}
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
