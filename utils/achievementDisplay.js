/**
 * 업적 표시 — 순수 표시 모델 (트랙 16c).
 *
 * 입력은 16a 읽기 RPC의 응답 그대로다 (`16-HANDOFF.md` §5). 여기서 하는 일은 묶고, 고르고,
 * 문구를 만드는 것뿐이다 — **해금·진행도·XP는 서버가 확정한 값을 쓴다.**
 *
 * ## 히든 (판정 5 · G5)
 *
 * 히든 업적의 이름·조건은 이 파일에 없다. 서버는 본인이 해금한 히든만 돌려주고 총개수는
 * 어떤 형태로도 주지 않는다 — 그래서 화면은 `발견 n / ??`다. 카드에 `sortOrder`도 없다.
 *
 * ## 문구
 *
 * 분류 표시명 6개는 근거 문서가 없어 **발명**이다 — `PACKET-CONTRACT-GAPS.md` §4.5.1에
 * 등재했고 디자인 확정 시 교체 대상이다. 히든 유형(재미·발견·도전)은 spec §9.2,
 * 보상 종류 이름은 `16-HANDOFF.md` §3 표의 이름을 채택했다.
 *
 * JSX를 두지 않는 이유는 `utils/xpProgress.js`와 같다: `npm test`에 JSX 로더가 없다.
 */

/** `achievement_definitions.category` → 섹션 이름. **발명** (GAPS §4.5.1). */
export const ACHIEVEMENT_CATEGORY_LABELS = Object.freeze({
  onboarding: "첫걸음",
  exploration: "탐험",
  daily: "오늘의 탐험",
  duel: "1:1 대결",
  group: "그룹 탐험",
  collection: "수집",
});

/** 섹션 순서 — DB CHECK의 배열 순서와 같다. */
export const ACHIEVEMENT_CATEGORY_ORDER = Object.freeze([
  "onboarding", "exploration", "daily", "duel", "group", "collection",
]);

/** `hidden_kind` → spec §9.2의 유형 이름. */
export const HIDDEN_KIND_LABELS = Object.freeze({
  fun: "재미",
  discovery: "발견",
  challenge: "도전",
});

/** `reward_catalog.kind` → `16-HANDOFF.md` §3 표의 종류 이름. */
export const REWARD_KIND_LABELS = Object.freeze({
  profile_icon: "프로필 아이콘",
  title: "칭호",
  badge: "배지",
  frame: "프레임",
  background: "배경",
  path_color: "경로 색상",
  path_effect: "경로 효과",
  finish_effect: "완주 효과",
  spectator_emoji: "관전 이모티콘",
});

/** 히든 카드의 `발견 n / ??` (판정 5). 분모는 서버가 주지 않으므로 항상 `??`다. */
export function formatHiddenDiscovered(discovered) {
  const value = toInteger(discovered) ?? 0;
  return `발견 ${value.toLocaleString("ko-KR")} / ??`;
}

/** 로비 알림 문구. **발명** (GAPS §4.5.1). 0이면 `null` — 알림을 그리지 않는다. */
export function formatNewAchievementNotice(unseenCount) {
  const value = toInteger(unseenCount) ?? 0;
  return value > 0 ? `새 업적 ${value.toLocaleString("ko-KR")}개` : null;
}

function toInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

const ROMAN = Object.freeze(["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]);

/** 단계 표기 — 단계가 하나뿐인 업적은 빈 문자열. 로마 숫자는 보상 표시명(16a)과 같은 표기. */
export function formatTierLabel(tier, tierCount) {
  const value = toInteger(tier);
  const count = toInteger(tierCount);
  if (value === null || count === null || count <= 1) return "";
  return ROMAN[value] ?? String(value);
}

/** `칭호 「승부사」` — 보상 이름은 서버 카탈로그의 `displayName`. */
export function formatRewardRef(reward) {
  if (!reward || typeof reward !== "object") return null;
  const name = typeof reward.displayName === "string" ? reward.displayName.trim() : "";
  if (!name) return null;
  const kind = REWARD_KIND_LABELS[reward.kind];
  return kind ? `${kind} 「${name}」` : `「${name}」`;
}

function rewardTexts(rewards) {
  return (Array.isArray(rewards) ? rewards : []).map(formatRewardRef).filter(Boolean);
}

/**
 * 업적 화면의 카드 1장 (일반·히든 공통).
 *
 * @param {object} card `private.achievement_card_v1`의 형태
 */
export function buildAchievementCard(card) {
  if (!card || typeof card !== "object" || !card.achievementId) return null;

  const tiers = Array.isArray(card.tiers) ? card.tiers : [];
  const tierCount = toInteger(card.tierCount) ?? tiers.length;
  const unlockedTier = toInteger(card.unlockedTier) ?? 0;
  const nextTier = tiers.find((tier) => !tier.unlocked) ?? null;
  const complete = tiers.length > 0 && !nextTier;
  const hidden = Boolean(card.hidden);

  // 진행 막대는 누적형(`counter`) 일반 업적의 다음 단계만. 히든은 진행도를 싣지 않고
  // (`current = null`), 한 번 달성형(`once`)의 `0 / 1`은 정보가 없다.
  let progress = null;
  const current = toInteger(card.current);
  const next = toInteger(card.nextThreshold);
  const counter = card.displayPolicy !== "once";
  if (!hidden && counter && nextTier && current !== null && next !== null && next > 0) {
    const clamped = Math.min(Math.max(current, 0), next);
    progress = {
      current: clamped,
      next,
      percent: Math.floor((clamped / next) * 100),
      label: `${clamped.toLocaleString("ko-KR")} / ${next.toLocaleString("ko-KR")}`,
    };
  }

  const newUnlockIds = tiers
    .filter((tier) => tier.unlocked && !tier.seen && tier.unlockId)
    .map((tier) => tier.unlockId);

  return {
    achievementId: card.achievementId,
    category: card.category ?? null,
    hidden,
    kindLabel: hidden ? HIDDEN_KIND_LABELS[card.hiddenKind] ?? null : null,
    name: card.name ?? "",
    condition: card.condition ?? "",
    tierCount,
    unlockedTier,
    tierLabel: formatTierLabel(complete ? tierCount : unlockedTier, tierCount),
    steps: tiers.map((tier) => ({
      tier: toInteger(tier.tier),
      unlocked: Boolean(tier.unlocked),
      label: formatTierLabel(tier.tier, tierCount),
    })),
    complete,
    progress,
    next: nextTier
      ? {
          tierLabel: formatTierLabel(nextTier.tier, tierCount),
          xp: toInteger(nextTier.xp) ?? 0,
          rewards: rewardTexts(nextTier.rewards),
        }
      : null,
    isNew: newUnlockIds.length > 0,
    newUnlockIds,
  };
}

/**
 * 업적 화면 전체. 일반 업적은 분류별 섹션으로, 히든은 카드 1장(`발견 n / ??`) + 해금한 카드들.
 *
 * @param {object} response `get_my_achievements_v1` 응답
 */
export function buildAchievementScreen(response) {
  if (!response || typeof response !== "object") return null;

  const cards = (Array.isArray(response.achievements) ? response.achievements : [])
    .map(buildAchievementCard)
    .filter(Boolean);

  const byCategory = new Map();
  for (const card of cards) {
    const key = ACHIEVEMENT_CATEGORY_LABELS[card.category] ? card.category : "collection";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(card);
  }
  const sections = ACHIEVEMENT_CATEGORY_ORDER
    .filter((category) => byCategory.has(category))
    .map((category) => ({
      category,
      label: ACHIEVEMENT_CATEGORY_LABELS[category],
      cards: byCategory.get(category),
    }));

  const hiddenBlock = response.hidden && typeof response.hidden === "object" ? response.hidden : {};
  const hiddenCards = (Array.isArray(hiddenBlock.achievements) ? hiddenBlock.achievements : [])
    .map(buildAchievementCard)
    .filter(Boolean);
  const discovered = toInteger(hiddenBlock.discovered) ?? hiddenCards.length;

  return {
    sections,
    hidden: {
      discovered,
      label: formatHiddenDiscovered(discovered),
      cards: hiddenCards,
      isNew: hiddenCards.some((card) => card.isNew),
    },
    unseenCount: toInteger(response.unseenCount) ?? 0,
  };
}

/**
 * 본인 프로필의 업적 요약 — 달성 수 + 최근 해금 3개.
 *
 * 달성 수 = 1단계 이상 연 일반 업적 + 발견한 히든. **분모를 두지 않는다** — 히든 총개수가
 * 드러나지 않게 (판정 5).
 */
export function buildAchievementSummary(response, { limit = 3 } = {}) {
  if (!response || typeof response !== "object") return null;
  const general = Array.isArray(response.achievements) ? response.achievements : [];
  const hiddenBlock = response.hidden && typeof response.hidden === "object" ? response.hidden : {};
  const hidden = Array.isArray(hiddenBlock.achievements) ? hiddenBlock.achievements : [];

  const achieved = general.filter((card) => (toInteger(card?.unlockedTier) ?? 0) > 0).length
    + (toInteger(hiddenBlock.discovered) ?? hidden.length);

  const unlocks = [];
  for (const card of [...general, ...hidden]) {
    if (!card?.achievementId) continue;
    const tiers = Array.isArray(card.tiers) ? card.tiers : [];
    for (const tier of tiers) {
      if (!tier.unlocked || !tier.unlockedAt) continue;
      unlocks.push({
        key: tier.unlockId ?? `${card.achievementId}:${tier.tier}`,
        achievementId: card.achievementId,
        hidden: Boolean(card.hidden),
        name: card.name ?? "",
        tierLabel: formatTierLabel(tier.tier, card.tierCount),
        unlockedAt: tier.unlockedAt,
        time: Date.parse(tier.unlockedAt) || 0,
      });
    }
  }
  unlocks.sort((a, b) => b.time - a.time || a.key.localeCompare(b.key));

  return {
    achieved,
    recent: unlocks.slice(0, limit).map(({ time, ...rest }) => rest),
  };
}

/**
 * 결과 화면 reveal — 서버 순서(히든 먼저) 그대로 업적 1개당 카드 1장.
 * 한 결과가 같은 업적의 여러 단계를 동시에 열면(16a 다중 단계) 카드 1장에 마지막 단계를 적는다.
 *
 * @param {object|null} response `get_result_achievements_v1` 응답
 */
export function buildResultReveal(response) {
  if (!response || typeof response !== "object") return null;
  const achievements = Array.isArray(response.achievements) ? response.achievements : [];

  const items = achievements
    .filter((entry) => entry?.achievementId)
    .map((entry) => {
      const tiers = Array.isArray(entry.tiers) ? entry.tiers : [];
      const top = tiers.reduce((best, tier) => (
        !best || (toInteger(tier.tier) ?? 0) > (toInteger(best.tier) ?? 0) ? tier : best
      ), null);
      const hidden = Boolean(entry.hidden);
      const xp = toInteger(entry.xpTotal)
        ?? tiers.reduce((sum, tier) => sum + (toInteger(tier?.xp?.amount) ?? 0), 0);
      return {
        achievementId: entry.achievementId,
        hidden,
        kindLabel: hidden ? HIDDEN_KIND_LABELS[entry.hiddenKind] ?? null : null,
        name: entry.name ?? "",
        condition: entry.condition ?? "",
        tierLabel: top ? formatTierLabel(top.tier, entry.tierCount) : "",
        xp,
        rewards: tiers.flatMap((tier) => rewardTexts(tier.rewards)),
        unlockIds: tiers.map((tier) => tier.unlockId).filter(Boolean),
      };
    });

  const xpTotal = toInteger(response.xpTotal)
    ?? items.reduce((sum, item) => sum + item.xp, 0);

  return {
    items,
    xpTotal,
    unlockIds: items.flatMap((item) => item.unlockIds),
  };
}

/** 로비 알림 닫기는 **세션 동안 숨김**이다 — seen은 남기지 않는다 `[사용자 결정, 2026-10-03]`. */
export const ACHIEVEMENT_NOTICE_SESSION_KEY = "wiki-race-achievement-notice-dismissed";

/**
 * 로비 알림을 보일지. 닫을 때의 미확인 수를 세션에 적어 두고, 그보다 늘었을 때만 다시 보인다 —
 * 같은 세션에서 새 해금이 생기면 다시 알린다.
 */
export function shouldShowAchievementNotice(unseenCount, dismissedCount) {
  const unseen = toInteger(unseenCount) ?? 0;
  if (unseen <= 0) return false;
  const dismissed = toInteger(dismissedCount);
  return dismissed === null || unseen > dismissed;
}
