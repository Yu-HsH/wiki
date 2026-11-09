import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpretWikipediaIdentity, reviewGoalTarget, summarizeBacklinkSample } from '../utils/dailyGoalTargetReview.js';
const manifest = JSON.parse(readFileSync(new URL('../data/research/daily-goal-target-review-20261109.json', import.meta.url), 'utf8'));
const base = { title: '발효', cachedIncomingSources: 26 };
const id = page => ({ query: { pages: [page] } });

test('24 candidates span six fields and are a research manifest only', () => {
  assert.equal(manifest.candidateTargets.length, 24);
  assert.equal(new Set(manifest.candidateTargets.map(x => x.title)).size, 24);
  assert.deepEqual([...new Set(manifest.candidateTargets.map(x => x.domain))].length, 6);
  assert.equal(manifest.candidateTargets.filter(x => x.existingActiveTarget).length, 2);
  assert.equal(manifest.existingActiveTargetReview.length, 17);
  assert.equal(manifest.mode, 'research_only_no_runtime_import');
  for (const row of manifest.candidateTargets) {
    assert.equal(row.mediaWikiPagepropsVerified, false);
    assert.equal(row.wikiViewerClickableVerified, false);
    assert.equal(typeof row.cachedIncomingSources, 'number');
    for(const banned of ['startTitle','start_title','moveCount','shortestPath','nHop','pathLength']) {
      assert.equal(Object.hasOwn(row, banned), false);
    }
  }
});

test('valid main-namespace article is identity-eligible but NOT production-approved', () => {
  const x = interpretWikipediaIdentity(id({title:'발효', pageid:100, ns:0, pageprops:{wikibase_item:'Q123'}}),'발효');
  assert.equal(x.state, 'eligible_metadata');
  assert.deepEqual(reviewGoalTarget({candidate:base,identity:x,backlinks:summarizeBacklinkSample({query:{backlinks:[{ns:0,title:'음식'}]}})}), {
    title:'발효',reviewState:'manual_gateway_and_wikiviewer_review',readyForAutomaticPool:false,
  });
});

test('disambiguation with empty-string pageprop is rejected; starting pages and navigation unaffected', () => {
  const x=interpretWikipediaIdentity(id({title:'동음이의',pageid:101,ns:0,pageprops:{disambiguation:''}}),'동음이의');
  assert.equal(x.state,'disambiguation');
  assert.equal(reviewGoalTarget({candidate:base,identity:x}).reviewState,'invalid_target_identity');
});

test('missing, invalid, non-main, and bad API responses fail closed', () => {
  assert.equal(interpretWikipediaIdentity(id({title:'없는문서',missing:true,ns:0}),'없는문서').state,'missing');
  assert.equal(interpretWikipediaIdentity(id({title:'위키백과:소개',pageid:123,ns:4}),'위키백과:소개').state,'not_general_article');
  assert.equal(interpretWikipediaIdentity({error:{code:'timeout'}},'발효').state,'unavailable');
  assert.equal(reviewGoalTarget({candidate:base}).readyForAutomaticPool,false);
});

test('backlink samples are never presented as complete Wikipedia counts',()=>{
  const b=summarizeBacklinkSample({query:{backlinks:[{ns:0,title:'가전제품'},{ns:0,title:'가전제품'},{ns:2,title:'사용자:누군가'}]},continue:{blcontinue:'next'}});
  assert.equal(b.observedSources,1);
  assert.equal(b.truncated,true);
  assert.deepEqual(b.sources,['가전제품']);
});
