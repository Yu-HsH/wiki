import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { introCore } from '../tutorial/modules/introCore.js';

test('HOME/우회 안내는 실제 조작 버튼의 표시 이름과 맞는다', async () => {
  const hero = await readFile(new URL('../components/wiki-race/ExpeditionHero.jsx', import.meta.url), 'utf8');
  const homeLabel = hero.match(/className="wr-veil-start-visual"[^>]*>([^<{]+)/)?.[1].trim();
  assert.ok(homeLabel, '실제 HOME CTA의 표시 이름을 찾는다');
  assert.ok(introCore.steps.find(step => step.id === 'H02').dialogue.includes(homeLabel));
  const practice = await readFile(new URL('../pages/TutorialPracticePage.jsx', import.meta.url), 'utf8');
  const retryLine = practice.split('\n').find(line => line.includes('data-tutorial-anchor="practice.retry"'));
  const retryLabel = retryLine?.match(/>(연습 전용 · [^<]+)<\/button>/)?.[1];
  assert.ok(retryLabel, '실제 연습 전용 우회 복구 버튼의 표시 이름을 찾는다');
  const primaryLabel = retryLabel.replace(/^연습 전용 · /, '');
  const dialogue = introCore.steps.find(step => step.id === 'S08').dialogue;
  assert.ok(dialogue.includes(primaryLabel));
  assert.ok(dialogue.includes('연습 전용'), '실제 게임의 무료 되돌리기처럼 안내하지 않는다');
});
