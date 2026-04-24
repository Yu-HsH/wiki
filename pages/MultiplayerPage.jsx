import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import {
  createRoom,
  findRoomByCode,
  joinRoom,
} from "../services/multiplayerService";
import {
  createGroupRoom,
  findGroupRoomByCode,
  joinGroupRoom,
} from "../services/groupMultiplayerService";
import AdBanner from "../components/AdBanner";

export default function MultiplayerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [selectedMode, setSelectedMode] = useState(null); // 'duel' or 'group'
  const [duelRoomCodeInput, setDuelRoomCodeInput] = useState("");
  const [groupRoomCodeInput, setGroupRoomCodeInput] = useState("");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleCreateDuelRoom = async () => {
    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }

    try {
      setPending(true);
      setSubmitError("");
      const room = await createRoom(user.id);
      navigate(`/multiplayer/room/${room.id}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "1 vs 1 방 생성에 실패했습니다."
      );
    } finally {
      setPending(false);
    }
  };

  const handleJoinDuelRoom = async () => {
    const code = duelRoomCodeInput.trim().toUpperCase();
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
      setSubmitError(
        error instanceof Error ? error.message : "1 vs 1 방 참가에 실패했습니다."
      );
    } finally {
      setPending(false);
    }
  };

  const handleCreateGroupRoom = async () => {
    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }

    try {
      setPending(true);
      setSubmitError("");
      const room = await createGroupRoom(user.id, {
        minPlayers: 3,
        maxPlayers: 6,
        finishRankLimit: 3,
      });
      navigate(`/multiplayer/group/room/${room.id}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "단체모드 방 생성에 실패했습니다."
      );
    } finally {
      setPending(false);
    }
  };

  const handleJoinGroupRoom = async () => {
    const code = groupRoomCodeInput.trim().toUpperCase();
    if (!code) return;

    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }

    try {
      setPending(true);
      setSubmitError("");
      const room = await findGroupRoomByCode(code);
      await joinGroupRoom(room.id, user.id);
      navigate(`/multiplayer/group/room/${room.id}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "단체모드 방 참가에 실패했습니다."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mp-page">
      <div className="mp-glow mp-glow--1" />
      <div className="mp-glow mp-glow--2" />

      <div className="mp-container">
        <header className="mp-header">
          <button
            type="button"
            className="mp-back-btn"
            onClick={() => navigate("/main")}
          >
            ← 메인으로
          </button>
        </header>

        <div className="mp-title-block">
          <span className="mp-badge">ONLINE PLAY</span>
          <h1 className="mp-title">온라인 플레이</h1>
          <p className="mp-subtitle">
            원하는 게임 모드를 선택한 후 방을 만들거나 참가하세요.
          </p>
        </div>

        {submitError && (
          <div className="mp-error" style={{ marginBottom: "18px" }}>
            {submitError}
          </div>
        )}

        {/* 1. 모드 선택 카드 영역 */}
        <div className="mp-mode-grid">
          <div
            className={`mp-mode-card ${selectedMode === "duel" ? "mp-mode-card--active" : ""}`}
            onClick={() => {
              setSelectedMode("duel");
              setSubmitError("");
            }}
          >
            <div className="mp-mode-icon">⚔️</div>
            <div className="mp-mode-info">
              <h3>1 vs 1 대전</h3>
              <p>친구와 1대1로 진검승부를 겨루세요.</p>
            </div>
          </div>

          <div
            className={`mp-mode-card ${selectedMode === "group" ? "mp-mode-card--active" : ""}`}
            onClick={() => {
              setSelectedMode("group");
              setSubmitError("");
            }}
          >
            <div className="mp-mode-icon">👥</div>
            <div className="mp-mode-info">
              <h3>단체모드</h3>
              <p>여러 명과 함께 레이스를 즐기세요.</p>
            </div>
          </div>
        </div>

        {/* 2. 상세 액션 영역 (모드 선택 시 나타남) */}
        {selectedMode === "duel" && (
          <div className="mp-mode-panel">
            <div className="mp-cards">
              <section className="mp-card mp-card--create">
                <div className="mp-card-icon">🆕</div>
                <h2 className="mp-card-title">1 vs 1 방 만들기</h2>
                <p className="mp-card-desc">방을 생성하고 친구를 초대하세요.</p>
                <button
                  type="button"
                  className="mp-action-btn mp-action-btn--primary"
                  onClick={handleCreateDuelRoom}
                  disabled={pending}
                >
                  {pending ? "생성 중..." : "방 만들기"}
                </button>
              </section>

              <section className="mp-card mp-card--join">
                <div className="mp-card-icon">🔑</div>
                <h2 className="mp-card-title">1 vs 1 방 참가</h2>
                <p className="mp-card-desc">초대 코드를 입력하세요.</p>
                <div className="mp-join-row">
                  <input
                    className="mp-code-input"
                    value={duelRoomCodeInput}
                    placeholder="CODE"
                    onChange={(e) =>
                      setDuelRoomCodeInput(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJoinDuelRoom();
                    }}
                  />
                  <button
                    type="button"
                    className="mp-action-btn mp-action-btn--secondary"
                    onClick={handleJoinDuelRoom}
                    disabled={pending || !duelRoomCodeInput.trim()}
                  >
                    참가
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {selectedMode === "group" && (
          <div className="mp-mode-panel">
            <div className="mp-cards">
              <section className="mp-card mp-card--create">
                <div className="mp-card-icon">🆕</div>
                <h2 className="mp-card-title">단체모드 방 만들기</h2>
                <p className="mp-card-desc">친구들과 함께 즐길 방을 만듭니다.</p>
                <button
                  type="button"
                  className="mp-action-btn mp-action-btn--primary"
                  onClick={handleCreateGroupRoom}
                  disabled={pending}
                >
                  {pending ? "생성 중..." : "방 만들기"}
                </button>
              </section>

              <section className="mp-card mp-card--join">
                <div className="mp-card-icon">🔑</div>
                <h2 className="mp-card-title">단체모드 방 참가</h2>
                <p className="mp-card-desc">단체모드 초대 코드를 입력하세요.</p>
                <div className="mp-join-row">
                  <input
                    className="mp-code-input"
                    value={groupRoomCodeInput}
                    placeholder="CODE"
                    onChange={(e) =>
                      setGroupRoomCodeInput(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJoinGroupRoom();
                    }}
                  />
                  <button
                    type="button"
                    className="mp-action-btn mp-action-btn--secondary"
                    onClick={handleJoinGroupRoom}
                    disabled={pending || !groupRoomCodeInput.trim()}
                  >
                    참가
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        <div className="mp-player-info">
          <span className="mp-player-avatar">👤</span>
          <span className="mp-player-label">PLAYER:</span>
          <span className="mp-player-name">{user?.displayName || "Guest"}</span>
        </div>

        <AdBanner />
      </div>
    </div>
  );
}