import React, { createContext, useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext.jsx';
import { ProfileCardReadContext } from '../hooks/useOwnProfileCard.js';
import { TutorialProvider, useTutorial } from './tutorial/TutorialProvider.jsx';
import TutorialOverlay from './tutorial/TutorialOverlay.jsx';
import TutorialLauncher from './tutorial/TutorialLauncher.jsx';
import AchievementRewardPreview, { ProfileRewardEditorPreview, AchievementAlbumPreview, ResultAchievementsPreview } from './AchievementRewardPreview.jsx';
import { tutorialRegistry } from '../tutorial/modules/introCore.js';
import { createProgressRepository, getBrowserGuestIdentity } from '../tutorial/core/progress.js';
import { requestedTutorial, practiceHref, isRealMatchPath, isPracticeNavigation } from '../utils/tutorialIntegration.js';

const AppTutorialContext = createContext(null);
const getStorage = () => { try { return globalThis.localStorage; } catch { return null; } };
export const useTutorialApp = () => useContext(AppTutorialContext);

export default function TutorialAppHost({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const repository = useMemo(() => createProgressRepository(getStorage()), []);
  const identity = useMemo(() => {
    if (!user) return null;
    return user.isGuest ? getBrowserGuestIdentity(getStorage())
      : { kind: 'member', id: user.id, firstLoginEligibility: 'unknown' };
  }, [user?.id, user?.isGuest]);
  const requested = requestedTutorial(location.search, tutorialRegistry);
  const realMatchActive = isRealMatchPath(location.pathname);
  const practice = Boolean(!loading && identity && requested && !realMatchActive);
  const start = (moduleId = 'intro-core') => {
    const module = tutorialRegistry.get(moduleId);
    if (!loading && identity && module && !realMatchActive) navigate(practiceHref(module.steps[0].route, module.id));
  };
  const normal = { practice: false, start, startGrowth: () => start('growth-basics') };
  if (!practice) return <AppTutorialContext.Provider value={normal}>{children}</AppTutorialContext.Provider>;
  return <TutorialProvider module={requested} identity={identity} repository={repository}
    route={location.pathname} onRequestRoute={path => navigate(practiceHref(path, requested.id))}
    stableScreen={!loading} realMatchActive={realMatchActive}>
    <PracticeHost module={requested} start={start} navigate={navigate}>{children}</PracticeHost>
  </TutorialProvider>;
}

function PracticeHost({ module, start, navigate, children }) {
  const tutorial = useTutorial();
  const [message, setMessage] = useState('');
  const exit = () => { tutorial.control('pause'); navigate('/lobby'); };
  const safeNavigate = path => {
    if (isPracticeNavigation(path)) navigate(practiceHref(path, module.id));
    else setMessage('연습에서는 실제 기록 화면이나 온라인 방으로 이동하지 않아요. 연습을 종료하면 이용할 수 있어요.');
  };
  const capability = {
    mode: 'practice', moduleId: module.id, step: tutorial.step,
    token: tutorial.token, act: tutorial.act, navigate: safeNavigate, exit,
  };
  const value = { practice: true, capability, start, startGrowth: () => start('growth-basics'), exit,
    expectedRoute: tutorial.step.route, recover: tutorial.requestStepRoute, renderGrowth: renderGrowthPreview };
  return <ProfileCardReadContext.Provider value={false}><AppTutorialContext.Provider value={value}>
    <aside className="wr-tutorial-app-controls" aria-label="키온 연습 안내" data-testid="tutorial-app-state"
      data-module={module.id} data-status={tutorial.session.progress.status}
      data-step={tutorial.step.id} data-scope={tutorial.identity.kind}>
      <p role="note">키온 연습 · 실제 게임·기록·XP·업적·장착에는 반영되지 않아요.</p>
      <TutorialLauncher />
      <div className="wr-tutorial-app-buttons">
        <button type="button" className="app-btn app-btn-ghost" onClick={exit}>연습 종료 · HOME으로</button>
        {module.id !== 'growth-basics' && tutorialRegistry.get('growth-basics')
          && <button type="button" className="app-btn app-btn-ghost" onClick={() => start('growth-basics')}>보상·프로필 연습</button>}
      </div>
      {message && <p role="status">{message}</p>}
    </aside>
    {children}
    <TutorialOverlay />
  </AppTutorialContext.Provider></ProfileCardReadContext.Provider>;
}

function renderGrowthPreview(props) {
  if (props.panel === 'editor') return <div className="wr65-field wr-profile"><ProfileRewardEditorPreview card={props.card} owned={props.owned}
    goals={props.goals} matchExpression={props.matchExpression} onPreviewAction={props.onPreviewAction}
    initialOpenSlot="title" previewAnchors={props.anchors} /></div>;
  if (props.panel === 'album') return <div className="wr65-field wr-achievements"><AchievementAlbumPreview response={props.response} ownedIds={props.ownedIds} /></div>;
  if (props.panel === 'result') return <section className="wr-result wr-result--single" data-tutorial-anchor={props.anchors.result}>
    <ResultAchievementsPreview reveal={props.reveal} tone="light" presentation="single" />
  </section>;
  return <div className="wr65-field wr-achievements"><AchievementRewardPreview reward={props.reward} ownedIds={props.ownedIds}
    acquired equippedId={props.card.title?.rewardId ?? null} /></div>;
}

export function TutorialBlockedRoute() {
  const tutorial = useTutorialApp();
  return <section className="app-center"><h1>연습 화면으로 돌아가세요</h1>
    <p>실제 기록과 장착을 보호하기 위해 연습 경로만 사용해요.</p>
    <button type="button" onClick={tutorial?.recover}>연습 이어서 보기</button>
    <button type="button" onClick={tutorial?.exit}>연습 종료 · HOME으로</button>
  </section>;
}
