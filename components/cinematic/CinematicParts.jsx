import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import ProfileAvatar from "../ProfileAvatar.jsx";
import useProfileCards from "../../hooks/useProfileCards.js";
import useCinematicFrame from "../../hooks/useCinematicFrame.js";
import { drawGroupEnd, drawSingleEnd } from "../../utils/cinematicMotion.js";
import { buildProfileCard, mergeRewardSlots } from "../../utils/profileCard.js";
import { groupPodiumGroups } from "../../utils/cinematicPresentation.js";
import useAudioCues from '../../hooks/useAudioCues.js';
import { audioManager } from '../../services/audioManager.js';

export const CinematicContext = createContext({ active: false, phase: "records", skip: () => {} });
export function CinematicSkip({ onClick, label = "연출 건너뛰기" }) { return <button type="button" className="wr-cinematic-skip" onClick={onClick}>{label} →</button>; }
export function CinematicStage({ stageRef, scene, active, className = "", label, hidden = false, children }) {
  return <div ref={stageRef} className={`wr-cinematic-stage ${className}`} data-scene={scene} data-cinematic-active={active} hidden={hidden} aria-label={label}>
    <div className="world"><svg className="field-map" viewBox="0 0 1400 650" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${-100 + i * 20} ${40 + i * 50}C${100 + i * 20} ${230 + i * 50} ${310 + i * 20} ${-80 + i * 50} ${430 + i * 20} ${100 + i * 50}S${550 + i * 20} ${490 + i * 50} ${740 + i * 20} ${100 + i * 50} ${1000 + i * 20} ${450 + i * 50} ${1450 + i * 20} ${30 + i * 50}`} />)}
      {[130,100,70].map((rx,i) => <ellipse key={rx} cx="220" cy="360" rx={rx} ry={[60,42,24][i]} />)}
    </svg>{children}</div>
  </div>;
}
export function CourseDocument({ title, target = false, className = "" }) { return <><span className="course-caption">{target ? "목표 문서" : "출발 문서"}</span><strong className={`course-title${target ? " gold" : ""} ${className}`}>{title || "코스 확인 중"}</strong></>; }
export function InkParticles({ duel = false }) { return <><div className="ink-particles" aria-hidden="true">{Array.from({ length: duel ? 28 : 10 }, (_,i) => <i key={i} style={{ background: duel ? ["#243430", "#f6d478", "#fff4d6"][i % 3] : "var(--gold)" }} />)}</div><div className="ring" aria-hidden="true" /></>; }
export function CourseSlots({ startTitle, targetTitle }) {
  if (!startTitle || !targetTitle) return <p role="status">서버 코스를 확인하는 중입니다.</p>;
  return <div className="reel-machine"><div className="reels wr-course-slots" aria-label="서버 확정 공통 코스">
    {[{kind:"start",title:startTitle},{kind:"target",title:targetTitle}].map((slot,i) => <React.Fragment key={slot.kind}>
      {i === 1 && <span className="course-arrow" aria-hidden="true">→</span>}
      <div className="reel-box wr-course-slot" data-reel={slot.kind}>
        <div className="reel-label"><span>{i ? "공통 목표" : "공통 출발"}</span><span className="lock-state" aria-label="공개 대기" /></div>
        <div className="reel-window">
          <div className="reel-strip" aria-hidden="true">{Array.from({length:13},(_,n) => <div className={`reel-back motif-${n%6}`} key={n}><img src={n%6 === 0 ? `/assets/wiki-race/route-${i ? "group" : "solo"}.svg` : `/profile-icons/${["", "compass", "book", "map", "globe", "quill"][n%6]}.svg`} alt="" /></div>)}</div>
          <div className="reel-final"><CourseDocument title={slot.title} target={i === 1} /></div>
          <div className="reel-shade" aria-hidden="true" /><div className="reel-flash" aria-hidden="true" /><div className="reel-lock-frame" aria-hidden="true" />
        </div>
      </div>
    </React.Fragment>)}
  </div><svg className="group-connection" viewBox="0 0 800 30" aria-hidden="true"><path d="M80 15H720" stroke="#27877d" strokeWidth="3" strokeDasharray="640" strokeDashoffset="640" /></svg><p className="departure">START!</p></div>;
}
export function GroupEndCinematic({ rows }) {
  const { active, phase, skip, identity } = useContext(CinematicContext), root = useRef(null), [revealed,setRevealed] = useState([]);
  const soundFrame = useAudioCues(`group-result:${identity}`, [
    { id: 'final', at: 0, sound: 'open' },
    ...[3,2,1].filter(rank => rows.some(row => row.rank === rank)).map(rank => ({ id: `rank-${rank}`, at: ({3:850,2:1650,1:3050})[rank], sound: rank === 1 ? 'finish' : 'reveal' })),
  ]);
  useEffect(() => { if (active) audioManager.prepare(['open', 'reveal', 'finish']); }, [active]);
  const cards = useProfileCards(rows.map(row => row.userId));
  useCinematicFrame(root, active, drawGroupEnd, 6200, soundFrame);
  useEffect(() => { if (!active) { setRevealed([]); return undefined; } const timers=[[3,850],[2,1650],[1,3050]].map(([rank,at])=>setTimeout(()=>setRevealed(previous=>[...previous,rank]),at)); return ()=>timers.forEach(clearTimeout); },[active]);
  const groups = groupPodiumGroups(rows), mine = rows.find(row => row.isMe);
  if (!active || !groups.length) return null;
  return <CinematicStage stageRef={root} scene="group-end" active={active} hidden={phase === "records"} className="wr-group-ceremony" label="원정대 전체 종료 순위 발표">
    <section className="paper result-board"><div className="board-binding" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} />)}</div><div className="ceremony-page">
      <header className="board-heading"><h2 tabIndex={-1}>그룹 결과</h2></header>
      <div className="podium wr-cinematic-podium">{groups.map(group => <div className={`podium-slot wr-podium-slot`} key={group.rank} data-rank={group.rank} data-revealed={revealed.includes(group.rank)}>
        <div className="podium-person wr-podium-person" aria-hidden={!revealed.includes(group.rank)}>
          <span className="podium-rank">{group.rank}</span>
          <div className="podium-avatar"><ProfileAvatar size="lg" card={mergeRewardSlots(buildProfileCard({userId:group.rows[0].userId,nickname:group.rows[0].name,source:"snapshot"}),cards[group.rows[0].userId])} /></div>
          <strong className={group.rows.length > 1 ? "tied-names" : ""}>{group.rows.map(row=>row.name).join(" · ")}</strong>
          <small>{group.rows.length > 1 ? `공동 ${group.rank}위` : `${group.rows[0].time} · ${group.rows[0].moves}`}</small>
          <div className="podium-plinth">{group.rows.length > 1 ? "공동 " : ""}{group.rank}위 · 완주</div>
        </div>
      </div>)}</div><InkParticles />
      {mine && <div className="my-record"><span>내 기록 · {mine.name}</span><span>{mine.rank ? `${mine.rank}위 · ` : ""}{mine.status} · {mine.time} · {mine.moves}</span></div>}
      <div className="result-transition"><CinematicSkip onClick={skip} label="전체 기록" /></div>
    </div></section>
    <p className="wr-sr-only" role="status" aria-live="polite">{groups.filter(group=>revealed.includes(group.rank)).map(group=>`${group.rank}위 ${group.rows.map(row=>row.name).join(", ")}`).join(" · ")}</p>
  </CinematicStage>;
}
export function SingleEndCinematic() {
  const { active, skip, identity } = useContext(CinematicContext), root = useRef(null);
  const soundFrame = useAudioCues(`single-result:${identity}`, [{ id: 'arrival', at: 0, sound: 'finish' }]);
  useCinematicFrame(root, active, drawSingleEnd, 1800, soundFrame);
  useEffect(() => {
    if (!active) return undefined;
    const onKey = event => { if (event.key === 'Escape' && !event.defaultPrevented) skip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skip]);
  if (!active) return null;
  // Decorate the existing result heading. Records/rewards stay in their original card.
  return <div ref={root} data-scene="single-end" data-cinematic-active={active} className="wr-single-cinematic wr-single-finish-moment" aria-label="완주 순간">
    <h2 tabIndex={-1}>완주!</h2>
    <div className="wr-cinematic-stamp finish-stamp" aria-label="완료"><strong>완료</strong></div>
    <span className="finish-impact" aria-hidden="true" />
  </div>;
}
