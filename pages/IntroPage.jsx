import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { LOBBY_PATH } from "../utils/appRoutes";
import LoginPage from "./LoginPage";
import openingBg from "../Opening.png";
import "../css/jungle65.css";

const JUNGLE_LANDING = "/assets/wiki-race/jungle65/landing-final.webp";

/**
 * Jungle 65 landing: the approved artwork contains baked-in text.
 * The desktop image uses real accessible hit targets at the pictured buttons.
 * On mobile, responsive real controls replace the unreliable hotspots.
 * Authentication stays in LoginPage; no mockup navigation or fake login.
 */
export default function IntroPage() {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState("signin");
  const [jungleAssetReady, setJungleAssetReady] = useState(true);

  const openAuth = (mode = "signin") => {
    setLoginMode(mode);
    setShowLogin(true);
  };

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
      {jungleAssetReady ? (
        <div className="wr65-landing-art">
          <img
            className="wr65-landing-picture"
            src={JUNGLE_LANDING}
            alt="두 탐험가가 정글 유적을 바라보는 Wiki Race 탐험 시작 화면"
            onError={() => setJungleAssetReady(false)}
          />
          <button className="wr65-landing-hit wr65-landing-hit-login" type="button"
            aria-label="Wiki Race 로그인" onClick={() => openAuth("signin")}>로그인</button>
          <button className="wr65-landing-hit wr65-landing-hit-signup" type="button"
            aria-label="Wiki Race 회원가입" onClick={() => openAuth("signup")}>회원가입</button>
          <div className="wr65-landing-hotlinks" aria-label="서비스 정보">
            <Link to="/about">서비스 소개</Link>
            <Link to="/guide">플레이 가이드</Link>
            <Link to="/privacy">개인정보처리방침</Link>
          </div>
        </div>
      ) : (
        <div className="wr65-landing-fallback" style={{ backgroundImage: `url(${openingBg})` }}>
          <div className="intro-overlay" />
          <div className="intro-content">
            <div className="intro-logo-badge">WIKI RACE</div>
            <h1 className="intro-title">위키 링크 레이스</h1>
            <p className="intro-subtitle">다양한 문서를 탐험하고, 누구보다 먼저 목표에 도달하세요.</p>
            <button type="button" className="intro-press-start" onClick={() => openAuth("signin")}>로그인 / 회원가입</button>
            <div className="intro-public-links">
              <Link to="/about">서비스 소개</Link>
              <Link to="/guide">플레이 가이드</Link>
              <Link to="/privacy">개인정보처리방침</Link>
            </div>
          </div>
        </div>
      )}
      <div className="wr65-landing-mobile-controls">
        <button type="button" onClick={() => openAuth("signin")}>로그인 →</button>
        <button type="button" onClick={() => openAuth("signup")}>회원가입 →</button>
        <nav aria-label="서비스 정보">
          <Link to="/about">서비스 소개</Link>
          <Link to="/guide">플레이 가이드</Link>
          <Link to="/privacy">개인정보처리방침</Link>
        </nav>
      </div>
      {showLogin && (
        <div className="intro-modal-backdrop" onClick={() => setShowLogin(false)}>
          <div className="intro-modal-card" role="dialog" aria-modal="true"
            aria-label={loginMode === "signup" ? "회원가입" : "로그인"}
            onClick={(e) => e.stopPropagation()}>
            <LoginPage key={loginMode} isEmbedded initialMode={loginMode} />
          </div>
          <button type="button" className="auth-modal-close"
            aria-label="로그인 창 닫기" onClick={() => setShowLogin(false)}>×</button>
        </div>
      )}
    </div>
  );
}
