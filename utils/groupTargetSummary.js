import {
  normalizeRequestedTitle,
  normalizeTitle,
} from "../services/wikiService.js";

export const TARGET_SUMMARY_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  EMPTY: "empty",
  ERROR: "error",
});

export function createTargetSummaryState(overrides = {}) {
  return {
    status: TARGET_SUMMARY_STATUS.IDLE,
    requestedTitle: "",
    canonicalTitle: "",
    text: "",
    error: "",
    ...overrides,
  };
}

/**
 * 그룹 목표는 서버가 확정한 방 값을 우선합니다.
 * 방 값이 없는 이전 데이터는 모든 참가자의 서버 target_title이 같을 때만
 * 검증된 공통 목표로 간주합니다. submitted_target_title은 후보이므로 사용하지 않습니다.
 */
export function resolveGroupTargetTitle(room, players = []) {
  const roomTarget = normalizeRequestedTitle(room?.group_target_title);
  if (roomTarget) return roomTarget;

  const activePlayers = players.filter(
    (player) => player && !player.left_at && !player.kicked_at
  );
  if (activePlayers.length === 0) return "";

  const participantTargets = activePlayers.map((player) =>
    normalizeRequestedTitle(player.target_title)
  );
  if (participantTargets.some((title) => !title)) return "";

  const normalizedTargets = new Set(participantTargets.map(normalizeTitle));
  return normalizedTargets.size === 1 ? participantTargets[0] : "";
}

export function getTargetSummaryText(summary) {
  return normalizeRequestedTitle(summary?.extract)
    || normalizeRequestedTitle(summary?.description)
    || "";
}
