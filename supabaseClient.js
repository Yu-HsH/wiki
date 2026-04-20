import { createClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트 초기화 및 설정 확인 모듈
 */

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabaseUrl = rawSupabaseUrl.trim();
const supabaseAnonKey = rawSupabaseAnonKey.trim();

/**
 * 입력값이 플레이스홀더(기본값)인지 확인하는 도우미 함수
 */
function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("your-project-ref") ||
    normalized.includes("your_supabase_anon_key") ||
    normalized.includes("your-anon-key")
  );
}

/**
 * 유효한 Supabase URL 형식인지 확인하는 정규식 검사
 */
function isValidSupabaseUrl(value) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value);
}

/**
 * 현재 프로젝트에 Supabase가 올바르게 설정되어 있는지 체크하는 플래그
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(supabaseAnonKey) &&
  isValidSupabaseUrl(supabaseUrl)
);

/**
 * 프로젝트 전역에서 사용되는 Supabase 클라이언트 인스턴스
 * - 설정이 유효하지 않을 경우 null을 반환하여 데모 모드로 동작하게 유도합니다.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  : null;
