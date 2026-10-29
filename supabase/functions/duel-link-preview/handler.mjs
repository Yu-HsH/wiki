const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const text = value => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

export function normalizePreviewSummary(data, pageId) {
  if (String(data?.pageid ?? "") !== pageId || !text(data?.extract)) throw new Error("PREVIEW_UNAVAILABLE");
  return { page_id: pageId, title: text(data.title), extract: text(data.extract), description: text(data.description) };
}

export async function fetchWikipediaPreview(title, pageId, timeoutMs, fetchImpl = fetch) {
  const response = await fetchImpl(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { Accept: "application/json", "User-Agent": "WikiRace/2.0 duel-link-preview" },
    signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
    redirect: "error", // no server-supplied arbitrary-host redirect
  });
  if (!response.ok) throw new Error("PREVIEW_UNAVAILABLE");
  return normalizePreviewSummary(await response.json(), pageId);
}

// Injected I/O lets tests use the same HTTP/lease/commit path without a test-only production endpoint.
export function createPreviewHandler({ authenticate, reserve, settle, fetchSummary = fetchWikipediaPreview, log = () => {} }) {
  return async request => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (request.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    let committing = false;
    try {
      const identity = await authenticate(request.headers.get("Authorization") ?? "");
      if (!identity?.userId) return json({ ok: false, code: "AUTH_REQUIRED" }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, code: "INVALID_PREVIEW_REQUEST" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)
        || [body.roomId, body.itemEventId, body.requestId].some(id => typeof id !== "string" || !uuid.test(id))
        || typeof body.targetPageId !== "string" || !body.targetPageId.trim() || body.targetPageId.length > 256
        || Object.keys(body).some(key => !["roomId", "itemEventId", "targetPageId", "requestId"].includes(key))) {
        return json({ ok: false, code: "INVALID_PREVIEW_REQUEST" }, 400);
      }
      const reserved = await reserve(identity, body);
      if (reserved?.code !== "PREVIEW_RESERVED") return json(reserved);
      const remaining = Date.parse(reserved.lease_until) - Date.parse(reserved.server_now);
      let summary = null;
      try {
        if (!(remaining > 0)) throw new Error("PREVIEW_UNAVAILABLE");
        summary = await fetchSummary(reserved.target_title, body.targetPageId, Math.min(5000, remaining));
      } catch {
        // Release only this token. A replaced token must never be released by an old request.
      }
      committing = true;
      const result = await settle(identity, body, reserved.lease_token, summary);
      return json(result);
    } catch (error) {
      log(error instanceof Error ? error.message : "preview I/O failed");
      return json({ ok: false, code: committing ? "PREVIEW_STATE_UNKNOWN" : "PREVIEW_UNAVAILABLE" });
    }
  };
}
