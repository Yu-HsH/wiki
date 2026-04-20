import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRoom, fetchRoomPlayers, joinRoom } from "../services/multiplayerService";
import { useAuth } from "../authContext";

/**
 * 대전 대기실 페이지
 * - 방 코드 표시
 * - 호스트 / 게스트 패널
 * - 각 플레이어가 목표 문서를 독립적으로 설정
 * - 준비 완료 버튼 (현재는 로컬 상태만 반영)
 *
 * 주의:
 * - 아직 Realtime 미적용
 * - 아직 target / ready DB 저장 미적용
 * - 지금 단계에서는 실제 room / players 조회까지만 연결
 */
export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pending, setPending] = useState(true);
  const [submitError, setSubmitError] = useState("");

  // 아직 DB 저장 전이라 내 목표/준비 상태는 로컬로만 유지
  const [myTarget, setMyTarget] = useState("");
  const [myReady, setMyReady] = useState(false);
  const [starting, setStarting] = useState(false);

  /**
   * 방 정보 + 참가자 목록 불러오기
   * - 직접 URL로 들어왔을 때 waiting 상태면 join 시도
   */
  useEffect(() => {
    const loadRoom = async () => {
      if (!roomId || !user?.id) return;

      try {
        setPending(true);
        setSubmitError("");

        const roomData = await fetchRoom(roomId);

        // waiting 방에 직접 들어온 경우 guest join 시도
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

  // 현재 단계에서는 내 로컬 ready + 상대 DB ready를 섞지 않고
  // "상대가 room_players.is_ready=true 인지"만 참고
  const opponentReady = !!opponentPlayer?.is_ready;
  const allReady = myReady && opponentReady;

  /**
   * 양쪽 준비 완료 시 임시 시작 연출
   * - 아직 실제 게임 데이터 저장/시작 로직 전
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
   * 현재 단계의 준비 버튼
   * - 아직 DB 저장 전이라 로컬 ready만 변경
   */
  const handleReady = () => {
    if (!myTarget.trim()) return;
    setMyReady(true);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(room?.room_code ?? roomId ?? "");
  };

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
              onClick={() => navigate("/multiplayer")}
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
        {/* 상단 */}
        <header className="mp-header">
          <button
            type="button"
            className="mp-back-btn"
            onClick={() => navigate("/multiplayer")}
          >
            ← 로비로
          </button>
        </header>

        {/* 방 코드 */}
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

        {/* 상태 표시 */}
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

        {/* 플레이어 패널 */}
        <div className="room-players">
          {/* 내 패널 */}
          <div className={`room-player-card ${myReady ? "room-player--ready" : ""}`}>
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
                disabled={myReady}
                onChange={(e) => setMyTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReady();
                }}
              />
            </div>

            {!myReady ? (
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

          {/* VS */}
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