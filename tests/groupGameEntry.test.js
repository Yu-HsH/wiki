import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeGroupEntryMarker,
  createGroupEntryMarker,
  getGroupLoadingState,
  getRestoredGroupPhase,
  GROUP_GAME_PHASE,
  resolveGroupEntry,
} from "../utils/groupGameFlow.js";

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

function enterFromLobby(storage, roomId = "room-1", token = "entry-token") {
  const groupEntryToken = createGroupEntryMarker({
    roomId,
    storage,
    token,
  });

  return resolveGroupEntry({
    roomId,
    navigationState: { groupEntryToken },
    storage,
  });
}

test("대기실에서 게임으로 정상 진입하면 initializing 안내를 사용한다", () => {
  const entry = enterFromLobby(createMemoryStorage());
  const loading = getGroupLoadingState(entry.phase);

  assert.equal(loading.phase, GROUP_GAME_PHASE.INITIALIZING);
  assert.equal(loading.mode, "initializing");
  assert.equal(
    loading.message,
    "서버에서 참가자와 시작 문서를 확인하고 있습니다."
  );
});

test("StrictMode와 같은 Effect 이중 초기화에서도 initializing 판정을 유지한다", () => {
  const storage = createMemoryStorage();
  const entry = enterFromLobby(storage);

  const effectSetupPhases = [entry.phase, entry.phase];
  const remountedEntryBeforeValidation = resolveGroupEntry({
    roomId: "room-1",
    navigationState: { groupEntryToken: "entry-token" },
    storage,
  });

  assert.deepEqual(effectSetupPhases, [
    GROUP_GAME_PHASE.INITIALIZING,
    GROUP_GAME_PHASE.INITIALIZING,
  ]);
  assert.equal(
    remountedEntryBeforeValidation.phase,
    GROUP_GAME_PHASE.INITIALIZING
  );
});

test("최초 서버 검증이 끝난 뒤에만 해당 방 marker를 소비한다", () => {
  const storage = createMemoryStorage();
  const entry = enterFromLobby(storage);

  assert.equal(storage.getItem(entry.markerKey), "entry-token");
  assert.equal(consumeGroupEntryMarker(entry, storage), true);
  assert.equal(storage.getItem(entry.markerKey), null);
  assert.equal(consumeGroupEntryMarker(entry, storage), false);
});

test("F5에서는 이전 navigation state가 남아 있어도 소비된 marker가 없어 recovering이다", () => {
  const storage = createMemoryStorage();
  const entry = enterFromLobby(storage);
  consumeGroupEntryMarker(entry, storage);

  const refreshedEntry = resolveGroupEntry({
    roomId: "room-1",
    navigationState: { groupEntryToken: "entry-token" },
    storage,
  });

  assert.equal(refreshedEntry.phase, GROUP_GAME_PHASE.RECOVERING);
});

test("직접 URL 접근은 같은 방의 marker만 남아 있어도 recovering이다", () => {
  const storage = createMemoryStorage();
  createGroupEntryMarker({
    roomId: "room-1",
    storage,
    token: "orphan-marker",
  });

  const directEntry = resolveGroupEntry({
    roomId: "room-1",
    navigationState: null,
    storage,
  });

  assert.equal(directEntry.phase, GROUP_GAME_PHASE.RECOVERING);
});

test("네트워크 재연결은 recovering 안내를 사용한다", () => {
  const reconnecting = getGroupLoadingState();

  assert.equal(reconnecting.phase, GROUP_GAME_PHASE.RECOVERING);
  assert.equal(reconnecting.mode, "recovering");
  assert.equal(
    reconnecting.message,
    "서버에서 참가 상태와 현재 문서를 다시 확인하고 있습니다."
  );
});

test("다른 roomId에 저장된 marker는 최초 진입 판정에 사용하지 않는다", () => {
  const storage = createMemoryStorage();
  createGroupEntryMarker({
    roomId: "room-a",
    storage,
    token: "room-a-token",
  });

  const roomBEntry = resolveGroupEntry({
    roomId: "room-b",
    navigationState: { groupEntryToken: "room-a-token" },
    storage,
  });

  assert.equal(roomBEntry.phase, GROUP_GAME_PHASE.RECOVERING);
  assert.equal(
    storage.getItem("wiki-group-initial-entry:room-a"),
    "room-a-token"
  );
});

test("관전 중 F5는 서버 세션과 저장된 viewMode로 spectating 상태를 복원한다", () => {
  const session = {
    outcome: "finished",
    room: { id: "room-1", status: "playing" },
    me: { user_id: "user-1", has_finished: true },
    players: [],
  };

  assert.equal(
    getRestoredGroupPhase(session, { viewMode: "spectating" }),
    GROUP_GAME_PHASE.SPECTATING
  );
});
