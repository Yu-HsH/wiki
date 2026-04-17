import { supabase, isSupabaseConfigured } from "../supabaseClient";

export async function fetchRandomAiTarget({ difficulty = null } = {}) {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase가 설정되지 않았습니다.");
    }

    let query = supabase
        .from("target_candidates")
        .select("id, title, summary, difficulty, link_count")
        .eq("recommended", true)
        .eq("is_active", true);

    if (difficulty) {
        query = query.eq("difficulty", difficulty);
    }

    const { data, error } = await query
        .order("usage_count", { ascending: true })
        .order("evaluated_at", { ascending: false })
        .limit(30);

    if (error) {
        throw new Error("AI 타겟 후보를 불러오지 못했습니다.");
    }

    if (!data || data.length === 0) {
        throw new Error("사용 가능한 AI 타겟 후보가 없습니다.");
    }

    const picked = data[Math.floor(Math.random() * data.length)];
    return picked;
}

export async function markAiTargetUsed(id) {
    if (!isSupabaseConfigured || !supabase || !id) return;

    const { data: current } = await supabase
        .from("target_candidates")
        .select("usage_count")
        .eq("id", id)
        .single();

    const nextCount = (current?.usage_count ?? 0) + 1;

    await supabase
        .from("target_candidates")
        .update({
            usage_count: nextCount,
            last_used_at: new Date().toISOString(),
        })
        .eq("id", id);
}