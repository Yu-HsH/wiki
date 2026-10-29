import assert from "node:assert/strict";
import test from "node:test";
import { getKstCourseDate, getKstWeekRange, requireDailyCourse } from "../utils/dailyCourse.js";
import { fetchRankings } from "../rankingService.js";

const date = new Date("2026-10-08T15:00:00Z");
const course = { source: "supabase", challengeDate: "2026-10-09", startTitle: "고정 시작", keyword: "고정 목표" };
test("weekly display changes at Monday midnight KST", () => {
  assert.equal(getKstWeekRange(new Date("2026-10-11T14:59:59Z")), "2026-10-05 ~ 2026-10-11 (KST)");
  assert.equal(getKstWeekRange(new Date("2026-10-11T15:00:00Z")), "2026-10-12 ~ 2026-10-18 (KST)");
});
test("daily creation uses both server titles at KST midnight", () => {
  assert.equal(getKstCourseDate(new Date("2026-10-08T14:59:59Z")), "2026-10-08");
  assert.deepEqual(requireDailyCourse(course, { date }), { startTitle: "고정 시작", targetTitle: "고정 목표" });
});
test("stale dates, missing start and fallback cannot become online daily", () => {
  for (const value of [{ ...course, challengeDate: "2026-10-08" }, { ...course, startTitle: null }, { ...course, source: "fallback" }]) {
    assert.throws(() => requireDailyCourse(value, { date }));
  }
  assert.doesNotThrow(() => requireDailyCourse({ ...course, source: "fallback" }, { online: false, date }));
});
test("daily ranking delegates filtering, best record and ordering to RPC", async () => {
  const calls = [];
  const query = { select() { return this; }, order() { return this; }, limit() { return this; }, gte() { return this; }, eq() { return this; }, is() { return this; } };
  const client = { from: () => query, async rpc(name, args) { calls.push([name, args]); return { data: [], error: null }; } };
  assert.deepEqual(await fetchRankings({ period: "daily", limit: 12, client }), []);
  assert.deepEqual(calls, [["get_daily_course_rankings_contract_v1", { p_limit: 12, p_contract: 'single_reserved_prefetch_v1' }]]);
  client.rpc = async () => ({ error: new Error("server unavailable") });
  await assert.rejects(fetchRankings({ period: "daily", client }), /server unavailable/);
});

test('ranking normalization preserves the run and measurement cohort returned by the server', async () => {
  const row={id:'record-1',run_id:'run-1',timing_contract:'single_reserved_prefetch_v1',user_id:null,elapsed_seconds:3,click_count:2};
  const query={select(){return this;},order(){return this;},limit(){return this;},gte(){return this;},eq(){return this;},is(){return this;}};
  const client={from:()=>query,rpc:async()=>({data:[row],error:null})};
  const [current]=await fetchRankings({period:'daily',client});
  assert.equal(current.runId,'run-1');assert.equal(current.timingContract,'single_reserved_prefetch_v1');
  row.timing_contract=null;
  const [previous]=await fetchRankings({period:'daily',client,timingContract:null});
  assert.equal(previous.runId,'run-1');assert.equal(previous.timingContract,null);
});
