import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../authContext";
import {
    fetchGroupRoom,
    fetchGroupRoomPlayers,
    joinGroupRoom,
    leaveGroupRoom,
    submitGroupKeyword,
    unreadyGroupPlayer,
    startGroupRoomGame,
} from "../services/groupMultiplayerService";
import { searchWikiTitleCandidates } from "../services/wikiService";

export default function GroupRoomPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [room, setRoom] = useState(null);
    const [players, setPlayers] = useState([]);
    const [pending, setPending] = useState(true);
    const [submitError, setSubmitError] = useState("");
    const [starting, setStarting] = useState(false);

    const [keywordInput, setKeywordInput] = useState("");
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [targetSuggestions, setTargetSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const myPlayer = useMemo(
        () => players.find((player) => player.user_id === user?.id),
        [players, user?.id]
    );

    const isHost = room?.host_user_id === user?.id;
    const readyCount = players.filter((player) => player.is_ready).length;
    const minPlayers = room?.min_players ?? 3;
    const maxPlayers = room?.max_players ?? 6;
    const canStart =
        isHost &&
        room?.status === "waiting" &&
        players.length >= minPlayers &&
        readyCount === players.length;

    useEffect(() => {
        const loadRoom = async () => {
            if (!roomId || !user?.id) return;

            try {
                setPending(true);
                setSubmitError("");

                const roomData = await fetchGroupRoom(roomId);

                if (roomData.status === "waiting") {
                    await joinGroupRoom(roomId, user.id).catch(() => { });
                }

                const playerData = await fetchGroupRoomPlayers(roomId);

                setRoom(roomData);
                setPlayers(playerData);
            } catch (error) {
                setSubmitError(
                    error instanceof Error
                        ? error.message
                        : "단체모드 방 정보를 불러오지 못했습니다."
                );
            } finally {
                setPending(false);
            }
        };

        loadRoom();
    }, [roomId, user?.id]);

    useEffect(() => {
        if (!roomId || !supabase) return;

        const channel = supabase
            .channel(`group-room:${roomId}`)
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
                        const latestRoom = await fetchGroupRoom(roomId);
                        setRoom(latestRoom);
                    } catch (error) {
                        console.error("group room refresh failed:", error);
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
                        console.error("group players refresh failed:", error);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId]);

    useEffect(() => {
        if (!room || room.status !== "starting") return;

        navigate(`/multiplayer/group/game/${roomId}`);
    }, [room, roomId, navigate]);

    useEffect(() => {
        if (!myPlayer) return;

        if (myPlayer.submitted_target_title) {
            setKeywordInput(myPlayer.submitted_target_title);
            setSelectedTarget({
                title: myPlayer.submitted_target_title,
                snippet: "",
            });
        }
    }, [myPlayer]);

    const handleSearch = async () => {
        if (!keywordInput.trim() || myPlayer?.is_ready) return;

        try {
            setIsSearching(true);
            setSubmitError("");
            setSelectedTarget(null);

            const results = await searchWikiTitleCandidates(keywordInput.trim(), 7);
            setTargetSuggestions(results);

            if (results.length === 0) {
                setSubmitError("검색 결과가 없습니다. 다른 키워드를 입력해 주세요.");
            }
        } catch (error) {
            console.error(error);
            setSubmitError("검색 중 오류가 발생했습니다.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectTarget = (item) => {
        setSelectedTarget(item);
        setKeywordInput(item.title);
        setTargetSuggestions([]);
        setSubmitError("");
    };

    const handleReady = async () => {
        if (!roomId || !user?.id) return;

        if (!selectedTarget?.title) {
            setSubmitError("검색 결과에서 목표 문서를 선택해주세요.");
            return;
        }

        try {
            setSubmitError("");

            await submitGroupKeyword(roomId, user.id, {
                rawKeyword: keywordInput.trim(),
                selectedTitle: selectedTarget.title,
            });

            const latestPlayers = await fetchGroupRoomPlayers(roomId);
            setPlayers(latestPlayers);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : "준비 완료에 실패했습니다."
            );
        }
    };

    const handleUnready = async () => {
        if (!roomId || !user?.id) return;

        try {
            setSubmitError("");
            await unreadyGroupPlayer(roomId, user.id);

            const latestPlayers = await fetchGroupRoomPlayers(roomId);
            setPlayers(latestPlayers);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : "준비 해제에 실패했습니다."
            );
        }
    };

    const handleStart = async () => {
        if (!roomId) return;

        try {
            setStarting(true);
            setSubmitError("");
            await startGroupRoomGame(roomId);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : "단체모드 시작에 실패했습니다."
            );
        } finally {
            setStarting(false);
        }
    };

    const handleLeave = async () => {
        try {
            if (roomId && user?.id) {
                await leaveGroupRoom(roomId, user.id);
            }
        } catch (error) {
            console.error("leave group room failed:", error);
        } finally {
            navigate("/multiplayer");
        }
    };

    const handleCopyCode = () => {
        navigator.clipboard?.writeText(room?.room_code ?? roomId ?? "");
    };

    if (pending) {
        return (
            <div className="mp-page">
                <div className="mp-container">
                    <header className="mp-header">
                        <button type="button" className="mp-back-btn" onClick={handleLeave}>
                            ← 온라인 플레이
                        </button>
                    </header>

                    <div className="mp-title-block">
                        <span className="mp-badge">GROUP ROOM</span>
                        <h1 className="mp-title">단체모드 방 불러오는 중...</h1>
                        <p className="mp-subtitle">참가자 정보를 확인하고 있습니다.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (submitError && !room) {
        return (
            <div className="mp-page">
                <div className="mp-container">
                    <header className="mp-header">
                        <button type="button" className="mp-back-btn" onClick={handleLeave}>
                            ← 온라인 플레이
                        </button>
                    </header>

                    <div className="mp-title-block">
                        <span className="mp-badge">ERROR</span>
                        <h1 className="mp-title">방 정보를 불러오지 못했습니다</h1>
                        <p className="mp-error">{submitError}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mp-page">
            <div className="mp-glow mp-glow--1" />
            <div className="mp-glow mp-glow--2" />

            <div className="mp-container" style={{ width: "min(1000px, 100%)" }}>
                <header className="mp-header">
                    <button type="button" className="mp-back-btn" onClick={handleLeave}>
                        ← 온라인 플레이
                    </button>
                </header>

                <div className="room-code-banner">
                    <span className="room-code-label">GROUP ROOM CODE</span>
                    <button
                        type="button"
                        className="room-code-value"
                        onClick={handleCopyCode}
                        title="클릭하여 복사"
                    >
                        {room?.room_code ?? roomId}
                        <span className="room-code-copy">📋</span>
                    </button>
                </div>

                <div className="mp-title-block">
                    <span className="mp-badge">GROUP MODE</span>
                    <h1 className="mp-title">단체모드 대기실</h1>
                    <p className="mp-subtitle">
                        최소 {minPlayers}명, 최대 {maxPlayers}명까지 참가할 수 있습니다.
                    </p>
                </div>

                <div className="room-status">
                    <div className="room-status-pill room-status--setting">
                        👥 {players.length}/{maxPlayers}명 참가 · ✅ {readyCount}/
                        {players.length}명 준비
                    </div>

                    {room?.status === "starting" && (
                        <div className="room-status-pill room-status--starting">
                            🚀 게임 시작 중...
                        </div>
                    )}
                </div>

                {submitError && (
                    <div className="mp-error" style={{ marginBottom: "16px" }}>
                        {submitError}
                    </div>
                )}

                <div className="group-room-layout">
                    {/* 왼쪽: 내 설정 카드 */}
                    <section className="mp-card group-my-card">
                        <div className="group-my-profile">
                            <div className="room-player-avatar" style={{ width: 44, height: 44 }}>
                                {user?.photoURL ? (
                                    <img
                                        src={user.photoURL}
                                        alt="me"
                                        style={{ width: "100%", height: "100%", borderRadius: "999px" }}
                                    />
                                ) : (
                                    (user?.displayName || "U").charAt(0).toUpperCase()
                                )}
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "18px" }}>{user?.displayName || "나"}</h2>
                                <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                                    내 목표 문서 제출
                                </p>
                            </div>
                        </div>

                        <p className="mp-card-desc" style={{ textAlign: "left", fontSize: "12px" }}>
                            참가자들이 제출한 문서 중 하나가 시작/목표로 랜덤 결정됩니다.
                        </p>

                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            <input
                                className="mp-room-input"
                                style={{ flex: 1, textAlign: "left", fontSize: "14px" }}
                                value={keywordInput}
                                disabled={myPlayer?.is_ready || room?.status !== "waiting"}
                                placeholder="목표 문서 검색"
                                onChange={(e) => {
                                    setKeywordInput(e.target.value);
                                    setSelectedTarget(null);
                                    setTargetSuggestions([]);
                                    setSubmitError("");
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSearch();
                                }}
                            />
                            <button
                                type="button"
                                className="mp-action-btn"
                                style={{ padding: "0 16px" }}
                                onClick={handleSearch}
                                disabled={isSearching || myPlayer?.is_ready || !keywordInput.trim()}
                            >
                                {isSearching ? "..." : "검색"}
                            </button>
                        </div>

                        {targetSuggestions.length > 0 && (
                            <div className="room-target-suggestions group-suggestions">
                                {targetSuggestions.map((item) => (
                                    <button
                                        key={item.title}
                                        type="button"
                                        onClick={() => handleSelectTarget(item)}
                                        className={selectedTarget?.title === item.title ? "active" : ""}
                                    >
                                        <strong>{item.title}</strong>
                                        <span dangerouslySetInnerHTML={{ __html: item.snippet || "" }} />
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedTarget?.title && (
                            <div className="group-selected-target">
                                선택됨: <strong>{selectedTarget.title}</strong>
                            </div>
                        )}

                        {!myPlayer?.is_ready ? (
                            <button
                                type="button"
                                className="mp-action-btn mp-action-btn--primary"
                                style={{ marginTop: "16px", width: "100%", height: "48px" }}
                                onClick={handleReady}
                                disabled={!selectedTarget?.title || room?.status !== "waiting"}
                            >
                                ✅ 준비 완료
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="mp-action-btn"
                                style={{
                                    marginTop: "16px",
                                    width: "100%",
                                    height: "48px",
                                    background: "rgba(255,255,255,0.08)"
                                }}
                                onClick={handleUnready}
                                disabled={room?.status !== "waiting"}
                            >
                                준비 해제
                            </button>
                        )}
                    </section>

                    {/* 오른쪽: 참가자 목록 */}
                    <section className="mp-card group-player-list-card">
                        <div className="group-player-list-header">
                            <h2>참가자 목록</h2>
                            <span>{players.length} / {maxPlayers}</span>
                        </div>

                        <div className="group-player-list">
                            {players.map((player) => (
                                <div key={player.id} className="group-player-row">
                                    <div className="group-player-info">
                                        <div className="room-player-avatar" style={{ width: 32, height: 32, fontSize: "14px" }}>
                                            {player.profile_image_snapshot ? (
                                                <img
                                                    src={player.profile_image_snapshot}
                                                    alt="avatar"
                                                    style={{ width: "100%", height: "100%", borderRadius: "50%" }}
                                                />
                                            ) : (
                                                (player.nickname_snapshot || "U").charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div className="group-player-name-block">
                                            <div className="group-player-name">
                                                {player.nickname_snapshot || "참가자"}
                                                {player.role === "host" && <span className="host-badge">HOST</span>}
                                            </div>
                                            <div className="group-player-doc">
                                                {player.submitted_target_title || "문서 미선택"}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`group-player-status ${player.is_ready ? "ready" : ""}`}>
                                        {player.is_ready ? "READY" : "WAIT"}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 방장 시작 버튼은 목록 하단에 위치 */}
                        {isHost && (
                            <button
                                type="button"
                                className="mp-action-btn mp-action-btn--primary"
                                style={{ marginTop: "20px", width: "100%", height: "48px" }}
                                onClick={handleStart}
                                disabled={!canStart || starting}
                            >
                                {starting ? "시작 중..." : canStart ? "🚀 게임 시작" : "대기 중..."}
                            </button>
                        )}
                        {!isHost && !canStart && (
                            <p style={{ marginTop: "16px", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                                모든 참가자가 준비하면 방장이 게임을 시작합니다.
                            </p>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}