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

/** UI capability only, keyed by kind rather than reward IDs. No catalog or hidden inventory. */
export function rewardPresentation(reward, { ownedIds = null, acquired = false, equippedId = null } = {}) {
  const kind = reward?.kind;
  const owned = ownedIds instanceof Set ? ownedIds.has(reward?.rewardId) : null;
  const equipped = Boolean(reward?.rewardId && equippedId === reward.rewardId);
  const card = ["profile_icon", "title", "frame", "background"].includes(kind);
  const match = ["finish_effect", "path_color"].includes(kind);
  const equipSupported = card || match;
  let description = "획득한 보상은 수집 목록에서 확인할 수 있어요.";
  let support = "unsupported";
  if (kind === "title") { description = "장착하면 프로필 카드에 대표 칭호로 표시돼요."; support = "supported"; }
  if (kind === "profile_icon") { description = "획득 후 프로필에서 대표 아이콘으로 선택할 수 있어요."; support = reward.assetRef ? "supported" : "limited"; }
  if (kind === "frame") { description = "장착하면 프로필 아이콘과 랭킹의 내 아이콘을 둘러싸요."; support = "supported"; }
  if (kind === "background") { description = "프로필 카드 배경으로 사용할 수 있어요."; support = "limited"; }
  if (kind === "finish_effect") { description = "장착한 효과는 싱글을 완주하거나 1:1 대전에서 승리할 때 나타나요."; support = "limited"; }
  if (kind === "path_color") { description = "장착하면 싱글 결과에 표시되는 탐험 경로의 색이 바뀌어요."; support = "limited"; }
  return {
    support, equipSupported,
    acquisition: acquired ? `획득 확인 · ${owned === true ? "보유 확인" : "보유 목록 별도 확인"}`
      : owned === null ? "보유 여부 확인 불가" : owned ? "보유 확인" : "미보유 · 달성 후 수집",
    equipment: equipped ? `장착 중${reward?.retired ? " · 은퇴 보상 · 해제만 가능" : ""}`
      : reward?.retired ? "은퇴 보상 · 새 장착 불가"
      : equipSupported ? owned === true ? "보유 · 장착 가능" : acquired ? "장착 지원 · 보유 목록 별도 확인" : "획득 후 프로필에서 장착 가능" : "수집 전용 · 장착 미지원",
    description,
  };
}

/** Keep earned specimens separate from next-tier refs without changing the shared display contract. */
export function earnedRewardRefs(response) {
  const cards = [...(response?.achievements ?? []), ...(response?.hidden?.achievements ?? [])];
  return new Map(cards.filter(card => card?.achievementId).map(card => [
    card.achievementId,
    (card.tiers ?? []).filter(tier => tier.unlocked === true).flatMap(tier => tier.rewards ?? [])
      .filter(reward => reward?.rewardId && reward.displayName)
      .filter((reward, index, refs) => refs.findIndex(item => item.rewardId === reward.rewardId) === index)
      .map(reward => ({ ...reward })),
  ]));
}

/** Search only already-owned display names. Never fetch or infer a hidden/public catalogue. */
export function filterOwnedRewards(owned, { kind = "all", query = "", status = "all", equippedIds = new Set() } = {}) {
  const needle = String(query).trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
  return (Array.isArray(owned) ? owned : []).filter(reward => {
    if (!reward?.rewardId || reward.retired) return false;
    if (kind !== "all" && reward.kind !== kind) return false;
    if (needle && !String(reward.displayName ?? "").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(needle)) return false;
    const equipped = equippedIds instanceof Set && equippedIds.has(reward.rewardId);
    return status === "equipped" ? equipped : status === "available" ? !equipped : true;
  });
}
