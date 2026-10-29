import { supabase, isSupabaseConfigured } from '../supabaseClient.js';
import { sanitizeWikiDocument, selectDeterministicQuickLinks } from './wikiService.js';
import { SINGLE_START_ERRORS } from '../utils/singleStart.js';
import { singleStartFailure } from '../utils/serviceError.js';

export async function requestSingleStart(action, { isGuest, guestToken, ...payload }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('SERVER_GAME_UNAVAILABLE');
  const { data, error } = await supabase.functions.invoke('single-run', {
    body: { action, actor: isGuest ? 'guest' : 'member', ...(isGuest ? { guestToken } : {}), ...payload },
  });
  if (error) throw await singleStartFailure(error, data);
  if (!data?.ok) {
    const failure = await singleStartFailure(null, data);
    if (SINGLE_START_ERRORS[data?.code]) failure.message = SINGLE_START_ERRORS[data.code];
    failure.code = data?.code; failure.run = data?.run; throw failure;
  }
  return data;
}

export function normalizeSinglePreparedPage(page) {
  const allowed = (page.links || []).map(link => ({ title: link.title || link.targetTitle }));
  const clean = sanitizeWikiDocument(page.documentHtml, { currentTitle: page.canonicalTitle, apiLinks: allowed });
  return { pageId: String(page.pageId), revisionId: String(page.revisionId), title: page.canonicalTitle,
    canonicalTitle: page.canonicalTitle, summary: '', documentHtml: clean.html, links: clean.linkTitles,
    quickLinks: selectDeterministicQuickLinks(clean.linkTitles, { canonicalTitle: page.canonicalTitle, revisionId: page.revisionId, maxCount: 20 }) };
}
