import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { fetchUserStats, fetchRankings } from "../rankingService";

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
  const [stats, setStats] = useState({ gamesPlayed: 0, bestTime: null, recentRecords: [] });
  const [weeklyTop, setWeeklyTop] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [data, rankings] = await Promise.all([
          fetchUserStats(user.id),
          fetchRankings({ weekly: true, limit: 3 }),
        ]);
        if (!cancelled) {
          setStats(data);
          setWeeklyTop(rankings);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "통계를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const rankMedal = (i) => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;

  return (
    <div className="dashboard-page">

      {/* ── 헤더 ── */}
      <header className="dashboard-header">
        <div>
          <p className="dashboard-badge">Wiki Race</p>
          <h1>{user.displayName}님, 반가워요 👋</h1>
          <p className="dashboard-muted">
            {user.isGuest
              ? "게스트 모드로 접속 중입니다. 로그인하면 기록이 저장됩니다."
              : isSupabaseConfigured
              ? "온라인 랭킹 모드 활성화 중"
              : "데모 모드로 실행 중"}
          </p>
        </div>
        <button type="button" className="app-btn app-btn-ghost" onClick={handleLogout}>
          로그아웃
        </button>
      </header>

      {/* ── 빠른 시작 카드 2개 ── */}
      <section className="quickstart-grid">
        <button
          type="button"
          className="quickstart-card quickstart-random"
          onClick={() => navigate("/game")}
        >
          <span className="qs-icon">🎲</span>
          <span className="qs-title">랜덤으로 시작</span>
          <span className="qs-desc">무작위 위키 출발 → 무작위 목표</span>
        </button>
        <button
          type="button"
          className="quickstart-card quickstart-custom"
          onClick={() => navigate("/game?mode=custom")}
        >
          <span className="qs-icon">🎯</span>
          <span className="qs-title">키워드로 시작</span>
          <span className="qs-desc">내가 원하는 목표 문서를 직접 지정</span>
        </button>
      </section>

      {/* ── 통계 카드 3개 ── */}
      <section className="dashboard-grid">
        <article className="dashboard-card">
          <p className="card-label">총 플레이</p>
          <p className="card-value">{loading ? "…" : stats.gamesPlayed > 0 ? `${stats.gamesPlayed}회` : "-"}</p>
        </article>
        <article className="dashboard-card">
          <p className="card-label">최고 기록</p>
          <p className="card-value">{loading ? "…" : formatDuration(stats.bestTime)}</p>
        </article>
        <article className="dashboard-card">
          <p className="card-label">계정</p>
          <p className="card-value account-value">
            {user.isGuest ? "게스트" : user.email || "로컬 데모"}
          </p>
        </article>
      </section>

      {/* ── 최근 기록 (최대 3개) ── */}
      <section className="dashboard-card recent-card">
        <div className="recent-head">
          <h2>최근 플레이 기록</h2>
          {!user.isGuest && (
            <button type="button" className="text-btn" onClick={() => navigate("/ranking")}>
              전체 랭킹 →
            </button>
          )}
        </div>
        {error && <p className="app-error">{error}</p>}
        {!error && user.isGuest && (
          <p className="dashboard-muted">
            게스트 모드입니다. 기록 저장과 개인 통계는 로그인 후 이용할 수 있어요.
          </p>
        )}
        {!error && !user.isGuest && stats.recentRecords.length === 0 && (
          <p className="dashboard-muted">첫 플레이를 시작해 기록을 남겨보세요.</p>
        )}
        {!user.isGuest && stats.recentRecords.length > 0 && (
          <ul className="recent-list">
            {stats.recentRecords.slice(0, 3).map((record, index) => (
              <li key={`${record.createdAt}-${index}`} className="recent-item">
                <span className="ri-title">{record.targetTitle}</span>
                <span className="ri-time">{formatDuration(record.elapsedSeconds)}</span>
                <span className="ri-clicks">{record.clickCount}회 클릭</span>
                <span className="ri-date">{formatDate(record.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 주간 TOP 3 ── */}
      <section className="dashboard-card weekly-card">
        <div className="recent-head">
          <h2>🏆 이번 주 TOP 3</h2>
          <button type="button" className="text-btn" onClick={() => navigate("/ranking")}>
            전체 보기 →
          </button>
        </div>
        {weeklyTop.length === 0 ? (
          <p className="dashboard-muted">이번 주 기록이 아직 없습니다. 첫 주인공이 되어 보세요!</p>
        ) : (
          <ol className="weekly-list">
            {weeklyTop.map((r, i) => (
              <li key={r.id ?? i} className="weekly-item">
                <span className="wi-medal">{rankMedal(i)}</span>
                <span className="wi-name">{r.playerName}</span>
                <span className="wi-target">{r.targetTitle}</span>
                <span className="wi-time">{formatDuration(r.elapsedSeconds)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

    </div>
  );
}
