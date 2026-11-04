import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { LOBBY_PATH } from "../utils/appRoutes";
import LoginPage from "./LoginPage";
import openingBg from "../Opening.png";
import JungleAtmosphere from "../components/wiki-race/JungleAtmosphere.jsx";
import "../css/jungle65.css";

const JUNGLE_LANDING = "/assets/wiki-race/jungle65/landing-final.webp";

/**
 * The approved art includes its logo, copy and controls: keep it unobscured.
 * Desktop hotspots and separate small-screen buttons use the same real form.
 * Authentication stays in LoginPage; no mockup navigation or fake login.
 */
export default function IntroPage() {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState("signin");
  const [jungleAssetReady, setJungleAssetReady] = useState(true);
  const authDialog = useRef(null);

  const openAuth = (mode = "signin") => {
    setLoginMode(mode);
    setShowLogin(true);
  };

  useEffect(() => {
    if (!showLogin) return undefined;
    const dialog = authDialog.current;
    const trigger = document.activeElement;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .filter(element => element.getClientRects().length > 0);
    (dialog.querySelector('input:not(:disabled)') || focusable()[0] || dialog).focus();
    const handleDialogKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowLogin(false);
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    dialog.addEventListener("keydown", handleDialogKey);
    return () => {
      dialog.removeEventListener("keydown", handleDialogKey);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [showLogin]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") return;
      if (event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(event.target.tagName)) return;
      if (event.key === "Enter" || event.key === " ") openAuth("signin");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading) return <div className="intro-loading">세션 확인 중...</div>;
  if (user) return <Navigate to={LOBBY_PATH} replace />;

  return (
    <div className="intro-page wr65-intro">
      <main className="wr65-landing-stage">
        <h1 className="wr-visually-hidden">Wiki Race · Jungle Expedition</h1>
        {jungleAssetReady ? (
          <div className="wr65-landing-art">
            <img
              className="wr65-landing-picture"
              src={JUNGLE_LANDING}
              width="1672" height="941" loading="eager" decoding="async" fetchPriority="high"
              alt="Wiki Race · 지식이 모이는, 더 빠른 여정. 정글의 문서를 탐험하고 가장 먼저 목표에 도달해 보세요."
              onError={() => setJungleAssetReady(false)}
            />
            <JungleAtmosphere variant="landing" />
            <button className="wr65-landing-hit wr65-landing-hit-login" type="button"
              aria-label="Wiki Race 로그인" onClick={() => openAuth("signin")}>로그인</button>
            <button className="wr65-landing-hit wr65-landing-hit-signup" type="button"
              aria-label="Wiki Race 회원가입" onClick={() => openAuth("signup")}>회원가입</button>
            <nav className="wr65-landing-hotlinks" aria-label="서비스 정보">
              <Link to="/about">서비스 소개</Link>
              <Link to="/guide">플레이 가이드</Link>
              <Link to="/privacy">개인정보처리방침</Link>
            </nav>
          </div>
        ) : <section className="wr65-landing-fallback">
          <img src={openingBg} alt="위키 문서 사이를 잇는 탐험 경로" />
        </section>}
        <div className={`wr65-landing-mobile-controls wr65-landing-actions${jungleAssetReady ? "" : " wr65-fallback-controls"}`}>
          <button type="button" className="wr65-landing-start" onClick={() => openAuth("signin")}>로그인 <span aria-hidden="true">→</span></button>
          <button type="button" className="wr65-landing-signup" onClick={() => openAuth("signup")}>회원가입 <span aria-hidden="true">→</span></button>
          <nav className="wr65-landing-links" aria-label="서비스 정보">
            <Link to="/about">서비스 소개</Link>
            <Link to="/guide">플레이 가이드</Link>
            <Link to="/privacy">개인정보처리방침</Link>
          </nav>
        </div>
      </main>
      {showLogin && (
        <div className="intro-modal-backdrop" onClick={() => setShowLogin(false)}>
          <div ref={authDialog} className="intro-modal-card" role="dialog" aria-modal="true" tabIndex={-1}
            aria-labelledby="wr-auth-title"
            onClick={(e) => e.stopPropagation()}>
            <button type="button" className="auth-modal-close"
              aria-label="로그인 창 닫기" onClick={() => setShowLogin(false)}>×</button>
            <LoginPage key={loginMode} isEmbedded initialMode={loginMode} />
          </div>
        </div>
      )}
    </div>
  );
}
