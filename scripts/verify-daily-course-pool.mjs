// Read-only Wikipedia verification. Produces a reviewable local audit, no DB writes.
import fs from 'node:fs/promises';
export const candidatePaths = [
  ['대한민국', '서울특별시', '한강'],
  ['컴퓨터', '인터넷', '월드 와이드 웹'],
  ['동물', '포유류', '고양이'],
  ['음식', '한국 요리', '김치'],
  ['스포츠', '축구', '국제 축구 연맹'],
  ['과학', '천문학', '지구'],
  ['대한민국', '한글', '훈민정음'],
  ['생물', '식물', '광합성'],
];

async function wiki(params) {
  const url = new URL('https://ko.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', ...params });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const response = await fetch(url, { headers: { 'User-Agent': 'WikiRaceCourseAudit/2.0.1 (https://github.com/Yu-HsH/wiki)' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.info);
  return { url: url.href, result };
}

export async function verifyPath(path, query = wiki) {
  const nodes = [];
  const edges = [];
  for (const title of path) {
    const evidence = await query({ titles: title, prop: 'revisions', rvprop: 'ids' });
    const page = evidence.result.query?.pages?.[0];
    if (!page || page.missing || page.ns !== 0 || !page.revisions?.[0]?.revid) throw new Error(`Invalid article: ${title}`);
    nodes.push({ title: page.title, pageId: String(page.pageid), revisionId: String(page.revisions[0].revid), evidenceUrl: evidence.url });
  }
  if (new Set(nodes.map(n => n.pageId)).size !== nodes.length) throw new Error('Course contains repeated page identity');
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i], to = nodes[i + 1];
    const evidence = await query({ titles: from.title, prop: 'links', plnamespace: '0', pllimit: 'max', pltitles: to.title });
    if (!evidence.result.query?.pages?.[0]?.links?.some(link => link.ns === 0 && link.title === to.title)) {
      throw new Error(`Missing real link: ${from.title} -> ${to.title}`);
    }
    edges.push({ from: from.title, to: to.title, evidenceUrl: evidence.url });
  }
  return { startTitle: nodes[0].title, targetTitle: nodes.at(-1).title, nodes, edges };
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/verify-daily-course-pool.mjs')) {
  const audit = { checkedAt: new Date().toISOString(), source: 'Korean Wikipedia Action API', valid: [], rejected: [] };
  for (const path of candidatePaths) {
    try { const course = await verifyPath(path); audit.valid.push(course); console.log(`PASS ${path.join(' -> ')}`); }
    catch (error) { audit.rejected.push({ path, reason: error.message }); console.log(`REJECT ${path.join(' -> ')}: ${error.message}`); }
  }
  await fs.mkdir('docs/agent/2.0x', { recursive: true });
  await fs.writeFile('docs/agent/2.0x/daily-course-pool-audit.json', JSON.stringify(audit, null, 2) + '\n');
  if (audit.valid.length < 5) process.exitCode = 1;
}
