import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../authContext";
import LoginPage from "./LoginPage";

// Opening.png 실제 위치에 맞게 이 경로만 맞춰주세요.
// 예시 1) pages 폴더 안이면: ./Opening.png
// 예시 2) src/assets 안이면: ../assets/Opening.png
// 예시 3) public 폴더면 import 없이 backgroundImage: 'url(/Opening.png)'
import openingBg from "../wiki/Opening.png";

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
            onClick={() => setShowLogin(true)}
        >
            <div className="intro-overlay" />

            <div className="intro-content">
                <div className="intro-logo-badge">WIKI RACE</div>
                <h1 className="intro-title">위키 링크 레이스</h1>
                <p className="intro-subtitle">
                    링크를 따라 목표 문서에 먼저 도착하세요
                </p>

                {!showLogin && (
                    <div className="intro-press-start">
                        아무 키나 누르거나 화면을 클릭하세요
                    </div>
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
                        <LoginPage />
                    </div>
                </div>
            )}
        </div>
    );
}