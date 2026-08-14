import React, { useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  Route,
  RouterProvider,
  Routes,
  useNavigate,
} from "react-router-dom";
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


import IntroPage from "./pages/IntroPage";
import GroupRoomPage from "./pages/GroupRoomPage";
import GroupGamePage from "./pages/GroupGamePage";
import PublicContentPage from "./pages/PublicContentPage";
import {
  clearGuestSingleGameProgress,
  getSingleGameAccess,
  readGuestSingleGameSession,
} from "./utils/singleGameSession";
import {
  LOBBY_PATH,
  LOGIN_PATH,
  getLobbyAccess,
  getSingleGameLobbyNavigation,
} from "./utils/appRoutes";
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
    return <Navigate to={LOGIN_PATH} replace />;
  }

  return children;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={LOBBY_PATH} replace />;
  return <LoginPage />;
}

function LobbyRoute() {
  const { user, loading } = useAuth();
  const access = getLobbyAccess({ loading, user });

  if (access === "loading") {
    return (
      <div className="app-center">
        <p className="app-muted">세션 확인 중...</p>
      </div>
    );
  }

  if (access === "login") {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  return <MainPage />;
}

function GameRoute({ isGuestRecovery = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saveStatus, setSaveStatus] = useState("");
  const isGuestGame = Boolean(user?.isGuest || isGuestRecovery);

  const handleSaveRecord = async (result) => {
    if (result?.serverFinalized) {
      setSaveStatus("서버에서 결과와 랭킹 기록을 확정했습니다.");
      return;
    }
    if (isGuestGame) {
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
        pathTitles: result.pathTitles,
      });
      setSaveStatus("랭킹에 기록이 저장되었습니다.");
    } catch (error) {
      setSaveStatus(error?.message || "랭킹 기록 저장에 실패했습니다.");
    }
  };

  const handleReturnLobby = () => {
    if (isGuestGame) {
      clearGuestSingleGameProgress();
    }
    const destination = getSingleGameLobbyNavigation();
    navigate(destination.path, destination.options);
  };

  return (
    <>
      <div className="game-nav">
        <button type="button" className="app-btn app-btn-ghost" onClick={handleReturnLobby}>
          로비
        </button>
        <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/ranking")}>
          랭킹
        </button>
      </div>
      {saveStatus && <div className="save-status">{saveStatus}</div>}
      <GamePage
        onGameComplete={handleSaveRecord}
        onReturnLobby={handleReturnLobby}
        guestRecovery={isGuestRecovery}
      />
    </>
  );
}

function SingleGameRoute() {
  const { user, loading } = useAuth();
  const [guestSession] = useState(() => readGuestSingleGameSession());
  const access = getSingleGameAccess({ loading, user, guestSession });

  if (access === "loading") {
    return (
      <div className="app-center">
        <p className="app-muted">세션 확인 중...</p>
      </div>
    );
  }

  if (access === "login") {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  return <GameRoute isGuestRecovery={access === "guest-recovery"} />;
}

/**
 * 전체 라우팅 설정
 * - /login: 로그인/회원가입
 * - /lobby: 메인 대시보드 (로그인 또는 로컬 게스트)
 * - /game: 게임 화면 (로그인 또는 유효한 게스트 싱글 세션 필요)
 * - /ranking: 전체 랭킹 (인증 필수)
 * - /profile: 내 프로필 (인증 필수)
 */
function AppRoutes() {
  return (
    <Routes>
      {/* 시작 화면 */}
      <Route path="/" element={<IntroPage />} />

      {/* 기존 로그인 페이지도 유지 가능 */}
      <Route path={LOGIN_PATH} element={<LoginRoute />} />

      <Route path="/about" element={<PublicContentPage />} />
      <Route path="/guide" element={<PublicContentPage />} />
      <Route path="/privacy" element={<PublicContentPage />} />
      <Route path="/terms" element={<PublicContentPage />} />

      <Route
        path={LOBBY_PATH}
        element={<LobbyRoute />}
      />

      <Route
        path="/game"
        element={<SingleGameRoute />}
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
      <Route
        path="/multiplayer/group/room/:roomId"
        element={
          <ProtectedRoute>
            <GroupRoomPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/multiplayer/group/game/:roomId"
        element={
          <ProtectedRoute>
            <GroupGamePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return <RouterProvider router={appRouter} />;
}

// useBlocker 기반 명시적 이탈 가드는 data router에서만 동작하므로
// 기존 BrowserRouter 대신 createBrowserRouter를 앱의 단일 진입점으로 사용한다.
const appRouter = createBrowserRouter([
  {
    path: "*",
    element: (
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    ),
  },
]);
