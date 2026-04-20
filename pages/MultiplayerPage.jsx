import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { createRoom, findRoomByCode, joinRoom } from "../services/multiplayerService";

/**
 * 멀티플레이어 로비 페이지
 * - 1 VS 1 방 생성
 * - 방 코드 입력 후 참가
 */
export default function MultiplayerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleCreateRoom = async () => {
    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }
    // TODO: Supabase 연동 — 방 생성 후 roomId 반환
    try {
      setPending(true);
      setSubmitError("");

      const room = await createRoom(user.id);

      navigate(`/multiplayer/room/${room.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "방 생성에 실패했습니다.");
    } finally {
      setPending(false);
    }
  };

  const handleJoinRoom = async () => {
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }

    try {
      setPending(true);
      setSubmitError("");

      const room = await findRoomByCode(code);
      await joinRoom(room.id, user.id);

      navigate(`/multiplayer/room/${room.id}`, { state: { role: "guest" } });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "방 참가에 실패했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mp-page">
      {/* 배경 글로우 */}
      <div className="mp-glow mp-glow--1" />
      <div className="mp-glow mp-glow--2" />

      <div className="mp-container">
        {/* 헤더 */}
        <header className="mp-header">
          <button
            type="button"
            className="mp-back-btn"
            onClick={() => navigate("/main")}
          >
            ← 메인으로
          </button>
        </header>

        {/* 타이틀 영역 */}
        <div className="mp-title-block">
          <span className="mp-badge">MULTIPLAYER</span>
          <h1 className="mp-title">
            <span className="mp-title-accent">1</span>
            <span className="mp-title-vs">VS</span>
            <span className="mp-title-accent">1</span>
            <span className="mp-title-sub">WIKI RACE</span>
          </h1>
          <p className="mp-subtitle">
            상대보다 빠르게 목표 위키 문서에 도달하세요
          </p>
        </div>

        {/* 카드 그리드 */}
        <div className="mp-cards">
          {/* 방 만들기 카드 */}
          <div className="mp-card mp-card--create">
            <div className="mp-card-icon">🏠</div>
            <h2 className="mp-card-title">방 만들기</h2>
            <p className="mp-card-desc">
              새로운 대전 방을 만들고 친구를 초대하세요
            </p>
            <button
              type="button"
              className="mp-action-btn mp-action-btn--primary"
              disabled={pending}
              onClick={handleCreateRoom}
            //onClick={handleCreateRoom}  
            >
              {pending ? (
                <span className="mp-spinner" />
              ) : (
                "⚔️ 방 생성"
              )}
            </button>
          </div>

          {/* 방 참가 카드 */}
          <div className="mp-card mp-card--join">
            <div className="mp-card-icon">🔗</div>
            <h2 className="mp-card-title">방 참가</h2>
            <p className="mp-card-desc">
              방 코드를 입력하여 대전에 참가하세요
            </p>
            <div className="mp-join-row">
              <input
                className="mp-code-input"
                type="text"
                placeholder="방 코드 입력"
                maxLength={8}
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoinRoom();
                }}
              />
              <button
                type="button"
                className="mp-action-btn mp-action-btn--secondary"
                disabled={!roomCodeInput.trim() || pending}
                onClick={handleJoinRoom}
              //onClick={handleJoinRoom}  
              >
                {pending ? <span className="mp-spinner" /> : "참가"}
              </button>
            </div>
          </div>
        </div>

        {submitError && <p className="mp-error">{submitError}</p>}

        {/* 플레이어 정보 */}
        <div className="mp-player-info">
          <span className="mp-player-avatar">👤</span>
          <span className="mp-player-name">{user?.displayName || "Player"}</span>
        </div>
      </div>
    </div>
  );
}
