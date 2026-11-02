import {countSearchMatches} from './document.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createSearchHandler({authenticate,source,prepare,commit,log=()=>{}}){
  return async request=>{
    const started=performance.now(),durations=[];
    const measure=async(name,work)=>{const at=performance.now();try{return await work()}finally{durations.push(`${name};dur=${(performance.now()-at).toFixed(2)}`)}};
    const reply=(body,status=200)=>{const response=json(body,status);response.headers.set('Server-Timing',[...durations,`total;dur=${(performance.now()-started).toFixed(2)}`].join(', '));return response;};
    if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
    if(request.method!=='POST')return reply({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    try{
      const identity=await measure('auth',()=>authenticate(request.headers.get('Authorization')||''));
      if(!identity?.userId)return reply({ok:false,code:'AUTH_REQUIRED'},401);
      let b;try{b=await request.json()}catch{return reply({ok:false,code:'INVALID_SEARCH_REQUEST'},400)}
      const fields=['action','roomId','itemEventId',...(b?.action==='search'?['requestId','query','documentHash']:[])];
      if(!b||!['prepare','search'].includes(b.action)||![b.roomId,b.itemEventId].every(v=>typeof v==='string'&&uuid.test(v))
        ||Object.keys(b).some(k=>!fields.includes(k))||(b.action==='search'&&(!uuid.test(b.requestId||'')||typeof b.query!=='string'||b.query.length>4096||!b.query.trim()||!/^[0-9a-f]{64}$/.test(b.documentHash||''))))return reply({ok:false,code:'INVALID_SEARCH_REQUEST'},400);
      const state=await measure('source',()=>source(identity,b));if(!state?.ok)return reply(state);
      if(b.action==='prepare'){
        if(state.consumed)return reply({ok:false,code:'SEARCH_USED'});
        const doc=state.document_html?state:await measure('prepare',()=>prepare(identity,b,state,measure));
        if(!doc?.ok)return reply(doc);
        // Never send the internal node manifest to the UI as an authorization input.
        return reply({ok:true,code:'SEARCH_DOCUMENT_READY',documentHtml:doc.document_html,documentHash:doc.document_hash,expiresAt:doc.expires_at});
      }
      if(!state.document_hash||b.documentHash!==state.document_hash)return reply({ok:false,code:'SEARCH_DOCUMENT_MISMATCH'});
      const query=b.query.trim(),count=await measure('match',()=>countSearchMatches(state.text_nodes,query));
      // No matches/HTML/count from the caller. Room/session locks decide the one winner.
      return reply(await measure('commit',()=>commit(identity,{...b,query},count)));
    }catch(e){log(e instanceof Error?e.message:'search I/O failed');return reply({ok:false,code:'SEARCH_UNAVAILABLE'});}
  };
}
