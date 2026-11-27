import { supabase } from "../supabaseClient.js";

export async function configureExplorationHints(mode, roomId, enabled) {
  const { data,error } = await supabase.rpc("configure_exploration_hints_v1",{
    p_mode:mode,p_room:roomId,p_enabled:enabled,
  });
  if (error?.code === "PGRST202") return false;
  if (error || data !== true) throw new Error("탐험 힌트 설정을 저장하지 못했어요. 다시 시도해 주세요.");
}

export async function getExplorationHints(mode, roomId, signal) {
  const { data,error } = await supabase.functions.invoke("exploration-hints",{ body:{ mode,roomId }, signal });
  if (error) throw error;
  if (data?.enabled === false) return null;
  if (data?.enabled !== true || !Array.isArray(data.titles) ||
      !data.titles.every(title => typeof title === "string" && title.trim() && title.length <= 240)) throw new Error("HINTS_UNAVAILABLE");
  return data;
}
