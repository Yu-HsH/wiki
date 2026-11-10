import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient.js";
import { validateOAuthProfile } from "../utils/oauthFlow.js";

/**
 * The Auth gate only renders this form for an authenticated Google/Kakao identity
 * without an existing Wiki Race profile. This component never chooses a user ID.
 */
export default function OAuthCompletePage({onComplete}) {
  const navigate=useNavigate();
  const {logout}=useAuth();
  const [username,setUsername]=useState("");
  const [nickname,setNickname]=useState("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  const submit=async event=>{
    event.preventDefault();
    if(saving) return;
    setError("");setSaving(true);
    try{
      const input=validateOAuthProfile(username,nickname);
      const {data,error:dbError}=await supabase.rpc("complete_oauth_profile",{
        p_username:input.username,p_nickname:input.nickname,
      });
      if(dbError) {
        if(dbError.code==="23505") throw new Error("이미 사용 중인 아이디입니다. 다른 아이디를 선택해 주세요.");
        throw dbError;
      }
      if(data?.username!==input.username) throw new Error("계정 설정 결과를 확인하지 못했습니다.");
      // Display-only metadata. Server authorization uses auth.uid(), never metadata.
      const {error:metaError}=await supabase.auth.updateUser({
        data:{username:input.username,nickname:input.nickname}
      });
      // Profile creation is already durable even when the display metadata refresh fails.
      if(metaError && import.meta.env.DEV) console.warn("OAuth profile metadata sync failed");
      onComplete?.();
      navigate("/lobby",{replace:true});
    }catch(e) {
      setError(e?.message || "계정 설정을 완료하지 못했습니다.");
    }finally{setSaving(false);}
  };

  const cancel=async()=>{await logout();navigate("/login",{replace:true});};
  return (
    <main className="auth-page wr-oauth-onboarding">
      <section className="auth-card" aria-labelledby="oauth-profile-title">
        <p className="auth-badge">Wiki Race · 2.0.3</p>
        <h1 id="oauth-profile-title">탐험가 등록 마무리</h1>
        <p className="auth-subtitle">소셜 로그인은 완료됐습니다. 게임에서 사용할 아이디와 닉네임을 정해 주세요.</p>
        <p className="wr-oauth-warning">기존 Wiki Race 계정이 있다면 여기서 새로 가입하지 마세요. 기존 아이디로 다시 로그인한 뒤 프로필에서 소셜 계정을 연결해야 기록을 그대로 사용할 수 있습니다.</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label">Wiki Race 아이디
            <input className="auth-input" autoComplete="username" value={username}
              maxLength={20} placeholder="영문 소문자·숫자·_ (3~20자)"
              onChange={e=>setUsername(e.target.value)} disabled={saving} required />
          </label>
          <label className="auth-label">닉네임
            <input className="auth-input" value={nickname} maxLength={20} minLength={2}
              placeholder="게임에 표시할 이름 (2~20자)"
              onChange={e=>setNickname(e.target.value)} disabled={saving} required />
          </label>
          {error&&<p className="auth-error" role="alert">{error}</p>}
          <button className="app-btn app-btn-primary" type="submit" disabled={saving}>
            {saving?"등록하는 중…":"탐험 시작"}
          </button>
          <button type="button" className="app-btn app-btn-ghost" onClick={cancel} disabled={saving}>
            취소하고 기존 계정으로 로그인
          </button>
        </form>
      </section>
    </main>
  );
}
