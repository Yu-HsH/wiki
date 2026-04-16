import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const LOCAL_USER_KEY = "wiki_game_local_user";

const AuthContext = createContext(null);

function mapSupabaseUser(user) {
  if (!user) return null;
  const fallbackName = user.email ? user.email.split("@")[0] : "Player";
  return {
    id: user.id,
    email: user.email || "",
    displayName: user.user_metadata?.display_name || fallbackName,
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

  const value = useMemo(
    () => ({
      user,
      loading,
      isSupabaseConfigured,
      login,
      signUp,
      demoLogin,
      logout,
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
