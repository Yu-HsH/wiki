import { growthBasics } from './growthBasics.js';
import { guidedPracticeModules } from './guidedPractice.js';
import { createTutorialRegistry } from '../core/registry.js';
const PRACTICE = '/tutorial/practice/solo';
const step = (id, chapter, route, anchor, mode, actor, dialogue, next, scene = 'apple') => ({ id, chapter, route, anchor, mode, actor, dialogue, next, scene });

// The base lesson keeps its own checkpoints as new courses are registered.
export const introCore = {
  id: 'intro-core', version: 1, requiredForFirstRun: true, autoOffer: 'first-eligible-visit', migrations: {},
  steps: [
    step('W00', 'welcome', '/lobby', null, 'observe', 'idle', '안녕하세요! 탐험 안내자 키온이에요. 먼저 HOME의 구성을 살펴볼까요?'),
    step('H01', 'home', '/lobby', 'home.start', 'observe', 'idle', 'HOME에서 탐험을 시작하고, PLAY에서 모드를 고를 수 있어요.'),
    step('H02', 'home', '/lobby', 'home.start', 'focus-click', 'point', '밝게 표시된 게임 시작 버튼을 눌러 보세요.', { 'home.play': 'P01' }),
    step('P01', 'play', '/play', 'play.solo', 'observe', 'point', '싱글은 혼자서 문서 링크를 따라가는 모드예요. 아이템은 사용하지 않아요.'),
    step('P02', 'play', '/play', 'play.modes', 'observe', 'idle', '1:1은 방장이 목표를 정해요. 그룹은 후보를 고르고 READY로 준비해요.'),
    step('P03', 'play', '/play', 'play.solo', 'focus-click', 'serious', '싱글 탐험 시작을 눌러 보세요. 이번 연습은 전적이나 XP에 반영되지 않아요.', { 'play.solo': 'S01' }),
    step('S01', 'solo', PRACTICE, 'practice.start', 'focus-click', 'point', '사과에서 출발해 식물까지 가 볼까요? 연습 출발을 눌러 주세요.', { 'practice.start': 'S02' }),
    step('S02', 'solo', PRACTICE, 'solo.current', 'observe', 'idle', '여기에는 지금 보고 계신 문서 제목이 표시돼요.'),
    step('S03', 'solo', PRACTICE, 'solo.target', 'observe', 'point', '이번 목표는 식물이에요. 도착할 문서를 기억해 주세요.'),
    step('S04', 'solo', PRACTICE, 'solo.timer', 'observe', 'think', '시간과 이동 횟수도 함께 확인할 수 있어요. 연습 시계는 고정된 예시예요.'),
    step('S05', 'solo', PRACTICE, 'solo.link.fruit', 'focus-click', 'point', '파란 글씨는 이동할 수 있는 링크예요. 과일을 직접 눌러 보세요.', { 'practice.fruit': 'S06' }),
    step('S06', 'solo', PRACTICE, 'solo.current', 'observe', 'cheer', '과일 문서로 이동했어요. 이렇게 연결된 링크를 따라가면 돼요.', undefined, 'fruit'),
    step('S07', 'solo', PRACTICE, 'solo.choices', 'guided-choice', 'think', '목표로 이어지는 링크가 보이시나요? 식물이나 다른 길을 골라 보세요.', { 'practice.plant': 'S09', 'practice.detour': 'S08' }, 'fruit'),
    step('S08', 'solo', PRACTICE, 'practice.retry', 'focus-click', 'surprise', '조금 돌아가는 길이네요. 연습 전용 ‘직전 선택 다시 하기’로 돌아가 볼까요?', { 'practice.retry': 'S07' }, 'detour'),
    step('S09', 'solo', PRACTICE, 'practice.result', 'focus-click', 'cheer', '식물에 도착하셨어요! 연습 결과를 확인해 볼까요?', { 'practice.result': 'R01' }, 'plant'),
    step('R01', 'result', PRACTICE, 'solo.result', 'observe', 'serious', '걸린 시간과 지나온 경로를 확인할 수 있어요. 연습 기록은 저장되거나 지급되지 않아요.', undefined, 'result'),
    step('F01', 'final', PRACTICE, null, 'observe', 'wave', '기본 조작 연습을 마쳤어요. 필요하실 때 가이드에서 다시 시작하실 수 있어요.', undefined, 'result'),
  ],
};
export const tutorialRegistry = createTutorialRegistry([introCore, growthBasics, ...guidedPracticeModules]);
