import React,{useEffect,useState} from "react";
import {Navigate,useLocation} from "react-router-dom";
import {useAuth} from "../authContext.jsx";
import {supabase} from "../supabaseClient.js";
import OAuthCompletePage from "../pages/OAuthCompletePage.jsx";

/**
 * Blocks an OAuth-only user without a public.profiles row from ALL game routes.
 * Supabase Auth user !== completed Wiki Race player. Only the DB RPC can create
 * the initial profile, and XP/records are never merged or reassigned.
 */
export default function OAuthAccountGate({children}){
  const {user,loading,logout}=useAuth();
  const {pathname}=useLocation();
  const [status,setStatus]=useState({userId:null,kind:"checking"});

  useEffect(()=>{
    if(!user||user.mode!=="supabase"||user.isGuest){
      setStatus({userId:null,kind:"ready"});
      return;
    }
    let live=true;
    setStatus({userId:user.id,kind:"checking"});
    (async()=>{
      const {data:profile,error:profileError}=await supabase.from("profiles")
        .select("id").eq("id",user.id).maybeSingle();
      if(profileError) throw profileError;
      if(profile){
        if(live)setStatus({userId:user.id,kind:"ready"});
        return;
      }
      const {data,error:identitiesError}=await supabase.auth.getUserIdentities();
      if(identitiesError) throw identitiesError;
      const isSocial=(data?.identities||[])
        .some(identity=>["google","kakao"].includes(identity.provider));
      if(live)setStatus({userId:user.id,kind:isSocial?"onboarding":"missing"});
    })().catch(()=>{
      if(live)setStatus({userId:user.id,kind:"error"});
    });
    return ()=>{live=false;};
  },[user?.id,user?.mode,user?.isGuest]);

  if(loading || (user?.mode==="supabase" && status.userId!==user.id) ||
     (user?.mode==="supabase" && status.kind==="checking")){
    return <div className="app-center"><p className="app-muted">계정 확인 중…</p></div>;
  }
  if(user?.mode==="supabase" && (status.kind==="missing"||status.kind==="error")){
    return <div className="app-center">
      <div className="auth-card">
        <h1>계정 확인이 필요합니다</h1>
        <p>{status.kind==="missing"
          ?"현재 계정에 게임 프로필이 없습니다. 고객지원에 문의해 주세요."
          :"게임 프로필을 확인하지 못했습니다. 인터넷 연결을 확인하고 다시 로그인해 주세요."}</p>
        <button type="button" className="app-btn app-btn-secondary"
          onClick={()=>{void logout().then(()=>window.location.assign("/login"));}}>로그아웃 후 다시 로그인</button>
      </div>
    </div>;
  }
  if(user?.mode==="supabase" && status.kind==="onboarding"){
    if(pathname!=="/oauth/complete")return <Navigate replace to="/oauth/complete"/>;
    return <OAuthCompletePage onComplete={()=>setStatus({userId:user.id,kind:"ready"})}/>;
  }
  if(pathname==="/oauth/complete")return <Navigate replace to={user?"/lobby":"/login"}/>;
  return children;
}
