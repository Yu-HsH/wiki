import React from "react";
import { NavLink } from "react-router-dom";
import { LOBBY_PATH } from "../../utils/appRoutes";

export function ExplorerAvatar({ size = 36 }) {
  return <img className="wr-avatar" src="/assets/wiki-race/explorer-portrait.png" width={size} height={size} alt="" />;
}

export function WikiRaceHeader({ user, level, onLogout }) {
  return <header className="wr-header">
    <NavLink to={LOBBY_PATH} className="wr-brand" aria-label="Wiki Race HOME">WIKI RACE<span>JUNGLE EXPEDITION</span></NavLink>
    <nav aria-label="주요 메뉴">
      <NavLink to={LOBBY_PATH}>HOME</NavLink>
      <NavLink to="/play">PLAY</NavLink>
      {!user.isGuest && <><NavLink to="/ranking">랭킹</NavLink><NavLink to="/achievements">업적</NavLink></>}
    </nav>
    <div className="wr-header-user">
      {user.isGuest ? <span>게스트 탐험가</span> : <NavLink to="/profile" aria-label={`${user.displayName} 프로필`}><span>{level !== null && `Lv.${level} · `}{user.displayName}</span><ExplorerAvatar /></NavLink>}
      <button type="button" onClick={onLogout}>로그아웃</button>
    </div>
  </header>;
}

export function ExpeditionTrail() {
  return <svg className="wr-expedition-trail" viewBox="0 0 700 200" aria-hidden="true">
    <path className="wr-trail-line" d="M20 170 C150 95 210 195 330 100 S500 145 665 40" fill="none" stroke="var(--wr-trail)" strokeWidth="3" strokeDasharray="7 8" />
    {[ [150, 130], [330, 100], [520, 85] ].map(([cx, cy], i) => <circle className={`wr-checkpoint wr-checkpoint-${i}`} key={cx} cx={cx} cy={cy} r="6" fill="var(--wr-paper)" stroke="var(--wr-trail)" strokeWidth="3" />)}
    <path d="M665 40V10h20l-5 5 5 5h-20" fill="var(--wr-gold)" stroke="var(--wr-gold)" strokeWidth="2" />
  </svg>;
}

export default function WikiRaceShell({ user, level, onLogout, view = "home", children }) {
  return <div className={`wr-page wr-${view}`}><div className="wr-shell">
    <a className="wr-skip-link" href="#wr-content">본문 바로가기</a>
    <WikiRaceHeader user={user} level={level} onLogout={onLogout} />
    <main id="wr-content">{children}</main>
  </div></div>;
}
