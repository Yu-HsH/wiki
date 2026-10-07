import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../authContext";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell";
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
import {
  DUEL_ITEM_ROLE,
  DUEL_ROLE_LABELS,
  DUEL_SLOT_COUNT,
  getDuelItemsByRole,
} from "../data/duelItems";

/**
 * 안내 문구의 아이템 목록은 **카탈로그에서 만든다.**
 *
 * 예전에는 10줄이 손으로 적혀 있었고 그래서 어긋났다 — 지워진 셋(언어 변경·링크
 * 하이라이트·현재 문서 교환)과 비활성된 미니게임이 남아 있었고, 새로 들어온 넷(링크
 * 검열·링크 미리보기·역링크·역사 되감기)은 빠져 있었다. **설명이 카탈로그를 베끼면
 * 카탈로그가 바뀔 때마다 다시 어긋난다.** 그래서 베끼지 않고 읽는다.
 *
 * `getDuelItemsByRole`이 비활성 아이템을 이미 걸러 주므로 `swap_current`는 들어오지
 * 않는다. 역할 순서는 슬롯 순서와 같다 (`DUEL_SLOT_PLAN`).
 */
const DUEL_ITEM_HELP_SECTIONS = [
  DUEL_ITEM_ROLE.ATTACK,
  DUEL_ITEM_ROLE.SEARCH,
  DUEL_ITEM_ROLE.DEFENSE,
  DUEL_ITEM_ROLE.JOKER,
].map((role) => ({
  role,
  label: DUEL_ROLE_LABELS[role],
  items: getDuelItemsByRole(role),
}));

export default function MultiplayerPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [searchParams] = useSearchParams();
  const [selectedMode, setSelectedMode] = useState(() => {
    const mode = searchParams.get("mode");
    return mode === "duel" || mode === "group" ? mode : null;
  });
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

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // Phase 2: 기존 방 생성/코드 참가 기능은 그대로 두고 공용 Shell 안에서 가볍게 보인다.
  return (
    <WikiRaceShell user={user} level={null} onLogout={handleLogout} view="entry">
      <div className="mp-container wr-entry">

        {/* =========================
           상단 내비게이션
        ========================= */}
        <header className="mp-header">
          <button
            type="button"
            className="app-btn app-btn-ghost"
            onClick={() => navigate("/play")}
          >
            ← 탐험 선택
          </button>
        </header>
        <div className="wr-entry-title">
          <p className="wr-kicker">ONLINE · 온라인 대전</p>
          <h1>방 만들기 · 코드로 참가</h1>
        </div>

        {/* =========================
           모드 선택
        ========================= */}
        <div className="mp-mode-grid" role="group" aria-label="온라인 모드 선택">
          <button
            type="button"
            className={`mp-mode-card ${selectedMode === "duel" ? "mp-mode-card--active" : ""
              }`}
            aria-pressed={selectedMode === "duel"}
            onClick={() => setSelectedMode("duel")}
          >
            ⚔️ 1 vs 1
          </button>

          <button
            type="button"
            className={`mp-mode-card ${selectedMode === "group" ? "mp-mode-card--active" : ""
              }`}
            aria-pressed={selectedMode === "group"}
            onClick={() => setSelectedMode("group")}
          >
            👥 단체모드
          </button>
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

                    const room = await createGroupRoom();

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
                      await joinGroupRoom(room.id);

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
          <p className="mp-error" role="alert">{submitError}</p>
        )}

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
                  <li>방장이 대기실에서 두 사람이 함께 쓸 목표 문서 하나를 고릅니다.</li>
                  <li>참가자는 방장이 고른 목표를 바로 확인할 수 있습니다.</li>
                  <li>READY 단계는 없습니다. 상대가 입장하고 목표가 정해지면 방장이 시작합니다.</li>
                  <li>시작 문서는 경기 시작 시 정해지며, 같은 목표에 먼저 도달한 사람이 승리합니다.</li>
                  <li>상대 현재 문서, 이동 횟수, 상태를 확인할 수 있습니다.</li>
                  <li>
                    아이템전으로 만들면 시작할 때 {DUEL_SLOT_COUNT}칸을 받습니다.
                    지급과 사용 판정은 서버가 하며, 새로고침해도 다시 뽑히지 않습니다.
                  </li>
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
                <p>
                  1vs1 아이템전에서만 나옵니다. 한 판에 {DUEL_SLOT_COUNT}칸을 받고,
                  칸마다 역할이 정해져 있습니다.
                </p>
                {DUEL_ITEM_HELP_SECTIONS.map((section) => (
                  <div key={section.role}>
                    <h4>{section.label}</h4>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item.id}>
                          <strong>{item.name}:</strong> {item.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

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
    </WikiRaceShell>
  );
}
