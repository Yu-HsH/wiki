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
            1 vs 1 대전 또는 여러 명이 함께하는 단체모드를 선택하세요.
          </p>
        </div>

        {submitError && (
          <div className="mp-error" style={{ marginBottom: "18px" }}>
            {submitError}
          </div>
        )}

        <div className="mp-card-grid">
          <section className="mp-card">
            <h2>1 vs 1 방 만들기</h2>
            <p>친구 한 명과 빠르게 위키 레이스를 시작합니다.</p>
            <button
              type="button"
              className="mp-action-btn mp-action-btn--primary"
              onClick={handleCreateDuelRoom}
              disabled={pending}
            >
              {pending ? "생성 중..." : "⚔️ 1 vs 1 방 생성"}
            </button>
          </section>

          <section className="mp-card">
            <h2>1 vs 1 방 참가</h2>
            <p>방 코드를 입력해 1 vs 1 대전에 참가합니다.</p>
            <input
              className="mp-room-input"
              value={duelRoomCodeInput}
              placeholder="1 vs 1 방 코드"
              onChange={(e) =>
                setDuelRoomCodeInput(e.target.value.toUpperCase())
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinDuelRoom();
              }}
            />
            <button
              type="button"
              className="mp-action-btn"
              onClick={handleJoinDuelRoom}
              disabled={pending || !duelRoomCodeInput.trim()}
            >
              {pending ? "참가 중..." : "참가"}
            </button>
          </section>

          <section className="mp-card mp-card--group">
            <h2>단체모드 방 만들기</h2>
            <p>
              3명 이상이 함께 시작합니다. 먼저 도착한 3명이 순위에
              오릅니다.
            </p>
            <button
              type="button"
              className="mp-action-btn mp-action-btn--primary"
              onClick={handleCreateGroupRoom}
              disabled={pending}
            >
              {pending ? "생성 중..." : "👥 단체모드 방 생성"}
            </button>
          </section>

          <section className="mp-card mp-card--group">
            <h2>단체모드 방 참가</h2>
            <p>방 코드를 입력해 단체모드 방에 참가합니다.</p>
            <input
              className="mp-room-input"
              value={groupRoomCodeInput}
              placeholder="단체모드 방 코드"
              onChange={(e) =>
                setGroupRoomCodeInput(e.target.value.toUpperCase())
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinGroupRoom();
              }}
            />
            <button
              type="button"
              className="mp-action-btn"
              onClick={handleJoinGroupRoom}
              disabled={pending || !groupRoomCodeInput.trim()}
            >
              {pending ? "참가 중..." : "참가"}
            </button>
          </section>
        </div>

        <div className="mp-player-mini">
          <span className="mp-player-label">PLAYER</span>
          <strong>{user?.displayName || "Player"}</strong>
        </div>

        <AdBanner />
      </div>
    </div>
  );
}