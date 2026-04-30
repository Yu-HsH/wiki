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
  const [showHelp, setShowHelp] = useState(false);

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
           상단 내비게이션
        ========================= */}
        <header className="mp-header">
          <button
            type="button"
            className="app-btn app-btn-ghost"
            onClick={() => navigate("/main")}
          >
            ← 메인으로
          </button>
        </header>

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

        {/* 플로팅 도움말 버튼 */}
        <button type="button" className="help-button floating" onClick={() => setShowHelp(true)} aria-label="게임 설명">
          ?
        </button>

        {/* ── 도움말 모달 ── */}
        {showHelp && (
          <div className="help-backdrop" onClick={() => setShowHelp(false)}>
            <div className="help-modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--app-line)", paddingBottom: "0.75rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem" }}>멀티플레이 안내</h2>
                <button type="button" className="text-btn" onClick={() => setShowHelp(false)} style={{ fontSize: "1.5rem", lineHeight: 1 }}>
                  &times;
                </button>
              </div>

              <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "8px" }}>
                <h3>1. 1vs1 모드</h3>
                <ul>
                  <li>두 명이 서로 다른 목표 문서를 가지고 시작합니다.</li>
                  <li>내 목표는 상대가 설정한 목표 문서입니다.</li>
                  <li>먼저 목표 문서에 도달한 사람이 승리합니다.</li>
                  <li>상대 현재 문서, 이동 횟수, 상태를 확인할 수 있습니다.</li>
                  <li>아이템으로 상대를 방해하거나 자신을 보조할 수 있습니다.</li>
                </ul>

                <h3>2. 그룹모드</h3>
                <ul>
                  <li>여러 명이 같은 시작 문서와 같은 목표 문서로 경쟁합니다.</li>
                  <li>목표 문서는 참가자들이 제출한 후보 중 선택됩니다.</li>
                  <li>정해진 등수 안에 도착하면 성공입니다.</li>
                  <li>실시간으로 참가자 진행 상황과 순위를 확인 가능합니다.</li>
                  <li>그룹모드는 현재 아이템 없이 순수 레이스 중심입니다.</li>
                </ul>

                <h3>3. 아이템 설명</h3>
                <ul>
                  <li><strong>시야 방해:</strong> 상대 화면을 먹물/페인트 효과로 잠시 가립니다.</li>
                  <li><strong>언어 변경:</strong> 상대 현재 문서에 혼란 효과를 줍니다.</li>
                  <li><strong>랜덤 링크 이동:</strong> 상대를 현재 문서의 랜덤 링크로 강제 이동시킵니다.</li>
                  <li><strong>현재 문서 교환:</strong> 나와 상대의 현재 위치를 교환합니다.</li>
                  <li><strong>링크 하이라이트:</strong> 목표와 관련 있을 가능성이 높은 링크를 표시합니다.</li>
                  <li><strong>검색 기능:</strong> 현재 문서 안에서 검색 1회 사용합니다.</li>
                  <li><strong>뒤로가기:</strong> 이전 문서로 한 번 되돌아갑니다.</li>
                  <li><strong>랜덤 텔레포트:</strong> 무작위 문서로 이동합니다.</li>
                  <li><strong>방어하기:</strong> 방해 효과 해제 + 일정 시간 면역을 얻습니다.</li>
                  <li><strong>미니게임:</strong> 가위바위보 승자가 랜덤 아이템을 발동합니다.</li>
                </ul>

                <h3>4. 새로고침 안내</h3>
                <ul>
                  <li>1vs1과 그룹모드는 새로고침해도 현재 문서 진행 상태가 유지됩니다.</li>
                  <li>단, 방을 나가거나 게임이 종료되면 진행 상태가 초기화될 수 있습니다.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}