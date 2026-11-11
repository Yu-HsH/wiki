// OAuth is opt-in at build time. Provider configuration is owned by Supabase Auth, not Vite.
export const OAUTH_PROVIDER_NAMES = Object.freeze({google:"Google", kakao:"카카오"});
export const OAUTH_PROVIDER_FLAGS = Object.freeze({
  google:"VITE_OAUTH_GOOGLE_ENABLED",
  kakao:"VITE_OAUTH_KAKAO_ENABLED",
});

export function enabledOAuthProviders(env = import.meta.env || {}) {
  return Object.keys(OAUTH_PROVIDER_FLAGS).filter(provider =>
    env[OAUTH_PROVIDER_FLAGS[provider]] === "true");
}

export function validateOAuthProvider(provider, env = import.meta.env || {}) {
  if (!Object.hasOwn(OAUTH_PROVIDER_FLAGS,provider) ||
      env[OAUTH_PROVIDER_FLAGS[provider]] !== "true") {
    throw new Error("현재 사용할 수 없는 소셜 로그인 제공자입니다.");
  }
  return provider;
}

export function oauthRedirectUrl(origin, mode = "signup") {
  const parsed = new URL(origin);
  if (parsed.origin !== origin || !(
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" && ["localhost","127.0.0.1"].includes(parsed.hostname))
  )) throw new Error("올바른 사이트 주소에서 다시 시도해 주세요.");
  return new URL(mode === "link" ? "/profile" : "/oauth/complete", origin).href;
}

export async function beginOAuthSignIn(auth, provider, origin, env = import.meta.env || {}) {
  validateOAuthProvider(provider,env);
  const {error} = await auth.signInWithOAuth({
    provider,
    options:{redirectTo:oauthRedirectUrl(origin)},
  });
  if(error) throw error;
}

export async function beginOAuthLink(auth, provider, origin, env = import.meta.env || {}) {
  validateOAuthProvider(provider,env);
  const {data:{user} = {},error:getError} = await auth.getUser();
  if(getError || !user?.id) throw new Error("기존 Wiki Race 계정으로 먼저 로그인해 주세요.");
  const {data:identities,error:listError} = await auth.getUserIdentities();
  if(listError) throw listError;
  if((identities?.identities || []).some(identity=>identity.provider===provider)) {
    throw new Error("이미 연결된 소셜 계정입니다.");
  }
  const {error} = await auth.linkIdentity({
    provider,
    options:{redirectTo:oauthRedirectUrl(origin,"link")},
  });
  if(error) throw error;
  return user.id;
}

export function validateOAuthProfile(username,nickname) {
  const cleanUsername = String(username ?? "").trim().toLowerCase();
  const cleanNickname = String(nickname ?? "").trim();
  if(!/^[a-z0-9_]{3,20}$/.test(cleanUsername))
    throw new Error("아이디는 영문 소문자·숫자·밑줄(_) 3~20자로 입력해 주세요.");
  if(cleanNickname.length<2 || cleanNickname.length>20)
    throw new Error("닉네임은 2~20자로 입력해 주세요.");
  return {username:cleanUsername,nickname:cleanNickname};
}
