import test from "node:test";
import assert from "node:assert/strict";
import {
  GUEST_SINGLE_GAME_MAX_AGE_MS,
  GUEST_SINGLE_GAME_STORAGE_KEY,
  clearGuestSingleGameProgress,
  getRestoredGuestElapsedSeconds,
  getSingleGameAccess,
  readGuestSingleGameSession,
  saveGuestSingleGameSession,
} from "../utils/singleGameSession.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createActiveGame(now = 1_000_000) {
  return {
    phase: "PLAYING",
    target: {
      title: "목표 문서",
      summary: "목표 요약",
      requestedKeyword: "",
      mode: "random",
    },
    startTitle: "시작 문서",
    currentTitle: "현재 문서",
    pathTitles: ["시작 문서", "중간 문서", "현재 문서"],
    clickCount: 2,
    elapsedSeconds: 15,
    startedAt: now - 15_000,
  };
}

test("게스트 싱글 진행 중 F5 후 유효한 세션으로 게임 라우트에 재진입한다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  const restored = readGuestSingleGameSession(storage, { now });
  assert.equal(
    getSingleGameAccess({ loading: false, user: null, guestSession: restored }),
    "guest-recovery"
  );
});

test("게스트 싱글의 현재 문서를 복원한다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  assert.equal(
    readGuestSingleGameSession(storage, { now }).currentTitle,
    "현재 문서"
  );
});

test("게스트 싱글의 목표 문서를 복원한다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  assert.equal(
    readGuestSingleGameSession(storage, { now }).target.title,
    "목표 문서"
  );
});

test("게스트 싱글의 이동 경로를 복원한다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  assert.deepEqual(
    readGuestSingleGameSession(storage, { now }).pathTitles,
    ["시작 문서", "중간 문서", "현재 문서"]
  );
});

test("게스트 싱글의 이동 횟수를 복원한다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  assert.equal(readGuestSingleGameSession(storage, { now }).clickCount, 2);
});

test("경과 시간은 마지막 저장값과 실제 시작 시각 중 더 긴 값을 복원한다", () => {
  const storage = createMemoryStorage();
  const savedAt = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(savedAt), storage, savedAt);
  const restoredAt = savedAt + 10_000;
  const session = readGuestSingleGameSession(storage, { now: restoredAt });

  assert.equal(getRestoredGuestElapsedSeconds(session, restoredAt), 25);
});

test("성공으로 종료 표시된 게스트 게임은 복원하지 않고 폐기한다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  const active = saveGuestSingleGameSession(createActiveGame(now), storage, now);
  storage.setItem(
    GUEST_SINGLE_GAME_STORAGE_KEY,
    JSON.stringify({ ...active, status: "completed" })
  );

  assert.equal(readGuestSingleGameSession(storage, { now }), null);
  assert.equal(storage.getItem(GUEST_SINGLE_GAME_STORAGE_KEY), null);
});

test("포기하면서 정리한 게스트 게임은 F5 후 복원하지 않는다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  clearGuestSingleGameProgress(storage);

  assert.equal(readGuestSingleGameSession(storage, { now }), null);
});

test("손상되거나 필드 관계가 맞지 않는 저장 데이터는 무시하고 폐기한다", () => {
  const now = 1_000_000;
  const brokenJsonStorage = createMemoryStorage({
    [GUEST_SINGLE_GAME_STORAGE_KEY]: "{broken",
  });
  assert.equal(readGuestSingleGameSession(brokenJsonStorage, { now }), null);
  assert.equal(brokenJsonStorage.getItem(GUEST_SINGLE_GAME_STORAGE_KEY), null);

  const invalidPathStorage = createMemoryStorage();
  const active = saveGuestSingleGameSession(
    createActiveGame(now),
    invalidPathStorage,
    now
  );
  invalidPathStorage.setItem(
    GUEST_SINGLE_GAME_STORAGE_KEY,
    JSON.stringify({ ...active, currentTitle: "경로에 없는 문서" })
  );
  assert.equal(readGuestSingleGameSession(invalidPathStorage, { now }), null);
});

test("StrictMode처럼 복구 판정을 두 번 실행해도 유효한 세션을 소비하지 않는다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  const firstRead = readGuestSingleGameSession(storage, { now });
  const secondRead = readGuestSingleGameSession(storage, { now });

  assert.deepEqual(secondRead, firstRead);
  assert.notEqual(storage.getItem(GUEST_SINGLE_GAME_STORAGE_KEY), null);
});

test("오래된 게스트 진행 데이터는 복원하지 않는다", () => {
  const storage = createMemoryStorage();
  const savedAt = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(savedAt), storage, savedAt);

  assert.equal(
    readGuestSingleGameSession(storage, {
      now: savedAt + GUEST_SINGLE_GAME_MAX_AGE_MS + 1,
    }),
    null
  );
});

test("로그인 사용자는 게스트 저장 데이터 없이 기존 싱글 라우트에 진입한다", () => {
  assert.equal(
    getSingleGameAccess({
      loading: false,
      user: { id: "authenticated-user" },
      guestSession: null,
    }),
    "user"
  );
  assert.equal(
    getSingleGameAccess({ loading: true, user: null, guestSession: null }),
    "loading"
  );
});

test("게스트 싱글 정리는 온라인 게임용 저장 데이터에 영향을 주지 않는다", () => {
  const onlineKey = "wiki-online-game-state";
  const storage = createMemoryStorage({
    [onlineKey]: "server-session-marker",
    "wiki-single-items": "guest-items",
  });
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);

  clearGuestSingleGameProgress(storage);

  assert.equal(storage.getItem(onlineKey), "server-session-marker");
  assert.equal(storage.getItem("wiki-single-items"), null);
});

test("게스트 세션 저장 데이터가 로그인 사용자 세션에 적용되지 않는다", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(now), storage, now);
  const guestSession = readGuestSingleGameSession(storage, { now });

  const access = getSingleGameAccess({
    loading: false,
    user: { id: "authenticated-user", isGuest: false },
    guestSession,
  });

  assert.equal(access, "user");
  assert.notEqual(access, "guest-recovery");
});

test("서로 다른 싱글 게임의 저장 상태가 섞이지 않는다", () => {
  const storage = createMemoryStorage();
  const firstSavedAt = 1_000_000;
  saveGuestSingleGameSession(createActiveGame(firstSavedAt), storage, firstSavedAt);

  const secondSavedAt = firstSavedAt + 1_000;
  saveGuestSingleGameSession(
    {
      phase: "COUNTDOWN",
      target: {
        title: "두 번째 목표",
        summary: "두 번째 목표 요약",
        requestedKeyword: "두 번째",
        mode: "custom",
      },
      startTitle: "두 번째 시작",
      currentTitle: "두 번째 시작",
      pathTitles: ["두 번째 시작"],
      clickCount: 0,
      elapsedSeconds: 0,
    },
    storage,
    secondSavedAt
  );

  const restored = readGuestSingleGameSession(storage, { now: secondSavedAt });
  assert.equal(restored.startTitle, "두 번째 시작");
  assert.equal(restored.currentTitle, "두 번째 시작");
  assert.equal(restored.target.title, "두 번째 목표");
  assert.deepEqual(restored.pathTitles, ["두 번째 시작"]);
  assert.equal(restored.clickCount, 0);
  assert.equal(restored.startedAt, undefined);
  assert.equal(JSON.stringify(restored).includes("현재 문서"), false);
  assert.equal(JSON.stringify(restored).includes("목표 문서"), false);
});
