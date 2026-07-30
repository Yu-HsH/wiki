const TRANSIENT_ERROR_CODES = new Set([
  "CHANNEL_ERROR",
  "CONNECTION_ERROR",
  "NETWORK_ERROR",
  "PROGRESS_CONFLICT",
  "TIMED_OUT",
  "TIMEOUT",
]);

const AUTH_ERROR_CODES = new Set([
  "401",
  "403",
  "AUTH_EXPIRED",
  "INVALID_JWT",
  "JWT_EXPIRED",
  "PGRST301",
]);

export class OnlineGameSessionError extends Error {
  constructor(message, { code = "ONLINE_GAME_ERROR", recoverable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "OnlineGameSessionError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

export function fatalSessionError(code, message, cause) {
  return new OnlineGameSessionError(message, { code, recoverable: false, cause });
}

export function recoverableSessionError(code, message, cause) {
  return new OnlineGameSessionError(message, { code, recoverable: true, cause });
}

export function normalizeOnlineGameError(error, fallbackMessage = "게임 연결을 확인하지 못했습니다.") {
  if (error instanceof OnlineGameSessionError) return error;

  const rawCode = String(error?.code || error?.status || "").toUpperCase();
  const rawMessage = String(error?.message || "").toLowerCase();

  if (
    AUTH_ERROR_CODES.has(rawCode) ||
    rawMessage.includes("jwt") ||
    rawMessage.includes("로그인이 필요") ||
    rawMessage.includes("인증") && rawMessage.includes("만료")
  ) {
    return fatalSessionError(
      "AUTH_EXPIRED",
      "로그인 세션이 만료되어 게임 참가 상태를 확인할 수 없습니다.",
      error
    );
  }

  if (rawCode === "PGRST116") {
    return fatalSessionError(
      "SESSION_NOT_FOUND",
      "게임 방이 없거나 더 이상 접근할 수 없습니다.",
      error
    );
  }

  const looksTransient =
    TRANSIENT_ERROR_CODES.has(rawCode) ||
    error instanceof TypeError ||
    rawMessage.includes("network") ||
    rawMessage.includes("fetch") ||
    rawMessage.includes("timeout") ||
    rawMessage.includes("timed out") ||
    rawMessage.includes("연결") ||
    rawMessage.includes("불러오지 못") ||
    rawMessage.includes("failed");

  return new OnlineGameSessionError(
    looksTransient ? fallbackMessage : "게임 상태를 확인하는 중 문제가 발생했습니다.",
    {
      code: rawCode || "UNKNOWN_ONLINE_ERROR",
      recoverable: true,
      cause: error,
    }
  );
}

function isInactivePlayer(player) {
  const status = String(player?.status || player?.participant_status || "").toLowerCase();
  return (
    player?.is_active === false ||
    Boolean(player?.left_at) ||
    Boolean(player?.kicked_at) ||
    ["kicked", "left", "removed", "banned"].includes(status)
  );
}

function getPlayer(players, userId) {
  return (players || []).find((player) => player.user_id === userId);
}

export function elapsedSecondsFromServer(startedAt, now = Date.now()) {
  const startedAtMs = Date.parse(startedAt || "");
  if (!Number.isFinite(startedAtMs)) return 0;
  return Math.max(0, Math.floor((now - startedAtMs) / 1000));
}

export function isProgressAlreadyApplied(latest, expected) {
  if (!latest) return false;
  return (
    latest.current_title === expected.currentTitle &&
    latest.move_count === expected.moveCount &&
    latest.has_finished === Boolean(expected.hasFinished)
  );
}

export function validateGroupGameSession({ room, players, userId, now = Date.now() }) {
  if (!room) {
    throw fatalSessionError("ROOM_NOT_FOUND", "게임 방이 삭제되었거나 존재하지 않습니다.");
  }

  if (room.mode !== "group") {
    throw fatalSessionError("WRONG_GAME_MODE", "단체모드 게임 방이 아닙니다.");
  }

  const me = getPlayer(players, userId);
  if (!me) {
    throw fatalSessionError("NOT_A_PARTICIPANT", "이 게임의 참가자가 아니거나 이미 퇴장 처리되었습니다.");
  }

  if (isInactivePlayer(me)) {
    throw fatalSessionError("PARTICIPANT_INACTIVE", "게임에서 나갔거나 강제 퇴장되어 다시 입장할 수 없습니다.");
  }

  if (room.status === "finished") {
    return { outcome: "ended", room, players, me };
  }

  if (me.has_finished) {
    return { outcome: "finished", room, players, me };
  }

  if (!["starting", "playing"].includes(room.status)) {
    throw fatalSessionError("GAME_NOT_ACTIVE", "진행 중인 게임이 아닙니다.");
  }

  if (!room.group_start_title || !room.group_target_title) {
    throw fatalSessionError("MISSING_GAME_STATE", "서버에 복원 가능한 시작 문서 또는 목표 문서가 없습니다.");
  }

  const currentTitle = me.current_title || room.group_start_title;
  if (!currentTitle) {
    throw fatalSessionError("MISSING_PROGRESS", "서버에 복원 가능한 현재 문서가 없습니다.");
  }

  const serverPath = Array.isArray(me.path_titles) ? me.path_titles.filter(Boolean) : [];
  const pathTitles = serverPath.length > 0 ? serverPath : [currentTitle];
  if (pathTitles[pathTitles.length - 1] !== currentTitle) pathTitles.push(currentTitle);

  return {
    outcome: "active",
    room,
    players,
    me,
    currentTitle,
    pathTitles,
    moveCount: Math.max(0, Number(me.move_count) || 0),
    elapsedSeconds: elapsedSecondsFromServer(room.started_at, now),
  };
}

export function validateDuelGameSession({ room, players, userId, now = Date.now() }) {
  if (!room) {
    throw fatalSessionError("ROOM_NOT_FOUND", "게임 방이 삭제되었거나 존재하지 않습니다.");
  }

  const me = getPlayer(players, userId);
  const opponent = (players || []).find((player) => player.user_id !== userId);

  if (!me) {
    throw fatalSessionError("NOT_A_PARTICIPANT", "이 게임의 참가자가 아니거나 이미 퇴장 처리되었습니다.");
  }

  if (isInactivePlayer(me)) {
    throw fatalSessionError("PARTICIPANT_INACTIVE", "게임에서 나갔거나 강제 퇴장되어 다시 입장할 수 없습니다.");
  }

  if (room.status === "finished" || me.has_finished) {
    return { outcome: "finished", room, players, me, opponent };
  }

  if (!["starting", "playing"].includes(room.status)) {
    throw fatalSessionError("GAME_NOT_ACTIVE", "진행 중인 게임이 아닙니다.");
  }

  if (!opponent) {
    throw fatalSessionError("OPPONENT_LEFT", "상대 참가자가 없어 게임을 계속할 수 없습니다.");
  }

  if (!opponent.target_title) {
    throw fatalSessionError("MISSING_TARGET", "서버에 목표 문서 정보가 없습니다.");
  }

  if (room.status === "playing" && (!me.start_title || !me.current_title)) {
    throw fatalSessionError("MISSING_PROGRESS", "서버에 복원 가능한 현재 문서가 없습니다.");
  }

  return {
    outcome: "active",
    room,
    players,
    me,
    opponent,
    currentTitle: me.current_title || "",
    moveCount: Math.max(0, Number(me.move_count) || 0),
    elapsedSeconds: elapsedSecondsFromServer(room.started_at, now),
  };
}

export async function retryRecoverable(operation, options = {}) {
  const {
    attempts = 3,
    delays = [500, 1200],
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    onRetry,
    fallbackMessage,
  } = options;

  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = normalizeOnlineGameError(error, fallbackMessage);
      if (!lastError.recoverable || attempt === attempts - 1) throw lastError;
      onRetry?.(attempt + 1, lastError);
      await sleep(delays[Math.min(attempt, delays.length - 1)] || 0);
    }
  }

  throw lastError;
}
