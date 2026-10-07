import React, { useEffect, useRef, useState } from "react";
import WikiRaceShell from "./WikiRaceShell";

// Presentation-only lobby parts (Phase 2). Pages keep every room/service handler.

export function LobbyIcon({ name, size = 13 }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false", className: `wr-icon wr-icon-${name}` };
  if (name === "check") return <svg {...common}><path d="M3 8.5 6.5 12 13 4.5" /></svg>;
  if (name === "pending") return <svg {...common}><circle cx="8" cy="8" r="5.5" strokeDasharray="2.2 2.2" /></svg>;
  if (name === "flag") return <svg {...common}><path d="M4 14V2.5M4 2.5h8l-2 3 2 3H4" /></svg>;
  if (name === "timer") return <svg {...common}><circle cx="8" cy="9" r="5" /><path d="M8 9V6.5M6.5 1.8h3" /></svg>;
  if (name === "leave") return <svg {...common}><path d="M9.5 3H13v10H9.5M6.5 5 3.5 8l3 3M3.5 8H10" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>;
  return null;
}

export function TrailLine({ className = "" }) {
  return <svg className={`wr-lobby-trail ${className}`} preserveAspectRatio="none" viewBox="0 0 100 12" aria-hidden="true" focusable="false">
    <line x1="0" y1="6" x2="100" y2="6" stroke="var(--wr-paper)" strokeWidth="12" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <line x1="3" y1="6" x2="97" y2="6" stroke="var(--wr-trail)" strokeWidth="4" strokeDasharray="9 11" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function HostTag() {
  return <span className="wr-host-tag">방장</span>;
}

export function MeTag() {
  return <span className="wr-me-tag">나</span>;
}

/** READY / 준비 중 / 입장 완료 — text + icon, never color alone. */
export function StatusMark({ tone, children }) {
  return <span className={`wr-status wr-status--${tone}`}><LobbyIcon name={tone === "pending" ? "pending" : "check"} size={11} />{children}</span>;
}

export function CopyCodeButton({ code, compact = false }) {
  const [feedback, setFeedback] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(code ?? "");
      setFeedback("복사됨");
    } catch {
      setFeedback("복사하지 못했습니다");
    }
    timer.current = setTimeout(() => setFeedback(""), 1800);
  };
  return <span className={`wr-room-code ${compact ? "wr-room-code--compact" : ""}`}>
    <span className="wr-room-code-value">{code}</span>
    <button type="button" className="wr-link-btn" onClick={copy} aria-label={`방 코드 ${code} 복사`}>복사</button>
    <span className="wr-copy-feedback" role="status" aria-live="polite">{feedback}</span>
  </span>;
}

export function LobbyHeader({ kicker, title, children, onLeave, leaveLabel = "방 나가기" }) {
  return <div className="wr-lobby-head">
    <div className="wr-lobby-titles">
      <span className="wr-kicker">{kicker}</span>
      <h1 id="wr-lobby-title">{title}</h1>
    </div>
    {children && <div className="wr-lobby-head-meta">{children}</div>}
    <button type="button" className="wr-btn wr-btn--neutral wr-btn--sm" onClick={onLeave}><LobbyIcon name="leave" />{leaveLabel}</button>
  </div>;
}

/** onNavigate: the room's existing leave flow runs before any header navigation. */
export function LobbyShell({ user, onLogout, onNavigate, mode, children }) {
  return <WikiRaceShell user={user} level={null} onLogout={onLogout} onNavigate={onNavigate} view="lobby">
    <section className={`wr-room wr-room--${mode}`} aria-labelledby="wr-lobby-title">{children}</section>
  </WikiRaceShell>;
}

/** Loading / not-found / join failure — keeps the real message, styled lightly. */
export function LobbyStateScreen({ kicker, title, message, error = false, onLeave, leaveLabel }) {
  return <div className="wr-lobby-state">
    <span className="wr-kicker">{kicker}</span>
    <h1 id="wr-lobby-title">{title}</h1>
    {message && <p className={error ? "wr-lobby-error" : "wr-lobby-muted"} role={error ? "alert" : "status"}>{message}</p>}
    <button type="button" className="wr-btn wr-btn--neutral" onClick={onLeave}>{leaveLabel}</button>
  </div>;
}
