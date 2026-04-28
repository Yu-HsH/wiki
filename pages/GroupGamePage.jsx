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
    const [pathTitles, setPathTitles] = useState([]);

    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [clickCount, setClickCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const timerRef = useRef(null);
    const startTimeRef = useRef(null);
    const finishedRef = useRef(false);

    const storageKey = user?.id && roomId
        ? `wiki-group-game-state:${roomId}:${user.id}`
        : null;

    const saveLocalGameState = useCallback((patch = {}) => {
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
    }, [storageKey]);

    const loadLocalGameState = useCallback(() => {
        if (!storageKey) return null;

        try {
            return JSON.parse(localStorage.getItem(storageKey) || "null");
        } catch {
            return null;
        }
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

    const refreshRoomState = useCallback(async () => {
        if (!roomId) return;

        const [latestRoom, latestPlayers] = await Promise.all([
            fetchGroupRoom(roomId),
            fetchGroupRoomPlayers(roomId),
        ]);

        setRoom(latestRoom);
        setPlayers(latestPlayers);

        if (latestRoom.status === "finished") {
            const latestResults = await fetchGroupResults(roomId).catch(() => []);
            setResults(latestResults);
            setPhase(GROUP_PHASE.FINISHED);
        }
    }, [roomId]);

    useEffect(() => {
        const loadGame = async () => {
            if (!roomId || !user?.id) return;

            try {
                setPhase(GROUP_PHASE.LOADING);
                setError("");

                const [roomData, playerData] = await Promise.all([
                    fetchGroupRoom(roomId),
                    fetchGroupRoomPlayers(roomId),
                ]);

                setRoom(roomData);
                setPlayers(playerData);

                if (!roomData.group_start_title || !roomData.group_target_title) {
                    throw new Error("단체모드 시작 문서 또는 목표 문서가 설정되지 않았습니다.");
                }

                const saved = loadLocalGameState();
                const me = playerData.find((player) => player.user_id === user.id);

                const restoreTitle =
                    saved?.currentTitle || myPlayer?.current_title || roomData.group_start_title;

                const restorePage = await fetchPageData(restoreTitle);

                setStartTitle(roomData.group_start_title);
                setCurrentTitle(restorePage.title);
                setCurrentSummary(restorePage.summary);
                setCurrentDocumentHtml(restorePage.documentHtml);
                setLinks(restorePage.links);
                setPathTitles(saved?.pathTitles || [restorePage.title]);
                setClickCount(saved?.clickCount || myPlayer?.move_count || 0);
                setElapsedSeconds(saved?.elapsedSeconds || 0);

                setTarget({
                    title: roomData.group_target_title,
                    summary: "단체모드 목표 문서입니다. 가장 빠르게 도착해보세요.",
                    requestedKeyword: "",
                    mode: "group",
                });

                setElapsedSeconds(0);
                setClickCount(0);
                finishedRef.current = false;

                if (roomData.status === "finished") {
                    const latestResults = await fetchGroupResults(roomId).catch(() => []);
                    setResults(latestResults);
                    setPhase(GROUP_PHASE.FINISHED);
                } else {
                    setPhase(GROUP_PHASE.PICKING);
                }
            } catch (e) {
                console.error(e);
                setError(e.message || "단체모드 게임을 불러오지 못했습니다.");
            }
        };

        loadGame();
    }, [roomId, user?.id, loadLocalGameState]);

    useEffect(() => {
        if (!roomId || !supabase) return;

        const channel = supabase
            .channel(`group-game:${roomId}`)
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
                        const latestPlayers = await fetchGroupRoomPlayers(roomId);
                        setPlayers(latestPlayers);
                    } catch (error) {
                        console.error("group game players refresh failed:", error);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId, refreshRoomState]);

    useEffect(() => {
        if (phase === GROUP_PHASE.PLAYING) {
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

    useEffect(() => {
        if (room?.status === "finished" && phase !== GROUP_PHASE.FINISHED) {
            fetchGroupResults(roomId)
                .then((data) => setResults(data))
                .catch(() => { })
                .finally(() => setPhase(GROUP_PHASE.FINISHED));
        }
    }, [room?.status, phase, roomId]);

    const handleMove = async (nextTitle) => {
        if (phase !== GROUP_PHASE.PLAYING || isLoading || finishedRef.current) return;

        setClickCount((prev) => prev + 1);
        setIsLoading(true);
        setError("");

        try {
            const page = await fetchPageData(nextTitle);

            setCurrentTitle(page.title);
            setCurrentSummary(page.summary);
            setCurrentDocumentHtml(page.documentHtml);
            setLinks(page.links);

            const nextClickCount = clickCount + 1;
            const newPath = [...pathTitles, page.title];
            setPathTitles(newPath);

            saveLocalGameState({
                currentTitle: page.title,
                pathTitles: newPath,
                clickCount: nextClickCount,
                elapsedSeconds,
            });

            await updateGroupPlayerProgress(roomId, user.id, {
                currentTitle: page.title,
                moveCount: nextClickCount,
                pathTitles: newPath,
            }).catch((error) => {
                console.warn("progress update failed:", error);
            });

            window.scrollTo({ top: 0, behavior: "smooth" });

            if (checkWin(page.title, target.title)) {
                finishedRef.current = true;

                if (storageKey) {
                    localStorage.removeItem(storageKey);
                }

                const finishResult = await finishGroupPlayer(roomId, {
                    elapsedSeconds,
                    moveCount: nextClickCount,
                    currentTitle: page.title,
                    pathTitles: newPath,
                });

                await refreshRoomState();

                if (finishResult?.result_room_status === "finished") {
                    const latestResults = await fetchGroupResults(roomId).catch(() => []);
                    setResults(latestResults);
                    setPhase(GROUP_PHASE.FINISHED);
                }
            }
        } catch (e) {
            console.error(e);
            setError(e.message || "문서를 불러오는 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReturnToLobby = () => {
        navigate("/multiplayer");
    };

    if (phase === GROUP_PHASE.LOADING) {
        return (
            <div className="mp-page">
                <div className="mp-container">
                    <div className="mp-title-block">
                        <span className="mp-badge">GROUP GAME</span>
                        <h1 className="mp-title">단체모드 게임 준비 중...</h1>
                        <p className="mp-subtitle">시작 문서와 목표 문서를 불러오고 있습니다.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mp-page">
                <div className="mp-container">
                    <div className="mp-title-block">
                        <span className="mp-badge">ERROR</span>
                        <h1 className="mp-title">단체모드 게임 오류</h1>
                        <p className="mp-error">{error}</p>
                        <button
                            type="button"
                            className="mp-action-btn"
                            onClick={handleReturnToLobby}
                        >
                            온라인 플레이로 돌아가기
                        </button>
                    </div>
                </div>
            </div>
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
                <CountdownOverlay onComplete={() => setPhase(GROUP_PHASE.PLAYING)} />
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