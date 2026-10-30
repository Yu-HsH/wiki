import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  WIKI_IDENTITY_BATCH_CONCURRENCY,
  mapWikiIdentityBatchesOrdered,
} from "../supabase/functions/wiki-snapshot/identityBatchQueue.js";

test("all 1,551 titles are preserved across 32 ordered 50-title batches", async () => {
  const titles = Array.from({ length:1551 }, (_,i)=>"문서 "+i);
  const batches = [];
  for(let i=0;i<titles.length;i+=50) batches.push(titles.slice(i,i+50));
  let active=0, peak=0, calls=0;
  const results=await mapWikiIdentityBatchesOrdered(batches,async (batch,index)=>{
    calls++;
    active++;
    peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,(index%4)*2+1));
    active--;
    return batch.map(s=>s+" :: "+index);
  });
  assert.equal(WIKI_IDENTITY_BATCH_CONCURRENCY,3);
  assert.equal(peak,3);
  assert.equal(active,0);
  assert.equal(calls,32);
  assert.equal(results.length,32);
  assert.equal(results.flat().length,1551);
  assert.equal(results.flat().at(-1),"문서 1550 :: 31");
  assert.deepEqual(results.flat().map(s=>s.split(" :: ")[0]),titles);
});

test("failed identity batch aborts the snapshot operation instead of saving partial links", async()=>{
  await assert.rejects(
    mapWikiIdentityBatchesOrdered([["a"],["b"],["c"],["d"]],async (_,index)=>{
      if(index===1)throw new Error("Wikipedia 429");
      return {index};
    }),
    /Wikipedia 429/
  );
});

test("empty and single-batch pages preserve exact output",async()=>{
  assert.deepEqual(await mapWikiIdentityBatchesOrdered([],async()=>{throw Error("unexpected")}),[]);
  assert.deepEqual(await mapWikiIdentityBatchesOrdered([["a","b"]],async x=>x),[["a","b"]]);
});

test("disallow unbounded or noninteger concurrency",async()=>{
  await assert.rejects(mapWikiIdentityBatchesOrdered([["a"]],async x=>x,5),RangeError);
  await assert.rejects(mapWikiIdentityBatchesOrdered([["a"]],async x=>x,0),RangeError);
  await assert.rejects(mapWikiIdentityBatchesOrdered([["a"]],async x=>x,1.5),RangeError);
});

test("edge function still resolves 50-title slices into the same full snapshot graph",()=>{
  const edge=readFileSync(new URL("../supabase/functions/wiki-snapshot/index.ts",import.meta.url),"utf8");
  assert.match(edge,/titles\.slice\(index, index \+ 50\)/);
  assert.match(edge,/mapWikiIdentityBatchesOrdered\(batches/);
  assert.match(edge,/for \(const data of pages\)/);
  assert.match(edge,/pageIdentities\.get\(titleKey\(bodyLink\.title\)\)/);
  assert.match(edge,/uniqueLinks\.set\(targetPageId,/);
  assert.match(edge,/supabase\.rpc\("replace_wiki_snapshot_v2"/);
  assert.doesNotMatch(edge,/uniqueTitles\(bodyLinks\.map\(.*\)\)\.slice\(/);
});
