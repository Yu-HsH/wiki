import React, { useContext, useEffect, useRef, useState } from "react";
import { Pill, RaceIcon, RouteChain } from "../race/RaceParts.jsx";
import { formatRecordDate } from "../../../utils/resultJournal.js";
import useSceneSequence from "../../../hooks/useSceneSequence.js";
import { CinematicContext, GroupEndCinematic } from "../../cinematic/CinematicParts.jsx";
import { groupPodiumGroups } from "../../../utils/cinematicPresentation.js";
import { audioManager } from '../../../services/audioManager.js';
import useResultAudio from '../../../hooks/useResultAudio.js';
import { DuelEndRecordsVisible } from '../../cinematic/DuelEndVisibility.js';

// Phase 4 RESULT presentation parts (Freeze 07 · 08). No data access, no game logic —
// pages own every handler, subscription and server-authoritative value and pass display
// state in. XP and achievements stay inside the existing `ResultXp` (mounted once per view
// by the page) — these parts only frame it.

/**
 * Result root. `layer="overlay"` is a modal dialog over the (inert) race shell;
 * `layer="page"` is a normal page. The outcome heading receives focus when the
 * result appears and whenever `focusKey` changes (e.g. Result C → B).
 */
export function ResultScreen({ mode, tone, layer = "page", titleId, focusKey = null, resultKey = null, motionEligible = true, confirmed = true, cinematic = null, testId, children }) {
  const rootRef = useRef(null);
  const [skippedKey, setSkippedKey] = useState(null);
  const entrance = useSceneSequence(resultKey && `sheet:${mode}:${resultKey}`, {
    eligible: motionEligible, confirmed, duration: cinematic === "group" ? 6200 : cinematic === "single" ? 1800 : 1100,
    stopped: Boolean(resultKey && skippedKey === resultKey),
  });
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    setFolded(false);
    if (!entrance || cinematic !== "group") return undefined;
    const timer = setTimeout(() => setFolded(true), 5250);
    return () => clearTimeout(timer);
  }, [entrance, cinematic, resultKey]);
  const hasPodium = React.Children.toArray(children).some(child => child?.props?.variant === "group-final" && groupPodiumGroups(child.props.podiumRows || []).length);
  useEffect(() => {
    // Reduced motion removes the decoration, not a newly confirmed result's audio.
    // Share the exact normal-scene key so changing the preference cannot replay it.
    if (!resultKey || !confirmed || !motionEligible || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (cinematic === 'single') void audioManager.play('finish', { key: `single-result:${mode}:${resultKey}:arrival` });
    else if (cinematic === 'group' && hasPodium) void audioManager.play('finish', { key: `group-result:${mode}:${resultKey}:rank-1` });
  }, [resultKey, confirmed, motionEligible, cinematic, mode, hasPodium]);
  const phase = entrance && cinematic === "single" ? "single" : entrance && cinematic === "group" && hasPodium && !folded ? "ceremony" : "records";
  const duelRecordsVisible = useContext(DuelEndRecordsVisible);
  useResultAudio(`result:${mode}:${resultKey || titleId}`, phase === 'records' && duelRecordsVisible, confirmed);
  const skip = () => {
    audioManager.stopEffects();
    setSkippedKey(resultKey);
    requestAnimationFrame(() => {
      const heading = rootRef.current?.querySelector(`#${titleId}`);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  };
  useEffect(() => {
    const heading = phase === "records" ? titleId && rootRef.current?.querySelector(`#${titleId}`) : rootRef.current?.querySelector('.wr-cinematic-stage h2,.wr-single-finish-moment h2');
    // Announce the visible heading; auto-transition must not steal focus from reward controls.
    const usingResultControl = rootRef.current?.contains(document.activeElement) && document.activeElement?.matches('button,a,input,select,textarea');
    if (!usingResultControl) heading?.focus({ preventScroll: true });
  }, [titleId, focusKey, phase]);

  // `wr-race` brings the Phase 3 resets (headings, lists, focus ring, sr-only) — same as Result A.
  const className = `wr-page wr-race wr-result wr-result--${mode} wr-result--${tone} wr-result-layer--${layer}${entrance ? " is-journal-arrival" : ""}${cinematic ? " wr-cinematic-result" : ""}${phase === "single" ? " is-single-celebrating" : phase === "ceremony" ? " is-cinematic-cover" : entrance && cinematic === "group" ? " is-cinematic-records-transition" : ""}`;
  const attributes = { "data-cinematic-scene": cinematic ? `${cinematic}-end` : undefined, "data-cinematic-phase": phase, "data-cinematic-duration": cinematic === "group" ? 6200 : cinematic === "single" ? 1800 : undefined };
  if (layer === "overlay") {
    return <div ref={rootRef} className={className} {...attributes} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
      <CinematicContext.Provider value={{ active: entrance, phase, skip, identity: `${mode}:${resultKey}`, audioEligible: motionEligible && confirmed }}><div className="wr-result-frame">{children}</div></CinematicContext.Provider>
    </div>;
  }
  return <div ref={rootRef} className={className} {...attributes} data-testid={testId}>
    <CinematicContext.Provider value={{ active: entrance, phase, skip, identity: `${mode}:${resultKey}`, audioEligible: motionEligible && confirmed }}><main className="wr-result-frame" aria-labelledby={titleId}>{children}</main></CinematicContext.Provider>
  </div>;
}

/**
 * Decorative journal cover. Date comes only from a supplied server timestamp.
 * `reached` labels goal arrival; outcome semantics stay in ResultOutcome.
 */
export function ResultScene({ reached = false, celebration = "none", destination = null, recordedAt = null, variant = "record", podiumRows = [] }) {
  const { active } = useContext(CinematicContext);
  const date = formatRecordDate(recordedAt);
  if (variant === "group-final" && active && groupPodiumGroups(podiumRows).length) return <GroupEndCinematic rows={podiumRows} />;
  if (variant === "group-final" && reached && !active) return null;
  return <div className={`wr-rscene ${reached ? "is-reached" : ""} wr-rscene--${celebration}`} aria-hidden="true">
    <span className="wr-journal-heading"><small>EXPLORER'S FIELD JOURNAL</small><strong>{variant === "group-final" ? "원정대 전체 기록" : "탐험 기록지"}</strong>{date && <span>{date} · 서버 기록</span>}</span>
    {destination && <span className="wr-rscene-dest"><span className="wr-hud-label">목표 문서</span><b>{destination}</b></span>}
    <span className={`wr-journal-seal ${reached ? "is-complete" : ""}`}>{variant === "group-final" ? "전체 순위 기록" : reached ? "목표 도달" : "결과 기록"}</span>
  </div>;
}

/** Stitched double-frame card — RESULT only (Freeze ResultCard). */
export function ResultCard({ children }) {
  return <section className="wr-result-card wr-rcard">{children}</section>;
}

/** Outcome row: kicker ▸ heading ▸ meta ▸ pill, optional explanation. */
export function ResultOutcome({ kicker, title, titleId, meta = null, pill = null, detail = null }) {
  return <header className="wr-result-row wr-result-head wr-rhead">
    <span className="wr-hud-label wr-rhead-kicker">{kicker}</span>
    <div className="wr-result-headline">
      <h1 id={titleId} tabIndex={-1}>{title}</h1>
      {meta && <span className="wr-rhead-meta">{meta}</span>}
      {pill && <Pill tone={pill.tone} filled icon={pill.icon || null} wrap>{pill.text}</Pill>}
    </div>
    {detail && <p className="wr-rhead-detail">{detail}</p>}
  </header>;
}

/**
 * Record row. Each item: `{label, value, muted?, wide?, icon?}`; `value` may be a node.
 * `–` values are announced as "기록 없음".
 */
export function ResultStats({ items = [], label = "기록" }) {
  return <dl className="wr-result-row wr-result-stats wr-rstats" aria-label={label}>
    {items.filter(Boolean).map((item) => <div key={item.label} className={`${item.wide ? "is-wide" : ""} ${item.muted ? "is-muted" : ""}`}>
      <dt className="wr-hud-label">{item.icon && <RaceIcon name={item.icon} size={12} />}{item.label}</dt>
      <dd>{item.value === "–" ? <><span aria-hidden="true">–</span><span className="wr-sr-only">기록 없음</span></> : item.value}</dd>
    </div>)}
  </dl>;
}

export function ResultCourse({ start, target }) {
  return <span className="wr-result-course">{start || "출발"} <span aria-hidden="true">▸</span><span className="wr-sr-only">에서</span> <b>{target || "목표"}</b></span>;
}

/** XP row — wraps the page's single `ResultXp` mount (ledger + reveal stay its authority). */
export function ResultXpRow({ children, label = "XP 획득 · 서버 지급 기록" }) {
  return <section className="wr-result-row wr-rxp-row" aria-label="이번 결과 XP와 업적">
    <span className="wr-hud-label">{label}</span>
    {children}
  </section>;
}

/**
 * Route row on top of the Phase 3 `RouteChain`; the toggle shows the whole route (wraps, no h-scroll).
 * `extra` may be a render function receiving the toggle state (e.g. the opponent's revealed route).
 */
export function ResultRoute({ title = "내 경로", meta = null, path = [], reachedTarget = false, tail = null, extra = null, expandable = false }) {
  const [open, setOpen] = useState(false);
  const steps = path.filter(Boolean);
  const long = steps.length > 5 || expandable;
  return <section className="wr-result-row wr-result-route wr-rroute" aria-label={title}>
    <div className="wr-rroute-head">
      <span className="wr-hud-label">{title}</span>
      {meta && <small>{meta}</small>}
      {long && <button type="button" className="wr-race-link" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "접기 ▴" : "전체 경로 ▾"}</button>}
    </div>
    <div className="wr-rroute-chain">
      <RouteChain path={steps} reachedTarget={reachedTarget} max={open ? 999 : 5} />
      {tail && <span className="wr-rroute-tail">{tail}</span>}
    </div>
    {typeof extra === "function" ? extra(open) : extra}
  </section>;
}

export function ResultActions({ children }) {
  return <div className="wr-result-row wr-result-actions wr-ractions">{children}</div>;
}

/**
 * Final standings 1–8 (server order). Rows come from `buildGroupStandingRows`.
 * Status is text + icon — never colour alone.
 */
export function GroupStandings({ rows = [], finishedCount = 0, retiredCount = 0, course = null }) {
  return <section className="wr-result-row wr-standings" aria-labelledby="wr-standings-title">
    <div className="wr-standings-head">
      <h2 id="wr-standings-title" className="wr-hud-label">FINAL STANDINGS · 최종 순위</h2>
      {course}
      <small>완주 {finishedCount} · 리타이어 {retiredCount}</small>
    </div>
    <div className="wr-srow wr-srow--head" aria-hidden="true">
      <span>순위</span><span>탐험가</span><span>시간</span><span>이동</span><span>상태</span>
    </div>
    <ol className="wr-standings-list">
      {rows.map((row, index) => <li key={row.key} style={{ "--scene-order": index }} className={`wr-srow ${row.isMe ? "is-me" : ""} ${row.retired ? "is-retired" : ""} ${row.isWinner ? "is-winner" : ""}`} aria-current={row.isMe ? "true" : undefined}>
        <span className="wr-srow-rank">{row.rank === null
          ? <><span aria-hidden="true">–</span><span className="wr-sr-only">순위 없음</span></>
          : <>{row.rank}<span className="wr-sr-only">위</span></>}</span>
        <span className="wr-srow-name"><span className="wr-srow-nick">{row.name}</span>{row.isMe && <Pill tone="blue" filled>나</Pill>}</span>
        <span className="wr-srow-time">{row.time === "–" ? <><span aria-hidden="true">–</span><span className="wr-sr-only">완주 시간 없음</span></> : row.time}</span>
        <span className="wr-srow-moves">{row.moves}</span>
        <span className="wr-srow-state">
          <RaceIcon name={row.retired ? "current" : "check"} size={12} />
          <span>{row.status}</span>
          {row.reason && <small>{row.reason}</small>}
        </span>
      </li>)}
    </ol>
  </section>;
}
