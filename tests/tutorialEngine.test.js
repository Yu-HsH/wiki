import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorialRegistry, getTutorialContext, TUTORIAL_DIM_OPACITY } from '../tutorial/core/registry.js';
import { createTutorialSession, transitionTutorial, tutorialActionToken } from '../tutorial/core/engine.js';
import { introCore } from '../tutorial/modules/introCore.js';
import { createProgressRepository, freshProgress, restoreProgress, shouldOfferTutorial, tutorialScope, getBrowserGuestIdentity } from '../tutorial/core/progress.js';
import { createPracticeAdapter } from '../tutorial/adapters/practiceAdapter.js';
import { placeTutorial, overlaps, viewportBounds } from '../tutorial/core/placement.js';
import { readFile, readdir } from 'node:fs/promises';

const memory = () => { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) }; };
const activeAt = id => createTutorialSession(introCore, { ...freshProgress(introCore), status: 'active', stepId: id });
const apply = (session, type) => transitionTutorial(introCore, session, { type }, '2026-11-05T00:00:00Z');

test('행동 단계는 다음/다른 이벤트/오래된 중복 클릭으로 넘어가지 않는다', () => {
  const session = activeAt('H02');
  assert.equal(apply(session, 'next'), session);
  const token = tutorialActionToken(introCore, session, 'home.play');
  const next = transitionTutorial(introCore, session, { type: 'action', ...token });
  assert.equal(next.progress.stepId, 'P01');
  assert.equal(transitionTutorial(introCore, next, { type: 'action', ...token }), next);
  assert.equal(transitionTutorial(introCore, session, { type: 'action', ...token, revision: 55 }), session);
  assert.equal(transitionTutorial(introCore, session, { type: 'action', ...token, moduleId: 'other' }), session);
});
test('우회 선택과 재선택은 명시한 경로로만 진행한다', () => {
  let session = activeAt('S07');
  session = transitionTutorial(introCore, session, { type: 'action', ...tutorialActionToken(introCore, session, 'practice.detour') });
  assert.equal(session.progress.stepId, 'S08');
  session = transitionTutorial(introCore, session, { type: 'action', ...tutorialActionToken(introCore, session, 'practice.retry') });
  assert.equal(session.progress.stepId, 'S07');
  session = transitionTutorial(introCore, session, { type: 'action', ...tutorialActionToken(introCore, session, 'practice.plant') });
  assert.equal(session.progress.stepId, 'S09');
});
test('종료/이어하기/구간건너뛰기/재시작이 완료 버전과 독립적이다', () => {
  const original = activeAt('S05');
  const paused = apply(original, 'pause');
  assert.equal(paused.progress.status, 'paused');
  assert.equal(apply(paused, 'resume').progress.stepId, 'S05');
  assert.equal(apply(original, 'dismiss').progress.dismissedVersion, 1);
  const skipped = apply(original, 'skip-chapter');
  assert.equal(skipped.progress.stepId, 'R01');
  assert.deepEqual(skipped.progress.skippedChapters, ['solo']);
  const done = apply(activeAt('F01'), 'next');
  assert.equal(done.progress.completedVersion, 1);
  const restart = apply(done, 'restart');
  assert.equal(restart.progress.stepId, 'W00');
  assert.equal(restart.progress.completedVersion, 1);
});
test('저장 중이던 단계는 F5 후 paused로 복원하고 삭제된 단계는 migration map/시작으로 복원한다', () => {
  const repository = createProgressRepository(memory());
  repository.save('guest:test', introCore, activeAt('S07').progress);
  assert.equal(repository.load('guest:test', introCore).status, 'paused');
  const old = { ...freshProgress(introCore), stepId: 'retired', completedVersion: 1, version: 1 };
  assert.equal(restoreProgress({ ...introCore, version: 2, migrations: { retired: 'S05' } }, old).stepId, 'S05');
  assert.equal(restoreProgress({ ...introCore, version: 2 }, old).stepId, 'W00');
  assert.equal(restoreProgress({ ...introCore, version: 2 }, old).completedVersion, 1);
});
test('guest/member A/member B와 모듈별 진행은 분리하고 막힌 저장소는 메모리로 유지한다', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const repo = createProgressRepository(blocked);
  const a = tutorialScope({ kind: 'member', id: 'a' });
  repo.save(a, introCore, activeAt('P03').progress);
  assert.equal(repo.load(a, introCore).stepId, 'P03');
  assert.equal(repo.load(tutorialScope({ kind: 'member', id: 'b' }), introCore).status, 'unseen');
  assert.equal(repo.load(tutorialScope({ kind: 'guest', id: 'a' }), introCore).status, 'unseen');
  assert.equal(repo.load(a, { ...introCore, id: 'other' }).status, 'unseen');
  const storage = memory();
  assert.deepEqual(getBrowserGuestIdentity(storage, () => 'stable'), getBrowserGuestIdentity(storage, () => 'changed'));
  assert.throws(() => tutorialScope({ kind: 'member' }));
});
test('구형/훼손 저장값의 임의 개인정보·보상·스키마는 받아들이지 않는다', () => {
  const restored = restoreProgress(introCore, { ...freshProgress(introCore), profile: { email: 'sensitive' }, hiddenRewards: ['secret'], skippedChapters: ['solo', 'secret'] });
  assert.equal(restored.profile, undefined);
  assert.equal(restored.hiddenRewards, undefined);
  assert.deepEqual(restored.skippedChapters, ['solo']);
  assert.equal(restoreProgress(introCore, { schema: 99 }).status, 'unseen');
  const repo = createProgressRepository({ getItem: () => '{bad json' });
  assert.equal(repo.load('guest:test', introCore).status, 'unseen');
});
test('기존/unknown 회원을 신규로 추측하지 않고 인증안정/경기/guest연속성 게이트를 지킨다', () => {
  const options = { module: introCore, progress: freshProgress(introCore), stableScreen: true };
  assert.equal(shouldOfferTutorial({ ...options, identity: { kind: 'member' } }), false);
  assert.equal(shouldOfferTutorial({ ...options, identity: { kind: 'member', firstLoginEligibility: 'existing' } }), false);
  assert.equal(shouldOfferTutorial({ ...options, identity: { kind: 'member', firstLoginEligibility: 'new-confirmed' } }), true);
  const guest = { ...options, identity: { kind: 'guest' } };
  assert.equal(shouldOfferTutorial(guest), true);
  for (const override of [{ stableScreen: false }, { realMatchActive: true }, { guestContinuityCompleted: true }, { progress: { ...options.progress, status: 'paused' } }]) assert.equal(shouldOfferTutorial({ ...guest, ...override }), false);
});
test('core 완료는 버전 증가로 재강제하지 않고 업데이트 공지는 해당 모듈/버전만 제어한다', () => {
  const progress = { ...freshProgress(introCore), status: 'completed', completedVersion: 1 };
  const options = { module: { ...introCore, version: 2 }, progress, stableScreen: true, identity: { kind: 'guest' } };
  assert.equal(shouldOfferTutorial(options), false);
  const notice = { ...introCore, id: 'new-feature:demo', autoOffer: 'notice-only', version: 2 };
  assert.equal(shouldOfferTutorial({ ...options, module: notice }), true);
  assert.equal(shouldOfferTutorial({ ...options, module: notice, progress: { ...progress, dismissedVersion: 2 } }), false);
  assert.equal(transitionTutorial(notice, createTutorialSession(notice, progress), { type: 'offer' }).progress.offeredVersion, 2);
});
test('registry는 미지정 행동대상/잘못된 branch/중복 ID를 거부한다', () => {
  assert.throws(() => createTutorialRegistry([introCore, introCore]));
  assert.throws(() => createTutorialRegistry([{ ...introCore, steps: [{ ...introCore.steps[2], anchor: null }] }]));
  assert.throws(() => createTutorialRegistry([{ ...introCore, steps: [{ ...introCore.steps[0], next: { a: 'missing' } }] }]));
});
test('practice는 로컬 whitelist 이동만 허용하고 production command를 실행할 수 없다', () => {
  const adapter = createPracticeAdapter();
  assert.equal(adapter.move('식물').accepted, false);
  assert.equal(adapter.move('과일').snapshot.title, '과일');
  adapter.move('요리');
  assert.equal(adapter.retryChoice().title, '과일');
  const complete = adapter.move('식물').snapshot;
  assert.deepEqual(complete.path, ['사과', '과일', '식물']);
  assert.equal(complete.practice, true);
  assert.throws(() => adapter.executeProductionCommand('equip'));
  assert.throws(() => adapter.previewStyle('server-reward-id'));
});
test('viewport/keyboard 경계에서 말풍선은 타깃과 보호영역을 피하거나 차단을 명시한다', () => {
  for (const width of [320, 390, 430, 768, 1440]) {
    const viewport = viewportBounds({ offsetLeft: 0, offsetTop: 40, width, height: 500 }, {});
    const target = { left: 20, top: 80, width: width - 40, height: 44 };
    const placed = placeTutorial({ viewport, target, bubble: { width: 380, height: 240 } });
    assert.equal(placed.blocked, false);
    assert.equal(overlaps(placed, target), false);
    assert.ok(placed.left >= viewport.left && placed.left + placed.width <= viewport.left + viewport.width);
    assert.ok(placed.top >= viewport.top && placed.top + placed.height <= viewport.top + viewport.height);
  }
  assert.equal(placeTutorial({ viewport: { left: 0, top: 0, width: 320, height: 170 }, target: { left: 0, top: 20, width: 320, height: 130 }, bubble: { width: 300, height: 200 } }).blocked, true);
});
test('tutorial graph에 DB 서비스/hidden 카탈로그/static CSS/배속 설정이 들어오지 않는다', async () => {
  async function sources(path) {
    const result = [];
    for (const entry of await readdir(new URL(path, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) result.push(...await sources(`${path}/${entry.name}`));
      else if (/\.(jsx?|html)$/.test(entry.name)) result.push(await readFile(new URL(`${path}/${entry.name}`, import.meta.url), 'utf8'));
    }
    return result;
  }
  const source = (await sources('../tutorial')).concat(await sources('../components/tutorial'), await readFile(new URL('../pages/TutorialPracticePage.jsx', import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:supabaseClient|authContext|achievementService|profileRewardService|multiplayerService|singleGameService|dailyChallengeService|analyticsService)/);
  assert.doesNotMatch(source, /import\s+['"][^'"]+\.css['"]/);
  assert.doesNotMatch(source, /(?:hidden_count|hidden_total|hidden_achievement|reward_id|playbackRate)/i);
});

test('저장소 없음/읽기전용/쓰기차단을 성공으로 표시하지 않고 같은 탭 게스트 ID를 보존한다', () => {
  const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const first = getBrowserGuestIdentity(blocked, () => 'first-blocked-guest');
  const second = getBrowserGuestIdentity(blocked, () => 'second-blocked-guest');
  assert.equal(first.id, second.id);
  assert.equal(getBrowserGuestIdentity(undefined, () => 'should-not-replace').id, first.id);
  assert.notEqual(tutorialScope({ kind: 'member', id: first.id }), tutorialScope(first));
  for (const storage of [undefined, {}, { getItem: () => null }, blocked]) {
    const repo = createProgressRepository(storage);
    assert.equal(repo.save('guest:test', introCore, activeAt('S05').progress).persisted, false);
    assert.equal(repo.load('guest:test', introCore).stepId, 'S05');
  }
});

test('현재 위치/진행 표시는 실제 모듈 단계와 맞고 HOME overview는 첫 단계에만 적용한다', () => {
  const find = id => introCore.steps.find(step => step.id === id);
  assert.equal(getTutorialContext(introCore, find('W00')).overview, true);
  assert.equal(getTutorialContext(introCore, find('H02')).overview, false);
  assert.equal(getTutorialContext(introCore, find('W00')).location, 'HOME');
  assert.equal(getTutorialContext(introCore, find('P01')).location, 'PLAY');
  assert.equal(getTutorialContext(introCore, find('S01')).location, 'SOLO');
  assert.equal(getTutorialContext(introCore, find('R01')).location, '결과');
  assert.equal(getTutorialContext(introCore, find('W00')).stepNumber, 1);
  assert.equal(getTutorialContext(introCore, find('F01')).totalSteps, introCore.steps.length);
  const future = { ...introCore, id: 'new-feature:demo', label: '새 기능 연습' };
  assert.equal(getTutorialContext(future, future.steps[0]).location, '새 기능 연습');
  assert.ok(TUTORIAL_DIM_OPACITY >= 0.2 && TUTORIAL_DIM_OPACITY <= 0.35);
});
test('첫 HOME 개요는 가장자리로 배치하고 하단 주요 UI를 가리면 상단을 고른다', () => {
  const viewport = { left: 0, top: 0, width: 390, height: 900 };
  const bubble = { width: 366, height: 220 };
  const home = { left: 12, top: 150, width: 366, height: 400 };
  const bottom = placeTutorial({ viewport, target: null, bubble, overview: true, protectedRects: [home] });
  assert.equal(bottom.blocked, false);
  assert.equal(bottom.top, 668);
  assert.equal(overlaps(bottom, home), false);
  const footer = { left: 12, top: 650, width: 366, height: 230 };
  const top = placeTutorial({ viewport, target: null, bubble, overview: true, protectedRects: [footer] });
  assert.equal(top.blocked, false);
  assert.equal(top.top, 12);
  assert.equal(overlaps(top, footer), false);
});
test('overview에도 가림 검사를 유지하고 가상키보드 visualViewport 안에 머문다', () => {
  const viewport = { left: 0, top: 40, width: 390, height: 500 };
  const bubble = { width: 366, height: 220 };
  const placed = placeTutorial({ viewport, target: null, bubble, overview: true });
  assert.equal(placed.blocked, false);
  assert.ok(placed.top >= 40 && placed.top + placed.height <= 540);
  assert.equal(placeTutorial({ viewport, target: null, bubble, overview: true, protectedRects: [{ left: 0, top: 40, width: 390, height: 500 }] }).blocked, true);
});
