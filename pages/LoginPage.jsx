import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";

const loginSchema = z.object({
  email: z.string().email("올바른 이메일 형식을 입력해주세요."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
});

const signUpSchema = loginSchema.extend({
  displayName: z.string().min(2, "닉네임은 2자 이상이어야 합니다."),
});

const demoSchema = z.object({
  displayName: z.string().min(2, "닉네임은 2자 이상이어야 합니다."),
});

function applyZodErrors(result, setError) {
  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (typeof field === "string") {
      setError(field, { type: "manual", message: issue.message });
    }
  });
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, signUp, demoLogin, isSupabaseConfigured, loginAsGuest } = useAuth();
  const [mode, setMode] = useState("signin");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
      displayName: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    clearErrors();
    setSubmitError("");

    try {
      setPending(true);

      if (!isSupabaseConfigured) {
        const parsed = demoSchema.safeParse(values);
        if (!parsed.success) {
          applyZodErrors(parsed, setError);
          return;
        }
        await demoLogin({ displayName: parsed.data.displayName });
        navigate("/main");
        return;
      }

      if (mode === "signin") {
        const parsed = loginSchema.safeParse(values);
        if (!parsed.success) {
          applyZodErrors(parsed, setError);
          return;
        }
        await login(parsed.data);
        navigate("/main");
        return;
      }

      const parsed = signUpSchema.safeParse(values);
      if (!parsed.success) {
        applyZodErrors(parsed, setError);
        return;
      }

      await signUp(parsed.data);
      navigate("/main");
    } catch (error) {
      setSubmitError(error?.message || "인증 처리 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  });

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-badge">Wiki Race</p>
        <h1>{isSupabaseConfigured ? "로그인하고 레이스 시작하기" : "데모 모드로 시작하기"}</h1>
        <p className="auth-subtitle">
          {isSupabaseConfigured
            ? "플레이 기록을 남기고 랭킹 경쟁에 참여하세요."
            : "Supabase 키가 설정되지 않아 데모 모드로 동작합니다. 로컬에서도 화면/기능 테스트는 가능합니다."}
        </p>

        {isSupabaseConfigured && (
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "signin" ? "auth-tab active" : "auth-tab"}
              onClick={() => setMode("signin")}
            >
              로그인
            </button>
            <button
              type="button"
              className={mode === "signup" ? "auth-tab active" : "auth-tab"}
              onClick={() => setMode("signup")}
            >
              회원가입
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="auth-form">
          {(!isSupabaseConfigured || mode === "signup") && (
            <label className="auth-label">
              닉네임
              <input
                className="auth-input"
                placeholder="사용할 닉네임"
                {...register("displayName")}
              />
              {errors.displayName && <span className="auth-error">{errors.displayName.message}</span>}
            </label>
          )}

          {isSupabaseConfigured && (
            <>
              <label className="auth-label">
                이메일
                <input className="auth-input" placeholder="you@example.com" {...register("email")} />
                {errors.email && <span className="auth-error">{errors.email.message}</span>}
              </label>

              <label className="auth-label">
                비밀번호
                <input type="password" className="auth-input" placeholder="******" {...register("password")} />
                {errors.password && <span className="auth-error">{errors.password.message}</span>}
              </label>
            </>
          )}

          {submitError && <p className="auth-error auth-error-block">{submitError}</p>}

          <button type="submit" className="app-btn app-btn-primary" disabled={pending}>
            {pending ? "처리 중..." : isSupabaseConfigured ? (mode === "signin" ? "로그인" : "계정 만들기") : "시작하기"}
          </button>

          <button
            type="button"
            className="app-btn app-btn-secondary"
            style={{ width: "100%", marginTop: "1rem" }}
            onClick={() => {
              loginAsGuest();
              navigate("/main");
            }}
          >
            게스트로 로그인
          </button>
        </form>
      </div>
    </div>
  );
}
