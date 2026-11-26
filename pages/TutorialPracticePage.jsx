import React, { useMemo } from 'react';
import GuidedPracticeSurface from '../components/tutorial/GuidedPracticeSurface.jsx';
import { GUIDED_PRACTICE_ROUTE } from '../tutorial/modules/guidedPractice.js';
import GrowthPracticeSurface from '../components/tutorial/GrowthPracticeSurface.jsx';
import WikiViewer from '../components/WikiViewer.jsx';
import { RaceHud, HudBrand, HudDoc, HudStat, HudTimer, RouteChain } from '../components/wiki-race/race/RaceParts.jsx';
import { ResultStats, ResultCourse, ResultRoute } from '../components/wiki-race/result/ResultParts.jsx';
import { createPracticeAdapter } from '../tutorial/adapters/practiceAdapter.js';
import { useTutorial } from '../components/tutorial/TutorialProvider.jsx';

export default function TutorialPracticePage({ renderGrowth } = {}) {
  const { module } = useTutorial();
  if (module.id === 'growth-basics') return <GrowthPracticeSurface renderGrowth={renderGrowth} />;
  if (module.steps[0].route === GUIDED_PRACTICE_ROUTE) return <GuidedPracticeSurface />;
  return <SoloPracticePage />;
}

function SoloPracticePage() {
  const { step, act, token } = useTutorial();
  const adapter = useMemo(() => createPracticeAdapter(), []);
  const sample = adapter.restoreScene(step.scene);
  const captured = Object.fromEntries(Object.keys(step.next || {}).map(action => [action, token(action)]));
  const dispatch = action => act(captured[action]);
  const onLinkClick = title => {
    const action = { '과일': 'practice.fruit', '식물': 'practice.plant', '요리': 'practice.detour' }[title];
    if (captured[action] && dispatch(action)) adapter.move(title);
  };
  return <section className="wr-tutorial-practice" aria-label="싱글 연습">
    <p className="wr-tutorial-notice" role="note">연습 화면 · 실제 기록·XP·업적·아이템·장착에 반영되지 않아요.</p>
    {step.id === 'S01' ? <button type="button" data-tutorial-anchor="practice.start" onClick={() => dispatch('practice.start')}>연습 출발</button> : step.scene === 'result' ? <section data-tutorial-anchor="solo.result" className="wr-tutorial-result"><h1>연습 결과</h1><ResultStats items={[{ label: '예시 시간', value: '00:12' }, { label: '이동', value: '2회' }]} /><ResultCourse start="사과" target="식물" /><ResultRoute title="연습 경로" path={['사과', '과일', '식물']} reachedTarget /><p>실제 기록 저장과 보상 지급이 없어요.</p></section> : <>
      <RaceHud label="연습 정보"><HudBrand mode="연습" /><span data-tutorial-anchor="solo.current"><HudDoc label="현재" title={sample.title} /></span><span data-tutorial-anchor="solo.target" data-tutorial-protect><HudDoc kind="goal" label="목표" title="식물" /></span><span data-tutorial-anchor="solo.timer" data-tutorial-protect><HudTimer label="예시 시간" seconds={12} /><HudStat label="이동" value={`${sample.clickCount}회`} /></span></RaceHud>
      <RouteChain path={sample.path} />
      <WikiViewer target={{ title: '식물' }} currentTitle={sample.title} currentDocumentHtml={sample.html} links={(sample.html.match(/data-wiki-title="([^"]+)"/g) || []).map(value => ({ title: value.slice(17, -1) }))} isLoading={false} onLinkClick={onLinkClick} showTargetBrief={false} />
      {step.scene === 'detour' && <button type="button" data-tutorial-anchor="practice.retry" onClick={() => { if (dispatch('practice.retry')) adapter.retryChoice(); }}>연습 전용 · 직전 선택 다시 하기</button>}
      {step.scene === 'plant' && <button type="button" data-tutorial-anchor="practice.result" onClick={() => dispatch('practice.result')}>연습 결과 보기</button>}
    </>}
  </section>;
}
