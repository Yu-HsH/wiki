import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Hotfix (2026-09-30): the lobby's daily-course button must not start a game
// before today's course is known. It used to start from the fallback course,
// and that finish paid 15 (target-designated) instead of 25 (today's course).

const root = fileURLToPath(new URL("..", import.meta.url));
const mainPage = readFileSync(`${root}/pages/MainPage.jsx`, "utf8");

const dailyBlock = (() => {
  const start = mainPage.indexOf('className="dashboard-card daily-card"');
  const end = mainPage.indexOf("</section>", start);
  assert.ok(start > 0 && end > start, "the daily card block exists");
  return mainPage.slice(start, end);
})();

test("daily course starts unknown — the fallback is not the initial state", () => {
  assert.match(mainPage, /const \[dailyChallenge, setDailyChallenge\] = useState\(null\);/);
  assert.doesNotMatch(mainPage, /useState\(getFallbackDailyChallenge\)/);
});

test("the button is disabled and guarded until the course is loaded", () => {
  assert.match(dailyBlock, /disabled=\{!dailyChallenge\}/);
  assert.match(dailyBlock, /if \(!dailyChallenge\) return;/);
  const guard = dailyBlock.indexOf("if (!dailyChallenge) return;");
  const nav = dailyBlock.indexOf('navigate("/game"');
  assert.ok(guard > 0 && nav > guard, "the guard runs before navigate");
});

test("keyword and target are the same loaded value", () => {
  assert.match(dailyBlock, /keyword: dailyChallenge\.keyword,\s*targetTitle: dailyChallenge\.keyword,/);
});

test("loading copy is shown in place of the keyword, the hint waits", () => {
  assert.match(dailyBlock, /dailyChallenge\?\.keyword \?\? "오늘의 탐험을 불러오는 중…"/);
  assert.match(dailyBlock, /\{dailyChallenge && <p className="daily-hint">/);
  assert.match(dailyBlock, /aria-busy=\{!dailyChallenge\}/);
});

test("a thrown fetch still ends on the fallback course (existing behaviour kept, G14 untouched)", () => {
  const effect = mainPage.slice(
    mainPage.indexOf("const loadDailyChallenge = async () => {"),
    mainPage.indexOf("loadDailyChallenge();"),
  );
  assert.match(effect, /try \{\s*challenge = await fetchTodayDailyChallenge\(\);/);
  assert.match(effect, /catch \(error\) \{[\s\S]*challenge = getFallbackDailyChallenge\(\);/);
  assert.match(effect, /if \(!cancelled\) \{\s*setDailyChallenge\(challenge\);/);
});
