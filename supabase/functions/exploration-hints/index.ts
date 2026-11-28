import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { readWikiBacklinks } from "./backlinks.mjs";

const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers:cors });
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { headers:cors, status:204 });
  if (request.method !== "POST") return reply({ code:"INVALID_REQUEST" },405);
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply({ code:"AUTH_REQUIRED" },401);
  try {
    const { data:{ user }, error: authError } = await service.auth.getUser(token);
    if (authError && (![400,401,403,404].includes(authError.status ?? 0))) {
      return reply({ code:"HINTS_AUTH_UNAVAILABLE" },503);
    }
    if (authError || !user || user.is_anonymous) return reply({ code:"AUTH_REQUIRED" },401);

    const { mode, roomId } = await request.json();
    if (!["duel","group","duel_items","group_items"].includes(mode) || !uuid.test(roomId)) {
      return reply({ code:"INVALID_REQUEST" },400);
    }
    const scope = { p_mode:mode, p_room:roomId, p_actor:user.id };
    const { data, error } = await service.rpc("read_exploration_hints_v1",scope);
    if (error) return error.code === "42501" ? reply({ code:"HINTS_MEMBER_REQUIRED" },403)
      : reply({ code:"HINTS_UNAVAILABLE" },503);
    const { claim, ...visible } = data;
    if (!claim) return reply(visible);

    try {
      const url = new URL("https://ko.wikipedia.org/w/api.php");
      url.search = new URLSearchParams({ action:"query", prop:"linkshere", pageids:claim.targetPageId,
        lhnamespace:"0", lhshow:"!redirect", lhlimit:"40", format:"json", formatversion:"2" });
      const response = await fetch(url, {
        signal:AbortSignal.timeout(4000),
        headers:{ Accept:"application/json", "User-Agent":"WikiRace/2.0 (https://wiki-dusky-one.vercel.app) exploration-hints" },
      });
      if (!response.ok) return reply(visible);
      const rows = readWikiBacklinks(await response.json(),claim.targetPageId,claim.excludedIds);
      const { data: saved, error: writeError } = await service.rpc("publish_exploration_hints_v1",{
        ...scope, p_token:claim.token, p_round:claim.round, p_target:claim.targetPageId, p_rows:rows,
      });
      if (!writeError && saved) {
        const { data: fresh } = await service.rpc("read_exploration_hints_v1",{ ...scope, p_claim:false });
        if (fresh) return reply({ enabled:fresh.enabled,titles:fresh.titles,serverNow:fresh.serverNow,nextAt:fresh.nextAt });
      }
    } catch { /* Keep already published hints and let the server release the retry lease. */ }
    return reply(visible);
  } catch {
    return reply({ code:"HINTS_UNAVAILABLE" },503);
  }
});
