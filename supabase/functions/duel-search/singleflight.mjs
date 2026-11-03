// Share preparation work only within this worker. Never share a user's permit,
// put/commit response, expiry, or authorization across requests.
export function createDocumentSingleFlight(limit=4){
  const pending=new Map();
  return (key,work)=>{
    if(pending.has(key))return pending.get(key);
    if(pending.size>=limit)return Promise.reject(Error('SEARCH_PREPARATION_BUSY'));
    const result=Promise.resolve().then(work).finally(()=>pending.delete(key));
    pending.set(key,result);return result;
  };
}
