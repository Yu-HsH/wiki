import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const LOCAL_USER_KEY = "wiki_game_local_user";

const AuthContext = createContext(null);

function mapSupabaseUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const fallbackName = meta.nickname || meta.username || (user.email ? user.email.split("@")[0] : "Player");
  return {
    id: user.id,
    email: user.email || "",
    username: meta.username || "",
    nickname: meta.nickname || "",
    displayName: meta.nickname || meta.username || meta.display_name || fallbackName,
    mode: "supabase",
  };
}

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

  const login = async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured. Use demo login instead.");
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(mapSupabaseUser(data.user));
  };

  // username → synthetic email lookup, then signIn
  const loginWithUsername = async ({ username, password }) => {
    if (!isSupabaseConfigured) throw new Error("Supabase가 설정되지 않았습니다.");
    const { data: fnData, error: fnError } = await supabase.functions.invoke("username-lookup", {
      body: { username },
    });
    if (fnError) throw new Error(fnError.message || "사용자를 찾을 수 없습니다.");
    const syntheticEmail = fnData?.email;
    if (!syntheticEmail) throw new Error("사용자를 찾을 수 없습니다.");
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

  // calls Edge Function which creates auth user + profile row
  const signUpWithUsername = async ({ username, password, nickname }) => {
    if (!isSupabaseConfigured) throw new Error("Supabase가 설정되지 않았습니다.");
    const { data: fnData, error: fnError } = await supabase.functions.invoke("username-signup", {
      body: { username, password, nickname },
    });
    if (fnError) throw new Error(fnError.message || "회원가입에 실패했습니다.");
    if (fnData?.error) throw new Error(fnData.error);
    // After signup, log in immediately
    await loginWithUsername({ username, password });
  };

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
