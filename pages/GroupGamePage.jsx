import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";

import {
    fetchGroupRoom,
    fetchGroupRoomPlayers,
    updateGroupPlayerProgress,
    finishGroupPlayer,
    fetchGroupResults,
    leaveGroupGame,
} from "../services/groupMultiplayerService";

import {
    fetchPageData,
    formatDuration,
    normalizeTitle,
} from "../services/wikiService";

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
    isGroupPlayerInactive,
    resolveGroupEntry,
} from "../utils/groupGameFlow";

import { recordGroupMatchHistory } from "../services/profileStatsService";
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
        summary: "",
        requestedKeyword: "",
        mode: "group",
    });

    const [startTitle, setStartTitle] = useState("");
    const [currentTitle, setCurrentTitle] = useState("");
    const [currentSummary, setCurrentSummary] = useState("");
    const [currentDocumentHtml, setCurrentDocumentHtml] = useState("");
    const [links, setLinks] = useState([]);
    const [quickLinks, setQuickLinks] = useState([]);
    const [pathTitles, setPathTitles] = useState([]);

    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [clickCount, setClickCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [recovery, setRecovery] = useState(() =>
        getGroupLoadingState(initialEntryRef.current.phase)
    );
    const [leaving, setLeaving] = useState(false);
    const [connectionVersion, setConnectionVersion] = useState(0);
    const [selectedSpectatorId, setSelectedSpectatorId] = useState(null);

    const timerRef = useRef(null);
    const startTimeRef = useRef(null);
    const finishedRef = useRef(false);
    const hasRecordedRef = useRef(false);
    const playStartTrackedRef = useRef(false);
    const recoveryGenerationRef = useRef(0);
    const initialValidationCompletedRef = useRef(false);
    const realtimeChannelRef = useRef(null);
    const moveInFlightRef = useRef(false);

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
                .filter((player) => player.has_finished)
                .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
        [players]
    );

    const candidates = useMemo(() => {
        return players
            .map((player) => player.submitted_target_title)
            .filter(Boolean);
    }, [players]);

    const checkWin = useCallback((pageTitle, targetTitle) => {
        return (
            pageTitle &&
            targetTitle &&
            normalizeTitle(pageTitle) === normalizeTitle(targetTitle)
        );
    }, []);

    const fetchValidatedSession = useCallback(async () => {
        const [roomData, playerData] = await Promise.all([
            fetchGroupRoom(roomId),
            fetchGroupRoomPlayers(roomId),
        ]);

        return validateGroupGameSession({
            room: roomData,
            players: playerData,
            userId: user.id,
        });
    }, [roomId, user?.id]);

    const recoverGame = useCallback(async (entryPhase = GROUP_GAME_PHASE.RECOVERING) => {
        if (!roomId || !user?.id) return;

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
                    const session = await fetchValidatedSession();
                    if (session.outcome !== "active") return { session, page: null };
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

            if (!initialValidationCompletedRef.current) {
                consumeGroupEntryMarker(initialEntryRef.current, sessionStorage);
                initialValidationCompletedRef.current = true;
            }

            const { session, page } = restored;
            setRoom(session.room);
            setPlayers(session.players);
            setStartTitle(session.room.group_start_title || "");
            setTarget({
                title: session.room.group_target_title || "",
                summary: "단체모드 목표 문서입니다. 가장 빠르게 도착해보세요.",
                requestedKeyword: "",
                mode: "group",
            });

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
        fetchValidatedSession,
        clearLocalGameState,
        loadLocalGameState,
        saveLocalGameState,
    ]);

    const refreshRoomState = useCallback(async () => {
        const session = await fetchValidatedSession();
        setRoom(session.room);
        setPlayers(session.players);

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
        fetchValidatedSession,
        loadLocalGameState,
        saveLocalGameState,
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
                async () => {
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
                async () => {
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
        if (phase === GROUP_GAME_PHASE.PLAYING) {
            startTimeRef.current = room?.started_at
                ? Date.parse(room.started_at)
                : Date.now() - elapsedSeconds * 1000;

            if (!playStartTrackedRef.current) {
                playStartTrackedRef.current = true;
                trackEvent("play_start", {
                    user,
                    mode: "group",
                    roomId,
                    targetTitle: target.title,
                });
            }

            timerRef.current = setInterval(() => {
                setElapsedSeconds(room?.started_at
                    ? elapsedSecondsFromServer(room.started_at)
                    : Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000))
                );
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [phase, room?.started_at, roomId, target.title, user]);

    useEffect(() => {
        if (room?.status === "finished") {
            if (!hasRecordedRef.current) {
                hasRecordedRef.current = true;
                recordGroupMatchHistory(roomId).catch(console.error);
            }

        }
    }, [room?.status, roomId]);

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

            if (normalizeTitle(page.title) === normalizeTitle(currentTitle)) return;

            const nextClickCount = clickCount + 1;
            const newPath = [...pathTitles, page.title];
            const solved = checkWin(page.title, target.title);

            if (solved) {
                await finishGroupPlayer(roomId, {
                    elapsedSeconds: room?.started_at
                        ? elapsedSecondsFromServer(room.started_at)
                        : elapsedSeconds,
                    moveCount: nextClickCount,
                    currentTitle: page.title,
                    pathTitles: newPath,
                });
            } else {
                await updateGroupPlayerProgress(roomId, user.id, {
                    currentTitle: page.title,
                    moveCount: nextClickCount,
                    pathTitles: newPath,
                    expectedMoveCount: clickCount,
                });
            }

            setCurrentTitle(page.title);
            setCurrentSummary(page.summary);
            setCurrentDocumentHtml(page.documentHtml);
            setLinks(page.links);
            setQuickLinks(page.quickLinks);
            setPathTitles(newPath);
            setClickCount(nextClickCount);

            if (solved) {
                finishedRef.current = true;
                saveLocalGameState({
                    currentTitle: page.title,
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
                    currentTitle: page.title,
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

    const handleReturnToLobby = async () => {
        if (leaving) return;
        setLeaving(true);
        recoveryGenerationRef.current += 1;

        if (timerRef.current) clearInterval(timerRef.current);
        if (realtimeChannelRef.current) {
            const channel = realtimeChannelRef.current;
            realtimeChannelRef.current = null;
            await supabase.removeChannel(channel).catch(() => { });
        }

        const shouldNotifyServer = room && myPlayer &&
            ["starting", "playing", "finished"].includes(room.status);
        const requiresConfirmedLeave =
            ["starting", "playing"].includes(room?.status) &&
            myPlayer &&
            !myPlayer.has_finished;

        try {
            if (shouldNotifyServer) {
                await leaveGroupGame(roomId, user.id, {
                    hasFinished: myPlayer.has_finished || room.status === "finished",
                });
            }
        } catch (error) {
            console.error("leave group game failed:", error);
            if (requiresConfirmedLeave) {
                setLeaving(false);
                setPhase(GROUP_GAME_PHASE.RECOVERING);
                setRecovery({
                    mode: "retryable",
                    message: "게임 이탈 상태를 서버에 저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
                });
                return;
            }
        }

        saveLocalGameState({
            enteredPlaying: true,
            exited: true,
            exitedAt: Date.now(),
        });
        navigate("/multiplayer", { replace: true });
    };

    const handleStartSpectating = () => {
        const firstPending = getPendingGroupPlayers(players)[0];
        setSelectedSpectatorId(firstPending?.user_id || myPlayer?.user_id || null);
        saveLocalGameState({
            enteredPlaying: true,
            hasFinished: true,
            viewMode: "spectating",
        });
        setPhase(GROUP_GAME_PHASE.SPECTATING);
    };

    if (
        recovery ||
        phase === GROUP_GAME_PHASE.INITIALIZING ||
        phase === GROUP_GAME_PHASE.RECOVERING ||
        phase === GROUP_GAME_PHASE.FATAL_ERROR
    ) {
        return (
            <OnlineGameRecoveryPanel
                mode={recovery?.mode || "recovering"}
                message={recovery?.message}
                onRetry={() => recoverGame()}
                onLeave={handleReturnToLobby}
                leaving={leaving}
            />
        );
    }

    if (phase === GROUP_GAME_PHASE.FINISHED) {
        const myResult =
            results.find((result) => result.user_id === user?.id) ||
            players.find((player) => player.user_id === user?.id);
        const pendingCount = getPendingGroupPlayers(players).length;

        return (
            <div className="mp-page group-result-page">
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
                                <strong>{myResult?.rank ? `${myResult.rank}위` : "확정 중"}</strong>
                            </div>
                            <div>
                                <span>이동 횟수</span>
                                <strong>{myResult?.move_count ?? clickCount}회</strong>
                            </div>
                            <div>
                                <span>기록</span>
                                <strong>
                                    {formatDuration(myResult?.elapsed_seconds ?? elapsedSeconds)}
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
        const selectedPlayer =
            players.find((player) => player.user_id === selectedSpectatorId) ||
            getPendingGroupPlayers(players)[0] ||
            myPlayer;
        const selectedPath = Array.isArray(selectedPlayer?.path_titles)
            ? selectedPlayer.path_titles
            : [];

        return (
            <div className="mp-page group-spectator-page">
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
                                    const inactive = isGroupPlayerInactive(player);
                                    return (
                                        <button
                                            type="button"
                                            key={player.id || player.user_id}
                                            className={`group-spectator-player ${
                                                selectedPlayer?.user_id === player.user_id ? "active" : ""
                                            }`}
                                            onClick={() => setSelectedSpectatorId(player.user_id)}
                                        >
                                            <span>
                                                {isMe ? "나" : player.nickname_snapshot || "참가자"}
                                            </span>
                                            <strong>
                                                {player.has_finished
                                                    ? `${player.rank ?? "-"}위 · 완주 · ${player.move_count ?? 0}회`
                                                    : inactive
                                                        ? "DNF · 게임 이탈"
                                                        : `진행 중 · ${player.current_title || "문서 확인 중"} · ${player.move_count ?? 0}회`}
                                            </strong>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="mp-card group-spectator-detail-card">
                            <span className="mp-badge">LIVE PATH</span>
                            <h2>{selectedPlayer?.nickname_snapshot || "참가자"}의 이동 경로</h2>
                            <p className="group-spectator-current">
                                현재 문서: <strong>{selectedPlayer?.current_title || "확인 중"}</strong>
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
                                        player.result_status === "dnf" ? "dnf" : ""
                                    }`}
                                >
                                    <strong>
                                        {player.result_status === "dnf"
                                            ? "DNF"
                                            : `${player.rank ?? "-"}위`}
                                        {" · "}
                                        {player.nickname_snapshot || "참가자"}
                                    </strong>
                                    <span>
                                        {player.result_status === "dnf"
                                            ? player.leave_reason || "게임 이탈 또는 미완주"
                                            : `${player.move_count ?? 0}회 · ${formatDuration(player.elapsed_seconds ?? 0)}`}
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
                    onComplete={() => {
                        saveLocalGameState({ enteredPlaying: true });
                        setPhase(GROUP_GAME_PHASE.PLAYING);
                    }}
                />
            )}

            {(phase === GROUP_GAME_PHASE.PICKING ||
                phase === GROUP_GAME_PHASE.COUNTDOWN ||
                phase === GROUP_GAME_PHASE.PLAYING) && (
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
                    />
                )}

            {phase === GROUP_GAME_PHASE.PLAYING && (
                <>
                    <FloatingHud
                        targetTitle={target.title}
                        elapsedSeconds={elapsedSeconds}
                        clickCount={clickCount}
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
