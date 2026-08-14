import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
/**
 * Supabase 환경변수
 */ const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
/**
 * CORS 헤더
 */ const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
/**
 * username 검증
 * - signup과 동일한 규칙 사용
 */ function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}
Deno.serve(async (req)=>{
  /**
   * 브라우저 preflight 처리
   */ if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  /**
   * POST만 허용
   */ if (req.method !== "POST") {
    return new Response(JSON.stringify({
      ok: false,
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  try {
    /**
     * 요청 body에서 username 추출
     */ const body = await req.json();
    const username = (body.username ?? "").trim();
    if (!username) {
      return new Response(JSON.stringify({
        ok: false,
        error: "username이 필요합니다."
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    if (!isValidUsername(username)) {
      return new Response(JSON.stringify({
        ok: false,
        error: "아이디 형식이 올바르지 않습니다."
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    /**
     * profiles에서 username으로 synthetic email 조회
     */ const { data, error } = await supabase.from("profiles").select("synthetic_email, username, nickname").eq("username", username).maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      return new Response(JSON.stringify({
        ok: false,
        error: "존재하지 않는 아이디입니다."
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    /**
     * 프론트는 이 synthetic_email로 signInWithPassword 호출
     */ return new Response(JSON.stringify({
      ok: true,
      syntheticEmail: data.synthetic_email,
      username: data.username,
      nickname: data.nickname
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("username-lookup failed:", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
