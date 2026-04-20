import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../authContext";

/**
 * 대전 대기실 페이지
 * - 방 코드 표시
 * - 호스트 / 게스트 패널
 * - 각 플레이어가 목표 문서를 독립적으로 설정
 * - 준비 완료 버튼
 */

const ROOM_STATE = {
  WAITING: "WAITING",     // 상대 대기 중
  SETTING: "SETTING",     // 양쪽 입장 완료, 목표 설정 중
  READY: "READY",         // 양쪽 모두 준비 완료
  STARTING: "STARTING",   // 게임 시작 카운트다운
};

export default function RoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const role = location.state?.role || "guest";
  const isHost = role === "host";

  // --- Mock state (Supabase 연동 전 placeholder) ---
  const [roomState, setRoomState] = useState(
    isHost ? ROOM_STATE.WAITING : ROOM_STATE.SETTING
  );
  const [myTarget, setMyTarget] = useState("");
  const [myReady, setMyReady] = useState(false);

  // 상대 플레이어 mock
  const [opponent, setOpponent] = useState(
    isHost
      ? null
      : { displayName: "호스트 플레이어", target: "", ready: false }
  );

  // 호스트일 때 3초 후 mock 게스트 입장
  useEffect(() => {
    if (!isHost) return;
    const timer = setTimeout(() => {
      setOpponent({ displayName: "게스트 플레이어", target: "", ready: false });
      setRoomState(ROOM_STATE.SETTING);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isHost]);

  // 상대 mock 준비 (내가 준비 후 2초)
  useEffect(() => {
    if (!myReady || !opponent) return;
    const timer = setTimeout(() => {
      setOpponent((prev) => ({ ...prev, target: "인공지능", ready: true }));
    }, 2000);
    return () => clearTimeout(timer);
  }, [myReady, opponent]);

  // 양쪽 모두 준비 → 시작 카운트다운
  useEffect(() => {
    if (myReady && opponent?.ready) {
      setRoomState(ROOM_STATE.READY);
      const timer = setTimeout(() => {
        setRoomState(ROOM_STATE.STARTING);
        setTimeout(() => {
          navigate(`/multiplayer/game/${roomId}`, {
            state: {
              role,
              myTarget,
              opponentName: opponent.displayName,
            },
          });
        }, 1500);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [myReady, opponent?.ready]);

  const handleReady = () => {
    if (!myTarget.trim()) return;
    setMyReady(true);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomId);
  };

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

        {/* 방 코드 배너 */}
        <div className="room-code-banner">
          <span className="room-code-label">ROOM CODE</span>
          <button
            type="button"
            className="room-code-value"
            onClick={handleCopyCode}
            title="클릭하여 복사"
          >
            {roomId}
            <span className="room-code-copy">📋</span>
          </button>
        </div>

        {/* 상태 표시 */}
        <div className="room-status">
          {roomState === ROOM_STATE.WAITING && (
            <div className="room-status-pill room-status--waiting">
              <span className="room-pulse" />
              상대를 기다리는 중...
            </div>
          )}
          {roomState === ROOM_STATE.SETTING && (
            <div className="room-status-pill room-status--setting">
              🎯 목표 문서를 설정하세요
            </div>
          )}
          {roomState === ROOM_STATE.READY && (
            <div className="room-status-pill room-status--ready">
              ✅ 모두 준비 완료!
            </div>
          )}
          {roomState === ROOM_STATE.STARTING && (
            <div className="room-status-pill room-status--starting">
              🚀 게임 시작 중...
            </div>
          )}
        </div>

        {/* 플레이어 패널 그리드 */}
        <div className="room-players">
          {/* 내 패널 */}
          <div className={`room-player-card ${myReady ? "room-player--ready" : ""}`}>
            <div className="room-player-role">
              {isHost ? "👑 HOST" : "⚔️ GUEST"}
            </div>
            <div className="room-player-avatar">
              {user?.displayName?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="room-player-name">
              {user?.displayName || "나"}
            </div>

            {/* 목표 설정 */}
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

            {/* 준비 버튼 */}
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

          {/* VS 구분자 */}
          <div className="room-vs">VS</div>

          {/* 상대 패널 */}
          <div
            className={`room-player-card room-player--opponent ${
              opponent?.ready ? "room-player--ready" : ""
            } ${!opponent ? "room-player--empty" : ""}`}
          >
            {opponent ? (
              <>
                <div className="room-player-role">
                  {isHost ? "⚔️ GUEST" : "👑 HOST"}
                </div>
                <div className="room-player-avatar">
                  {opponent.displayName?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="room-player-name">
                  {opponent.displayName}
                </div>
                <div className="room-target-section">
                  <label className="room-target-label">목표 문서</label>
                  <div className="room-target-display">
                    {opponent.ready
                      ? opponent.target || "???"
                      : "설정 중..."}
                  </div>
                </div>
                {opponent.ready ? (
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
                <div className="room-empty-hint">
                  방 코드를 공유하세요
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
