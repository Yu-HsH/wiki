import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRealtimeVersion,
  createPendingRequestStore,
  isStaleRealtimeVersion,
  shouldLockGameInput,
} from "../utils/serverAuthority.js";

test("page ID/revision은 문자열 concurrency identity로 취급한다", () => {
  const pageId = String(9007199254740993n);
  const revisionId = String(9007199254740995n);
  assert.equal(typeof pageId, "string");
  assert.equal(typeof revisionId, "string");
  assert.notEqual(Number(pageId), Number(revisionId));
});
test("Realtime은 stale/next/gap을 구분하고 stale snapshot을 무시한다", () => {
  assert.equal(classifyRealtimeVersion(4, 4), "stale");
  assert.equal(classifyRealtimeVersion(4, 3), "stale");
  assert.equal(classifyRealtimeVersion(4, 5), "next");
  assert.equal(classifyRealtimeVersion(4, 7), "gap");
  assert.equal(isStaleRealtimeVersion(4, 4), true);
  assert.equal(isStaleRealtimeVersion(4, 5), false);
});

test("pending request는 F5 복구 보조 정보만 저장하고 멱등 request ID를 유지한다", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const store = createPendingRequestStore(storage, "pending");
  const pending = store.begin({ runId: "run-1", mode: "single" });
  assert.equal(store.read().requestId, pending.requestId);
  store.clear("different-request");
  assert.equal(store.read().requestId, pending.requestId);
  store.clear(pending.requestId);
  assert.equal(store.read(), null);
});

test("이동·복구·이탈 중에는 사용자 입력을 잠근다", () => {
  assert.equal(shouldLockGameInput({ moving: true }), true);
  assert.equal(shouldLockGameInput({ recovering: true }), true);
  assert.equal(shouldLockGameInput({ leaving: true }), true);
  assert.equal(shouldLockGameInput(), false);
});
