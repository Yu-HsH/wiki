import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {parse,serialize} from 'npm:parse5@7.3.0';
import {buildSearchDocument} from './document.mjs';
import {createSearchHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const admin=createClient(url,service,{auth:{persistSession:false}});
const rpc=async(client:any,name:string,args:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
Deno.serve(createSearchHandler({
  authenticate:async(authorization:string)=>{const token=authorization.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return null;const {data,error}=await admin.auth.getUser(token);return error||!data?.user?null:{userId:data.user.id,member:createClient(url,anon,{accessToken:async()=>token})};},
  source:async(i:any,b:any)=>rpc(i.member,'get_duel_search_source_v1',{p_room_id:b.roomId,p_item_event_id:b.itemEventId}),
  prepare:async(i:any,b:any,state:any,measure:any)=>{
    const page=await measure('html_fetch',async()=>{
      const response=await fetch(url+'/functions/v1/wiki-snapshot',{method:'POST',headers:{Authorization:'Bearer '+service,apikey:service,'Content-Type':'application/json'},body:JSON.stringify({title:state.title,pageId:state.page_id,revisionId:state.revision_id,includeDocument:true}),signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('SEARCH_DOCUMENT_UNAVAILABLE');return response.json();
    });
    if(String(page.pageId)!==state.page_id||String(page.revisionId)!==state.revision_id)throw Error('SEARCH_DOCUMENT_IDENTITY_MISMATCH');
    const doc=await measure('parse',()=>buildSearchDocument(page.documentHtml,{currentTitle:page.canonicalTitle,links:page.links},{parse,serialize}));
    const digest=await measure('hash',()=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.policyVersion+'\0'+doc.documentHtml)));
    const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    return measure('cache_write',()=>rpc(admin,'put_duel_search_document_v1',{p_room_id:b.roomId,p_item_event_id:b.itemEventId,p_user_id:i.userId,p_document_hash:hash,p_document_html:doc.documentHtml,p_text_nodes:doc.textNodes}));
  },
  commit:async(i:any,b:any,count:number)=>rpc(admin,'commit_duel_search_v1',{p_room_id:b.roomId,p_item_event_id:b.itemEventId,p_user_id:i.userId,p_request_id:b.requestId,p_query:b.query,p_document_hash:b.documentHash,p_match_count:count}),
  log:()=>console.error('duel search request failed'),
}));
