// Fixed Wikipedia revisions, byte-for-byte baseline comparison, and process CPU
// profiling. Node measurements are distinct from the Edge's hard CPU limit.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parse,serialize} from 'parse5';
import {countSearchMatches} from '../supabase/functions/duel-search/document.mjs';
import {extractSnapshotBodyLinks} from '../supabase/functions/wiki-snapshot/snapshotLinkGraph.js';

const corpus=path.resolve(process.env.SEARCH_CORPUS||'../../.temp/search-release-gate-20261102/corpus');
const output=path.resolve('.temp/search-cpu-20261103');fs.mkdirSync(output,{recursive:true});
const baseline=spawnSync('git',['show','96fec9b:supabase/functions/duel-search/document.mjs'],{encoding:'utf8'});assert.equal(baseline.status,0);
const instrument=source=>source
  .replace('  const doc=parser.parse(rawHtml)',"  parser.checkpoint('input_guard');\n  const doc=parser.parse(rawHtml)")
  .replace('  const prune=n=>',"  parser.checkpoint('source_parse_and_root');\n  const prune=n=>")
  .replace('if(root)prune(root);',"if(root)prune(root);parser.checkpoint('prune_and_text_predicate');")
  .replace('  const render=n=>',"  parser.checkpoint('link_index');\n  const render=n=>")
  .replace('  // Canonicalize once more:',"  parser.checkpoint('render');\n  // Canonicalize once more:")
  .replace('  const finalBody=',"  parser.checkpoint('canonicalize_and_serialize');\n  const finalBody=")
  .replace('  return {documentHtml,textNodes,policyVersion:',"  parser.checkpoint('final_parse_and_manifest');\n  return {documentHtml,textNodes,policyVersion:");
fs.writeFileSync(path.join(output,'baseline.mjs'),instrument(baseline.stdout));
const original=await import(pathToFileURL(path.join(output,'baseline.mjs')));
fs.writeFileSync(path.join(output,'optimized.mjs'),instrument(fs.readFileSync('supabase/functions/duel-search/document.mjs','utf8')));
const optimized=await import(pathToFileURL(path.join(output,'optimized.mjs')));
let seed=65;
const pick=a=>a[(seed=(seed*1664525+1013904223)>>>0)%a.length];
const tags=['p','li','table','td','h2','a','span','script','sup','pre','template','svg','foreignObject','unknown'];
const values=[' ','&amp;','&lt;a&gt;','한글','\n\n','A.b','<img src="//upload.wikimedia.org/x">'];
for(let n=0;n<1000;n++){
  let html='';for(let i=0;i<12;i++){const tag=pick(tags);html+='<'+tag+(tag==='a'?' href="/wiki/Target"':tag==='sup'?' class="reference"':'')+'>'+pick(values)+(i%2?'</'+tag+'>':'');}
  const options={currentTitle:'Here',links:[{title:'Target'}]},parser={parse,serialize,checkpoint:()=>{}};
  assert.deepEqual(optimized.buildSearchDocument(html,options,parser),original.buildSearchDocument(html,options,parser),'deterministic malformed fixture '+n);
}
console.log('1000 malformed/entity/table/namespace fixtures identical');
const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const trials=[];
function run(build,raw,options){
  globalThis.gc?.();const wall=performance.now(),cpu=process.cpuUsage(),memory=process.memoryUsage();let maxHeap=memory.heapUsed,parses=0;
  const stages=[],phases=[];let previousWall=wall,previousCpu=cpu;
  const checkpoint=name=>{const at=performance.now(),used=process.cpuUsage(),m=process.memoryUsage();phases.push({name,wallMs:at-previousWall,cpuMs:(used.user+used.system-previousCpu.user-previousCpu.system)/1000,heapUsed:m.heapUsed,rss:m.rss});previousWall=at;previousCpu=used;};
  const measure=(name,work)=>{const t=performance.now(),c=process.cpuUsage();const result=work();const delta=process.cpuUsage(c),m=process.memoryUsage();maxHeap=Math.max(maxHeap,m.heapUsed);stages.push({name,wallMs:performance.now()-t,cpuMs:(delta.user+delta.system)/1000,heapUsed:m.heapUsed,rss:m.rss});return result;};
  const document=build(raw,options,{checkpoint,parse:html=>measure(++parses===1?'source_parse':html.length===raw.length?'source_parse':'parse_'+parses,()=>parse(html)),serialize:body=>measure('serialize',()=>serialize(body))});
  const used=process.cpuUsage(cpu),end=process.memoryUsage(),wallMs=performance.now()-wall,cpuMs=(used.user+used.system)/1000;
  return {document,metrics:{wallMs,cpuMs,parseCalls:parses,heapDelta:end.heapUsed-memory.heapUsed,maxObservedHeap:maxHeap,rss:end.rss,stages,phases,nonParserWallMs:wallMs-stages.reduce((a,s)=>a+s.wallMs,0),nonParserCpuMs:cpuMs-stages.reduce((a,s)=>a+s.cpuMs,0)}};
}
const index=JSON.parse(fs.readFileSync(path.join(corpus,'index.json'),'utf8'));
for(const file of ['00.json','01.json','02.json','04.json','05.json']){
  const meta=index.find(m=>m.file===file),page=JSON.parse(fs.readFileSync(path.join(corpus,file),'utf8')).parse,raw=page.text['*'];
  assert.equal(String(page.revid),meta.revisionId);assert.equal(String(page.pageid),meta.pageId);
  const allowed=new Set(page.links.filter(l=>l.ns===0).map(l=>l['*']));
  const options={currentTitle:page.title,links:extractSnapshotBodyLinks(raw).filter(l=>allowed.has(l.title))};
  for(let n=0;n<5;n++){
    const before=run(original.buildSearchDocument,raw,options),after=run(optimized.buildSearchDocument,raw,options);
    assert.deepEqual(after.document,before.document,meta.title+' canonical HTML / text-node manifest / policy');
    const queries=[meta.title.slice(0,2),'대한','a','A','[literal]','a.b','&','한글','선거',' ',...after.document.textNodes.filter(t=>t.trim()).slice(0,30).map(t=>t.trim().slice(0,4))];
    for(const query of queries)assert.equal(countSearchMatches(after.document.textNodes,query),original.countSearchMatches(before.document.textNodes,query));
    const destinations=html=>{const result=[];const visit=n=>{if(n.tagName==='a')result.push(n.attrs);for(const c of n.childNodes||[])visit(c)};visit(parse(html));return result};
    assert.deepEqual(destinations(after.document.documentHtml),destinations(before.document.documentHtml));
    trials.push({title:meta.title,revision:meta.revisionId,n,before:before.metrics,after:after.metrics,identical:true,queries:queries.length,htmlSha256:createHash('sha256').update(after.document.documentHtml).digest('hex'),textNodes:after.document.textNodes.length});
    console.log(meta.title,n,Math.round(before.metrics.cpuMs),'=>',Math.round(after.metrics.cpuMs),'CPU ms; parse calls',before.metrics.parseCalls,'=>',after.metrics.parseCalls);
  }
}
fs.writeFileSync(path.join(output,'profile.json'),JSON.stringify({date:'2026-11-03 KST',base:sha,workingTree:true,runtime:process.version,malformedDifferentialFixtures:1000,memory:'heap at parser boundaries, not a continuous peak; --expose-gc before each build',trials},null,2));
