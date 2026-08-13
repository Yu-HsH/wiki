const ACTIVE_GROUP_ROOM_STATUSES = new Set(["playing", "grace_period"]);

function toTimestampMs(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getNowTimestampMs(now) {
  if (now instanceof Date) {
    return Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  }

  if (typeof now === "number" && Number.isFinite(now)) return now;

  const timestamp = Date.parse(now || "");
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export function isGroupRoomActive(room) {
  return ACTIVE_GROUP_ROOM_STATUSES.has(room?.status);
}

/**
 * 그룹 경기의 실제 종료 시각을 서버 컬럼으로 계산한다.
 * playing은 전체 제한시간, grace_period는 grace와 전체 제한 중 더 이른 시각을 쓴다.
 */
export function getGroupActualEndAt(room) {
  if (!room || room.status === "finished") return null;

  const deadlineMs = toTimestampMs(room.game_deadline_at);
  if (room.status === "playing") {
    return deadlineMs === null ? null : new Date(deadlineMs);
  }

  if (room.status !== "grace_period") return null;

  const graceMs = toTimestampMs(room.grace_ends_at);
  if (graceMs === null && deadlineMs === null) return null;
  if (graceMs === null) return new Date(deadlineMs);
  if (deadlineMs === null) return new Date(graceMs);

  return new Date(Math.min(graceMs, deadlineMs));
}

export function getGroupRemainingSeconds(room, now = Date.now()) {
  if (room?.status === "finished") return 0;

  const endAt = getGroupActualEndAt(room);
  if (!endAt) return 0;

  return Math.max(0, Math.floor((endAt.getTime() - getNowTimestampMs(now)) / 1000));
}

export function isGroupRoomExpired(room, now = Date.now()) {
  if (!isGroupRoomActive(room)) return false;

  const endAt = getGroupActualEndAt(room);
  return Boolean(endAt && endAt.getTime() <= getNowTimestampMs(now));
}

/**
 * 같은 브라우저에서 동일한 방·종료시각에 대한 finalizer 반복 호출을 막는다.
 * 서로 다른 참가자의 호출은 각 브라우저에 독립적으로 허용된다.
 */
export function createGroupFinalizerGate() {
  let state = {
    key: null,
    attempted: false,
    promise: null,
  };

  return {
    run(key, operation, { force = false } = {}) {
      if (state.promise && state.key === key) return state.promise;

      if (state.key !== key || force) {
        state = { key, attempted: false, promise: null };
      }

      if (state.promise) return state.promise;
      if (state.attempted) return null;

      state.attempted = true;
      state.promise = Promise.resolve()
        .then(operation)
        .finally(() => {
          state.promise = null;
        });

      return state.promise;
    },
    reset() {
      state = { key: null, attempted: false, promise: null };
    },
  };
}
