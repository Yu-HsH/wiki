import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transformSync } from "esbuild";
import { XP_BY_SOURCE_TYPE } from "../utils/xpRules.js";
import { buildResultXpView } from "../utils/xpResultDisplay.js";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261006000303_single_run_mode_xp_v1.sql");

async function guestCreate(runMode, targetTitle = "Target") {
  let handler;
  let inserted;
  const db = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: table === "daily_challenges" ? { target_title: "Target" } : table === "wiki_pages" ? { canonical_title: "Target" } : null, error: null }; },
      insert(row) { inserted = row; return this; },
      async single() { return { data: inserted, error: null }; },
    };
    return query;
  } };
  const source = read("supabase/functions/single-run/index.ts").replace(/^import[^\n]*\n/, "");
  const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;
  new Function("createClient", "Deno", compiled)(() => db, { env: { get: () => "local-unit-test" }, serve: fn => { handler = fn; } });
  const response = await handler(new Request("http://localhost/single-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", guestToken: "g".repeat(64), run: { runId: "unit-run", runMode, start: { pageId: "s", revisionId: "1", title: "Start" }, target: { pageId: "t", title: targetTitle } } }) }));
  return { response, body: await response.json(), inserted };
}

for (const mode of ["random", "custom", "daily"]) {
  test(`guest create stores ${mode} and never assigns a member user`, async () => {
    const { response, inserted } = await guestCreate(mode);
    assert.equal(response.status, 200);
    assert.equal(inserted.run_mode, mode);
    assert.equal(inserted.user_id, null);
    assert.equal(typeof inserted.guest_token_hash, "string");
    assert.equal(mode === "daily", inserted.daily_challenge_date !== null);
  });
}

test("guest create rejects unknown mode and mismatched daily course before INSERT", async () => {
  for (const [mode, target, code] of [["other", "Target", "RUN_MODE_REQUIRED"], ["daily", "Fake", "DAILY_COURSE_MISMATCH"]]) {
    const outcome = await guestCreate(mode, target);
    assert.equal(outcome.response.status, 400);
    assert.equal(outcome.body.code, code);
    assert.equal(outcome.inserted, undefined);
  }
});

test("new run creation sends mode only, never XP; daily has its own entry", () => {
  const service = read("services/singleGameService.js");
  assert.match(service, /p_run_mode: runMode/);
  assert.doesNotMatch(service, /p_(xp|amount|base_amount):/);
  const page = read("pages/GamePage.jsx");
  assert.match(page, /runMode: mode/);
  assert.match(page, /mode === "custom" \|\| mode === "daily"/);
  assert.match(page, /target: targetData, runMode/);
  assert.match(read("pages/MainPage.jsx"), /mode: "daily",\s*keyword: dailyChallenge.keyword/);
});

test("server validates daily course and copies mode before result XP/achievement triggers", () => {
  assert.match(sql, /DAILY_COURSE_MISMATCH/);
  assert.match(sql, /p.page_id = p_target_page_id/);
  assert.match(sql, /before insert on public.game_records/);
  assert.match(sql, /into new.run_mode, new.daily_challenge_date/);
  assert.match(sql, /from public.single_game_runs run where run.id = new.run_id/);
  assert.match(sql, /if v_record.run_mode is not null/);
  assert.doesNotMatch(sql, /update public.(game_records|single_game_runs)|grant_result_xp_v1\(/);
});

test("server amounts match the XP catalogue, random repeats have no invented course cap", () => {
  for (const source of ["single_random_finish", "daily_course_first_finish"]) {
    const match = sql.match(new RegExp(`when '${source}' then (\\d+)`));
    assert.equal(Number(match?.[1]), XP_BY_SOURCE_TYPE[source]);
  }
  assert.match(sql, /else 15 end/);
  assert.equal(XP_BY_SOURCE_TYPE.single_target_first_finish, 15);
  assert.match(sql, /v_source_type := 'single_random_finish';\s*v_already := false/);
  assert.match(sql, /ledger.source_type = 'single_target_first_finish'/);
  assert.match(sql, /ledger.source_type = 'daily_course_first_finish'/);
  assert.match(sql, /v_record.user_id is null/);
});

test("M2 only revokes audited unused permissions and leaves analytics INSERT/profile UPDATE", () => {
  const m2 = read("supabase/migrations/20261006000302_security_privilege_cleanup_v1.sql").replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(m2, /\b(drop|delete|update|insert)\s+(table|function|policy|into|from|public\.)|\bgrant\b/i);
  assert.match(m2, /revoke insert, delete on table public.profiles/);
  assert.match(m2, /revoke update, delete on table public.analytics_events/);
  assert.doesNotMatch(m2, /revoke insert[^;]*analytics_events/);
  assert.match(m2, /revoke all on sequence public.target_candidates_id_seq/);
});

test("guest mode reaches the server row without creating persistent guest results", () => {
  const edge = read("supabase/functions/single-run/index.ts");
  assert.equal((edge.match(/const runMode =/g) || []).length, 1);
  assert.match(edge, /run_mode: runMode/);
  assert.match(edge, /user_id: null/);
  assert.doesNotMatch(edge, /from\("(xp_ledger|game_records)"\)\.insert/);
});

test("random result UI uses ledger amounts, not a client mode formula", () => {
  const result = buildResultXpView({ scope: "single", entries: [{ sourceType: "single_random_finish", amount: 20, baseAmount: 20 }] });
  assert.equal(result.totalAmount, 20);
  assert.equal(result.lines[0].gain, "+20 XP");
  // A different ledger amount must still be rendered verbatim.
  assert.equal(buildResultXpView({ scope: "single", entries: [{ sourceType: "single_random_finish", amount: 7 }] }).totalAmount, 7);
  const display = read("utils/xpResultDisplay.js");
  assert.match(display, /single_random_finish/);
  assert.doesNotMatch(read("pages/GamePage.jsx"), /run_mode\s*===\s*["']random["']\s*\?\s*20/);
});
