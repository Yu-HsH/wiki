import React, { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./authContext";
import { saveGameRecord } from "./rankingService";
import GamePage from "./pages/GamePage";
import LoginPage from "./pages/LoginPage";
import MainPage from "./pages/MainPage";
import RankingPage from "./pages/RankingPage";
import "./app.css";

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

function AppRoutes() {
  return (
    <Routes>
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
      <Route path="*" element={<Navigate to="/main" replace />} />
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
