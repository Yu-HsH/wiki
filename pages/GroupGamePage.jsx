import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";

import {
    fetchGroupRoom,
    fetchGroupRoomPlayers,
    applyGroupMoveV2,
    fetchGroupResults,
    activateGroupRoomGame,
    finalizeGroupRoomIfExpired,
    leaveGroupGame,
} from "../services/groupMultiplayerService";

import {
    fetchPageData,
    fetchPageSummary,
    formatDuration,
    normalizeTitle,
} from "../services/wikiService";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService";

import WikiViewer from "../components/WikiViewer";
import CountdownOverlay from "../components/CountdownOverlay";
import FloatingHud from "../components/FloatingHud";
import ScrollToTopButton from "../components/ScrollToTopButton";
import GroupPickOverlay from "../components/GroupPickOverlay";
import OnlineGameRecoveryPanel from "../components/OnlineGameRecoveryPanel";
import {
    elapsedSecondsFromServer,
    normalizeOnlineGameError,
    retryRecoverable,
    validateGroupGameSession,
} from "../utils/onlineGameSession";
import {
    buildGroupFinalStandings,
    canGroupPlayerMove,
    consumeGroupEntryMarker,
    getGroupLoadingState,
    getPendingGroupPlayers,
    getRestoredGroupPhase,
    GROUP_GAME_PHASE,
    isGroupPlayerFinished,
    isGroupPlayerInactive,
    resolveGroupEntry,
    shouldRetireGroupPlayer,
} from "../utils/groupGameFlow";
import {
    createTargetSummaryState,
    getTargetSummaryText,
    resolveGroupTargetTitle,
    TARGET_SUMMARY_STATUS,
} from "../utils/groupTargetSummary";
import {
    createLatestRequestManager,
    isAbortError,
} from "../utils/latestRequest";
import {
    createGroupFinalizerGate,
    getGroupActualEndAt,
    getGroupRemainingSeconds,
    isGroupRoomExpired,
} from "../utils/groupGameTimer";
import { formatGroupRetireReason } from "../utils/groupResultFormatter";
import { useExitGuard } from "../components/ExitGuard";
import { classifyRealtimeVersion } from "../utils/serverAuthority";

import { trackEvent } from "../services/analyticsService";

export default function GroupGamePage() {
    const { roomId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();

    const initialEntryRef = useRef(null);
    if (!initialEntryRef.current) {
        initialEntryRef.current = resolveGroupEntry({
            roomId,
            navigationState: location.state,
            storage: sessionStorage,
        });
    }

    const [phase, setPhase] = useState(initialEntryRef.current.phase);
    const [room, setRoom] = useState(null);
    const [players, setPlayers] = useState([]);
    const [results, setResults] = useState([]);

    const [target, setTarget] = useState({
        title: "",
        requestedKeyword: "",
        mode: "group",
        sourceRoomId: "",
    });
    const [targetSummary, setTargetSummary] = useState(createTargetSummaryState);
    const [targetSummaryRetryKey, setTargetSummaryRetryKey] = useState(0);

    const [startTitle, setStartTitle] = useState("");
    const [currentTitle, setCurrentTitle] = useState("");
    const [currentSummary, setCurrentSummary] = useState("");
    const [currentDocumentHtml, setCurrentDocumentHtml] = useState("");
    const [links, setLinks] = useState([]);
    const [quickLinks, setQuickLinks] = useState([]);
    const [pathTitles, setPathTitles] = useState([]);

    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [clickCount, setClickCount] = useState(0);
    const [finishResult, setFinishResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [recovery, setRecovery] = useState(() =>
        getGroupLoadingState(initialEntryRef.current.phase)
    );
    const [leaving, setLeaving] = useState(false);
    const [connectionVersion, setConnectionVersion] = useState(0);
    const [selectedSpectatorId, setSelectedSpectatorId] = useState(null);
    const roomRef = useRef(null);
    const playersRef = useRef([]);

    useEffect(() => {
        roomRef.current = room;
        playersRef.current = players;
    }, [room, players]);

    const timerRef = useRef(null);
    const finishedRef = useRef(false);
    const playStartTrackedRef = useRef(false);
    const activationInFlightRef = useRef(null);
    const activationCompletedRef = useRef(false);
    const finalizerGateRef = useRef(null);
    if (!finalizerGateRef.current) {
        finalizerGateRef.current = createGroupFinalizerGate();
    }
    const recoveryGenerationRef = useRef(0);
    const initialValidationCompletedRef = useRef(false);
    const realtimeChannelRef = useRef(null);
    const moveInFlightRef = useRef(false);
    const targetSummaryRequestRef = useRef(null);
    if (!targetSummaryRequestRef.current) {
        targetSummaryRequestRef.current = createLatestRequestManager();
    }

    const storageKey = user?.id && roomId
        ? `wiki-group-game-state:${roomId}:${user.id}`
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

    const myPlayer = useMemo(
        () => players.find((player) => player.user_id === user?.id),
        [players, user?.id]
    );

    const finishRankLimit = room?.finish_rank_limit ?? 3;
    const finishedPlayers = useMemo(
        () =>
            players
                .filter((player) =>
                    player.has_finished ||
                    player.player_status === "finished" ||
                    player.result_status === "finished"
                )
                .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
        [players]
    );

    const candidates = useMemo(() => {
        return players
            .map((player) => player.submitted_target_title)
            .filter(Boolean);
    }, [players]);
    const targetSummaryEnabled = [
        GROUP_GAME_PHASE.PICKING,
        GROUP_GAME_PHASE.COUNTDOWN,
        GROUP_GAME_PHASE.PLAYING,
    ].includes(phase);

    const syncServerTarget = useCallback((nextRoom, nextPlayers) => {
        const title = resolveGroupTargetTitle(nextRoom, nextPlayers);
        setTarget((previous) => {
            if (
                previous.sourceRoomId === roomId &&
                normalizeTitle(previous.title) === normalizeTitle(title)
            ) {
                return previous.title === title
                    ? previous
                    : { ...previous, title };
            }

            return {
                title,
                requestedKeyword: "",
                mode: "group",
                sourceRoomId: roomId,
            };
        });
    }, [roomId]);

    const checkWin = useCallback((pageTitle, targetTitle) => {
        return (
            pageTitle &&
            targetTitle &&
            normalizeTitle(pageTitle) === normalizeTitle(targetTitle)
        );
    }, []);

    const fetchGroupRoomSnapshot = useCallback(async () => {
        const [roomData, playerData] = await Promise.all([
            fetchGroupRoom(roomId),
            fetchGroupRoomPlayers(roomId),
        ]);

        return { room: roomData, players: playerData };
    }, [roomId]);

    const showFinalGroupRoom = useCallback(async (finishedRoom) => {
        const [latestPlayers, latestResults] = await Promise.all([
            fetchGroupRoomPlayers(roomId),
            fetchGroupResults(roomId),
        ]);

        setRoom(finishedRoom);
        setPlayers(latestPlayers);
        setResults(latestResults);
        setStartTitle(finishedRoom.group_start_title || "");
        syncServerTarget(finishedRoom, latestPlayers);
        setRemainingSeconds(0);
        finishedRef.current = true;
        saveLocalGameState({
            enteredPlaying: true,
            hasFinished: Boolean(
                latestPlayers.find((player) => player.user_id === user?.id)?.has_finished
            ),
            viewMode: "ended",
        });
        setRecovery(null);
        setPhase(GROUP_GAME_PHASE.ENDED);

        return finishedRoom;
    }, [
        roomId,
        saveLocalGameState,
        syncServerTarget,
        user?.id,
    ]);

    const finalizeExpiredRoom = useCallback(async (candidateRoom, { force = false } = {}) => {
        if (!roomId || !isGroupRoomExpired(candidateRoom)) return candidateRoom;

        const actualEndAt = getGroupActualEndAt(candidateRoom);
        const finalizerKey = [
            roomId,
            candidateRoom.status,
            actualEndAt?.getTime() || "invalid",
        ].join(":");
        const request = finalizerGateRef.current.run(
            finalizerKey,
            async () => {
                const finalizedRoom = await finalizeGroupRoomIfExpired(roomId);
                const latestRoom = finalizedRoom?.id
                    ? finalizedRoom
                    : await fetchGroupRoom(roomId);

                if (latestRoom.status === "finished") {
                    return showFinalGroupRoom(latestRoom);
                }

                setRoom(latestRoom);
                setRemainingSeconds(getGroupRemainingSeconds(latestRoom));
                return latestRoom;
            },
            { force }
        );

        if (!request) return candidateRoom;

        try {
            return await request;
        } catch (error) {
            const normalized = normalizeOnlineGameError(
                error,
                "경기 종료 상태를 서버에 반영하지 못했습니다."
            );
            console.error("group game finalization failed:", normalized.cause || error);
            setPhase(GROUP_GAME_PHASE.RECOVERING);
            setRecovery({
                mode: normalized.recoverable ? "retryable" : "fatal",
                message: normalized.message,
            });
            throw normalized;
        }
    }, [
        roomId,
        saveLocalGameState,
        showFinalGroupRoom,
    ]);

    const recoverGame = useCallback(async (entryPhase = GROUP_GAME_PHASE.RECOVERING) => {
        if (!roomId || !user?.id) return;

        setTarget((previous) => previous.sourceRoomId === roomId
            ? previous
            : {
                title: "",
                requestedKeyword: "",
                mode: "group",
                sourceRoomId: roomId,
            });

        const generation = recoveryGenerationRef.current + 1;
        recoveryGenerationRef.current = generation;
        const loadingState = getGroupLoadingState(entryPhase);
        setPhase(loadingState.phase);
        setRecovery({
            mode: loadingState.mode,
            message: loadingState.message,
        });

        try {
            const saved = loadLocalGameState() || {};
            if (saved.exited === true) {
                setPhase(GROUP_GAME_PHASE.FATAL_ERROR);
                setRecovery({
                    mode: "fatal",
                    message: "이미 게임 로비로 나간 세션입니다. 온라인 플레이에서 새 게임을 시작해 주세요.",
                });
                return;
            }

            const restored = await retryRecoverable(
                async () => {
                    let snapshot = await fetchGroupRoomSnapshot();

                    if (
                        isGroupRoomExpired(snapshot.room)
                    ) {
                        await finalizeExpiredRoom(snapshot.room, { force: true });
                        snapshot = await fetchGroupRoomSnapshot();
                    }

                    const session = validateGroupGameSession({
                        room: snapshot.room,
                        players: snapshot.players,
                        userId: user.id,
                    });

                    if (session.outcome !== "active") return { session, page: null };
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

            if (!initialValidationCompletedRef.current) {
                consumeGroupEntryMarker(initialEntryRef.current, sessionStorage);
                initialValidationCompletedRef.current = true;
            }

            const { session, page } = restored;
            setRoom(session.room);
            setPlayers(session.players);
            setStartTitle(session.room.group_start_title || "");
            syncServerTarget(session.room, session.players);

            if (["playing", "grace_period"].includes(session.room.status)) {
                activationCompletedRef.current = true;
            }

            if (session.outcome !== "active") {
                finishedRef.current = true;
                const latestResults = await fetchGroupResults(roomId).catch(() => []);
                if (recoveryGenerationRef.current !== generation) return;

                const restoredPhase = getRestoredGroupPhase(session, saved);
                setResults(latestResults);
                setSelectedSpectatorId(
                    getPendingGroupPlayers(session.players)[0]?.user_id || session.me.user_id
                );
                saveLocalGameState({
                    enteredPlaying: true,
                    hasFinished: Boolean(session.me.has_finished),
                    viewMode: restoredPhase === GROUP_GAME_PHASE.ENDED
                        ? "ended"
                        : saved.viewMode || "result",
                });
                setRecovery(null);
                setPhase(restoredPhase);
                setConnectionVersion((prev) => prev + 1);
                return;
            }

            const restoredPhase = getRestoredGroupPhase(session, saved);
            const enteredPlaying = restoredPhase === GROUP_GAME_PHASE.PLAYING;

            setCurrentTitle(page.title);
            setCurrentSummary(page.summary);
            setCurrentDocumentHtml(page.documentHtml);
            setLinks(page.links);
            setQuickLinks(page.quickLinks);
            setPathTitles(session.pathTitles);
            setClickCount(session.moveCount);
            setElapsedSeconds(session.elapsedSeconds);
            setRemainingSeconds(getGroupRemainingSeconds(session.room));
            finishedRef.current = false;
            playStartTrackedRef.current = enteredPlaying;

            saveLocalGameState({
                currentTitle: session.currentTitle,
                pathTitles: session.pathTitles,
                clickCount: session.moveCount,
                enteredPlaying,
            });

            setRecovery(null);
            setPhase(restoredPhase);
            setConnectionVersion((prev) => prev + 1);
        } catch (error) {
            if (recoveryGenerationRef.current !== generation) return;
            const normalized = normalizeOnlineGameError(
                error,
                "일시적으로 게임 연결을 복구하지 못했습니다."
            );
            console.error("group game recovery failed:", normalized.cause || error);

            if (!normalized.recoverable) {
                setPhase(GROUP_GAME_PHASE.FATAL_ERROR);
                clearLocalGameState();
            }
            setRecovery({
                mode: normalized.recoverable ? "retryable" : "fatal",
                message: normalized.message,
            });
        }
    }, [
        roomId,
        user?.id,
        fetchGroupRoomSnapshot,
        finalizeExpiredRoom,
        clearLocalGameState,
        loadLocalGameState,
        saveLocalGameState,
        syncServerTarget,
    ]);

    const refreshRoomState = useCallback(async () => {
        let snapshot = await fetchGroupRoomSnapshot();

        if (
            isGroupRoomExpired(snapshot.room)
        ) {
            const finalizedRoom = await finalizeExpiredRoom(snapshot.room);
            if (finalizedRoom?.status === "finished") return;
            snapshot = await fetchGroupRoomSnapshot();
        }

        const session = validateGroupGameSession({
            room: snapshot.room,
            players: snapshot.players,
            userId: user.id,
        });

        setRoom(session.room);
        setPlayers(session.players);
        syncServerTarget(session.room, session.players);

        const serverIsPlaying =
            session.outcome === "active" &&
            ["playing", "grace_period"].includes(session.room.status);

        if (serverIsPlaying) {
            // 다른 참가자가 먼저 활성화했거나 F5로 복구한 경우에도
            // 로컬 카운트다운을 다시 재생하지 않고 서버 상태를 따른다.
            activationCompletedRef.current = true;
            saveLocalGameState({ enteredPlaying: true });
            setRemainingSeconds(getGroupRemainingSeconds(session.room));
            setPhase((previous) => [
                GROUP_GAME_PHASE.PICKING,
                GROUP_GAME_PHASE.COUNTDOWN,
            ].includes(previous)
                ? GROUP_GAME_PHASE.PLAYING
                : previous);
        }

        if (session.outcome !== "active") {
            finishedRef.current = true;
            const latestResults = await fetchGroupResults(roomId).catch(() => []);
            setResults(latestResults);
            const restoredPhase = getRestoredGroupPhase(session, loadLocalGameState() || {});
            saveLocalGameState({
                enteredPlaying: true,
                hasFinished: Boolean(session.me.has_finished),
                viewMode: restoredPhase === GROUP_GAME_PHASE.ENDED
                    ? "ended"
                    : restoredPhase === GROUP_GAME_PHASE.SPECTATING
                        ? "spectating"
                        : "result",
            });
            setPhase(restoredPhase);
        }
    }, [
        roomId,
        fetchGroupRoomSnapshot,
        finalizeExpiredRoom,
        loadLocalGameState,
        saveLocalGameState,
        syncServerTarget,
        user?.id,
    ]);

    useEffect(() => {
        const entryPhase = initialValidationCompletedRef.current
            ? GROUP_GAME_PHASE.RECOVERING
            : initialEntryRef.current.phase;
        recoverGame(entryPhase);
        return () => {
            recoveryGenerationRef.current += 1;
        };
    }, [recoverGame]);

    useEffect(() => {
        const manager = targetSummaryRequestRef.current;
        const title = target.sourceRoomId === roomId ? target.title : "";

        if (!title || !targetSummaryEnabled) {
            manager.cancel();
            setTargetSummary(createTargetSummaryState());
            return undefined;
        }

        const request = manager.begin();
        setTargetSummary(createTargetSummaryState({
            status: TARGET_SUMMARY_STATUS.LOADING,
            requestedTitle: title,
        }));

        fetchPageSummary(title, { signal: request.signal })
            .then((summary) => {
                if (!manager.isCurrent(request.id)) return;

                const text = getTargetSummaryText(summary);
                setTargetSummary(createTargetSummaryState({
                    status: text
                        ? TARGET_SUMMARY_STATUS.SUCCESS
                        : TARGET_SUMMARY_STATUS.EMPTY,
                    requestedTitle: title,
                    canonicalTitle: summary.canonicalTitle || title,
                    text,
                }));
            })
            .catch((error) => {
                if (isAbortError(error) || !manager.isCurrent(request.id)) return;

                console.warn("group target summary failed:", error);
                setTargetSummary(createTargetSummaryState({
                    status: TARGET_SUMMARY_STATUS.ERROR,
                    requestedTitle: title,
                    error: error?.message || "목표 설명을 불러오지 못했습니다.",
                }));
            })
            .finally(() => {
                manager.complete(request.id);
            });

        return () => {
            if (manager.isCurrent(request.id)) manager.cancel();
        };
    }, [
        roomId,
        target.sourceRoomId,
        target.title,
        targetSummaryEnabled,
        targetSummaryRetryKey,
    ]);

    useEffect(() => () => {
        targetSummaryRequestRef.current?.cancel();
    }, []);

    useEffect(() => {
        if (!roomId || !user?.id || !supabase) return;

        if (realtimeChannelRef.current) {
            const previousChannel = realtimeChannelRef.current;
            realtimeChannelRef.current = null;
            supabase.removeChannel(previousChannel);
        }

        const channel = supabase
            .channel(`group-game:${roomId}:${user.id}`)
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
                        await refreshRoomState();
                    } catch (error) {
                        console.error("group game room refresh failed:", error);
                        recoverGame();
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
                        await refreshRoomState();
                    } catch (error) {
                        console.error("group game players refresh failed:", error);
                        recoverGame();
                    }
                }
            );

        realtimeChannelRef.current = channel;
        channel.subscribe((status, error) => {
            if (realtimeChannelRef.current !== channel) return;
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                console.error("group game realtime disconnected:", status, error);
                setPhase(GROUP_GAME_PHASE.RECOVERING);
                setRecovery({
                    mode: "retryable",
                    message: "실시간 연결이 끊겼습니다. 서버 상태를 다시 확인해 주세요.",
                });
            }
        });

        return () => {
            if (realtimeChannelRef.current === channel) {
                realtimeChannelRef.current = null;
            }
            supabase.removeChannel(channel);
        };
    }, [roomId, user?.id, refreshRoomState, recoverGame, connectionVersion]);

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
        if (timerRef.current) clearInterval(timerRef.current);
        if (phase !== GROUP_GAME_PHASE.PLAYING) return undefined;

        if (!playStartTrackedRef.current) {
            playStartTrackedRef.current = true;
            trackEvent("play_start", {
                user,
                mode: "group",
                roomId,
                targetTitle: target.title,
            });
        }

        const updateGroupTimer = () => {
            setRemainingSeconds(getGroupRemainingSeconds(room));
            if (isGroupRoomExpired(room)) {
                void finalizeExpiredRoom(room);
            }
        };

        updateGroupTimer();
        timerRef.current = setInterval(updateGroupTimer, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [phase, room, roomId, target.title, user, finalizeExpiredRoom]);

    useEffect(() => {
        if (phase !== GROUP_GAME_PHASE.SPECTATING) return;

        const pendingPlayers = getPendingGroupPlayers(players);
        const selectedStillPending = pendingPlayers.some(
            (player) => player.user_id === selectedSpectatorId
        );

        if (pendingPlayers.length > 0) {
            if (!selectedStillPending) {
                setSelectedSpectatorId(pendingPlayers[0].user_id);
            }
            return;
        }

        // A Realtime RETIRE update invalidates the current target. If no
        // pending participant remains, keep the active room in a safe empty
        // spectator state until the server publishes the final result.
        setSelectedSpectatorId(null);
        if (room?.status === "finished") {
            setPhase(GROUP_GAME_PHASE.ENDED);
        }
    }, [phase, players, room?.status, selectedSpectatorId]);

    const handleCountdownComplete = useCallback(async () => {
        if (!roomId || activationCompletedRef.current) return;
        if (activationInFlightRef.current) return activationInFlightRef.current;

        const activationPromise = (async () => {
            try {
                const activatedRoom = await activateGroupRoomGame(roomId);

                if (!["playing", "grace_period"].includes(activatedRoom?.status)) {
                    throw new Error("서버가 경기 활성화 상태를 반환하지 않았습니다.");
                }

                activationCompletedRef.current = true;
                setRoom((previous) => ({ ...previous, ...activatedRoom }));
                saveLocalGameState({ enteredPlaying: true });
                setRecovery(null);
                setPhase(GROUP_GAME_PHASE.PLAYING);
            } catch (error) {
                const normalized = normalizeOnlineGameError(
                    error,
                    "경기 시작 상태를 서버에 반영하지 못했습니다."
                );
                console.error("group game activation failed:", normalized.cause || error);
                setPhase(GROUP_GAME_PHASE.RECOVERING);
                setRecovery({
                    mode: normalized.recoverable ? "retryable" : "fatal",
                    message: normalized.message,
                });
            } finally {
                activationInFlightRef.current = null;
            }
        })();

        activationInFlightRef.current = activationPromise;
        return activationPromise;
    }, [roomId, saveLocalGameState]);

    const handleMove = async (nextTitle) => {
        if (!canGroupPlayerMove({
            phase,
            isLoading,
            moveInFlight: moveInFlightRef.current,
            hasFinished: finishedRef.current || myPlayer?.has_finished,
        })) return;

        moveInFlightRef.current = true;
        setIsLoading(true);

        try {
            const page = await fetchPageData(nextTitle);
            await ensureWikiSnapshot(page);

            if (normalizeTitle(page.title) === normalizeTitle(currentTitle)) return;

            const serverMove = await applyGroupMoveV2({
                roomId,
                expectedVersion: Number(myPlayer?.progress_version) || 0,
                nextPage: page,
                clickedRawTitle: nextTitle,
            });
            if (serverMove.room) setRoom(serverMove.room);
            const serverPlayer = serverMove.player || {};
            const nextClickCount = Number(serverPlayer.move_count) || 0;
            const newPath = Array.isArray(serverPlayer.path_titles) && serverPlayer.path_titles.length
                ? serverPlayer.path_titles
                : [...pathTitles, page.title];
            const solved = serverPlayer.player_status === "finished" || serverPlayer.has_finished === true;

            setFinishResult(solved ? {
                ...serverPlayer,
                user_id: serverPlayer.user_id,
                rank: serverPlayer.rank,
                is_winner: serverPlayer.rank <= (room?.finish_rank_limit ?? 3),
            } : null);

            setCurrentTitle(serverPlayer.current_title || page.title);
            setCurrentSummary(page.summary);
            setCurrentDocumentHtml(page.documentHtml);
            setLinks(page.links);
            setQuickLinks(page.quickLinks);
            setPathTitles(newPath);
            setClickCount(nextClickCount);

            if (solved) {
                finishedRef.current = true;
                saveLocalGameState({
                    currentTitle: serverPlayer.current_title || page.title,
                    pathTitles: newPath,
                    clickCount: nextClickCount,
                    enteredPlaying: true,
                    hasFinished: true,
                    viewMode: "result",
                });
                setPhase(GROUP_GAME_PHASE.FINISHED);
                await refreshRoomState();
            } else {
                saveLocalGameState({
                    currentTitle: serverPlayer.current_title || page.title,
                    pathTitles: newPath,
                    clickCount: nextClickCount,
                    enteredPlaying: true,
                });
            }

            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) {
            const normalized = normalizeOnlineGameError(
                e,
                "문서 또는 진행 상태를 일시적으로 저장하지 못했습니다."
            );
            console.error("group game move failed:", normalized.cause || e);
            if (!normalized.recoverable) clearLocalGameState();
            setPhase(normalized.recoverable
                ? GROUP_GAME_PHASE.RECOVERING
                : GROUP_GAME_PHASE.FATAL_ERROR);
            setRecovery({
                mode: normalized.recoverable ? "retryable" : "fatal",
                message: normalized.message,
            });
        } finally {
            moveInFlightRef.current = false;
            setIsLoading(false);
        }
    };

    const handleReturnToLobby = async (retireReason = "forfeited") => {
        if (leaving) return;
        setLeaving(true);
        recoveryGenerationRef.current += 1;

        if (timerRef.current) clearInterval(timerRef.current);
        if (realtimeChannelRef.current) {
            const channel = realtimeChannelRef.current;
            realtimeChannelRef.current = null;
            await supabase.removeChannel(channel).catch(() => { });
        }

        let currentRoom = room;
        let currentPlayer = myPlayer;

        if ((!currentRoom || !currentPlayer) && roomId && user?.id) {
            try {
                const [latestRoom, latestPlayers] = await Promise.all([
                    fetchGroupRoom(roomId),
                    fetchGroupRoomPlayers(roomId),
                ]);
                currentRoom = latestRoom;
                currentPlayer = latestPlayers.find((player) => player.user_id === user.id);
                setRoom(latestRoom);
                setPlayers(latestPlayers);
            } catch (error) {
                const normalized = normalizeOnlineGameError(
                    error,
                    "게임 상태를 확인하지 못해 나갈 수 없습니다."
                );
                setLeaving(false);
                setRecovery({
                    mode: normalized.recoverable ? "retryable" : "fatal",
                    message: normalized.message,
                });
                return;
            }
        }

        const shouldNotifyServer = shouldRetireGroupPlayer(currentRoom, currentPlayer);

        try {
            if (shouldNotifyServer) {
                await leaveGroupGame(roomId, user.id, {
                    roomStatus: currentRoom.status,
                    reason: retireReason,
                });
            }
        } catch (error) {
            console.error("leave group game failed:", error);
            setLeaving(false);
            setPhase(GROUP_GAME_PHASE.RECOVERING);
            setRecovery({
                mode: "retryable",
                message: "게임 이탈 상태를 서버에 저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
            });
            return;
        }

        saveLocalGameState({
            enteredPlaying: true,
            exited: true,
            exitedAt: Date.now(),
        });
        navigate("/multiplayer", { replace: true });
    };

    const { requestExit, dialog: exitDialog } = useExitGuard({
        enabled:
            phase === GROUP_GAME_PHASE.PICKING ||
            phase === GROUP_GAME_PHASE.COUNTDOWN ||
            phase === GROUP_GAME_PHASE.PLAYING ||
            phase === GROUP_GAME_PHASE.SPECTATING,
        onConfirm: () => handleReturnToLobby("forfeited"),
    });

    const handleStartSpectating = () => {
        const firstPending = getPendingGroupPlayers(players)[0];
        setSelectedSpectatorId(firstPending?.user_id || null);
        saveLocalGameState({
            enteredPlaying: true,
            hasFinished: true,
            viewMode: "spectating",
        });
        setPhase(GROUP_GAME_PHASE.SPECTATING);
    };

    const targetForViewer = useMemo(() => ({
        ...target,
        summary: targetSummary.text,
        summaryStatus: targetSummary.status,
        canonicalTitle: targetSummary.canonicalTitle,
        summaryError: targetSummary.error,
        onSummaryRetry: () => setTargetSummaryRetryKey((value) => value + 1),
    }), [target, targetSummary]);

    const groupTimerLabel = room?.status === "grace_period"
        ? "유예 시간"
        : "남은 시간";

    if (
        recovery ||
        phase === GROUP_GAME_PHASE.INITIALIZING ||
        phase === GROUP_GAME_PHASE.RECOVERING ||
        phase === GROUP_GAME_PHASE.FATAL_ERROR
    ) {
        return (
            <>
                <OnlineGameRecoveryPanel
                    mode={recovery?.mode || "recovering"}
                    message={recovery?.message}
                    onRetry={() => recoverGame()}
                    onLeave={requestExit}
                    leaving={leaving}
                />
                {exitDialog}
            </>
        );
    }

    if (phase === GROUP_GAME_PHASE.FINISHED) {
        const myResult =
            results.find((result) => result.user_id === user?.id) ||
            (finishResult?.user_id === user?.id ? finishResult : null) ||
            players.find((player) => player.user_id === user?.id);
        const pendingCount = getPendingGroupPlayers(players).length;
        const hasServerMoveCount = Number.isFinite(myResult?.move_count);
        const hasServerElapsed = Number.isFinite(myResult?.elapsed_seconds);

        return (
            <div className="mp-page group-result-page">
                {exitDialog}
                <div className="mp-container">
                    <div className="mp-title-block">
                        <span className="mp-badge">FINISHED</span>
                        <h1 className="mp-title">내 기록</h1>
                        <p className="mp-subtitle">
                            목표 문서: <strong>{target.title}</strong>
                        </p>
                    </div>

                    <section className="mp-card group-result-card">
                        <div className="group-record-grid">
                            <div>
                                <span>현재 순위</span>
                                <strong>{Number.isInteger(myResult?.rank) ? `${myResult.rank}위` : "확정 중"}</strong>
                            </div>
                            <div>
                                <span>이동 횟수</span>
                                <strong>{hasServerMoveCount ? `${myResult.move_count}회` : "확정 중"}</strong>
                            </div>
                            <div>
                                <span>기록</span>
                                <strong>
                                    {hasServerElapsed
                                        ? formatDuration(myResult.elapsed_seconds)
                                        : "확정 중"}
                                </strong>
                            </div>
                        </div>

                        <p className="group-pending-message">
                            {pendingCount > 0
                                ? `아직 ${pendingCount}명이 진행 중입니다.`
                                : "모든 참가자의 결과를 확인하고 있습니다."}
                        </p>

                        <div className="group-result-actions">
                            {pendingCount > 0 && (
                                <button
                                    type="button"
                                    className="mp-action-btn mp-action-btn--primary"
                                    onClick={handleStartSpectating}
                                >
                                    다른 참가자 관전하기
                                </button>
                            )}
                            <button
                                type="button"
                                className="mp-action-btn"
                                onClick={handleReturnToLobby}
                                disabled={leaving}
                            >
                                {leaving ? "게임 정리 중..." : "게임 로비로 나가기"}
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    if (phase === GROUP_GAME_PHASE.SPECTATING) {
        const pendingPlayers = getPendingGroupPlayers(players);
        const selectedPlayer =
            pendingPlayers.find((player) => player.user_id === selectedSpectatorId) ||
            pendingPlayers[0] ||
            null;
        const selectedPath = Array.isArray(selectedPlayer?.path_titles)
            ? selectedPlayer.path_titles
            : [];

        return (
            <div className="mp-page group-spectator-page">
                {exitDialog}
                <div className="mp-container">
                    <div className="mp-title-block">
                        <span className="mp-badge">SPECTATING</span>
                        <h1 className="mp-title">다른 참가자 관전 중</h1>
                        <p className="mp-subtitle">
                            참가자의 현재 문서와 이동 경로가 실시간으로 갱신됩니다.
                        </p>
                    </div>

                    <div className="group-spectator-layout">
                        <section className="mp-card group-spectator-list-card">
                            <h2>참가자</h2>
                            <div className="group-spectator-list">
                                {players.map((player) => {
                                    const isMe = player.user_id === user?.id;
                                    const isPending = pendingPlayers.some(
                                        (pendingPlayer) => pendingPlayer.user_id === player.user_id
                                    );
                                    const isFinished = isGroupPlayerFinished(player);
                                    const inactive = isGroupPlayerInactive(player);
                                    return (
                                        <button
                                            type="button"
                                            key={player.id || player.user_id}
                                            className={`group-spectator-player ${
                                                selectedPlayer?.user_id === player.user_id ? "active" : ""
                                            }`}
                                            onClick={() => {
                                                if (isPending) setSelectedSpectatorId(player.user_id);
                                            }}
                                            disabled={!isPending}
                                        >
                                            <span>
                                                {isMe ? "나" : player.nickname_snapshot || "참가자"}
                                            </span>
                                            <strong>
                                                {isFinished
                                                    ? `${Number.isInteger(player.rank) ? `${player.rank}위` : "완주"} · 완주 · ${Number.isFinite(player.move_count) ? `${player.move_count}회` : "기록 확인 중"}`
                                                    : inactive
                                                        ? `RETIRE · ${formatGroupRetireReason(player.retire_reason || player.leave_reason)}`
                                                        : `진행 중 · ${player.current_title || "문서 확인 중"} · ${Number.isFinite(player.move_count) ? `${player.move_count}회` : "기록 확인 중"}`}
                                            </strong>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="mp-card group-spectator-detail-card">
                            <span className="mp-badge">LIVE PATH</span>
                            <h2>{selectedPlayer ? `${selectedPlayer.nickname_snapshot || "참가자"}의 이동 경로` : "관전 가능한 참가자 없음"}</h2>
                            <p className="group-spectator-current">
                                현재 문서: <strong>{selectedPlayer?.current_title || "남은 참가자의 상태를 기다리는 중입니다."}</strong>
                            </p>
                            <div className="group-spectator-path">
                                {selectedPath.map((title, index) => (
                                    <React.Fragment key={`${title}-${index}`}>
                                        {index > 0 && <span aria-hidden="true">→</span>}
                                        <em>{title}</em>
                                    </React.Fragment>
                                ))}
                                {selectedPath.length === 0 && (
                                    <p className="mp-subtitle">아직 저장된 이동 경로가 없습니다.</p>
                                )}
                            </div>
                        </section>
                    </div>

                    <button
                        type="button"
                        className="mp-action-btn group-spectator-leave"
                        onClick={handleReturnToLobby}
                        disabled={leaving}
                    >
                        {leaving ? "게임 정리 중..." : "게임 로비로 나가기"}
                    </button>
                </div>
            </div>
        );
    }

    if (phase === GROUP_GAME_PHASE.ENDED) {
        const finalStandings = buildGroupFinalStandings(players, results);

        return (
            <div className="mp-page group-result-page">
                {exitDialog}
                <div className="mp-container">
                    <div className="mp-title-block">
                        <span className="mp-badge">FINAL RESULT</span>
                        <h1 className="mp-title">최종 결과</h1>
                        <p className="mp-subtitle">
                            목표 문서: <strong>{target.title}</strong>
                        </p>
                    </div>

                    <section className="mp-card group-result-card">
                        <div className="group-final-list">
                            {finalStandings.map((player) => (
                                <div
                                    key={player.id || player.user_id}
                                    className={`group-final-player ${
                                        player.result_status === "retired" ? "retired" : ""
                                    }`}
                                >
                                    <strong>
                                        {player.result_status === "retired"
                                            ? "RETIRE"
                                            : `${player.rank ?? "-"}위`}
                                        {" · "}
                                        {player.nickname_snapshot || "참가자"}
                                        {player.is_winner === true ? " · WINNER" : ""}
                                    </strong>
                                    <span>
                                        {player.result_status === "retired"
                                            ? formatGroupRetireReason(player.retire_reason || player.leave_reason)
                                            : `${Number.isFinite(player.move_count) ? `${player.move_count}회` : "기록 확인 중"} · ${Number.isFinite(player.elapsed_seconds) ? formatDuration(player.elapsed_seconds) : "기록 확인 중"}`}
                                    </span>
                                </div>
                            ))}
                            {finalStandings.length === 0 && (
                                <p className="mp-subtitle">최종 결과를 불러오는 중입니다.</p>
                            )}
                        </div>

                        <button
                            type="button"
                            className="mp-action-btn mp-action-btn--primary group-final-leave"
                            onClick={handleReturnToLobby}
                            disabled={leaving}
                        >
                            {leaving ? "게임 정리 중..." : "게임 로비로 이동"}
                        </button>
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="wiki-game-page">
            {exitDialog}
            {phase === GROUP_GAME_PHASE.PICKING && (
                <GroupPickOverlay
                    candidates={candidates}
                    startTitle={room?.group_start_title}
                    targetTitle={room?.group_target_title}
                    onComplete={() => setPhase(GROUP_GAME_PHASE.COUNTDOWN)}
                />
            )}

            {phase === GROUP_GAME_PHASE.COUNTDOWN && (
                <CountdownOverlay
                    onComplete={handleCountdownComplete}
                />
            )}

            {(phase === GROUP_GAME_PHASE.PICKING ||
                phase === GROUP_GAME_PHASE.COUNTDOWN ||
                phase === GROUP_GAME_PHASE.PLAYING) && (
                    <WikiViewer
                        target={targetForViewer}
                        currentTitle={currentTitle}
                        currentSummary={currentSummary}
                        currentDocumentHtml={currentDocumentHtml}
                        links={links}
                        quickLinks={quickLinks}
                        isLoading={isLoading}
                        elapsedSeconds={remainingSeconds}
                        clickCount={clickCount}
                        startTitle={startTitle}
                        timerLabel={groupTimerLabel}
                        onLinkClick={handleMove}
                    />
                )}

            {phase === GROUP_GAME_PHASE.PLAYING && (
                <>
                    <FloatingHud
                        targetTitle={target.title}
                        elapsedSeconds={remainingSeconds}
                        clickCount={clickCount}
                        timerLabel={groupTimerLabel}
                    />
                    <ScrollToTopButton />

                    <div className="group-rank-panel">
                        <strong>실시간 순위</strong>
                        <div>
                            {finishedPlayers.length === 0
                                ? "아직 도착자가 없습니다"
                                : finishedPlayers
                                    .slice(0, finishRankLimit)
                                    .map((p) => `${p.rank}등 ${p.nickname_snapshot || "참가자"}`)
                                    .join(" · ")}
                        </div>
                    </div>
                    <div className="group-player-progress-panel">
                        <strong>참가자 진행 상황</strong>

                        <div className="group-player-progress-list">
                            {players.map((player) => {
                                const isMe = player.user_id === user?.id;

                                return (
                                    <div
                                        key={player.id}
                                        className={`group-player-progress-item ${player.has_finished ? "finished" : ""
                                            } ${isMe ? "me" : ""}`}
                                    >
                                        <div className="group-player-progress-top">
                                            <span>
                                                {isMe ? "나" : player.nickname_snapshot || "참가자"}
                                            </span>

                                            <em>
                                                {player.has_finished
                                                    ? `${player.rank}등 도착`
                                                    : `${player.move_count ?? 0}회 이동`}
                                            </em>
                                        </div>

                                        <div className="group-player-progress-title">
                                            {player.current_title || "시작 대기 중"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>

            )}
        </div>
    );
}
