#!/usr/bin/env node
/** One-off smoke test of EXACT server-owned MediaWiki generator=random params.
 * Read-only; does not create game sessions or snapshots.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { performance } from "node:perf_hooks";
const n=3,records=[];
for(let i=0;i<n;i++){
  const url=new URL("https://ko.wikipedia.org/w/api.php");
  for(const [name,value] of Object.entries({
    action:"query",generator:"random",grnnamespace:"0",grnlimit:"1",
    grnfilterredir:"nonredirects",prop:"info|revisions|pageprops",
    ppprop:"disambiguation",rvprop:"ids",redirects:"1",format:"json",formatversion:"2",
  }))url.searchParams.set(name,value);
  const started=performance.now();
  try{
    const resp=await fetch(url,{
      headers:{"User-Agent":"WikiRaceDisambiguationResearch/0.1 (https://github.com/Yu-HsH/wiki; random identity QA, no game sessions)","Accept":"application/json"},
      signal:AbortSignal.timeout(8000),
    });
    if(!resp.ok)throw Error("HTTP_"+resp.status);
    const data=await resp.json();
    const page=data?.query?.pages?.[0];
    const valid=Boolean(page&&page.ns===0&&Number.isSafeInteger(page.pageid)&&page.pageid>0&&Number.isSafeInteger(page.revisions?.[0]?.revid)&&page.revisions[0].revid>0);
    if(!valid)throw Error("INVALID_RANDOM_IDENTITY");
    const row={ok:true,namespace:page.ns,revisionPresent:true,hasDisambiguation:Object.prototype.hasOwnProperty.call(page.pageprops||{},"disambiguation"),elapsedMs:Math.round(performance.now()-started)};
    records.push(row);console.log("RANDOM_IDENTITY_LIVE "+JSON.stringify(row));
  }catch(e){
    const row={ok:false,error:String(e?.message||e).slice(0,110)};
    records.push(row);console.log("RANDOM_IDENTITY_ERROR "+JSON.stringify(row));
  }
  await sleep(1000);
}
console.log("RANDOM_IDENTITY_SUMMARY "+JSON.stringify({
  total:records.length,successful:records.filter(x=>x.ok).length,
  note:"Exact random query verified; no snapshots, no game writes, no claimed game start time."
}));
if(records.some(x=>!x.ok))process.exitCode=1;
