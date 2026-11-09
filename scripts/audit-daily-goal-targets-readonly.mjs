#!/usr/bin/env node
/**
 * Read-only candidate review. NO production credentials, Supabase calls, DB writes or gameplay hooks.
 *
 * Usage:
 *   node scripts/audit-daily-goal-targets-readonly.mjs
 *   node scripts/audit-daily-goal-targets-readonly.mjs --live
 *   node scripts/audit-daily-goal-targets-readonly.mjs --live --backlinks
 *
 * --live accesses public ko.wikipedia.org API only. Output is JSON on stdout.
 * --backlinks samples up to 100 nonredirect namespace-0 sources per target, never a complete count.
 */
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { interpretWikipediaIdentity, reviewGoalTarget, summarizeBacklinkSample } from '../utils/dailyGoalTargetReview.js';
const manifest = JSON.parse(readFileSync(new URL('../data/research/daily-goal-target-review-20261109.json', import.meta.url), 'utf8'));
const argv = new Set(process.argv.slice(2));
if ([...argv].some(arg => !['--live', '--backlinks', '--help'].includes(arg))) throw new Error('UNRECOGNIZED_ARG');
if (argv.has('--backlinks') && !argv.has('--live')) throw new Error('BACKLINKS_REQUIRES_LIVE');
if (argv.has('--help')) {
  process.stdout.write('Offline: no flags. Public Wikipedia metadata: --live. Also sample public backlinks: --live --backlinks. No DB/production writes.\n');
  process.exit(0);
}
const base = 'https://ko.wikipedia.org/w/api.php';
const api = async params => {
  const url = new URL(base);
  for (const [name, value] of Object.entries({ action: 'query', format: 'json', formatversion: '2', ...params })) url.searchParams.set(name, value);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WikiRaceGoalReview/0.1 (https://github.com/Yu-HsH/wiki; research-only)', Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`WIKI_HTTP_${response.status}`);
  const json = await response.json();
  if (json?.error) throw new Error(`WIKI_API_${json.error.code ?? 'UNKNOWN'}`);
  return json;
};
const result = {
  asOfKst: manifest.asOfKst,
  mode: argv.has('--live') ? (argv.has('--backlinks') ? 'public_metadata_and_sampled_backlinks' : 'public_metadata_only') : 'manifest_only',
  approvedForProduction: false,
  candidates: [],
};
for (const candidate of manifest.candidateTargets) {
  let identity = null;
  let backlinks = null;
  let error = null;
  if (argv.has('--live')) {
    try {
      const json = await api({ prop: 'info|pageprops', ppprop: 'disambiguation', redirects: '1', titles: candidate.title });
      identity = interpretWikipediaIdentity(json, candidate.title);
      if (argv.has('--backlinks') && identity.state === 'eligible_metadata') {
        const raw = await api({ list: 'backlinks', bltitle: identity.canonicalTitle, blnamespace: '0', blfilterredir: 'nonredirects', bllimit: '100' });
        backlinks = summarizeBacklinkSample(raw);
      }
    } catch (reason) {
      error = String(reason?.message || reason).slice(0, 120);
    }
    await sleep(400);
  }
  result.candidates.push({
    title: candidate.title,
    domain: candidate.domain,
    cachedIncomingSources: candidate.cachedIncomingSources,
    existingActiveTarget: candidate.existingActiveTarget,
    identity,
    backlinks,
    error,
    ...reviewGoalTarget({ candidate, identity, backlinks }),
  });
}
result.summary = {
  total: result.candidates.length,
  eligibleMetadata: result.candidates.filter(x => x.identity?.state === 'eligible_metadata').length,
  invalidMetadata: result.candidates.filter(x => ['missing','disambiguation','not_general_article'].includes(x.identity?.state)).length,
  apiErrors: result.candidates.filter(x => x.error).length,
  readyForAutomaticPool: result.candidates.filter(x => x.readyForAutomaticPool).length,
};
console.log(JSON.stringify(result, null, 2));
