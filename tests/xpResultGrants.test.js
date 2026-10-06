import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { XP_BY_SOURCE_TYPE, applyDuelDecay } from "../utils/xpRules.js";

// Track 15c-1: the finalizer triggers pay XP on the server. utils/xpRules.js is
// the catalogue both sides transcribe (C2 §3·§5); these tests keep the SQL copy
// from drifting away from it.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

const MIGRATION_PATH = "supabase/migrations/20260930090000_xp_result_grants_v1.sql";
const PGTAP_PATH = "supabase/tests/xp_result_grants_v1.sql";

const migration = read(MIGRATION_PATH);
const pgtap = read(PGTAP_PATH);

/** SQL without `--` comments, so prose cannot satisfy or break an assertion. */
const migrationCode = migration
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

/**
 * Rows between the DUEL_DECAY_TABLE markers of the pgTAP file:
 * `(base, game_number, amount, decay_reason)`. The pgTAP file checks
 * private.duel_decay_v1 against these rows; this test checks applyDuelDecay
 * against the same rows — one table, two implementations.
 */
function readDecayTable() {
  const block = pgtap.match(/-- DUEL_DECAY_TABLE:BEGIN([\s\S]*?)-- DUEL_DECAY_TABLE:END/);
  assert.ok(block, "the pgTAP file keeps the DUEL_DECAY_TABLE markers");
  const literal = (token) => {
    const value = token.trim();
    if (value === "null") return null;
    if (/^'.*'$/.test(value)) return value.slice(1, -1);
    return Number(value);
  };
  return [...block[1].matchAll(/\(([^)]*)\)/g)].map(([, row]) => {
    const [base, gameNumber, amount, decayReason] = row.split(",").map(literal);
    return { base, gameNumber, amount, decayReason };
  });
}

test("duel decay table: applyDuelDecay matches every row private.duel_decay_v1 is tested on", () => {
  const rows = readDecayTable();
  assert.ok(rows.length >= 10, "the shared table covers the tiers and edge cases");

  for (const { base, gameNumber, amount, decayReason } of rows) {
    const result = applyDuelDecay(base, gameNumber);
    const label = `base=${base} n=${gameNumber}`;
    assert.equal(result.amount, amount, `${label}: amount`);
    assert.equal(result.decayReason, decayReason, `${label}: decay_reason`);
    assert.equal(result.baseAmount, Math.max(base ?? 0, 0), `${label}: base_amount`);
  }
});

test("duel decay table covers all three tiers, floor, and the clamps", () => {
  const rows = readDecayTable();
  const reasons = new Set(rows.map((row) => row.decayReason));
  assert.ok(reasons.has(null) && reasons.has("duel_repeat_half") && reasons.has("duel_repeat_zero"));
  assert.ok(rows.some((row) => row.base === 25 && row.amount === 12), "25 → 12 pins floor (C2 §8-①)");
  assert.ok(rows.some((row) => row.base < 0), "a negative base is clamped");
  assert.ok(rows.some((row) => row.gameNumber === null), "a missing game number counts as 1");
  assert.ok(rows.some((row) => row.gameNumber === 0), "a zero game number counts as 1");
});

test("SQL XP amounts equal the utils/xpRules.js catalogue (C2 §3)", () => {
  const single = migrationCode.match(
    /case v_source_type when 'daily_course_first_finish' then (\d+) else (\d+) end/,
  );
  assert.ok(single, "single amounts are chosen in one expression");
  assert.equal(Number(single[1]), XP_BY_SOURCE_TYPE.daily_course_first_finish);
  assert.equal(Number(single[2]), XP_BY_SOURCE_TYPE.single_target_first_finish);

  const duelPairs = [
    ["duel_win_normal", "v_winner_base"],
    ["duel_loss_normal", "v_loser_base"],
    ["duel_win_forfeit", "v_winner_base"],
    ["duel_loss_forfeit", "v_loser_base"],
  ];
  for (const [sourceType, variable] of duelPairs) {
    const pattern = new RegExp(`'${sourceType}';\\s*${variable}\\s*:=\\s*(\\d+);`);
    const match = migrationCode.match(pattern);
    assert.ok(match, `${sourceType} has its amount beside it`);
    assert.equal(Number(match[1]), XP_BY_SOURCE_TYPE[sourceType], sourceType);
  }

  for (const sourceType of ["group_rank_1", "group_rank_2", "group_rank_3"]) {
    const match = migrationCode.match(new RegExp(`when '${sourceType}' then (\\d+)`));
    assert.ok(match, `${sourceType} has its amount`);
    assert.equal(Number(match[1]), XP_BY_SOURCE_TYPE[sourceType], sourceType);
  }
  const other = migrationCode.match(/when 'group_rank_3' then \d+\s+else (\d+)/);
  assert.equal(Number(other[1]), XP_BY_SOURCE_TYPE.group_rank_other, "group_rank_other");
  assert.match(migrationCode, /v_source := 'group_retire';\s*v_base := 0;/);
  assert.equal(XP_BY_SOURCE_TYPE.group_retire, 0);
});

test("the historical 15c migration predates random run_mode payments", () => {
  assert.doesNotMatch(migrationCode, /'single_random_finish'/);
});

test("the migration edits no finalizer: triggers only, no drop, no replaced finish path", () => {
  assert.doesNotMatch(migrationCode, /\bdrop\s+function\b/i);
  for (const finalizer of [
    "apply_single_move_v2",
    "apply_duel_move_v2",
    "apply_duel_move_internal_v3",
    "leave_duel_room_v2",
    "finalize_duel_if_expired",
    "finish_group_room_v13",
    "finalize_group_room_v13",
    "finalize_group_room_if_expired",
    "apply_group_move_v2",
    "leave_group_player",
    "grant_xp_v1(",
  ]) {
    assert.doesNotMatch(
      migrationCode,
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+\\w+\\.${finalizer.replace("(", "\\(")}`, "i"),
      `${finalizer} is not redefined`,
    );
  }

  assert.match(migrationCode, /create trigger trg_grant_single_result_xp\s+after insert on public\.game_records/);
  assert.match(migrationCode, /create trigger trg_grant_duel_result_xp\s+after insert on public\.match_history/);
  assert.match(migrationCode, /create trigger trg_grant_group_result_xp\s+after update of status on public\.game_rooms/);
});

test("both isolation layers exist and fall back to raise warning (decision 7)", () => {
  const wrapper = migrationCode.match(
    /function private\.try_grant_xp_v1[\s\S]*?\$\$;/,
  )[0];
  assert.match(wrapper, /exception when others then/);
  assert.match(wrapper, /raise warning 'XP_GRANT_FAILED/);

  const trigger = migrationCode.match(
    /function private\.grant_result_xp_on_write_v1[\s\S]*?\$\$;/,
  )[0];
  assert.match(trigger, /exception when others then/);
  assert.match(trigger, /raise warning 'XP_RESULT_GRANT_FAILED/);
});

test("grant_result_xp_v1 is service_role only, like grant_xp_v1 (C2 §7)", () => {
  assert.match(
    migrationCode,
    /revoke all on function public\.grant_result_xp_v1\(text, uuid\)\s+from public, anon, authenticated;/,
  );
  assert.match(
    migrationCode,
    /grant execute on function public\.grant_result_xp_v1\(text, uuid\)\s+to service_role;/,
  );
  assert.doesNotMatch(migrationCode, /grant execute on function [^;]*to [^;]*authenticated/);
});

test("the day boundaries use KST (C2 §8-②) and the single day is the completion time", () => {
  assert.match(migrationCode, /v_day := \(v_record\.created_at at time zone 'Asia\/Seoul'\)::date;/);
  assert.match(migrationCode, /at time zone 'Asia\/Seoul'\)::date\s+= \(v_at at time zone 'Asia\/Seoul'\)::date/);
});
