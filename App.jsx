import React, { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./authContext";
import { saveGameRecord } from "./rankingService";
import GamePage from "./pages/GamePage";
import LoginPage from "./pages/LoginPage";
import MainPage from "./pages/MainPage";
import RankingPage from "./pages/RankingPage";
import ProfilePage from "./pages/ProfilePage";
import MultiplayerPage from "./pages/MultiplayerPage";
import RoomPage from "./pages/RoomPage";
import MultiplayerGamePage from "./pages/MultiplayerGamePage";
import "./app.css";
import "./multiplayer.css";
import IntroPage from "./pages/IntroPage";

/**
 * 로그인 여부에 따라 접근을 제어하는 래퍼 컴포넌트
 * - 세션 확인 중일 때는 로딩 표시
 * - 미로그인 시 로그인 페이지로 리다이렉트
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-center">
        <p className="app-muted">세션 확인 중...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/main" replace />;
  return <LoginPage />;
}

function GameRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saveStatus, setSaveStatus] = useState("");

  const handleSaveRecord = async (result) => {
    if (user?.isGuest) {
      alert("랭킹저장은 로그인 후 가능합니다.");
      return;
    }
    try {
      await saveGameRecord({
        userId: user.id,
        playerName: user.displayName,
        startTitle: result.startTitle,
        targetTitle: result.targetTitle,
        elapsedSeconds: result.elapsedSeconds,
        clickCount: result.clickCount,
      });
      setSaveStatus("랭킹에 기록이 저장되었습니다.");
    } catch (error) {
      setSaveStatus(error?.message || "랭킹 기록 저장에 실패했습니다.");
    }
  };

  return (
    <>
      <div className="game-nav">
        <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/main")}>
          메인
        </button>
        <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/ranking")}>
          랭킹
        </button>
      </div>
      {saveStatus && <div className="save-status">{saveStatus}</div>}
      <GamePage
        onGameComplete={handleSaveRecord}
        onReturnMain={() => navigate("/main")}
      />
    </>
  );
}

/**
 * 전체 라우팅 설정
 * - /login: 로그인/회원가입
 * - /main: 메인 대시보드 (인증 필수)
 * - /game: 게임 화면 (인증 필수)
 * - /ranking: 전체 랭킹 (인증 필수)
 * - /profile: 내 프로필 (인증 필수)
 */
function AppRoutes() {
  return (
    <Routes>
      {/* 시작 화면 */}
      <Route path="/" element={<IntroPage />} />

      {/* 기존 로그인 페이지도 유지 가능 */}
      <Route path="/login" element={<LoginRoute />} />

      <Route
        path="/main"
        element={
          <ProtectedRoute>
            <MainPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/game"
        element={
          <ProtectedRoute>
            <GameRoute />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ranking"
        element={
          <ProtectedRoute>
            <RankingPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/multiplayer"
        element={
          <ProtectedRoute>
            <MultiplayerPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/multiplayer/room/:roomId"
        element={
          <ProtectedRoute>
            <RoomPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/multiplayer/game/:roomId"
        element={
          <ProtectedRoute>
            <MultiplayerGamePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
