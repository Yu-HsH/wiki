import React from "react";
import { formatDuration } from "../../../services/wikiService";

// Phase 3 RACE presentation parts. No data access, no game logic — pages own every
// handler, subscription and server-authoritative value and pass display state in.

export function RaceIcon({ name, size = 14 }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false", className: `wr-icon wr-icon-${name}` };
  switch (name) {
    case "current": return <svg {...p}><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" /></svg>;
    case "flag": return <svg {...p}><path d="M4 14V2.5M4 2.5h8l-2 3 2 3H4" /></svg>;
    case "timer": return <svg {...p}><circle cx="8" cy="9" r="5" /><path d="M8 9V6.5M6.5 1.8h3" /></svg>;
    case "link": return <svg {...p}><path d="M6.5 9.5 9.5 6.5M7 4.5l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L5.5 8" /></svg>;
    case "spectator": return <svg {...p}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></svg>;
    case "route": return <svg {...p}><circle cx="3.5" cy="12.5" r="1.5" /><circle cx="12.5" cy="3.5" r="1.5" /><path d="M5 12.5h4a2.5 2.5 0 0 0 0-5H7a2.5 2.5 0 0 1 0-5h4" /></svg>;
    case "group": return <svg {...p}><circle cx="5.5" cy="5.5" r="2" /><circle cx="11" cy="6" r="1.7" /><path d="M1.8 13c.4-2.2 2-3.4 3.7-3.4S8.8 10.8 9.2 13M9.5 10.2c1.8-.4 3.7.5 4.3 2.8" /></svg>;
    case "check": return <svg {...p}><path d="M3 8.5 6.5 12 13 4.5" /></svg>;
    default: return null;
  }
}

export function Pill({ tone = "neutral", filled = false, wrap = false, icon = null, children, ...rest }) {
  return <span className={`wr-pill wr-pill--${tone} ${filled ? "is-filled" : ""} ${wrap ? "is-wrap" : ""}`} {...rest}>
    {icon && <RaceIcon name={icon} size={11} />}{children}
  </span>;
}

export function ConnectionDot({ ok = true, halo = false, label }) {
  return <span className={`wr-conn ${ok ? "" : "is-bad"} ${halo ? "has-halo" : ""}`}>
    <span className="wr-conn-dot" aria-hidden="true" />{label}
  </span>;
}

/** `inert` — Phase 4: a RESULT dialog sits above the race; the race underneath is not focusable. */
export function RaceFrame({ mode, strip = false, tabs = false, label, inert = false, children }) {
  return <div className={`wr-page wr-race wr-race--${mode} ${strip ? "has-strip" : ""} ${tabs ? "has-tabs" : ""}`} inert={inert ? "" : undefined} aria-hidden={inert ? "true" : undefined}>
    <div className="wr-race-shell" role="region" aria-label={label}>{children}</div>
  </div>;
}

export function RaceHud({ label = "경기 정보", children }) {
  return <header className="wr-race-hud" aria-label={label}>{children}</header>;
}

export function HudBrand({ mode, sub }) {
  return <div className="wr-hud-cell wr-hud-brand">
    <span className="wr-brand-mark" aria-hidden="true">WR</span>
    <span className="wr-mode-tag">{mode}</span>
    {sub && <span className="wr-hud-label">{sub}</span>}
  </div>;
}

export function HudDoc({ kind = "current", label, title, valueClassName = "" }) {
  return <div className={`wr-hud-cell wr-hud-doc wr-hud-doc--${kind}`}>
    <span className="wr-hud-label">{label}</span>
    <span className={`wr-hud-doc-value ${valueClassName}`} title={title || undefined}>
      <RaceIcon name={kind === "goal" ? "flag" : "current"} size={kind === "goal" ? 12 : 14} />
      <span>{title || "…"}</span>
    </span>
  </div>;
}

export function HudArrow() {
  return <div className="wr-hud-cell wr-hud-arrow" aria-hidden="true">
    <svg width="18" height="8" viewBox="0 0 18 8"><path d="M0 4h12" stroke="#AEBBA5" strokeWidth="1.5" /><path d="M12 0l6 4-6 4z" fill="#C79A32" /></svg>
  </div>;
}

export function HudStat({ label, value, className = "" }) {
  return <div className={`wr-hud-cell wr-hud-stat ${className}`}>
    <span className="wr-hud-label">{label}</span>
    <span className="wr-hud-stat-value">{value}</span>
  </div>;
}

/** Timer value is not a live region (no per-second announcements). */
export function HudTimer({ label, seconds, state = "normal" }) {
  return <div className={`wr-hud-cell wr-hud-stat wr-hud-timer ${state === "deadline" ? "is-deadline" : ""} ${state === "ended" ? "is-ended" : ""}`}>
    <span className="wr-hud-label">{state === "deadline" && <RaceIcon name="flag" size={11} />}{label}</span>
    <span className="wr-hud-stat-value" role="timer" aria-label={`${label} ${formatDuration(seconds)}`}>{formatDuration(seconds)}</span>
  </div>;
}

export function HudStatus({ children }) {
  return <div className="wr-hud-cell wr-hud-status" role="status">{children}</div>;
}

export function HudExit({ label = "나가기", onClick, disabled = false }) {
  return <div className="wr-hud-cell wr-hud-exit">
    <button type="button" className="wr-race-btn" onClick={onClick} disabled={disabled}>{label}</button>
  </div>;
}

/** 내 경로 — the player's own server/recorded path. Never another player's active route. */
export function RouteRail({ path = [], currentTitle, title = "내 경로", foot }) {
  const steps = path.filter(Boolean);
  return <section className="wr-route" aria-label={title}>
    <div className="wr-route-head"><h2>{title}</h2><small>{steps.length}문서</small></div>
    <ol className="wr-route-list">
      {steps.map((step, index) => {
        const isCurrent = index === steps.length - 1 && (!currentTitle || step === currentTitle);
        return <li key={`${step}-${index}`} className={`wr-route-step ${isCurrent ? "is-current" : ""} ${index === 0 ? "is-start" : ""}`} aria-current={isCurrent ? "step" : undefined}>
          <span>{step}</span><small>{index === 0 ? "시작" : isCurrent ? `${index} · 현재` : index}</small>
        </li>;
      })}
    </ol>
    {foot && <p className="wr-route-foot">{foot}</p>}
  </section>;
}

export function RouteChain({ path = [], reachedTarget = false, max = 5 }) {
  const steps = path.filter(Boolean);
  if (steps.length === 0) return <span className="wr-chain-more">경로 없음</span>;
  const shown = steps.length <= max ? steps : [steps[0], steps[1], null, steps[steps.length - 2], steps[steps.length - 1]];
  return <span className="wr-chain">
    {shown.map((step, index) => <React.Fragment key={index}>
      {index > 0 && <span className="wr-chain-sep" aria-hidden="true" />}
      {step === null
        ? <span className="wr-chain-more">… {steps.length - 4}개</span>
        : <span className={`wr-chain-chip ${reachedTarget && index === shown.length - 1 ? "is-target" : ""}`} title={step}>{step}</span>}
    </React.Fragment>)}
  </span>;
}

/** Neutral holding / waiting panel inside the race shell (no mock content). */
export function RaceHold({ kicker, title, children, actions }) {
  return <div className="wr-race-hold" role="status">
    {kicker && <span className="wr-hud-label">{kicker}</span>}
    <h1>{title}</h1>
    {children}
    {actions && <div className="wr-race-hold-actions">{actions}</div>}
  </div>;
}
