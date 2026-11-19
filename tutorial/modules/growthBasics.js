import { initialGrowthState, sanitizeGrowthState, reduceGrowthLesson, prepareGrowthStep } from '../adapters/growthPracticeAdapter.js';
const route = '/tutorial/practice/growth';
const step = (id, anchor, mode, actor, dialogue, panel, next) => ({ id, chapter: 'growth', route, anchor, mode, actor, dialogue, panel, next });
export const growthBasics = {
  id: 'growth-basics', version: 1, label: '성장 연습', heading: '보상을 살펴봐요', completionMessage: '성장 연습을 마쳤어요. 실제 업적과 장착 기록은 바뀌지 않았어요.', requiredForFirstRun: false, autoOffer: 'manual', dependsOn: ['intro-core'],
  initialPracticeState: initialGrowthState, sanitizePracticeState: sanitizeGrowthState, reducePractice: reduceGrowthLesson, preparePracticeForStep: prepareGrowthStep,
  steps: [
    step('GR00', null, 'observe', 'serious', '도감과 꾸미기 보상을 살펴볼까요? 여기서는 실제 업적이나 장착 기록이 바뀌지 않아요.', 'overview'),
    step('GR01', 'growth.album.open', 'focus-click', 'point', '연습용 도감 열기를 눌러 공개 예시를 살펴보세요.', 'overview', { 'growth.album.open': 'GR02' }),
    step('GR02', 'growth.reward.inspect', 'focus-click', 'think', '도감에서는 보상 견본을 볼 수 있어요. 칭호 견본을 열어 보세요.', 'album', { 'growth.reward.inspect': 'GR03' }),
    step('GR03', 'growth.title-controls', 'guided-choice', 'point', '칭호 선택에서 연습 칭호를 골라 보세요. 실제 인벤토리에는 영향을 주지 않아요.', 'editor', { 'growth.title.equip': 'GR04' }),
    step('GR04', 'growth.card', 'observe', 'cheer', '연습 카드에 칭호가 보이네요. 선택한 모습을 미리 확인할 수 있어요.', 'card'),
    step('GR05', 'growth.title-controls', 'guided-choice', 'point', '이번에는 연습용 해제를 눌러 보세요. 실제 프로필은 그대로예요.', 'editor', { 'growth.title.unequip': 'GR06' }),
    step('GR06', 'growth.result.open', 'focus-click', 'idle', '결과 화면에서도 보상 견본을 확인할 수 있어요. 연습 결과 견본을 열어 보세요.', 'card', { 'growth.result.open': 'GR07' }),
    step('GR07', 'growth.result', 'observe', 'wave', '성장 연습을 마쳤어요. 실제 보유와 장착은 게임과 프로필에서 서버가 확인해요.', 'result'),
  ],
};
