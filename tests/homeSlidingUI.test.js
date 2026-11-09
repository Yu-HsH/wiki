import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("HOME has a visible GAME START appearance and preserves full-hero click", () => {
  const hero = source("components/wiki-race/ExpeditionHero.jsx");
  const css = source("css/jungleVeil.css");
  assert.ok(hero.includes("wr-veil-start-visual"));
  assert.ok(hero.includes("게임 시작"));
  assert.ok(hero.includes('className="wr-veil-trigger"'));
  assert.ok(hero.includes("onClick={startExpedition}"));
  assert.ok(css.includes("pointer-events: none"));
  assert.ok(css.includes("wr-veil-start-visual"));
});

test("ranking retains 10s automatic rotation, 30s manual hold, and sliding track", () => {
  const page = source("pages/MainPage.jsx");
  const carousel = source("components/wiki-race/HorizontalPager.jsx");
  const css = source("css/wikiRaceHomeSlides.css");
  assert.ok(page.includes("nextHomeRankingTab(previous)"));
  assert.ok(page.includes("10000"));
  assert.ok(page.includes("30000"));
  assert.ok(page.includes("className=\"wr-ranking-pager\""));
  assert.ok(carousel.includes("translate3d("));
  assert.ok(css.includes("360ms"));
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
});

test("notes and personal record diary support manual arrow and touch slides", () => {
  const page = source("pages/MainPage.jsx");
  const notes = source("components/WikiHighlights.jsx");
  const carousel = source("components/wiki-race/HorizontalPager.jsx");
  assert.ok(notes.includes("wr-notes-pager"));
  assert.ok(notes.includes("이전 탐험 노트"));
  assert.ok(notes.includes("다음 탐험 노트"));
  assert.ok(page.includes("wr-diary-pager"));
  assert.ok(page.includes("이전 탐험 기록"));
  assert.ok(page.includes("다음 탐험 기록"));
  assert.ok(carousel.includes("onTouchStart"));
  assert.ok(carousel.includes("onTouchEnd"));
  assert.ok(carousel.includes('inert={position === active ? undefined : ""}'));
  assert.ok(carousel.includes("aria-hidden={position !== active}"));
});

test("wiki notes automatically rotate every 10s, with 30s manual hold and accessibility pauses", () => {
  const notes = source("components/WikiHighlights.jsx");
  assert.match(notes, /window\.setInterval/);
  assert.match(notes, /}, 10000\)/);
  assert.match(notes, /Date\.now\(\) \+ 30000/);
  assert.match(notes, /setNoteIndex\(index => \(index \+ 1\) % noteNames\.length\)/);
  assert.match(notes, /rotationPaused \|\| document\.hidden/);
  assert.match(notes, /prefers-reduced-motion: reduce/);
  assert.match(notes, /onMouseEnter/);
  assert.match(notes, /onMouseLeave/);
  assert.match(notes, /onFocusCapture/);
  assert.match(notes, /onBlurCapture/);
  assert.match(notes, /onChange=\{selectNote\}/);
});
