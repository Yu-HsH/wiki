import test from "node:test";
import assert from "node:assert/strict";
import { createItemRaceReader, itemRaceFailure, itemRaceReturnPath } from "../services/itemRaceRecovery.js";

test("item races preserve the distinction between revoked sessions, denied rooms, outages and stale documents", () => {
  for (const [error, kind] of [
    [{ code:"session_not_found", status:403 }, "auth"],
    [{ code:"PGRST301", status:401 }, "auth"],
    [{ message:"DUEL_V4_MEMBER_REQUIRED", status:403 }, "denied"],
    [{ message:"WAITING_ROOM_CLOSED" }, "closed"],
    [{ message:"STALE_DOCUMENT", code:"22023", status:400 }, "stale-document"],
    [{ message:"canceling statement due to statement timeout", code:"57014", status:500 }, "connection"],
    [{ code:"HINTS_AUTH_UNAVAILABLE", status:503 }, "connection"],
  ]) assert.equal(itemRaceFailure(error).kind, kind);
});

test("login return permits item room paths only", () => {
  const room = "/multiplayer/group-items/128e7000-0000-4000-8000-000000000001";
  assert.equal(itemRaceReturnPath(room), room);
  assert.equal(itemRaceReturnPath("//elsewhere.example" + room), null);
  assert.equal(itemRaceReturnPath(room + "?redirect=/"), null);
});

test("state reads coalesce, a queued signal survives a failure, and route exit aborts", async () => {
  const controller = new AbortController();
  const calls = [];
  const refresh = createItemRaceReader(signal => new Promise((resolve, reject) => {
    calls.push({ signal, resolve, reject });
    signal.addEventListener("abort", () => reject(signal.reason), { once:true });
  }), controller.signal);
  const first = refresh();
  assert.equal(refresh(), first);
  const latest = refresh({ trailing:true });
  assert.equal(refresh({ trailing:true }), latest);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  calls[0].reject(new Error("timeout"));
  await assert.rejects(first, /timeout/);
  await Promise.resolve();
  assert.equal(calls.length, 2);
  controller.abort();
  await assert.rejects(latest, { name:"AbortError" });
  assert.equal(await refresh(), undefined);
});
