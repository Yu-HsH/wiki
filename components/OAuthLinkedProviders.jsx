import React,{useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {beginOAuthLink,enabledOAuthProviders,OAUTH_PROVIDER_NAMES} from "../utils/oauthFlow.js";
import {useAuth} from "../authContext.jsx";

export default function OAuthLinkedProviders(){
  const {user}=useAuth();
  const providers=enabledOAuthProviders();
  const [linked,setLinked]=useState([]);
  const [loading,setLoading]=useState(Boolean(providers.length));
  const [pending,setPending]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!providers.length||!user||user.isGuest||user.mode!=="supabase")return;
    let alive=true;
    (async()=>{
      const expected=sessionStorage.getItem("wiki-race-oauth-link-expected-id");
      if(expected){
        sessionStorage.removeItem("wiki-race-oauth-link-expected-id");
        if(expected!==user.id){
          if(alive)setError("다른 계정으로 인증되었습니다. 연결 상태를 확인하고 다시 로그인해 주세요.");
          return;
        }
      }
      const {data,error:identityError}=await supabase.auth.getUserIdentities();
      if(!alive)return;
      if(identityError){setError("연결된 계정을 확인하지 못했습니다.");return;}
      const names=(data?.identities||[]).map(i=>i.provider);
      setLinked(names);
      if(expected)setNotice("계정 연결 상태를 확인했습니다. 기존 Wiki Race 기록은 유지됩니다.");
    })().catch(()=>{if(alive)setError("소셜 계정 정보를 가져오지 못했습니다.");})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[user?.id]);
  if(!providers.length||!user||user.isGuest||user.mode!=="supabase")return null;

  const connect=async provider=>{
    setError("");setNotice("");setPending(provider);
    try {
      const id=await beginOAuthLink(supabase.auth,provider,window.location.origin);
      // UX diagnostic after redirect; cannot grant access or merge users.
      sessionStorage.setItem("wiki-race-oauth-link-expected-id",id);
    }catch(e){
      setError(e?.message || "소셜 계정 연결을 시작하지 못했습니다.");
      setPending("");
    }
  };
  return <section className="wr-oauth-link-panel" aria-labelledby="wr-oauth-link-title">
    <h3 id="wr-oauth-link-title">소셜 로그인 연결</h3>
    <p>기존 계정에 구글·카카오 로그인을 연결하면 같은 XP·업적·기록으로 접속할 수 있습니다. 연결하기 전에 현재 Wiki Race 계정으로 로그인되어 있는지 확인하세요.</p>
    {loading?<p role="status">연결 상태 확인 중…</p>:
      providers.map(provider=><div className="wr-oauth-linked-row" key={provider}>
        <span>{OAUTH_PROVIDER_NAMES[provider]}</span>
        {linked.includes(provider)
          ? <strong>연결됨</strong>
          : <button type="button" className="app-btn app-btn-ghost"
              disabled={Boolean(pending)||Boolean(error)}
              onClick={()=>connect(provider)}>{pending===provider?"연결 중…":"계정 연결"}</button>}
      </div>)}
    {error&&<p className="auth-error" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <small>다른 Wiki Race 계정으로 기록을 합치거나 이동시키는 기능은 제공하지 않습니다.</small>
  </section>;
}
