import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { parse, serialize } from "npm:parse5@7.3.0";
import { buildSearchDocument, SEARCH_DOCUMENT_POLICY } from "../duel-search/document.mjs";
import { createDocumentSingleFlight } from "../duel-search/singleflight.mjs";
import { readLinkSections } from "./sections.mjs";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const documents = createDocumentSingleFlight();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: cors });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ ok: false, code: "AUTH_REQUIRED" }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return reply({ ok: false, code: "AUTH_REQUIRED" }, 401);

    const input = await request.json().catch(() => null);
    if (!input || Object.keys(input).length !== 2 ||
        typeof input.roomId !== "string" || !uuid.test(input.roomId) ||
        typeof input.windowId !== "string" || !uuid.test(input.windowId)) {
      return reply({ ok: false, code: "INVALID_SEARCH_INPUT" }, 400);
    }

    const member = createClient(url, publicKey, { accessToken: async () => token });
    const scope = { p_room: input.roomId, p_window: input.windowId };
    const { data: source, error: sourceError } = await member.rpc("get_duel_v4_search_source", scope);
    if (sourceError) throw sourceError;
    if (!source?.ok) return reply({ ok: false, code: "SEARCH_UNAVAILABLE" }, 403);
    if (source.documentHtml && (!source.needsSections || source.sectionsReady)) return reply(source);

    const doc = await documents(JSON.stringify([SEARCH_DOCUMENT_POLICY, source.pageId, source.revisionId]), async () => {
      const response = await fetch(url + "/functions/v1/wiki-snapshot", {
        method: "POST",
        headers: { Authorization: "Bearer " + serviceKey, apikey: serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: source.title, pageId: source.pageId, revisionId: source.revisionId, includeDocument: true,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error("SEARCH_DOCUMENT_UNAVAILABLE");
      const page = await response.json();
      if (String(page.pageId) !== source.pageId || String(page.revisionId) !== source.revisionId) {
        throw new Error("SEARCH_DOCUMENT_IDENTITY_MISMATCH");
      }
      return buildSearchDocument(page.documentHtml, { currentTitle: page.canonicalTitle, links: page.links }, { parse, serialize });
    });

    const { data, error } = await admin.rpc("store_duel_v4_prepared_document", {
      ...scope, p_actor: auth.user.id, p_snapshot: source.snapshotId, p_html: doc.documentHtml, p_text_nodes: doc.textNodes,
      p_sections: readLinkSections(doc.documentHtml, parse),
    });
    if (error) throw error;
    if (data?.ok && data.needsSections && !data.sectionsReady) return reply({ ok: false, code: "SEARCH_SOURCE_CHANGED" }, 409);
    return reply(data, data?.ok ? 200 : 409);
  } catch {
    return reply({ ok: false, code: "SEARCH_DOCUMENT_UNAVAILABLE" }, 503);
  }
});
