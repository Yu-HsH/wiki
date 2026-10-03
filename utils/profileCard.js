/**
 * 프로필 카드 렌더 규칙 — 순수 로직 (C5 계약).
 *
 * `docs/contracts/C5-PROFILE-CARD.md` §2(데이터 형태) · §3.1(이미지 우선순위) ·
 * §3.2(에셋 실패) · §3.3(이름 fallback) · §3.4(접근성) · §3.5(배지 0/1/3)를 구현한다.
 *
 * JSX를 두지 않는 이유: `npm test`가 `node --test`이고 JSX 로더가 없다.
 * 규칙을 여기에 모아 두면 테스트가 동작으로 검증할 수 있고,
 * `ProfileCard.jsx`·`ProfileAvatar.jsx`는 이 모듈을 그리기만 한다.
 */

/** 아바타 렌더 단계 — C5 §3.1의 4단계. */
export const AVATAR_STAGE = Object.freeze({
  ICON: "icon",       // 1. icon.assetRef — 시스템 제공 프로필 아이콘
  LEGACY: "legacy",   // 2. legacyImageUrl — profile_image_url 또는 참가 시점 스냅샷
  INITIAL: "initial", // 3. 이니셜 placeholder
  DEFAULT: "default", // 4. 시스템 기본 이미지 (닉네임도 없을 때)
});

/** 이름 fallback — C5 §3.3. 두 값 외에는 없다. */
export const NAME_FALLBACK = Object.freeze({
  PARTICIPANT: "participant", // 그룹·1:1 참가자 행 → "참가자"
  EXPLORER: "explorer",       // 그 외 → "탐험가"
});

const NAME_FALLBACK_TEXT = Object.freeze({
  [NAME_FALLBACK.PARTICIPANT]: "참가자",
  [NAME_FALLBACK.EXPLORER]: "탐험가",
});

/**
 * 아바타 크기 토큰 — 지점별 현재 픽셀 값을 그대로 옮겼다.
 * 시각 회귀를 만들지 않기 위해 값을 바꾸지 않았다.
 * `21-SCREEN-MATRIX.md` §11의 터치 대상 44px 기준은 xs·sm이 아직 만족하지 않는다.
 */
export const AVATAR_SIZES = Object.freeze({
  xs: 32, // GroupRoomPage 참가자 행
  sm: 34, // RankingPage 행
  md: 44, // GroupRoomPage 내 설정 카드
  lg: 60, // UserProfileModal 헤더
  xl: 80, // ProfilePage 헤더
});

/** 표시 밀도 — C5 §4의 지점별 "표시 요소" 열과 1:1로 대응한다. */
export const DENSITY = Object.freeze({
  FULL: "full",       // 프로필 · 공개 프로필
  COMPACT: "compact", // 랭킹
  MINIMAL: "minimal", // 그룹·1:1 참가자 행
});

// 배지는 폐지됐다 (16d, C5 §0 2026-10-03) — 카드 요소는 아이콘 · 칭호 · 프레임 · 배경.
const DENSITY_ELEMENTS = Object.freeze({
  [DENSITY.FULL]: Object.freeze(["level", "title", "frame", "background"]),
  [DENSITY.COMPACT]: Object.freeze(["level", "title"]),
  [DENSITY.MINIMAL]: Object.freeze(["title"]),
});

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * C5 §2의 카드 형태로 정규화한다. 없는 값은 전부 null이다.
 * 배지는 폐지돼 카드에 없다 — 서버가 `badges: []`를 싣더라도 읽지 않는다 (C5 §0, 16d).
 */
export function buildProfileCard(input = {}) {
  return {
    userId: input.userId ?? null,
    nickname: normalizeText(input.nickname),
    level: input.level ?? null,
    title: input.title ?? null,
    icon: input.icon ?? null,
    frame: input.frame ?? null,
    background: input.background ?? null,
    legacyImageUrl: normalizeText(input.legacyImageUrl),
    source: input.source === "snapshot" ? "snapshot" : "live",
  };
}

/** 이름 fallback — C5 §3.3. `-` · `Unknown` · `U` · `?` · `이름 없음` · `나`는 전부 폐기됐다. */
export function resolveDisplayName(card, nameFallback = NAME_FALLBACK.EXPLORER) {
  const nickname = normalizeText(card?.nickname);
  if (nickname) return nickname;
  return NAME_FALLBACK_TEXT[nameFallback] ?? NAME_FALLBACK_TEXT[NAME_FALLBACK.EXPLORER];
}

/** 이니셜 — 닉네임 첫 글자 대문자. */
export function initialOf(name) {
  const normalized = normalizeText(name);
  return normalized ? normalized.charAt(0).toUpperCase() : null;
}

/** 아바타 대체 텍스트 — C5 §3.4. 빈 alt는 금지다. */
export function avatarAltText(displayName) {
  return `${displayName}의 프로필 이미지`;
}

/**
 * 이미지 우선순위 4단계를 적용한다 — C5 §3.1.
 *
 * `failedStages`에 담긴 단계는 건너뛴다. 이것이 §3.2의 에셋 로딩 실패 동작이다:
 * 이미지 단계가 실패하면 이니셜(3단계)로 내려가고, 닉네임이 없으면 시스템 기본(4단계)이 된다.
 *
 * **`card`를 변형하지 않는다.** 장착 상태 데이터는 실패해도 그대로 남는다 (§3.2).
 */
export function resolveAvatarStage(card, failedStages = []) {
  const failed = new Set(failedStages);
  const iconRef = normalizeText(card?.icon?.assetRef);
  const legacyUrl = normalizeText(card?.legacyImageUrl);
  const initial = initialOf(card?.nickname);

  if (iconRef && !failed.has(AVATAR_STAGE.ICON)) {
    return { stage: AVATAR_STAGE.ICON, src: iconRef, initial: null };
  }
  if (legacyUrl && !failed.has(AVATAR_STAGE.LEGACY)) {
    return { stage: AVATAR_STAGE.LEGACY, src: legacyUrl, initial: null };
  }
  if (initial) {
    return { stage: AVATAR_STAGE.INITIAL, src: null, initial };
  }
  return { stage: AVATAR_STAGE.DEFAULT, src: null, initial: null };
}

/** 크기 토큰 → px. 모르는 토큰은 md로 떨어진다. */
export function avatarSizePx(size) {
  return AVATAR_SIZES[size] ?? AVATAR_SIZES.md;
}

/** 밀도가 해당 요소를 보이는가 — C5 §4. */
export function densityShows(density, element) {
  const elements = DENSITY_ELEMENTS[density] ?? DENSITY_ELEMENTS[DENSITY.COMPACT];
  return elements.includes(element);
}

/* ────────────────────────────────────────────────────────────────
 * 17b — C1 보상 장착 → 카드 슬롯 (서버 응답 매핑)
 * ──────────────────────────────────────────────────────────────── */

/**
 * 프로필 카드에 걸리는 장착 슬롯 — 카드 요소 4종 (C5 §2, 16d에서 배지 폐지).
 * 모든 slot의 `slot_index`는 1이다 (C1 §0.-1). 옛 DB의 `badge` 장착 행은 어디에도 매핑되지 않아 무시된다.
 */
export const PROFILE_CARD_SLOTS = Object.freeze([
  Object.freeze({ slot: "profile_icon", cardKey: "icon", label: "프로필 아이콘" }),
  Object.freeze({ slot: "title", cardKey: "title", label: "대표 칭호" }),
  Object.freeze({ slot: "frame", cardKey: "frame", label: "프로필 프레임" }),
  Object.freeze({ slot: "background", cardKey: "background", label: "프로필 배경" }),
]);

/**
 * 경기 표현 — 카드에는 없고 결과 화면에 쓰인다 (16d 판정 4). 편집기의 "경기 표현" 묶음.
 * 경로 효과·관전 이모티콘은 그리는 곳이 없어 편집기에 두지 않는다 (16 판정 7).
 */
export const MATCH_EXPRESSION_SLOTS = Object.freeze([
  Object.freeze({ slot: "finish_effect", label: "완주 효과" }),
  Object.freeze({ slot: "path_color", label: "경로 색상" }),
]);

const CARD_SLOT_KEYS = Object.freeze(["icon", "title", "frame", "background"]);

/**
 * 서버의 RewardRef(`private.reward_ref_v1`)를 C5 §2의 형태로 정규화한다.
 * `slotIndex`(배지 폐지 후 항상 1)와 `retired`(C1-② 장착 유지 표식)는 덧붙은 필드다.
 */
export function normalizeRewardRef(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rewardId = normalizeText(raw.rewardId ?? raw.reward_id);
  if (!rewardId) return null;
  const slotIndex = Number(raw.slotIndex ?? raw.slot_index);
  return {
    rewardId,
    kind: normalizeText(raw.kind),
    displayName: normalizeText(raw.displayName ?? raw.display_name) ?? rewardId,
    assetRef: normalizeText(raw.assetRef ?? raw.asset_ref),
    slotIndex: Number.isFinite(slotIndex) ? slotIndex : null,
    retired: raw.retired === true,
  };
}

/** `get_profile_card_v1`·`get_profile_cards_v1`의 카드 하나 → C5 §2 카드. */
export function cardFromServer(raw) {
  if (!raw || typeof raw !== "object") return buildProfileCard();
  const level = Number(raw.level);
  return buildProfileCard({
    userId: raw.userId ?? null,
    nickname: raw.nickname,
    level: Number.isFinite(level) ? level : null,
    icon: normalizeRewardRef(raw.icon),
    title: normalizeRewardRef(raw.title),
    frame: normalizeRewardRef(raw.frame),
    background: normalizeRewardRef(raw.background),
    legacyImageUrl: raw.legacyImageUrl,
    source: "live",
  });
}

/**
 * 보상 슬롯 4개만 `serverCard`에서 가져와 `baseCard`에 얹는다.
 *
 * 랭킹·그룹 행은 닉네임·레벨·이미지를 자기 조회(행 데이터·스냅샷)에서 이미 갖고 있다.
 * 그 값은 그대로 두고 장착 결과만 병합한다 — 배치 조회가 실패하거나 늦어도
 * 행은 기존대로 그려진다. `source`도 바꾸지 않는다 (C5 §2.1).
 */
export function mergeRewardSlots(baseCard, serverCard) {
  const base = buildProfileCard(baseCard ?? {});
  if (!serverCard) return base;
  const rewards = cardFromServer(serverCard);
  const merged = { ...base };
  for (const key of CARD_SLOT_KEYS) merged[key] = rewards[key];
  return merged;
}

/**
 * `equip/unequip_profile_reward_v1`의 `equipment[]`(전체 장착 상태)로 카드 슬롯을 다시 만든다.
 * 서버가 확정한 상태만 표시한다 (spec §10) — 클라이언트가 슬롯을 추측하지 않는다.
 */
export function applyEquipment(baseCard, equipment) {
  const base = buildProfileCard(baseCard ?? {});
  const next = { ...base, icon: null, title: null, frame: null, background: null };
  if (!Array.isArray(equipment)) return next;
  for (const entry of equipment) {
    const definition = PROFILE_CARD_SLOTS.find((item) => item.slot === entry?.slot);
    if (!definition) continue;
    const ref = normalizeRewardRef({ ...entry.reward, slotIndex: entry.slotIndex ?? entry.reward?.slotIndex });
    if (ref) next[definition.cardKey] = ref;
  }
  return next;
}

/** 슬롯에 지금 장착된 카드 보상 — 편집 UI의 "현재" 표시용. */
export function equippedAt(card, slot) {
  const definition = PROFILE_CARD_SLOTS.find((item) => item.slot === slot);
  if (!definition || !card) return null;
  return card[definition.cardKey] ?? null;
}

/**
 * 장착 응답(`equipment[]`)에서 경기 표현 슬롯만 `{ [slot]: RewardRef }`로 꺼낸다.
 * 옛 DB의 `badge` 행 등 다른 slot은 무시한다.
 */
export function matchExpressionFromEquipment(equipment) {
  const result = {};
  for (const definition of MATCH_EXPRESSION_SLOTS) result[definition.slot] = null;
  if (!Array.isArray(equipment)) return result;
  for (const entry of equipment) {
    if (!Object.hasOwn(result, entry?.slot)) continue;
    const ref = normalizeRewardRef(entry.reward);
    if (ref) result[entry.slot] = ref;
  }
  return result;
}

const EQUIP_ERROR_TEXT = Object.freeze({
  AUTH_REQUIRED: "로그인한 탐험가만 꾸밀 수 있습니다.",
  REWARD_NOT_OWNED: "보유하지 않은 보상입니다.",
  SLOT_KIND_MISMATCH: "이 자리에 장착할 수 없는 보상입니다.",
  SLOT_INDEX_INVALID: "장착할 수 없는 자리입니다.",
  REWARD_RETIRED: "더 이상 장착할 수 없는 보상입니다.",
  SLOT_EMPTY: "이미 비어 있는 자리입니다.",
});

/** C1 §4 실패 코드 → 문구. 모르는 코드는 일반 문구로 떨어진다. */
export function equipErrorMessage(code) {
  return EQUIP_ERROR_TEXT[code] ?? "장착 상태를 저장하지 못했습니다.";
}
