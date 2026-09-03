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

const DENSITY_ELEMENTS = Object.freeze({
  [DENSITY.FULL]: Object.freeze(["level", "title", "badges", "frame", "background"]),
  [DENSITY.COMPACT]: Object.freeze(["level", "title"]),
  [DENSITY.MINIMAL]: Object.freeze(["title"]),
});

/** 대표 배지 최대 개수 — C1 §3의 slot_index CHECK가 DB에서 강제하는 값. */
export const MAX_BADGES = 3;

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * C5 §2의 카드 형태로 정규화한다. 없는 값은 전부 null/[]이다.
 * 레벨·칭호·배지·프레임·배경은 이 웨이브에서 슬롯만 존재한다 (C1/C3 DDL 이후에 채운다).
 */
export function buildProfileCard(input = {}) {
  return {
    userId: input.userId ?? null,
    nickname: normalizeText(input.nickname),
    level: input.level ?? null,
    title: input.title ?? null,
    badges: Array.isArray(input.badges) ? input.badges : [],
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

/**
 * 배지 정렬 — C5 §3.5 + C1 §3의 slot_index 순.
 * 0개면 빈 배열을 돌려주고, 호출자는 영역 자체를 렌더하지 않는다.
 * 4개 이상은 slot_index CHECK가 막으므로 발생할 수 없다 — 방어적으로 자른다.
 */
export function orderedBadges(badges) {
  if (!Array.isArray(badges)) return [];
  return badges
    .filter((badge) => badge && typeof badge === "object")
    .map((badge, index) => ({ badge, index }))
    .sort((a, b) => {
      const left = Number.isFinite(a.badge.slotIndex) ? a.badge.slotIndex : a.index + 1;
      const right = Number.isFinite(b.badge.slotIndex) ? b.badge.slotIndex : b.index + 1;
      if (left !== right) return left - right;
      return a.index - b.index;
    })
    .map((entry) => entry.badge)
    .slice(0, MAX_BADGES);
}
