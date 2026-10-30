import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchPageData } from "../services/wikiService.js";
import { selectAllowedLinkTitlesFromHtml } from "../services/wikiLinkPolicy.js";
import {
  createWikiSnapshotOverlap,
  isWikiSnapshotOverlapEnabled,
} from "../services/wikiSnapshotOverlap.js";
import {
  extractSnapshotBodyLinks,
  snapshotTitleKey,
  buildSnapshotLinkRows,
  auditSnapshotLinkRows,
} from "../supabase/functions/wiki-snapshot/snapshotLinkGraph.js";

const id = (pageId = "42", revisionId = "100") =>
  ({ pageId, revisionId, canonicalTitle: "검증 문서" });

test("snapshot overlap disabled by default, safe when browser storage is blocked", () => {
  assert.equal(isWikiSnapshotOverlapEnabled({getItem:()=>null}),false);
  assert.equal(isWikiSnapshotOverlapEnabled({getItem:()=>"1"}),true);
  assert.equal(isWikiSnapshotOverlapEnabled({getItem(){throw Error("denied")}}),false);
});

test("trusted snapshot starts before link pagination finishes; move awaits the exact same result", async () => {
  let calls = 0;
  let finish;
  const snapshot = new Promise(resolve => { finish = resolve; });
  const overlap = createWikiSnapshotOverlap({
    enabled: true,
    ensureSnapshot: async page => { calls++; assert.equal(page.pageId,"42"); return snapshot; },
  });
  overlap.onDocumentReady(id());
  await Promise.resolve();
  assert.equal(calls,1, "server-side independent snapshot starts eagerly");
  let finished = false;
  const gate = overlap.ensure(id()).then(()=> { finished=true; });
  await Promise.resolve();
  assert.equal(finished,false, "never authorize move before server snapshot finishes");
  finish({snapshotId:"trusted-server-id"});
  await gate;
  assert.equal(finished,true);
  assert.equal(calls,1,"no duplicate snapshot creation");
});

test("revision/title mismatch forces ordinary authoritative snapshot, never reuses wrong identity",async()=>{
  let calls=0;
  const overlap=createWikiSnapshotOverlap({
    enabled:true,
    ensureSnapshot:async page=>{calls++; return {snapshotId:"trusted-"+page.revisionId};},
  });
  overlap.onDocumentReady(id("42","100"));
  const result=await overlap.ensure(id("42","101"));
  assert.equal(result.snapshotId,"trusted-101");
  assert.equal(calls,2);
});

test("disabled optimization and aborted requests preserve baseline snapshot",async()=>{
  let calls=0;
  const ctrl=new AbortController();
  const make = enabled => createWikiSnapshotOverlap({
    enabled,
    signal:ctrl.signal,
    ensureSnapshot:async()=>({snapshotId:"trusted-"+ ++calls}),
  });
  const disabled=make(false);
  disabled.onDocumentReady(id());
  assert.equal((await disabled.ensure(id())).snapshotId,"trusted-1");
  ctrl.abort();
  const aborted=make(true);
  aborted.onDocumentReady(id());
  assert.equal((await aborted.ensure(id())).snapshotId,"trusted-2");
  assert.equal(calls,2);
});

test("rejection from early snapshot remains fatal at the movement gate",async()=>{
  const overlap=createWikiSnapshotOverlap({
    enabled:true,
    ensureSnapshot:async()=> { throw new Error("WIKI_SNAPSHOT_FAILED"); },
  });
  overlap.onDocumentReady(id());
  await assert.rejects(overlap.ensure(id()),/WIKI_SNAPSHOT_FAILED/);
});

test("real fetchPageData announces document identity while full links still loading",async t=>{
  const oldFetch=globalThis.fetch;
  const title="위키오버랩병렬검증-20261030";
  let resolveLinks;
  let docReady=false;
  let queryComplete=false;
  const linksWait=new Promise(resolve=>{resolveLinks=resolve;});
  globalThis.fetch=async(rawUrl)=>{
    const u=new URL(rawUrl);
    if(u.pathname.includes("/page/summary/"))return Response.json({title,extract:"요약"});
    if(u.searchParams.get("action")==="parse")
      return Response.json({parse:{title,pageid:42,revid:100,text:{"*":'<div class="mw-parser-output"><p><a href="/wiki/서울">서울</a></p></div>'}}});
    if(u.searchParams.get("action")==="query") {
      await linksWait;
      queryComplete=true;
      return Response.json({query:{pages:{42:{title,pageid:42,links:[{ns:0,title:"서울"}]}}}});
    }
    throw Error("unexpected wikipedia endpoint");
  };
  t.after(()=>{globalThis.fetch=oldFetch;});
  const request=fetchPageData(title,{onDocumentReady:page=>{
    assert.equal(page.pageId,"42");
    assert.equal(page.revisionId,"100");
    assert.equal(queryComplete,false,"callback precedes complete link pagination");
    docReady=true;
  }});
  for(let i=0;i<12&&!docReady;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(docReady,true);
  resolveLinks();
  const page=await request;
  assert.equal(page.links.length,1);
  assert.equal(page.links[0],"서울");
});

test("browser full HTML anchors and server authorized graph agree at first, middle and final links",()=>{
  const titles=Array.from({length:1551},(_,i)=>"유효 문서 "+i);
  const html='<div class="mw-parser-output">'+titles.map(title=>
    '<p><a href="/wiki/'+encodeURIComponent(title.replaceAll(" ","_"))+'">'+title+'</a></p>'
  ).join("")+
  '<p><a href="/wiki/파일:가짜">파일 링크</a></p></div>';
  const apiLinks=titles.map(title=>({ns:0,title}));
  const clientTitles=selectAllowedLinkTitlesFromHtml(html,apiLinks,"출발 문서");
  const body=extractSnapshotBodyLinks(html);
  const identities=new Map(titles.map((title,i)=>[snapshotTitleKey(title),{title,pageId:String(5000+i)}]));
  const graph=buildSnapshotLinkRows(body,identities,"99999");
  const audit=auditSnapshotLinkRows(body,identities,"99999",graph);
  assert.equal(clientTitles.length,1551);
  assert.equal(graph.length,1551);
  assert.deepEqual(clientTitles,graph.map(link=>link.targetTitle));
  assert.deepEqual(audit.samplePresent,[true,true,true]);
  assert.equal(audit.missingCount,0);
  const broken=auditSnapshotLinkRows(body,identities,"99999",graph.slice(0,-1));
  assert.equal(broken.missingCount,1);
  assert.deepEqual(broken.samplePresent,[true,true,false],"last-page truncation must fail");
});

test("redirect aliases and repeated links collapse by page ID, without dropping unrelated targets",()=>{
  const html='<a href="/wiki/별칭_문서">별칭</a><a href="/wiki/정식_문서">정식</a>'+
    '<a href="/wiki/독립_문서">독립</a><a href="/wiki/독립_문서#부분">동일 문서</a>';
  const body=extractSnapshotBodyLinks(html);
  const identities=new Map([
    [snapshotTitleKey("별칭 문서"),{pageId:"55",title:"정식 문서"}],
    [snapshotTitleKey("정식 문서"),{pageId:"55",title:"정식 문서"}],
    [snapshotTitleKey("독립 문서"),{pageId:"56",title:"독립 문서"}],
  ]);
  const rows=buildSnapshotLinkRows(body,identities,"9");
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.targetPageId),["55","56"]);
  assert.equal(auditSnapshotLinkRows(body,identities,"9",rows).missingCount,0);
});

test("all mode handlers require snapshot before movement RPC; cached links read all DB pages",()=>{
  for(const [path,rpc] of [
    ["pages/GamePage.jsx","applyAuthenticatedSingleMove"],
    ["pages/MultiplayerGamePage.jsx","applyDuelMoveV2"],
    ["pages/GroupGamePage.jsx","applyGroupMoveV2"],
  ]) {
    const code=readFileSync(new URL("../"+path,import.meta.url),"utf8");
    assert.match(code,/createWikiSnapshotOverlap/);
    assert.match(code,/onDocumentReady: overlap\.onDocumentReady/);
    assert.match(code,/await overlap\.ensure\(/);
    const movement=code.slice(code.indexOf("const handleMove ="));
    assert.ok(movement.indexOf("await overlap.ensure(")<movement.indexOf(rpc+"({"),path+" must await authority first");
  }
  const server=readFileSync(new URL("../supabase/functions/wiki-snapshot/index.ts",import.meta.url),"utf8");
  assert.match(server,/extractSnapshotBodyLinks/);
  assert.match(server,/auditSnapshotLinkRows/);
  assert.match(server,/for \(let offset = 0; ; offset \+= pageSize\)/);
  assert.match(server,/\.range\(offset, offset \+ pageSize - 1\)/);
});
