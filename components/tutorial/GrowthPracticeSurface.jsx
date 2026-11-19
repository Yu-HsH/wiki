import React from 'react';
import ProfileCard from '../ProfileCard.jsx';
import { growthSnapshot } from '../../tutorial/adapters/growthPracticeAdapter.js';
import { useTutorial } from './TutorialProvider.jsx';

export const GROWTH_ANCHORS = Object.freeze({ titleControls: 'growth.title-controls', card: 'growth.card', result: 'growth.result' });
// Default shell demonstrates the injection contract; it never imports B or a connected page.
export function GrowthPracticeFallback({ panel, card, reward, response, reveal, owned, onPreviewAction }) {
  if (panel === 'editor') return <div data-tutorial-anchor={GROWTH_ANCHORS.titleControls} className="wr-tutorial-growth-controls" role="group" aria-label="연습 칭호 선택">
    <p>칭호 선택 · 연습 카드에만 적용돼요.</p>
    <button type="button" disabled={Boolean(card.title)} onClick={() => onPreviewAction({ type: 'equip', slot: 'title', rewardId: reward.rewardId })}>{card.title ? '연습 칭호 선택됨' : `${reward.displayName} · 연습용 선택`}</button>
    <button type="button" disabled={!card.title} onClick={() => onPreviewAction({ type: 'unequip', slot: 'title' })}>연습용 해제</button>
  </div>;
  if (panel === 'album') return <article><h2>연습용 도감</h2><p>{response.achievements[0].name}</p><p>{response.achievements[0].condition}</p><small>실제 업적 조건이나 보상 지급이 없는 예시예요.</small></article>;
  if (panel === 'result') return <article data-tutorial-anchor={GROWTH_ANCHORS.result}><h2>{reveal.items[0].name}</h2><p>{reveal.items[0].condition}</p><p>{owned[0].displayName}</p></article>;
  return <p>공개 연습 견본을 골라 보세요. 실제 보상 ID나 개인 정보는 사용하지 않아요.</p>;
}
export default function GrowthPracticeSurface({ renderGrowth }) {
  const { session, step, act, token } = useTutorial();
  const snapshot = growthSnapshot(session.progress.practice);
  const captured = Object.fromEntries(Object.keys(step.next || {}).map(action => [action, token(action)]));
  const run = (action, previewAction) => captured[action] ? act({ ...captured[action], previewAction }) : false;
  const onPreviewAction = action => {
    const event = action?.type === 'equip' ? 'growth.title.equip' : action?.type === 'unequip' ? 'growth.title.unequip' : null;
    return event ? run(event, action) : false;
  };
  const props = { ...snapshot, panel: step.panel, anchors: GROWTH_ANCHORS, onPreviewAction };
  return <section className="wr-tutorial-practice wr-tutorial-growth" aria-label="성장 연습">
    <p className="wr-tutorial-notice" role="note">연습 화면 · 실제 업적·보유·XP·장착은 바뀌지 않아요.</p>
    <div className="wr-tutorial-growth-menu">
      <button type="button" data-tutorial-anchor="growth.album.open" onClick={() => run('growth.album.open', { type: 'open-album' })}>연습용 도감 열기</button>
      <button type="button" data-tutorial-anchor="growth.reward.inspect" onClick={() => run('growth.reward.inspect', { type: 'inspect-reward' })}>칭호 견본 열기</button>
      <button type="button" data-tutorial-anchor="growth.result.open" onClick={() => run('growth.result.open', { type: 'open-result' })}>연습 결과 견본 열기</button>
    </div>
    <div data-tutorial-anchor={GROWTH_ANCHORS.card} className="wr-tutorial-growth-card"><ProfileCard card={snapshot.card} size="md" density="full" /><p data-testid="growth-title">{snapshot.card.title?.displayName || '연습 칭호 없음'}</p></div>
    <div className="wr-tutorial-growth-slot">{renderGrowth ? renderGrowth(props) : <GrowthPracticeFallback {...props} />}</div>
  </section>;
}
