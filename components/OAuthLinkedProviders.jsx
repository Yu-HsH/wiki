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
      // Save the original Auth UID BEFORE linkIdentity causes a browser redirect.
      const {data:{user:currentUser} = {},error:verifyError}=await supabase.auth.getUser();
      if(verifyError || currentUser?.id!==user.id){
        throw new Error("계정이 변경되었습니다. 다시 로그인해 주세요.");
      }
      sessionStorage.setItem("wiki-race-oauth-link-expected-id",user.id);
      await beginOAuthLink(supabase.auth,provider,window.location.origin);
    }catch(e){
      sessionStorage.removeItem("wiki-race-oauth-link-expected-id");
      setError(e?.message || "소셜 계정 연결을 시작하지 못했습니다.");
      setPending("");
    }
  };
  return <section className="wr-oauth-link-panel" aria-labelledby="wr-oauth-link-title" data-testid="profile-oauth-link">
    <div className="wr-oauth-link-heading">
      <div>
        <p className="wr-oauth-link-eyebrow">ACCOUNT · 로그인 설정</p>
        <h2 id="wr-oauth-link-title">소셜 계정 연결</h2>
        <p>지금 로그인한 Wiki Race 계정에 연결해 두면 같은 XP·업적·기록으로 간편하게 로그인할 수 있어요.</p>
      </div>
      <span className="wr-oauth-link-icon" aria-hidden="true">↗</span>
    </div>
    {loading ? <p role="status">계정 연결 상태를 확인하고 있습니다…</p> :
      <div className="wr-oauth-link-providers">
        {providers.map(provider => (
          <div className="wr-oauth-linked-row" key={provider}>
            <div className="wr-oauth-linked-provider">
              <strong>{OAUTH_PROVIDER_NAMES[provider]}</strong>
              <span>{linked.includes(provider) ? "이 계정으로 로그인할 수 있습니다." : "현재 Wiki Race 계정에 연결되지 않았습니다."}</span>
            </div>
            {linked.includes(provider) ? (
              <span className="wr-oauth-connected"><span aria-hidden="true">✓</span> 연결됨</span>
            ) : (
              <button type="button" className="app-btn wr-oauth-link-action"
                disabled={Boolean(pending)} onClick={() => connect(provider)}>
                {pending === provider ? "연결 중…" : `${OAUTH_PROVIDER_NAMES[provider]} 연결하기`}
              </button>
            )}
          </div>
        ))}
      </div>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <p className="wr-oauth-link-footnote">기존 계정으로 로그인한 상태에서 연결해 주세요. 이미 다른 Wiki Race 계정에 가입한 소셜 계정은 이 계정에 바로 연결하거나 기록을 합칠 수 없습니다.</p>
  </section>;
}
