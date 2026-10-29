import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPreviewHandler } from "./handler.mjs";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, service, { auth: { persistSession: false } });
const call = async (client: ReturnType<typeof createClient>, name: string, args: Record<string, unknown>) => {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
};

Deno.serve(createPreviewHandler({
  authenticate: async (authorization: string) => {
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return null;
    // Explicit JWT validation avoids initializing a session on a stateless request client.
    const { data, error } = await admin.auth.getUser(token);
    const member = createClient(url, anon, { accessToken: async () => token });
    return error || !data?.user ? null : { userId: data.user.id, member };
  },
  reserve: async (identity: { member: ReturnType<typeof createClient> }, body: Record<string, string>) => call(identity.member, "reserve_duel_preview_v1", {
    p_room_id: body.roomId, p_item_event_id: body.itemEventId, p_target_page_id: body.targetPageId, p_request_id: body.requestId,
  }),
  settle: async (identity: { userId: string }, body: Record<string, string>, lease: string, summary: unknown) => call(admin, "settle_duel_preview_v1", {
    p_room_id: body.roomId, p_item_event_id: body.itemEventId, p_user_id: identity.userId,
    p_target_page_id: body.targetPageId, p_request_id: body.requestId, p_lease_token: lease, p_summary: summary,
  }),
  log: (message: string) => console.error("duel preview failed:", message),
}));
