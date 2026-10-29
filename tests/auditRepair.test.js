import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceErrorMessage, singleStartFailure } from '../utils/serviceError.js';
import { fetchSinglePlayerStats } from '../services/profileStatsService.js';
import { fetchSingleGameRecords, fetchRankings } from '../rankingService.js';
import { handleSingleStart } from '../supabase/functions/single-run/start.mjs';

test('Edge retains missing RPC diagnostics for contract mismatch classification', async () => {
  await assert.rejects(handleSingleStart(new Request('http://localhost'), {
    action:'allocate', actor:'guest', guestToken:'g'.repeat(64), requestId:crypto.randomUUID(), mode:'daily',
  }, { db:{ rpc:async () => ({error:{code:'PGRST202',message:'missing function',hint:'check migration'}}) }, sha256:async () => 'a'.repeat(64) }), error => error.code === 'PGRST202' && error.rpc === 'claim_single_course_v1' && error.hint === 'check migration');
});

test('single Edge non-2xx body is diagnosed without exposing server internals to the player', async () => {
  const diagnostic = { ok: false, code: 'SINGLE_RUN_FAILED', message: 'public.claim_single_course_v1 missing' };
  const response = new Response(JSON.stringify(diagnostic), { status: 502 });
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const error = await singleStartFailure({ context: response });
    assert.equal(error.code, 'SINGLE_RUN_FAILED');
    assert.doesNotMatch(error.message, /public\.|claim_single|non-2xx/);
    assert.match(error.message, /다시 시도/);
    assert.deepEqual(logs[0][1].response, diagnostic);
    assert.equal(response.bodyUsed, false, 'diagnostics must not consume original response');
  } finally { console.error = original; }
});

test('missing schema and authorization failures have readable, distinct messages', () => {
  assert.match(serviceErrorMessage({ code: '42703' }, '전적'), /서버 준비/);
  assert.match(serviceErrorMessage({ code: 'PGRST202' }, '랭킹'), /랭킹/);
  assert.match(serviceErrorMessage({ status: 401 }), /로그인/);
});

test('failed single statistics reject instead of returning a successful zero', async () => {
  const error = { code: '42703', message: 'column timing_contract missing' };
  const query = { select() { return this; }, order() { return this; }, eq() { return this; }, then(resolve) { return Promise.resolve({ data: null, error }).then(resolve); } };
  const original = console.error; console.error = () => {};
  try { await assert.rejects(fetchSinglePlayerStats('member-a', { client: { from: () => query } }), value => value === error); }
  finally { console.error = original; }
});

test('offline history remains readable and ranking separates timing cohorts', async () => {
  const original = globalThis.localStorage;
  const record = { id: 'legacy', user_id: 'member-a', elapsed_seconds: 10, click_count: 1, created_at: '2026-10-29T00:00:00Z' };
  globalThis.localStorage = { getItem: () => JSON.stringify([record]) };
  try {
    assert.equal((await fetchSingleGameRecords({ userId: 'member-a' })).length, 1);
    assert.equal((await fetchRankings({ timingContract: null })).length, 1);
    assert.equal((await fetchRankings()).length, 0);
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
