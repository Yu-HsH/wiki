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

  const [selectedMode, setSelectedMode] = useState(null);
  const [duelRoomCodeInput, setDuelRoomCodeInput] = useState("");
  const [groupRoomCodeInput, setGroupRoomCodeInput] = useState("");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [useItems, setUseItems] = useState(true);

  /* =========================
     1vs1 방 생성
     ========================= */
  const handleCreateDuelRoom = async () => {
    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }

    try {
      setPending(true);
      setSubmitError("");

      const room = await createRoom(user.id, {
        useItems,
      });

      navigate(`/multiplayer/room/${room.id}`, {
        state: { useItems },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "방 생성 실패"
      );
    } finally {
      setPending(false);
    }
  };

  /* =========================
     1vs1 방 참가
     ========================= */
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

      navigate(`/multiplayer/room/${room.id}`, {
        state: { role: "guest", useItems: true },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "참가 실패"
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mp-page">
      <div className="mp-container">

        {/* =========================
           모드 선택
        ========================= */}
        <div className="mp-mode-grid">
          <div
            className={`mp-mode-card ${selectedMode === "duel" ? "mp-mode-card--active" : ""
              }`}
            onClick={() => setSelectedMode("duel")}
          >
            ⚔️ 1 vs 1
          </div>

          <div
            className={`mp-mode-card ${selectedMode === "group" ? "mp-mode-card--active" : ""
              }`}
            onClick={() => setSelectedMode("group")}
          >
            👥 단체모드
          </div>
        </div>

        {/* =========================
           1vs1 모드
        ========================= */}
        {selectedMode === "duel" && (
          <div className="mp-mode-panel">

            {/* 방 생성 카드 */}
            <div className="mp-card mp-card--create">
              <div className="mp-card-icon">🎮</div>
              <h3 className="mp-card-title">방 만들기</h3>
              <p className="mp-card-desc">
                새로운 1vs1 방을 생성합니다
              </p>

              <label className="mp-option">
                <input
                  type="checkbox"
                  checked={useItems}
                  onChange={(e) => setUseItems(e.target.checked)}
                />
                아이템 사용
              </label>

              <button
                className="mp-action-btn mp-action-btn--primary"
                onClick={handleCreateDuelRoom}
                disabled={pending}
              >
                {pending ? <span className="mp-spinner" /> : "방 생성"}
              </button>
            </div>

            {/* 방 참가 카드 */}
            <div className="mp-card mp-card--join">
              <div className="mp-card-icon">🔑</div>
              <h3 className="mp-card-title">방 참가</h3>
              <p className="mp-card-desc">
                코드를 입력하여 참가합니다
              </p>

              <div className="mp-join-row">
                <input
                  className="mp-code-input"
                  value={duelRoomCodeInput}
                  onChange={(e) => setDuelRoomCodeInput(e.target.value)}
                  placeholder="ROOM CODE"
                />

                <button
                  className="mp-action-btn mp-action-btn--secondary"
                  onClick={handleJoinDuelRoom}
                  disabled={pending}
                >
                  참가
                </button>
              </div>
            </div>

          </div>
        )}

        {/* =========================
           단체 모드 
        ========================= */}
        {selectedMode === "group" && (
          <div className="mp-mode-panel">

            {/* 방 생성 */}
            <div className="mp-card">
              <div className="mp-card-icon">👥</div>
              <h3 className="mp-card-title">단체 방 만들기</h3>
              <p className="mp-card-desc">
                여러 명이 함께 플레이하는 방을 생성합니다
              </p>

              <button
                className="mp-action-btn mp-action-btn--primary"
                onClick={async () => {
                  if (!user?.id) {
                    setSubmitError("로그인이 필요합니다.");
                    return;
                  }

                  try {
                    setPending(true);
                    setSubmitError("");

                    const room = await createGroupRoom(user.id);

                    navigate(`/multiplayer/group/room/${room.id}`);
                  } catch (error) {
                    setSubmitError("단체 방 생성 실패");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                방 생성
              </button>
            </div>

            {/* 방 참가 */}
            <div className="mp-card">
              <div className="mp-card-icon">🔑</div>
              <h3 className="mp-card-title">단체 방 참가</h3>
              <p className="mp-card-desc">
                코드를 입력하여 참가합니다
              </p>

              <div className="mp-join-row">
                <input
                  className="mp-code-input"
                  value={groupRoomCodeInput}
                  onChange={(e) => setGroupRoomCodeInput(e.target.value)}
                  placeholder="ROOM CODE"
                />

                <button
                  className="mp-action-btn mp-action-btn--secondary"
                  onClick={async () => {
                    const code = groupRoomCodeInput.trim().toUpperCase();
                    if (!code) return;

                    try {
                      setPending(true);
                      setSubmitError("");

                      const room = await findGroupRoomByCode(code);
                      await joinGroupRoom(room.id, user.id);

                      navigate(`/multiplayer/group/room/${room.id}`);
                    } catch (error) {
                      setSubmitError("단체 방 참가 실패");
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  참가
                </button>
              </div>
            </div>

          </div>
        )}
        {/* =========================
           에러 메시지
        ========================= */}
        {submitError && (
          <p className="mp-error">{submitError}</p>
        )}

        {/* =========================
           광고
        ========================= */}
        <AdBanner />

      </div>
    </div>
  );
}