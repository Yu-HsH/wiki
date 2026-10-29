import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPath } from '../scripts/verify-daily-course-pool.mjs';

function query({ broken = false, repeated = false, missing = false } = {}) {
  return async params => ({ url: 'https://ko.wikipedia.org/w/api.php', result: { query: { pages: [{
    title: params.titles, ns: 0, pageid: repeated ? 1 : params.titles === 'A' ? 1 : 2,
    missing, revisions: [{ revid: 10 }], links: broken ? [] : [{ ns: 0, title: params.pltitles }],
  }] } } });
}
test('course verification records real identities and every edge, canonical source URLs', async () => {
  const course = await verifyPath(['A','B'], query());
  assert.equal(course.nodes[0].pageId,'1');assert.equal(course.edges.length,1);
  assert.equal(course.startTitle,'A');assert.equal(course.targetTitle,'B');
});
test('course verification rejects missing links/articles and repeated page IDs', async () => {
  for (const options of [{broken:true},{repeated:true},{missing:true}]) {
    await assert.rejects(verifyPath(['A','B'],query(options)));
  }
});
