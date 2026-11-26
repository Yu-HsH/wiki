import test from 'node:test';
import assert from 'node:assert/strict';
import { introCore, tutorialRegistry } from '../tutorial/modules/introCore.js';
import { growthBasics } from '../tutorial/modules/growthBasics.js';
import { freshProgress, createProgressRepository, restoreProgress, shouldOfferTutorial } from '../tutorial/core/progress.js';
import { createTutorialSession, transitionTutorial, tutorialActionToken } from '../tutorial/core/engine.js';
import { createGrowthPracticeAdapter, growthSnapshot, sanitizeGrowthState } from '../tutorial/adapters/growthPracticeAdapter.js';
import { practiceTitle, growthAlbumResponse, growthResultReveal } from '../tutorial/fixtures/growthRewards.js';
import { buildAchievementScreen } from '../utils/achievementDisplay.js';

const memory = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; };
const active = stepId => createTutorialSession(growthBasics, { ...freshProgress(growthBasics), status: 'active', stepId });
const advance = (session, action, previewAction) => transitionTutorial(growthBasics, session, { ...tutorialActionToken(growthBasics, session, action), type: 'action', previewAction });
const equip = { type: 'equip', slot: 'title', rewardId: practiceTitle.rewardId };

test('성장은 독립 module/version이며 기존 intro 완료 저장을 다시 시작시키지 않는다', () => {
  assert.equal(tutorialRegistry.get('intro-core').id, introCore.id);
  assert.equal(tutorialRegistry.get('growth-basics').id, growthBasics.id);
  const repo = createProgressRepository(memory());
  repo.save('guest:test', introCore, { ...freshProgress(introCore), status: 'completed', completedVersion: 1 });
  repo.save('guest:test', growthBasics, active('GR03').progress);
  assert.equal(repo.load('guest:test', introCore).completedVersion, 1);
  assert.equal(repo.load('guest:test', introCore).status, 'completed');
  const updated = { ...growthBasics, version: 2 };
  assert.equal(repo.load('guest:test', updated).version, 2);
  assert.equal(repo.load('guest:test', introCore).completedVersion, 1);
  assert.equal(shouldOfferTutorial({ module: growthBasics, progress: freshProgress(growthBasics), identity: { kind: 'guest' }, stableScreen: true }), false);
});
test('올바른 현재 step token과 B 형식 payload가 모두 있어야 칭호 선택이 진행된다', () => {
  const session = active('GR03');
  for (const action of [undefined, { ...equip, rewardId: 'untrusted-real-id' }, { ...equip, slot: 'frame' }, { type: 'unequip', slot: 'title' }]) {
    assert.equal(advance(session, 'growth.title.equip', action), session);
  }
  assert.equal(transitionTutorial(growthBasics, session, { type: 'next' }), session);
  const next = advance(session, 'growth.title.equip', equip);
  assert.equal(next.progress.stepId, 'GR04');
  assert.equal(growthSnapshot(next.progress.practice).card.title.rewardId, practiceTitle.rewardId);
  assert.equal(advance(next, 'growth.title.equip', equip), next);
});
test('성장 payload도 module/version/revision이 다른 과거 callback은 거부한다', () => {
  const session = active('GR03');
  const token = tutorialActionToken(growthBasics, session, 'growth.title.equip');
  for (const patch of [{ moduleId: introCore.id }, { version: 99 }, { revision: 99 }]) assert.equal(transitionTutorial(growthBasics, session, { ...token, ...patch, type: 'action', previewAction: equip }), session);
});
test('F5·pause·해제·종료·재시작에서 로컬 칭호와 실제 계정별 진행이 섞이지 않는다', () => {
  const repo = createProgressRepository(memory());
  let session = advance(active('GR03'), 'growth.title.equip', equip);
  session = transitionTutorial(growthBasics, session, { type: 'next' });
  assert.equal(session.progress.stepId, 'GR05');
  repo.save('member:A', growthBasics, session.progress);
  const recovered = repo.load('member:A', growthBasics);
  assert.equal(recovered.status, 'paused');
  assert.equal(growthSnapshot(recovered.practice).card.title.rewardId, practiceTitle.rewardId);
  assert.equal(repo.load('member:B', growthBasics).status, 'unseen');
  session = transitionTutorial(growthBasics, createTutorialSession(growthBasics, recovered), { type: 'resume' });
  session = advance(session, 'growth.title.unequip', { type: 'unequip', slot: 'title' });
  assert.equal(session.progress.stepId, 'GR06');
  assert.equal(growthSnapshot(session.progress.practice).card.title, null);
  session = transitionTutorial(growthBasics, session, { type: 'dismiss' });
  assert.equal(session.progress.dismissedVersion, 1);
  session = transitionTutorial(growthBasics, session, { type: 'restart' });
  assert.equal(session.progress.stepId, 'GR00');
  assert.deepEqual(session.progress.practice.equipment, { title: null, frame: null });
});
test('이전 단계·구간 건너뛰기에서도 선택/해제 가능한 checkpoint를 만든다', () => {
  let session = advance(active('GR03'), 'growth.title.equip', equip);
  session = transitionTutorial(growthBasics, session, { type: 'previous' });
  assert.equal(session.progress.stepId, 'GR03');
  assert.equal(growthSnapshot(session.progress.practice).card.title, null);
  assert.notEqual(advance(session, 'growth.title.equip', equip), session);
  const skipped = transitionTutorial(growthBasics, session, { type: 'skip-chapter' });
  assert.equal(skipped.progress.status, 'completed');
  assert.equal(skipped.progress.completedVersion, 1);
});
test('과거 schema1 intro는 그대로 복원하고 성장 저장은 허용 필드만 수용한다', () => {
  const old = { schema: 1, moduleId: 'intro-core', version: 1, status: 'completed', stepId: 'F01', completedVersion: 1 };
  assert.equal(restoreProgress(introCore, old).completedVersion, 1);
  assert.equal(Object.hasOwn(restoreProgress(introCore, old), 'practice'), false);
  const restored = restoreProgress(growthBasics, { ...freshProgress(growthBasics), status: 'active', stepId: 'GR03', practice: { equipment: { title: 'private-id', frame: 'private-frame' }, profile: { email: 'private' }, unknownCatalogue: ['secret'] } });
  assert.equal(restored.status, 'paused');
  assert.deepEqual(restored.practice.equipment, { title: null, frame: null });
  assert.equal(restored.practice.profile, undefined);
  assert.equal(restored.practice.unknownCatalogue, undefined);
});
test('로컬 adapter는 generic RewardRef만 선택하고 서비스 command를 받지 않는다', () => {
  const adapter = createGrowthPracticeAdapter();
  assert.equal(adapter.onPreviewAction(equip).accepted, true);
  assert.equal(adapter.snapshot().card.title.rewardId, practiceTitle.rewardId);
  assert.equal(adapter.onPreviewAction({ ...equip, rewardId: 'real-reward' }).accepted, false);
  assert.equal(adapter.onPreviewAction({ type: 'unequip', slot: 'title' }).accepted, true);
  assert.equal(adapter.snapshot().card.title, null);
  assert.throws(() => adapter.executeProductionCommand('equip'));
  assert.deepEqual(Object.keys(sanitizeGrowthState({ hidden: 'private' })).sort(), ['albumOpened', 'equipment', 'resultOpened', 'rewardInspected']);
});
test('도감/결과 데이터는 B named preview가 읽을 공개 generic 형태이며 실제 지급을 주장하지 않는다', () => {
  const response = growthAlbumResponse();
  const screen = buildAchievementScreen(response);
  assert.ok(screen.sections.some(section => section.cards.some(card => card.name === '연습용 성장 카드')));
  assert.equal(response.achievements[0].tiers[0].xp, 0);
  assert.ok(growthResultReveal().items[0].rewardRefs.every(reward => reward.rewardId.startsWith('practice:')));
  assert.ok(growthSnapshot().owned.every(reward => reward.rewardId.startsWith('practice:')));
});
