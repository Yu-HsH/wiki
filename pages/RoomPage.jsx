import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchRoom,
  fetchRoomPlayers,
  joinRoom,
  updateMyRoomPlayer,
  leaveRoom,
} from "../services/multiplayerService";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient";

/**
 * 대전 대기실 페이지
 * - 방 코드 표시
 * - 호스트 / 게스트 패널
 * - 각 플레이어가 목표 문서를 독립적으로 설정
 * - 준비 완료 버튼
 *
 * 현재 단계:
 * - room / room_players 실제 조회
 * - target_title / is_ready 실제 DB 저장
 * - room_players Realtime 구독으로 상태 반영
 * - 아직 실제 게임 시작 데이터 저장 미적용상태
 */
export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pending, setPending] = useState(true);
  const [submitError, setSubmitError] = useState("");

  const [myTarget, setMyTarget] = useState("");
  const [starting, setStarting] = useState(false);

  /**
   * 방 정보 + 참가자 목록 불러오기
   */
  useEffect(() => {
    const loadRoom = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);
        setSubmitError("");

        const roomData = await fetchRoom(roomId);

        // 혹시 직접 URL로 들어온 guest면 join 시도
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

  /**
   * players 기반 파생값
   * - Hook은 항상 return보다 위에 있어야 함
   */
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
  const myReadyState = !!myPlayer?.is_ready;
  const opponentReady = !!opponentPlayer?.is_ready;
  const allReady = myReadyState && opponentReady;

  /**
   * DB 값 -> 로컬 UI 상태 동기화
   * - 새로고침해도 내 목표/준비 상태 복원
   */
  useEffect(() => {
    if (!myPlayer) return;

    if (myPlayer.target_title) {
      setMyTarget(myPlayer.target_title);
    }
  }, [myPlayer]);

  /**
   * 양쪽 모두 준비되면 임시 시작 연출 후 게임 페이지 이동
   * - 아직 실제 게임 시작 데이터 저장 전
   */
  useEffect(() => {
    if (!allReady || starting) return;

    setStarting(true);

    const timer = setTimeout(() => {
      navigate(`/multiplayer/game/${roomId}`, {
        state: {
          myTarget,
          opponentName: opponentPlayer?.nickname_snapshot || "상대",
        },
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [allReady, starting, navigate, roomId, myTarget, opponentPlayer?.nickname_snapshot]);

  /**
   * 준비 완료
   * - 내 target_title, is_ready를 DB에 저장
   */
  const handleReady = async () => {
    if (!myTarget.trim() || !roomId || !user?.id) return;

    try {
      setSubmitError("");

      await updateMyRoomPlayer(roomId, user.id, {
        target_title: myTarget.trim(),
        is_ready: true,
      });

      const playerData = await fetchRoomPlayers(roomId);
      setPlayers(playerData);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "준비 상태 저장에 실패했습니다."
      );
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(room?.room_code ?? roomId ?? "");
  };

  const handleLeaveRoom = async () => {
    if (!roomId || !user?.id) {
      navigate("/multiplayer");
      return;
    }

    try {
      await leaveRoom(roomId, user.id);
    } catch (error) {
      console.error("leaveRoom failed:", error);
    } finally {
      navigate("/multiplayer");
    }
  };

  useEffect(() => {
    if (!roomId || !supabase) return;

    const channel = supabase
      .channel(`room_players:${roomId}`)
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
            const playerData = await fetchRoomPlayers(roomId);
            setPlayers(playerData);
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
  /**
   * 모든 Hook 선언 후에만 조건부 return
   */
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
            <p className="mp-subtitle">플레이어 정보와 방 상태를 확인하고 있습니다</p>
          </div>
        </div>
      </div>
    );
  }

  if (submitError) {
    return (
      <div className="mp-page">
        <div className="mp-glow mp-glow--1" />
        <div className="mp-glow mp-glow--2" />

        <div className="mp-container">
          <header className="mp-header">
            <button
              type="button"
              className="mp-back-btn"
              onClick={() => navigate("/multiplayer")}
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

  return (
    <div className="mp-page">
      <div className="mp-glow mp-glow--1" />
      <div className="mp-glow mp-glow--2" />

      <div className="mp-container">
        <header className="mp-header">
          <button
            type="button"
            className="mp-back-btn"
            onClick={() => navigate("/multiplayer")}
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

          {hasGuest && !allReady && !starting && (
            <div className="room-status-pill room-status--setting">
              🎯 목표 문서를 설정하고 준비하세요
            </div>
          )}

          {allReady && !starting && (
            <div className="room-status-pill room-status--ready">
              ✅ 모두 준비 완료!
            </div>
          )}

          {starting && (
            <div className="room-status-pill room-status--starting">
              🚀 게임 시작 중...
            </div>
          )}
        </div>

        <div className="room-players">
          <div className={`room-player-card ${myReadyState ? "room-player--ready" : ""}`}>
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
                disabled={myReadyState}
                onChange={(e) => setMyTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReady();
                }}
              />
            </div>

            {!myReadyState ? (
              <button
                type="button"
                className="mp-action-btn mp-action-btn--primary room-ready-btn"
                disabled={!myTarget.trim()}
                onClick={handleReady}
              >
                ✅ 준비 완료
              </button>
            ) : (
              <div className="room-ready-badge">READY</div>
            )}
          </div>

          <div className="room-vs">VS</div>

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
                    {opponentPlayer.is_ready
                      ? opponentPlayer.target_title || "목표 설정 완료"
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
      </div>
    </div>
  );
}