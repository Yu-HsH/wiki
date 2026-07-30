import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { LOBBY_PATH } from "../utils/appRoutes";

/* ── Zod 유효성 검사 스키마 ── */
// 로그인 시: 아이디(2자+), 비밀번호(6자+) 필수
const signinSchema = z.object({
  username: z.string().min(2, "아이디는 2자 이상이어야 합니다."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
});

// 회원가입 시: 아이디, 비밀번호, 닉네임(2자+) 필수
const signupSchema = z.object({
  username: z.string().min(2, "아이디는 2자 이상이어야 합니다."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
  nickname: z.string().min(2, "닉네임은 2자 이상이어야 합니다."),
});

// 데모 모드 시: 닉네임만 입력받음
const demoSchema = z.object({
  nickname: z.string().min(2, "닉네임은 2자 이상이어야 합니다."),
});

/**
 * Zod 검증 에러를 React Hook Form의 setError에 적용하는 도우미 함수
 */
function applyZodErrors(result, setError) {
  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (typeof field === "string") {
      setError(field, { type: "manual", message: issue.message });
    }
  });
}



function getFriendlyAuthError(error, mode) {
  const message = error?.message || "";
  const lower = message.toLowerCase();

  if (error?.authCategory === "edge-auth") {
    return "로그인 서비스 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (error?.authCategory === "username-not-found") {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }

  if (error?.authCategory === "username-conflict") {
    return "이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.";
  }

  if (error?.authCategory === "edge-server" || error?.authCategory === "edge-relay") {
    return "로그인 서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (error?.authCategory === "network") {
    return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.";
  }

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials") ||
    lower.includes("invalid_credentials")
  ) {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }

  if (
    lower.includes("already registered") ||
    lower.includes("user already registered") ||
    lower.includes("duplicate key") ||
    lower.includes("already exists") ||
    lower.includes("unique")
  ) {
    return "이미 사용 중인 아이디입니다. 다른 아이디로 가입해주세요.";
  }

  if (
    lower.includes("password should be at least") ||
    lower.includes("password")
  ) {
    return "비밀번호는 6자 이상이어야 합니다.";
  }

  if (
    lower.includes("username") ||
    lower.includes("id")
  ) {
    return "아이디 형식을 확인해주세요.";
  }

  if (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch")
  ) {
    return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
  }

  if (lower.includes("database")) {
    return "서버 데이터 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (mode === "signin") {
    return `로그인에 실패했습니다. 아이디 또는 비밀번호를 확인해주세요.`;
  }

  return `회원가입에 실패했습니다. 이미 사용 중인 아이디이거나 입력값이 올바르지 않습니다.`;
}

export default function LoginPage({ isEmbedded = false }) {
  const navigate = useNavigate();
  const { loginWithUsername, signUpWithUsername, demoLogin, isSupabaseConfigured, loginAsGuest } = useAuth();
  const [mode, setMode] = useState("signin");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [debugError, setDebugError] = useState("");

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm({
    defaultValues: { username: "", password: "", nickname: "" },
  });

  /**
   * 폼 제출 핸들러 (로그인/회원가입/데모 통합 처리)
   */
  const onSubmit = handleSubmit(async (values) => {
    clearErrors();
    setSubmitError("");

    try {
      setPending(true);

      /* ── 데모 모드 처리 (Supabase 미설정 시) ── */
      if (!isSupabaseConfigured) {
        const parsed = demoSchema.safeParse(values);
        if (!parsed.success) { applyZodErrors(parsed, setError); return; }
        await demoLogin({ displayName: parsed.data.nickname });
        navigate(LOBBY_PATH);
        return;
      }

      /* ── 로그인 처리 ── */
      if (mode === "signin") {
        const parsed = signinSchema.safeParse(values);
        if (!parsed.success) { applyZodErrors(parsed, setError); return; }
        await loginWithUsername({ username: parsed.data.username, password: parsed.data.password });
        navigate(LOBBY_PATH);
        return;
      }

      /* ── 회원가입 처리 ── */
      const parsed = signupSchema.safeParse(values);
      if (!parsed.success) { applyZodErrors(parsed, setError); return; }
      await signUpWithUsername({
        username: parsed.data.username,
        password: parsed.data.password,
        nickname: parsed.data.nickname,
      });
      navigate(LOBBY_PATH);
    } catch (error) {
      if (import.meta.env.DEV) {
        const lowerMessage = (error?.message || "").toLowerCase();
        const category =
          error?.authCategory ||
          (lowerMessage.includes("invalid login credentials") ? "password-mismatch" : "auth-error");
        console.error("[Auth]", {
          category,
          status: error?.status ?? null,
          code: error?.code ?? null,
        });
      }
      setSubmitError(getFriendlyAuthError(error, mode));
      setDebugError(error?.message || JSON.stringify(error));
    } finally {
      setPending(false);
    }
  });

  return (
    <div className={isEmbedded ? "" : "login-page-shell"}>
      <div className={isEmbedded ? "" : "auth-page"}>
        <div className="auth-card" style={isEmbedded ? { border: "none", boxShadow: "none", background: "transparent" } : {}}>
          <p className="auth-badge">Wiki Race</p>
          <h1>{isSupabaseConfigured ? "로그인하고 레이스 시작하기" : "데모 모드로 시작하기"}</h1>
          <p className="auth-subtitle">
            {isSupabaseConfigured
              ? "플레이 기록을 남기고 랭킹 경쟁에 참여하세요."
              : "Supabase 키가 설정되지 않아 데모 모드로 동작합니다."}
          </p>

          {isSupabaseConfigured && (
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "signin" ? "auth-tab active" : "auth-tab"}
                onClick={() => {
                  setMode("signin");
                  setSubmitError("");
                  clearErrors();
                }}
              >
                로그인
              </button>
              <button
                type="button"
                className={mode === "signup" ? "auth-tab active" : "auth-tab"}
                onClick={() => {
                  setMode("signup");
                  setSubmitError("");
                  clearErrors();
                }}
              >
                회원가입
              </button>
            </div>
          )}

          <form onSubmit={onSubmit} className="auth-form">
            {/* Username */}
            <label className="auth-label">
              아이디
              <input
                className="auth-input"
                placeholder="사용할 아이디"
                autoComplete="username"
                {...register("username")}
              />
              {errors.username && <span className="auth-error">{errors.username.message}</span>}
            </label>

            {/* Nickname (signup + demo) */}
            {(!isSupabaseConfigured || mode === "signup") && (
              <label className="auth-label">
                닉네임
                <input
                  className="auth-input"
                  placeholder="게임에서 표시될 이름"
                  {...register("nickname")}
                />
                {errors.nickname && <span className="auth-error">{errors.nickname.message}</span>}
              </label>
            )}

            {/* Password (Supabase only) */}
            {isSupabaseConfigured && (
              <label className="auth-label">
                비밀번호
                <input
                  type="password"
                  className="auth-input"
                  placeholder="6자 이상"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  {...register("password")}
                />
                {errors.password && <span className="auth-error">{errors.password.message}</span>}
              </label>
            )}

            {submitError && <p className="auth-error auth-error-block">{submitError}</p>}

            {debugError && (
              <details className="auth-debug-error">
                <summary>오류 상세 보기</summary>
                <pre>{debugError}</pre>
              </details>
            )}

            <button type="submit" className="app-btn app-btn-primary" disabled={pending}>
              {pending
                ? "처리 중..."
                : isSupabaseConfigured
                  ? mode === "signin"
                    ? "로그인"
                    : "계정 만들기"
                  : "시작하기"}
            </button>

            <button
              type="button"
              className="app-btn app-btn-secondary"
              style={{ width: "100%", marginTop: "1rem" }}
              onClick={async () => {
                try {
                  setSubmitError("");
                  await loginAsGuest();
                  navigate(LOBBY_PATH);
                } catch (error) {
                  console.error("Guest login error:", error);
                  setSubmitError("게스트 로그인에 실패했습니다. 다시 시도해주세요.");
                }
              }}
            >
              게스트로 로그인
            </button>

            <div className="auth-public-links">
              <Link to="/about">서비스 소개</Link>
              <Link to="/guide">플레이 가이드</Link>
              <Link to="/privacy">개인정보처리방침</Link>
              <Link to="/terms">이용약관</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
