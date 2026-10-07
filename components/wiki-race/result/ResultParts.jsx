import React, { useEffect, useRef, useState } from "react";
import { Pill, RaceIcon, RouteChain } from "../race/RaceParts.jsx";

// Phase 4 RESULT presentation parts (Freeze 07 · 08). No data access, no game logic —
// pages own every handler, subscription and server-authoritative value and pass display
// state in. XP and achievements stay inside the existing `ResultXp` (mounted once per view
// by the page) — these parts only frame it.

const MASCOTS = Object.freeze({
  win: "/assets/wiki-race/explorer-win.png",
  lose: "/assets/wiki-race/explorer-lose.png",
});

/**
 * Result root. `layer="overlay"` is a modal dialog over the (inert) race shell;
 * `layer="page"` is a normal page. The outcome heading receives focus when the
 * result appears and whenever `focusKey` changes (e.g. Result C → B).
 */
export function ResultScreen({ mode, tone, layer = "page", titleId, focusKey = null, testId, children }) {
  const rootRef = useRef(null);
  useEffect(() => {
    const heading = titleId ? rootRef.current?.querySelector(`#${titleId}`) : null;
    heading?.focus({ preventScroll: true });
  }, [titleId, focusKey]);

  // `wr-race` brings the Phase 3 resets (headings, lists, focus ring, sr-only) — same as Result A.
  const className = `wr-page wr-race wr-result wr-result--${mode} wr-result--${tone} wr-result-layer--${layer}`;
  if (layer === "overlay") {
    return <div ref={rootRef} className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
      <div className="wr-result-frame">{children}</div>
    </div>;
  }
  return <div ref={rootRef} className={className} data-testid={testId}>
    <main className="wr-result-frame" aria-labelledby={titleId}>{children}</main>
  </div>;
}

/**
 * Decorative destination scene: trail to the summit flag and the approved mascot.
 * `reached` fills the summit; `celebration` is "full" | "dots" | "none" (no motion data).
 */
export function ResultScene({ mascot = null, reached = false, celebration = "none", destination = null }) {
  return <div className={`wr-rscene ${reached ? "is-reached" : ""} wr-rscene--${celebration}`} aria-hidden="true">
    {destination && <span className="wr-rscene-dest"><span className="wr-hud-label">DESTINATION · 목표 문서</span><b>{destination}</b></span>}
    <svg className="wr-rscene-trail" viewBox="0 0 640 120" preserveAspectRatio="none" focusable="false">
      <path className="wr-rscene-path" d="M20 108 C 150 104, 210 70, 320 74 S 520 40, 600 26" />
      {reached && <path className="wr-rscene-walked" d="M20 108 C 150 104, 210 70, 320 74 S 520 40, 600 26" />}
    </svg>
    <svg className="wr-rscene-flag" viewBox="0 0 28 40" width="28" height="40" focusable="false">
      <circle cx="8" cy="34" r="5.5" className="wr-rscene-summit" />
      <path d="M8 34V4" stroke="#6B5238" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 4h16l-4 4.5 4 4.5H8z" fill="#C79A32" />
    </svg>
    {mascot && MASCOTS[mascot] && <img className={`wr-rscene-mascot wr-rscene-mascot--${mascot}`} src={MASCOTS[mascot]} alt="" />}
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
export function ResultXpRow({ children }) {
  return <section className="wr-result-row wr-rxp-row" aria-label="이번 결과 XP와 업적">
    <span className="wr-hud-label">XP 획득</span>
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
      {rows.map((row) => <li key={row.key} className={`wr-srow ${row.isMe ? "is-me" : ""} ${row.retired ? "is-retired" : ""} ${row.isWinner ? "is-winner" : ""}`} aria-current={row.isMe ? "true" : undefined}>
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
