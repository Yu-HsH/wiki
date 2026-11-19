// Generic teaching examples only. No live catalogue or hidden achievement definitions.
export const practiceTitle = Object.freeze({ rewardId: 'practice:title:trail', kind: 'title', displayName: '길을 살피는 연습가', assetRef: null });
export const practiceFrame = Object.freeze({ rewardId: 'practice:frame:paper', kind: 'frame', displayName: '연습 종이 테두리', assetRef: null });
export const growthRewards = Object.freeze([practiceTitle, practiceFrame]);
export function growthAlbumResponse() {
  return { achievements: [{ achievementId: 'practice:public-card', category: 'onboarding', hidden: false,
    name: '연습용 성장 카드', condition: '선택과 해제를 살펴보는 공개 예시예요.', description: '실제 업적이나 지급 조건이 아니에요.',
    tierCount: 1, unlockedTier: 1, displayPolicy: 'once', current: 1, nextThreshold: null,
    tiers: [{ tier: 1, unlocked: true, seen: true, unlockedAt: null, xp: 0, rewards: [{ ...practiceTitle }] }] }], hidden: { discovered: 0, achievements: [] } };
}
export function growthResultReveal() {
  return { items: [{ achievementId: 'practice:public-card', hidden: false, name: '연습 결과 견본', condition: '실제 달성이나 지급이 없는 예시예요.', tierLabel: '', xp: 0,
    rewards: ['연습 칭호 견본'], rewardRefs: [{ ...practiceTitle }] }] };
}
