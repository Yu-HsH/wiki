/** Decode only the requested tier. No timers, model state or file transformations. */
const cache=new Map();
export function preloadInkImage(src,host=globalThis){
 if(!src||!host.Image)return Promise.resolve("unavailable");
 if(cache.has(src))return cache.get(src).promise;
 const row={status:"pending",promise:null};row.promise=new Promise(resolve=>{const image=new host.Image();image.decoding="async";image.onload=async()=>{try{await image.decode?.();row.status="ready";}catch{row.status="error";}resolve(row.status);};image.onerror=()=>{row.status="error";resolve(row.status);};image.src=src;});cache.set(src,row);return row.promise;
}
export function preloadInkTier(tier,manifest,host=globalThis){return Promise.all((manifest[tier]||[]).map(asset=>preloadInkImage(asset?.src,host)));}
