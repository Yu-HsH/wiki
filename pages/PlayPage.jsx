import React from "react";
const modes = [
  { id: "solo", ordinal: "01", kicker: "혼자 · SOLO", title: "싱글 탐험", tagline: "나만의 페이스로 링크의 숲을 돌파하세요.", description: "시작 문서에서 목표 문서까지, 가장 빠른 길을 개척하세요.", course: "랜덤 코스 또는 직접 고른 목표. 오늘의 탐험은 모두에게 같은 출발·목표입니다.", next: "탐험 시작에서 목표를 고르거나, 아래 오늘의 탐험에 도전하세요.", tags: ["혼자 집중", "기록 도전", "오늘의 탐험"], action: "탐험 시작" },
  { id: "duel", ordinal: "02", kicker: "2인 · DUEL", title: "1:1 대전", tagline: "같은 출발선, 같은 목표. 승자는 단 한 명.", description: "라이벌보다 먼저 도착하세요. 한 번의 링크 선택이 승부를 가릅니다.", course: "방장이 공통 목표를 확정하고, 출발 문서는 경기 시작 시 정해집니다.", next: "방 생성 또는 코드 참가 → 방장 목표 확정 → 두 명 입장 후 시작.", tags: ["정면 승부", "실시간 대결", "아이템전 선택"], action: "대전 시작" },
  { id: "group", ordinal: "03", kicker: "3–8인 · GROUP", title: "그룹 레이스", tagline: "여러 탐험가와 함께 목표를 향해 질주하세요.", description: "같은 코스, 치열한 순위 경쟁. 가장 먼저 링크의 길을 개척하세요.", course: "각자 제출한 후보 중 서로 다른 두 문서가 출발·목표로 정해집니다.", next: "후보 선택 → 전원 READY → 방장 시작. 20분 · 아이템 없음.", tags: ["다인 경쟁", "순위 레이스", "함께 질주"], action: "그룹 로비 입장" },
];

// Presentation only. MainPage retains the real single setup and auth state.
export default function PlayPage({ isGuest, onSingle, onMultiplayer }) {
  return <>
    <div className="wr-play-heading"><div><p className="wr-kicker">CHOOSE YOUR EXPEDITION · 탐험 준비</p><h1>탐험 모드를 선택하세요</h1><p className="wr-entry-lead">혼자 개척할지, 라이벌과 맞붙을지, 여러 탐험가와 함께 질주할지 선택하세요.</p></div><img src="/assets/wiki-race/explorer-play.png" height="74" alt="" /></div>
    <p className="wr-access-note" role="note">{isGuest ? "게스트는 싱글 탐험부터! 대전 참여와 기록·XP·보상 저장은 로그인 후 열립니다." : "모든 탐험 모드가 열렸습니다. 나만의 코스를 개척하거나, 라이벌에게 도전하세요."}</p>
    <div className="wr-modes">
      <svg className="wr-play-contours" viewBox="0 180 920 390" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M-20 240 C 200 200 400 280 620 230 C 760 200 860 230 940 210" />
        <path d="M-20 360 C 200 320 380 410 620 350 C 760 320 860 350 940 330" />
        <path d="M-20 480 C 200 440 380 530 620 470 C 760 440 860 470 940 450" />
      </svg>
      {modes.map(mode => <article key={mode.id} className="wr-mode" aria-labelledby={`wr-mode-${mode.id}`}>
        <img className="wr-vignette wr65-mode-art" src={`/assets/wiki-race/jungle65/${mode.id === "duel" ? "duel" : mode.id === "group" ? "group" : "solo"}-expedition.webp`} width="480" height="148" alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `/assets/wiki-race/route-${mode.id}.svg`; }} />
        <div className="wr-mode-heading"><div><span className="wr-kicker">{mode.kicker}</span><h2 className="wr-mode-title" id={`wr-mode-${mode.id}`}>{mode.title}</h2></div><span className="wr-mode-ordinal" aria-hidden="true">{mode.ordinal}</span></div>
        <p className="wr-mode-tagline">{mode.tagline}</p>
        <p className="wr-mode-desc">{mode.description}</p>
        <ul className="wr-mode-tags" aria-label={`${mode.title} 특징`}>{mode.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
        <details className="wr-mode-details">
          <summary>자세히 보기<span className="wr-visually-hidden"> · {mode.title} 규칙</span></summary>
          <p className="wr-mode-brief"><strong>출발과 목표</strong>{mode.course}</p>
          <p className="wr-mode-brief"><strong>준비 순서</strong>{mode.next}</p>
          <p className="wr-mode-brief"><strong>아이템 안내</strong>{mode.id === "solo" ? "아이템 없음 · 문서 링크만으로 탐험합니다." : mode.id === "duel" ? "방 생성 시 아이템전 선택. 실제 역할별 아이템은 로비의 규칙 · 아이템 안내에서 확인하세요." : "아이템 없이 문서 속 링크로 경쟁합니다."}</p>
        </details>
        <button type="button" className="wr-mode-action" aria-label={`${mode.title} · ${isGuest && mode.id !== "solo" ? "로그인 필요" : mode.action}`} aria-disabled={isGuest && mode.id !== "solo"} onClick={() => {
          if (mode.id === "solo") onSingle();
          else if (!isGuest) onMultiplayer(mode.id);
        }}>{isGuest && mode.id !== "solo" ? "로그인 후 이용 가능" : <>{mode.action}<span aria-hidden="true">→</span></>}</button>
      </article>)}
    </div>
    <ol className="wr-briefing-note" aria-label="탐험 준비 순서">
      <li><b>01</b> 모드 선택</li>
      <li><b>02</b> 출발 · 목표 확인</li>
      <li><b>03</b> 링크를 따라 출발!</li>
    </ol>
  </>;
}
