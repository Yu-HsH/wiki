// A compatibility marker, not authentication. Only PostgREST RPC traffic needs
// it; do not change Edge CORS or send it to Wikipedia/Auth/Storage.
export const DUEL_CLIENT_PROTOCOL='search-authority-v1';
export function withDuelClientProtocol(fetcher){
  return (input,init)=>{
    const address=String(input instanceof Request?input.url:input);
    if(!new URL(address).pathname.startsWith('/rest/v1/rpc/'))return fetcher(input,init);
    const headers=new Headers(input instanceof Request?input.headers:undefined);
    new Headers(init?.headers).forEach((value,key)=>headers.set(key,value));
    headers.set('x-wiki-duel-protocol',DUEL_CLIENT_PROTOCOL);
    return fetcher(input,{...init,headers});
  };
}
