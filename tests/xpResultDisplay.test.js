import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { XP_BY_SOURCE_TYPE, XP_DECAY_REASONS } from "../utils/xpRules.js";
import {
  XP_DECAY_NOTES,
  XP_GUEST_NOTE,
  XP_NO_GRANT_NOTE,
  XP_RESULT_REASON_LABELS,
  buildResultXpView,
  detectLevelUp,
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

test("level-up premise: one result never crosses two levels (max grant < min level step)", () => {
  const maxGrant = Math.max(...Object.values(XP_BY_SOURCE_TYPE));
  assert.equal(maxGrant, 70, "group_rank_1 is the largest single grant (C2 §3)");

  // C3 §4 — the formula lives in the DB. Read the smallest step from the migration
  // text rather than restating the formula here.
  const ledgerMigration = read("supabase/migrations/20260903090000_xp_ledger_v1.sql");
  const step = ledgerMigration.match(/select least\((\d+) \+ \d+ \* \(\(greatest\(p_level, 1\) - 1\) \/ 5\), \d+\);/);
  assert.ok(step, "xp_to_next_level keeps its C3 §4 shape");
  assert.ok(maxGrant < Number(step[1]), `max grant ${maxGrant} < level 1 step ${step[1]}`);
});

test("detectLevelUp: current XP inside the level smaller than the gain means a level-up", () => {
  assert.deepEqual(detectLevelUp(summary(2, 10), 15), { from: 1, to: 2 });
  assert.deepEqual(detectLevelUp(summary(5, 0), 50), { from: 4, to: 5 });
  assert.equal(detectLevelUp(summary(2, 15), 15), null, "exactly equal: the gain did not cross");
  assert.equal(detectLevelUp(summary(1, 40), 15), null);
  assert.equal(detectLevelUp(summary(3, 0), 0), null, "a 0 XP result never levels up");
  assert.equal(detectLevelUp(null, 15), null);
  assert.equal(detectLevelUp(summary(1, 0), 15), null, "level 1 has no level below it");
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
  });
  assert.deepEqual(view.levelUp, { from: 1, to: 2 });
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
  const stats = overlay.indexOf("statsContainerStyle}>");
  const xp = overlay.indexOf("<ResultXp");
  const path = overlay.indexOf("이동 경로</h3>");
  assert.ok(stats > 0 && xp > stats && path > xp, "결과 ▸ 기록 ▸ XP ▸ 경로");
  assert.match(overlay, /scope="single"/);
  assert.match(overlay, /sourceId=\{serverRecord\?\.id \?\? null\}/);
});

test("wiring: both normal duel result cards show XP; the result stays 4000ms", () => {
  const page = read("pages/MultiplayerGamePage.jsx");
  assert.equal((page.match(/<ResultXp scope="duel"/g) || []).length, 2);
  assert.equal((page.match(/\}, 4000\);/g) || []).length, 2);
  assert.doesNotMatch(page, /\}, 2200\);/);
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
  for (const file of ["utils/xpResultDisplay.js", "components/ResultXp.jsx", "services/xpService.js"]) {
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
