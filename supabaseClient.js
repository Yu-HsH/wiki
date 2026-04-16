import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabaseUrl = rawSupabaseUrl.trim();
const supabaseAnonKey = rawSupabaseAnonKey.trim();

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("your-project-ref") ||
    normalized.includes("your_supabase_anon_key") ||
    normalized.includes("your-anon-key")
  );
}

function isValidSupabaseUrl(value) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value);
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(supabaseAnonKey) &&
  isValidSupabaseUrl(supabaseUrl)
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  : null;
