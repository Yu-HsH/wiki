// Server-owned Wikipedia random selection. No difficulty or curated candidate data.
const WIKI_API = 'https://ko.wikipedia.org/w/api.php';
const USER_AGENT = 'WikiRace/2.0 (https://wiki-dusky-one.vercel.app) supabase-edge-functions';
const validId = value => /^[1-9][0-9]*$/.test(String(value ?? ''));
const failure = code => Object.assign(new Error(code), { code });

// The same monotonic budget covers fetch AND JSON body reads, even if a transport
// ignores abort. Each timeout also cancels the actual fetch where supported.
export function allocationTransport(fetcher, { now = () => performance.now(), totalMs = 29000, requestMs = 12000 } = {}) {
  // Stop external work slightly before the 29s ceiling so abort delivery and
  // response cleanup have headroom. This does not extend the DB's 30s lease.
  const deadline = now() + totalMs - Math.min(100, totalMs / 100);
  const remaining = () => deadline - now();
  const json = async (address, options = {}) => {
    if (remaining() <= 0) throw failure('ALLOCATION_EXPIRED');
    const controller = new AbortController();
    let timer;
    const limit = Math.min(requestMs, remaining());
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(failure(remaining() <= 0 ? 'ALLOCATION_EXPIRED' : 'RANDOM_DOCUMENT_UNAVAILABLE'));
      }, limit);
    });
    try {
      const work = (async () => {
        const response = await fetcher(address, { ...options, signal: controller.signal });
        if (!response.ok) throw failure([404, 409].includes(response.status) ? 'RANDOM_CANDIDATE_INVALID' : 'RANDOM_DOCUMENT_UNAVAILABLE');
        const result = await response.json();
        if (remaining() <= 0) throw failure('ALLOCATION_EXPIRED');
        if (result?.error) throw failure('RANDOM_DOCUMENT_UNAVAILABLE');
        return result;
      })();
      return await Promise.race([work, timeout]);
    } catch (error) {
      if (remaining() <= 0) throw failure('ALLOCATION_EXPIRED');
      if (error?.code) throw error;
      throw failure('RANDOM_DOCUMENT_UNAVAILABLE');
    } finally { clearTimeout(timer); controller.abort(); }
  };
  return { json, remaining };
}

export async function selectRandomCourse({ fetcher = fetch, url, serviceKey, transport = allocationTransport(fetcher), maxAttempts = 12 }) {
  let start = null, goal = null;
  for (let attempt = 0; attempt < maxAttempts && !goal; attempt++) {
    if (transport.remaining() <= 0) throw failure('ALLOCATION_EXPIRED');
    try {
      // One independent draw per endpoint: multi-page Random results have a
      // fixed successor sequence. Resolve namespace and revision in this query.
      const data = await transport.json(WIKI_API + '?' + new URLSearchParams({
        action: 'query', generator: 'random', grnnamespace: '0', grnlimit: '1',
        grnfilterredir: 'nonredirects', prop: 'info|revisions', rvprop: 'ids',
        redirects: '1', format: 'json', formatversion: '2',
      }), { headers: { 'User-Agent': USER_AGENT } });
      const pages = Object.values(data?.query?.pages ?? {});
      const page = pages.length === 1 ? pages[0] : null;
      const revision = page?.revisions?.[0]?.revid;
      if (!page || page.ns !== 0 || page.missing !== undefined || page.invalid !== undefined
        || !validId(page.pageid) || !validId(revision) || typeof page.title !== 'string' || !page.title.trim()) continue;
      if (start && String(page.pageid) === start.pageId) continue;
      const identity = { pageId: String(page.pageid), revisionId: String(revision), canonicalTitle: page.title, namespace: 0 };
      const saved = await transport.json(`${url}/functions/v1/wiki-snapshot`, {
        method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: identity.canonicalTitle, pageId: identity.pageId, revisionId: identity.revisionId }),
      });
      if (!saved?.snapshotId || String(saved.pageId) !== identity.pageId
        || String(saved.revisionId) !== identity.revisionId || saved.canonicalTitle !== identity.canonicalTitle) continue;
      const candidate = { ...saved, ...identity };
      if (!start) start = candidate;
      else goal = candidate;
    } catch (error) {
      // Only invalid candidates can be redrawn. Outages never become rerolls.
      if (error?.code !== 'RANDOM_CANDIDATE_INVALID') throw error;
    }
  }
  if (transport.remaining() <= 0) throw failure('ALLOCATION_EXPIRED');
  if (!start || !goal) throw failure('RANDOM_DOCUMENT_UNAVAILABLE');
  return { start, goal };
}
