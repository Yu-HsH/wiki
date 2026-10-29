import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationTransport, selectRandomCourse } from '../supabase/functions/single-run/random.mjs';
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
    assert.equal(url.searchParams.get('grnnamespace'), '0'); assert.equal(url.searchParams.get('prop'), 'info|revisions');
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
