import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getJungleParallaxOffsets } from "../utils/jungleParallax.js";

test("neutral at the exact center of the scene", () => {
  assert.deepEqual(getJungleParallaxOffsets(300, 200,
    { left: 100, top: 100, width: 400, height: 200 }),
  { nearX: 0, nearY: 0, farX: 0, farY: 0 });
});

test("bounded opposing near/far depth at each edge", () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  assert.deepEqual(getJungleParallaxOffsets(100, 100, rect),
    { nearX: 10, nearY: 7, farX: -5, farY: -3 });
  assert.deepEqual(getJungleParallaxOffsets(-1000, -1000, rect),
    { nearX: -10, nearY: -7, farX: 5, farY: 3 });
});

test("invalid or detached bounding boxes remain neutral", () => {
  const neutral = { nearX: 0, nearY: 0, farX: 0, farY: 0 };
  assert.deepEqual(getJungleParallaxOffsets(NaN, 20, {left: 0,top: 0,width: 10,height: 10}), neutral);
  assert.deepEqual(getJungleParallaxOffsets(10, 10, {left: 0,top: 0,width: 0,height: 10}), neutral);
  assert.deepEqual(getJungleParallaxOffsets(10, 10, null), neutral);
});

test("approved art, input guards and reduced-motion contract stay intact", () => {
  const jsx = readFileSync(new URL("../components/wiki-race/JungleAtmosphere.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../css/wikiRaceAmbient.css", import.meta.url), "utf8");
  const hero = readFileSync(new URL("../components/wiki-race/ExpeditionHero.jsx", import.meta.url), "utf8");
  const intro = readFileSync(new URL("../pages/IntroPage.jsx", import.meta.url), "utf8");
  assert.match(jsx, /aria-hidden="true"/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(jsx, /IntersectionObserver/);
  assert.doesNotMatch(jsx + css, /ForegroundCanopy|wr65-alive-canopy/);
  assert.match(hero, /hero-jungle-expedition\.webp/);
  assert.match(hero, /wr-play-launcher/);
  assert.match(intro, /landing-final\.webp/);
  assert.match(intro, /wr65-landing-hit-login/);
});
