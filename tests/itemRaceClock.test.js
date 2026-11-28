import test from "node:test";
import assert from "node:assert/strict";
import { createItemRaceClock } from "../services/itemRaceClock.js";

test("a slow first read cannot leave the item-race clock ahead after a fast read", () => {
  const clock = createItemRaceClock();
  const first = clock.observe(107000, 7000, 7000);
  assert.equal(clock.observe(107010, 20, 7020), 107020, `first estimate was ${first}`);
  assert.equal(clock.observe(110000, 20, 10010), 110010);
  assert.equal(111500 - clock.now(10010), 1490);
});

test("a slow first read after a stale sample can be recalibrated", () => {
  const clock = createItemRaceClock();
  clock.observe(1000, 10, 0);
  clock.observe(41000, 7000, 40000);
  clock.observe(41010, 20, 40020);
  assert.equal(clock.observe(44000, 20, 43010), 44010);
  assert.equal(clock.now(43500), 44500);
});

test("a cold, slow read cannot skip time across a server start boundary", () => {
  const clock = createItemRaceClock();
  const startsAt = 108000;
  const beforeFastRead = clock.observe(104000, 4000, 4000);
  assert.equal(startsAt - beforeFastRead, 4000);
  clock.observe(104010, 20, 4020);
  assert.deepEqual([5020, 6020, 7020, 8000].map(at => Math.ceil((startsAt - clock.now(at)) / 1000)), [3, 2, 1, 0]);
});
