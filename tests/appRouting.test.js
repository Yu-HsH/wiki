import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOBBY_PATH,
  LOGIN_PATH,
  ONLINE_LOBBY_PATH,
  getLobbyAccess,
  getSingleGameLobbyNavigation,
} from "../utils/appRoutes.js";
import { resolveAuthUserWithGuestFallback } from "../utils/localAuthSession.js";
import {
  clearGuestSingleGameProgress,
  readGuestSingleGameSession,
  saveGuestSingleGameSession,
} from "../utils/singleGameSession.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function createMemoryStorage() {
  const values = new Map();
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

function createActiveGuestGame(now) {
  return {
    phase: "PLAYING",
    target: { title: "목표 문서", summary: "목표 요약", mode: "random" },
    startTitle: "시작 문서",
    currentTitle: "현재 문서",
    pathTitles: ["시작 문서", "현재 문서"],
    clickCount: 1,
    elapsedSeconds: 5,
    startedAt: now - 5_000,
  };
}

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function collectAppSourceFiles(directory = projectRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if ([".git", "dist", "node_modules", "tests"].includes(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectAppSourceFiles(absolutePath));
    } else if (/\.(?:js|jsx)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

test("게스트 포기 후 /lobby로 replace 이동한다", () => {
  const destination = getSingleGameLobbyNavigation();
  assert.equal(destination.path, LOBBY_PATH);
  assert.deepEqual(destination.options, { replace: true });
});

test("게스트 포기 후 /login으로 이동하지 않는다", () => {
  const destination = getSingleGameLobbyNavigation();
  assert.notEqual(destination.path, LOGIN_PATH);
});

test("로그인 사용자 포기 후 로그인 상태를 유지한 로비로 이동한다", () => {
  const user = { id: "authenticated-user", isGuest: false };
  assert.equal(getLobbyAccess({ loading: false, user }), "allowed");
  assert.equal(getSingleGameLobbyNavigation().path, LOBBY_PATH);
});

test("성공 결과 확인 버튼은 /lobby 이동 콜백에 연결된다", async () => {
  const [gamePageSource, overlaySource] = await Promise.all([
    readProjectFile("pages/GamePage.jsx"),
    readProjectFile("components/SuccessOverlay.jsx"),
  ]);

  assert.match(gamePageSource, /onReturnToLobby=\{handleGiveUp\}/);
  assert.match(overlaySource, /onClick=\{onReturnToLobby\}/);
});

test("성공 후 게스트 세션을 삭제한다", async () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGuestGame(now), storage, now);
  clearGuestSingleGameProgress(storage);

  const gamePageSource = await readProjectFile("pages/GamePage.jsx");
  assert.match(
    gamePageSource,
    /const handleWin = useCallback\([\s\S]*?clearSingleGameState\(\);/
  );
  assert.equal(readGuestSingleGameSession(storage, { now }), null);
});

test("포기 후 게스트 세션을 삭제한다", async () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;
  saveGuestSingleGameSession(createActiveGuestGame(now), storage, now);
  clearGuestSingleGameProgress(storage);

  const gamePageSource = await readProjectFile("pages/GamePage.jsx");
  assert.match(
    gamePageSource,
    /const handleGiveUp = useCallback\([\s\S]*?clearSingleGameState\(\);/
  );
  assert.equal(readGuestSingleGameSession(storage, { now }), null);
});

test("앱 라우팅에서 /main 경로를 사용하지 않는다", async () => {
  const sourceFiles = await collectAppSourceFiles();
  const forbiddenRoute = /(["'`])\/main\1/;

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    assert.doesNotMatch(
      source,
      forbiddenRoute,
      `${path.relative(projectRoot, sourceFile)}에서 /main 앱 경로를 사용함`
    );
  }
});

test("/lobby는 저장된 로컬 게스트에게 허용된다", () => {
  const localGuest = {
    id: "guest-test",
    displayName: "게스트",
    isGuest: true,
    mode: "local",
  };
  const restoredUser = resolveAuthUserWithGuestFallback(null, localGuest);

  assert.equal(restoredUser, localGuest);
  assert.equal(
    getLobbyAccess({ loading: false, user: restoredUser }),
    "allowed"
  );
});

test("/lobby 직접 접근은 독립된 React Router 경로로 등록된다", async () => {
  const appSource = await readProjectFile("App.jsx");
  assert.match(appSource, /path=\{LOBBY_PATH\}/);
  assert.match(appSource, /element=\{<LobbyRoute \/>\}/);
  assert.equal(LOBBY_PATH, "/lobby");
});

test("1:1 및 그룹 게임 종료는 기존 온라인 로비 이동 흐름을 유지한다", async () => {
  const [duelSource, groupSource] = await Promise.all([
    readProjectFile("pages/MultiplayerGamePage.jsx"),
    readProjectFile("pages/GroupGamePage.jsx"),
  ]);

  assert.equal(ONLINE_LOBBY_PATH, "/multiplayer");
  assert.match(
    duelSource,
    /navigate\("\/multiplayer", \{ replace: true \}\)/
  );
  assert.match(
    groupSource,
    /navigate\("\/multiplayer", \{ replace: true \}\)/
  );
});
