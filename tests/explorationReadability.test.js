import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const code = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("daily challenge places the labeled target description directly below the actual course", async () => {
  const jsx = await code("pages/MainPage.jsx");
  const course = jsx.indexOf('<div className="daily-course"');
  const guide = jsx.indexOf('<div className="daily-goal-guide"');
  const launch = jsx.indexOf('className="app-btn app-btn-primary daily-btn"');
  assert.ok(course >= 0 && guide > course && launch > guide);
  assert.match(jsx, /daily-hint-label">목표 설명/);
  assert.match(jsx, /aria-label="목표 문서 설명"/);
  assert.match(jsx, /dailyChallenge\.hint/);
});

test("daily guide is legible with its own grid cell on desktop and mobile", async () => {
  const css = await code("css/wikiRaceHome.css");
  assert.match(css, /\.wr-page\.wr-home \.daily-goal-guide \{ grid-column: 1;/);
  assert.match(css, /\.wr-page\.wr-home \.daily-hint \{ margin: 0; .*line-height: 1\.65;/);
  assert.match(css, /@media \(max-width: 768px\) \{/);
});

test("viewer keeps alias text only when truly different from the goal", async () => {
  const jsx = await code("components/WikiViewer.jsx");
  assert.match(jsx, /normalizeTitle\(target\.requestedKeyword\) !== normalizeTitle\(target\.title \|\| ""\)/);
  assert.match(jsx, /className="target-summary-label">어떤 문서인가요\?/);
  assert.match(jsx, /target-summary--collapsed/);
  assert.match(jsx, /aria-expanded=\{targetSummaryExpanded\}/);
});

test("loading status is centered and indeterminate, not a fabricated progress percentage", async () => {
  const page = await code("pages/GamePage.jsx");
  const raceParts = await code("components/wiki-race/race/RaceParts.jsx");
  const css = await code("css/wikiRaceRace.css");
  assert.match(page, /RaceHold className="wr-single-prepare-status"/);
  assert.match(page, /wr-single-prepare-spinner" aria-hidden="true"/);
  assert.match(raceParts, /className = ""/);
  assert.match(css, /\.wr-race-hold\.wr-single-prepare-status \{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(page, /wr-single-prepare-progress|wr-single-prepare-percent/);
});

test("target briefing changes never alter server authority or link movement", async () => {
  const viewer = await code("components/WikiViewer.jsx");
  const single = await code("pages/GamePage.jsx");
  assert.match(viewer, /onLinkClick\?\.\(nextTitle\)/);
  assert.match(single, /await applyAuthenticatedSingleMove/);
  assert.match(single, /await applyGuestSingleMove/);
});
