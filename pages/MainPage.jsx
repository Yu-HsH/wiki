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

/* 오늘의 도전: 날짜 기반으로 목록에서 하나 선택 */
const DAILY_POOL = [
  { keyword: "아인슈타인", hint: "물리학의 전설적 인물" },
  { keyword: "제2차 세계 대전", hint: "인류 역사상 가장 큰 전쟁" },
  { keyword: "머신러닝", hint: "AI 핵심 키워드" },
  { keyword: "조선왕조", hint: "500년 역사의 왕조" },
  { keyword: "올림픽", hint: "세계인의 스포츠 축제" },
  { keyword: "히말라야", hint: "세계 최고 높이의 산맥" },
  { keyword: "메소포타미아", hint: "인류 문명의 발상지" },
];

function getDailyChallenge() {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return DAILY_POOL[seed % DAILY_POOL.length];
}

export default function MainPage() {
  const navigate = useNavigate();
  const { user, logout, isSupabaseConfigured } = useAuth();
  const [stats, setStats] = useState({ gamesPlayed: 0, bestTime: null, recentRecords: [] });
  const [weeklyTop, setWeeklyTop] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [dailyChallenge] = useState(getDailyChallenge);

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
          onClick={() => navigate("/game", { state: { mode: "random" } })}
        >
          <span className="qs-icon">🎲</span>
          <span className="qs-title">랜덤으로 시작</span>
          <span className="qs-desc">무작위 위키 출발 → 무작위 목표</span>
        </button>
        <button
          type="button"
          className="quickstart-card quickstart-custom"
          onClick={() => { setKeyword(""); setShowKeywordModal(true); }}
        >
          <span className="qs-icon">🎯</span>
          <span className="qs-title">키워드로 시작</span>
          <span className="qs-desc">내가 원하는 목표 문서를 직접 지정</span>
        </button>
      </section>

      {/* ── 키워드 입력 모달 ── */}
      {showKeywordModal && (
        <div className="qs-modal-backdrop" onClick={() => setShowKeywordModal(false)}>
          <div className="qs-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="qs-modal-title">🎯 목표 키워드</h3>
            <p className="qs-modal-desc">도달할 위키 문서의 키워드를 입력하세요.</p>
            <input
              className="qs-modal-input"
              autoFocus
              placeholder="예: 아인슈타인, 조선왕조, 축구..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyword.trim()) {
                  setShowKeywordModal(false);
                  navigate("/game", { state: { mode: "custom", keyword: keyword.trim() } });
                }
                if (e.key === "Escape") setShowKeywordModal(false);
              }}
            />
            <div className="qs-modal-actions">
              <button
                type="button"
                className="app-btn app-btn-ghost"
                onClick={() => setShowKeywordModal(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="app-btn app-btn-primary"
                disabled={!keyword.trim()}
                onClick={() => {
                  setShowKeywordModal(false);
                  navigate("/game", { state: { mode: "custom", keyword: keyword.trim() } });
                }}
              >
                시작
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── 오늘의 도전 ── */}
      <section className="dashboard-card daily-card">
        <div className="daily-head">
          <span className="daily-badge">🗓️ TODAY’S CHALLENGE</span>
          <span className="daily-date">{new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</span>
        </div>
        <p className="daily-keyword">{dailyChallenge.keyword}</p>
        <p className="daily-hint">{dailyChallenge.hint}</p>
        <button
          type="button"
          className="app-btn app-btn-primary daily-btn"
          onClick={() => navigate("/game", { state: { mode: "custom", keyword: dailyChallenge.keyword } })}
        >
          ★ 오늘의 도전에 참여하기
        </button>
      </section>

    </div>
  );
}
