import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchRankings } from "../rankingService.js";

const sql = readFileSync(new URL("../supabase/migrations/20261104090000_daily_dynamic_word_pairs_v1.sql", import.meta.url), "utf8");

function fakeRankingClient() {
  const calls = [];
  const query = {
    select() { return this; },
    order() { return this; },
    limit() { return this; },
    eq(column, value) { calls.push(["eq",column,value]); return this; },
    is(column, value) { calls.push(["is",column,value]); return this; },
    in(column, values) { calls.push(["in",column,values]); return this; },
    gte(column, value) { calls.push(["gte",column,value]); return this; },
    then(resolve) { resolve({data:[],error:null}); },
  };
  return { calls, from(table) { assert.equal(table,"game_records"); return query; } };
}

test("today free exploration excludes daily mode before limit; official daily remains separate", async () => {
  const client = fakeRankingClient();
  await fetchRankings({period:"today_runs",limit:3,client});
  assert.deepEqual(client.calls.filter(call=>call[0]==="in"),[["in","run_mode",["random","custom"]]]);
  assert.ok(client.calls.some(call=>call[0]==="gte" && call[1]==="created_at"));
});

test("new daily pairing draws only existing active words and checks both snapshot links", () => {
  assert.match(sql,/from public\.daily_challenge_pool p\s+where p\.is_active/);
  assert.match(sql,/src_word\.title as start_title, dst_word\.title as target_title/);
  assert.match(sql,/first_link\.snapshot_id = src\.id/);
  assert.match(sql,/second_link\.snapshot_id = mid\.id/);
  assert.match(sql,/second_link\.target_title_snapshot/);
  assert.match(sql,/interval '30 days'/);
});

test("existing daily identity and history remain intact; recent pairs are deprioritized", () => {
  assert.match(sql,/if found then[\s\S]*?return query select c\.challenge_date/);
  assert.match(sql,/previous\.challenge_date >= v_day - 7/);
  assert.match(sql,/order by c\.recently_used, c\.source_rank, random\(\)/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.(daily_challenges|game_records|xp_ledger)/i);
  assert.doesNotMatch(sql,/truncate\s+table/i);
});
