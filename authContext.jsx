import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

// 로컬 스토리지에 유저 정보를 저장하기 위한 키 (데모/게스트 모드용)
const LOCAL_USER_KEY = "wiki_game_local_user";

/**
 * 인증 상태(로그인 유저 정보, 로그인/로그아웃 함수 등)를 관리하는 커스텀 컨텍스트
 */
const AuthContext = createContext(null);

/**
 * Supabase가 반환하는 유저 객체를 애플리케이션 프론트엔드에서 사용하기 쉬운 형식으로 변환합니다.
 * @param {Object} user - Supabase Auth 유저 객체
 * @returns {Object|null} 변환된 유저 정보 또는 null
 */
function mapSupabaseUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  // 닉네임 -> 아이디 -> 이메일 앞부분 순으로 표시용 이름을 결정합니다.
  const fallbackName = meta.nickname || meta.username || (user.email ? user.email.split("@")[0] : "Player");
  return {
    id: user.id,
    email: user.email || "", // 내부 식별용 (합성 이메일)
    username: meta.username || "", // 실제 사용자 아이디
    nickname: meta.nickname || "", // 표시될 닉네임
    displayName: meta.nickname || meta.username || meta.display_name || fallbackName,
    mode: "supabase", // 로그인 모드 구분
  };
}

// 로컬 스토리지 도우미 함수들 (데모/게스트 모드 데이터 관리)
function readLocalUser() {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalUser(user) {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
}

function clearLocalUser() {
  localStorage.removeItem(LOCAL_USER_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribed = false;

    const bootstrap = async () => {
      if (!isSupabaseConfigured) {
        if (!unsubscribed) {
          setUser(readLocalUser());
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!unsubscribed) {
        setUser(mapSupabaseUser(data.session?.user || null));
        setLoading(false);
      }
    };

    bootstrap();

    if (!isSupabaseConfigured) {
      return () => {
        unsubscribed = true;
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapSupabaseUser(session?.user || null));
    });

    return () => {
      unsubscribed = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  /**
   * 기본적인 이메일/비밀번호 로그인 (내부적으로 사용 가능)
   */
  const login = async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured. Use demo login instead.");
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(mapSupabaseUser(data.user));
  };

  /**
   * 아이디/비밀번호 로그인
   * 1. username-lookup 엣지 펑션을 통해 아이디에 매칭되는 합성 이메일을 찾습니다.
   * 2. 찾은 이메일로 Supabase Auth 로그인을 수행합니다.
   */
  const loginWithUsername = async ({ username, password }) => {
    if (!isSupabaseConfigured) throw new Error("Supabase가 설정되지 않았습니다.");

    // 아이디를 이메일로 변환하는 RPC(커스텀 엣지 펑션) 호출
    const { data: fnData, error: fnError } = await supabase.functions.invoke("username-lookup", {
      body: { username },
    });
    if (fnError) throw new Error(fnError.message || "사용자를 찾을 수 없습니다.");

    const syntheticEmail = fnData?.syntheticEmail;
    if (!syntheticEmail) throw new Error("사용자를 찾을 수 없습니다.");

    // 내부적으로 이메일을 사용하여 실제 로그인 처리
    const { data, error } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password });
    if (error) throw error;
    setUser(mapSupabaseUser(data.user));
  };

  const signUp = async ({ email, password, displayName }) => {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured. Use demo login instead.");
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    if (error) throw error;
    setUser(mapSupabaseUser(data.user));
  };

  /**
   * 아이디/비밀번호/닉네임 회원가입
   * username-signup 엣지 펑션을 호출하여 Auth 유저 생성 및 Profile 테이블 행 삽입을 한 번에 처리합니다.
   */
  const signUpWithUsername = async ({ username, password, nickname }) => {
    if (!isSupabaseConfigured) throw new Error("Supabase가 설정되지 않았습니다.");

    const { data: fnData, error: fnError } = await supabase.functions.invoke("username-signup", {
      body: { username, password, nickname },
    });

    if (fnError) throw new Error(fnError.message || "회원가입에 실패했습니다.");
    if (fnData?.error) throw new Error(fnData.error);

    // 가입 성공 후 즉시 로그인을 수행하여 세션을 활성화합니다.
    await loginWithUsername({ username, password });
  };

  /**
   * 데모 모드 전용 로그인 (로컬 스토리지에 이름만 기록)
   */
  const demoLogin = async ({ displayName }) => {
    const trimmed = displayName.trim();
    const localUser = {
      id: `local-${trimmed.toLowerCase().replace(/\s+/g, "-")}`,
      email: "",
      displayName: trimmed || "Demo Player",
      mode: "local",
    };
    writeLocalUser(localUser);
    setUser(localUser);
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
      setUser(null);
      return;
    }
    clearLocalUser();
    setUser(null);
  };

  const loginAsGuest = () => {
    const guestId = "guest-" + Math.random().toString(36).substring(2, 9);
    const guestUser = {
      id: guestId,
      email: null,
      displayName: "게스트",
      isGuest: true,
      mode: "local",
    };
    writeLocalUser(guestUser);
    setUser(guestUser);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isSupabaseConfigured,
      login,
      loginWithUsername,
      signUp,
      signUpWithUsername,
      demoLogin,
      logout,
      loginAsGuest,
    }),
    [loading, user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 전역 인증 상태를 쉽게 가져와 사용할 수 있게 해주는 커스텀 훅
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
