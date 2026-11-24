/** D local presentation slots only. Null means no art was delivered or adopted. */
export const INK_ART_MANIFEST=Object.freeze({normal:Object.freeze([null,null,null]),enhanced:Object.freeze([null,null,null]),weakened:Object.freeze([null,null,null])});
// Dev-only path roots; controls, escapes, query strings and URL normalization tricks are rejected.
const localPath=value=>typeof value==="string"&&/^\/(?:__ink-art\/|\.temp\/cd-ink-ux-d-20261108\/)[A-Za-z0-9_./-]+\.(png|svg|webp|webm)$/i.test(value)&&!value.split("/").some(part=>part===".."||part===".");
export function resolveInkArt(tier,pulseIndex,manifest=INK_ART_MANIFEST){
 const raw=manifest?.[tier]?.[pulseIndex];
 if(!raw||!localPath(raw.src))return null;
 if(raw.kind==="image"&&/\.(png|svg|webp)$/i.test(raw.src))return Object.freeze({kind:"image",src:raw.src});
 if(raw.kind==="video"&&/\.webm$/i.test(raw.src)&&localPath(raw.poster)&&/\.(png|svg|webp)$/i.test(raw.poster))return Object.freeze({kind:"video",src:raw.src,poster:raw.poster});
 return null;
}
