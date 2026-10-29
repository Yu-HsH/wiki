// UI decoration only. Never map reward IDs/assetRefs or unrevealed hidden categories here.
const ROOT = "/assets/wiki-race/achievement-decoration";
const CATEGORY_ART = Object.freeze({
  onboarding: `${ROOT}/category-onboarding.svg`,
  exploration: `${ROOT}/category-exploration.svg`,
  daily: `${ROOT}/category-daily.svg`,
  duel: `${ROOT}/category-duel.svg`,
  group: `${ROOT}/category-group.svg`,
});

export function categoryDecoration(category) {
  return Object.hasOwn(CATEGORY_ART, category) ? CATEGORY_ART[category] : null;
}

// complete comes from buildAchievementCard's server-confirmed unlocked tiers.
export function completionDecoration(card) {
  return card?.complete === true && card.unlockedTier > 0
    ? `${ROOT}/discovery-complete.svg`
    : null;
}
