import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleServerClock, singleServerElapsed, singleStartFrame, singleStartVisualTime, singleReverseLeafFrame } from '../utils/singleStart.js';
import { handleSingleStart } from '../supabase/functions/single-run/start.mjs';
import { saveGuestSingleGameSession, readGuestSingleGameSession } from '../utils/singleGameSession.js';

test('reserved clock ignores client wall clock changes and uses response receipt as a lower bound', () => {
  let monotonic = 12; const clock = createSingleServerClock('2026-10-15T00:00:00Z', () => monotonic);
  monotonic += 9000; assert.equal(clock(), Date.parse('2026-10-15T00:00:09Z'));
  monotonic -= 10000; assert.equal(clock(), Date.parse('2026-10-15T00:00:00Z'));
});
test('integer timeline changes exactly at 8100 and 8600, without prototype float drift', () => {
  assert.equal(singleStartFrame(8099).count, '1'); assert.equal(singleStartFrame(8100).count, '시작!');
  assert.equal(singleStartFrame(8599).phase, 'countdown'); assert.equal(singleStartFrame(8600).phase, 'article');
});

test('legacy journal shows goal before rewind and start before countdown, within 2600ms', () => {
  const frames=Array.from({length:2601},(_,ms)=>singleStartFrame(singleStartVisualTime(ms,2600)));
  assert.deepEqual([...new Set(frames.map(frame=>frame.phase))],['opening','target','rewind','start','countdown','article']);
  assert.equal(singleStartFrame(720).phase,'target');
  assert.equal(singleStartFrame(4000).phase,'start');
  assert.deepEqual([...new Set(frames.filter(frame=>frame.count).map(frame=>frame.count))],['3','2','1','시작!']);
  assert.equal(frames[2599].phase,'countdown');assert.equal(frames[2600].phase,'article');
  for(const ms of [0,720,2900,4000,6000,8100,8600])assert.equal(singleStartVisualTime(ms),ms,'reserved server timeline is untouched');
});
test('elapsed never subtracts animation; completed guest uses immutable server finish', () => {
  const run = { scheduled_start_at: '2026-10-15T00:00:09.100Z' };
  assert.equal(singleServerElapsed(run, Date.parse('2026-10-15T00:00:08Z')), 0);
  assert.equal(singleServerElapsed({ ...run, finished_at: '2026-10-15T00:00:12.900Z' }, Infinity), 3);
});
test('guest recovery persists allocation before any course identity is known', () => {
  const values = new Map(); const storage = { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) };
  const session = { phase: 'PREPARING', timingContract: 'single_reserved_prefetch_v1', allocationRequestId: crypto.randomUUID(), guestToken: 'g'.repeat(64), target: { mode:'daily',title:'' } };
  assert.ok(saveGuestSingleGameSession(session, storage)); assert.equal(readGuestSingleGameSession(storage).allocationRequestId, session.allocationRequestId);
});
test('guest F5 during countdown never regenerates the allocation token', () => {
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const guestToken='g'.repeat(64), allocationRequestId=crypto.randomUUID();
  saveGuestSingleGameSession({phase:'PREPARING',timingContract:'single_reserved_prefetch_v1',allocationRequestId,guestToken,target:{mode:'daily',title:'목표'}},storage);
  saveGuestSingleGameSession({phase:'COUNTDOWN',timingContract:'single_reserved_prefetch_v1',allocationRequestId,guestToken,startTitle:'출발',currentTitle:'출발',pathTitles:['출발'],clickCount:0,elapsedSeconds:0},storage);
  assert.equal(readGuestSingleGameSession(storage).guestToken,guestToken);
  assert.equal(readGuestSingleGameSession(storage).allocationRequestId,allocationRequestId);
});
test('new Edge rejects forged departure and time payloads before claiming a course', async () => {
  let calls = 0;
  const req = new Request('http://localhost/single-run');
  const response = await handleSingleStart(req, { action:'allocate', actor:'guest', guestToken:'g'.repeat(64), requestId:crypto.randomUUID(), mode:'custom', customTarget:'Goal', start:{ pageId:'forged' } },
    { db:{rpc(){calls++;}}, sha256:async()=> 'a'.repeat(64), json:(body,status=200)=>new Response(JSON.stringify(body),{status}) });
  assert.equal(response.status,400);assert.equal(calls,0);
});
test('new member Edge verifies real JWT identity rather than trusting actor payload', async () => {
  let calls=0;
  const response=await handleSingleStart(new Request('http://localhost'),{action:'allocate',actor:'member',requestId:crypto.randomUUID(),mode:'daily'},
    {db:{auth:{getUser:async()=>({error:new Error('expired')})},rpc(){calls++;}},json:(body,status=200)=>new Response(JSON.stringify(body),{status})});
  assert.equal(response.status,401);assert.equal(calls,0);
});

test('right-bound notebook returns pages backwards, bottom first and departure last', () => {
  const before=[0,1,2].map(i=>singleReverseLeafFrame(2800,i));
  assert.ok(before.every(leaf=>!leaf.visible));
  assert.ok(before.every(leaf=>leaf.angle===180));
  assert.equal(singleReverseLeafFrame(2900,2).visible,true);
  assert.equal(singleReverseLeafFrame(2900,1).visible,false);
  assert.equal(singleReverseLeafFrame(3340,0).visible,true);
  for (const index of [0,1,2]) {
    const start=2900+(2-index)*220,end=3520+(2-index)*220;
    assert.equal(singleReverseLeafFrame(start,index).angle,180);
    assert.equal(singleReverseLeafFrame(end,index).angle,0);
    assert.ok(singleReverseLeafFrame((start+end)/2,index).angle>0);
  }
  assert.equal(singleStartFrame(4000).phase,'start');
  assert.equal(singleStartFrame(8600).phase,'article');
});
