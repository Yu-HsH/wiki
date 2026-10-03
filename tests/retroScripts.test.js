import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// 16b-r: the production files are pasted into the Supabase SQL Editor. The apply file must run exactly
// what the dry-run verified — a drift between the two would apply something nobody reviewed.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const dryRun = read("scripts/16b-r-retro-dryrun.sql");
const apply = read("scripts/16b-r-retro-apply.sql");

const BODY_START = "-- >>> 16b-r BODY";
const BODY_END = "-- <<< 16b-r BODY";
function split(source) {
  const start = source.indexOf(BODY_START);
  const end = source.indexOf(BODY_END);
  assert.ok(start > 0 && end > start, "body markers present, in order");
  assert.equal(source.indexOf(BODY_START, start + 1), -1, "one body only");
  return {
    head: source.slice(0, start),
    body: source.slice(start, end + BODY_END.length),
    tail: source.slice(end + BODY_END.length),
  };
}

test("16b-r: dry-run and apply share the same body, character for character", () => {
  assert.equal(split(apply).body, split(dryRun).body);
});

test("16b-r: the only difference after the body is the apply flag", () => {
  const dryTail = split(dryRun).tail;
  const applyTail = split(apply).tail;
  assert.match(dryTail, /select \* from pg_temp\.retro_16b_r\(false\);\s*$/);
  assert.match(applyTail, /select \* from pg_temp\.retro_16b_r\(true\);\s*$/);
  assert.equal(applyTail.replace("retro_16b_r(true)", "retro_16b_r(false)"), dryTail);
});

test("16b-r: the apply file warns that it runs only after an approved dry-run", () => {
  const head = split(apply).head;
  assert.match(head, /APPLY/);
  assert.match(head, /16b-r-retro-dryrun.sql 의 보고를 사용자가 확인·승인한 뒤에만 실행한다/);
  assert.match(head, /백업/);
  assert.doesNotMatch(split(dryRun).head, /APPLY\. 운영 데이터에/);
});

test("16b-r: SQL Editor safe — no psql meta-commands, the report is the last statement", () => {
  for (const source of [dryRun, apply]) {
    assert.doesNotMatch(source, /^\s*\\/m, "no \\set / \\if / \\echo");
    assert.doesNotMatch(source, /^\s*(begin|commit|rollback)\s*;/im, "no statement-level transaction control after the report");
    const statements = source.trim().split(/;\s*$/m).filter((part) => part.trim() && !/^\s*(--[^\n]*\n?\s*)*$/.test(part));
    assert.match(statements.at(-1), /select \* from pg_temp\.retro_16b_r\((true|false)\)/);
  }
});

test("16b-r: dry-run rolls back through the sentinel; other errors still surface", () => {
  const { body } = split(dryRun);
  assert.match(body, /if not p_apply then\s+raise exception '16B_R_DRY_RUN_ROLLBACK';/);
  assert.match(body, /exception when raise_exception then\s+if sqlerrm <> '16B_R_DRY_RUN_ROLLBACK' then\s+raise;/);
});

test("16b-r: scope — retroactive only, server-authority evidence only (판정 8, 1:1·그룹 포함)", () => {
  const { body } = split(dryRun);
  assert.match(body, /definition\.retro_policy = 'retroactive'/);
  assert.match(body, /record\.run_id is not null/);
  assert.match(body, /event\.scope = 'duel' and event\.game_id = match\.room_id/);
  assert.match(body, /event\.scope = 'group' and event\.game_id = room\.id/);
  assert.match(body, /match\.id not in \(select result_id from retro_excluded where scope = 'duel'\)/);
  assert.match(body, /room\.id not in \(select result_id from retro_excluded where scope = 'group'\)/);
  assert.match(body, /'retro', null, now\(\)\)/, "grants as source retro with no result id");
});

test("16b-r: the report carries every item the operator asked for", () => {
  const { body } = split(dryRun);
  for (const item of [
    "사용자별 해금 수 분포", "업적별 해금", "XP 합계", "레벨 상승 분포",
    "이동 이벤트 없는 1:1 결과", "이동 이벤트 없는 그룹 결과", "소요 ms", "실패",
  ]) {
    assert.ok(body.includes(item), item);
  }
});
