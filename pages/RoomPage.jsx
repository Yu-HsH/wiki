import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchRoom,
  fetchRoomPlayers,
  joinRoom,
  setDuelTargetV2,
  leaveRoom,
  startRoomGame,
} from "../services/multiplayerService";
import {
  fetchDistinctRandomTitle,
  fetchPageData,
  fetchPageSummary,
  normalizeTitle,
  searchWikiTitleCandidates,
} from "../services/wikiService";
import { ensureWikiSnapshot } from "../services/wikiSnapshotService";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient";
import UserProfileModal from "../components/UserProfileModal";

/**
 * 대전 대기실 페이지
 *
 * 변경 포인트:
 * - 방장만 "검색 → 후보 선택 → 즉시 저장", 양쪽 공통 목표를 공개한다.
 * - raw keyword(keywordInput)와 실제 target_title(selectedTargetTitle)를 분리
 * - 자동 보정 / 자동 확정 제거
 */
export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ----------------------------
  // 기본 상태
  // ----------------------------
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pending, setPending] = useState(true);
  const [submitError, setSubmitError] = useState("");

  // 입력 / 선택 상태 분리
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedTargetTitle, setSelectedTargetTitle] = useState("");
  const [targetSuggestions, setTargetSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetSaveFailed, setTargetSaveFailed] = useState(false);
  const lobbyActionRef = useRef(false);
  // 참가자 읽기 세대. 이벤트마다 다시 읽으므로 응답이 순서를 바꿔 도착할 수 있다 —
  // 마지막에 시작한 읽기만 화면에 쓴다 (SF-A2: RPC 읽기가 그 창을 넓혔다).
  const playersReadRef = useRef(0);
  const readLatestPlayers = async () => {
    const readId = ++playersReadRef.current;
    const rows = await fetchRoomPlayers(roomId);
    return readId === playersReadRef.current ? rows : null;
  };

  // 시작 버튼 로딩
  const [starting, setStarting] = useState(false);

  // 모달 상태
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handlePlayerClick = (userId) => {
    if (!userId) return;
    setSelectedUserId(userId);
    setIsModalOpen(true);
  };

  // ----------------------------
  // 초기 로드
  // ----------------------------
  useEffect(() => {
    const loadRoom = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);
        setSubmitError("");

        const roomData = await fetchRoom(roomId);

        // waiting 방에 직접 진입한 guest면 join 시도
        if (roomData.status === "waiting") {
          await joinRoom(roomId, user.id).catch(() => { });
        }

        const playerData = await fetchRoomPlayers(roomId);

        setRoom(roomData);
        setPlayers(playerData);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "방 정보를 불러오지 못했습니다."
        );
      } finally {
        setPending(false);
      }
    };

    loadRoom();
  }, [roomId, user?.id]);

  // ----------------------------
  // Realtime 구독
  // ----------------------------
  useEffect(() => {
    if (!roomId || !supabase) return;

    const channel = supabase
      .channel(`room:${roomId}`)
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
          } catch (error) {
            console.error("game_rooms realtime refresh failed:", error);
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
            const latestPlayers = await readLatestPlayers();
            if (latestPlayers) setPlayers(latestPlayers);
          } catch (error) {
            console.error("room_players realtime refresh failed:", error);
          }
        }
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        // Join/target changes can occur between the initial SELECT and socket
        // subscription. Refresh once when connected (also on reconnect).
        try {
          const [latestRoom, latestPlayers] = await Promise.all([
            fetchRoom(roomId), readLatestPlayers(),
          ]);
          setRoom(latestRoom);
          if (latestPlayers) setPlayers(latestPlayers);
        } catch (error) {
          console.error("room subscription refresh failed:", error);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // ----------------------------
  // players 기반 파생값
  // ----------------------------
  const hostPlayer = useMemo(
    () => players.find((player) => player.user_id === room?.host_user_id),
    [players, room?.host_user_id]
  );

  const myPlayer = useMemo(
    () => players.find((player) => player.user_id === user?.id),
    [players, user?.id]
  );

  const opponentPlayer = useMemo(
    () => players.find((player) => player.user_id !== user?.id),
    [players, user?.id]
  );

  const isHost = !!user?.id && room?.host_user_id === user.id;
  const hasGuest = players.length === 2 && !!hostPlayer && !!opponentPlayer;
  const hasHostTarget = !!(hostPlayer?.target_title && hostPlayer?.target_page_id);
  const canStart = isHost && hasGuest && hasHostTarget && room?.status === "waiting"
    && !savingTarget && !isSearching && !starting && !targetSaveFailed;
  const targetBusy = savingTarget || isSearching || starting;

  // ----------------------------
  // DB -> 로컬 입력값 동기화
  // - 이미 저장된 target_title이 있으면 복원
  // ----------------------------
  useEffect(() => {
    if (!isHost) return;

    if (hostPlayer?.target_title) {
      setSelectedTargetTitle(hostPlayer.target_title);
      setKeywordInput(hostPlayer.target_title);
    } else {
      setSelectedTargetTitle("");
    }
  }, [isHost, hostPlayer?.target_title]);

  // ----------------------------
  // room.status 기반 시작
  // ----------------------------
  useEffect(() => {
    if (!room || !["starting", "playing"].includes(room.status)) return;

    navigate(`/multiplayer/game/${roomId}`, {
      state: {
        myTarget: hostPlayer?.target_title || "",
        myStart: myPlayer?.start_title || "",
        opponentName: opponentPlayer?.nickname_snapshot || "상대",
      },
    });
  }, [
    room,
    roomId,
    navigate,
    hostPlayer?.target_title,
    myPlayer?.start_title,
    opponentPlayer?.nickname_snapshot,
  ]);

  // ----------------------------
  // 위키 검색 실행
  // ----------------------------
  const handleSearch = async () => {
    if (!isHost || room?.status !== "waiting" || !keywordInput.trim() || lobbyActionRef.current) return;
    lobbyActionRef.current = true;

    try {
      setIsSearching(true);
      setSubmitError("");
      setTargetSuggestions([]);
      setSelectedTargetTitle("");

      const candidates = await searchWikiTitleCandidates(keywordInput.trim(), 5);
      setTargetSuggestions(candidates);

      if (candidates.length === 0) {
        setSubmitError("검색 결과가 없습니다. 다른 키워드를 입력해 주세요.");
      }
    } catch (error) {
      console.error(error);
      setSubmitError("검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
      lobbyActionRef.current = false;
    }
  };

  // ----------------------------
  // 후보 선택
  // ----------------------------
  const handleSelectSuggestion = async (item) => {
    if (!isHost || room?.status !== "waiting" || !roomId || lobbyActionRef.current) return;
    lobbyActionRef.current = true;
    setSavingTarget(true);
    try {
      setSubmitError("");
      const targetPage = await fetchPageSummary(item.title);
      const targetIdentity = await ensureWikiSnapshot(targetPage);
      const savedPlayer = await setDuelTargetV2(roomId, {
        title: targetIdentity.canonicalTitle,
        pageId: targetIdentity.pageId,
        revisionId: targetIdentity.revisionId,
      });
      setPlayers((previous) => previous.map((player) =>
        player.user_id === savedPlayer.user_id ? savedPlayer : player
      ));
      setSelectedTargetTitle(savedPlayer.target_title);
      setKeywordInput(savedPlayer.target_title);
      setTargetSuggestions([]);
      setTargetSaveFailed(false);
    } catch (error) {
      setTargetSaveFailed(true);
      setSubmitError(
        error?.message || "목표 문서 저장에 실패했습니다. 다시 선택해주세요."
      );
    } finally {
      setSavingTarget(false);
      lobbyActionRef.current = false;
    }
  };

  // ----------------------------
  // 호스트 게임 시작
  // ----------------------------
  const handleStartGame = async () => {
    if (!canStart || !roomId || !user?.id || lobbyActionRef.current) return;
    lobbyActionRef.current = true;

    try {
      setSubmitError("");
      setStarting(true);
      const currentPlayers = await fetchRoomPlayers(roomId);
      const currentHost = currentPlayers.find((player) => player.user_id === room.host_user_id);
      if (currentPlayers.length !== 2 || !currentHost?.target_title || !currentHost?.target_page_id) {
        setPlayers(currentPlayers);
        throw new Error("참가자 2명과 방장이 고른 목표가 있어야 시작할 수 있습니다.");
      }
      const excludedTitles = new Set([normalizeTitle(currentHost.target_title)]);
      const candidateTitle = await fetchDistinctRandomTitle(excludedTitles);
      const candidatePage = await fetchPageData(candidateTitle);
      const startIdentity = await ensureWikiSnapshot(candidatePage);
      await startRoomGame(roomId, user.id, startIdentity);
    } catch (error) {
      console.error("startRoomGame failed:", error);
      setSubmitError(
        error?.message || "게임 시작에 실패했습니다."
      );
    } finally {
      setStarting(false);
      lobbyActionRef.current = false;
    }
  };

  // ----------------------------
  // 대기실 나가기
  // ----------------------------
  const handleLeaveRoom = async () => {
    try {
      if (roomId && user?.id) {
        await leaveRoom(roomId, user.id);
      }
    } catch (error) {
      console.error("leaveRoom failed:", error);
    } finally {
      navigate("/multiplayer");
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(room?.room_code ?? roomId ?? "");
  };

  // ----------------------------
  // 로딩
  // ----------------------------
  if (pending) {
    return (
      <div className="mp-page">
        <div className="mp-glow mp-glow--1" />
        <div className="mp-glow mp-glow--2" />

        <div className="mp-container">
          <header className="mp-header">
            <button type="button" className="mp-back-btn" onClick={handleLeaveRoom}>
              ← 로비로
            </button>
          </header>

          <div className="mp-title-block">
            <span className="mp-badge">ROOM</span>
            <h1 className="mp-title">대기실 불러오는 중...</h1>
            <p className="mp-subtitle">
              플레이어 정보와 방 상태를 확인하고 있습니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------
  // 초기 로드 실패
  // ----------------------------
  if (submitError && !room) {
    return (
      <div className="mp-page">
        <div className="mp-glow mp-glow--1" />
        <div className="mp-glow mp-glow--2" />

        <div className="mp-container">
          <header className="mp-header">
            <button type="button" className="mp-back-btn" onClick={handleLeaveRoom}>
              ← 로비로
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
          <button type="button" className="mp-back-btn" onClick={handleLeaveRoom}>
            ← 로비로
          </button>
        </header>

        <div className="room-code-banner">
          <span className="room-code-label">ROOM CODE</span>
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

        <div className="room-status">
          {!hasGuest && (
            <div className="room-status-pill room-status--waiting">
              <span className="room-pulse" />
              상대를 기다리는 중...
            </div>
          )}

          {hasGuest && !hasHostTarget && room?.status === "waiting" && (
            <div className="room-status-pill room-status--setting">
              🎯 방장이 목표를 고르는 중
            </div>
          )}

          {hasGuest && hasHostTarget && room?.status === "waiting" && !targetBusy && (
            <div className="room-status-pill room-status--ready">
              🎯 공통 목표가 선택되었습니다
            </div>
          )}

          {(starting || room?.status === "starting") && (
            <div className="room-status-pill room-status--starting">
              🚀 게임 시작 중...
            </div>
          )}
        </div>

        {submitError && room && (
          <div className="mp-error" style={{ marginBottom: "16px" }}>
            {submitError}
          </div>
        )}

        <div className="room-players">
          {/* 내 패널 */}
          <div className="room-player-card">
            <div className="room-player-role">
              {isHost ? "👑 HOST" : "⚔️ GUEST"}
            </div>

            <div
              className="room-player-avatar"
              onClick={() => handlePlayerClick(myPlayer?.user_id)}
              style={{ cursor: "pointer" }}
            >
              {(myPlayer?.nickname_snapshot || user?.displayName || "나")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div
              className="room-player-name"
              onClick={() => handlePlayerClick(myPlayer?.user_id)}
              style={{ cursor: "pointer", textDecoration: "underline" }}
            >
              {myPlayer?.nickname_snapshot || user?.displayName || "나"}
            </div>

            {isHost ? (
            <div className="room-target-section">
              <label className="room-target-label">공통 목표 문서 (검색 후 선택)</label>

              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  className="room-target-input"
                  style={{ flex: 1, margin: 0 }}
                  type="text"
                  placeholder="예: 알베르트 아인슈타인"
                  value={keywordInput}
                  disabled={targetBusy || room?.status !== "waiting"}
                  onChange={(e) => {
                    setKeywordInput(e.target.value);
                    setSubmitError("");
                    setTargetSuggestions([]);
                    setSelectedTargetTitle("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                />
                <button
                  type="button"
                  className="mp-action-btn"
                  disabled={targetBusy || room?.status !== "waiting"}
                  onClick={handleSearch}
                >
                  {isSearching ? "..." : "검색"}
                </button>
              </div>

              {/* 현재 선택된 문서 표시 */}
              {selectedTargetTitle && !targetSuggestions.length && (
                <div style={{ marginTop: "10px", fontSize: "13px", opacity: 0.85 }}>
                  방장이 고른 목표: <strong>{selectedTargetTitle}</strong>
                </div>
              )}
            </div>
            ) : (
              <div className="room-target-section room-target-display">
                {hostPlayer?.target_title
                  ? `방장이 고른 목표: ${hostPlayer.target_title}`
                  : "방장이 목표를 고르는 중"}
              </div>
            )}

            {/* 검색 결과 후보 */}
            {isHost && targetSuggestions.length > 0 && (
              <div className="search-results-list" style={{ marginTop: "12px" }}>
                {targetSuggestions.map((item) => (
                  <button
                    type="button"
                    key={item.title}
                    disabled={targetBusy || room?.status !== "waiting"}
                    onClick={() => handleSelectSuggestion(item)}
                    className={`search-item ${selectedTargetTitle === item.title ? "selected" : ""}`}
                  >
                    <div className="search-item-title">{item.title}</div>
                    <div
                      className="search-item-snippet"
                      dangerouslySetInnerHTML={{ __html: item.snippet || "" }}
                    />
                  </button>
                ))}
              </div>
            )}

            {savingTarget && <p role="status">목표 문서 저장 중...</p>}
          </div>

          <div className="room-vs">VS</div>

          {/* 상대 패널 */}
          <div
            className={`room-player-card room-player--opponent ${!opponentPlayer ? "room-player--empty" : ""}`}
          >
            {opponentPlayer ? (
              <>
                <div className="room-player-role">
                  {isHost ? "⚔️ GUEST" : "👑 HOST"}
                </div>

                <div
                  className="room-player-avatar"
                  onClick={() => handlePlayerClick(opponentPlayer.user_id)}
                  style={{ cursor: "pointer" }}
                >
                  {(opponentPlayer.nickname_snapshot || "상대")
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div
                  className="room-player-name"
                  onClick={() => handlePlayerClick(opponentPlayer.user_id)}
                  style={{ cursor: "pointer", textDecoration: "underline" }}
                >
                  {opponentPlayer.nickname_snapshot || "상대"}
                </div>

                <div className="room-target-section">
                  <div className="room-target-display">
                    {hostPlayer?.target_title
                      ? `방장이 고른 목표: ${hostPlayer.target_title}`
                      : "방장이 목표를 고르는 중"}
                  </div>
                </div>

              </>
            ) : (
              <>
                <div className="room-empty-icon">⏳</div>
                <div className="room-empty-text">대기 중</div>
                <div className="room-empty-hint">방 코드를 공유하세요</div>
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          {isHost && room?.status === "waiting" && (
            <button
              type="button"
              className="mp-action-btn mp-action-btn--primary"
              onClick={handleStartGame}
              disabled={!canStart}
            >
              {starting ? "시작 중..." : "게임 시작"}
            </button>
          )}

          {!isHost && room?.status === "waiting" && (
            <p className="mp-subtitle">
              호스트가 게임을 시작할 때까지 기다려주세요.
            </p>
          )}

          {/* 모달 렌더링 */}
          <UserProfileModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            userId={selectedUserId}
          />
        </div>
      </div>
    </div>
  );
}
