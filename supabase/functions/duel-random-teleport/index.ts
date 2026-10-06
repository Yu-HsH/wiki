import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chooseDestination } from "./destination.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  let committing = false;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const member = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: identity, error: authError } = await member.auth.getUser();
    if (authError || !identity?.user) return json({ ok: false, code: "AUTH_REQUIRED" }, 401);
    const body = await req.json();
    if ([body.roomId, body.grantId, body.requestId, body.correlationId].some(id => typeof id !== "string" || !uuid.test(id))
      || Object.keys(body).some(key => !["roomId", "grantId", "requestId", "correlationId"].includes(key))) return json({ ok: false, code: "INVALID_ITEM_REQUEST" }, 400);
    const args = { p_room_id: body.roomId, p_grant_id: body.grantId, p_request_id: body.requestId, p_correlation_id: body.correlationId };
    const callUse = async () => {
      const { data, error } = await member.rpc("use_duel_item_v3", args);
      if (error) throw error;
      return data;
    };
    // The existing RPC performs auth/ownership/status/cooldown and duplicate replay.
    // For this joker it returns a read-only preflight when no destination is ready.
    // A retry may already have a prepared destination, so even this call can commit.
    committing = true;
    const initial = await callUse();
    if (initial?.code !== "RANDOM_DESTINATION_REQUIRED") return json(initial);
    committing = false;
    const deadline = Date.now() + 20000;
    const remaining = () => {
      const ms = deadline - Date.now();
      if (ms <= 0) throw new Error("RANDOM_LOOKUP_TIMEOUT");
      return AbortSignal.timeout(Math.min(ms, 7000));
    };
    const destination = await chooseDestination({ player: initial.player,
      wikiJson: async (params: Record<string, string>) => {
        const response = await fetch(`https://ko.wikipedia.org/w/api.php?${new URLSearchParams(params)}`, { headers: { "User-Agent": "WikiRace/2.0 (https://wiki-dusky-one.vercel.app) supabase-edge-functions" }, signal: remaining() });
        if (!response.ok) throw new Error("RANDOM_LOOKUP_FAILED");
        return response.json();
      },
      snapshot: async (page: unknown) => {
        const response = await fetch(`${url}/functions/v1/wiki-snapshot`, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" }, body: JSON.stringify({ ...page as object, requestId: body.requestId }), signal: remaining() });
        if (!response.ok) throw new Error("RANDOM_SNAPSHOT_FAILED");
        return response.json();
      },
    });
    if (!destination) return json({ ok: false, code: "RANDOM_DOCUMENT_UNAVAILABLE" });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: prepared, error: prepareError } = await admin.rpc("register_duel_random_destination_v1", {
      p_room_id: body.roomId, p_grant_id: body.grantId, p_request_id: body.requestId,
      p_user_id: identity.user.id, p_expected_version: initial.player.progress_version,
      p_page_id: destination.pageId, p_revision_id: destination.revisionId, p_namespace: destination.namespace,
    });
    if (prepareError) throw prepareError;
    if (!prepared?.ok) return json(prepared);
    committing = true;
    return json(await callUse()); // Movement + item consumption are one DB transaction.
  } catch (error) {
    console.error("duel random teleport failed", error instanceof Error ? error.message : "RPC error");
    // A lost commit response is ambiguous: re-read inventory instead of claiming no consumption.
    return json({ ok: false, code: committing ? "ITEM_STATE_UNKNOWN" : "RANDOM_DOCUMENT_UNAVAILABLE" });
  }
});
