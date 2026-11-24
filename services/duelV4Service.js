import { supabase } from "../supabaseClient.js";

async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const duelV4 = {
  entry: () => call("get_duel_v4_entry"),
  create: (requestId) => call("create_duel_v4_room", { p_request: requestId }),
  join: (code) => call("join_duel_v4_room", { p_code: code }),
  state: (roomId) => call("get_duel_v4_state", { p_room: roomId }),
  async prepareSearch(roomId, windowId, signal) {
    const { data, error } = await supabase.functions.invoke("duel-search-v4", {
      body: { roomId, windowId }, signal,
    });
    if (error || !data?.ok) throw error || new Error(data?.code);
    return data;
  },
  search: (roomId, request) => call("submit_duel_v4_search", {
    p_room: roomId,
    p_window: request.windowId,
    p_request: request.id,
    p_query: request.query,
    p_document_hash: request.documentHash,
  }),
  reward: (roomId, request) => call("resolve_duel_v4_reward", {
    p_room: roomId,
    p_request: request.id,
    p_reward: request.input.rewardId,
    p_claim: request.input.claim,
    p_replace: request.input.replaceGrantId ?? null,
    p_inventory_token: request.input.inventoryToken ?? null,
  }),
  act: (roomId, request) => call("act_duel_v4", {
    p_room: roomId,
    p_request: request.id,
    p_operation: request.operation,
    p_input: request.input,
  }),
  subscribe(roomId, userId, refresh) {
    const channel = supabase.channel("duel-v4:" + roomId)
      .on("postgres_changes", {
        event: "*", schema: "duel_v4_events", table: "signals", filter: "room_id=eq." + roomId,
      }, ({ new: row }) => {
        if (row?.recipient_id === userId) refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    return () => { void supabase.removeChannel(channel); };
  },
};
