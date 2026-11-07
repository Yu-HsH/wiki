#!/usr/bin/env node
/**
 * One-off official Korean Wikipedia metadata observation, research only.
 * Categories are possible context cues, NEVER reliable sensitivity labels.
 * This script is not imported by Wiki Race gameplay.
 */
import { setTimeout as sleep } from "node:timers/promises";
const titles=[
  "섹시","폭유","수간","Shut up","곁주머니","맹자",
  "문혁 (배우)","포메라니안","성적 매력","덕곡면","포니아토프스키"
];
const capText=process.argv.find(x=>x.startsWith("--limit="));
const limit=capText?Number(capText.slice(8)):titles.length;
if(!Number.isSafeInteger(limit)||limit<1||limit>titles.length)throw new Error("Invalid research sample cap");
const results=[];
for(const requestedTitle of titles.slice(0,limit)){
  try{
    const url=new URL("https://ko.wikipedia.org/w/api.php");
    for(const [key,value] of Object.entries({
      action:"query",prop:"pageprops|categories",ppprop:"disambiguation",
      clshow:"!hidden",cllimit:"20",titles:requestedTitle,redirects:"1",
      format:"json",formatversion:"2"
    }))url.searchParams.set(key,value);
    const response=await fetch(url,{
      headers:{
        "User-Agent":"WikiRaceResearch/0.3 (https://github.com/Yu-HsH/wiki; offline one-off category and disambiguation audit)",
        "Accept":"application/json",
      },
      signal:AbortSignal.timeout(8000),
    });
    if(!response.ok)throw new Error("HTTP_"+response.status);
    const json=await response.json();
    const page=json?.query?.pages?.[0];
    if(!page||json.error)throw new Error("INVALID_MEDIAWIKI_RESPONSE");
    const result={
      requestedTitle,
      canonicalTitle:page.title||null,
      missing:Boolean(page.missing||page.invalid),
      disambiguation:Object.hasOwn(page.pageprops||{},"disambiguation"),
      categoriesSample:(page.categories||[]).slice(0,12).map(x=>x.title),
      categoriesTruncated:Boolean(json.continue),
    };
    results.push({ok:true,...result});
    console.log("TARGET_METADATA_PROBE "+JSON.stringify(result));
  }catch(error){
    const value={ok:false,requestedTitle,error:String(error.message||error).slice(0,110)};
    results.push(value);
    console.log("TARGET_METADATA_ERROR "+JSON.stringify(value));
  }
  await sleep(1000);
}
console.log("TARGET_METADATA_SUMMARY "+JSON.stringify({
  attempted:results.length,successful:results.filter(x=>x.ok).length,
  unavailable:results.filter(x=>!x.ok).length,
  disclaimer:"Category names and title keywords must NOT become automatic safety verdicts."
}));
