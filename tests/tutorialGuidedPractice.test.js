import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorialSession, transitionTutorial, tutorialActionToken } from '../tutorial/core/engine.js';
import { createProgressRepository, shouldOfferTutorial } from '../tutorial/core/progress.js';
import { getTutorialStep } from '../tutorial/core/registry.js';
import { GUIDED_PRACTICE_ROUTE, guidedPracticeModules } from '../tutorial/modules/guidedPractice.js';
import { introCore, tutorialRegistry } from '../tutorial/modules/introCore.js';
import { growthBasics } from '../tutorial/modules/growthBasics.js';
import { isPracticeNavigation, isRealMatchPath, postLoginTutorialPath, practiceHref, tutorialLoginPath } from '../utils/tutorialIntegration.js';

test('가이드 추가 훈련은 허용된 경로와 수동 시작만 사용한다', () => {
  assert.equal(introCore.steps.length, 17);
  assert.equal(growthBasics.steps.length, 8);
  assert.deepEqual(tutorialRegistry.list().map(module => module.id), [
    'intro-core', 'growth-basics', 'rank-route', 'duel-basics', 'group-basics', 'duel-items', 'group-items',
  ]);
  assert.equal(isPracticeNavigation(GUIDED_PRACTICE_ROUTE), true);
  assert.equal(isRealMatchPath(GUIDED_PRACTICE_ROUTE), false);
  const identity = { kind: 'guest', id: 'test' };
  for (const { id } of guidedPracticeModules) {
    const module = tutorialRegistry.get(id);
    assert.ok(module.steps.every(step => step.route === GUIDED_PRACTICE_ROUTE));
    assert.equal(shouldOfferTutorial({ module, identity, progress: createTutorialSession(module).progress, stableScreen: true }), false);
    const login = new URL(tutorialLoginPath(id), 'http://localhost');
    assert.equal(login.pathname, '/login');
    assert.equal(postLoginTutorialPath(login.search), practiceHref(GUIDED_PRACTICE_ROUTE, id));
  }
  for (const name of ['javascript:alert(1)', '/multiplayer/duel-v4/X', '/multiplayer/group-items/X', 'missing']) {
    const query = '?tutorial=' + encodeURIComponent(name);
    assert.equal(postLoginTutorialPath(query), '/lobby');
  }
});

for (const { id, label } of guidedPracticeModules) {
  test(label + '은 현재 조작 확인, 이어하기, 완료와 재실행을 별도로 저장한다', () => {
    const module = tutorialRegistry.get(id);
    const values = new Map();
    const repo = createProgressRepository({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
    let session = transitionTutorial(module, createTutorialSession(module), { type: 'start' });
    const visited = [];
    for (const expected of module.steps) {
      const step = getTutorialStep(module, session.progress);
      assert.equal(step.id, expected.id);
      assert.ok(step.scene.title);
      visited.push(step.id);
      if (step.mode === 'observe') {
        session = transitionTutorial(module, session, { type: 'next' });
        continue;
      }
      assert.equal(transitionTutorial(module, session, { type: 'next' }), session);
      assert.equal(repo.save('guest:test', module, session.progress).persisted, true);
      const restored = repo.load('guest:test', module);
      assert.equal(restored.status, 'paused');
      assert.equal(restored.stepId, step.id);
      assert.equal(repo.load('guest:other', module).status, 'unseen');
      assert.equal(repo.load('guest:test', introCore).status, 'unseen');
      assert.equal(repo.load('guest:test', growthBasics).status, 'unseen');
      session = transitionTutorial(module, createTutorialSession(module, restored), { type: 'resume' });
      const token = tutorialActionToken(module, session, step.action.id);
      assert.equal(transitionTutorial(module, session, { ...token, action: 'wrong-action', type: 'action' }), session);
      session = transitionTutorial(module, session, { ...token, type: 'action' });
      assert.equal(session.progress.stepId, step.next[step.action.id]);
      assert.equal(transitionTutorial(module, session, { ...token, type: 'action' }), session);
      assert.equal(Object.hasOwn(session.progress, 'practice'), false);
    }
    assert.equal(new Set(visited).size, module.steps.length);
    assert.equal(session.progress.status, 'completed');
    assert.equal(session.progress.completedVersion, module.version);
    assert.equal(transitionTutorial(module, session, { type: 'restart' }).progress.stepId, module.steps[0].id);
  });
}
