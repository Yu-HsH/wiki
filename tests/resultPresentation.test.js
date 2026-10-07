import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildDuelOutcomeView,
  buildGroupOwnOutcome,
  buildGroupStandingRows,
  countGroupStandings,
  getGroupCelebration,
  getGroupRetireDetail,
  RETIRE_TERM,
} from "../utils/resultPresentation.js";
import { buildDuelResultPresentation } from "../utils/duelResultPresentation.js";
import { buildGroupFinalStandings } from "../utils/groupGameFlow.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

/* ── Group: RETIRE is always "리타이어"; the real reason is secondary (C4 vocabulary, read only) ── */

test("group retire detail keeps the production reason as secondary copy", () => {
  assert.equal(RETIRE_TERM, "리타이어");
  assert.equal(getGroupRetireDetail("forfeited"), "기권");
  assert.equal(getGroupRetireDetail("left"), "기권");
  assert.equal(getGroupRetireDetail("time_limit"), "제한 시간 초과");
  assert.equal(getGroupRetireDetail("grace_timeout"), "유예 시간 초과");
  assert.equal(getGroupRetireDetail("disconnected_timeout"), "몰수 · 재접속 유예 종료");
  assert.equal(getGroupRetireDetail("unknown"), null, "no invented copy");
  assert.equal(getGroupRetireDetail(null), null);
});

test("group standings rows keep server order and rank; retired → rank –, time –, 리타이어", () => {
  const results = [
    { id: "r1", user_id: "a", result_status: "finished", rank: 1, is_winner: true, elapsed_seconds: 280, move_count: 5 },
    { id: "r2", user_id: "me", result_status: "finished", rank: 2, is_winner: true, elapsed_seconds: 348, move_count: 7 },
    { id: "r4", user_id: "d", result_status: "finished", rank: 4, is_winner: false, elapsed_seconds: 600, move_count: 12 },
    { id: "r9", user_id: "x", result_status: "retired", rank: 3, retire_reason: "time_limit", elapsed_seconds: 1200, move_count: 9 },
  ];
  const players = [
    { user_id: "a", nickname_snapshot: "서준" },
    { user_id: "me", nickname_snapshot: "정원" },
    { user_id: "d", nickname_snapshot: "유진" },
    { user_id: "x", nickname_snapshot: "태오" },
  ];
  const standings = buildGroupFinalStandings(players, results);
  const rows = buildGroupStandingRows(standings, "me");
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 4, null], "server ranks, retired has none even if a stray rank exists");
  assert.deepEqual(rows.map((row) => row.name), ["서준", "정원", "유진", "태오"]);
  const retired = rows[3];
  assert.equal(retired.status, "리타이어");
  assert.equal(retired.time, "–");
  assert.equal(retired.reason, "제한 시간 초과");
  assert.equal(retired.moves, "9 이동");
  assert.equal(retired.isWinner, false);
  assert.equal(rows[1].isMe, true);
  assert.equal(rows.filter((row) => row.isMe).length, 1, "own row identifiable");
  assert.equal(rows[0].time, "04:40");
  assert.deepEqual(countGroupStandings(standings), { finished: 3, retired: 1 });
});

test("group celebration scales with placement; retire never celebrates", () => {
  assert.equal(getGroupCelebration(1), "full");
  assert.equal(getGroupCelebration(2), "dots");
  assert.equal(getGroupCelebration(3), "dots");
  assert.equal(getGroupCelebration(4), "none");
  assert.equal(getGroupCelebration(8), "none");
  assert.equal(getGroupCelebration(1, true), "none");
  assert.equal(getGroupCelebration(null), "none");
});

test("group own outcome: finisher B vs retired C → B (presentation step only)", () => {
  const finisher = buildGroupOwnOutcome({ result_status: "finished", rank: 2, elapsed_seconds: 348, move_count: 7 });
  assert.equal(finisher.title, "2위 완주");
  assert.equal(finisher.tone, "win");
  assert.equal(finisher.celebration, "dots");
  assert.equal(finisher.pill.text, "결과 확정");

  const retiredRow = { result_status: "retired", retire_reason: "forfeited", move_count: 4 };
  const c = buildGroupOwnOutcome(retiredRow, { view: "retired" });
  assert.equal(c.title, "리타이어");
  assert.equal(c.tone, "retire");
  assert.equal(c.celebration, "none");
  assert.equal(c.mascot, "lose");
  assert.equal(c.detail, "기권");
  assert.equal(c.pill.text, "목표 미도달");
  assert.deepEqual(c.stats.map((item) => [item.label, item.value]), [["순위", "–"], ["완주 시간", "–"], ["이동", "4회"]]);

  const b = buildGroupOwnOutcome(retiredRow, { view: "standings" });
  assert.equal(b.title, "리타이어");
  assert.equal(b.pill.text, "결과 확정");
});

/* ── Duel: outcome comes from the room's finalized reason/winner ── */

test("duel outcome view follows the server presentation (no client winner)", () => {
  const players = [{ user_id: "me", retire_reason: null }, { user_id: "opp", retire_reason: "forfeited" }];
  const normalWin = { status: "finished", finished_reason: "normal_finish", winner_user_id: "me" };
  const win = buildDuelOutcomeView({ room: normalWin, presentation: buildDuelResultPresentation(normalWin, players, "me"), phaseWon: true });
  assert.equal(win.title, "승리");
  assert.equal(win.tone, "win");
  assert.equal(win.reached, true);
  assert.equal(win.kicker, "EXPEDITION COMPLETE · 완주");

  const loss = buildDuelOutcomeView({ room: normalWin, presentation: buildDuelResultPresentation(normalWin, players, "opp"), phaseWon: false });
  assert.equal(loss.title, "패배");
  assert.equal(loss.tone, "lose");
  assert.equal(loss.celebration, "none");
  assert.equal(loss.pill.text, "상대 먼저 도달");

  const forfeitRoom = { status: "finished", finished_reason: "forfeit", winner_user_id: "me" };
  const forfeitWin = buildDuelOutcomeView({ room: forfeitRoom, presentation: buildDuelResultPresentation(forfeitRoom, players, "me"), phaseWon: true });
  assert.equal(forfeitWin.title, "승리");
  assert.equal(forfeitWin.pill.text, "상대 기권/이탈", "secondary reason from the C4 term");
  assert.equal(forfeitWin.reached, false, "a forfeit win did not reach the target");

  const ownForfeit = buildDuelOutcomeView({ room: { ...forfeitRoom, winner_user_id: "opp" }, presentation: buildDuelResultPresentation({ ...forfeitRoom, winner_user_id: "opp" }, players, "me"), phaseWon: false });
  assert.equal(ownForfeit.title, "패배");
  assert.equal(ownForfeit.pill.text, "기권");

  // A winner the page has not seen yet: the server presentation wins over the page phase.
  const serverSaysLoss = buildDuelOutcomeView({ room: normalWin, presentation: buildDuelResultPresentation(normalWin, players, "opp"), phaseWon: true });
  assert.equal(serverSaysLoss.title, "패배");

  const cancelledRoom = { status: "finished", finished_reason: "cancelled", winner_user_id: null };
  const cancelled = buildDuelOutcomeView({ room: cancelledRoom, presentation: buildDuelResultPresentation(cancelledRoom, players, "me"), phaseWon: false });
  assert.equal(cancelled.title, "무효");
  assert.equal(cancelled.tone, "neutral", "void is neither defeat nor celebration");
  assert.equal(cancelled.mascot, null);

  const pending = buildDuelOutcomeView({ room: { status: "playing" }, presentation: null, phaseWon: false });
  assert.equal(pending.title, "패배");
  assert.equal(pending.pill.text, "결과 확인 중");
});

/* ── Wiring: one ResultXp per view, Result A stays XP/achievement-free, C → B keeps one mount ── */

test("wiring: group final result mounts ResultXp once; Result A has none", () => {
  const page = read("pages/GroupGamePage.jsx");
  assert.equal((page.match(/<ResultXp\s/g) || []).length, 1, "only the final result view");
  const ended = page.slice(
    page.indexOf("\n    if (phase === GROUP_GAME_PHASE.ENDED) {\n"),
    page.indexOf("\n    // PICKING · COUNTDOWN · PLAYING"),
  );
  assert.ok(ended.length > 0 && ended.length < 6000, "final result block located");
  assert.match(ended, /<ResultXp scope="group"/);
  assert.match(ended, /const view = ownRetired && !finalStandingsOpen \? "retired" : "standings";/);
  assert.match(ended, /최종 결과 보기 →/);
  assert.doesNotMatch(ended, /관전하기/, "no spectator action on C/B");
  // XP slot sits before the C/B-specific section so React keeps the same instance across C → B.
  assert.ok(ended.indexOf("<ResultXp") < ended.indexOf('view === "retired" ? ('));
  assert.doesNotMatch(ended, /재대결/, "no rematch — production has no rematch contract");

  const parts = read("components/wiki-race/race/GroupRaceParts.jsx");
  assert.doesNotMatch(parts, /ResultXp|ResultAchievements/, "Result A shows no XP / achievements");
});

test("wiring: single result actions are real (no fake replay)", () => {
  const overlay = read("components/SuccessOverlay.jsx");
  assert.doesNotMatch(overlay, /window\.location\.reload|다시 도전/);
  assert.match(overlay, /onClick=\{onNewGame\}/);
  assert.match(overlay, /onClick=\{onReturnToLobby\}/);
  const page = read("pages/GamePage.jsx");
  assert.match(page, /navigate\("\/play", \{ replace: true \}\)/);
  assert.match(page, /onNewGame=\{handleChooseNewGame\}/);
});

test("wiring: result stylesheet registered once; no rematch copy anywhere in the result family", () => {
  assert.equal((read("appStyles.js").match(/import "\.\/css\/wikiRaceResult\.css";/g) || []).length, 1);
  for (const file of ["components/wiki-race/result/ResultParts.jsx", "pages/MultiplayerGamePage.jsx", "pages/GroupGamePage.jsx", "components/SuccessOverlay.jsx"]) {
    assert.doesNotMatch(read(file), /재대결|방장의 재대결 대기/, file);
  }
});
