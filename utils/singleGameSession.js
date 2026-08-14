export const GUEST_SINGLE_GAME_STORAGE_KEY = "wiki-guest-single-game-state";
export const GUEST_SINGLE_GAME_VERSION = 1;
export const GUEST_SINGLE_GAME_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const LEGACY_SINGLE_GAME_STORAGE_KEY = "wiki-single-game-state";
const SINGLE_GAME_ITEMS_STORAGE_KEY = "wiki-single-items";
const ACTIVE_PHASES = new Set(["COUNTDOWN", "PLAYING"]);
const FUTURE_CLOCK_SKEW_MS = 60 * 1000;

function getStorage(storage) {
  return storage ?? globalThis.localStorage;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function createGuestToken() {
  if (globalThis.crypto?.randomUUID) {
    return `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`;
  }
  return `${Date.now()}-${Math.random()}-${Math.random()}-${Math.random()}`;
}

function normalizeStoredTitle(value) {
  return value.trim().replaceAll("_", " ").replace(/\s+/g, " ").toLowerCase();
}

function parseStoredValue(storage) {
  try {
    const raw = getStorage(storage)?.getItem(GUEST_SINGLE_GAME_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isInitialGameSnapshot(value) {
  return (
    value?.phase === "COUNTDOWN" &&
    value?.clickCount === 0 &&
    value?.elapsedSeconds === 0 &&
    Array.isArray(value?.pathTitles) &&
    value.pathTitles.length === 1
  );
}

export function isValidGuestSingleGameSession(value, now = Date.now()) {
  if (!isObject(value)) return false;
  if (value.version !== GUEST_SINGLE_GAME_VERSION) return false;
  if (value.gameType !== "guest-single" || value.status !== "active") return false;
  if (!ACTIVE_PHASES.has(value.phase)) return false;

  if (!Number.isFinite(value.savedAt)) return false;
  if (value.savedAt > now + FUTURE_CLOCK_SKEW_MS) return false;
  if (now - value.savedAt > GUEST_SINGLE_GAME_MAX_AGE_MS) return false;

  if (!isNonEmptyString(value.startTitle)) return false;
  if (!isNonEmptyString(value.currentTitle)) return false;
  if (!isObject(value.target) || !isNonEmptyString(value.target.title)) return false;

  if (!Array.isArray(value.pathTitles) || value.pathTitles.length === 0) return false;
  if (!value.pathTitles.every(isNonEmptyString)) return false;
  if (value.pathTitles[0] !== value.startTitle) return false;
  if (value.pathTitles.at(-1) !== value.currentTitle) return false;

  if (!Number.isInteger(value.clickCount) || value.clickCount < 0) return false;
  if (!Number.isInteger(value.elapsedSeconds) || value.elapsedSeconds < 0) return false;

  if (value.startedAt != null) {
    if (!Number.isFinite(value.startedAt)) return false;
    if (value.startedAt > now + FUTURE_CLOCK_SKEW_MS) return false;
  }

  if (
    normalizeStoredTitle(value.currentTitle) ===
    normalizeStoredTitle(value.target.title)
  ) {
    return false;
  }

  return true;
}

export function clearGuestSingleGameSession(storage) {
  try {
    getStorage(storage)?.removeItem(GUEST_SINGLE_GAME_STORAGE_KEY);
  } catch {
    // 저장소 접근이 차단되어도 게임 화면 자체는 계속 동작해야 합니다.
  }
}

export function clearGuestSingleGameProgress(storage) {
  clearGuestSingleGameSession(storage);
  try {
    const targetStorage = getStorage(storage);
    targetStorage?.removeItem(LEGACY_SINGLE_GAME_STORAGE_KEY);
    targetStorage?.removeItem(SINGLE_GAME_ITEMS_STORAGE_KEY);
  } catch {
    // 일부 키 정리에 실패해도 화면 이동이나 게임 종료를 막지 않습니다.
  }
}

export function readGuestSingleGameSession(
  storage,
  { now = Date.now(), discardInvalid = true } = {}
) {
  const value = parseStoredValue(storage);
  if (isValidGuestSingleGameSession(value, now)) return value;

  if (discardInvalid) {
    clearGuestSingleGameSession(storage);
  }
  return null;
}

export function saveGuestSingleGameSession(
  patch,
  storage,
  now = Date.now()
) {
  const previous = isInitialGameSnapshot(patch)
    ? null
    : parseStoredValue(storage);
  const candidate = {
    ...(isObject(previous) ? previous : {}),
    ...patch,
    version: GUEST_SINGLE_GAME_VERSION,
    gameType: "guest-single",
    status: "active",
    savedAt: now,
  };

  if (!isNonEmptyString(candidate.guestToken)) {
    candidate.guestToken = createGuestToken();
  }

  if (!isValidGuestSingleGameSession(candidate, now)) {
    clearGuestSingleGameSession(storage);
    return null;
  }

  try {
    getStorage(storage)?.setItem(
      GUEST_SINGLE_GAME_STORAGE_KEY,
      JSON.stringify(candidate)
    );
    return candidate;
  } catch {
    return null;
  }
}

export function getRestoredGuestElapsedSeconds(session, now = Date.now()) {
  if (!isValidGuestSingleGameSession(session, now)) return 0;
  if (session.phase !== "PLAYING" || !Number.isFinite(session.startedAt)) {
    return session.elapsedSeconds;
  }

  const wallClockElapsed = Math.max(
    0,
    Math.floor((now - session.startedAt) / 1000)
  );
  return Math.max(session.elapsedSeconds, wallClockElapsed);
}

export function getSingleGameAccess({ loading, user, guestSession }) {
  if (loading) return "loading";
  if (user) return "user";
  if (guestSession) return "guest-recovery";
  return "login";
}
