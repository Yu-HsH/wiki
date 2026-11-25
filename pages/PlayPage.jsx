import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { duelV4 } from "../services/duelV4Service.js";
import { supabase } from "../supabaseClient.js";
import { readProductBinding } from "../components/group-items-jungle/productContract.js";

const s5EntryEnabled = import.meta.env.MODE === "s4-product-candidate" || import.meta.env.VITE_GROUP_ITEMS_S5_ENTRY === "1";
const duelV4EntryEnabled = import.meta.env.VITE_DUEL_ITEMS_V4_ENTRY === "1";
const modes = [
  { id: "solo", kicker: "혼자 · SOLO", title: "싱글 탐험", tagline: "나만의 페이스로 링크의 숲을 돌파하세요.", description: "시작 문서에서 목표 문서까지, 가장 빠른 길을 개척하세요.", course: "랜덤 코스 또는 직접 고른 목표. 오늘의 탐험은 모두에게 같은 출발·목표입니다.", next: "탐험 시작에서 목표를 고르거나, 아래 오늘의 탐험에 도전하세요.", tags: ["혼자 집중", "기록 도전", "오늘의 탐험"], action: "탐험 시작" },
  { id: "duel", kicker: "2인 · DUEL", title: "1:1 대전", tagline: "같은 출발선, 같은 목표. 승자는 단 한 명.", description: "라이벌보다 먼저 도착하세요. 한 번의 링크 선택이 승부를 가릅니다.", course: "방장이 공통 목표를 확정하고, 출발 문서는 경기 시작 시 정해집니다.", next: "방 생성 또는 코드 참가 → 방장 목표 확정 → 두 명 입장 후 시작.", tags: ["정면 승부", "실시간 대결", "아이템전 선택"], action: "대전 시작" },
  { id: "group", kicker: "3–8인 · GROUP", title: "그룹 레이스", tagline: "여러 탐험가와 함께 목표를 향해 질주하세요.", description: "같은 코스, 치열한 순위 경쟁. 가장 먼저 링크의 길을 개척하세요.", course: "각자 제출한 후보 중 서로 다른 두 문서가 출발·목표로 정해집니다.", next: "후보 선택 → 전원 READY → 방장 시작. 20분 · 아이템 없음.", tags: ["다인 경쟁", "순위 레이스", "함께 질주"], action: "그룹 로비 입장" },
  ...(duelV4EntryEnabled ? [{ id: "duel-v4", kicker: "2인 · ITEM RACE", title: "1:1 아이템전", tagline: "두 명이 같은 문서에서 출발해 목표까지 경주합니다.", description: "경기 중 받은 아이템으로 상대를 견제하고 공격을 막습니다.", course: "방장이 공통 목표를 확정합니다. 두 참가자는 같은 출발 문서에서 시작합니다.", next: "방 생성 또는 코드 참가 → 방장 목표 확정 → 경기 시작.", items: "경기 중 획득한 아이템은 하단 슬롯에서 사용합니다.", tags: ["정면 승부", "공격과 방어"], action: "아이템전 입장", href: "/multiplayer/duel-v4" }] : []),
  ...(s5EntryEnabled ? [{ id: "group-items", kicker: "3–8인 · ITEM RACE", title: "그룹 아이템전", tagline: "3–8명이 같은 문서에서 출발해 목표까지 경주합니다.", description: "경기 중 받은 아이템으로 견제하며 순위를 겨룹니다.", course: "같은 출발·목표를 공유합니다. 서버가 시작 아이템 1개와 이후 보급을 결정합니다.", next: "방 생성 또는 코드 참가 → 전원 준비 → 경기 시작.", items: "서버 지급 · 첫 20초 후 보급 · 이후 25초 간격 · 최대 2칸.", tags: ["랜덤 아이템", "20초 첫 보급", "최대 2개 보유"], action: "아이템전 입장" }] : []),
];

const admissionMessages = {
  checking: ["입장 확인 중", "이용 가능 여부를 확인하고 있습니다."],
  open: ["입장 가능", "현재 입장할 수 있습니다."],
  restricted: ["입장 제한", "현재 새 방을 만들거나 입장할 수 없습니다."],
  unavailable: ["입장 확인 실패", "입장 안내에서 다시 확인해 주세요."],
};

async function readDuelAdmission() {
  const { available } = await duelV4.entry();
  if (typeof available !== "boolean") throw new Error("INVALID_DUEL_ADMISSION");
  return available;
}

async function readGroupAdmission() {
  const { data, error } = await supabase.rpc("get_group_items_entry_v1", {
    p_channel: import.meta.env.MODE === "s4-product-candidate" ? "review" : "production",
  });
  if (error) throw error;
  if (data?.available === false || data?.admissionEnabled === false) return false;
  if (data?.available !== true || data.admissionEnabled !== true) throw new Error("INVALID_GROUP_ADMISSION");
  readProductBinding(data.binding);
  return true;
}

function useItemAdmission(enabled) {
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    function check(id, read) {
      const show = status => {
        if (active) setStatuses(previous => ({ ...previous, [id]: status }));
      };
      void read().then(available => show(available ? "open" : "restricted"), () => show("unavailable"));
    }
    if (duelV4EntryEnabled) check("duel-v4", readDuelAdmission);
    if (s5EntryEnabled) check("group-items", readGroupAdmission);
    return () => { active = false; };
  }, [enabled]);
  return statuses;
}

// The cards display a status hint. Each existing route decides whether to admit the player.
export default function PlayPage({ isGuest, practice = false, onSingle, onMultiplayer }) {
  const canCheckAdmission = !isGuest && !practice;
  const statuses = useItemAdmission(canCheckAdmission);
  const visibleModes = modes.filter(mode => !isGuest || mode.id !== "duel-v4");
  return <>
    <div className="wr-play-heading"><div><p className="wr-kicker">CHOOSE YOUR EXPEDITION · 탐험 준비</p><h1>탐험 모드를 선택하세요</h1><p className="wr-entry-lead">혼자 개척할지, 라이벌과 맞붙을지, 여러 탐험가와 함께 질주할지 선택하세요.</p></div><img src="/assets/wiki-race/explorer-play.png" height="74" alt="" /></div>
    <p className="wr-access-note" role="note">
      {isGuest ? "게스트는 싱글 탐험부터! 대전 참여와 기록·XP·보상 저장은 로그인 후 열립니다."
        : <>싱글 탐험, 1:1 대전, 그룹 레이스를 선택할 수 있습니다.{canCheckAdmission && (duelV4EntryEnabled || s5EntryEnabled) && " 별도 아이템전의 입장 상태는 각 카드에서 확인해 주세요."}</>}
    </p>
    <div className="wr-modes">
      <svg className="wr-play-contours" viewBox="0 180 920 390" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M-20 240 C 200 200 400 280 620 230 C 760 200 860 230 940 210" />
        <path d="M-20 360 C 200 320 380 410 620 350 C 760 320 860 350 940 330" />
        <path d="M-20 480 C 200 440 380 530 620 470 C 760 440 860 470 940 450" />
      </svg>
      {visibleModes.map((mode, index) => {
        const isItemMode = mode.id === "duel-v4" || mode.id === "group-items";
        const status = isItemMode && canCheckAdmission ? statuses[mode.id] ?? "checking" : null;
        const lockedForGuest = isGuest && mode.id !== "solo";
        const lockedForPractice = practice && isItemMode;
        const disabled = lockedForGuest || lockedForPractice;
        const action = lockedForGuest ? "로그인 후 이용 가능"
          : lockedForPractice ? "연습 중에는 이용할 수 없습니다"
          : status && status !== "open" ? "입장 안내 보기"
          : mode.action;
        const actionLabel = mode.title + " · " + (lockedForGuest ? "로그인 필요" : action);
        const statusId = status ? "wr-mode-admission-" + mode.id : undefined;
        return <article key={mode.id} className="wr-mode" aria-labelledby={`wr-mode-${mode.id}`}>
          <img className="wr-vignette wr65-mode-art" src={`/assets/wiki-race/jungle65/${mode.id.startsWith("duel") ? "duel" : mode.id.startsWith("group") ? "group" : "solo"}-expedition.webp`} width="480" height="148" alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `/assets/wiki-race/route-${mode.id === "group-items" ? "group" : mode.id === "duel-v4" ? "duel" : mode.id}.svg`; }} />
          <div className="wr-mode-heading" data-tutorial-protect={mode.id === "solo" ? "" : undefined} data-tutorial-anchor={mode.id === "duel" ? "play.modes" : undefined}><div><span className="wr-kicker">{mode.kicker}</span><h2 className="wr-mode-title" id={`wr-mode-${mode.id}`}>{mode.title}</h2></div><span className="wr-mode-ordinal" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span></div>
          <p className="wr-mode-tagline">{mode.tagline}</p>
          <p className="wr-mode-desc">{mode.description}</p>
          <ul className="wr-mode-tags" aria-label={`${mode.title} 특징`}>{mode.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
          {status && <p className="wr-mode-admission" id={statusId} data-status={status} role="status">
            <strong>{admissionMessages[status][0]}</strong>
            <span>{admissionMessages[status][1]}</span>
          </p>}
          <details className="wr-mode-details">
            <summary>자세히 보기<span className="wr-visually-hidden"> · {mode.title} 규칙</span></summary>
            <p className="wr-mode-brief"><strong>출발과 목표</strong>{mode.course}</p>
            <p className="wr-mode-brief"><strong>준비 순서</strong>{mode.next}</p>
            <p className="wr-mode-brief"><strong>아이템 안내</strong>{mode.id === "solo" ? "아이템 없음 · 문서 링크만으로 탐험합니다." : mode.id === "duel" ? "방 생성 시 아이템전 선택. 실제 역할별 아이템은 로비의 규칙 · 아이템 안내에서 확인하세요." : mode.items ?? "아이템 없이 문서 속 링크로 경쟁합니다."}</p>
          </details>
          {mode.href && !disabled ? (
            <Link to={mode.href} className="wr-mode-action" aria-label={actionLabel} aria-describedby={statusId}>
              {action}<span aria-hidden="true">→</span>
            </Link>
          ) : (
            <button type="button" data-tutorial-anchor={"play." + mode.id} className="wr-mode-action" aria-label={actionLabel}
              aria-describedby={statusId} aria-disabled={disabled} onClick={() => {
                if (mode.id === "solo") onSingle();
                else if (!disabled) onMultiplayer(mode.id);
              }}>
              {action}{!disabled && <span aria-hidden="true">→</span>}
            </button>
          )}
        </article>;
      })}
    </div>
    <ol className="wr-briefing-note" aria-label="탐험 준비 순서">
      <li><b>01</b> 모드 선택</li>
      <li><b>02</b> 출발 · 목표 확인</li>
      <li><b>03</b> 링크를 따라 출발!</li>
    </ol>
  </>;
}
