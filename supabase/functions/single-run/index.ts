import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(URL, SERVICE_ROLE_KEY);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function invalid(code: string, status = 400) {
  return json({ ok: false, code }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return invalid("METHOD_NOT_ALLOWED", 405);
  try {
    const body = await req.json();
    const token = String(body?.guestToken || "");
    if (token.length < 32) return invalid("GUEST_TOKEN_REQUIRED");
    const tokenHash = await sha256(token);
    const action = String(body?.action || "");

    if (action === "create") {
      const run = body.run;
      if (!run?.runId || !run.start?.pageId || !run.start?.revisionId || !run.target?.pageId) return invalid("RUN_IDENTITY_REQUIRED");
      const { data: existing, error: existingError } = await db.from("single_game_runs").select("*").eq("id", String(run.runId)).maybeSingle();
      if (existingError) throw existingError;
      if (existing && existing.guest_token_hash !== tokenHash) return invalid("RUN_ID_IN_USE", 409);
      if (existing) return json({ ok: true, code: "ALREADY_CREATED", run: existing });
      const { data, error } = await db.from("single_game_runs").insert({
        id: run.runId,
        guest_token_hash: tokenHash,
        user_id: null,
        start_page_id: String(run.start.pageId),
        start_revision_id: String(run.start.revisionId),
        start_title_snapshot: run.start.canonicalTitle || run.start.title,
        target_page_id: String(run.target.pageId),
        target_revision_id: run.target.revisionId == null ? null : String(run.target.revisionId),
        target_title_snapshot: run.target.canonicalTitle || run.target.title,
        current_page_id: String(run.start.pageId),
        current_revision_id: String(run.start.revisionId),
        current_title_snapshot: run.start.canonicalTitle || run.start.title,
        path_page_ids: [String(run.start.pageId)],
        path_revision_ids: [String(run.start.revisionId)],
        path_title_snapshots: [run.start.canonicalTitle || run.start.title],
        last_seen_at: new Date().toISOString(),
      }).select("*").single();
      if (error) throw error;
      return json({ ok: true, code: "CREATED", run: data });
    }

    const runId = String(body?.runId || "");
    if (action === "move") {
      const requestId = String(body?.requestId || "");
      if (!requestId) return invalid("REQUEST_ID_REQUIRED");
      const { data, error } = await db.rpc("apply_guest_single_move_v2", {
        p_run_id: runId,
        p_guest_token_hash: tokenHash,
        p_request_id: requestId,
        p_correlation_id: String(body?.correlationId || requestId),
        p_expected_version: Number(body?.expectedVersion),
        p_to_page_id: body?.nextPage?.pageId == null ? null : String(body.nextPage.pageId),
        p_clicked_raw_title: body?.clickedRawTitle || body?.nextPage?.title || null,
        p_event_type: String(body?.eventType || "NORMAL_LINK"),
      });
      if (error) throw error;
      return json(Array.isArray(data) ? data[0] : data);
    }

    const { data: run, error: readError } = await db.from("single_game_runs").select("*").eq("id", runId).eq("guest_token_hash", tokenHash).maybeSingle();
    if (readError) throw readError;
    if (!run) return invalid("RUN_NOT_FOUND", 404);
    if (run.expires_at && new Date(run.expires_at).getTime() <= Date.now() && run.status === "active") {
      await db.from("single_game_runs").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", run.id).eq("guest_token_hash", tokenHash);
      return json({ ok: false, code: "RUN_EXPIRED", run: { ...run, status: "expired" } });
    }
    if (action === "snapshot") return json({ ok: true, code: "SNAPSHOT", run });
    if (action === "leave") {
      const { data: updated, error } = await db.from("single_game_runs").update({ status: run.status === "active" ? "abandoned" : run.status, finished_at: run.status === "active" ? new Date().toISOString() : run.finished_at, updated_at: new Date().toISOString() }).eq("id", run.id).select("*").single();
      if (error) throw error;
      return json({ ok: true, code: "ABANDONED", run: updated });
    }
    return invalid("UNSUPPORTED_ACTION");
  } catch (error) {
    console.error("single-run failed", error);
    return json({ ok: false, code: "SINGLE_RUN_FAILED", message: error instanceof Error ? error.message : String(error) }, 502);
  }
});
