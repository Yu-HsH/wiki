import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";

import {
    fetchGroupRoom,
    fetchGroupRoomPlayers,
    updateGroupPlayerProgress,
    finishGroupPlayer,
    fetchGroupResults,
    leaveGroupRoom,
} from "../services/groupMultiplayerService";

import {
    fetchPageData,
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

import { recordGroupMatchHistory } from "../services/profileStatsService";
import { trackEvent } from "../services/analyticsService";
const GROUP_PHASE = {
    LOADING: "LOADING",
    PICKING: "PICKING",
    COUNTDOWN: "COUNTDOWN",
    PLAYING: "PLAYING",
    FINISHED: "FINISHED",
};

export default function GroupGamePage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [phase, setPhase] = useState(GROUP_PHASE.LOADING);
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
    const [recovery, setRecovery] = useState({
        mode: "recovering",
        message: "서버에서 현재 게임 상태를 확인하고 있습니다.",
    });
    const [leaving, setLeaving] = useState(false);
    const [connectionVersion, setConnectionVersion] = useState(0);

    const timerRef = useRef(null);
    const startTimeRef = useRef(null);
    const finishedRef = useRef(false);
    const hasRecordedRef = useRef(false);
    const playStartTrackedRef = useRef(false);
    const recoveryGenerationRef = useRef(0);
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

    const recoverGame = useCallback(async () => {
        if (!roomId || !user?.id) return;

        const generation = recoveryGenerationRef.current + 1;
        recoveryGenerationRef.current = generation;
        setPhase(GROUP_PHASE.LOADING);
        setRecovery({
            mode: "recovering",
            message: "서버에서 참가 상태와 현재 문서를 다시 확인하고 있습니다.",
        });

        try {
            const restored = await retryRecoverable(
                async () => {
                    const session = await fetchValidatedSession();
                    if (session.outcome === "finished") return { session, page: null };
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
            setStartTitle(session.room.group_start_title || "");
            setTarget({
                title: session.room.group_target_title || "",
                summary: "단체모드 목표 문서입니다. 가장 빠르게 도착해보세요.",
                requestedKeyword: "",
                mode: "group",
            });

            if (session.outcome === "finished") {
                finishedRef.current = true;
                clearLocalGameState();
                const latestResults = await fetchGroupResults(roomId).catch(() => []);
                if (recoveryGenerationRef.current !== generation) return;
                setResults(latestResults);
                setRecovery(null);
                setPhase(GROUP_PHASE.FINISHED);
                setConnectionVersion((prev) => prev + 1);
                return;
            }

            const saved = loadLocalGameState();
            const enteredPlaying = saved?.enteredPlaying === true || session.moveCount > 0;

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
            setPhase(enteredPlaying ? GROUP_PHASE.PLAYING : GROUP_PHASE.PICKING);
            setConnectionVersion((prev) => prev + 1);
        } catch (error) {
            if (recoveryGenerationRef.current !== generation) return;
            const normalized = normalizeOnlineGameError(
                error,
                "일시적으로 게임 연결을 복구하지 못했습니다."
            );
            console.error("group game recovery failed:", normalized.cause || error);

            if (!normalized.recoverable) clearLocalGameState();
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

        if (session.outcome === "finished") {
            clearLocalGameState();
            const latestResults = await fetchGroupResults(roomId).catch(() => []);
            setResults(latestResults);
            setPhase(GROUP_PHASE.FINISHED);
        }
    }, [roomId, fetchValidatedSession, clearLocalGameState]);

    useEffect(() => {
        recoverGame();
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
                setPhase(GROUP_PHASE.LOADING);
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
        if (phase === GROUP_PHASE.PLAYING) {
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

            if (phase !== GROUP_PHASE.FINISHED) {
                fetchGroupResults(roomId)
                    .then((data) => setResults(data))
                    .catch(() => { })
                    .finally(() => setPhase(GROUP_PHASE.FINISHED));
            }
        }
    }, [room?.status, phase, roomId]);

    const handleMove = async (nextTitle) => {
        if (
            phase !== GROUP_PHASE.PLAYING ||
            isLoading ||
            moveInFlightRef.current ||
            finishedRef.current
        ) return;

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
                clearLocalGameState();
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
            setPhase(GROUP_PHASE.LOADING);
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
        clearLocalGameState();

        if (timerRef.current) clearInterval(timerRef.current);
        if (realtimeChannelRef.current) {
            const channel = realtimeChannelRef.current;
            realtimeChannelRef.current = null;
            await supabase.removeChannel(channel).catch(() => { });
        }

        const shouldNotifyServer =
            room &&
            ["starting", "playing"].includes(room.status) &&
            myPlayer &&
            !myPlayer.has_finished;

        try {
            if (shouldNotifyServer) await leaveGroupRoom(roomId, user.id);
        } catch (error) {
            console.error("leave group game failed:", error);
        } finally {
            navigate("/multiplayer", { replace: true });
        }
    };

    if (recovery || phase === GROUP_PHASE.LOADING) {
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

    if (phase === GROUP_PHASE.FINISHED) {
        const myResult =
            results.find((result) => result.user_id === user?.id) ||
            players.find((player) => player.user_id === user?.id);

        const rankedResults = results.length > 0 ? results : finishedPlayers;

        return (
            <div className="mp-page">
                <div className="mp-container">
                    <div className="mp-title-block">
                        <span className="mp-badge">RESULT</span>
                        <h1 className="mp-title">
                            {myResult?.rank && myResult.rank <= finishRankLimit
                                ? `${myResult.rank}등으로 도착!`
                                : "이번 라운드는 패배했습니다"}
                        </h1>
                        <p className="mp-subtitle">
                            목표 문서: <strong>{target.title}</strong>
                        </p>
                    </div>

                    <section className="mp-card" style={{ maxWidth: 720, margin: "0 auto" }}>
                        <h2>상위 {finishRankLimit}명 결과</h2>

                        <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
                            {rankedResults.slice(0, finishRankLimit).map((player) => (
                                <div
                                    key={player.id || player.user_id}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "12px 14px",
                                        borderRadius: "14px",
                                        background: "rgba(255,255,255,0.06)",
                                        border: "1px solid var(--line-main, rgba(255,255,255,0.12))",
                                    }}
                                >
                                    <strong>
                                        {player.rank}등 · {player.nickname_snapshot || "참가자"}
                                    </strong>
                                    <span style={{ color: "var(--text-muted)" }}>
                                        {player.move_count ?? 0}회 이동
                                    </span>
                                </div>
                            ))}

                            {rankedResults.length === 0 && (
                                <p className="mp-subtitle">결과를 불러오는 중입니다...</p>
                            )}
                        </div>

                        <button
                            type="button"
                            className="mp-action-btn mp-action-btn--primary"
                            style={{ width: "100%", marginTop: "20px" }}
                            onClick={handleReturnToLobby}
                        >
                            확인
                        </button>
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="wiki-game-page">
            {phase === GROUP_PHASE.PICKING && (
                <GroupPickOverlay
                    candidates={candidates}
                    startTitle={room?.group_start_title}
                    targetTitle={room?.group_target_title}
                    onComplete={() => setPhase(GROUP_PHASE.COUNTDOWN)}
                />
            )}

            {phase === GROUP_PHASE.COUNTDOWN && (
                <CountdownOverlay
                    onComplete={() => {
                        saveLocalGameState({ enteredPlaying: true });
                        setPhase(GROUP_PHASE.PLAYING);
                    }}
                />
            )}

            {(phase === GROUP_PHASE.PICKING ||
                phase === GROUP_PHASE.COUNTDOWN ||
                phase === GROUP_PHASE.PLAYING) && (
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

            {phase === GROUP_PHASE.PLAYING && (
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
