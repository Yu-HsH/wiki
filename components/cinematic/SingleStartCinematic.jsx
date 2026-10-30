import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LEGACY_SINGLE_START_DURATION_MS, SINGLE_START_DURATION_MS, singleStartFrame, singleStartVisualTime, singleReverseLeafFrame } from '../../utils/singleStart.js';
import '../../css/wikiRaceSingleStart.css';
import useAudioCues from '../../hooks/useAudioCues.js';
import { SINGLE_AUDIO_CUES } from '../../utils/audioTimeline.js';
import { audioManager } from '../../services/audioManager.js';

const progress = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const ease = x => 1 - (1 - x) ** 3;
const compass = <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor"/><path d="M50 8 61 39 92 50 61 61 50 92 39 61 8 50 39 39Z" fill="none" stroke="currentColor"/><path d="M50 18 57 44 50 50 43 56Z" fill="currentColor"/></svg>;

function DocumentTitle({ title, onInspect }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const element = ref.current, sheet = element.parentElement;
    let active = true;
    const fit = () => {
      if (!active) return;
      element.style.fontSize = '';
      const style = getComputedStyle(element), box = getComputedStyle(sheet);
      let low = parseFloat(style.getPropertyValue('--title-min-size')) || 20, high = parseFloat(style.fontSize);
      const lineHeight = parseFloat(style.lineHeight) / high;
      const label = sheet.querySelector('.focus-label');
      const height = sheet.clientHeight - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom)
        - (label?.offsetHeight || 0) - (parseFloat(box.rowGap) || 0);
      const fits = size => {
        element.style.fontSize = `${size}px`;
        return element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= Math.min(height, size * lineHeight * 4) + 1;
      };
      const minimumFits = fits(low);
      for (let step = 0; step < 9; step++) {
        const size = (low + high) / 2;
        if (fits(size)) low = size; else high = size;
      }
      element.style.fontSize = `${Math.floor(low * 10) / 10}px`;
      element.dataset.truncated = String(!minimumFits);
    };
    fit(); const observer = new ResizeObserver(fit); observer.observe(sheet);
    document.fonts?.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [title]);
  return <button ref={ref} type="button" className="focus-title" title={title} aria-label={`${title} · 전체 제목 보기`} aria-haspopup="dialog" onClick={() => onInspect(title)}>{title}</button>;
}

// Round 7 geometry and timeline; this component never chooses or starts a course.
export default function SingleStartCinematic({ run, getServerNow, getElapsedMs, durationMs = SINGLE_START_DURATION_MS, recovered, onDue, onCancel }) {
  const root = useRef(null), due = useRef(false), callback = useRef(onDue);
  callback.current = onDue;
  const [skip, setSkip] = useState(Boolean(recovered));
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [inspectedTitle, setInspectedTitle] = useState(null);
  const soundFrame = useAudioCues(`single-start:${run.id}`, SINGLE_AUDIO_CUES);
  useEffect(() => { audioManager.prepare(['open', 'flip', 'reveal', 'tick', 'go']); }, [run.id]);
  useEffect(() => { if (skip || reduced) audioManager.stopEffects(); }, [skip, reduced]);
  const titleDialog = useRef(null);
  useEffect(() => {
    if (inspectedTitle && !titleDialog.current.open) titleDialog.current.showModal();
  }, [inspectedTitle]);
  const elapsed = () => getElapsedMs ? getElapsedMs() : getServerNow() - Date.parse(run.scene_starts_at);
  const [frame, setFrame] = useState(() => singleStartFrame(singleStartVisualTime(elapsed(), durationMs)));
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { setReduced(media.matches); setSkip(true); };
    const hidden = () => { if (document.hidden) setSkip(true); };
    const key = event => { if (event.key === 'Escape' && !titleDialog.current?.open) setSkip(true); };
    media.addEventListener('change', changed); document.addEventListener('visibilitychange', hidden); window.addEventListener('keydown', key);
    return () => { media.removeEventListener('change', changed); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    let raf;
    const draw = () => {
      const elapsedMs = getElapsedMs ? getElapsedMs() : getServerNow() - Date.parse(run.scene_starts_at);
      const ms = singleStartVisualTime(elapsedMs, durationMs), next = singleStartFrame(ms), t = Math.max(0, ms / 1000), quiet = skip || reduced;
      soundFrame(ms, !quiet);
      setFrame(previous => previous.phase === next.phase && previous.count === next.count ? previous : next);
      const element = root.current;
      if (!element) return;
      element.dataset.startMs = String(Math.floor(ms));
      element.dataset.elapsedMs = String(Math.floor(elapsedMs));
      const style = (selector, props) => { const node = element.querySelector(selector); if (node) Object.assign(node.style, props); };
      const entry = quiet ? 1 : ease(progress(t, 0, .42)), opening = quiet ? 1 : ease(progress(t, .1, .72));
      const camera = quiet ? 0 : Math.sin(progress(t, 2.9, 4) * Math.PI);
      style('.book', { opacity: entry, transform: quiet ? 'none' : `translateY(${(1-entry)*100-camera*9}px) rotateZ(${(1-entry)*-5-camera*.6}deg) rotateX(${camera*2}deg) scale(${.9+.1*entry+camera*.025})` });
      style('.book-cover', { transform: `rotateY(${168*opening}deg)`, visibility: opening >= .999 ? 'hidden' : 'visible' });
      style('.book-pages', { clipPath: quiet ? 'none' : `inset(0 0 0 ${50*(1-opening)}%)` });
      // A right-bound journal rewinds by returning the BACK pages first, then the
      // departure title sheet. Goal stays visible beneath until that last return.
      element.querySelectorAll('.rewind-leaf').forEach((node, index) => {
        const leaf = singleReverseLeafFrame(ms, index);
        Object.assign(node.style, {
          visibility: quiet || leaf.visible ? 'visible' : 'hidden',
          transform: quiet ? 'none' : `rotateY(${leaf.angle}deg)`,
          zIndex: String(leaf.zIndex),
        });
      });
      if (elapsedMs >= durationMs) {
        if (!due.current) {
          due.current = true;
          soundFrame.complete(quiet ? [] : ['go']);
          callback.current();
        }
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [run.id, run.scene_starts_at, getServerNow, getElapsedMs, durationMs, skip, reduced]);
  const page = (kind, position) => <section className={`focus-sheet ${kind}-sheet ${position}-sheet`} aria-label={kind === 'target' ? '목표 문서' : '출발 문서'}>
    <span className="focus-label">{kind === 'target' ? '도착할 문서' : '탐험의 첫 문서'}</span>
    <DocumentTitle title={kind === 'target' ? run.target_title_snapshot : run.start_title_snapshot} onInspect={setInspectedTitle} />
  </section>;
  return <div ref={root} tabIndex={-1} className="wr-page wr-single-start" data-testid="single-start-cinematic" data-phase={frame.phase} data-quiet={skip || reduced} data-duration-ms={durationMs} role="dialog" aria-modal="true" aria-label="싱글 탐험 출발 준비">
    <div className="book book-rewind"><div className="book-leaves"/><div className="book-pages"><div className="book-page left"/><div className="book-page right"/></div>
      <div className="journal-binding" aria-hidden="true"><i/><i/><i/></div><div className="rest-page">{page('target', 'opening')}</div>
      <div className="rewind-stack">{[0,1,2].map(index => <div key={index} className="rewind-leaf"><div className="leaf-front">{index === 0 ? page('start', 'arrival') : <div className="blank-page-lines"/>}</div><div className="leaf-back"/></div>)}</div>
      <div className="book-cover"><div className="cover-front">{compass}<h2>WIKI<br/>RACE</h2></div><div className="cover-back"/></div>
      <span className="inline-count" data-count={frame.count || ''} hidden={!frame.count} aria-live="polite">{frame.count}</span>
    </div>
    <div className="wr-single-start-actions"><span className="wr-single-start-sr" role="status">{skip ? '코스 준비 완료 · 잠시 후 출발합니다' : 'Escape 키로 연출을 생략할 수 있습니다'}</span>
      <button type="button" className="wr-single-start-skip" onClick={() => setSkip(true)} disabled={skip}>연출 건너뛰기</button><button type="button" className="wr-single-start-cancel" onClick={onCancel}>준비 취소</button></div>
    <dialog ref={titleDialog} className="wr-single-title-dialog" aria-label="문서 전체 제목" onClose={() => setInspectedTitle(null)}>
      <div className="wr-single-title-toolbar"><button type="button" onClick={() => titleDialog.current.close()}>닫기</button></div><p tabIndex={0}>{inspectedTitle}</p>
    </dialog>
  </div>;
}

// The random run remains the original immediately-active server run. Only its
// old 2600ms local countdown presentation changes; F5 still resumes directly.
export function LegacySingleStartCinematic({ run, startTitle, targetTitle, onComplete, onCancel }) {
  const started = useRef(performance.now());
  const getElapsedMs = useCallback(() => performance.now() - started.current, []);
  return <SingleStartCinematic run={{ ...run, start_title_snapshot: startTitle, target_title_snapshot: targetTitle }}
    durationMs={LEGACY_SINGLE_START_DURATION_MS} getElapsedMs={getElapsedMs} onDue={onComplete} onCancel={onCancel} />;
}
