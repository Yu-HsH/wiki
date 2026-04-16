import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { fetchUserStats } from "../rankingService";

function formatDuration(totalSeconds) {
  if (typeof totalSeconds !== "number") return "-";
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "-";
  }
}

export default function MainPage() {
  const navigate = useNavigate();
  const { user, logout, isSupabaseConfigured } = useAuth();
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    bestTime: null,
    recentRecords: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchUserStats(user.id);
        if (!cancelled) setStats(data);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError?.message || "사용자 통계를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-badge">환영합니다</p>
          <h1>{user.displayName}님, 반가워요</h1>
          <p className="dashboard-muted">
            {isSupabaseConfigured
              ? "온라인 랭킹 모드가 활성화되어 있습니다."
              : "데모 모드로 실행 중입니다. Supabase 키를 설정하면 온라인 랭킹으로 전환됩니다."}
          </p>
        </div>
        <button type="button" className="app-btn app-btn-ghost" onClick={handleLogout}>
          로그아웃
        </button>
      </header>

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <p className="card-label">플레이 횟수</p>
          <p className="card-value">{loading ? "..." : stats.gamesPlayed}</p>
        </article>
        <article className="dashboard-card">
          <p className="card-label">최고 기록</p>
          <p className="card-value">{loading ? "..." : formatDuration(stats.bestTime)}</p>
        </article>
        <article className="dashboard-card">
          <p className="card-label">계정</p>
          <p className="card-value">{user.email || "로컬 데모 계정"}</p>
        </article>
      </section>

      <section className="dashboard-actions">
        <button type="button" className="app-btn app-btn-primary" onClick={() => navigate("/game")}>
          게임 시작
        </button>
        <button type="button" className="app-btn app-btn-secondary" onClick={() => navigate("/ranking")}>
          랭킹 보기
        </button>
      </section>

      <section className="dashboard-card recent-card">
        <div className="recent-head">
          <h2>최근 베스트 기록</h2>
          <button type="button" className="text-btn" onClick={() => navigate("/ranking")}>
            랭킹 열기
          </button>
        </div>
        {error && <p className="app-error">{error}</p>}
        {!error && stats.recentRecords.length === 0 && (
          <p className="dashboard-muted">아직 기록이 없습니다. 게임을 먼저 완료해보세요.</p>
        )}
        {stats.recentRecords.length > 0 && (
          <ul className="recent-list">
            {stats.recentRecords.map((record, index) => (
              <li key={`${record.createdAt}-${index}`} className="recent-item">
                <span>{record.targetTitle}</span>
                <span>{formatDuration(record.elapsedSeconds)}</span>
                <span>{record.clickCount}회 클릭</span>
                <span>{formatDate(record.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
