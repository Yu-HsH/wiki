import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_RANKING_TABS, nextHomeRankingTab, homeRankUsesTime } from "../utils/homeRanking.js";

const home = readFileSync(new URL("../pages/MainPage.jsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/wiki-race/WikiRaceShell.jsx", import.meta.url), "utf8");
const ranking = readFileSync(new URL("../rankingService.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/wikiRaceBase.css", import.meta.url), "utf8");
const own = readFileSync(new URL("../hooks/useOwnProfileCard.js", import.meta.url), "utf8");

test("home ranking auto-cycle has four distinct categories", () => {
  const keys = HOME_RANKING_TABS.map(tab => tab.key);
  assert.deepEqual(keys, ["today", "weekly", "all", "challenge"]);
  assert.deepEqual(keys.map(nextHomeRankingTab), ["weekly", "all", "challenge", "today"]);
  assert.equal(nextHomeRankingTab("unknown"), "today");
  assert.equal(homeRankUsesTime("today"), true);
  assert.equal(homeRankUsesTime("challenge"), true);
  assert.equal(homeRankUsesTime("weekly"), false);
  assert.equal(homeRankUsesTime("all"), false);
});

test("today shows start -> goal -> time and never reuses the official challenge query", () => {
  assert.match(home, /period: "today_runs", limit: 3/);
  assert.match(home, /period: "daily", limit: 3/);
  assert.match(home, /r\.startTitle/);
  assert.match(home, /r\.targetTitle/);
  assert.match(home, /formatDuration\(r\.elapsedSeconds\)/);
  assert.match(ranking, /period === "daily" \|\| period === "today_runs"/);
  assert.match(ranking, /start_title, target_title/);
  assert.match(ranking, /startTitle: record\.start_title/);
  assert.match(ranking, /get_daily_course_rankings_contract_v1/);
});

test("weekly remains the existing authoritative gameplay-XP source", () => {
  assert.match(home, /fetchExplorerXpRankings\(\{ weekly: true, limit: 3 \}\)/);
  assert.match(home, /fetchExplorerXpRankings\(\{ limit: 3 \}\)/);
  assert.match(home, /rankingXp/);
});

test("rotation respects manual focus, hover, hidden page and reduced motion", () => {
  assert.match(home, /rankingPaused/);
  assert.match(home, /manualRotationPause/);
  assert.match(home, /document\.hidden/);
  assert.match(home, /prefers-reduced-motion: reduce/);
  assert.match(home, /setInterval/);
  assert.match(home, /onFocusCapture/);
  assert.match(home, /aria-pressed/);
});

test("header and explorer share the exact profile-avatar resolver", () => {
  assert.match(shell, /useOwnProfileCard\(user, level\)/);
  assert.match(shell, /<ExplorerAvatar card=\{ownCard\}/);
  assert.match(shell, /<ProfileAvatar card=\{card\}/);
  assert.match(home, /const ownCard = useOwnProfileCard\(user, xpSummary\?\.level \?\? null\)/);
  assert.match(home, /card=\{ownCard\}/);
  assert.match(own, /mergeRewardSlots/);
  assert.doesNotMatch(shell, /explorer-portrait\.png/);
});

test("all wiki race shell pages render side decorations, desktop-only with no pointer capture", () => {
  assert.match(shell, /<div className="wr-home-side-art"/);
  assert.doesNotMatch(shell, /view === "home" && <div className="wr-home-side-art"/);
  assert.match(css, /@media \(min-width: 1280px\)/);
  assert.match(css, /pointer-events: none/);
});
