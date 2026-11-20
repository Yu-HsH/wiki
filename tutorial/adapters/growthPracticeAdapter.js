import { growthRewards, practiceTitle, growthAlbumResponse, growthResultReveal } from '../fixtures/growthRewards.js';

export function initialGrowthState() {
  return { equipment: { title: null, frame: null }, albumOpened: false, rewardInspected: false, resultOpened: false };
}
export function sanitizeGrowthState(input) {
  const source = input && typeof input === 'object' ? input : {};
  const slotId = slot => growthRewards.some(reward => reward.kind === slot && reward.rewardId === source.equipment?.[slot]) ? source.equipment[slot] : null;
  return { equipment: { title: slotId('title'), frame: slotId('frame') }, albumOpened: source.albumOpened === true,
    rewardInspected: source.rewardInspected === true, resultOpened: source.resultOpened === true };
}
// A checkpoint is a local lesson scene: revisiting selection/removal must remain actionable.
export function prepareGrowthStep(input, stepId) {
  const state = sanitizeGrowthState(input);
  const title = ['GR04', 'GR05'].includes(stepId) ? practiceTitle.rewardId : null;
  return { ...state, equipment: { ...state.equipment, title } };
}
export function applyGrowthAction(input, action) {
  const state = sanitizeGrowthState(input);
  if (!action || typeof action !== 'object') return { accepted: false, state };
  if (action.type === 'equip') {
    const reward = growthRewards.find(candidate => candidate.kind === action.slot && candidate.rewardId === action.rewardId);
    if (!reward || state.equipment[action.slot] === reward.rewardId) return { accepted: false, state };
    return { accepted: true, state: { ...state, equipment: { ...state.equipment, [action.slot]: reward.rewardId } } };
  }
  if (action.type === 'unequip') {
    if (!Object.hasOwn(state.equipment, action.slot) || !state.equipment[action.slot]) return { accepted: false, state };
    return { accepted: true, state: { ...state, equipment: { ...state.equipment, [action.slot]: null } } };
  }
  const key = { 'open-album': 'albumOpened', 'inspect-reward': 'rewardInspected', 'open-result': 'resultOpened' }[action.type];
  return key && !state[key] ? { accepted: true, state: { ...state, [key]: true } } : { accepted: false, state };
}
// The module validates the lesson event AND its local preview payload before moving steps.
export function reduceGrowthLesson(input, event) {
  const expected = {
    'growth.album.open': action => action?.type === 'open-album',
    'growth.reward.inspect': action => action?.type === 'inspect-reward',
    'growth.title.equip': action => action?.type === 'equip' && action.slot === 'title' && action.rewardId === practiceTitle.rewardId,
    'growth.title.unequip': action => action?.type === 'unequip' && action.slot === 'title',
    'growth.result.open': action => action?.type === 'open-result',
  }[event.action];
  if (!expected?.(event.previewAction)) return { accepted: false, state: sanitizeGrowthState(input) };
  const result = applyGrowthAction(input, event.previewAction);
  // Revisiting a completed local disclosure is harmless and still requires its actual button.
  if (!result.accepted && ['open-album', 'inspect-reward', 'open-result'].includes(event.previewAction.type)) return { accepted: true, state: result.state };
  return result;
}
export function growthSnapshot(input) {
  const state = sanitizeGrowthState(input);
  const at = slot => growthRewards.find(reward => reward.kind === slot && reward.rewardId === state.equipment[slot]) || null;
  return { practice: true, state, card: { nickname: '연습 탐험가', level: 1, icon: null, title: at('title'), frame: at('frame'), background: null },
    owned: growthRewards.map(reward => ({ ...reward })), ownedIds: new Set(growthRewards.map(reward => reward.rewardId)), goals: [],
    matchExpression: { finish_effect: null, path_color: null }, reward: { ...practiceTitle }, response: growthAlbumResponse(), reveal: growthResultReveal() };
}
// Accepts no server client/callback/account/transport. A new instance is optional convenience only.
export function createGrowthPracticeAdapter(input) {
  let state = sanitizeGrowthState(input);
  return Object.freeze({ snapshot: () => growthSnapshot(state),
    onPreviewAction(action) { const result = applyGrowthAction(state, action); if (result.accepted) state = result.state; return { ...result, snapshot: growthSnapshot(state) }; },
    executeProductionCommand() { throw new Error('Production commands are unavailable in growth practice'); },
  });
}
