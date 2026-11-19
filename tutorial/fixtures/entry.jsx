import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlayPage from '../../pages/PlayPage.jsx';
import { GrowthPracticeFallback } from '../../components/tutorial/GrowthPracticeSurface.jsx';
import TutorialPracticePage from '../../pages/TutorialPracticePage.jsx';
import { TutorialProvider, useTutorial } from '../../components/tutorial/TutorialProvider.jsx';
import TutorialOverlay from '../../components/tutorial/TutorialOverlay.jsx';
import TutorialLauncher from '../../components/tutorial/TutorialLauncher.jsx';
import { tutorialRegistry } from '../modules/introCore.js';
import { createProgressRepository, getBrowserGuestIdentity } from '../core/progress.js';

function Fixture() {
  const params = new URLSearchParams(location.search);
  const [account, setAccount] = useState(params.get('identity') || 'guest');
  const [moduleId, setModuleId] = useState(params.get('module') || 'intro-core');
  const [match, setMatch] = useState(false);
  const identity = useMemo(() => account === 'guest' ? getBrowserGuestIdentity(localStorage) : { kind: 'member', id: account, firstLoginEligibility: account === 'new-member' ? 'new-confirmed' : 'unknown' }, [account]);
  const repository = useMemo(() => createProgressRepository(localStorage), []);
  const [route, setRoute] = useState(location.hash.slice(1) || '/lobby');
  const navigate = useCallback(path => { history.pushState(null, '', `${location.pathname}${location.search}#${path}`); setRoute(path); window.scrollTo(0, 0); }, []);
  React.useEffect(() => { const sync = () => setRoute(location.hash.slice(1) || '/lobby'); window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync); return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); }; }, []);
  React.useEffect(() => { const signal = event => setMatch(Boolean(event.detail)); window.addEventListener('tutorial-fixture:match', signal); return () => window.removeEventListener('tutorial-fixture:match', signal); }, []);
  return <TutorialProvider module={tutorialRegistry.get(moduleId) || tutorialRegistry.get('intro-core')} identity={identity} repository={repository} route={route} onRequestRoute={navigate} realMatchActive={match} stableScreen={params.get('auto') === '1'}>
    <main className="a0-fixture"><header><strong>A0 엔진 검증 fixture · 제품 HOME/PLAY 연결 전</strong><p>실제 PLAY·WikiViewer·HUD·결과 조각을 로컬 데이터로 확인해요. HOME 버튼은 연결 계약을 검증하는 fixture예요.</p><label>검증 계정 <select value={account} onChange={event => setAccount(event.target.value)}><option value="guest">게스트</option><option value="member-a">기존 회원 A (판별 unknown)</option><option value="member-b">기존 회원 B (판별 unknown)</option><option value="new-member">신규 신호 fixture</option></select></label> <label>연습 모듈 <select aria-label="연습 모듈" value={moduleId} onChange={event => setModuleId(event.target.value)}><option value="intro-core">기본 조작</option><option value="growth-basics">성장 연습</option></select></label> <label><input type="checkbox" checked={match} onChange={event => setMatch(event.target.checked)} /> 실제 경기 진행 신호 fixture</label></header>
    <TutorialLauncher /><FixtureSurface route={route} /><DebugState />
    </main><TutorialOverlay />
  </TutorialProvider>;
}
function FixtureSurface({ route }) {
  const { step, token, act } = useTutorial();
  const play = useRef(null);
  const homeToken = token('home.play');
  const soloToken = token('play.solo');
  // Fixture binding ONLY. Product must add stable source anchors, never these CSS selectors.
  useLayoutEffect(() => {
    if (!play.current) return;
    play.current.querySelector('.wr-mode-action')?.setAttribute('data-tutorial-anchor', 'play.solo');
    play.current.querySelector('.wr-play-heading')?.setAttribute('data-tutorial-anchor', 'play.modes');
  }, [route]);
  if (route === '/play') return <div ref={play}><PlayPage isGuest onSingle={() => act(soloToken)} onMultiplayer={() => { throw new Error('Online commands must not run'); }} /></div>;
  if (route === '/tutorial/practice/growth') return <TutorialPracticePage renderGrowth={new URLSearchParams(location.search).get('slot') === '1' ? props => <div data-testid="growth-injected-slot"><p>주입 슬롯 · B 형식 로컬 callback</p><GrowthPracticeFallback {...props} /></div> : undefined} />;
  if (route === '/tutorial/practice/solo') return <TutorialPracticePage />;
  return <section className="a0-home-anchor"><h1>HOME 앵커 연결 계약</h1><p>실제 제품 HOME은 아직 연결하지 않았어요.</p><button type="button" data-tutorial-anchor="home.start" data-tutorial-protect onClick={() => act(homeToken)}>탐험 시작 · HOME 연결점 fixture</button><p>현재 안내: {step.id}</p></section>;
}
function DebugState() {
  const { session, route, identity, module, scope } = useTutorial();
  return <output className="a0-debug" data-testid="tutorial-state" data-status={session.progress.status} data-step={session.progress.stepId} data-route={route} data-identity={identity.kind} data-module={module.id} data-scope={scope}>{session.progress.status} · {session.progress.stepId} · {route}</output>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
