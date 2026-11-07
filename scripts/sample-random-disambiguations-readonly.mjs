#!/usr/bin/env node
/**
 * Bounded read-only sample of Korean Wikipedia namespace-0 random pages.
 * Cohort generator random grnlimit=50 is NOT independent per-item; informative
 * for approximate disambiguation prevalence, not proof of production rerolls.
 */
import { setTimeout as sleep } from "node:timers/promises";
const rounds=3,perRound=50, observations=[];
for(let i=0;i<rounds;i++){
  const url=new URL("https://ko.wikipedia.org/w/api.php");
  for(const [key,value] of Object.entries({
    action:"query",generator:"random",grnnamespace:"0",grnlimit:String(perRound),
    grnfilterredir:"nonredirects",prop:"info|pageprops",ppprop:"disambiguation",
    format:"json",formatversion:"2",
  }))url.searchParams.set(key,value);
  const response=await fetch(url,{
    headers:{"User-Agent":"WikiRaceDisambiguationResearch/0.1 (https://github.com/Yu-HsH/wiki; bounded 150 page metadata sample)","Accept":"application/json"},
    signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw Error("WIKI_SAMPLE_HTTP_"+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.query?.pages))throw Error("WIKI_SAMPLE_INVALID_RESPONSE");
  const pages=payload.query.pages;
  observations.push({
    round:i+1,
    total:pages.length,
    disambiguation:pages.filter(p=>Object.prototype.hasOwnProperty.call(p.pageprops||{},"disambiguation")).length,
    invalid:pages.filter(p=>p.ns!==0||p.missing!==undefined||p.invalid!==undefined).length,
  });
  console.log("WIKI_RANDOM_SAMPLE "+JSON.stringify(observations.at(-1)));
  await sleep(1000);
}
const total=observations.reduce((v,x)=>v+x.total,0);
const disamb=observations.reduce((v,x)=>v+x.disambiguation,0);
console.log("WIKI_RANDOM_SAMPLE_SUMMARY "+JSON.stringify({
  sampled:total,disambiguation:disamb,observedPercent:total?Math.round(10000*disamb/total)/100:null,
  requestCount:rounds,
  scope:"illustrative sampled generator=random batches; 1-per-query live allocation has different successor/latency characteristics",
  note:"One automatic GOAL disambiguation redraw per occurrence; total allocation ceiling is unchanged at 12 draws/29 s."
}));
if(total<100)process.exitCode=1;
