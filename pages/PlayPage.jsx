import React from "react";
const modes = [
  { id: "solo", ordinal: "01", kicker: "혼자 · SOLO", title: "싱글 탐험", description: "나만의 속도로 문서 속 링크를 따라 목표에 도착하세요.", course: "랜덤 코스 또는 직접 고른 목표. 오늘의 탐험은 모두에게 같은 출발·목표입니다.", next: "싱글 시작에서 목표를 고르거나, 아래 오늘의 탐험을 시작하세요.", tags: ["랜덤", "목표 지정", "오늘의 탐험"], action: "싱글 시작 →" },
  { id: "duel", ordinal: "02", kicker: "2인 · DUEL", title: "1:1 대전", description: "같은 목표 문서에 먼저 도달하는 탐험가가 승리합니다.", course: "방장이 공통 목표를 확정하고, 출발 문서는 경기 시작 시 정해집니다.", next: "방 생성 또는 코드 참가 → 방장 목표 확정 → 두 명 입장 후 시작.", tags: ["아이템전 선택 가능", "별도 준비 버튼 없음"], action: "1:1 로비 →" },
  { id: "group", ordinal: "03", kicker: "3–8인 · GROUP", title: "그룹 레이스", description: "3~8명이 같은 출발·목표 문서를 향해 경쟁합니다.", course: "각자 제출한 후보 중 서로 다른 두 문서가 출발·목표로 정해집니다.", next: "후보 선택 → 전원 READY → 방장 시작. 20분 · 아이템 없음.", tags: ["완주 후 관전", "개인 결과 → 전체 결과"], action: "그룹 로비 →" },
];

// Presentation only. MainPage retains the real single setup and auth state.
export default function PlayPage({ isGuest, onSingle, onMultiplayer }) {
  return <>
    <div className="wr-play-heading"><div><p className="wr-kicker">EXPEDITION DESK · 탐험 준비</p><h1>시작할 탐험을 선택</h1><p className="wr-entry-lead">시작 문서에서 목표 문서까지, 위키백과의 하이퍼링크를 따라갑니다.</p></div><img src="/assets/wiki-race/explorer-play.png" height="74" alt="" /></div>
    <p className="wr-access-note" role="note">{isGuest ? "게스트는 싱글 탐험을 이용할 수 있습니다. 온라인 대전·기록 저장·XP·보상은 로그인 후 이용하세요." : "로그인한 탐험가는 모든 모드를 이용할 수 있습니다. 방을 만들거나 공유받은 코드로 참가하세요."}</p>
    <div className="wr-modes">
      <svg className="wr-play-contours" viewBox="0 180 920 390" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M-20 240 C 200 200 400 280 620 230 C 760 200 860 230 940 210" />
        <path d="M-20 360 C 200 320 380 410 620 350 C 760 320 860 350 940 330" />
        <path d="M-20 480 C 200 440 380 530 620 470 C 760 440 860 470 940 450" />
      </svg>
      {modes.map(mode => <button type="button" key={mode.id} className="wr-mode" aria-label={`${mode.title} · ${isGuest && mode.id !== "solo" ? "로그인 필요" : mode.action}`} aria-disabled={isGuest && mode.id !== "solo"} onClick={() => {
        if (mode.id === "solo") onSingle();
        else if (!isGuest) onMultiplayer(mode.id);
      }}>
        <span className="wr-mode-heading"><span><span className="wr-kicker">{mode.kicker}</span><span className="wr-mode-title">{mode.title}</span></span><span className="wr-mode-ordinal">{mode.ordinal}</span></span>
        <img className="wr-vignette" src={`/assets/wiki-race/route-${mode.id}.svg`} width="150" height="86" alt="" />
        <span className="wr-mode-desc">{mode.description}</span>
        <span className="wr-mode-brief"><strong>출발과 목표</strong>{mode.course}</span>
        <span className="wr-mode-brief"><strong>준비 순서</strong>{mode.next}</span>
        <span className="wr-mode-brief"><strong>아이템 안내</strong>{mode.id === "solo" ? "아이템 없음 · 문서 링크만으로 탐험합니다." : mode.id === "duel" ? "방 생성 시 아이템전 선택. 실제 역할별 아이템은 로비의 규칙 · 아이템 안내에서 확인하세요." : "아이템 없이 문서 속 링크로 경쟁합니다."}</span>
        <span className="wr-mode-tags">{mode.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
        <span className="wr-mode-action">{isGuest && mode.id !== "solo" ? "로그인 후 이용 가능" : mode.action}</span>
      </button>)}
    </div>
    <ol className="wr-briefing-note" aria-label="탐험 준비 순서">
      <li><b>01</b> 탐험 방식을 고릅니다</li>
      <li><b>02</b> 시작과 목표 문서를 확인합니다</li>
      <li><b>03</b> 문서 속 링크를 따라 탐험합니다</li>
    </ol>
  </>;
}
