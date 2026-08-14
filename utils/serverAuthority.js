export const SERVER_HEARTBEAT_INTERVAL_MS = 10_000;
export const DUEL_RECONNECT_DEADLINE_SECONDS = 60;

export function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCorrelationId() {
  return createRequestId();
}

export function getProgressVersion(player) {
  const version = Number(player?.progress_version);
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

export function isStaleRealtimeVersion(currentVersion, incomingVersion) {
  const current = Number(currentVersion) || 0;
  const incoming = Number(incomingVersion) || 0;
  return incoming <= current;
}

export function classifyRealtimeVersion(currentVersion, incomingVersion) {
  const current = Number(currentVersion) || 0;
  const incoming = Number(incomingVersion) || 0;
  if (incoming <= current) return "stale";
  if (incoming === current + 1) return "next";
  return "gap";
}

export function createPendingRequestStore(storage, key = "wiki-pending-mutation") {
  const targetStorage = storage ?? globalThis.localStorage;

  const read = () => {
    try {
      const raw = targetStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const write = (value) => {
    try {
      if (!value) targetStorage?.removeItem(key);
      else targetStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // 저장소는 복구 보조 수단일 뿐 서버 상태보다 우선하지 않는다.
    }
  };

  return {
    read,
    begin(payload = {}) {
      const value = {
        requestId: createRequestId(),
        correlationId: createCorrelationId(),
        createdAt: Date.now(),
        ...payload,
      };
      write(value);
      return value;
    },
    clear(requestId) {
      const current = read();
      if (!requestId || current?.requestId === requestId) write(null);
    },
  };
}

export function normalizeAuthorityError(error, fallback = "서버 상태를 확인하지 못했습니다.") {
  const code = String(error?.code || error?.details?.code || "").toUpperCase();
  const message = error?.message || fallback;
  const normalized = new Error(message);
  normalized.code = code || "SERVER_AUTHORITY_ERROR";
  normalized.recoverable = ![
    "AUTH_REQUIRED",
    "NOT_A_PARTICIPANT",
    "LINK_NOT_ALLOWED",
    "LINK_SNAPSHOT_MISSING",
    "RUN_EXPIRED",
    "GAME_FINISHED",
  ].includes(normalized.code);
  normalized.cause = error;
  return normalized;
}

export function shouldLockGameInput({ moving = false, recovering = false, leaving = false } = {}) {
  return moving || recovering || leaving;
}
