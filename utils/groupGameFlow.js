export const GROUP_GAME_PHASE = Object.freeze({
  INITIALIZING: "initializing",
  RECOVERING: "recovering",
  PICKING: "picking",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  FINISHED: "finished",
  SPECTATING: "spectating",
  ENDED: "ended",
  FATAL_ERROR: "fatalError",
});

const GROUP_ENTRY_MARKER_PREFIX = "wiki-group-initial-entry";
const INACTIVE_STATUSES = new Set(["dnf", "forfeited", "kicked", "left", "removed", "banned"]);

export function getGroupEntryMarkerKey(roomId) {
  return `${GROUP_ENTRY_MARKER_PREFIX}:${roomId}`;
}

export function createGroupEntryMarker({ roomId, storage, token } = {}) {
  if (!roomId || !storage?.setItem) {
    throw new Error("그룹 게임 최초 진입 marker를 저장할 수 없습니다.");
  }

  const entryToken =
    token ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  storage.setItem(getGroupEntryMarkerKey(roomId), entryToken);
  return entryToken;
}

export function resolveGroupEntry({ roomId, navigationState, storage } = {}) {
  const markerKey = getGroupEntryMarkerKey(roomId);
  const token = navigationState?.groupEntryToken || null;
  const hasInitialEntryToken =
    Boolean(roomId && token) &&
    storage?.getItem?.(markerKey) === token;

  return Object.freeze({
    markerKey,
    token,
    phase: getGroupEntryPhase({ hasInitialEntryToken }),
  });
}

export function consumeGroupEntryMarker(entry, storage) {
  if (
    entry?.phase !== GROUP_GAME_PHASE.INITIALIZING ||
    !entry.token ||
    storage?.getItem?.(entry.markerKey) !== entry.token
  ) {
    return false;
  }

  storage.removeItem(entry.markerKey);
  return true;
}

export function isGroupPlayerInactive(player) {
  const status = String(player?.participant_status || player?.status || "").toLowerCase();
  return (
    player?.is_active === false ||
    Boolean(player?.left_at) ||
    Boolean(player?.kicked_at) ||
    INACTIVE_STATUSES.has(status)
  );
}

export function getGroupEntryPhase({ hasInitialEntryToken }) {
  return hasInitialEntryToken
    ? GROUP_GAME_PHASE.INITIALIZING
    : GROUP_GAME_PHASE.RECOVERING;
}

export function getGroupLoadingState(
  phase = GROUP_GAME_PHASE.RECOVERING
) {
  const initializing = phase === GROUP_GAME_PHASE.INITIALIZING;

  return {
    phase: initializing
      ? GROUP_GAME_PHASE.INITIALIZING
      : GROUP_GAME_PHASE.RECOVERING,
    mode: initializing ? "initializing" : "recovering",
    message: initializing
      ? "서버에서 참가자와 시작 문서를 확인하고 있습니다."
      : "서버에서 참가 상태와 현재 문서를 다시 확인하고 있습니다.",
  };
}

export function getRestoredGroupPhase(session, savedState = {}) {
  if (session?.outcome === "ended") return GROUP_GAME_PHASE.ENDED;

  if (session?.outcome === "finished") {
    return savedState.viewMode === "spectating"
      ? GROUP_GAME_PHASE.SPECTATING
      : GROUP_GAME_PHASE.FINISHED;
  }

  const enteredPlaying =
    savedState.enteredPlaying === true ||
    session?.room?.status === "playing" ||
    Number(session?.moveCount) > 0;

  return enteredPlaying ? GROUP_GAME_PHASE.PLAYING : GROUP_GAME_PHASE.PICKING;
}

export function canGroupPlayerMove({ phase, isLoading, moveInFlight, hasFinished }) {
  return (
    phase === GROUP_GAME_PHASE.PLAYING &&
    !isLoading &&
    !moveInFlight &&
    !hasFinished
  );
}

export function getPendingGroupPlayers(players = []) {
  return players.filter(
    (player) => !player?.has_finished && !isGroupPlayerInactive(player)
  );
}

function resultStatus(player) {
  const explicitStatus = String(
    player?.result_status || player?.participant_status || player?.status || ""
  ).toLowerCase();

  if (player?.has_finished || explicitStatus === "finished" || Number.isInteger(player?.rank)) {
    return "finished";
  }

  if (INACTIVE_STATUSES.has(explicitStatus) || isGroupPlayerInactive(player)) {
    return "dnf";
  }

  return "dnf";
}

export function buildGroupFinalStandings(players = [], results = []) {
  const merged = new Map();

  players.forEach((player) => {
    merged.set(player.user_id, { ...player });
  });

  results.forEach((result) => {
    const previous = merged.get(result.user_id) || {};
    merged.set(result.user_id, { ...previous, ...result });
  });

  return Array.from(merged.values())
    .map((player) => ({
      ...player,
      result_status: resultStatus(player),
    }))
    .sort((a, b) => {
      const aRank = Number.isInteger(a.rank) ? a.rank : Number.POSITIVE_INFINITY;
      const bRank = Number.isInteger(b.rank) ? b.rank : Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;
      if (a.result_status !== b.result_status) {
        return a.result_status === "finished" ? -1 : 1;
      }
      return String(a.nickname_snapshot || "").localeCompare(
        String(b.nickname_snapshot || ""),
        "ko"
      );
    });
}
