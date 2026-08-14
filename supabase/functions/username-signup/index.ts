import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
/**
 * Supabase 환경변수
 * - service role key는 Edge Function 서버에서만 사용해야 함
 */ const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
/**
 * CORS 헤더
 * - 브라우저에서 Edge Function 호출 시 OPTIONS preflight를 처리하기 위해 필요
 */ const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
/**
 * username 형식 검증
 * - 너무 복잡하게 가지 않고, 영문/숫자/밑줄만 허용
 * - 3~20자 정도로 제한
 */ function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}
/**
 * 닉네임 기본 검증
 * - 공백 trim 후 길이만 간단히 검사
 */ function isValidNickname(nickname) {
  const trimmed = nickname.trim();
  return trimmed.length >= 2 && trimmed.length <= 20;
}
/**
 * synthetic email 생성
 * - 사용자에게는 보이지 않는 내부 로그인용 이메일
 * - username 변경과 분리하기 위해 random uuid 기반 생성
 */ function makeSyntheticEmail() {
  return `auth_${crypto.randomUUID()}@internal.wikigame.local`;
}
Deno.serve(async (req)=>{
  /**
   * 브라우저 preflight 요청 처리
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
     * 요청 body 파싱
     */ const body = await req.json();
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    const nickname = (body.nickname ?? "").trim();
    /**
     * 필수값 검사
     */ if (!username || !password || !nickname) {
      return new Response(JSON.stringify({
        ok: false,
        error: "username, password, nickname은 모두 필요합니다."
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    /**
     * username 형식 검사
     */ if (!isValidUsername(username)) {
      return new Response(JSON.stringify({
        ok: false,
        error: "아이디는 3~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있습니다."
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    /**
     * 닉네임 형식 검사
     */ if (!isValidNickname(nickname)) {
      return new Response(JSON.stringify({
        ok: false,
        error: "닉네임은 2~20자 사이여야 합니다."
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    /**
     * 비밀번호 길이 검사
     * - 너무 약하면 나중에 보안상 문제될 수 있으니 최소 길이만 체크
     */ if (password.length < 6) {
      return new Response(JSON.stringify({
        ok: false,
        error: "비밀번호는 최소 6자 이상이어야 합니다."
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    /**
     * username 중복 검사
     * - public.profiles에서 같은 username이 이미 있는지 확인
     */ const { data: existingUser, error: lookupError } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
    if (lookupError) {
      throw lookupError;
    }
    if (existingUser) {
      return new Response(JSON.stringify({
        ok: false,
        error: "이미 사용 중인 아이디입니다."
      }), {
        status: 409,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    /**
     * 내부 synthetic email 생성
     */ const syntheticEmail = makeSyntheticEmail();
    /**
     * Supabase Auth 유저 생성
     * - email_confirm: true 로 두면 메일 인증 없이 즉시 사용 가능
     */ const { data: createdAuthUser, error: authCreateError } = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        nickname
      }
    });
    if (authCreateError) {
      throw authCreateError;
    }
    const authUserId = createdAuthUser.user?.id;
    if (!authUserId) {
      throw new Error("Auth user 생성 후 user id를 가져오지 못했습니다.");
    }
    /**
     * public.profiles에 사용자 정보 저장
     */ const { error: profileInsertError } = await supabase.from("profiles").insert({
      id: authUserId,
      username,
      nickname,
      synthetic_email: syntheticEmail
    });
    /**
     * profiles insert 실패 시, 생성된 auth user를 정리
     * - 중간에 꼬인 계정을 남기지 않기 위해 rollback 시도
     */ if (profileInsertError) {
      await supabase.auth.admin.deleteUser(authUserId);
      throw profileInsertError;
    }
    /**
     * 성공 응답
     */ return new Response(JSON.stringify({
      ok: true,
      message: "회원가입이 완료되었습니다.",
      user: {
        id: authUserId,
        username,
        nickname
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("username-signup failed:", error);
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
