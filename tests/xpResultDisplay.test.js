import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { XP_BY_SOURCE_TYPE, XP_DECAY_REASONS } from "../utils/xpRules.js";
import {
  XP_DECAY_NOTES,
  XP_GUEST_NOTE,
  XP_NO_GRANT_NOTE,
  XP_ACHIEVEMENT_REASON,
  XP_RESULT_REASON_LABELS,
  buildResultXpView,
  detectLevelUp,
  formatLevelUp,
  formatXpGain,
} from "../utils/xpResultDisplay.js";

// Track 15c-2: the result screen shows the XP the 15c-1 triggers already wrote.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

const entry = (sourceType, amount, baseAmount = amount, decayReason = null) => ({
  sourceType, amount, baseAmount, decayReason,
});
const summary = (level, currentLevelXp, nextLevelXp = 100, totalXp = 0) => ({
  level, currentLevelXp, nextLevelXp, totalXp,
});

test("level-up premise (16c, 판정 9): result XP + achievement XP can cross several levels", () => {
  const maxGrant = Math.max(...Object.values(XP_BY_SOURCE_TYPE));
  assert.equal(maxGrant, 70, "group_rank_1 is the largest single result grant (C2 §3)");

  // C3 §4 — the formula lives in the DB. Read the smallest step from the migration text.
  const ledgerMigration = read("supabase/migrations/20260903090000_xp_ledger_v1.sql");
  const step = ledgerMigration.match(/select least\((\d+) \+ \d+ \* \(\(greatest\(p_level, 1\) - 1\) \/ 5\), \d+\);/);
  assert.ok(step, "xp_to_next_level keeps its C3 §4 shape");

  // 16a seeds achievement tiers up to 120 XP; one result can unlock several at once.
  const achievementMigration = read("supabase/migrations/20261002090000_achievements_rewards_v1.sql");
  assert.match(achievementMigration, /120/);
  assert.ok(maxGrant + 120 > Number(step[1]), "70 + 120 = 190 > the level 1 step — the old premise is gone");
});

test("detectLevelUp: with the server's level before the gain, several levels at once", () => {
  assert.deepEqual(detectLevelUp(summary(3, 40), 190, 1), { from: 1, to: 3, steps: 2 });
  assert.deepEqual(detectLevelUp(summary(2, 10), 15, 1), { from: 1, to: 2, steps: 1 });
  assert.equal(detectLevelUp(summary(2, 40), 15, 2), null, "same level before and after");
  assert.equal(detectLevelUp(summary(3, 0), 0, 3), null, "a 0 XP result never levels up");
});

test("detectLevelUp: without the level before, only \"went up\" is known", () => {
  assert.deepEqual(detectLevelUp(summary(2, 10), 15), { from: null, to: 2, steps: null });
  assert.deepEqual(detectLevelUp(summary(5, 0), 50), { from: null, to: 5, steps: null });
  assert.equal(detectLevelUp(summary(2, 15), 15), null, "exactly equal: the gain did not cross");
  assert.equal(detectLevelUp(summary(1, 40), 15), null);
  assert.equal(detectLevelUp(null, 15), null);
  assert.equal(detectLevelUp(summary(1, 0), 15), null, "level 1 has no level below it");
});

test("formatLevelUp: from → to, the step count only when more than one", () => {
  assert.equal(formatLevelUp({ from: 1, to: 2, steps: 1 }), "레벨 업! Lv.1 → Lv.2");
  assert.equal(formatLevelUp({ from: 1, to: 3, steps: 2 }), "레벨 업! Lv.1 → Lv.3 (+2)");
  assert.equal(formatLevelUp({ from: null, to: 4, steps: null }), "레벨 업! Lv.4");
  assert.equal(formatLevelUp(null), null);
});

test("formatXpGain uses the design's +55 XP shape", () => {
  assert.equal(formatXpGain(55), "+55 XP");
  assert.equal(formatXpGain(0), "+0 XP");
  assert.equal(formatXpGain(null), "+0 XP");
});

test("reasons are the spec §7.1 / 15 §1 table names for every paid single and duel source", () => {
  assert.equal(XP_RESULT_REASON_LABELS.single_target_first_finish, "목표 지정 탐험 최초 완주");
  assert.equal(XP_RESULT_REASON_LABELS.daily_course_first_finish, "오늘의 탐험 코스 최초 완주");
  assert.equal(XP_RESULT_REASON_LABELS.duel_win_normal, "1:1 정상 승리");
  assert.equal(XP_RESULT_REASON_LABELS.duel_loss_normal, "1:1 정상 패배");
  for (const sourceType of Object.keys(XP_RESULT_REASON_LABELS)) {
    assert.ok(sourceType in XP_BY_SOURCE_TYPE, `${sourceType} is a catalogue source`);
  }
  for (const reason of XP_DECAY_REASONS) {
    assert.ok(XP_DECAY_NOTES[reason], `${reason} has a note`);
  }
});

test("buildResultXpView: plain grant", () => {
  const view = buildResultXpView({
    scope: "single",
    entries: [entry("single_target_first_finish", 15)],
    summary: summary(1, 55),
  });
  assert.equal(view.kind, "granted");
  assert.equal(view.totalAmount, 15);
  assert.equal(view.lines[0].gain, "+15 XP");
  assert.equal(view.lines[0].reason, "목표 지정 탐험 최초 완주");
  assert.equal(view.lines[0].decayNote, null);
  assert.equal(view.levelUp, null);
});

test("buildResultXpView: decayed duel rows show the original amount and the reason", () => {
  const half = buildResultXpView({
    scope: "duel",
    entries: [entry("duel_win_normal", 25, 50, "duel_repeat_half")],
    summary: summary(3, 60),
  });
  assert.equal(half.lines[0].gain, "+25 XP");
  assert.equal(half.lines[0].decayNote, "원래 50 XP · 같은 상대와 오늘 4~5번째 경기 (50%)");

  const zero = buildResultXpView({
    scope: "duel",
    entries: [entry("duel_loss_normal", 0, 25, "duel_repeat_zero")],
    summary: summary(3, 60),
  });
  assert.equal(zero.lines[0].gain, "+0 XP");
  assert.equal(zero.lines[0].decayNote, "원래 25 XP · 같은 상대와 오늘 6번째 이상 경기 (0%)");
  assert.equal(zero.levelUp, null);
});

test("buildResultXpView: a level-up is reported from the post-grant summary", () => {
  const view = buildResultXpView({
    scope: "duel",
    entries: [entry("duel_win_normal", 50)],
    summary: summary(2, 5),
    levelBefore: 1,
  });
  assert.deepEqual(view.levelUp, { from: 1, to: 2, steps: 1 });
});

test("buildResultXpView: achievement XP is its own line and counts toward the level-up (판정 9)", () => {
  const view = buildResultXpView({
    scope: "single",
    entries: [entry("single_target_first_finish", 15)],
    summary: summary(3, 15, 100, 215),
    achievementXp: 180,
    levelBefore: 1,
  });
  assert.equal(view.totalAmount, 195);
  assert.deepEqual(view.lines.map((line) => line.gain), ["+15 XP", "+180 XP"]);
  assert.equal(view.lines[1].reason, XP_ACHIEVEMENT_REASON);
  assert.deepEqual(view.levelUp, { from: 1, to: 3, steps: 2 });
});

test("buildResultXpView: a repeat single finish with no result row can still pay achievement XP", () => {
  const view = buildResultXpView({
    scope: "single",
    entries: [],
    summary: summary(1, 60),
    achievementXp: 30,
  });
  assert.equal(view.kind, "granted");
  assert.equal(view.note, XP_NO_GRANT_NOTE, "the no-grant note still explains the missing result row");
  assert.deepEqual(view.lines.map((line) => line.sourceType), ["achievement_unlock"]);
});

test("buildResultXpView: no row — single explains, duel stays silent", () => {
  const single = buildResultXpView({ scope: "single", entries: [], summary: summary(1, 0) });
  assert.equal(single.kind, "none");
  assert.equal(single.note, XP_NO_GRANT_NOTE);
  assert.equal(XP_NO_GRANT_NOTE, "같은 코스는 처음 완주할 때만 XP를 받아요");

  assert.equal(buildResultXpView({ scope: "duel", entries: [] }), null,
    "a normal duel always pays; an empty read is a failure the caller warns about");
});

test("buildResultXpView: unknown yet or guest", () => {
  assert.equal(buildResultXpView({ scope: "single", entries: null }), null, "not loaded yet → nothing");
  const guest = buildResultXpView({ scope: "single", isGuest: true, entries: null });
  assert.equal(guest.kind, "guest");
  assert.equal(guest.note, XP_GUEST_NOTE);
});

test("wiring: SuccessOverlay places XP after the record summary and before the path", () => {
  const overlay = read("components/SuccessOverlay.jsx");
  const outcome = overlay.indexOf("<ResultOutcome");
  const stats = overlay.indexOf("<ResultStats");
  const xp = overlay.indexOf("<ResultXp");
  const path = overlay.indexOf("MY ROUTE · 이동 경로");
  assert.ok(outcome > 0 && stats > outcome && xp > stats && path > xp, "결과 ▸ 기록 ▸ XP ▸ 경로");
  assert.equal((overlay.match(/<ResultXp\s/g) || []).length, 1, "one ResultXp mount per result view");
  assert.match(overlay, /scope="single"/);
  assert.match(overlay, /sourceId=\{serverRecord\?\.id \?\? null\}/);
  // Phase 4: guest (incl. guest recovery without a user) and failed record reads never spin forever.
  assert.match(overlay, /isGuest=\{guestView\}/);
  assert.match(overlay, /unavailable=\{serverResultFailed\}/);
});

test("wiring: one shared duel result shows XP and stays until the explicit lobby action (Phase 4: no auto-redirect)", () => {
  const page = read("pages/MultiplayerGamePage.jsx");
  assert.equal((page.match(/<ResultXp\s+scope="duel"/g) || []).length, 1, "one ResultXp mount per result view");
  // [사용자 결정, 2026-10-07] the 4000/6000ms timers are removed — not lengthened, not replaced.
  assert.doesNotMatch(page, /RESULT_HOLD_MS|RESULT_HOLD_WITH_ACHIEVEMENTS_MS|resultNavigationTimerRef|extendResultHoldForAchievements/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => \{\s*navigate\(/, "no timed navigation away from the result");
  assert.equal((page.match(/navigate\("\/multiplayer", \{ replace: true \}\)/g) || []).length, 1,
    "the only way out is handleReturnToLobby");
  const leave = page.slice(page.indexOf("const handleReturnToLobby = async () => {"), page.indexOf("const { requestExit, dialog: exitDialog }"));
  assert.match(leave, /navigate\("\/multiplayer", \{ replace: true \}\)/);
  const result = page.slice(page.indexOf("{(phase === PHASE.SUCCESS || phase === PHASE.OPPONENT_WIN) && ("));
  assert.match(result, /onClick=\{handleReturnToLobby\}/);
  assert.match(result, /게임 로비로 이동/);
});

test("wiring: the stylesheet is registered once and uses only the rxp- prefix", () => {
  const styles = read("appStyles.js");
  assert.equal((styles.match(/import "\.\/css\/resultXp\.css";/g) || []).length, 1);
  const css = read("css/resultXp.css");
  const selectors = [...css.matchAll(/^([^\s/{}][^{}]*)\{/gm)].map(([, selector]) => selector.trim());
  assert.ok(selectors.length > 0);
  for (const selector of selectors) {
    assert.match(selector, /^\.rxp/, selector);
  }
});

test("no level formula and no grant path on the front", () => {
  for (const file of [
    "utils/xpResultDisplay.js",
    "components/ResultXp.jsx",
    "services/xpService.js",
    "services/achievementService.js",
    "utils/achievementDisplay.js",
  ]) {
    const source = read(file).split("\n").filter((line) => !/^\s*(\*|\/\/)/.test(line)).join("\n");
    assert.doesNotMatch(source, /100\s*\+\s*25/, `${file} does not restate the level formula`);
    assert.doesNotMatch(source, /grant_xp_v1|grant_result_xp_v1/, `${file} cannot pay XP`);
  }
});

test("an empty duel read after the retry warns with the roomId (trigger isolation clue)", () => {
  const component = read("components/ResultXp.jsx");
  assert.match(component, /DUEL_RETRY_DELAY_MS = 800/);
  assert.match(component, /console\.warn\("\[ResultXp\] duel result has no XP ledger row", \{ roomId/);
});
