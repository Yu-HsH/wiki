import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getKionCountdownState } from "../utils/kionCountdownState.js";

const overlay = fs.readFileSync(new URL("../components/CountdownOverlay.jsx", import.meta.url), "utf8");
const companion = fs.readFileSync(new URL("../components/KionCountdownCompanion.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../components/KionCountdownCompanion.css", import.meta.url), "utf8");

test("duel and group display ready for 3/2/1 and go only on start", () => {
  for(const mode of ["duel", "group"]) {
    for(const step of [0,1,2]) assert.deepEqual(getKionCountdownState(mode,step), {emoteId:"ready",state:"ready"});
    assert.deepEqual(getKionCountdownState(mode,3), {emoteId:"go",state:"go"});
  }
  assert.equal(getKionCountdownState("single", 0), null);
  assert.equal(getKionCountdownState("duel", 4), null);
  assert.equal(getKionCountdownState("group", -1), null);
  assert.equal(getKionCountdownState("duel", 3, false), null);
});

test("animation is opt-in, not wired into audio timing, and decorative", () => {
  assert.match(companion, /VITE_ENABLE_KION_COUNTDOWN_ANIMATION\s*===\s*"true"/);
  assert.match(companion, /aria-hidden="true"/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important/);
  assert.doesNotMatch(companion, /audioManager|onComplete|setTimeout/);
});

test("game countdown keeps 3-2-1-start schedule and existing audio triggers", () => {
  assert.match(overlay, /const STEPS = \[3, 2, 1, "시작!"\]/);
  assert.match(overlay, /stepIndex === STEPS\.length - 1 \? 500 : 700/);
  assert.match(overlay, /onCompleteRef\.current\?\.\(\)/);
  assert.match(overlay, /audioManager\.play\(stepIndex === 3 \? 'go' : 'tick'/);
  assert.match(overlay, /<KionCountdownCompanion mode=\{mode\} stepIndex=\{stepIndex\} motionEligible=\{motionEligible\} \/>/);
});
