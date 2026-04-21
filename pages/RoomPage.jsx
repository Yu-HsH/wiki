import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchRoom,
  fetchRoomPlayers,
  joinRoom,
  updateMyRoomPlayer,
  leaveRoom,
  startRoomGame,
} from "../services/multiplayerService";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient";

/**
 * 대전 대기실 페이지
 *
 * 현재 역할
 * 1) 방 정보(game_rooms) 조회
 * 2) 참가자 정보(room_players) 조회
 * 3) 내 목표 문서 / 준비 상태 저장
 * 4) Realtime으로 방 상태 / 참가자 상태 반영
 * 5) 호스트가 게임 시작 버튼을 누르면 game_rooms.status = 'starting'
 * 6) 모든 플레이어는 room.status === 'starting' 을 감지하면 게임 화면으로 이동
 *
 * 주의:
 * - "둘 다 준비 완료되면 자동 이동" 방식은 제거
 * - 멀티 시작 기준은 반드시 DB의 room.status 로 통일
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

  // 내 입력값
  const [myTarget, setMyTarget] = useState("");

  // 버튼 로딩용 상태
  const [starting, setStarting] = useState(false);

  // ----------------------------
  // 초기 로드
  // - 방 정보 / 참가자 정보 조회
  // - waiting 방이면 guest 자동 join 시도
  // ----------------------------
  useEffect(() => {
    const loadRoom = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);
        setSubmitError("");

        const roomData = await fetchRoom(roomId);

        // waiting 상태에서 직접 URL 진입한 경우
        // guest라면 room_players row 가 없을 수 있으므로 join 시도
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
  // - game_rooms: 시작 상태 변경 감지
  // - room_players: 입장/준비/목표 변경 감지
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
            const latestPlayers = await fetchRoomPlayers(roomId);
            setPlayers(latestPlayers);
          } catch (error) {
            console.error("room_players realtime refresh failed:", error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // ----------------------------
  // players 기반 파생값
  // ----------------------------
  const hostPlayer = useMemo(
    () => players.find((player) => player.role === "host"),
    [players]
  );

  const guestPlayer = useMemo(
    () => players.find((player) => player.role === "guest"),
    [players]
  );

  const myPlayer = useMemo(
    () => players.find((player) => player.user_id === user?.id),
    [players, user?.id]
  );

  const opponentPlayer = useMemo(
    () => players.find((player) => player.user_id !== user?.id),
    [players, user?.id]
  );

  const isHost = myPlayer?.role === "host";
  const hasGuest = !!guestPlayer;

  // 준비 상태 판단은 로컬이 아니라 DB 기준
  const myReadyState = !!myPlayer?.is_ready;
  const opponentReady = !!opponentPlayer?.is_ready;
  const allReady = myReadyState && opponentReady;

  // ----------------------------
  // DB -> 로컬 입력값 동기화
  // - 새로고침 후에도 내 target_title 복원
  // ----------------------------
  useEffect(() => {
    if (!myPlayer) return;
    setMyTarget(myPlayer.target_title || "");
  }, [myPlayer]);

  // ----------------------------
  // room.status 기반 시작
  // - 호스트가 game_rooms.status='starting'으로 바꾸면
  //   모든 클라이언트가 이 값을 보고 이동
  // ----------------------------
  useEffect(() => {
    if (!room || room.status !== "starting") return;

    navigate(`/multiplayer/game/${roomId}`, {
      state: {
        myTarget: myPlayer?.target_title || "",
        myStart: myPlayer?.start_title || "",
        opponentName: opponentPlayer?.nickname_snapshot || "상대",
      },
    });
  }, [
    room,
    roomId,
    navigate,
    myPlayer?.target_title,
    myPlayer?.start_title,
    opponentPlayer?.nickname_snapshot,
  ]);

  // ----------------------------
  // 준비 완료
  // - 내 target_title / is_ready 저장
  // ----------------------------
  const handleReady = async () => {
    if (!myTarget.trim() || !roomId || !user?.id) return;

    try {
      setSubmitError("");

      await updateMyRoomPlayer(roomId, user.id, {
        target_title: myTarget.trim(),
        is_ready: true,
      });

      // 저장 직후 내 화면에도 즉시 반영
      const playerData = await fetchRoomPlayers(roomId);
      setPlayers(playerData);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "준비 상태 저장에 실패했습니다."
      );
    }
  };

  // ----------------------------
  // 준비 해제
  // - target_title 은 유지하고 is_ready만 false
  // - 필요 없으면 이 함수는 빼도 됨
  // ----------------------------
  const handleUnready = async () => {
    if (!roomId || !user?.id) return;

    try {
      setSubmitError("");

      await updateMyRoomPlayer(roomId, user.id, {
        is_ready: false,
      });

      const playerData = await fetchRoomPlayers(roomId);
      setPlayers(playerData);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "준비 해제에 실패했습니다."
      );
    }
  };

  // ----------------------------
  // 호스트 게임 시작
  // - DB 상태를 'starting'으로 바꾸는 것이 핵심
  // - 실제 페이지 이동은 위 useEffect(room.status)에서 처리
  // ----------------------------
  const handleStartGame = async () => {
    if (!roomId || !user?.id) return;

    try {
      setSubmitError("");
      setStarting(true);

      await startRoomGame(roomId, user.id);
    } catch (error) {
      console.error("startRoomGame failed:", error);
      setSubmitError(
        error instanceof Error ? error.message : "게임 시작에 실패했습니다."
      );
    } finally {
      setStarting(false);
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
  // 로딩 화면
  // ----------------------------
  if (pending) {
    return (
      <div className="mp-page">
        <div className="mp-glow mp-glow--1" />
        <div className="mp-glow mp-glow--2" />

        <div className="mp-container">
          <header className="mp-header">
            <button
              type="button"
              className="mp-back-btn"
              onClick={handleLeaveRoom}
            >
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
  // 에러 화면
  // ----------------------------
  if (submitError && !room) {
    return (
      <div className="mp-page">
        <div className="mp-glow mp-glow--1" />
        <div className="mp-glow mp-glow--2" />

        <div className="mp-container">
          <header className="mp-header">
            <button
              type="button"
              className="mp-back-btn"
              onClick={handleLeaveRoom}
            >
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

  // ----------------------------
  // 본문
  // ----------------------------
  return (
    <div className="mp-page">
      <div className="mp-glow mp-glow--1" />
      <div className="mp-glow mp-glow--2" />

      <div className="mp-container">
        <header className="mp-header">
          <button
            type="button"
            className="mp-back-btn"
            onClick={handleLeaveRoom}
          >
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

          {hasGuest && !allReady && room?.status === "waiting" && (
            <div className="room-status-pill room-status--setting">
              🎯 목표 문서를 설정하고 준비하세요
            </div>
          )}

          {allReady && room?.status === "waiting" && !starting && (
            <div className="room-status-pill room-status--ready">
              ✅ 모두 준비 완료!
            </div>
          )}

          {(starting || room?.status === "starting") && (
            <div className="room-status-pill room-status--starting">
              🚀 게임 시작 중...
            </div>
          )}
        </div>

        {/* 상단 에러 메시지는 페이지 전체를 막지 않고 안내만 표시 */}
        {submitError && room && (
          <div className="mp-error" style={{ marginBottom: "16px" }}>
            {submitError}
          </div>
        )}

        <div className="room-players">
          {/* 내 패널 */}
          <div
            className={`room-player-card ${myReadyState ? "room-player--ready" : ""
              }`}
          >
            <div className="room-player-role">
              {isHost ? "👑 HOST" : "⚔️ GUEST"}
            </div>

            <div className="room-player-avatar">
              {(myPlayer?.nickname_snapshot || user?.displayName || "나")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="room-player-name">
              {myPlayer?.nickname_snapshot || user?.displayName || "나"}
            </div>

            <div className="room-target-section">
              <label className="room-target-label">목표 문서</label>
              <input
                className="room-target-input"
                type="text"
                placeholder="예: 아인슈타인"
                value={myTarget}
                disabled={myReadyState || room?.status !== "waiting"}
                onChange={(e) => setMyTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !myReadyState) {
                    handleReady();
                  }
                }}
              />
            </div>

            {!myReadyState ? (
              <button
                type="button"
                className="mp-action-btn mp-action-btn--primary room-ready-btn"
                disabled={!myTarget.trim() || room?.status !== "waiting"}
                onClick={handleReady}
              >
                ✅ 준비 완료
              </button>
            ) : (
              <>
                <div className="room-ready-badge">READY</div>

                {/* 준비 해제 버튼이 필요하면 유지, 아니면 삭제 가능 */}
                {room?.status === "waiting" && (
                  <button
                    type="button"
                    className="mp-action-btn room-ready-btn"
                    onClick={handleUnready}
                    style={{ marginTop: "12px" }}
                  >
                    준비 해제
                  </button>
                )}
              </>
            )}
          </div>

          <div className="room-vs">VS</div>

          {/* 상대 패널 */}
          <div
            className={`room-player-card room-player--opponent ${opponentPlayer?.is_ready ? "room-player--ready" : ""
              } ${!opponentPlayer ? "room-player--empty" : ""}`}
          >
            {opponentPlayer ? (
              <>
                <div className="room-player-role">
                  {isHost ? "⚔️ GUEST" : "👑 HOST"}
                </div>

                <div className="room-player-avatar">
                  {(opponentPlayer.nickname_snapshot || "상대")
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="room-player-name">
                  {opponentPlayer.nickname_snapshot || "상대"}
                </div>

                <div className="room-target-section">
                  <label className="room-target-label">목표 문서</label>
                  <div className="room-target-display">
                    {opponentPlayer.target_title
                      ? opponentPlayer.target_title
                      : "설정 중..."}
                  </div>
                </div>

                {opponentPlayer.is_ready ? (
                  <div className="room-ready-badge">READY</div>
                ) : (
                  <div className="room-waiting-badge">
                    <span className="mp-spinner mp-spinner--sm" />
                    준비 중
                  </div>
                )}
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

        {/* 하단 시작 영역 */}
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          {isHost && hasGuest && allReady && room?.status === "waiting" && (
            <button
              type="button"
              className="mp-action-btn mp-action-btn--primary"
              onClick={handleStartGame}
              disabled={starting}
            >
              {starting ? "시작 중..." : "게임 시작"}
            </button>
          )}

          {!isHost && hasGuest && allReady && room?.status === "waiting" && (
            <p className="mp-subtitle">호스트가 게임을 시작할 때까지 기다려주세요.</p>
          )}
        </div>
      </div>
    </div>
  );
}