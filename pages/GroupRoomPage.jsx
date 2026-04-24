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

            <div className="mp-container">
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
                        모든 참가자가 목표 문서를 제출하고 준비하면 방장이 시작할 수
                        있습니다.
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

                <div className="mp-card-grid">
                    <section className="mp-card">
                        <h2>내 목표 문서 제출</h2>
                        <p>
                            검색 결과에서 문서를 선택하세요. 참가자들이 제출한 문서 중에서
                            시작 문서와 목표 문서가 랜덤으로 결정됩니다.
                        </p>

                        <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                            <input
                                className="mp-room-input"
                                style={{ flex: 1 }}
                                value={keywordInput}
                                disabled={myPlayer?.is_ready || room?.status !== "waiting"}
                                placeholder="예: 거북이, 알베르트 아인슈타인"
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
                                onClick={handleSearch}
                                disabled={
                                    isSearching ||
                                    myPlayer?.is_ready ||
                                    room?.status !== "waiting" ||
                                    !keywordInput.trim()
                                }
                            >
                                {isSearching ? "검색 중..." : "검색"}
                            </button>
                        </div>

                        {targetSuggestions.length > 0 && (
                            <div
                                className="room-target-suggestions"
                                style={{
                                    marginTop: "12px",
                                    border: "1px solid var(--line-main, rgba(255,255,255,0.14))",
                                    borderRadius: "12px",
                                    overflow: "hidden",
                                }}
                            >
                                {targetSuggestions.map((item) => (
                                    <button
                                        key={item.title}
                                        type="button"
                                        onClick={() => handleSelectTarget(item)}
                                        style={{
                                            width: "100%",
                                            padding: "10px 12px",
                                            textAlign: "left",
                                            border: "none",
                                            borderBottom:
                                                "1px solid var(--line-main, rgba(255,255,255,0.12))",
                                            background:
                                                selectedTarget?.title === item.title
                                                    ? "rgba(96,165,250,0.18)"
                                                    : "rgba(255,255,255,0.04)",
                                            color: "var(--text-main, #fff)",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <strong style={{ display: "block" }}>{item.title}</strong>
                                        <span
                                            style={{
                                                display: "block",
                                                marginTop: "4px",
                                                color: "var(--text-muted, rgba(255,255,255,0.72))",
                                                fontSize: "13px",
                                            }}
                                            dangerouslySetInnerHTML={{ __html: item.snippet || "" }}
                                        />
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedTarget?.title && (
                            <div
                                style={{
                                    marginTop: "12px",
                                    padding: "10px 12px",
                                    borderRadius: "12px",
                                    background: "rgba(96,165,250,0.14)",
                                    color: "var(--text-main, #fff)",
                                }}
                            >
                                선택한 문서: <strong>{selectedTarget.title}</strong>
                            </div>
                        )}

                        {!myPlayer?.is_ready ? (
                            <button
                                type="button"
                                className="mp-action-btn mp-action-btn--primary"
                                style={{ marginTop: "16px", width: "100%" }}
                                onClick={handleReady}
                                disabled={!selectedTarget?.title || room?.status !== "waiting"}
                            >
                                ✅ 준비 완료
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="mp-action-btn"
                                style={{ marginTop: "16px", width: "100%" }}
                                onClick={handleUnready}
                                disabled={room?.status !== "waiting"}
                            >
                                준비 해제
                            </button>
                        )}
                    </section>

                    <section className="mp-card">
                        <h2>참가자 목록</h2>
                        <p>
                            참가자들이 제출한 문서 중에서 게임의 시작 문서와 목표 문서가
                            정해집니다.
                        </p>

                        <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
                            {players.map((player) => (
                                <div
                                    key={player.id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "10px",
                                        padding: "10px 12px",
                                        borderRadius: "14px",
                                        background: "rgba(255,255,255,0.06)",
                                        border: "1px solid var(--line-main, rgba(255,255,255,0.12))",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <div className="room-player-avatar" style={{ width: 36, height: 36 }}>
                                            {player.profile_image_snapshot ? (
                                                <img
                                                    src={player.profile_image_snapshot}
                                                    alt={player.nickname_snapshot || "player"}
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                        borderRadius: "999px",
                                                        objectFit: "cover",
                                                    }}
                                                />
                                            ) : (
                                                (player.nickname_snapshot || "U").charAt(0).toUpperCase()
                                            )}
                                        </div>

                                        <div>
                                            <strong>{player.nickname_snapshot || "참가자"}</strong>
                                            <div
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--text-muted, rgba(255,255,255,0.72))",
                                                }}
                                            >
                                                {player.role === "host" ? "방장" : "참가자"}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ textAlign: "right" }}>
                                        <div
                                            style={{
                                                fontSize: "13px",
                                                fontWeight: 800,
                                                color: player.is_ready ? "#86efac" : "var(--text-muted)",
                                            }}
                                        >
                                            {player.is_ready ? "READY" : "WAIT"}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "12px",
                                                color: "var(--text-muted, rgba(255,255,255,0.72))",
                                                maxWidth: "160px",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                            title={player.submitted_target_title || ""}
                                        >
                                            {player.submitted_target_title || "문서 미선택"}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div style={{ marginTop: "24px", textAlign: "center" }}>
                    {isHost ? (
                        <button
                            type="button"
                            className="mp-action-btn mp-action-btn--primary"
                            onClick={handleStart}
                            disabled={!canStart || starting}
                        >
                            {starting
                                ? "시작 중..."
                                : canStart
                                    ? "🚀 단체모드 시작"
                                    : `최소 ${minPlayers}명 + 전원 준비 필요`}
                        </button>
                    ) : (
                        <p className="mp-subtitle">
                            모든 참가자가 준비하면 방장이 게임을 시작할 수 있습니다.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}