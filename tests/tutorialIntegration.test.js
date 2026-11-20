import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedTutorial, practiceHref, isRealMatchPath, isPracticeNavigation } from '../utils/tutorialIntegration.js';

const modules = new Map([['intro-core', { id: 'intro-core' }], ['growth-basics', { id: 'growth-basics' }]]);
const registry = { get: id => modules.get(id) || null };

test('normal app navigation never acquires a practice capability from unrelated query values', () => {
  assert.equal(requestedTutorial('', registry), null);
  assert.equal(requestedTutorial('?mode=solo&lesson=growth-basics', registry), null);
  assert.equal(requestedTutorial('?practice=', registry), null);
});

test('an explicit unknown lesson remains in safe practice instead of mounting a real game', () => {
  assert.equal(requestedTutorial('?practice=missing', registry).id, 'intro-core');
  assert.equal(requestedTutorial('?practice=growth-basics', registry).id, 'growth-basics');
  assert.equal(requestedTutorial('?practice=__proto__', registry).id, 'intro-core');
});

test('practice route requests preserve only safe local training paths and encode module names', () => {
  for (const path of ['/lobby', '/play', '/tutorial/practice/solo', '/tutorial/practice/growth']) {
    const target = new URL(practiceHref(path, 'intro-core'), 'http://localhost');
    assert.equal(target.pathname, path);
    assert.equal(target.searchParams.get('practice'), 'intro-core');
    assert.equal(isPracticeNavigation(path), true);
  }
  for (const path of ['/game', '/profile', '/achievements', '/multiplayer', 'https://example.invalid', '//example.invalid', '/tutorial/practice/solo/../../game']) {
    assert.equal(new URL(practiceHref(path, 'intro-core'), 'http://localhost').pathname, '/lobby');
    assert.equal(isPracticeNavigation(path), false);
  }
  const encoded = new URL(practiceHref('/play', 'intro&real=1'), 'http://localhost');
  assert.equal(encoded.searchParams.get('practice'), 'intro&real=1');
  assert.equal(encoded.searchParams.has('real'), false);
});

test('real single, duel and group game routes are excluded without classifying waiting rooms as games', () => {
  for (const path of ['/game', '/multiplayer/game/room-1', '/multiplayer/group/game/room-1']) assert.equal(isRealMatchPath(path), true);
  for (const path of ['/lobby', '/play', '/tutorial/practice/solo', '/multiplayer/room/room-1', '/multiplayer/group/room/room-1']) assert.equal(isRealMatchPath(path), false);
});
