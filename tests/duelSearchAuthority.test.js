import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,serialize} from 'parse5';
import {buildSearchDocument,countSearchMatches} from '../supabase/functions/duel-search/document.mjs';
import {createSearchHandler} from '../supabase/functions/duel-search/handler.mjs';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const hash='a'.repeat(64),state={ok:true,page_id:'1',revision_id:'2',document_html:'<p>Hello hello</p>',document_hash:hash,text_nodes:['Hello hello'],expires_at:'2026-11-02T00:00:15Z'};
const request=b=>new Request('https://local.invalid/',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'search',roomId:ids[0],itemEventId:ids[1],requestId:ids[2],query:'hello',documentHash:hash,...b})});
function fixture(overrides={}){const calls=[];const handler=createSearchHandler({authenticate:async()=>({userId:'member'}),source:async()=>state,prepare:async()=>state,commit:async(i,b,count)=>{calls.push({i,b,count});return {ok:true,code:'SEARCH_FOUND',query:b.query,count};},...overrides});return {handler,calls};}
test('server sanitizer removes executable/reference content and only snapshot-approved links remain',()=>{
  const d=buildSearchDocument('<div class="mw-parser-output"><script>secret</script><p>Hello &amp; world <a href="/wiki/허용">허용</a><a href="/wiki/차단">보이는 글자</a><img src="https://evil.test/a" onerror="bad()"></p><sup class="reference">각주</sup></div>',{currentTitle:'현재',links:[{title:'허용'}]},{parse,serialize});
  assert.match(d.documentHtml,/data-wiki-title="허용"/);assert.doesNotMatch(d.documentHtml,/script|onerror|evil|각주|data-wiki-title="차단"/);assert.deepEqual(d.textNodes,['Hello & world ','허용','보이는 글자']);
});
test('literal regex metacharacters, entities, whitespace and text-node boundaries preserve the old search contract',()=>{
  const d=buildSearchDocument('<p>A&amp;B a.b A.B <b>한</b><i>글</i>　hello</p>',{currentTitle:'A',links:[]},{parse,serialize});
  assert.equal(countSearchMatches(d.textNodes,'a.b'),2);assert.equal(countSearchMatches(d.textNodes,'A&B'),1);assert.equal(countSearchMatches(d.textNodes,'한글'),0);assert.equal(countSearchMatches(d.textNodes,'  '),0);assert.equal(countSearchMatches(d.textNodes,' hello '),1);
});
test('table parsing, unsafe attributes and allowed images produce inert canonical HTML',()=>{
  const d=buildSearchDocument('<table onclick="bad()"><tr><td colspan="2">표<img src="//upload.wikimedia.org/x.png" alt="그림" style="color:red"></td></tr></table>',{links:[]},{parse,serialize});
  assert.match(d.documentHtml,/<tbody>/);assert.match(d.documentHtml,/loading="lazy"/);assert.doesNotMatch(d.documentHtml,/onclick|style=/);assert.deepEqual(d.textNodes,['표']);
});
test('missing/forged identity fails before document or consumption reads',async()=>{const f=fixture({authenticate:async()=>null});const r=await f.handler(request());assert.equal(r.status,401);assert.equal((await r.json()).code,'AUTH_REQUIRED');assert.equal(f.calls.length,0);});
for(const extra of [{success:true},{count:99},{text_nodes:['fake']},{documentHtml:'fake'},{userId:ids[0]}])test('caller success/content/owner claims are rejected: '+Object.keys(extra)[0],async()=>{const f=fixture();const r=await f.handler(request(extra));assert.equal(r.status,400);assert.equal(f.calls.length,0);});
test('empty input never reaches success consumption',async()=>{const f=fixture();const r=await f.handler(request({query:' \t '}));assert.equal(r.status,400);assert.equal(f.calls.length,0);});
test('tampered document hash cannot authorize highlights',async()=>{const f=fixture();const r=await f.handler(request({documentHash:'b'.repeat(64)}));assert.equal((await r.json()).code,'SEARCH_DOCUMENT_MISMATCH');assert.equal(f.calls.length,0);});
test('server computes actual count; no hit is sent as zero without inventing success',async()=>{const f=fixture();await f.handler(request({query:'missing'}));assert.equal(f.calls[0].count,0);const response=await f.handler(request());assert.equal(f.calls[1].count,2);assert.match(response.headers.get('Server-Timing'),/auth;dur=[\d.]+, source;dur=[\d.]+, match;dur=[\d.]+, commit;dur=[\d.]+, total;dur=[\d.]+/);});
test('ownership/expiry/source change stops before commit',async()=>{for(const code of ['SEARCH_NOT_OWNED','SEARCH_EXPIRED','SEARCH_SOURCE_CHANGED','GAME_NOT_ACTIVE']){const f=fixture({source:async()=>({ok:false,code})});assert.equal((await (await f.handler(request())).json()).code,code);assert.equal(f.calls.length,0);}});
test('prepared response exposes exact HTML/hash and no caller-editable authorization manifest',async()=>{const f=fixture();const r=await f.handler(request({action:'prepare',requestId:undefined,query:undefined,documentHash:undefined}));const b=await r.json();assert.equal(b.documentHtml,state.document_html);assert.equal(b.documentHash,hash);assert.equal(b.text_nodes,undefined);});
test('consumed session cannot be re-prepared to reset its success count',async()=>{const f=fixture({source:async()=>({...state,consumed:true})});const r=await f.handler(request({action:'prepare',requestId:undefined,query:undefined,documentHash:undefined}));assert.equal((await r.json()).code,'SEARCH_USED');});
