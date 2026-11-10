import { isSupabaseConfigured, supabase } from "../supabaseClient.js";
import { UPDATE_NOTICES } from "../data/updateNotices.js";

export const NEWS_TABLE = "site_news_posts";
const NEWS_FIELDS = "id,type,title,summary,details,status,published_at,author_id,created_at,updated_at";

export function normalizeSiteNews(row) {
  return {
    id: String(row.id),
    date: (row.published_at || row.created_at || "").slice(0, 10),
    type: row.type || "업데이트",
    status: row.status === "published" ? "released" : "planned",
    title: row.title,
    summary: row.summary,
    details: Array.isArray(row.details) ? row.details : [],
  };
}

export async function getPublishedSiteNews() {
  if (!isSupabaseConfigured || !supabase) return UPDATE_NOTICES;
  const { data, error } = await supabase.from(NEWS_TABLE)
    .select(NEWS_FIELDS).eq("status", "published")
    .order("published_at", { ascending: false }).order("created_at", { ascending: false }).limit(80);
  if (error) throw error;
  return (data ?? []).map(normalizeSiteNews);
}

export async function isSiteNewsAdmin() {
  if (!isSupabaseConfigured || !supabase) return false;
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData?.user) return false;
  const { data, error } = await supabase.rpc("is_site_news_admin");
  if (error) throw error;
  return data === true;
}

export async function getManagedSiteNews() {
  if (!await isSiteNewsAdmin()) throw new Error("운영자 권한이 없습니다.");
  const { data, error } = await supabase.from(NEWS_TABLE).select(NEWS_FIELDS)
    .order("updated_at", { ascending: false }).limit(120);
  if (error) throw error;
  return data ?? [];
}

export function validateSiteNewsForm(input) {
  const title = String(input.title || "").trim();
  const summary = String(input.summary || "").trim();
  const details = String(input.details || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const type = ["업데이트", "공지", "점검"].includes(input.type) ? input.type : "업데이트";
  if (!title || title.length > 120) throw new Error("제목은 1~120자로 입력해 주세요.");
  if (!summary || summary.length > 360) throw new Error("요약은 1~360자로 입력해 주세요.");
  if (!details.length || details.length > 24 || details.join("").length > 14000)
    throw new Error("본문 항목을 1~24개로 입력해 주세요(최대 14,000자).");
  return { title, summary, details, type };
}

export async function saveSiteNewsForm(form, { id = null, publish = false, hide = false } = {}) {
  if (!await isSiteNewsAdmin()) throw new Error("운영자 권한이 없습니다.");
  const validated = validateSiteNewsForm(form);
  const { data: authData } = await supabase.auth.getUser();
  const status = hide ? "draft" : publish ? "published" : (form.status === "published" ? "published" : "draft");
  const payload = {
    ...validated,
    status,
    published_at: status === "published"
      ? (form.published_at || new Date().toISOString())
      : null,
  };
  if (!id) payload.author_id = authData.user?.id || null;
  const query = id
    ? supabase.from(NEWS_TABLE).update(payload).eq("id", id)
    : supabase.from(NEWS_TABLE).insert(payload);
  const { data, error } = await query.select(NEWS_FIELDS).single();
  if (error) throw error;
  return data;
}
