import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../authContext";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell";
import ExpeditionDialog from "../components/wiki-race/ExpeditionDialog";
import {
  createRoom,
  joinDuelRoomByCode,
} from "../services/multiplayerService";
import {
  createGroupRoom,
  findGroupRoomByCode,
  joinGroupRoom,
} from "../services/groupMultiplayerService";
import { listPublicRooms, joinPublicRoom } from "../services/publicRoomService";
import "../css/publicRooms.css";
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
  const [groupCapacity, setGroupCapacity] = useState(6);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitting = useRef(false);

  const [useItems, setUseItems] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const roomsRequest = useRef(0);

  const refreshPublicRooms = useCallback(async (mode = selectedMode) => {
    if (!mode || !user?.id) return;
    const request = ++roomsRequest.current;
    setRoomsLoading(true);
    setRoomsError("");
    try {
      const rooms = await listPublicRooms(mode);
      if (request === roomsRequest.current) setPublicRooms(rooms);
    } catch (error) {
      if (request === roomsRequest.current) {
        setRoomsError(error instanceof Error ? error.message : "공개방 목록을 불러오지 못했습니다.");
        setPublicRooms([]);
      }
    } finally {
      if (request === roomsRequest.current) setRoomsLoading(false);
    }
  }, [selectedMode, user?.id]);
  useEffect(() => {
    if (selectedMode && user?.id) void refreshPublicRooms(selectedMode);
    else { setPublicRooms([]); setRoomsLoading(false); }
    return () => { roomsRequest.current += 1; };
  }, [selectedMode, user?.id, refreshPublicRooms]);

  const handleJoinPublicRoom = async room => {
    if (submitting.current || !user?.id) return;
    try {
      submitting.current = true;
      setPending(true);
      setSubmitError("");
      await joinPublicRoom(room.room_id);
      navigate(room.mode === "group"
        ? `/multiplayer/group/room/${room.room_id}`
        : `/multiplayer/room/${room.room_id}`, { state: { role: "guest" } });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "공개방에 참가하지 못했습니다.");
      void refreshPublicRooms(room.mode);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  const [showHelp, setShowHelp] = useState(false);

  /* =========================
     1vs1 방 생성
     ========================= */
  const handleCreateDuelRoom = async () => {
    if (submitting.current) return;
    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }

    try {
      submitting.current = true;
      setPending(true);
      setSubmitError("");

      const room = await createRoom(user.id, {
        useItems, isPublic,
      });

      navigate(`/multiplayer/room/${room.id}`, {
        state: { useItems },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "방 생성 실패"
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  /* =========================
     1vs1 방 참가
     ========================= */
  const handleJoinDuelRoom = async () => {
    if (submitting.current) return;
    const code = duelRoomCodeInput.trim().toUpperCase();
    if (!code) { setSubmitError("방 코드를 입력해 주세요."); return; }

    if (!user?.id) {
      setSubmitError("로그인이 필요합니다.");
      return;
    }

    try {
      submitting.current = true;
      setPending(true);
      setSubmitError("");

      const player = await joinDuelRoomByCode(code);
      navigate(`/multiplayer/room/${player.room_id}`, {
        state: { role: "guest" },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "참가 실패"
      );
    } finally {
      submitting.current = false;
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
          <p className="wr-kicker">EXPEDITION BOARD · 원정대 준비</p>
          <h1>방 만들기 · 공개방 찾기</h1>
          <p className="wr-entry-lead">공개방 목록에서 합류하거나, 비공개 방 코드를 공유해 함께 탐험하세요.</p>
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
            aria-label="1 vs 1"
            disabled={pending}
            onClick={() => { setSelectedMode("duel"); setSubmitError(""); }}
          >
            <span className="wr-kicker">DUEL · 2인</span><strong>1 vs 1</strong><span>공통 목표 · 먼저 도착하면 승리</span>
          </button>

          <button
            type="button"
            className={`mp-mode-card ${selectedMode === "group" ? "mp-mode-card--active" : ""
              }`}
            aria-pressed={selectedMode === "group"}
            aria-label="단체모드"
            disabled={pending}
            onClick={() => { setSelectedMode("group"); setSubmitError(""); }}
          >
            <span className="wr-kicker">GROUP · 3–8인</span><strong>단체모드</strong><span>같은 코스 · 후보 선택 후 READY</span>
          </button>
        </div>
        <div className="wr-entry-rules" role="note">
          {!selectedMode ? "먼저 1:1 또는 단체모드를 선택하세요." : selectedMode === "duel" ? "방장이 목표를 확정합니다. 두 명이 입장하면 방장이 시작하며, 출발 문서는 시작 시 정해집니다. 아이템 사용 여부는 방 생성 시 선택합니다." : "3–8명 · 20분 · 아이템 없음. 각자 후보를 제출하고 READY. 전원 준비·서로 다른 후보 2개 이상일 때 방장이 시작합니다."}
        </div>

        {/* =========================
           1vs1 모드
        ========================= */}
        {selectedMode === "duel" && (
          <div className="mp-mode-panel">

            {/* 방 생성 카드 */}
            <div className="mp-card mp-card--create">
              <div className="wr-kicker">01 · 새 탐험 열기</div>
              <h3 className="mp-card-title">방 만들기</h3>
              <p className="mp-card-desc">
                방장이 되어 목표 문서를 정하고 상대에게 방 코드를 공유하세요.
              </p>

              <label className="mp-option">
                <input
                  type="checkbox"
                  checked={useItems}
                  onChange={(e) => setUseItems(e.target.checked)}
                />
                아이템 사용 · 시작 시 {DUEL_SLOT_COUNT}칸
              </label>

              <label className="mp-option">
                <input type="checkbox" checked={isPublic}
                  onChange={event => setIsPublic(event.target.checked)} disabled={pending} />
                공개방으로 만들기 · 다른 탐험가가 목록에서 참가할 수 있습니다
              </label>

              <button
                className="mp-action-btn mp-action-btn--primary"
                onClick={handleCreateDuelRoom}
                disabled={pending}
              >
                {pending ? "처리 중..." : "방 생성"}
              </button>
            </div>

            {/* 방 참가 카드 */}
            <div className="mp-card mp-card--join">
              <div className="wr-kicker">02 · 열린 탐험에 합류</div>
              <h3 className="mp-card-title">방 참가</h3>
              <p className="mp-card-desc">
                코드를 입력하여 참가합니다
              </p>

              <form className="mp-join-row" onSubmit={e => { e.preventDefault(); void handleJoinDuelRoom(); }}>
                <input
                  className="mp-code-input"
                  value={duelRoomCodeInput}
                  onChange={(e) => setDuelRoomCodeInput(e.target.value)}
                  placeholder="ROOM CODE"
                  aria-label="1:1 방 코드"
                  autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  disabled={pending}
                />

                <button
                  className="mp-action-btn mp-action-btn--secondary"
                  type="submit"
                  disabled={pending}
                >
                  참가
                </button>
              </form>
            </div>

          </div>
        )}

        {/* =========================
           단체 모드 
        ========================= */}
        {selectedMode === "group" && (
          <div className="mp-mode-panel">

            {/* 방 생성 */}
            <div className="mp-card mp-card--create">
              <div className="wr-kicker">01 · 새 탐험 열기</div>
              <h3 className="mp-card-title">단체 방 만들기</h3>
              <p className="mp-card-desc">
                방 생성 후 코드를 공유하세요. 최소 3명이 모여야 시작할 수 있습니다.
              </p>
              <label className="mp-card-desc">방 정원 (방장 포함){' '}
                <select aria-label="그룹 방 정원" value={groupCapacity} disabled={pending} onChange={event => setGroupCapacity(Number(event.target.value))}>
                  {[3, 4, 5, 6, 7, 8].map(count => <option key={count} value={count}>{count}명</option>)}
                </select>
              </label>

              <label className="mp-option">
                <input type="checkbox" checked={isPublic}
                  onChange={event => setIsPublic(event.target.checked)} disabled={pending} />
                공개방으로 만들기 · 목록에서 참가 가능
              </label>

              <button
                className="mp-action-btn mp-action-btn--primary"
                disabled={pending}
                onClick={async () => {
                  if (submitting.current) return;
                  if (!user?.id) {
                    setSubmitError("로그인이 필요합니다.");
                    return;
                  }

                  try {
                    submitting.current = true;
                    setPending(true);
                    setSubmitError("");

                    const room = await createGroupRoom({ maxPlayers: groupCapacity, isPublic });

                    navigate(`/multiplayer/group/room/${room.id}`);
                  } catch (error) {
                    setSubmitError(error instanceof Error ? error.message : "단체 방 생성 실패");
                  } finally {
                    submitting.current = false;
                    setPending(false);
                  }
                }}
              >
                {pending ? "처리 중..." : "방 생성"}
              </button>
            </div>

            {/* 방 참가 */}
            <div className="mp-card mp-card--join">
              <div className="wr-kicker">02 · 열린 탐험에 합류</div>
              <h3 className="mp-card-title">단체 방 참가</h3>
              <p className="mp-card-desc">
                코드를 입력하여 참가합니다
              </p>

              <form className="mp-join-row" onSubmit={async (e) => {
                e.preventDefault();
                if (submitting.current) return;
                const code = groupRoomCodeInput.trim().toUpperCase();
                if (!code) { setSubmitError("방 코드를 입력해 주세요."); return; }
                if (!user?.id) { setSubmitError("로그인이 필요합니다."); return; }
                try {
                  submitting.current = true; setPending(true); setSubmitError("");
                  const room = await findGroupRoomByCode(code);
                  await joinGroupRoom(room.id);
                  navigate(`/multiplayer/group/room/${room.id}`);
                } catch (error) {
                  setSubmitError(error instanceof Error ? error.message : "단체 방 참가 실패");
                } finally { submitting.current = false; setPending(false); }
              }}>
                <input
                  className="mp-code-input"
                  value={groupRoomCodeInput}
                  onChange={(e) => setGroupRoomCodeInput(e.target.value)}
                  placeholder="ROOM CODE"
                  aria-label="단체 방 코드"
                  autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  disabled={pending}
                />

                <button
                  className="mp-action-btn mp-action-btn--secondary"
                  type="submit" disabled={pending}
                >
                  참가
                </button>
              </form>
            </div>

          </div>
        )}
        {selectedMode && (
          <section className="mp-public-board" aria-label="공개방 목록">
            <div className="mp-public-board__header">
              <div>
                <span className="wr-kicker">03 · 공개 원정대 찾기</span>
                <h2>참가할 수 있는 {selectedMode === "duel" ? "1:1" : "그룹"} 방</h2>
                <p>공개 설정된 대기방만 표시됩니다. 비공개방은 방 코드로 참가하세요.</p>
              </div>
              <button type="button" className="mp-action-btn mp-action-btn--secondary"
                disabled={pending || roomsLoading} onClick={() => void refreshPublicRooms(selectedMode)}>
                {roomsLoading ? "불러오는 중…" : "새로고침"}
              </button>
            </div>
            {roomsError && <p role="alert" className="mp-public-board__error">{roomsError}</p>}
            {!roomsLoading && !roomsError && publicRooms.length === 0 && (
              <p className="mp-public-board__empty">참가할 수 있는 공개방이 없어요. 직접 방을 만들어 보세요.</p>
            )}
            <ul className="mp-public-board__list">
              {publicRooms.map(room => (
                <li key={room.room_id} className="mp-public-room">
                  <div className="mp-public-room__detail">
                    <strong>{room.host_nickname || "탐험가"}님의 방</strong>
                    <span>{room.current_players}/{room.max_players}명
                      {room.mode === "duel" ? ` · ${room.use_items ? "아이템전" : "아이템 없음"}` : " · 그룹 탐험"}
                    </span>
                  </div>
                  <button type="button" className="mp-action-btn mp-action-btn--primary"
                    disabled={pending || roomsLoading} onClick={() => void handleJoinPublicRoom(room)}>
                    참가하기
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* =========================
           에러 메시지
        ========================= */}
        {submitError && (
          <p className="mp-error" role="alert">{submitError}<br /><small>모드와 코드를 확인하세요. 연결 문제가 있다면 잠시 후 다시 시도하세요.</small></p>
        )}

        <button type="button" className="wr-btn wr-btn--secondary wr-entry-help" onClick={() => setShowHelp(true)} aria-label="게임 설명">
          규칙 · 아이템 안내
        </button>

        {/* ── 도움말 모달 ── */}
        {showHelp && (
          <div className="help-backdrop" onClick={() => setShowHelp(false)}>
            <ExpeditionDialog className="help-modal" titleId="wr-multiplayer-help-title" onClose={() => setShowHelp(false)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--app-line)", paddingBottom: "0.75rem" }}>
                <h2 id="wr-multiplayer-help-title" style={{ margin: 0, fontSize: "1.25rem" }}>멀티플레이 안내</h2>
                <button type="button" className="text-btn" aria-label="안내 닫기" onClick={() => setShowHelp(false)} style={{ fontSize: "1.5rem", lineHeight: 1 }}>
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
                  <li>3~8명이 참여하며 제한 시간은 20분입니다. 제출한 후보 중 서로 다른 2개가 출발·목표 문서로 정해집니다.</li>
                  <li>최소 3명 · 전원 READY · 서로 다른 후보 2개 이상일 때 방장이 시작합니다.</li>
                  <li>마감 전 목표에 도착하면 4위 이후도 정상 완주로 기록됩니다. 순위에 따라 보상을 받습니다.</li>
                  <li>3위 완주 후 최대 2분의 추가 시간이 주어지며, 시작 후 20분이 되면 종료됩니다. 전원이 완주하거나 리타이어하면 먼저 종료됩니다.</li>
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
            </ExpeditionDialog>
          </div>
        )}

      </div>
    </WikiRaceShell>
  );
}
