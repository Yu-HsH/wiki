import test from "node:test";
import assert from "node:assert/strict";
import { claimResultMotion, formatRecordDate } from "../utils/resultJournal.js";
import { buildResultReveal } from "../utils/achievementDisplay.js";

test("start, group personal, group final and XP claims remain independent in the existing store", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  for (const identity of ["scene:start:group:room", "sheet:group-personal:room:user", "sheet:group:room", "xp:group:user:result"]) {
    assert.equal(claimResultMotion(storage, identity), true);
    assert.equal(claimResultMotion(storage, identity), false);
  }
  assert.deepEqual([...values.keys()], ["wiki-race-result-motion-v1"]);
});

test("full display claim storage fails closed without clearing previous F5 protection", () => {
  const previous = Array.from({ length: 256 }, (_, i) => `sheet:single:run-${i}`);
  let value = JSON.stringify(previous);
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  assert.equal(claimResultMotion(storage, "scene:start:single:new-run"), false);
  assert.deepEqual(JSON.parse(value), previous);
});

test("result motion is once per identity, survives reload, and separate XP/record identities", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(claimResultMotion(storage, "sheet:group:room-a"), true);
  assert.equal(claimResultMotion(storage, "sheet:group:room-a"), false);
  assert.equal(claimResultMotion(storage, "xp:group:user:result-a"), true);
  assert.equal(claimResultMotion(storage, "xp:group:user:result-a"), false);
  assert.equal(claimResultMotion(storage, "sheet:group:room-b"), true);
});
test("missing/blocked/corrupt storage never causes replay or crashes", () => {
  assert.equal(claimResultMotion(null, "a"), false);
  assert.equal(claimResultMotion({}, null), false);
  assert.equal(claimResultMotion({ getItem() { throw Error("blocked"); } }, "a"), false);
  assert.equal(claimResultMotion({ getItem: () => "{}" }, "a"), false);
  assert.equal(claimResultMotion({ getItem: () => JSON.stringify(Array.from({ length: 256 }, (_, i) => `old-${i}`)), setItem() { throw Error('must not evict'); } }, "new"), false);
});
test("record date uses server timestamp in KST, never fabricates date for missing data", () => {
  assert.equal(formatRecordDate(null), null);
  assert.equal(formatRecordDate("invalid"), null);
  assert.equal(formatRecordDate("2026-10-09T16:00:00Z"), "2026. 10. 10.");
});
test("reward specimens include only public refs from unseen tiers, deduplicate and retain assets", () => {
  const publicRef = { rewardId: "fixture-icon", kind: "profile_icon", displayName: "공개 견본", assetRef: "/profile-icons/compass.svg" };
  const response = { achievements: [{ achievementId: "fixture", tiers: [
    { tier: 1, seen: true, rewards: [{ ...publicRef, rewardId: "seen-only" }] },
    { tier: 2, unlockId: "new", rewards: [publicRef, publicRef, { rewardId: "empty" }] },
  ] }] };
  const item = buildResultReveal(response).items[0];
  assert.deepEqual(item.rewardRefs, [publicRef]);
  assert.deepEqual(item.unlockIds, ["new"]);
  assert.equal(response.achievements[0].tiers[1].rewards.length, 3);
  response.achievements[0].tiers[1].seen = true;
  assert.equal(buildResultReveal(response).items.length, 0);
});
