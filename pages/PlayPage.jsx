import React from "react";

const modes = [
  { id: "solo", ordinal: "01", kicker: "혼자 · SOLO", title: "싱글 탐험", description: "혼자 위키 경로를 탐색합니다", tags: ["랜덤", "목표 지정", "오늘의 탐험"], action: "싱글 시작 →" },
  { id: "duel", ordinal: "02", kicker: "2인 · DUEL", title: "1:1 대전", description: "다른 탐험가와 목표 문서까지 경쟁합니다", tags: ["아이템전 선택 가능"], action: "1:1 로비 →" },
  { id: "group", ordinal: "03", kicker: "3–8인 · GROUP", title: "그룹 레이스", description: "3~8명이 같은 코스에서 경쟁합니다", tags: ["완주 후 관전"], action: "그룹 로비 →" },
];

// Presentation only. MainPage retains the real single setup and auth state.
export default function PlayPage({ isGuest, onSingle, onMultiplayer }) {
  return <>
    <div className="wr-play-heading"><div><p className="wr-kicker">EXPEDITION DESK · 탐험 선택</p><h1>시작할 탐험을 선택</h1></div><img src="/assets/wiki-race/explorer-play.png" height="74" alt="" /></div>
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
        <span className="wr-mode-tags">{mode.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
        <span className="wr-mode-action">{isGuest && mode.id !== "solo" ? "로그인 후 이용 가능" : mode.action}</span>
      </button>)}
    </div>
  </>;
}
