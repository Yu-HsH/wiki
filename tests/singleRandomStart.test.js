import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationTransport, selectRandomCourse, isDisambiguationPage } from '../supabase/functions/single-run/random.mjs';
import { handleSingleStart } from '../supabase/functions/single-run/start.mjs';
import { saveGuestSingleGameSession, readGuestSingleGameSession } from '../utils/singleGameSession.js';

const page = (id, extra = {}) => ({ pageid: id, ns: 0, title: '문서 ' + id, revisions: [{ revid: id + 100 }], ...extra });
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
function fixture(sequence = [page(1), page(2)], { snapshot, status } = {}) {
  const calls = [], draws = [...sequence];
  const fetcher = async (address, options) => {
    calls.push({ url: new URL(address), options });
    if (status) return new Response('', { status });
    if (address.includes('/wiki-snapshot')) {
      const body = JSON.parse(options.body);
      return response(snapshot?.(body) ?? { snapshotId: crypto.randomUUID(), pageId: body.pageId, revisionId: body.revisionId, canonicalTitle: body.title });
    }
    return response({ query: { pages: [draws.shift() ?? sequence.at(-1)] } });
  };
  return { fetcher, calls, options: { fetcher, url: 'http://127.0.0.1:55421', serviceKey: 'test-only' } };
}
test('random draws two independent namespace-0 identities and pins both exact revisions', async () => {
  const f = fixture(), course = await selectRandomCourse(f.options);
  assert.equal(course.start.pageId, '1'); assert.equal(course.goal.pageId, '2');
  assert.equal(course.start.namespace, 0); assert.equal(course.goal.namespace, 0);
  const draws = f.calls.filter(call => !call.url.pathname.endsWith('wiki-snapshot'));
  assert.equal(draws.length, 2);
  for (const { url, options } of draws) {
    assert.equal(url.searchParams.get('generator'), 'random'); assert.equal(url.searchParams.get('grnlimit'), '1');
    assert.equal(url.searchParams.get('grnnamespace'), '0'); assert.equal(url.searchParams.get('prop'), 'info|revisions|pageprops');
    assert.equal(url.searchParams.get('ppprop'), 'disambiguation');
    assert.ok(options.headers['User-Agent']); assert.ok(options.signal);
  }
  assert.deepEqual(f.calls.filter(call=>call.options.body).map(call=>JSON.parse(call.options.body)), [
    { title:'문서 1', pageId:'1', revisionId:'101' }, { title:'문서 2', pageId:'2', revisionId:'102' },
  ]);
});
test('invalid identities and duplicate canonical IDs retry within the same shared attempt count', async () => {
  const f=fixture([page(8,{ns:1}),page(9,{missing:true}),page(3,{invalid:true}),page(4,{revisions:[]}),page(5,{pageid:-1}),page(1),page(1,{title:'같은 ID의 별칭'}),page(2)]);
  const course=await selectRandomCourse(f.options);
  assert.equal(course.start.pageId,'1');assert.equal(course.goal.pageId,'2');
  assert.equal(f.calls.filter(call=>call.options.body).length,2);
  assert.equal(f.calls.filter(call=>!call.options.body).length,8);
});
for(const mismatch of ['pageId','revisionId','canonicalTitle','snapshotId'])test('snapshot '+mismatch+' mismatch cannot become the final course',async()=>{
  let first=true;
  const f=fixture([page(1),page(2),page(3)],{snapshot:body=>{
    const result={snapshotId:'s',pageId:body.pageId,revisionId:body.revisionId,canonicalTitle:body.title};
    if(first){first=false;result[mismatch]=mismatch==='snapshotId'?null:'wrong';}return result;
  }});
  const course=await selectRandomCourse(f.options);assert.equal(course.start.pageId,'2');assert.equal(course.goal.pageId,'3');
});
test('a valid departure is retained and duplicate targets exhaust at twelve total draws',async()=>{
  const f=fixture([page(1)]);await assert.rejects(selectRandomCourse(f.options),{code:'RANDOM_DOCUMENT_UNAVAILABLE'});
  assert.equal(f.calls.filter(call=>!call.options.body).length,12);assert.equal(f.calls.filter(call=>call.options.body).length,1);
});
for(const status of [429,500,503])test('HTTP '+status+' fails without rerolling',async()=>{
  const f=fixture(undefined,{status});await assert.rejects(selectRandomCourse(f.options),{code:'RANDOM_DOCUMENT_UNAVAILABLE'});assert.equal(f.calls.length,1);
});
test('network errors and API errors do not reroll',async()=>{
  for(const fetcher of [async()=>{throw Error('offline');},async()=>response({error:{code:'maxlag'}})]){
    let count=0;await assert.rejects(selectRandomCourse({url:'http://local',serviceKey:'test',fetcher:async(...args)=>{count++;return fetcher(...args);}}),{code:'RANDOM_DOCUMENT_UNAVAILABLE'});assert.equal(count,1);
  }
});
test('body reads consume the total monotonic budget and an expired identity never commits',async()=>{
  let now=0;
  const transport=allocationTransport(async()=>({ok:true,json:async()=>{now=29000;return{query:{pages:[page(1)]}};}}),{now:()=>now});
  await assert.rejects(selectRandomCourse({transport}),{code:'ALLOCATION_EXPIRED'});
});
test('unresponsive JSON body and abort-ignoring fetch are bounded by remaining total time',async()=>{
  for(const fetcher of [async()=>({ok:true,json:()=>new Promise(()=>{})}),()=>new Promise(()=>{})]){
    const began=performance.now();const transport=allocationTransport(fetcher,{totalMs:35,requestMs:12000});
    await assert.rejects(transport.json('http://local'),error=>['ALLOCATION_EXPIRED','RANDOM_DOCUMENT_UNAVAILABLE'].includes(error.code));
    assert.ok(performance.now()-began<500,'body and fetch are bounded');
  }
});
test('per-request timeout aborts transport before the longer total budget',async()=>{
  let signal;const transport=allocationTransport(async(_url,options)=>{signal=options.signal;return new Promise(()=>{});},{totalMs:1000,requestMs:20});
  await assert.rejects(transport.json('http://local'),{code:'RANDOM_DOCUMENT_UNAVAILABLE'});assert.equal(signal.aborted,true);
});
function edgeOptions(f, rpc) { return { ...f.options, db:{rpc}, sha256:async()=> 'a'.repeat(64),json:(data,status=200)=>new Response(JSON.stringify(data),{status}) }; }
const request = patch => ({action:'allocate',actor:'guest',guestToken:'g'.repeat(64),requestId:crypto.randomUUID(),mode:'random',...patch});
test('Edge commits server-owned random identities and does not read candidate or daily data',async()=>{
  const f=fixture(),calls=[];
  const result=await handleSingleStart(new Request('http://local'),request(),edgeOptions(f,async(name,args)=>{
    calls.push({name,args});return{data:name==='claim_single_course_v1'?{code:'SELECT_COURSE',mode:'random',allocationId:'allocation'}:{ok:true,run:{id:'run'}}};
  }));
  assert.equal((await result.json()).ok,true);assert.deepEqual(calls.map(call=>call.name),['claim_single_course_v1','commit_single_course_v1']);
  assert.equal(calls[1].args.p_start.namespace,0);assert.equal(calls[1].args.p_goal.revisionId,'102');
});
test('a failed random lookup cannot commit a run under the new timing contract',async()=>{
  const f=fixture(undefined,{status:429}),calls=[];
  const result=await handleSingleStart(new Request('http://local'),request(),edgeOptions(f,async name=>{
    calls.push(name);return{data:{code:'SELECT_COURSE',mode:'random',allocationId:'allocation'}};
  }));
  assert.deepEqual(await result.json(),{ok:false,code:'RANDOM_DOCUMENT_UNAVAILABLE'});assert.deepEqual(calls,['claim_single_course_v1']);
});
for(const code of ['ALLOCATION_PENDING','ALLOCATED','ALLOCATION_EXPIRED','COURSE_ALLOCATION_LIMIT'])test('Edge '+code+' never makes a new external draw',async()=>{
  const f=fixture();const result=await handleSingleStart(new Request('http://local'),request(),edgeOptions(f,async()=>({data:{code}})));
  assert.equal((await result.json()).code,code);assert.equal(f.calls.length,0);
});
test('random rejects forged course/difficulty/time fields before claiming',async()=>{
  for(const patch of [{customTarget:'forced'},{start:{pageId:'1'}},{difficulty:'easy'},{scheduled_start_at:'future'},{target:'forced'}]){
    const f=fixture();let calls=0;
    const result=await handleSingleStart(new Request('http://local'),request(patch),edgeOptions(f,async()=>{calls++;}));
    assert.equal(result.status,400);assert.equal(calls,0);
  }
});
test('guest random preparation is recoverable before titles exist',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const guestToken='g'.repeat(64),allocationRequestId=crypto.randomUUID();
  assert.ok(saveGuestSingleGameSession({phase:'PREPARING',timingContract:'single_reserved_prefetch_v1',allocationRequestId,guestToken,target:{mode:'random',title:''}},storage));
  assert.equal(readGuestSingleGameSession(storage).guestToken,guestToken);assert.equal(readGuestSingleGameSession(storage).allocationRequestId,allocationRequestId);
});
for(const field of ['pageId','revisionId','canonicalTitle'])test('prepared random document rejects '+field+' identity mismatch before returning HTML',async()=>{
  const run={id:crypto.randomUUID(),status:'prepared',run_mode:'random',current_page_id:'1',current_revision_id:'101',current_title_snapshot:'문서 1'};
  const page={pageId:'1',revisionId:'101',canonicalTitle:'문서 1',documentHtml:'<p>본문</p>',[field]:'wrong'};
  await assert.rejects(handleSingleStart(new Request('http://local'),{action:'document',actor:'guest',guestToken:'g'.repeat(64),runId:run.id},{
    db:{rpc:async()=>({data:{ok:true,run}})},sha256:async()=> 'a'.repeat(64),json:data=>response(data),fetcher:async()=>response(page),url:'http://local',serviceKey:'test',
  }),/COURSE_IDENTITY_MISMATCH/);
});
test('random deadline is shared across draws and snapshots rather than renewed per request',async()=>{
  let now=0,calls=0;
  const f=fixture();const transport=allocationTransport(async(...args)=>{calls++;now+=10000;return f.fetcher(...args);},{now:()=>now});
  await assert.rejects(selectRandomCourse({...f.options,transport}),{code:'ALLOCATION_EXPIRED'});assert.equal(calls,3);
});


test('MediaWiki empty-string disambiguation property is detected by PRESENCE, not truthiness', () => {
  assert.equal(isDisambiguationPage({ pageprops: { disambiguation: '' } }), true);
  assert.equal(isDisambiguationPage({ pageprops: { disambiguation: true } }), true);
  assert.equal(isDisambiguationPage({ pageprops: { description: 'article' } }), false);
  assert.equal(isDisambiguationPage({}), false);
  assert.equal(isDisambiguationPage(null), false);
});

test('an automatically drawn disambiguation START is accepted, a GOAL is redrawn before snapshot', async () => {
  const f = fixture([
    page(1, { title: '화성 (동음이의)', pageprops: { disambiguation: '' } }),
    page(2, { title: '덕곡면', pageprops: { disambiguation: '' } }),
    page(3, { title: '덕곡면 (합천군)' }),
  ]);
  const { start, goal } = await selectRandomCourse(f.options);
  assert.equal(start.canonicalTitle, '화성 (동음이의)');
  assert.equal(goal.canonicalTitle, '덕곡면 (합천군)');
  assert.equal(f.calls.filter(c => c.url.hostname === 'ko.wikipedia.org').length, 3);
  const snapshots = f.calls.filter(c => c.url.pathname.endsWith('/wiki-snapshot'));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.map(c => JSON.parse(c.options.body).title), [
    '화성 (동음이의)', '덕곡면 (합천군)',
  ]);
});

test('goal rerolls share twelve total tries without exhausting extra snapshot or remote requests', async () => {
  const disambiguation = page(2, { title: '포니아토프스키', pageprops: { disambiguation: '' } });
  const f = fixture([page(1), ...Array.from({ length: 11 }, () => disambiguation)]);
  await assert.rejects(selectRandomCourse(f.options), { code: 'RANDOM_DOCUMENT_UNAVAILABLE' });
  assert.equal(f.calls.filter(c => c.url.hostname === 'ko.wikipedia.org').length, 12);
  assert.equal(f.calls.filter(c => c.url.pathname.endsWith('/wiki-snapshot')).length, 1);
});

test('the API declaring pageprops but omitting it for an ordinary goal does not cause false rejection', async () => {
  const f = fixture([page(1), page(2, { pageprops: {} })]);
  const course = await selectRandomCourse(f.options);
  assert.equal(course.goal.pageId, '2');
  assert.equal(f.calls.filter(c => c.url.hostname === 'ko.wikipedia.org').length, 2);
});

test('the guest Edge random allocation commits a non-disambiguation goal and preserves disambiguation start', async () => {
  const f = fixture([
    page(1, { pageprops: { disambiguation: '' } }),
    page(2, { pageprops: { disambiguation: '' } }),
    page(3),
  ]);
  const calls = [];
  const result = await handleSingleStart(new Request('http://local'), request(), edgeOptions(f, async (name, args) => {
    calls.push({ name, args });
    return { data: name === 'claim_single_course_v1'
      ? { code: 'SELECT_COURSE', mode: 'random', allocationId: 'allocation' }
      : { ok: true, run: { id: 'run' } } };
  }));
  assert.equal((await result.json()).ok, true);
  assert.deepEqual(calls.map(x => x.name), ['claim_single_course_v1', 'commit_single_course_v1']);
  assert.equal(calls[1].args.p_start.pageId, '1');
  assert.equal(calls[1].args.p_goal.pageId, '3');
});

test('automatically rejected goals do not extend the monotonic allocation budget', async () => {
  let now = 0;
  const f = fixture([
    page(1), page(2, { pageprops: { disambiguation: '' } }), page(3),
  ]);
  const transport = allocationTransport(async (...args) => {
    now += 6000;
    return f.fetcher(...args);
  }, { now: () => now, totalMs: 29000 });
  await assert.rejects(selectRandomCourse({ ...f.options, transport }), { code: 'ALLOCATION_EXPIRED' });
  // Draw 1 + snapshot 1 + draw 2(disambiguation) + draw 3 passes 24s,
  // snapshot 3 moves the shared clock beyond 29s: no final course commits.
  assert.equal(f.calls.filter(c => c.url.hostname === 'ko.wikipedia.org').length, 3);
});

test('random allocation uses one identity query per draw; no new sequential pageprops lookup', async () => {
  const f = fixture([
    page(1), page(2, { pageprops: { disambiguation: '' } }), page(3),
  ]);
  const course = await selectRandomCourse(f.options);
  assert.equal(course.goal.pageId, '3');
  const calls = f.calls;
  assert.equal(calls.length, 5);
  assert.equal(calls.filter(c => c.url.hostname === 'ko.wikipedia.org').length, 3);
  for (const c of calls.filter(c => c.url.hostname === 'ko.wikipedia.org')) {
    assert.equal(c.url.searchParams.get('prop'), 'info|revisions|pageprops');
    assert.equal(c.url.searchParams.get('ppprop'), 'disambiguation');
  }
});


test('user-specified custom disambiguation goal is kept; only random auto goals are filtered', async () => {
  const wikiCalls=[], commits=[];
  const fetcher=async(address,options={})=>{
    const u=String(address);
    wikiCalls.push(u);
    if(u.endsWith('/wiki-snapshot')){
      const body=JSON.parse(options.body);
      return response({snapshotId:'s-'+body.title,pageId:body.title==='덕곡면'?'11':'22',revisionId:'33',canonicalTitle:body.title});
    }
    return response({query:{random:[{title:'출발 문서'}]}});
  };
  const edge={
    url:'http://127.0.0.1:55421',serviceKey:'test-only',fetcher,
    sha256:async()=>'a'.repeat(64),json:(data,status=200)=>new Response(JSON.stringify(data),{status}),
    db:{rpc:async(name,args)=>{
      if(name==='claim_single_course_v1')return {data:{code:'SELECT_COURSE',mode:'custom',target:'덕곡면',allocationId:'allocation'}};
      if(name==='commit_single_course_v1'){commits.push(args);return {data:{ok:true}};}
      throw Error('Unexpected RPC '+name);
    }}
  };
  const reply=await handleSingleStart(new Request('http://local'),request({mode:'custom',customTarget:'덕곡면'}),edge);
  assert.equal((await reply.json()).ok,true);
  assert.equal(commits.length,1);
  assert.equal(commits[0].p_goal.canonicalTitle,'덕곡면');
  assert.equal(wikiCalls.filter(x=>x.includes('wiki-snapshot')).length,2);
});

test('an already server-selected daily goal is never redrawn or silently changed by random goal policy', async () => {
  const commits=[],snapshotTitles=[];
  const edge={
    url:'http://127.0.0.1:55421',serviceKey:'test-only',
    sha256:async()=>'a'.repeat(64),json:(data,status=200)=>new Response(JSON.stringify(data),{status}),
    fetcher:async(address,options={})=>{
      if(!String(address).includes('/wiki-snapshot'))throw Error('No new random API call permitted for daily');
      const body=JSON.parse(options.body);snapshotTitles.push(body.title);
      return response({snapshotId:'s-'+body.title,pageId:body.title==='섹시'?'11':'22',revisionId:'33',canonicalTitle:body.title});
    },
    db:{rpc:async(name,args)=>{
      if(name==='claim_single_course_v1')return {data:{code:'SELECT_COURSE',mode:'daily',allocationId:'allocation'}};
      if(name==='ensure_today_daily_challenge')return {data:[{start_title:'출발 문서',target_title:'섹시',challenge_date:'2026-11-07'}]};
      if(name==='commit_single_course_v1'){commits.push(args);return {data:{ok:true}};}
      throw Error('Unexpected RPC '+name);
    }}
  };
  const reply=await handleSingleStart(new Request('http://local'),request({mode:'daily'}),edge);
  assert.equal((await reply.json()).ok,true);
  assert.deepEqual(snapshotTitles,['섹시','출발 문서']);
  assert.equal(commits[0].p_goal.canonicalTitle,'섹시');
});
