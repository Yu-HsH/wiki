import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  fetchRoom,
  fetchRoomPlayers,
  updateMyGameProgress,
  updateGameRoomStatus,
  saveMatchHistory,
} from "../services/multiplayerService";

import {
  fetchDistinctRandomTitle,
  fetchPageData,
  normalizeTitle,
} from "../services/wikiService";

import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";

import CountdownOverlay from "../components/CountdownOverlay";
import ScrollToTopButton from "../components/ScrollToTopButton";
import WikiViewer from "../components/WikiViewer";
import VsIntroOverlay from "../components/VsIntroOverlay";

import ItemBar from "../components/ItemBar";
import EffectOverlay from "../components/EffectOverlay";
import { ITEM_DEFS } from "../data/items";
import { MULTI_ITEM_IDS } from "../data/itemPools";

import PageLoadingOverlay from "../components/PageLoadingOverlay";
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
  const [error, setError] = useState("");
  const [phase, setPhase] = useState(PHASE.LOADING);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(null);

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

  const saveLocalGameState = (patch = {}) => {
    if (!storageKey) return;

    const prev = JSON.parse(localStorage.getItem(storageKey) || "{}");

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...prev,
        ...patch,
        savedAt: Date.now(),
      })
    );
  };

  const loadLocalGameState = () => {
    if (!storageKey) return null;

    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  };

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
    if (!roomId || !supabase) return;

    const channel = supabase
      .channel(`game:${roomId}`)
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
          } catch (err) {
            console.error("game_rooms realtime refresh failed:", err);
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
          } catch (err) {
            console.error("room_players realtime refresh failed:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    const initGame = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);
        setError("");

        const saved = loadLocalGameState();

        const roomData = await fetchRoom(roomId);
        const playerData = await fetchRoomPlayers(roomId);

        setRoom(roomData);
        setPlayers(playerData);

        const me = playerData.find((p) => p.user_id === user.id);
        const opponent = playerData.find((p) => p.user_id !== user.id);

        if (!me || !opponent) {
          throw new Error("플레이어 정보를 찾지 못했습니다.");
        }

        if (!opponent.target_title) {
          throw new Error("상대 목표 문서가 설정되지 않았습니다.");
        }

        let currentTitle = me.current_title;

        if (!me.start_title || !me.current_title) {
          const excluded = new Set([normalizeTitle(opponent.target_title)]);
          const startTitle = await fetchDistinctRandomTitle(excluded);

          await updateMyGameProgress(roomId, user.id, {
            start_title: startTitle,
            current_title: startTitle,
            move_count: 0,
            has_finished: false,
            finished_at: null,
          });

          const refreshedPlayers = await fetchRoomPlayers(roomId);
          setPlayers(refreshedPlayers);

          const refreshedMe = refreshedPlayers.find((p) => p.user_id === user.id);

          if (!refreshedMe?.current_title) {
            throw new Error("시작 문서를 설정하지 못했습니다.");
          }

          currentTitle = refreshedMe.current_title;
        }

        const restoreTitle = saved?.currentTitle || currentTitle;

        setIsPageLoading(true);
        setIsLoading(true);

        const firstPage = await fetchPageData(restoreTitle);
        setPageData(firstPage);

        if (saved?.historyStack?.length > 0) {
          setHistoryStack(saved.historyStack);
        }

        if (saved?.inventory?.length > 0) {
          setInventory(saved.inventory);
        }

        setIsPageLoading(false);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "게임 초기화에 실패했습니다.");
      } finally {
        setPending(false);
      }
    };

    initGame();
  }, [roomId, user?.id]);

  useEffect(() => {
    if (!room || !myPlayer || !opponentPlayer) return;

    const bothInitialized =
      !!myPlayer.start_title &&
      !!myPlayer.current_title &&
      !!opponentPlayer.start_title &&
      !!opponentPlayer.current_title;

    if (!bothInitialized) return;

    if (room.status === "starting") {
      updateGameRoomStatus(roomId, { status: "playing" }).catch(console.error);
      return;
    }

    if (room.status === "playing" && phase === PHASE.LOADING) {
      const saved = loadLocalGameState();

      if (saved?.currentTitle || saved?.inventory?.length > 0) {
        setPhase(PHASE.PLAYING);
      } else {
        setPhase(PHASE.VS_INTRO);
      }
    }
  }, [room, myPlayer, opponentPlayer, roomId, phase]);

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
    if (!roomId || !user?.id || phase !== PHASE.PLAYING) return;

    try {
      setError("");
      setIsPageLoading(true);
      setIsLoading(true);

      let nextHistoryStack = historyStack;

      if (pageData?.title && pageData.title !== nextTitle) {
        nextHistoryStack = [...historyStack, pageData.title];
        setHistoryStack(nextHistoryStack);
      }

      setStatus((prev) => ({
        ...prev,
        translateCurrent: false,
      }));

      const nextPage = await fetchPageData(nextTitle);
      setPageData(nextPage);

      saveLocalGameState({
        currentTitle: nextPage.title,
        historyStack: nextHistoryStack,
      });

      const nextMoveCount = (myPlayer?.move_count || 0) + 1;

      await updateMyGameProgress(roomId, user.id, {
        current_title: nextPage.title,
        move_count: nextMoveCount,
      });

      const solved =
        normalizeTitle(nextPage.title) === normalizeTitle(myTargetTitle);

      if (solved) {
        const finishedAt = new Date().toISOString();
        const duration = startedAtRef.current
          ? Math.floor((Date.now() - startedAtRef.current) / 1000)
          : elapsedSeconds;
        saveMatchHistory({
          roomId,
          winnerUserId: user.id,
          loserUserId: opponentPlayer?.user_id,
          durationSeconds: duration,
          winnerStartTitle: myPlayer?.start_title,
          loserStartTitle: opponentPlayer?.start_title,
          winnerTargetTitle: myTargetTitle,
          loserTargetTitle: opponentTargetTitle
        });
        await updateMyGameProgress(roomId, user.id, {
          current_title: nextPage.title,
          move_count: nextMoveCount,
          has_finished: true,
          finished_at: finishedAt,
        });

        await updateGameRoomStatus(roomId, {
          status: "finished",
          finished_at: finishedAt,
        });

        setPhase(PHASE.SUCCESS);

        setTimeout(() => {
          navigate("/main");
        }, 2200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 이동에 실패했습니다.");
    } finally {
      setIsPageLoading(false);
      setIsLoading(false);
    }
  };

  const forceMoveByItem = async (nextTitle) => {
    if (!roomId || !user?.id) return;

    try {
      setError("");
      setIsPageLoading(true);
      setIsLoading(true);

      setStatus((prev) => ({
        ...prev,
        translateCurrent: false,
      }));

      const nextPage = await fetchPageData(nextTitle);
      setPageData(nextPage);

      saveLocalGameState({
        currentTitle: nextPage.title,
      });

      const nextMoveCount = (myPlayer?.move_count || 0) + 1;

      await updateMyGameProgress(roomId, user.id, {
        current_title: nextPage.title,
        move_count: nextMoveCount,
      });

      showMessage(`${nextPage.title} 문서로 이동했습니다.`);
    } catch (err) {
      console.error("아이템 강제 이동 실패:", err);
      setError(err instanceof Error ? err.message : "아이템 이동에 실패했습니다.");
    } finally {
      setIsPageLoading(false);
      setIsLoading(false);
    }
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

    const channel = supabase
      .channel(`room-events-${roomId}`)
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
      )
      .subscribe();

    return () => {
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

    if (!startedAtRef.current) {
      startedAtRef.current = Date.now();
    }

    const interval = setInterval(() => {
      if (!startedAtRef.current) return;
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

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

    setPhase(PHASE.OPPONENT_WIN);

    setTimeout(() => {
      navigate("/main");
    }, 2200);
  }, [opponentPlayer?.has_finished, myPlayer?.has_finished, navigate]);

  if (pending) {
    return (
      <div className="mp-game-page">
        {isPageLoading && <PageLoadingOverlay />}
        <div className="mp-game-loading">게임 준비 중...</div>
      </div>
    );
  }

  if (error && !pageData) {
    return (
      <div className="mp-game-page">
        <div className="mp-game-error">에러: {error}</div>
      </div>
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
        <CountdownOverlay onComplete={() => setPhase(PHASE.PLAYING)} />
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
