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
    fetchGroupSpectatorEmojis,
    sendGroupSpectatorEmoji,
} from "../services/groupMultiplayerService";

import {
    fetchPageData,
    fetchPageSummary,
    formatDuration,
    normalizeTitle,
} from "../services/wikiService";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService";

import ResultXp from "../components/ResultXp.jsx";
import {
    GroupStandings,
    ResultActions,
    ResultCard,
    ResultCourse,
    ResultOutcome,
    ResultRoute,
    ResultScene,
    ResultScreen,
    ResultStats,
    ResultXpRow,
} from "../components/wiki-race/result/ResultParts.jsx";
import {
    buildGroupOwnOutcome,
    buildGroupStandingRows,
    countGroupStandings,
} from "../utils/resultPresentation.js";
import WikiViewer from "../components/WikiViewer";
import CountdownOverlay from "../components/CountdownOverlay";
import {
    ConnectionDot,
    HudArrow,
    HudBrand,
    HudDoc,
    HudExit,
    HudStat,
    HudStatus,
    HudTimer,
    Pill,
    RaceFrame,
    RaceHold,
    RaceHud,
    RaceIcon,
    RouteChain,
    RouteRail,
} from "../components/wiki-race/race/RaceParts";
import {
    GroupResultA,
    GroupSheet,
    ParticipantRoster,
    ReactionDock,
    RouteCompare,
} from "../components/wiki-race/race/GroupRaceParts";
import {
    countGroupParticipants,
    getGroupDeadlineView,
    getGroupGraceCopy,
    getWatchView,
    orderGroupParticipants,
} from "../utils/groupRacePresentation.js";
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
import { useExitGuard } from "../components/ExitGuard";
import { classifyRealtimeVersion } from "../utils/serverAuthority";
import {
    fetchGroupSpectatorPage,
    filterVisibleGroupSpectatorEmojis,
    GROUP_SPECTATOR_PRESETS,
    normalizeGroupSpectatorEmojiEvent,
    upsertLatestGroupSpectatorEmoji,
} from "../services/groupSpectatorService";

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
    const [spectatorPage, setSpectatorPage] = useState(null);
    const [spectatorPageLoading, setSpectatorPageLoading] = useState(false);
    const [spectatorPageError, setSpectatorPageError] = useState("");
    const [spectatorEmojis, setSpectatorEmojis] = useState([]);
    const [mutedSpectatorIds, setMutedSpectatorIds] = useState(() => {
        try {
            const saved = localStorage.getItem(`wiki-group-spectator-mutes:${roomId}:${user?.id}`);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [muteAllSpectatorEmojis, setMuteAllSpectatorEmojis] = useState(() => {
        try {
            return localStorage.getItem(`wiki-group-spectator-mute-all:${roomId}:${user?.id}`) === "true";
        } catch {
            return false;
        }
    });
    // Phase 3 표시 전용 상태 — 서버 계약·판정과 무관하다.
    const [spectatorTab, setSpectatorTab] = useState("watch");
    const [sheetOpen, setSheetOpen] = useState(false);
    const [sheetTab, setSheetTab] = useState("roster");
    const [muteMode, setMuteMode] = useState(false);
    const [reactionCooldownUntil, setReactionCooldownUntil] = useState(0);
    const [resultRouteOpen, setResultRouteOpen] = useState(false);
    // Phase 4 — 리타이어의 Result C → "최종 결과 보기" → B. 표시 단계일 뿐 서버 상태가 아니다.
    const [finalStandingsOpen, setFinalStandingsOpen] = useState(false);
    const [displayNow, setDisplayNow] = useState(() => Date.now());

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
    const spectatorPageRequestRef = useRef(null);
    if (!targetSummaryRequestRef.current) {
        targetSummaryRequestRef.current = createLatestRequestManager();
    }
    if (!spectatorPageRequestRef.current) {
        spectatorPageRequestRef.current = createLatestRequestManager();
    }

    const storageKey = user?.id && roomId
        ? `wiki-group-game-state:${roomId}:${user.id}`
        : null;

    const spectatorMutesKey = user?.id && roomId
        ? `wiki-group-spectator-mutes:${roomId}:${user.id}`
        : null;
    const spectatorMuteAllKey = user?.id && roomId
        ? `wiki-group-spectator-mute-all:${roomId}:${user.id}`
        : null;

    useEffect(() => {
        if (!spectatorMutesKey) return;
        localStorage.setItem(spectatorMutesKey, JSON.stringify(mutedSpectatorIds));
    }, [mutedSpectatorIds, spectatorMutesKey]);

    useEffect(() => {
        if (!spectatorMuteAllKey) return;
        localStorage.setItem(spectatorMuteAllKey, String(muteAllSpectatorEmojis));
    }, [muteAllSpectatorEmojis, spectatorMuteAllKey]);

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

    const pendingSpectatorPlayers = useMemo(
        () => getPendingGroupPlayers(players),
        [players]
    );
    const selectedSpectatorPlayer = useMemo(
        () =>
            pendingSpectatorPlayers.find(
                (player) => player.user_id === selectedSpectatorId
            ) || pendingSpectatorPlayers[0] || null,
        [pendingSpectatorPlayers, selectedSpectatorId]
    );
    const visibleSpectatorEmojis = useMemo(
        () => filterVisibleGroupSpectatorEmojis(spectatorEmojis, {
            mutedUserIds: mutedSpectatorIds,
            muteAll: muteAllSpectatorEmojis,
        }),
        [muteAllSpectatorEmojis, mutedSpectatorIds, spectatorEmojis]
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
                // Phase 3 표시 전용: 리타이어(PARTICIPANT_INACTIVE)를 중립 집계 화면으로 구분한다.
                code: normalized.code,
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
        spectatorPageRequestRef.current?.cancel();
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
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "room_events",
                    filter: `room_id=eq.${roomId}`,
                },
                (payload) => {
                    if (payload?.new?.event_type !== "group_spectator_emoji") return;
                    if (!normalizeGroupSpectatorEmojiEvent(payload.new)) return;
                    setSpectatorEmojis((current) =>
                        upsertLatestGroupSpectatorEmoji(current, payload.new)
                    );
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

    // Phase 3: 관전 문서는 "보는 사람 · 그 사람의 서버 문서 식별자"가 바뀔 때만 다시 받는다.
    // 같은 사람의 다른 열(이동 수 등) 갱신으로 화면을 비우지 않고, 연결이 끊긴 동안에는
    // 마지막으로 받은 화면을 읽기 전용으로 유지한다(다른 참가자로 자동 전환하지 않는다).
    const watchedUserId = selectedSpectatorPlayer?.user_id ?? null;
    const watchedPageKey = selectedSpectatorPlayer
        ? `${selectedSpectatorPlayer.current_page_id ?? ""}:${selectedSpectatorPlayer.current_revision_id ?? ""}`
        : "";
    const watchedDisconnected =
        String(selectedSpectatorPlayer?.player_status || "").toLowerCase() === "disconnected";
    const lastWatchedUserRef = useRef(null);
    const selectedSpectatorPlayerRef = useRef(null);
    selectedSpectatorPlayerRef.current = selectedSpectatorPlayer;

    useEffect(() => {
        const watchedPlayer = selectedSpectatorPlayerRef.current;
        if (phase !== GROUP_GAME_PHASE.SPECTATING || !watchedPlayer) {
            spectatorPageRequestRef.current?.cancel();
            setSpectatorPage(null);
            setSpectatorPageError("");
            setSpectatorPageLoading(false);
            lastWatchedUserRef.current = null;
            return undefined;
        }
        if (watchedDisconnected && lastWatchedUserRef.current === watchedUserId) return undefined;

        const request = spectatorPageRequestRef.current.begin();
        if (lastWatchedUserRef.current !== watchedUserId) setSpectatorPage(null);
        lastWatchedUserRef.current = watchedUserId;
        setSpectatorPageError("");
        setSpectatorPageLoading(true);

        fetchGroupSpectatorPage(watchedPlayer)
            .then((page) => {
                if (!spectatorPageRequestRef.current.isCurrent(request.id)) return;
                setSpectatorPage(page);
            })
            .catch((error) => {
                if (!spectatorPageRequestRef.current.isCurrent(request.id)) return;
                console.warn("group spectator page failed:", error);
                setSpectatorPageError(
                    error?.message || "관전 문서를 불러오지 못했습니다."
                );
            })
            .finally(() => {
                if (spectatorPageRequestRef.current.isCurrent(request.id)) {
                    spectatorPageRequestRef.current.complete(request.id);
                    setSpectatorPageLoading(false);
                }
            });

        return () => {
            if (spectatorPageRequestRef.current.isCurrent(request.id)) {
                spectatorPageRequestRef.current.cancel();
            }
        };
    }, [phase, watchedUserId, watchedPageKey, watchedDisconnected]);

    useEffect(() => {
        if (phase !== GROUP_GAME_PHASE.SPECTATING || !roomId) return undefined;

        let cancelled = false;
        fetchGroupSpectatorEmojis(roomId)
            .then((events) => {
                if (cancelled) return;
                setSpectatorEmojis(
                    events.reduce(
                        (current, event) => upsertLatestGroupSpectatorEmoji(current, event),
                        []
                    )
                );
            })
            .catch((error) => {
                if (!cancelled) console.warn("group spectator emoji restore failed:", error);
            });

        return () => {
            cancelled = true;
        };
    }, [phase, roomId]);

    const handleSendSpectatorEmoji = useCallback(async (presetId) => {
        if (phase !== GROUP_GAME_PHASE.SPECTATING || !roomId) return;
        try {
            const response = await sendGroupSpectatorEmoji(roomId, presetId);
            if (response?.accepted === false) {
                if (response.code === "SPECTATOR_ROOM_EXPIRED") {
                    if (response.room?.status === "finished") {
                        await showFinalGroupRoom(response.room);
                    } else {
                        await refreshRoomState();
                    }
                    return;
                }

                const rejected = new Error(
                    response.code || "이모티콘을 보낼 수 없습니다."
                );
                rejected.code = response.code || "SPECTATOR_EMOJI_REJECTED";
                throw rejected;
            }

            const event = response;
            if (!event) return;
            setSpectatorEmojis((current) => upsertLatestGroupSpectatorEmoji(current, event));
            // 표시 전용 3초 대기 — 실제 제한은 서버 rate limit이다.
            setReactionCooldownUntil(Date.now() + 3000);
        } catch (error) {
            const message = error?.message || "이모티콘을 보낼 수 없습니다.";
            if (String(message).includes("RATE_LIMIT")) {
                setReactionCooldownUntil(Date.now() + 3000);
                setSpectatorPageError("이모티콘은 3초에 한 번만 보낼 수 있습니다.");
            } else {
                setSpectatorPageError(message);
            }
        }
    }, [phase, refreshRoomState, roomId, showFinalGroupRoom]);

    const handleToggleSpectatorMute = useCallback((userId) => {
        setMutedSpectatorIds((current) =>
            current.includes(userId)
                ? current.filter((id) => id !== userId)
                : [...current, userId]
        );
    }, []);

    // Phase 3 표시 시계 — 관전 중 반응 스탬프(3초)·반응 대기 초를 갱신한다. 판정에는 쓰지 않는다.
    useEffect(() => {
        if (phase !== GROUP_GAME_PHASE.SPECTATING) return undefined;
        const timer = setInterval(() => setDisplayNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [phase]);

    // Phase 3 — 내가 리타이어된 경우(PARTICIPANT_INACTIVE): 관전 권한 없이 중립 "결과 집계 중"을 보인다.
    // 결과로 넘어가는 경로는 기존 recoverGame 그대로다 — 방이 finished가 되면 ENDED(최종 결과)를 반환한다.
    // 재조회 중 recovery가 잠시 로딩 상태로 바뀌어도 집계 화면이 깜빡이지 않도록, 실제 결과(종료·진행)가
    // 올 때까지 유지한다.
    const [retiredHold, setRetiredHold] = useState(false);
    useEffect(() => {
        if (recovery?.code === "PARTICIPANT_INACTIVE") setRetiredHold(true);
    }, [recovery?.code]);
    useEffect(() => {
        if (![
            GROUP_GAME_PHASE.ENDED,
            GROUP_GAME_PHASE.PLAYING,
            GROUP_GAME_PHASE.FINISHED,
            GROUP_GAME_PHASE.SPECTATING,
        ].includes(phase)) return;
        setRetiredHold(false);
        // 서버가 경기 종료(ENDED)를 알리면(Realtime refreshRoomState 경로 포함) 리타이어 시점의
        // PARTICIPANT_INACTIVE 안내는 더 이상 유효하지 않다 — 최종 결과가 가려지지 않게 지운다.
        if (phase === GROUP_GAME_PHASE.ENDED) {
            setRecovery((current) => (current?.code === "PARTICIPANT_INACTIVE" ? null : current));
        }
    }, [phase]);
    useEffect(() => {
        if (!retiredHold) return undefined;
        const timer = setInterval(() => { void recoverGame(); }, 5000);
        return () => clearInterval(timer);
    }, [retiredHold, recoverGame]);

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
            // 이 두 줄의 순서가 계약이다. 서버는 링크 행의 target_revision_id가 아니라
            // 목적지의 스냅샷 행에서 revision을 해석한다 (private.resolve_wiki_revision).
            // 스냅샷이 없으면 apply_group_move_v2는 coalesce로 **이전 문서의 revision을
            // 남기고**(단일·1:1은 LINK_SNAPSHOT_MISSING으로 거절한다) 다음 이동이
            // LINK_NOT_ALLOWED로 막힌다. 근거: docs/agent/CURRENT.md §5.5-3.
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

        const isFinishedExplicitLeave =
            currentPlayer?.player_status === "finished" &&
            [GROUP_GAME_PHASE.FINISHED, GROUP_GAME_PHASE.SPECTATING, GROUP_GAME_PHASE.ENDED].includes(phase);
        const shouldNotifyServer =
            shouldRetireGroupPlayer(currentRoom, currentPlayer) || isFinishedExplicitLeave;

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

    // ── Phase 3 표시 파생값 — 전부 서버 값에서 읽는다 ─────────────────────
    const deadline = getGroupDeadlineView(room);
    const graceCopy = getGroupGraceCopy(deadline);
    const rosterEntries = orderGroupParticipants(players);
    const rosterCounts = countGroupParticipants(players);
    const goalTitle = room?.group_target_title || target.title;
    const courseStart = room?.group_start_title || startTitle;
    const reactionsByUser = Object.fromEntries(visibleSpectatorEmojis.map((event) => [event.userId, event]));
    const deadlineStatus = deadline.state === "ended"
        ? <Pill tone="neutral" filled wrap>경기 종료 · 완주하지 못한 참가자는 리타이어로 기록됩니다</Pill>
        : graceCopy
            ? <Pill tone="gold" filled wrap icon="flag" key={graceCopy}>{graceCopy}</Pill>
            : null;
    const myRoute = (path) => (
        <div className="wr-sheet-route">
            <RouteRail path={path} currentTitle={path[path.length - 1]} title="내 경로" />
        </div>
    );

    if (retiredHold) {
        // 리타이어 — 관전·반응 없이 중립 집계 화면. 기존 recoverGame이 방 종료를 확인하면 최종 결과로 간다.
        return (
            <>
                <RaceFrame mode="group" label="그룹 레이스">
                    <RaceHud>
                        <HudBrand mode="그룹" />
                        <HudStatus>
                            <Pill tone="neutral" filled>경기 종료 · 결과 집계 중</Pill>
                        </HudStatus>
                        <HudTimer label="경기 종료" seconds={0} state="ended" />
                        <HudExit label="그룹 로비로" onClick={() => handleReturnToLobby("left")} disabled={leaving} />
                    </RaceHud>
                    <RaceHold kicker="GROUP · 리타이어" title="경기 종료 · 결과 집계 중">
                        <p>최종 기록을 집계하고 있습니다. 경기가 확정되면 최종 결과로 이동합니다.</p>
                        <img className="wr-race-hold-figure" src="/assets/wiki-race/explorer-lose.png" alt="" height="96" />
                    </RaceHold>
                </RaceFrame>
                {exitDialog}
            </>
        );
    }

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
                    gameMode="group"
                    modeLabel="그룹"
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
        const myPath = Array.isArray(myResult?.path_titles) && myResult.path_titles.length
            ? myResult.path_titles
            : pathTitles;

        // Result A — 완주 · 경기 진행 중. 관전은 "관전하기"를 눌렀을 때만 시작한다.
        return (
            <>
                {exitDialog}
                <GroupResultA
                    result={myResult}
                    size={players.length}
                    finishedCount={rosterCounts.finished}
                    pendingCount={pendingCount}
                    deadline={deadline}
                    startTitle={courseStart}
                    targetTitle={goalTitle}
                    path={myPath}
                    onSpectate={handleStartSpectating}
                    onLeave={() => handleReturnToLobby("left")}
                    leaving={leaving}
                    routeOpen={resultRouteOpen}
                    onToggleRoute={() => setResultRouteOpen((open) => !open)}
                />
            </>
        );
    }

    if (phase === GROUP_GAME_PHASE.SPECTATING) {
        const pendingPlayers = pendingSpectatorPlayers;
        const selectedPlayer =
            pendingPlayers.find((player) => player.user_id === selectedSpectatorId) ||
            pendingPlayers[0] ||
            null;
        const me = players.find((player) => player.user_id === user?.id);
        const myRank = Number.isInteger(me?.rank) ? me.rank : null;
        const watch = selectedPlayer ? getWatchView(selectedPlayer) : null;
        const ended = deadline.state === "ended";
        const cooldownSeconds = Math.max(0, Math.ceil((reactionCooldownUntil - displayNow) / 1000));
        const myPath = Array.isArray(me?.path_titles) && me.path_titles.length ? me.path_titles : pathTitles;
        const watchName = selectedPlayer ? selectedPlayer.nickname_snapshot || "참가자" : "";

        const articleTag = !selectedPlayer ? null : watch?.live
            ? <>
                <span>링크를 눌러도 이동하지 않습니다</span>
                <Pill tone="blue" filled icon="spectator">{watchName}의 화면 · {Number(selectedPlayer.move_count) || 0} 이동</Pill>
            </>
            : <>
                <span>마지막으로 받은 화면 · 읽기 전용</span>
                {watch?.state === "disconnected"
                    ? <ConnectionDot ok={false} halo label={`${watchName} · 재연결 중`} />
                    : <Pill tone="neutral" filled>{watchName} · {watch?.label}</Pill>}
            </>;

        const watchPanel = !selectedPlayer ? (
            <RaceHold kicker="관전" title="관전 가능한 참가자 없음">
                <p>남은 참가자의 상태를 기다리는 중입니다. 경기가 끝나면 최종 결과로 이동합니다.</p>
            </RaceHold>
        ) : (
            <>
                {spectatorPageError && <p className="state-text error" role="alert">{spectatorPageError}</p>}
                {spectatorPage ? (
                    <WikiViewer
                        target={{
                            title: goalTitle,
                            canonicalTitle: goalTitle,
                            mode: "group",
                        }}
                        currentTitle={spectatorPage.canonicalTitle}
                        currentSummary={spectatorPage.summary}
                        currentDocumentHtml={spectatorPage.documentHtml}
                        links={spectatorPage.links}
                        quickLinks={spectatorPage.quickLinks}
                        isLoading={spectatorPageLoading}
                        elapsedSeconds={Number(selectedPlayer.elapsed_seconds) || 0}
                        clickCount={Number(selectedPlayer.move_count) || 0}
                        startTitle={selectedPlayer.start_title || room?.group_start_title || ""}
                        timerLabel="관전 중 기록"
                        readOnly
                        showTargetBrief={false}
                        articleTag={articleTag}
                    />
                ) : (
                    <RaceHold kicker="관전" title="화면 대기 중">
                        <p>
                            {spectatorPageLoading
                                ? "서버가 확정한 Wikipedia 문서를 불러오는 중입니다..."
                                : `${watchName}의 화면을 아직 받지 못했습니다. 연결이 돌아오면 이어서 표시합니다.`}
                        </p>
                    </RaceHold>
                )}
            </>
        );

        const comparePanel = (
            <RouteCompare
                entries={rosterEntries}
                myUserId={user?.id}
                watchedId={selectedPlayer?.user_id}
                onWatch={(id) => { setSelectedSpectatorId(id); setSpectatorTab("watch"); }}
                startTitle={courseStart}
                targetTitle={goalTitle}
            />
        );

        const roster = (
            <ParticipantRoster
                entries={rosterEntries}
                myUserId={user?.id}
                spectating
                watchedId={selectedPlayer?.user_id}
                onSelect={(id) => { setSelectedSpectatorId(id); setSpectatorTab("watch"); }}
                reactionsByUser={reactionsByUser}
                nowMs={displayNow}
                muteMode={muteMode && !ended}
                mutedIds={mutedSpectatorIds}
                onToggleMute={handleToggleSpectatorMute}
                counts={rosterCounts}
            />
        );

        return (
            <>
                {exitDialog}
                <RaceFrame mode="group" tabs label="그룹 관전">
                    <RaceHud>
                        <HudBrand mode="그룹" />
                        <div className="wr-hud-cell wr-hud-record">
                            <span className="wr-hud-label">내 기록</span>
                            <strong><span className="wr-done-glyph" aria-hidden="true">✓</span>{myRank ? `${myRank}위 완주` : "완주"}</strong>
                            <small className="wr-num">
                                {[Number.isFinite(me?.elapsed_seconds) ? formatDuration(me.elapsed_seconds) : null, Number.isFinite(me?.move_count) ? `${me.move_count} 이동` : null].filter(Boolean).join(" · ")}
                            </small>
                        </div>
                        <div className={`wr-hud-cell wr-hud-doc wr-hud-watch ${watch?.live ? "is-live" : ""}`}>
                            <span className="wr-hud-label">{selectedPlayer ? `${watch.label} · ${watchName}` : "관전 대상 없음"}</span>
                            <span className="wr-hud-doc-value" title={selectedPlayer?.current_title || undefined}>
                                <RaceIcon name="spectator" size={16} />
                                <span>{selectedPlayer?.current_title || "화면 대기"}</span>
                            </span>
                        </div>
                        <HudArrow />
                        <HudDoc kind="goal" label="목표 문서" title={goalTitle} />
                        <HudStatus />
                        <HudTimer label={deadline.label} seconds={deadline.seconds} state={deadline.state} />
                        <HudExit label="방 나가기" onClick={() => handleReturnToLobby("left")} disabled={leaving} />
                    </RaceHud>

                    <div className="wr-race-tabs" role="tablist" aria-label="관전 보기">
                        <button type="button" role="tab" id="wr-tab-watch" aria-selected={spectatorTab === "watch"} aria-controls="wr-spectator-panel" className={`wr-race-tab ${ended ? "is-ended" : ""}`} onClick={() => setSpectatorTab("watch")}>
                            <RaceIcon name="spectator" size={14} />{ended ? "마지막 화면" : "플레이 관전"}
                        </button>
                        <button type="button" role="tab" id="wr-tab-compare" aria-selected={spectatorTab === "compare"} aria-controls="wr-spectator-panel" className="wr-race-tab" onClick={() => setSpectatorTab("compare")}>
                            <RaceIcon name="route" size={14} />경로 비교
                        </button>
                        <span className="wr-race-tabs-end">{deadlineStatus}</span>
                    </div>

                    <div className="wr-race-body">
                        <aside className="wr-race-side group-spectator-list-card">{roster}</aside>
                        <main
                            className={`wr-race-main group-spectator-detail-card ${watch && !watch.live ? "is-stale" : ""}`}
                            id="wr-spectator-panel"
                            role="tabpanel"
                            aria-labelledby={spectatorTab === "watch" ? "wr-tab-watch" : "wr-tab-compare"}
                        >
                            {spectatorTab === "watch" ? watchPanel : comparePanel}
                        </main>
                    </div>

                    <ReactionDock
                        presets={GROUP_SPECTATOR_PRESETS}
                        onSend={handleSendSpectatorEmoji}
                        cooldownSeconds={cooldownSeconds}
                        ended={ended}
                        muteAll={muteAllSpectatorEmojis}
                        onToggleMuteAll={() => setMuteAllSpectatorEmojis((current) => !current)}
                        muteMode={muteMode}
                        onToggleMuteMode={() => setMuteMode((current) => !current)}
                        mutedCount={mutedSpectatorIds.length}
                    />

                    <GroupSheet
                        deadline={deadline}
                        meLabel={myRank ? `${myRank}위 완주` : "완주"}
                        counts={rosterCounts}
                        open={sheetOpen}
                        onToggle={() => setSheetOpen((open) => !open)}
                        status={deadlineStatus}
                        activeTab={sheetTab}
                        onTab={setSheetTab}
                        tabs={[
                            { id: "roster", label: "참가자", content: roster },
                            { id: "compare", label: "경로 비교", content: comparePanel },
                            { id: "route", label: "내 경로", content: myRoute(myPath) },
                        ]}
                        footer={
                            <ReactionDock
                                compact
                                presets={GROUP_SPECTATOR_PRESETS}
                                onSend={handleSendSpectatorEmoji}
                                cooldownSeconds={cooldownSeconds}
                                ended={ended}
                            />
                        }
                    />
                </RaceFrame>
            </>
        );
    }

    if (phase === GROUP_GAME_PHASE.ENDED) {
        // Phase 4 최종 결과 (Freeze 08). 순위·상태·XP는 서버 확정값(group_match_results · xp_ledger).
        // 리타이어는 먼저 Result C(내 리타이어 결과)를 보고 "최종 결과 보기"로 B(최종 순위)로 간다.
        // ResultXp는 C와 B에서 **같은 자리에 한 번만** 마운트된다 — C → B 전환에서 다시 조회·reveal하지 않는다.
        const finalStandings = buildGroupFinalStandings(players, results);
        const ownResult = finalStandings.find((entry) => entry.user_id === user?.id) || null;
        const ownRetired = ownResult?.result_status === "retired";
        const view = ownRetired && !finalStandingsOpen ? "retired" : "standings";
        const outcome = buildGroupOwnOutcome(ownResult, { view });
        const standingRows = buildGroupStandingRows(finalStandings, user?.id);
        const standingCounts = countGroupStandings(finalStandings);
        const ownResultRowId = results.find((entry) => entry.user_id === user?.id)?.id ?? null;
        const ownPath = Array.isArray(ownResult?.path_titles) ? ownResult.path_titles.filter(Boolean) : [];

        return (
            <>
                {exitDialog}
                <ResultScreen mode="group" tone={outcome.tone} layer="page" titleId="wr-group-result-title" focusKey={view} testId="group-final-result">
                    <ResultScene mascot={outcome.mascot} reached={!ownRetired && Boolean(ownResult)} celebration={outcome.celebration} destination={goalTitle || null} />
                    <ResultCard>
                        <ResultOutcome
                            kicker={outcome.kicker}
                            titleId="wr-group-result-title"
                            title={outcome.title}
                            meta={`그룹 레이스 · ${players.length || finalStandings.length}인 · 경기 종료`}
                            pill={outcome.pill}
                            detail={outcome.detail}
                        />
                        <ResultStats
                            items={[
                                ...outcome.stats,
                                { label: "공통 코스", wide: true, value: <ResultCourse start={courseStart} target={goalTitle} /> },
                            ]}
                        />
                        {ownResult ? (
                            <ResultXpRow>
                                <ResultXp scope="group" userId={user?.id} sourceId={ownResultRowId} roomId={roomId} tone="light" />
                            </ResultXpRow>
                        ) : null}
                        {view === "retired" ? (
                            <ResultRoute
                                title="내 경로"
                                meta={ownPath.length ? `마지막 도달 문서 · ${ownPath[ownPath.length - 1]}` : null}
                                path={ownPath}
                                tail="목표 미도달"
                            />
                        ) : (
                            finalStandings.length === 0
                                ? <p className="wr-result-row" role="status">최종 결과를 불러오는 중입니다.</p>
                                : <GroupStandings rows={standingRows} finishedCount={standingCounts.finished} retiredCount={standingCounts.retired} />
                        )}
                        <ResultActions>
                            {view === "retired" && (
                                <button type="button" className="wr-race-btn wr-race-btn--primary wr-race-btn--lg" onClick={() => setFinalStandingsOpen(true)}>
                                    최종 결과 보기 →
                                </button>
                            )}
                            <button
                                type="button"
                                className={`wr-race-btn ${view === "retired" ? "" : "wr-race-btn--primary wr-race-btn--lg"}`}
                                onClick={() => handleReturnToLobby("left")}
                                disabled={leaving}
                            >
                                {leaving ? "게임 정리 중..." : "그룹 로비로"}
                            </button>
                        </ResultActions>
                    </ResultCard>
                </ResultScreen>
            </>
        );
    }

    // PICKING · COUNTDOWN · PLAYING — 그룹 RACE. 아이템 없음 · 같은 코스 · 서버 마감.
    const isGroupPlaying = phase === GROUP_GAME_PHASE.PLAYING;
    const me = players.find((player) => player.user_id === user?.id);
    const rosterPlaying = (
        <ParticipantRoster entries={rosterEntries} myUserId={user?.id} counts={rosterCounts} />
    );

    return (
        <>
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

            <RaceFrame mode="group" label="그룹 레이스">
                <RaceHud>
                    <HudBrand mode="그룹" />
                    <HudDoc kind="current" label="현재 문서" title={currentTitle} />
                    <HudArrow />
                    <HudDoc kind="goal" label="목표 문서" title={target.title} />
                    <HudStatus>{isGroupPlaying && graceCopy && <Pill tone="gold" filled wrap icon="flag" key={graceCopy}>{graceCopy}</Pill>}</HudStatus>
                    <HudStat label="이동" value={clickCount} />
                    <HudTimer label={isGroupPlaying ? deadline.label : "남은 시간"} seconds={isGroupPlaying ? remainingSeconds : deadline.seconds} state={isGroupPlaying ? deadline.state : "normal"} />
                    <HudExit label="나가기" onClick={requestExit} disabled={leaving} />
                </RaceHud>

                <div className="wr-race-body">
                    <aside className="wr-race-side">
                        {rosterPlaying}
                        <div className="wr-roster-foot">
                            <div className="wr-roster-foot-head">
                                <span className="wr-hud-label">내 경로</span>
                                <small>{pathTitles.length}문서</small>
                            </div>
                            <RouteChain path={pathTitles} />
                        </div>
                    </aside>
                    <main className="wr-race-main">
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
                            timerLabel={deadline.label}
                            onLinkClick={handleMove}
                        />
                    </main>
                </div>

                <GroupSheet
                    deadline={isGroupPlaying ? { ...deadline, seconds: remainingSeconds } : deadline}
                    meLabel={me && Number.isInteger(me.rank) ? `${me.rank}위 완주` : "진행 중"}
                    counts={rosterCounts}
                    open={sheetOpen}
                    onToggle={() => setSheetOpen((open) => !open)}
                    status={isGroupPlaying && graceCopy ? <Pill tone="gold" filled wrap icon="flag">{graceCopy}</Pill> : null}
                    activeTab={sheetTab === "compare" ? "roster" : sheetTab}
                    onTab={setSheetTab}
                    tabs={[
                        { id: "roster", label: "참가자", content: rosterPlaying },
                        { id: "route", label: "내 경로", content: myRoute(pathTitles) },
                    ]}
                />
            </RaceFrame>

            {isGroupPlaying && <ScrollToTopButton />}
        </>
    );
}
