import { resolveRewardArt } from "./rewardArt.js";

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
  let description = "현재 효과 미지원 · 보유 기록만 표시합니다.";
  let support = "unsupported";
  if (kind === "title") { description = "프로필 카드에 표시하는 텍스트 칭호입니다. 이미지가 없어도 정상입니다."; support = "supported"; }
  if (kind === "profile_icon") { description = reward.assetRef ? "프로필 아이콘으로 표시됩니다. 이미지 실패 시 기존 기본 표시를 사용합니다." : "전용 이미지 미지원 · 기본 프로필 표시를 사용합니다."; support = reward.assetRef ? "supported" : "limited"; }
  if (kind === "frame") { description = "기존 프레임 단계 견본입니다. 같은 단계의 보상은 같은 모습이며 토큰이 없으면 기본 링으로 표시됩니다."; support = "supported"; }
  if (kind === "background") { description = "공통 배경 스타일만 적용됩니다. 보상별 전용 배경 아트는 현재 미지원입니다."; support = "limited"; }
  if (kind === "finish_effect") { description = "싱글 완주·1:1 승자 화면에 적용됩니다. 견본은 효과 단계 표시이며 그룹 적용은 미지원입니다."; support = "limited"; }
  if (kind === "path_color") { description = "싱글 결과 경로에 적용됩니다. 1:1·그룹 경로 적용은 미지원입니다."; support = "limited"; }
  if (kind === "path_effect") description = "현재 효과 미지원 · 경로 효과를 장착하거나 재생하는 화면이 없습니다.";
  if (kind === "spectator_emoji") description = "현재 효과 미지원 · 이 업적 보상을 관전 리액션으로 보내는 기능은 연결되지 않았습니다.";
  if (resolveRewardArt(kind, reward)) {
    const placement = kind === "finish_effect" ? "싱글 완주·1:1 승자 화면의 정적 아트 견본입니다. 그룹 적용은 미지원입니다." : "등록된 정적 아트 견본입니다.";
    description = placement + " 불러오지 못하면 기존 이미지나 기본 표시를 사용합니다.";
  }
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
