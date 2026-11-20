import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeTutorial, planTutorialScroll, viewportBounds } from '../../tutorial/core/placement.js';
import { getTutorialContext, TUTORIAL_DIM_OPACITY } from '../../tutorial/core/registry.js';
import { useTutorial } from './TutorialProvider.jsx';
import KionView from './KionView.jsx';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
const rectOf = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
const findAnchor = name => name ? [...document.querySelectorAll('[data-tutorial-anchor]')].find(element => element.getAttribute('data-tutorial-anchor') === name) || null : null;
const visible = element => element && !element.closest('[inert]') && element.getClientRects().length > 0;

export default function TutorialOverlay({ Kion = KionView, kionAssets }) {
  const tutorial = useTutorial();
  return tutorial.session.progress.status === 'active' && !tutorial.realMatchActive ? <ActiveOverlay {...tutorial} Kion={Kion} kionAssets={kionAssets} /> : null;
}
function ActiveOverlay({ module, session, step, routeReady, persisted, confirmExit, control, requestExit, continueTutorial, requestStepRoute, Kion, kionAssets }) {
  const id = useId();
  const context = getTutorialContext(module, step);
  const bubble = useRef(null);
  const portal = useRef(null);
  const returnFocus = useRef(document.activeElement);
  const lastStep = useRef(null);
  const lastPlacementScroll = useRef(null);
  const [geometry, setGeometry] = useState(null);
  const contentMounted = geometry !== null;
  const [retry, setRetry] = useState(0);
  useEffect(() => () => {
    // Wait until all isolation cleanups remove inert before restoring keyboard focus.
    queueMicrotask(() => {
      if (document.querySelector('.wr-tutorial-layer')) return;
      const destination = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector('[data-tutorial-return-focus]');
      destination?.focus({ preventScroll: true });
    });
  }, []);
  useLayoutEffect(() => {
    let frame;
    const measure = () => {
      const target = routeReady && !confirmExit ? findAnchor(step.anchor) : null;
      const viewport = viewportBounds(window.visualViewport, { width: innerWidth, height: innerHeight });
      const bounds = target ? rectOf(target) : null;
      const visibleTarget = bounds && bounds.width > 0 && bounds.height > 0 && bounds.top >= viewport.top && bounds.left >= viewport.left && bounds.top + bounds.height <= viewport.top + viewport.height && bounds.left + bounds.width <= viewport.left + viewport.width;
      const protectedRects = [...document.querySelectorAll('[data-tutorial-protect]')].filter(element => element !== target && !element.contains(target)).map(rectOf);
      const bubbleSize = { width: Math.min(380, viewport.width - 24), height: bubble.current?.offsetHeight || 230 };
      const placement = placeTutorial({ viewport, target: bounds, bubble: bubbleSize, protectedRects, overview: context.overview });
      const missing = Boolean(step.anchor && !target);
      const blocked = Boolean((bounds && !visibleTarget) || placement.blocked);
      setGeometry(previous => {
        const signature = JSON.stringify({ stepId: step.id, viewport, bounds, placement, missing, blocked });
        const next = { stepId: step.id, viewport, bounds, placement, missing, blocked, target, signature };
        return previous?.signature === signature && previous?.target === target ? previous : next;
      });
      // A single scroll on step/explicit retry; no endless tug of war with the user.
      if (target && !visibleTarget && lastStep.current !== `${session.revision}:${step.id}:${retry}`) {
        lastStep.current = `${session.revision}:${step.id}:${retry}`;
        target.scrollIntoView({ block: bounds.height > viewport.height / 2 ? 'start' : 'center', behavior: 'instant' });
      } else if (target && visibleTarget && placement.blocked && lastPlacementScroll.current !== `${session.revision}:${step.id}:${retry}`) {
        const scrollingElement = document.scrollingElement || document.documentElement;
        const plan = planTutorialScroll({ viewport, target: bounds, bubble: bubbleSize, protectedRects,
          scrollY: window.scrollY, maxScrollY: Math.max(0, scrollingElement.scrollHeight - document.documentElement.clientHeight) });
        if (plan) {
          lastPlacementScroll.current = `${session.revision}:${step.id}:${retry}`; // one repair per step/explicit retry
          window.scrollTo({ top: plan.scrollY, behavior: 'instant' });
          schedule(); // actual target/protected rects decide readiness after scrolling
        }
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    if (bubble.current) observer.observe(bubble.current);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tutorial-anchor', 'hidden', 'disabled'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  // Remeasure the real section before paint and reconnect its ResizeObserver
  // when it replaces the loading div. The signature guard keeps this bounded.
  }, [step, session.revision, routeReady, confirmExit, retry, context.overview, contentMounted]);
  const canTarget = routeReady && !confirmExit && geometry?.stepId === step.id && !geometry.missing && !geometry.blocked && step.mode !== 'observe';
  useLayoutEffect(() => {
    const target = canTarget ? findAnchor(step.anchor) : null;
    const changed = [];
    function isolate(parent) {
      for (const child of parent.children) {
        if (child === portal.current || child === target) continue;
        if (child.contains(portal.current) || (target && child.contains(target))) isolate(child);
        else { changed.push([child, child.hasAttribute('inert')]); child.setAttribute('inert', ''); }
      }
    }
    isolate(document.body);
    const focusables = () => [...(target ? [target, ...target.querySelectorAll(FOCUSABLE)] : []), ...bubble.current.querySelectorAll(FOCUSABLE)].filter((element, index, all) => element.matches(FOCUSABLE) && visible(element) && all.indexOf(element) === index);
    const preferred = target ? (focusables()[0] || bubble.current) : bubble.current;
    preferred?.focus({ preventScroll: true });
    const keydown = event => {
      if (event.repeat && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); confirmExit ? continueTutorial() : requestExit(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        const items = focusables();
        const index = items.indexOf(document.activeElement);
        items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus({ preventScroll: true });
      }
      if (event.key === ' ' && target && document.activeElement.tagName === 'A' && target.contains(document.activeElement)) { event.preventDefault(); document.activeElement.click(); }
    };
    const enforceFocus = event => { if (!bubble.current?.contains(event.target) && !(target && target.contains(event.target))) preferred?.focus({ preventScroll: true }); };
    const click = event => {
      if (portal.current?.contains(event.target) || target?.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', enforceFocus, true);
    document.addEventListener('click', click, true);
    return () => { document.removeEventListener('keydown', keydown, true); document.removeEventListener('focusin', enforceFocus, true); document.removeEventListener('click', click, true); changed.forEach(([element, inert]) => { if (!inert) element.removeAttribute('inert'); }); };
  }, [step.id, canTarget, geometry?.target, confirmExit, requestExit, continueTutorial]);
  if (!geometry) return createPortal(<div className="wr-tutorial-layer" ref={portal}><div className="wr-tutorial-bubble" ref={bubble} tabIndex={-1}>안내를 준비하고 있어요.</div></div>, document.body);
  const { viewport, bounds, placement, missing, blocked } = geometry;
  const targetVisible = geometry.stepId === step.id && bounds && !blocked && !missing && routeReady && !confirmExit;
  const controls = confirmExit ? <><h2 id={`${id}-title`}>튜토리얼을 여기서 마칠까요?</h2><p>가이드에서 언제든 다시 시작하실 수 있어요. 연습 기록은 실제 게임에 남지 않아요.</p><div className="wr-tutorial-actions"><button type="button" onClick={continueTutorial}>계속하기</button><button type="button" onClick={() => control('dismiss')}>여기서 종료</button><button type="button" onClick={() => control('pause')}>다음에 이어서</button></div></> : <>
    <div className="wr-tutorial-context" aria-label={`현재 위치 ${context.location}`}><ol aria-label="연습 흐름">{context.trail.map((label, index) => <li key={label} aria-current={index === context.phase ? 'step' : undefined}>{label}</li>)}</ol><span>{context.stepNumber}/{context.totalSteps} 단계</span></div>
    <div className="wr-tutorial-heading"><Kion actor={step.actor} assets={kionAssets} /><div><small>키온과 {module.label || '첫 탐험'} · {module.version}판</small><h2 id={`${id}-title`}>{module.heading || (step.chapter === 'solo' ? '링크를 따라가요' : '첫 번째 길을 열어요')}</h2></div><button type="button" className="wr-tutorial-close" aria-label="튜토리얼 종료" onClick={requestExit}>×</button></div>
    <p id={`${id}-copy`} aria-live="polite" aria-atomic="true">{step.dialogue}</p>
    {!routeReady ? <p role="status">다른 화면에 있어요. <button type="button" onClick={requestStepRoute}>연습 화면으로 돌아가기</button></p> : missing ? <p role="status">안내할 대상을 아직 찾지 못했어요. <button type="button" onClick={() => setRetry(value => value + 1)}>다시 찾기</button></p> : blocked ? <p role="status">대상을 가리지 않도록 화면을 넓히거나 스크롤해 주세요. <button type="button" onClick={() => setRetry(value => value + 1)}>위치 다시 맞추기</button></p> : null}
    {!persisted && <small role="status">이 탭에서만 진행을 기억해요.</small>}
    <div className="wr-tutorial-progress" aria-label={`${module.steps.indexOf(step) + 1} / ${module.steps.length} 단계`}><span style={{ width: `${(module.steps.indexOf(step) + 1) / module.steps.length * 100}%` }} /></div>
    <div className="wr-tutorial-actions"><button type="button" disabled={module.steps.indexOf(step) === 0} onClick={() => control('previous')}>이전</button>{step.mode === 'observe' && routeReady && <button type="button" onClick={() => control('next')}>{module.steps.indexOf(step) === module.steps.length - 1 ? '훈련 마치기' : '다음'}</button>}<button type="button" onClick={() => control('skip-chapter')}>이 훈련 건너뛰기</button></div>
    <div className="wr-tutorial-secondary"><button type="button" onClick={() => control('restart')}>처음부터 다시</button><button type="button" onClick={() => control('pause')}>다음에 이어서</button></div>
  </>;
  return createPortal(<div className="wr-tutorial-layer" ref={portal} data-step={step.id} data-context={context.location} data-overview={context.overview ? 'true' : undefined} data-ready={geometry.stepId === step.id && routeReady && (step.mode === 'observe' || (!missing && !blocked)) ? 'true' : 'false'} onClickCapture={event => { if (event.detail > 1) { event.preventDefault(); event.stopPropagation(); } }}>
    <svg className="wr-tutorial-dim" aria-hidden="true" width="100%" height="100%"><defs><mask id={`${id}-mask`}><rect width="100%" height="100%" fill="white" />{targetVisible && <rect x={bounds.left - 8} y={bounds.top - 8} width={bounds.width + 16} height={bounds.height + 16} rx="12" fill="black" />}</mask></defs><rect width="100%" height="100%" fill="#071b14" opacity={TUTORIAL_DIM_OPACITY} mask={`url(#${id}-mask)`} /></svg>
    {targetVisible && <><div className="wr-tutorial-target" style={{ left: bounds.left - 8, top: bounds.top - 8, width: bounds.width + 16, height: bounds.height + 16 }} aria-hidden="true" /><span className="wr-tutorial-arrow" aria-hidden="true" style={{ left: Math.max(viewport.left + 6, bounds.left - 24), top: bounds.top + bounds.height / 2 - 14 }}>➜</span></>}
    <section className={`wr-tutorial-bubble${context.overview ? ' is-overview' : ''}`} ref={bubble} role="dialog" aria-modal={confirmExit ? 'true' : undefined} aria-labelledby={`${id}-title`} aria-describedby={!confirmExit ? `${id}-copy` : undefined} tabIndex={-1} style={{ left: placement.left, top: placement.top, width: placement.width, maxHeight: viewport.height - 24 }}>{controls}</section>
  </div>, document.body);
}
