import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../services/multiplayerService.js',import.meta.url),'utf8');
const isolated=await import(`data:text/javascript;base64,${Buffer.from(`
 const isSupabaseConfigured=true;export const calls=[];
 export let response={ok:false,code:'LINK_CENSORED',player:{current_page_id:'original'}};
 export const setResponse=v=>{response=v;};
 const createRequestId=()=> 'request';const createCorrelationId=()=> 'correlation';
 const supabase={rpc:async(name,args)=>{calls.push({name,args});return {data:response,error:null};}};
 ${source.replace(/^import .*;\r?\n/gm,'')}
`).toString('base64')}`);

test('P0: sealed link rejection preserves explicit code/snapshot and does not issue a fallback move',async()=>{
 await assert.rejects(isolated.applyDuelMoveV2({roomId:'room',expectedVersion:5,nextPage:{pageId:123,revisionId:456,title:'alias'}}),e=>{
  assert.equal(e.code,'LINK_CENSORED');assert.match(e.message,/링크 검열/);
  assert.equal(e.snapshot.player.current_page_id,'original');assert.equal(e.recoverable,false);return true;
 });
 assert.equal(isolated.calls.length,1);assert.equal(isolated.calls[0].name,'apply_duel_move_v2');
 assert.equal(isolated.calls[0].args.p_to_page_id,'123');assert.equal(isolated.calls[0].args.p_event_type,'NORMAL_LINK');
});
test('P0: normal success and version conflict keep their existing service contracts',async()=>{
 isolated.setResponse({ok:true,code:'APPLIED',player:{current_page_id:'next'}});
 assert.equal((await isolated.applyDuelMoveV2({roomId:'room',expectedVersion:5,nextPage:{pageId:'next'}})).player.current_page_id,'next');
 isolated.setResponse({ok:false,code:'STATE_VERSION_CONFLICT'});
 await assert.rejects(isolated.applyDuelMoveV2({roomId:'room',expectedVersion:5}),e=>e.code==='STATE_VERSION_CONFLICT'&&e.recoverable===true);
});
