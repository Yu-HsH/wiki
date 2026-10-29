import React, { useEffect, useRef, useState } from 'react';
import { selectDuelNotice } from '../utils/duelFeedback.js';

export function DuelFeedbackSymbol({ motif, reaction = false }) {
  return <svg viewBox={reaction ? '0 0 88 64' : '0 0 64 64'} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {motif === 'ink' ? <><path fill="currentColor" stroke="none" d="M32 11c5 0 6 8 10 10s13-3 16 4-7 10-8 14 5 11 0 15-11-4-16-4-12 7-17 2 2-11 0-15S5 33 8 26s12-3 16-5 2-10 8-10Z"/><circle cx="14" cy="12" r="3"/><circle cx="55" cy="51" r="3"/></>
      : motif === 'seal' ? <><path d="M24 20h-7a12 12 0 0 0 0 24h8m14-24h8a12 12 0 0 1 0 24h-8M20 32h24"/><rect x="23" y="24" width="18" height="25" rx="3" fill="var(--wr-paper)"/><path d="M27 24v-5a5 5 0 0 1 10 0v5M32 34v6"/></>
      : motif === 'shield' ? <><g className="wr-duel-shield-face"><path d="M32 7 52 15v16c0 13-12 21-20 26-8-5-20-13-20-26V15Z"/><path d="m22 31 7 7 14-17"/></g>{reaction && <><path className="wr-duel-projectile" d="M54 32h22m-15-7-8 7 8 7"/><path className="wr-duel-contact-spark" d="m49 26 4-6m-3 12h8m-9 6 4 6"/></>}</>
      : motif === 'reflect' ? <><path d="M44 15H28c-14 0-19 12-15 22s15 16 29 10M44 15l-9-9m9 9-9 9M23 29l9 7-9 7"/>{reaction && <><path className="wr-duel-projectile" d="M54 32h22m-15-7-8 7 8 7"/><path className="wr-duel-contact-spark" d="m44 26 4-6m-3 12h8m-9 6 4 6"/><path className="wr-duel-reflect-trail" d="M43 32h34m-8-7 8 7-8 7"/></>}</>
      : motif === 'rewind' ? <><path d="M18 12h33v38H18"/><path className="wr-duel-paper-leaf" fill="var(--wr-paper)" d="M18 12h27l6 8v30H18Zm27 0v8h6"/><path d="M39 33H9m9-9-9 9 9 9"/></>
      : motif === 'move' ? <><path d="M9 32h42M38 18l14 14-14 14M8 19h15M8 45h15"/><path d="m46 8 6 2 3 6m-9 40 6-2 3-6"/></>
      : motif === 'return' ? <><path d="M53 32H12m14-13L12 32l14 13M43 13h11v38H43"/></>
      : motif === 'compass' ? <><circle cx="32" cy="32" r="24"/><path d="m43 20-7 16-16 8 8-17Z"/><path d="M32 4v5m0 46v5M4 32h5m46 0h5"/></>
      : motif === 'index' ? <><path d="M17 16h37M17 32h37M17 48h37"/><circle cx="8" cy="16" r="2"/><circle cx="8" cy="32" r="2"/><circle cx="8" cy="48" r="2"/></>
      : motif === 'preview' ? <><path d="M4 32s10-17 28-17 28 17 28 17-10 17-28 17S4 32 4 32Z"/><circle cx="32" cy="32" r="9"/></>
      : motif === 'failure' ? <><circle cx="32" cy="32" r="22"/><path d="m24 24 16 16m0-16L24 40"/></>
      : <><circle cx="27" cy="27" r="16"/><path d="m39 39 16 16M20 22h13m-13 8h9"/></>}
  </svg>;
}

export default function DuelItemFeedback({ cues = [], notices = null, article = false }) {
  // Article reactions are ink paint only. Symbols and readable information share one lane.
  const visible = article ? cues.filter(c => c.kind === 'hit' && c.motif === 'ink')
    : [selectDuelNotice(notices ?? cues)].filter(Boolean);
  if (!visible.length) return null;
  return <div className={article ? 'wr-duel-impact-layer' : 'wr-duel-feedback-stack'} aria-hidden={article || undefined}>
    {visible.map(cue => <div key={cue.id} className={article ? 'wr-duel-impact' : 'wr-duel-feedback'}
      data-kind={cue.kind} data-motif={cue.motif} data-tone={cue.tone} data-event-id={cue.id}
      data-active={cues.some(c => c.id === cue.id) ? 'true' : undefined}
      role={article ? undefined : 'status'} aria-atomic={article ? undefined : 'true'}>
      {!article && <span className="wr-duel-feedback-symbol"><DuelFeedbackSymbol motif={cue.motif} reaction={cue.kind === 'block' || cue.kind === 'reflect'}/></span>}
      {!article && <span className="wr-duel-feedback-copy"><strong>{cue.headline || cue.label}</strong><small>{cue.detail || cue.name}</small></span>}
      <span className="wr-duel-feedback-rays" aria-hidden="true"/>
    </div>)}
  </div>;
}

export function DuelRecentEvents({ events = [] }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  useEffect(() => { if (!events.length) setOpen(false); }, [events.length]);
  return <div className="wr-duel-recent">
    <button ref={toggle} type="button" className="wr-duel-recent-toggle" disabled={!events.length}
      aria-expanded={open} aria-controls="wr-duel-recent-list" onClick={() => setOpen(v => !v)}>
      최근 <span>{events.length}</span>
    </button>
    {open && <section id="wr-duel-recent-list" className="wr-duel-recent-panel" aria-label="최근 아이템 사건"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); toggle.current?.focus(); } }}>
      <header><strong>최근 사건</strong><button type="button" aria-label="최근 사건 닫기" onClick={() => { setOpen(false); toggle.current?.focus(); }}>닫기</button></header>
      <ol>{[...events].reverse().map(cue => <li key={cue.id} data-event-id={cue.id} data-kind={cue.kind} data-tone={cue.tone}>
        <strong>{cue.headline || cue.label}</strong><small>{cue.detail || cue.name}</small>
      </li>)}</ol>
    </section>}
  </div>;
}

// Functional exploration panels start below the reserved lane, including mobile HUD wrapping.
// Measure layout only; this does not change item state or effect lifetimes.
export function DuelFeedbackLane({ children }) {
  const lane = useRef(null);
  useEffect(() => {
    const node = lane.current, frame = node?.closest('.wr-race');
    if (!frame) return;
    let raf = 0;
    const measure = () => frame.style.setProperty('--duel-feedback-bottom', `${Math.max(0, node.getBoundingClientRect().bottom)}px`);
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    for (const sibling of frame.children) if (sibling !== node) observer.observe(sibling);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    measure();
    return () => {
      cancelAnimationFrame(raf); observer.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      frame.style.removeProperty('--duel-feedback-bottom');
    };
  }, []);
  return <div ref={lane} className="wr-duel-feedback-lane" aria-label="아이템 결과">{children}</div>;
}
