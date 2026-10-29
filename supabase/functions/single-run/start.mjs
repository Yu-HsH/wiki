import { selectRandomCourse } from './random.mjs';

// Reserved Single contract. Legacy create/move/recovery handlers remain intact.
export async function handleSingleStart(req, body, { db, url, serviceKey, json, sha256, fetcher = fetch }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let userId = null, guestHash = null;
  if (body.actor === 'guest') {
    if (typeof body.guestToken !== 'string' || body.guestToken.length < 32 || body.guestToken.length > 256) return json({ ok: false, code: 'GUEST_TOKEN_REQUIRED' }, 400);
    guestHash = await sha256(body.guestToken);
  } else if (body.actor === 'member') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
    userId = data.user.id;
  } else return json({ ok: false, code: 'OWNER_REQUIRED' }, 400);
  const rpc = async (name, args) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details, hint: error.hint, rpc: name });
    return Array.isArray(data) ? data[0] : data;
  };
  const owner = { p_user_id: userId, p_guest_hash: guestHash };
  const control = action => rpc('control_single_start_v1', { ...owner, p_run_id: body.runId, p_action: action });
  if (body.action !== 'allocate' && !uuid.test(body.runId || '')) return json({ ok: false, code: 'RUN_ID_REQUIRED' }, 400);
  if (body.action === 'allocate') {
    if (!uuid.test(body.requestId || '') || Object.keys(body).some(key => !['action','actor','guestToken','requestId','mode','customTarget'].includes(key))) return json({ ok: false, code: 'INVALID_ALLOCATION_REQUEST' }, 400);
    if (body.mode === 'custom' && (typeof body.customTarget !== 'string' || !body.customTarget.trim() || body.customTarget.length > 500)) return json({ ok: false, code: 'INVALID_CUSTOM_TARGET' }, 400);
    if (body.mode === 'random' && body.customTarget != null && body.customTarget !== '') return json({ ok: false, code: 'INVALID_ALLOCATION_REQUEST' }, 400);
    const claim = await rpc('claim_single_course_v1', { ...owner, p_request_id: body.requestId, p_mode: body.mode, p_target: body.customTarget || null });
    if (claim.code !== 'SELECT_COURSE') return json(claim);
    if (claim.mode === 'random') {
      try {
        const { start, goal } = await selectRandomCourse({ fetcher, url, serviceKey });
        return json(await rpc('commit_single_course_v1', { ...owner, p_allocation_id: claim.allocationId, p_start: start, p_goal: goal, p_daily_date: null }));
      } catch (error) {
        if (['ALLOCATION_EXPIRED', 'RANDOM_DOCUMENT_UNAVAILABLE'].includes(error?.code)) return json({ ok: false, code: error.code });
        throw error;
      }
    }
    // One bounded server claim owns all selection, canonicalization and snapshot work.
    const deadline = Date.now() + 29000;
    const bounded = async (address, options = {}) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('ALLOCATION_EXPIRED');
      const response = await fetcher(address, { ...options, signal: AbortSignal.timeout(Math.min(remaining, 12000)) });
      if (!response.ok) throw new Error('COURSE_DOCUMENT_UNAVAILABLE');
      return response.json();
    };
    const snapshot = async title => {
      const data = await bounded(`${url}/functions/v1/wiki-snapshot`, { method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }) });
      if (!data.snapshotId || !data.pageId || !data.revisionId || !data.canonicalTitle) throw new Error('COURSE_IDENTITY_REQUIRED');
      return data;
    };
    let startTitle, targetTitle, dailyDate = null;
    if (claim.mode === 'daily') {
      const course = await rpc('ensure_today_daily_challenge', {});
      if (!course?.start_title || !course?.target_title) throw new Error('DAILY_COURSE_UNAVAILABLE');
      startTitle = course.start_title; targetTitle = course.target_title; dailyDate = course.challenge_date;
    } else {
      targetTitle = claim.target;
    }
    const goal = await snapshot(targetTitle);
    let start;
    if (claim.mode === 'daily') start = await snapshot(startTitle);
    else {
      // Preserve fetchDistinctRandomTitle's existing Wikipedia namespace-0 source
      // and 12-attempt bound. The browser supplies no departure candidate.
      for (let attempt = 0; attempt < 12; attempt++) {
        const data = await bounded('https://ko.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', list: 'random', rnnamespace: '0', rnlimit: '1', format: 'json' }),
          { headers: { 'User-Agent': 'WikiRace/2.0 (https://wiki-dusky-one.vercel.app) supabase-edge-functions' } });
        const title = data?.query?.random?.[0]?.title;
        if (!title) throw new Error('COURSE_DOCUMENT_UNAVAILABLE');
        const candidate = await snapshot(title);
        if (String(candidate.pageId) !== String(goal.pageId)) { start = candidate; break; }
      }
    }
    if (!start || String(start.pageId) === String(goal.pageId)) throw new Error('DISTINCT_COURSE_REQUIRED');
    return json(await rpc('commit_single_course_v1', { ...owner, p_allocation_id: claim.allocationId, p_start: start, p_goal: goal, p_daily_date: dailyDate }));
  }
  if (body.action === 'document') {
    const state = await control('snapshot');
    if (!state.ok || !['prepared','scheduled','active'].includes(state.run.status)) return json(state);
    const run = state.run;
    const response = await fetcher(`${url}/functions/v1/wiki-snapshot`, { method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: run.current_title_snapshot, pageId: run.current_page_id, revisionId: run.current_revision_id, includeDocument: true }),
      signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('COURSE_DOCUMENT_UNAVAILABLE');
    const page = await response.json();
    if (String(page.pageId) !== run.current_page_id || String(page.revisionId) !== run.current_revision_id || typeof page.documentHtml !== 'string'
      || (run.run_mode === 'random' && page.canonicalTitle !== run.current_title_snapshot)) throw new Error('COURSE_IDENTITY_MISMATCH');
    // Reading HTML can be slow. Return a fresh DB clock/state after the fetch,
    // never the old timestamp captured before document loading on F5.
    const latest = await control('snapshot');
    if (latest.run.current_page_id !== String(page.pageId) || latest.run.current_revision_id !== String(page.revisionId)) return json({ ok: false, code: 'DOCUMENT_STATE_CHANGED' });
    return json({ ...latest, page });
  }
  const action = { reserve_start: 'reserve', start: 'start', snapshot_v1: 'snapshot', leave_v1: 'leave' }[body.action];
  if (!action) return json({ ok: false, code: 'UNSUPPORTED_ACTION' }, 400);
  return json(await control(action));
}
