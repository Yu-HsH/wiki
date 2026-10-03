/**
 * 보상 `asset_ref` 토큰 — 프레임 단계 · 완주 효과 · 경로 색상 (트랙 16d, C5 §3.6).
 *
 * 문법과 색은 `docs/design/DESIGN-SYSTEM.md` §1·§4가 단일 기준이다:
 *   frame:tier-1 · frame:tier-2 · frame:tier-3 · frame:special
 *   finish:tier-1 · finish:tier-2 · finish:tier-3 · finish:special
 *   path:blue · path:purple · path:gold · path:teal · path:coral
 *
 * **모양을 `reward_id`로 정하지 않는다** — 히든 보상 ID가 프론트에 들어가면 G5를 깬다
 * (`docs/agent/16-HANDOFF.md` §4). 알 수 없는 토큰·`null`은 `null`이고 호출자는 기본 모양으로 그린다.
 * 16d-2 migration 전(옛 DB)에는 모든 `asset_ref`가 `null`이라 전부 기본 모양이다.
 */

/** 팔레트 5색 — DESIGN-SYSTEM §1. 테두리·노드·아이콘·경로에만 쓴다 (배경 채움 금지). */
export const PALETTE = Object.freeze({
  blue: "#2E6DB4",
  purple: "#6E56C9",
  gold: "#B98A12",
  teal: "#1D8B81",
  coral: "#DE5F49",
});

const TIERS = Object.freeze(["tier-1", "tier-2", "tier-3", "special"]);

function tokenValue(ref, prefix) {
  const raw = typeof ref === "string" ? ref : ref?.assetRef;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.startsWith(`${prefix}:`) ? trimmed.slice(prefix.length + 1) : null;
}

/** 프레임 단계 — `"tier-1"`·`"tier-2"`·`"tier-3"`·`"special"` 또는 `null`(기본 링). */
export function frameTier(ref) {
  const value = tokenValue(ref, "frame");
  return TIERS.includes(value) ? value : null;
}

/** 완주 효과 단계 — 같은 네 값 또는 `null`(효과 없음이 아니라 기본 효과). */
export function finishTier(ref) {
  const value = tokenValue(ref, "finish");
  return TIERS.includes(value) ? value : null;
}

/** 경로 색상 — 팔레트 hex 또는 `null`(기본 회색 경로). 팔레트 밖 이름은 받지 않는다. */
export function pathColor(ref) {
  const value = tokenValue(ref, "path");
  return value && Object.hasOwn(PALETTE, value) ? PALETTE[value] : null;
}
