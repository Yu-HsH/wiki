import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../authContext";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell";
import ExpeditionDialog from "../components/wiki-race/ExpeditionDialog";
import { LobbyIcon } from "../components/wiki-race/LobbyParts";
import { getScopedMultiplayerMode, resolveMultiplayerMode } from "../utils/multiplayerModeSelection.js";
import { createRoom } from "../services/multiplayerService";
import { createGroupRoom } from "../services/groupMultiplayerService";
import { enterItemRoom, itemModeEnabled, itemRoomPath, readItemAdmission } from "../services/itemModeEntryService.js";
import { joinMultiplayerByCode, multiplayerEntryError } from "../services/multiplayerEntryService.js";
import { listPublicRooms, joinPublicRoom } from "../services/publicRoomService";
import { itemName } from "../components/group-items-jungle/s5UiContract.js";
import "../css/publicRooms.css";
import "../css/jungle65Lobby.css";

const itemGuide = [
  ["방해", [
    ["ink", "상대의 문서 일부를 먹물로 덮습니다."],
    ["censor", "상대 문서의 일부 링크를 잠시 막습니다."],
    ["trap", "링크에 상자를 설치합니다. 상대가 그 링크를 누르면 발동합니다."],
    ["lost_link", "상대를 이동 가능한 다른 문서로 보냅니다."],
    ["thunder", "천둥으로 상대의 움직임이나 아이템 사용을 방해합니다."],
    ["thief", "상대가 보유한 아이템을 빼앗습니다."],
    ["cannon", "상대가 있는 문서 쪽으로 이동합니다."],
  ]],
  ["방어와 이동", [
    ["parry", "공격 안내가 뜨면 시간 안에 눌러 공격을 막거나 되돌립니다."],
    ["shield", "보호가 유지되는 동안 들어오는 공격을 막습니다."],
    ["correction", "현재 걸린 방해 효과를 해제합니다."],
    ["bookmark", "현재 문서를 표시해 두고 돌아갈 수 있습니다."],
    ["undo", "직전에 방문한 문서로 돌아갑니다."],
  ]],
  ["탐색과 보급", [
    ["search", "현재 문서에서 단어를 검색합니다."],
    ["link_index", "현재 문서의 이동 가능한 링크를 목록으로 봅니다."],
    ["enhancement", "아이템의 효과를 강화합니다."],
    ["weakening", "상대 아이템의 효과를 약화합니다."],
    ["roulette", "룰렛 결과로 아이템 효과를 발동합니다."],
  ]],
];

function MultiplayerHelp({ onClose }) {
  return <div className="help-backdrop" onClick={onClose}>
    <ExpeditionDialog className="help-modal" titleId="wr-multiplayer-help-title" onClose={onClose}>
      <header className="mp-help-header">
        <h2 id="wr-multiplayer-help-title">규칙 · 아이템 안내</h2>
        <button type="button" className="text-btn" aria-label="안내 닫기" onClick={onClose}>×</button>
      </header>
      <div className="mp-help-content">
        <h3>1:1 대전</h3>
        <p>방장이 대기실에서 두 사람이 함께 쓸 목표 문서 하나를 고릅니다. READY 단계는 없습니다. 같은 문서에서 출발해 먼저 목표에 도착하면 승리합니다.</p>
        <h3>그룹 레이스</h3>
        <p>3–8명이 같은 문서에서 출발합니다. 일반전은 참가자가 제출한 서로 다른 후보 두 개를 코스로 사용합니다. 아이템전은 정해진 코스로 경기합니다. 모두 준비하면 방장이 시작할 수 있어요.</p>
        <p>제한 시간은 20분입니다. 3위가 완주하면 남은 시간 안에서 최대 2분을 더 달릴 수 있습니다.</p>
        <h3>아이템 17종</h3>
        <p>1:1과 그룹 아이템전 모두 시작 아이템을 1개 받습니다. 시작 20초 뒤 첫 보급부터 25초마다 아이템이 지급되며, 가방에는 최대 2개를 보관합니다. 가방이 찼으면 보상 화면에서 교체 여부를 선택할 수 있습니다.</p>
        {itemGuide.map(([label, items]) => <section key={label}>
          <h4>{label}</h4>
          <ul>{items.map(([id, text]) => <li key={id}><strong>{itemName(id)}</strong> · {text}</li>)}</ul>
        </section>)}
      </div>
    </ExpeditionDialog>
  </div>;
}

export default function MultiplayerPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const routeMode = getScopedMultiplayerMode(searchParams.get("mode"));
  const [manualMode, setManualMode] = useState(null);
  const selectedMode = resolveMultiplayerMode(routeMode, manualMode);
  const [roomCode, setRoomCode] = useState("");
  const [groupCapacity, setGroupCapacity] = useState(6);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitting = useRef(false);
  const [itemChoice, setItemChoice] = useState(null);
  const useItems = itemChoice ?? (searchParams.get("items") === "1");
  const [isPublic, setIsPublic] = useState(false);
  const [admission, setAdmission] = useState(null);
  const [admissionAttempt, setAdmissionAttempt] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const roomsRequest = useRef(0);
  const actorId = user?.id;
  const itemEnabled = itemModeEnabled(selectedMode);
  const itemStatus = admission?.mode === selectedMode && admission?.actorId === actorId ? admission.status : "checking";

  useEffect(() => {
    if (!useItems || !itemEnabled || !actorId) return;
    const abort = new AbortController();
    readItemAdmission(selectedMode, actorId, abort.signal).then(
      entry => { if (!abort.signal.aborted) setAdmission({ mode: selectedMode, actorId, status: entry.available ? "open" : "closed" }); },
      () => { if (!abort.signal.aborted) setAdmission({ mode: selectedMode, actorId, status: "error" }); },
    );
    return () => abort.abort();
  }, [useItems, itemEnabled, selectedMode, actorId, admissionAttempt]);

  const refreshPublicRooms = useCallback(async (mode = selectedMode) => {
    if (!mode || !actorId) return;
    const request = ++roomsRequest.current;
    setRoomsLoading(true);
    setRoomsError("");
    try {
      const rooms = await listPublicRooms(mode);
      if (request === roomsRequest.current) setPublicRooms(rooms);
    } catch {
      if (request === roomsRequest.current) {
        setRoomsError("공개방 목록을 불러오지 못했습니다.");
        setPublicRooms([]);
      }
    } finally {
      if (request === roomsRequest.current) setRoomsLoading(false);
    }
  }, [selectedMode, actorId]);

  useEffect(() => {
    if (!selectedMode || !actorId) return;
    void refreshPublicRooms(selectedMode);
    const refresh = () => {
      if (!document.hidden && !submitting.current) void refreshPublicRooms(selectedMode);
    };
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      roomsRequest.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [selectedMode, actorId, refreshPublicRooms]);

  async function submit(action, fallback, onError) {
    if (submitting.current) return;
    if (!actorId) { setSubmitError("로그인이 필요합니다."); return; }
    submitting.current = true;
    setPending(true);
    setSubmitError("");
    try {
      navigate(await action());
    } catch (error) {
      setSubmitError(multiplayerEntryError(error, fallback));
      onError?.();
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  function createSelectedRoom() {
    return submit(async () => {
      if (useItems) return itemRoomPath(selectedMode, await enterItemRoom(selectedMode, actorId, "create"));
      if (selectedMode === "duel") {
        const room = await createRoom(actorId, { useItems: false, isPublic });
        return `/multiplayer/room/${room.id}`;
      }
      const room = await createGroupRoom({ maxPlayers: groupCapacity, isPublic });
      return `/multiplayer/group/room/${room.id}`;
    }, "방을 만들지 못했어요. 다시 시도해 주세요.");
  }

  function selectItemMode(checked) {
    setItemChoice(checked);
    setAdmission(null);
    setSubmitError("");
  }

  const group = selectedMode === "group";
  const itemNameForMode = group ? "그룹 아이템전" : "1:1 아이템전";
  const itemBlocked = useItems && (!itemEnabled || itemStatus !== "open");
  const admissionNotice = !itemEnabled || itemStatus === "closed" ? "지금은 새 아이템전 방을 만들 수 없어요."
    : itemStatus === "error" ? "아이템전 입장 상태를 확인하지 못했어요." : "아이템전 입장 상태를 확인하는 중…";

  return <WikiRaceShell user={user} level={null} onLogout={async () => { await logout(); navigate("/"); }} view="entry">
    <div className="mp-container wr-entry wr65-entry">
      <header className="mp-header"><button type="button" className="app-btn app-btn-ghost"
        onClick={() => navigate("/play")}>← 탐험 선택</button></header>
      <div className="wr-entry-title wr65-entry-heading">
        <p className="wr-kicker">EXPEDITION BOARD · 탐험가 모집 게시판</p>
        <h1>{selectedMode ? group ? "그룹" : "1:1" : "온라인"} 탐험가 모집</h1>
        <p className="wr-entry-lead">공개방에 합류하거나 방 코드를 공유해 함께 탐험하세요.</p>
      </div>

      {!routeMode && <div className="mp-mode-grid" role="group" aria-label="온라인 모드 선택">
        <button type="button" className={`mp-mode-card ${selectedMode === "duel" ? "mp-mode-card--active" : ""}`}
          aria-pressed={selectedMode === "duel"} aria-label="1 vs 1" disabled={pending}
          onClick={() => { setManualMode("duel"); selectItemMode(false); }}>
          <span className="wr-kicker">DUEL · 2인</span><strong>1:1 대전</strong><span>같은 목표에 먼저 도착하면 승리</span>
        </button>
        <button type="button" className={`mp-mode-card ${selectedMode === "group" ? "mp-mode-card--active" : ""}`}
          aria-pressed={selectedMode === "group"} aria-label="단체모드" disabled={pending}
          onClick={() => { setManualMode("group"); selectItemMode(false); }}>
          <span className="wr-kicker">GROUP · 3–8인</span><strong>그룹 레이스</strong><span>같은 코스에서 순위 경쟁</span>
        </button>
      </div>}

      <div className="wr-entry-rules" role="note">
        {selectedMode ? group ? "3–8명이 모여 모두 준비하면 방장이 시작할 수 있어요. 일반전은 각자 코스 후보를 제출합니다."
          : "방장이 목표 문서를 정합니다. 두 명이 모이면 방장이 경기를 시작할 수 있어요."
          : "먼저 만들 방의 모드를 선택하세요. 초대 코드는 바로 입력할 수 있어요."}
      </div>

      <div className="wr65-entry-layout">
        <div className="mp-mode-panel">
          {selectedMode && <section className="mp-card mp-card--create">
            <h2 className="mp-card-title">방 만들기</h2>
            <p className="mp-card-desc">{group ? "최소 3명이 모여야 시작할 수 있어요." : "방장이 목표를 정하고 초대 코드를 공유하세요."}</p>
            <label className="mp-option">
              <input type="checkbox" checked={useItems} onChange={event => selectItemMode(event.target.checked)} disabled={pending} />
              아이템전으로 진행
            </label>
            {useItems ? <div className="mp-item-admission" role="status">
              <strong>{itemNameForMode}</strong>
              <p>{itemBlocked ? admissionNotice : "방을 만들고 초대 코드를 공유하세요. 목록에는 표시되지 않습니다."}</p>
              {itemBlocked && <p>체크를 해제하면 일반전 방을 만들 수 있어요.</p>}
              {itemEnabled && (itemStatus === "error" || itemStatus === "closed") &&
                <button type="button" className="mp-action-btn mp-action-btn--secondary" disabled={pending}
                  onClick={() => { setAdmission(null); setAdmissionAttempt(attempt => attempt + 1); }}>입장 상태 다시 확인</button>}
            </div> : <>
              {group && <label className="mp-card-desc">방 정원 (방장 포함){" "}
                <select aria-label="그룹 방 정원" value={groupCapacity} disabled={pending} onChange={event => setGroupCapacity(Number(event.target.value))}>
                  {[3, 4, 5, 6, 7, 8].map(count => <option key={count} value={count}>{count}명</option>)}
                </select>
              </label>}
              <label className="mp-option">
                <input type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} disabled={pending} />
                공개방으로 만들기 · 목록에서 참가 가능
              </label>
            </>}
            <button type="button" className="mp-action-btn mp-action-btn--primary" disabled={pending || itemBlocked}
              onClick={createSelectedRoom}>{pending ? "처리 중…" : "방 생성"}</button>
          </section>}
          <section className="mp-card mp-card--join">
            <h2 className="mp-card-title">코드로 참가</h2>
            <p className="mp-card-desc">초대 코드를 입력하면 해당 방으로 이동합니다.</p>
            <form className="mp-join-row" onSubmit={event => {
              event.preventDefault();
              void submit(() => joinMultiplayerByCode(roomCode, selectedMode, actorId), "방에 참가하지 못했어요. 코드를 확인해 주세요.");
            }}>
              <input className="mp-code-input" value={roomCode} onChange={event => setRoomCode(event.target.value)}
                placeholder="방 코드" aria-label="방 코드" enterKeyHint="go"
                autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={pending} />
              <button className="mp-action-btn mp-action-btn--secondary" type="submit" disabled={pending}>참가</button>
            </form>
          </section>
        </div>
        {selectedMode && <section className="mp-public-board" aria-label="공개방 목록" aria-busy={roomsLoading}>
          <div className="mp-public-board__header">
            <div>
              <span className="wr-kicker"><LobbyIcon name="flag" /> PUBLIC EXPEDITIONS · 공개 원정대</span>
              <h2>참가할 수 있는 {group ? "그룹" : "1:1"} 방</h2>
              <p>공개 설정된 대기방입니다. 새 아이템전 방은 코드로 참가할 수 있어요.</p>
            </div>
            <button type="button" className="mp-action-btn mp-action-btn--secondary" disabled={pending || roomsLoading}
              onClick={() => void refreshPublicRooms(selectedMode)}>{roomsLoading ? "불러오는 중…" : "새로고침"}</button>
          </div>
          {roomsLoading && <p className="mp-public-board__loading" role="status">열린 원정대를 찾고 있습니다…</p>}
          {roomsError && <p role="alert" className="mp-public-board__error">{roomsError}</p>}
          {!roomsLoading && !roomsError && publicRooms.length === 0 &&
            <p className="mp-public-board__empty">참가할 수 있는 공개방이 없어요. 직접 방을 만들어 보세요.</p>}
          <ul className="mp-public-board__list">{publicRooms.map(room => <li key={room.room_id} className="mp-public-room">
            <span className="mp-public-room__flag" aria-hidden="true"><LobbyIcon name="flag" size={18} /></span>
            <div className="mp-public-room__detail">
              <strong><span className="wr65-player-name">{room.host_nickname || "탐험가"}</span>님의 방</strong>
              <span className="mp-public-room__meta"><span className="wr65-room-count">{room.current_players}/{room.max_players}명</span>
                {room.mode === "duel" && room.use_items ? " · 기존 5슬롯 아이템전" : " · 일반전"}</span>
            </div>
            <button type="button" className="mp-action-btn mp-action-btn--primary"
              aria-label={`${room.host_nickname || "탐험가"}님의 공개방 참가하기`} disabled={pending || roomsLoading}
              onClick={() => void submit(async () => {
                await joinPublicRoom(room.room_id);
                return room.mode === "group" ? `/multiplayer/group/room/${room.room_id}` : `/multiplayer/room/${room.room_id}`;
              }, "공개방에 참가하지 못했어요.", () => void refreshPublicRooms(room.mode))}>참가하기</button>
          </li>)}</ul>
        </section>}
      </div>

      {submitError && <p className="mp-error" role="alert">{submitError}</p>}
      <button type="button" className="wr-btn wr-btn--secondary wr-entry-help" onClick={() => setShowHelp(true)} aria-label="게임 설명">규칙 · 아이템 안내</button>
      <p className="wr65-font-credit"><a href="/licenses/jungle65-fonts.html" target="_blank" rel="noreferrer">사용 글꼴 안내</a></p>
      {showHelp && <MultiplayerHelp onClose={() => setShowHelp(false)} />}
    </div>
  </WikiRaceShell>;
}
