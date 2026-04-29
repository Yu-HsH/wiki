import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../authContext";
import LoginPage from "./LoginPage";

// c:\Users\황성현\Desktop\game\wiki\Opening.png 에 위치하므로 경로 수정
import openingBg from "../Opening.png";

/**
 * 첫 시작 화면
 * - 배경 이미지 표시
 * - 아무 키 / 클릭 시 로그인 박스 표시
 * - 이미 로그인된 유저는 바로 /main 이동
 */
export default function IntroPage() {
    const { user, loading } = useAuth();
    const [showLogin, setShowLogin] = useState(false);

    useEffect(() => {
        const handleKeyDown = () => {
            setShowLogin(true);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    if (loading) {
        return <div className="intro-loading">세션 확인 중...</div>;
    }

    if (user) {
        return <Navigate to="/main" replace />;
    }

    return (
        <div
            className="intro-page"
            style={{
                backgroundImage: `url(${openingBg})`,
            }}
        >
            <div className="intro-overlay" />

            <div className="intro-content">
                <div className="intro-logo-badge">WIKI RACE</div>
                <h1 className="intro-title">위키 링크 레이스</h1>
                <p className="intro-subtitle">
                    링크를 따라 목표 문서에 먼저 도착하세요
                </p>

                {!showLogin && (
                    <button
                        type="button"
                        className="intro-press-start"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowLogin(true);
                        }}
                    >
                        로그인 / 회원가입
                    </button>
                )}
            </div>

            {showLogin && (
                <div
                    className="intro-modal-backdrop"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowLogin(false);
                    }}
                >
                    <div
                        className="intro-modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <LoginPage isEmbedded />
                    </div>
                    <button
                        type="button"
                        className="auth-modal-close"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowLogin(false);
                        }}
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
}