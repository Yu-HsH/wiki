import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewHandler, fetchWikipediaPreview, normalizePreviewSummary } from '../supabase/functions/duel-link-preview/handler.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const body = { roomId:id(1),itemEventId:id(2),requestId:id(3),targetPageId:'123' };
const request = payload => new Request('http://localhost/preview',{method:'POST',headers:{Authorization:'Bearer local-test','Content-Type':'application/json'},body:JSON.stringify(payload)});
function rig(overrides={}) {
  const calls=[];
  const handler=createPreviewHandler({authenticate:async()=>({userId:id(4)}),
    reserve:async()=>({ok:true,code:'PREVIEW_RESERVED',lease_token:id(5),target_title:'정규 문서',server_now:'2026-10-14T10:00:00Z',lease_until:'2026-10-14T10:00:06Z'}),
    fetchSummary:async(...args)=>{calls.push(['fetch',...args]);return {page_id:'123',extract:'성공'};},
    settle:async(...args)=>{calls.push(['settle',...args]);return {ok:true,code:args[3]?'PREVIEW_READY':'PREVIEW_UNAVAILABLE'};},...overrides});
  return {calls,handler};
}
test('preview gateway uses authenticated reservation, server title and ≤5s fetch before settlement',async()=>{
  const {calls,handler}=rig();assert.equal((await (await handler(request(body))).json()).code,'PREVIEW_READY');
  assert.deepEqual(calls[0],['fetch','정규 문서','123',5000]);assert.equal(calls[1][3],id(5));
});
test('preview gateway refuses actor, URL and success supplied by caller',async()=>{
  for(const extra of [{userId:id(4)},{url:'https://evil.invalid'},{summary:{extract:'fake'}}]){
    const {handler,calls}=rig();assert.equal((await handler(request({...body,...extra}))).status,400);assert.equal(calls.length,0);
  }
});
test('preview gateway auth is required and malformed body is rejected',async()=>{
  assert.equal((await rig({authenticate:async()=>null}).handler(request(body))).status,401);
  assert.equal((await rig().handler(request({...body,requestId:null}))).status,400);
});
test('ready cache, pending and limit rejection never fetch an external summary',async()=>{
  for(const code of ['PREVIEW_READY','PREVIEW_PENDING','PREVIEW_LIMIT_REACHED','LINK_CENSORED']){
    const {handler,calls}=rig({reserve:async()=>({code})});assert.equal((await (await handler(request(body))).json()).code,code);assert.equal(calls.length,0);
  }
});
test('failure releases only its reservation; lost commit response reports unknown consumption',async()=>{
  const {handler,calls}=rig({fetchSummary:async()=>{throw Error('timeout');}});
  assert.equal((await (await handler(request(body))).json()).code,'PREVIEW_UNAVAILABLE');assert.equal(calls[0][4],null);
  const lost=rig({settle:async()=>{throw Error('lost commit response');}});
  assert.equal((await (await lost.handler(request(body))).json()).code,'PREVIEW_STATE_UNKNOWN');
});
test('success requires matching canonical ID and nonempty normalized extract',()=>{
  assert.deepEqual(normalizePreviewSummary({pageid:123,title:'alias',extract:' a\n b ',description:' x  y'},'123'),{page_id:'123',title:'alias',extract:'a b',description:'x y'});
  for(const data of [{pageid:124,extract:'text'},{pageid:123,extract:'   '},{extract:'text'}])assert.throws(()=>normalizePreviewSummary(data,'123'));
});
test('upstream failure, empty JSON and canonical mismatch fail without success',async()=>{
  for(const response of [new Response('',{status:404}),new Response('',{status:429}),new Response('bad'),Response.json({pageid:123,extract:''}),Response.json({pageid:124,extract:'wrong'})]){
    await assert.rejects(fetchWikipediaPreview('文書/alias','123',50,async(url,options)=>{
      assert.equal(new URL(url).hostname,'ko.wikipedia.org');assert.equal(options.redirect,'error');return response;
    }));
  }
});
