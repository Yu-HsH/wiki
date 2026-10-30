import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchPageData,
  buildCombinedParseLinkData,
  isCombinedParseExperimentEnabled,
} from "../services/wikiService.js";

const makeTitles = (n) => Array.from({ length:n }, (_,i)=>"링크 " + (i+1));
const makeHtml = titles =>
  '<div class="mw-parser-output"><p>' +
  titles.map(title=>'<a href="/wiki/'+encodeURIComponent(title.replaceAll(" ","_"))+'">'+title+'</a>').join(" ") +
  '</p></div>';

function installWiki(t, { title, allTitles, parsedTitles=allTitles, includeParseLinks=true, revision=9988 } = {}) {
  const oldFetch=globalThis.fetch;
  const oldStorage=globalThis.localStorage;
  const calls={parse:0, query:0, summary:0};
  let mode="combined";
  globalThis.localStorage={getItem:(key) => key === "wiki-race-document-api" ? mode : null};
  const html=makeHtml(allTitles);
  globalThis.fetch=async (url) => {
    const u=new URL(url);
    if (u.pathname.includes("/page/summary/")) {
      calls.summary++;
      return Response.json({title,extract:"요약"});
    }
    if (u.searchParams.get("action")==="parse") {
      calls.parse++;
      const response={title,pageid:7443,revid:revision,text:{"*":html}};
      if (includeParseLinks && u.searchParams.get("prop").includes("links")) {
        response.links=parsedTitles.map(title=>({ns:0,"*":title,exists:""}));
      }
      return Response.json({parse:response});
    }
    if (u.searchParams.get("action")==="query") {
      calls.query++;
      const index=Number(u.searchParams.get("plcontinue")||"0");
      const chunk=allTitles.slice(index,index+500).map(title=>({ns:0,title}));
      const next=index+500<allTitles.length
        ? {continue:"||",plcontinue:String(index+500)}
        : undefined;
      return Response.json({query:{pages:{7443:{pageid:7443,title,links:chunk}}},...(next?{continue:next}:{})});
    }
    throw new Error("Unexpected wiki endpoint "+u);
  };
  t.after(()=>{
    globalThis.fetch=oldFetch;
    if (oldStorage===undefined) delete globalThis.localStorage;
    else globalThis.localStorage=oldStorage;
  });
  return {calls,setMode:(next)=>{mode=next}};
}

test("one parse response keeps ALL 1,201 legitimate article links, not just first 500", async t=>{
  const title="전체링크일괄검증-20261030-A";
  const targets=makeTitles(1201);
  const {calls}=installWiki(t,{title,allTitles:targets});
  assert.equal(isCombinedParseExperimentEnabled(),true);
  const page=await fetchPageData(title);
  assert.equal(calls.parse,1);
  assert.equal(calls.query,0);
  assert.equal(page.links.length,1201);
  assert.equal(page.links.at(-1),targets.at(-1));
  assert.equal(page.quickLinks.length,20);
  assert.equal(page.pageId,"7443");
  assert.equal(page.revisionId,"9988");
  assert.equal(page.linkDiagnostics.finalAllowedCount,1201);
});

test("incomplete combined list falls back to ALL query pages and exactly preserves legacy links", async t=>{
  const title="불완전파싱링크대조-20261030-B";
  const targets=makeTitles(1301);
  const {calls,setMode}=installWiki(t,{title,allTitles:targets,parsedTitles:targets.slice(0,500)});
  const combined=await fetchPageData(title);
  assert.equal(calls.parse,1);
  assert.equal(calls.query,3);
  assert.equal(combined.links.length,1301);
  assert.deepEqual(combined.linkDiagnostics.apiPageCounts,[500,500,301]);
  setMode("parse");
  const legacy=await fetchPageData(title);
  assert.deepEqual(combined.links,legacy.links);
  assert.deepEqual(combined.quickLinks,legacy.quickLinks);
  assert.equal(combined.revisionId,legacy.revisionId);
  assert.equal(calls.query,6,"legacy path still fetches all three pages");
});

test("missing parse link metadata always triggers complete query fallback",async t=>{
  const title="파싱링크필드누락-20261030-C";
  const targets=makeTitles(1002);
  const {calls}=installWiki(t,{title,allTitles:targets,includeParseLinks:false});
  const page=await fetchPageData(title);
  assert.equal(page.links.length,1002);
  assert.equal(calls.query,3);
});

test("bad combined link metadata never silently loses HTML links",()=>{
  const input={
    canonicalTitle:"샘플",
    pageId:"100",
    html:makeHtml(["첫 링크","두 번째 링크"]),
    parsedLinks:[{ns:0,"*":"첫 링크"}],
  };
  assert.equal(buildCombinedParseLinkData(input),null);
  assert.equal(buildCombinedParseLinkData({...input,parsedLinks:[{ns:0,"*":"첫 링크"},{ns:0,"*":"두 번째 링크"}]})?.links.length,2);
});

test("combined disabled by default and inaccessible browser storage is safe",()=>{
  const old=globalThis.localStorage;
  try {
    delete globalThis.localStorage;
    assert.equal(isCombinedParseExperimentEnabled(),false);
    globalThis.localStorage={getItem(){throw new Error("denied")}};
    assert.equal(isCombinedParseExperimentEnabled(),false);
  } finally {
    if(old===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=old;
  }
});
