import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  beginOAuthLink,beginOAuthSignIn,enabledOAuthProviders,
  oauthRedirectUrl,validateOAuthProfile,validateOAuthProvider,
} from "../utils/oauthFlow.js";

const flags={VITE_OAUTH_GOOGLE_ENABLED:"true",VITE_OAUTH_KAKAO_ENABLED:"false"};
test("OAuth providers are invisible until explicitly enabled",()=>{
  assert.deepEqual(enabledOAuthProviders({}),[]);
  assert.deepEqual(enabledOAuthProviders(flags),["google"]);
  assert.deepEqual(enabledOAuthProviders({...flags,VITE_OAUTH_KAKAO_ENABLED:"true"}),["google","kakao"]);
  assert.throws(()=>validateOAuthProvider("kakao",flags),/사용할 수 없는/);
  assert.throws(()=>validateOAuthProvider("fake",flags),/사용할 수 없는/);
});
test("OAuth redirects to the exact application origin with no arbitrary destination",()=>{
  assert.equal(oauthRedirectUrl("https://wiki-dusky-one.vercel.app"),
    "https://wiki-dusky-one.vercel.app/oauth/complete");
  assert.equal(oauthRedirectUrl("http://127.0.0.1:5173","link"),
    "http://127.0.0.1:5173/profile");
  assert.throws(()=>oauthRedirectUrl("https://evil.example/path"),/올바른 사이트/);
  assert.throws(()=>oauthRedirectUrl("http://evil.example"),/올바른 사이트/);
});
test("Google signInWithOAuth uses PKCE SDK provider and direct callback route",async()=>{
  const calls=[];
  await beginOAuthSignIn({signInWithOAuth:async arg=>{calls.push(arg);return {error:null};}},
    "google","https://wiki-dusky-one.vercel.app",flags);
  assert.deepEqual(calls,[{provider:"google",
    options:{redirectTo:"https://wiki-dusky-one.vercel.app/oauth/complete"}}]);
});
test("existing account links an identity only after verifying authenticated identity",async()=>{
  const calls=[];
  const client={
    getUser:async()=>({data:{user:{id:"existing-uuid"}},error:null}),
    getUserIdentities:async()=>({data:{identities:[{provider:"email"}]},error:null}),
    linkIdentity:async arg=>{calls.push(arg);return {error:null};},
  };
  const original=await beginOAuthLink(client,"google","https://wiki-dusky-one.vercel.app",flags);
  assert.equal(original,"existing-uuid");
  assert.deepEqual(calls,[{provider:"google",options:{redirectTo:"https://wiki-dusky-one.vercel.app/profile"}}]);
  client.getUserIdentities=async()=>({data:{identities:[{provider:"google"}]},error:null});
  await assert.rejects(()=>beginOAuthLink(client,"google","https://wiki-dusky-one.vercel.app",flags),/이미 연결/);
  assert.equal(calls.length,1);
  client.getUser=async()=>({data:{user:null},error:null});
  await assert.rejects(()=>beginOAuthLink(client,"google","https://wiki-dusky-one.vercel.app",flags),/로그인/);
});
test("OAuth profile rejects invalid identifiers without guessing existing account mapping",()=>{
  assert.deepEqual(validateOAuthProfile("  New_Player  "," 새 탐험가 "),{
    username:"new_player",nickname:"새 탐험가",
  });
  assert.throws(()=>validateOAuthProfile("n!","닉네임"),/아이디/);
  assert.throws(()=>validateOAuthProfile("valid","n"),/닉네임/);
});
test("SQL function requires auth user provider identity, avoids client user ID and record merge",()=>{
  const s=readFileSync(new URL("../supabase/migrations/20261110080546_oauth_profile_onboarding_v1.sql",import.meta.url),"utf8");
  assert.match(s,/synthetic_email drop not null/);
  assert.match(s,/auth\.uid\(\)/);
  assert.match(s,/from auth\.identities/);
  assert.match(s,/i\.provider in \('google', 'kakao'\)/);
  assert.match(s,/security definer/);
  assert.match(s,/set search_path = ''/);
  assert.match(s,/revoke all on function public\.complete_oauth_profile/);
  assert.match(s,/grant execute on function public\.complete_oauth_profile/);
  assert.doesNotMatch(s,/delete from public\.profiles|update public\.profiles|update public\.game_records/i);
});
