import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,serialize} from 'parse5';
import {buildSearchDocument,countSearchMatches} from '../supabase/functions/duel-search/document.mjs';
import {createDocumentSingleFlight} from '../supabase/functions/duel-search/singleflight.mjs';
import {withDuelClientProtocol} from '../utils/duelClientProtocol.js';

test('empty anchor fallback survives empty paragraphs; blocked text cannot keep them alive',()=>{
  const d=buildSearchDocument('<p><script>bad</script></p><li> </li><h2><a href="/wiki/Target"> </a></h2><p><img src="//upload.wikimedia.org/a"></p>',{currentTitle:'Current',links:[{title:'Target'}]},{parse,serialize});
  assert.equal(d.documentHtml,'<h2><a href="#" data-wiki-title="Target" class="wiki-inline-link">Target</a></h2>');
  assert.deepEqual(d.textNodes,['Target']);
});
test('canonical reparsing preserves pre newline stripping and fostered table text boundaries',()=>{
  const d=buildSearchDocument('<pre>\n\n\nx</pre><table>outside<tr><td>A<span>B</span></td></tr></table>',{links:[]},{parse,serialize});
  // The frozen v1 implementation strips LF in all three HTML parses.
  assert.deepEqual(d.textNodes,['x','outside','A','B']);
  assert.equal(countSearchMatches(d.textNodes,'AB'),0);
  assert.equal(countSearchMatches(['a.b A.B','aaa'],'a.b'),2);
});
test('document single-flight shares only pending content work and releases failures/capacity',async()=>{
  const flight=createDocumentSingleFlight(1);let finish,calls=0;
  const work=()=>{calls++;return new Promise(r=>{finish=r})};
  const a=flight('revision/policy',work),b=flight('revision/policy',work);await Promise.resolve();
  assert.equal(a,b);assert.equal(calls,1);await assert.rejects(flight('different',work),/BUSY/);
  finish({html:'shared content'});await a;
  await assert.rejects(flight('revision/policy',()=>{throw Error('upstream')}),/upstream/);
  assert.equal(await flight('revision/policy',()=>42),42);
});
test('protocol marker preserves auth headers and avoids Edge/Auth/Wikipedia traffic',async()=>{
  const calls=[],fetcher=withDuelClientProtocol(async(input,init)=>{calls.push({input,init});return new Response('ok')});
  await fetcher(new Request('https://example.test/rest/v1/rpc/start_duel_room_v2',{headers:{Authorization:'Bearer member'}}),{headers:{apikey:'public-key'}});
  assert.equal(calls[0].init.headers.get('Authorization'),'Bearer member');assert.equal(calls[0].init.headers.get('apikey'),'public-key');
  assert.equal(calls[0].init.headers.get('x-wiki-duel-protocol'),'search-authority-v1');
  for(const address of ['https://example.test/functions/v1/duel-search','https://example.test/auth/v1/user','https://ko.wikipedia.org/w/api.php'])await fetcher(address);
  assert.ok(calls.slice(1).every(c=>c.init===undefined));
});
