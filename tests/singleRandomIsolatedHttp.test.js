import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { handleSingleStart } from '../supabase/functions/single-run/start.mjs';

const mkPage=(id,extra={})=>({ pageid:id, ns:0, title:'문서 '+id, revisions:[{revid:id+1000}], ...extra });
const bodyJson = (data, status=200)=>new Response(JSON.stringify(data), {
  status, headers:{'content-type':'application/json'},
});
const GUEST='g'.repeat(64);
const allocation=(id=randomUUID(),actor='guest')=>({action:'allocate',actor,guestToken:actor==='guest'?GUEST:undefined,requestId:id,mode:'random'});

/**
 * Isolated staging-equivalent HTTP integration harness:
 * - REAL production handler and random allocator from the PR
 * - REAL HTTP requests to /single-run and local /wiki-snapshot
 * - in-memory claim/commit/control authority; NO hosted DB or service secrets
 * - deterministic MediaWiki responses unless explicitly injected
 *
 * This is NOT a deployed Supabase hosted Edge Runtime or real PostgreSQL RPC.
 */
async function startHarness({ sequence=[], wikiDelayMs=0, wikiStatus=null, wikiResponder=null, liveWiki=false }={}) {
  const calls={ wiki:[], wikiObserved:[], snapshot:[], claim:[], commit:[], control:[] };
  const store={ selected:null, pending:null, run:null };
  const draws=[...sequence]; let seq=10000;
  const db={
    auth:{getUser:async(token)=>token==='valid-member-token'
      ? {data:{user:{id:'member-01'}},error:null}
      : {data:{user:null},error:{message:'invalid token'}}},
    rpc:async(name,args)=>{
      if(name==='claim_single_course_v1'){
        calls.claim.push(args);
        if(store.run) return {data:{ok:true,code:'ALLOCATED',run:store.run}};
        if(store.pending) return {data:{ok:false,code:'ALLOCATION_PENDING'}};
        store.pending={id:'local-claim-'+randomUUID(),owner:args.p_guest_hash??args.p_user_id,requestId:args.p_request_id};
        return {data:{code:'SELECT_COURSE',mode:'random',allocationId:store.pending.id}};
      }
      if(name==='commit_single_course_v1'){
        calls.commit.push(args);
        if(args.p_allocation_id!==store.pending?.id) return {data:null,error:{message:'bad allocation id',code:'BAD_ALLOCATION'}};
        store.run={
          id:randomUUID(),status:'prepared',run_mode:'random',owner:store.pending.owner,
          start_page_id:args.p_start.pageId,start_revision_id:args.p_start.revisionId,
          start_title_snapshot:args.p_start.canonicalTitle,
          target_page_id:args.p_goal.pageId,target_revision_id:args.p_goal.revisionId,
          target_title_snapshot:args.p_goal.canonicalTitle,
          current_page_id:args.p_start.pageId,current_revision_id:args.p_start.revisionId,
          current_title_snapshot:args.p_start.canonicalTitle,
        };
        store.pending=null;
        return {data:{ok:true,code:'ALLOCATED',run:store.run}};
      }
      if(name==='control_single_start_v1'){
        calls.control.push(args);
        if(!store.run||args.p_run_id!==store.run.id) return {data:{ok:false,code:'RUN_NOT_FOUND'}};
        if((args.p_guest_hash??args.p_user_id)!==store.run.owner) return {data:{ok:false,code:'OWNER_MISMATCH'}};
        if(args.p_action==='reserve')store.run.status='scheduled';
        if(args.p_action==='start')store.run.status='active';
        if(args.p_action==='leave')store.run.status='abandoned';
        return {data:{ok:true,code:'SNAPSHOT',run:{...store.run}}};
      }
      throw Error('unexpected RPC '+name);
    },
  };
  const fetcher=async(address,options={})=>{
    if(String(address).startsWith('https://ko.wikipedia.org/')){
      const requestURL=new URL(address);
      calls.wiki.push(requestURL);
      if(wikiDelayMs) await new Promise(resolve=>setTimeout(resolve,wikiDelayMs));
      if(wikiStatus!==null) return new Response('error',{status:wikiStatus});
      if(wikiResponder)return wikiResponder(requestURL,calls.wiki.length);
      if(liveWiki){
        const response=await fetch(address,options);
        const data=response.ok?await response.clone().json().catch(()=>null):null;
        const page=Object.values(data?.query?.pages??{})[0];
        calls.wikiObserved.push({
          status:response.status,
          pageId:page?.pageid==null?null:String(page.pageid),
          disambiguation:Boolean(page&&Object.prototype.hasOwnProperty.call(page.pageprops||{},'disambiguation')),
          title:page?.title??null,
        });
        return response;
      }
      const candidate=draws.shift()??mkPage(seq++);
      return bodyJson({query:{pages:[candidate]}});
    }
    return fetch(address,options);
  };
  let origin='';
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    const pathname=new URL(req.url,origin).pathname;
    try{
      const payload=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
      let response;
      if(pathname==='/functions/v1/wiki-snapshot'){
        assert.equal(req.headers.apikey,'local-e2e-test-key');
        assert.equal(req.headers.authorization,'Bearer local-e2e-test-key');
        calls.snapshot.push(payload);
        const revision=String(payload.revisionId??'');
        const pageId=String(payload.pageId??'');
        const title=payload.title||store.run?.current_title_snapshot;
        response=bodyJson({
          snapshotId:'snapshot-'+pageId+'-'+revision,
          pageId:payload.pageId??store.run?.current_page_id,
          revisionId:payload.revisionId??store.run?.current_revision_id,
          canonicalTitle:title,
          ...(payload.includeDocument?{documentHtml:'<p>격리된 테스트 문서</p>'}:{}),
        });
      }else if(pathname==='/functions/v1/single-run'){
        const request=new Request(origin+pathname,{
          method:req.method,headers:{authorization:req.headers.authorization||''},
          body:JSON.stringify(payload),
        });
        response=await handleSingleStart(request,payload,{
          db,url:origin,serviceKey:'local-e2e-test-key',json:bodyJson,fetcher,
          sha256:async value=>createHash('sha256').update(value).digest('hex'),
        });
      }else response=bodyJson({ok:false,code:'NOT_FOUND'},404);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(await response.text());
    }catch(error){
      res.writeHead(502,{'content-type':'application/json'});
      res.end(JSON.stringify({ok:false,code:'HARNESS_ERROR',details:error?.message||String(error)}));
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  origin='http://127.0.0.1:'+server.address().port;
  const invoke=async(payload,auth=null)=>{
    const response=await fetch(origin+'/functions/v1/single-run',{
      method:'POST',
      headers:{'content-type':'application/json',...(auth?{authorization:auth}:{})},
      body:JSON.stringify(payload),
    });
    return {status:response.status,body:await response.json()};
  };
  return {
    invoke,calls,store,origin,
    expirePending:()=>{store.pending=null;},
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}

test('isolated HTTP: starts on a disambiguation, rerolls disambiguation GOAL, then recover/schedule/start/document',async()=>{
  const h=await startHarness({sequence:[
    mkPage(101,{title:'화성',pageprops:{disambiguation:''}}),
    mkPage(102,{title:'덕곡면',pageprops:{disambiguation:''}}),
    mkPage(103,{title:'훈민정음'}),
  ]});
  try{
    const requestId=randomUUID();
    const first=await h.invoke(allocation(requestId));
    assert.equal(first.body.ok,true,JSON.stringify(first.body));
    assert.equal(first.body.run.start_title_snapshot,'화성');
    assert.equal(first.body.run.target_title_snapshot,'훈민정음');
    assert.equal(h.calls.wiki.length,3);
    assert.equal(h.calls.snapshot.length,2);
    assert.deepEqual(h.calls.snapshot.map(x=>x.title),['화성','훈민정음']);
    assert.equal(h.calls.commit.length,1);
    const props=h.calls.wiki.map(u=>[u.searchParams.get('prop'),u.searchParams.get('ppprop')]);
    assert.deepEqual(props,Array(3).fill(['info|revisions|pageprops','disambiguation']));

    const runId=first.body.run.id;
    const reloaded=await h.invoke({action:'snapshot_v1',actor:'guest',guestToken:GUEST,runId});
    assert.equal(reloaded.body.run.target_title_snapshot,'훈민정음');
    const reserve=await h.invoke({action:'reserve_start',actor:'guest',guestToken:GUEST,runId});
    assert.equal(reserve.body.run.status,'scheduled');
    const start=await h.invoke({action:'start',actor:'guest',guestToken:GUEST,runId});
    assert.equal(start.body.run.status,'active');
    const doc=await h.invoke({action:'document',actor:'guest',guestToken:GUEST,runId});
    assert.equal(doc.body.page.canonicalTitle,'화성');
    assert.match(doc.body.page.documentHtml,/격리된 테스트 문서/);
    assert.equal(h.calls.snapshot.length,3);
    assert.equal(h.calls.wiki.length,3,'F5 does not redraw the already committed course');
    assert.equal(h.calls.commit.length,1,'F5 does not mutate course identity');
    console.log('STAGING_HTTP_RETRY_RECOVERY '+JSON.stringify({
      allocated:true,disambiguationStartAllowed:true,goalRerolled:true,
      distinctWikiDraws:3,pinnedSnapshots:2,refreshPreservedGoal:true,
      reserveAndStart:true,documentRestored:true,commits:1
    }));
  }finally{await h.close();}
});

test('isolated HTTP: simultaneous duplicate allocations have one server-authoritative winner and one snapshot pair',async()=>{
  const h=await startHarness({wikiDelayMs:45,sequence:[mkPage(201),mkPage(202)]});
  try{
    const request=allocation(randomUUID());
    const [a,b]=await Promise.all([h.invoke(request),h.invoke(request)]);
    const codes=[a.body.code,b.body.code];
    assert.ok(codes.includes('ALLOCATED'),JSON.stringify(codes));
    assert.ok(codes.includes('ALLOCATION_PENDING'),JSON.stringify(codes));
    const replay=await h.invoke(request);
    assert.equal(replay.body.code,'ALLOCATED');
    assert.equal(h.calls.commit.length,1);
    assert.equal(h.calls.wiki.length,2);
    assert.equal(h.calls.snapshot.length,2);
    console.log('STAGING_HTTP_CONCURRENT '+JSON.stringify({results:codes,replay:replay.body.code,commits:1}));
  }finally{await h.close();}
});

test('isolated HTTP: Wiki 429 never commits, pending idempotency guards retries; lease expiry permits safe retry',async()=>{
  const h=await startHarness({wikiStatus:429});
  try{
    const request=allocation(randomUUID());
    const fail=await h.invoke(request);
    assert.equal(fail.body.code,'RANDOM_DOCUMENT_UNAVAILABLE');
    assert.equal(h.calls.commit.length,0);
    assert.equal(h.calls.snapshot.length,0);
    const pending=await h.invoke(request);
    assert.equal(pending.body.code,'ALLOCATION_PENDING');
    assert.equal(h.calls.wiki.length,1);
    h.expirePending();
    const again=await h.invoke(request);
    assert.equal(again.body.code,'RANDOM_DOCUMENT_UNAVAILABLE');
    assert.equal(h.calls.wiki.length,2);
    assert.equal(h.calls.commit.length,0);
  }finally{await h.close();}
});

test('isolated HTTP: 12 disambiguation GOAL candidates exhaust fixed draw ceiling, without snapshotting them',async()=>{
  const h=await startHarness({
    sequence:[mkPage(301),...Array.from({length:11},(_,i)=>mkPage(302+i,{pageprops:{disambiguation:''}}))],
  });
  try{
    const result=await h.invoke(allocation());
    assert.equal(result.body.code,'RANDOM_DOCUMENT_UNAVAILABLE');
    assert.equal(h.calls.wiki.length,12);
    assert.equal(h.calls.snapshot.length,1);
    assert.equal(h.calls.commit.length,0);
  }finally{await h.close();}
});

test('isolated HTTP: rejected tampered request/member token cannot trigger page draws or commits',async()=>{
  const h=await startHarness();
  try{
    const bad=await h.invoke({...allocation(),goal:{title:'공격자가 지정한 목표'}});
    assert.equal(bad.status,400);
    const unauthorized=await h.invoke(allocation(randomUUID(),'member'));
    assert.equal(unauthorized.status,401);
    const member=await h.invoke(allocation(randomUUID(),'member'),'Bearer valid-member-token');
    assert.equal(member.body.ok,true,JSON.stringify(member.body));
    assert.equal(h.calls.commit.length,1);
    assert.equal(h.calls.wiki.length,2);
  }finally{await h.close();}
});

test('isolated HTTP: 24 warm fake-backed allocations measure round trip, without any production API or DB',async()=>{
  const latencies=[];
  for(let i=0;i<24;i++){
    const h=await startHarness({
      sequence:[mkPage(8000+i*3),mkPage(8001+i*3,{pageprops:{disambiguation:''}}),mkPage(8002+i*3)],
    });
    try{
      const before=performance.now();
      const reply=await h.invoke(allocation(randomUUID()));
      latencies.push(performance.now()-before);
      assert.equal(reply.body.ok,true,JSON.stringify(reply.body));
      assert.equal(h.calls.wiki.length,3);
      assert.equal(h.calls.snapshot.length,2);
    }finally{await h.close();}
  }
  const sorted=[...latencies].sort((a,b)=>a-b);
  const summary={
    samples:latencies.length,
    p50Ms:Math.round(sorted[Math.floor(sorted.length*.5)]),
    p95Ms:Math.round(sorted[Math.floor(sorted.length*.95)]),
    maxMs:Math.round(sorted.at(-1)),
    kind:'LOCAL_IN_MEMORY_RPC_AND_SNAPSHOT_HTTP_ONLY_NOT_HOSTED_EDGE_SLA',
  };
  console.log('STAGING_HTTP_LATENCY '+JSON.stringify(summary));
  assert.equal(latencies.length,24);
  assert.ok(summary.maxMs<3000,'local synthetic HTTP smoke unusually slow');
});


test('live Wikimedia random draw + isolated HTTP snapshot and RPC end-to-end timing', {
  skip:process.env.RUN_LIVE_WIKI_E2E!=='1',
  timeout:90000,
}, async()=>{
  const samples=[];
  for(let i=0;i<4;i++){
    const h=await startHarness({liveWiki:true});
    const start=performance.now();
    try{
      const outcome=await h.invoke(allocation(randomUUID()));
      const elapsedMs=Math.round(performance.now()-start);
      if(outcome.body.ok){
        assert.equal(h.calls.snapshot.length,2);
        assert.equal(h.calls.commit.length,1);
        const target=h.calls.snapshot[1];
        const page=h.calls.wikiObserved.find(x=>x.pageId===String(target.pageId));
        assert.ok(page,'goal identity must originate in Wikimedia response');
        assert.equal(page.disambiguation,false,'committed goal must not be disambiguation');
        assert.ok(h.calls.wiki.length>=2&&h.calls.wiki.length<=12);
        samples.push({ok:true,elapsedMs,draws:h.calls.wiki.length,verifiedGoal:true});
      }else{
        assert.equal(h.calls.commit.length,0);
        samples.push({ok:false,elapsedMs,code:outcome.body.code});
      }
    }finally{await h.close();}
    await new Promise(resolve=>setTimeout(resolve,700));
  }
  const ok=samples.filter(x=>x.ok).map(x=>x.elapsedMs).sort((a,b)=>a-b);
  const result={
    attempts:samples.length,succeeded:ok.length,
    p50Ms:ok.length?ok[Math.floor(ok.length*.5)]:null,
    maxMs:ok.length?ok.at(-1):null,
    samples,
    limitation:'GitHub Actions runner + live Wikipedia + local HTTP snapshot + mocked RPC, NOT hosted Supabase Edge latency',
  };
  console.log('STAGING_LIVE_WIKIMEDIA_HTTP '+JSON.stringify(result));
  assert.ok(ok.length>=3,'real Wikipedia random end-to-end sample success threshold');
});
