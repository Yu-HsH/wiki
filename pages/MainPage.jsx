import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { fetchUserStats, fetchRankings } from "../rankingService";
import WikiRaceShell, { ExplorerAvatar } from "../components/wiki-race/WikiRaceShell";
import ExpeditionHero from "../components/wiki-race/ExpeditionHero";
import ExpeditionDialog from "../components/wiki-race/ExpeditionDialog";
import PlayPage from "./PlayPage";
import AdBanner from "../components/AdBanner";
import { searchWikiTitleCandidates } from "../services/wikiService";
import { fetchAllProfileStats } from "../services/profileStatsService";
import { fetchXpSummary } from "../services/xpService";
import { fetchMyAchievements } from "../services/achievementService";
import {
  ACHIEVEMENT_NOTICE_SESSION_KEY,
  formatNewAchievementNotice,
  shouldShowAchievementNotice,
} from "../utils/achievementDisplay";
import { fetchTodayDailyChallenge, getFallbackDailyChallenge } from "../services/dailyChallengeService";
import { trackEvent } from "../services/analyticsService";

/**
 * 메인 대시보드 페이지 컴포넌트
 * - 유저 통계(총 플레이, 최고 기록) 및 최근 기록 표시
 * - 게임 모드 선택 (랜덤/키워드) 및 오늘의 도전 제공
 * - 상단 헤더를 통해 프로필 이동 및 로그아웃 가능
 */

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
  { keyword: "벤치 프레스", hint: "웨이트 트레이닝의 'Big 3'로 불리는 대표적인 근력 운동 중 하나" },
  { keyword: "고래상어", hint: "현존 가장 큰 어류" },
  { keyword: "GPT (언어 모델)", hint: "AI 미국의 인공지능 단체 오픈AI가 2018년 선보인 대형 언어 모델" },
  { keyword: "교황 프란치스코", hint: "아르헨티나 출신으로 제266대 로마 가톨릭교회의 교황" },
  { keyword: "SQL", hint: "관계형 데이터베이스 관리 시스템(RDBMS)의 데이터를 조작하고 정의하기 위해 설계된 프로그래밍 언어" },
  { keyword: "백준 온라인 저지", hint: "알고리즘 문제 풀이 사이트" },
  { keyword: "생맥주", hint: "전 세계적으로 사랑받는 술" },
  { keyword: "레드벨벳 (아이돌)", hint: "대한민국의 5인조 걸그룹" },
];

function getDailyChallenge() {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return DAILY_POOL[seed % DAILY_POOL.length];
}

export default function MainPage({ view = "home" }) {
  const navigate = useNavigate();
  const { user, logout, isSupabaseConfigured } = useAuth();
  const [stats, setStats] = useState({ gamesPlayed: 0, bestTime: null, recentRecords: [] });
  const [showHelp, setShowHelp] = useState(false);
  const [rankingTabs, setRankingTabs] = useState({
    today: [],
    weekly: [],
    all: [],
  });

  const [rankingView, setRankingView] = useState("today");
  // 헤더의 Lv. 표시. 게스트는 XP가 없으므로 항상 null이다 (15 §2).
  const [headerLevel, setHeaderLevel] = useState(null);
  const [xpSummary, setXpSummary] = useState(null);
  // 결과 화면이 없는 해금(그룹·1:1 기권·장착·소급)을 묶어 알린다 (16c). 게스트는 업적이 없다.
  const [unseenAchievements, setUnseenAchievements] = useState(0);
  const [achievementNoticeDismissed, setAchievementNoticeDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(ACHIEVEMENT_NOTICE_SESSION_KEY);
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  // 조회가 끝나기 전에는 코스가 없다. fallback을 초기값으로 두면 조회 전 클릭이 fallback 코스로
  // 게임을 시작하고, 그 완주는 오늘 코스가 아닌 목표 지정(15 XP)으로 분류된다 (15c 스모크 실측).
  const [dailyChallenge, setDailyChallenge] = useState(null);

  // ⬇️ 검색 실행 핸들러 수정
  const handleSearchKeyword = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    // "랜덤" 키워드 입력 시 위키 검색 생략
    if (trimmed === "랜덤") {
      setSearchResults([]);
      setSelectedTarget({ title: "랜덤", isSpecial: true });
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchWikiTitleCandidates(trimmed, 5);
      setSearchResults(results);
      setSelectedTarget(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [data, todayRankings, weeklyRankings, allRankings, detailedStats] = await Promise.all([
          fetchUserStats(user.id),
          fetchRankings({ period: "daily", limit: 3 }),
          fetchRankings({ period: "weekly", limit: 3 }),
          fetchRankings({ period: "all", limit: 3 }),
          fetchAllProfileStats(user.id)
        ]);

        if (!cancelled) {
          setStats({ ...data, detailed: detailedStats });
          setRankingTabs({
            today: todayRankings,
            weekly: weeklyRankings,
            all: allRankings,
          });
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

  useEffect(() => {
    if (user.isGuest) {
      setHeaderLevel(null);
      setXpSummary(null);
      return;
    }
    let cancelled = false;
    // 레벨은 서버가 계산한다 (C3 §4). 실패하면 표시만 빠지고 로비는 그대로 뜬다.
    fetchXpSummary(user.id)
      .then((summary) => { if (!cancelled) { setHeaderLevel(summary.level); setXpSummary(summary); } })
      .catch(() => { if (!cancelled) setHeaderLevel(null); });
    return () => { cancelled = true; };
  }, [user.id, user.isGuest]);

  useEffect(() => {
    if (user.isGuest) {
      setUnseenAchievements(0);
      return;
    }
    let cancelled = false;
    // 실패하면 알림만 빠진다. seen은 여기서 남기지 않는다 — 업적 화면 진입 시에만.
    fetchMyAchievements()
      .then((response) => { if (!cancelled) setUnseenAchievements(Number(response.unseenCount) || 0); })
      .catch(() => { if (!cancelled) setUnseenAchievements(0); });
    return () => { cancelled = true; };
  }, [user.id, user.isGuest]);

  const dismissAchievementNotice = () => {
    const value = String(unseenAchievements);
    setAchievementNoticeDismissed(value);
    try {
      sessionStorage.setItem(ACHIEVEMENT_NOTICE_SESSION_KEY, value);
    } catch {
      // 저장소가 막혀 있으면 이번 화면에서만 숨긴다.
    }
  };

  useEffect(() => {
    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const visitKey = `wiki-race-daily-visit-${today}`;

      if (localStorage.getItem(visitKey)) return;

      localStorage.setItem(visitKey, "1");

      trackEvent("daily_visit", {
        user,
        mode: "main",
        metadata: {
          userAgent: navigator.userAgent,
        },
      });
    } catch (error) {
      console.warn("Daily visit analytics failed:", error);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadDailyChallenge = async () => {
      let challenge;
      try {
        challenge = await fetchTodayDailyChallenge();
      } catch (error) {
        // 예전에는 초기값이 fallback이라 예외가 나도 fallback이 남았다. 그 동작을 유지한다 (G14는 별건).
        console.warn("오늘의 도전을 불러오지 못해 기본 코스를 표시합니다.", error);
        challenge = getFallbackDailyChallenge();
      }
      if (!cancelled) {
        setDailyChallenge(challenge);
      }
    };

    loadDailyChallenge();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const order = ["today", "weekly", "all"];

    const timer = setInterval(() => {
      setRankingView((prev) => {
        const currentIndex = order.indexOf(prev);
        return order[(currentIndex + 1) % order.length];
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const rankMedal = (i) => String(i + 1).padStart(2, "0");

  return (
    <WikiRaceShell user={user} level={headerLevel} onLogout={handleLogout} view={view}>
        {/* ── 새 업적 알림 (16c). 닫기 = 이번 세션 동안 숨김 ── */}
        {!user.isGuest && shouldShowAchievementNotice(unseenAchievements, achievementNoticeDismissed) && (
          <div className="ach-notice" role="status">
            <button type="button" className="ach-notice-link" onClick={() => navigate("/achievements")}>
              {formatNewAchievementNotice(unseenAchievements)} — 업적 화면에서 확인하세요
            </button>
            <button
              type="button"
              className="ach-notice-close"
              aria-label="새 업적 알림 닫기"
              onClick={dismissAchievementNotice}
            >
              ×
            </button>
          </div>
        )}

        {view === "play" ? (
          <PlayPage
            isGuest={user.isGuest}
            onSingle={() => { setKeyword(""); setShowKeywordModal(true); }}
            onMultiplayer={(mode) => navigate(`/multiplayer?mode=${mode}`)}
          />
        ) : <ExpeditionHero onPlay={() => navigate("/play")} />}

        {/* ── 키워드 입력 및 검색 모달 ── */}
        {showKeywordModal && (
          <div className="qs-modal-backdrop" onClick={() => setShowKeywordModal(false)}>
            <ExpeditionDialog className="qs-modal" titleId="wr-single-title" onClose={() => setShowKeywordModal(false)}>
              <h3 id="wr-single-title" className="qs-modal-title">목표 문서 확정</h3>
              <p className="qs-modal-desc">위키백과에서 도달할 정확한 문서를 검색하고 선택하세요.</p>

              <div style={{ display: "flex", gap: "8px", marginBottom: "0.5rem" }}>
                <input
                  className="qs-modal-input"
                  style={{ flex: 1, margin: 0 }}
                  placeholder="예: 아인슈타인, 조선왕조..."
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setSearchResults([]);
                    setSelectedTarget(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyword.trim()) handleSearchKeyword();
                    if (e.key === "Escape") setShowKeywordModal(false);
                  }}
                />
                <button
                  type="button"
                  className="app-btn app-btn-secondary"
                  onClick={handleSearchKeyword}
                  disabled={isSearching || !keyword.trim()}
                >
                  {isSearching ? "검색 중..." : "검색"}
                </button>
              </div>

              {/* 💡 힌트 텍스트 추가 */}
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                💡 팁: '랜덤'을 입력하면 추천 랜덤 목표 문서로 시작할 수 있어요.
              </p>

              {/* 검색 결과 목록 표시 */}
              {searchResults.length > 0 && (
                <div className="search-results-list">
                  {searchResults.map((item) => (
                    <button
                      type="button"
                      aria-pressed={selectedTarget?.title === item.title}
                      key={item.title}
                      onClick={() => setSelectedTarget(item)}
                      className={`search-item ${selectedTarget?.title === item.title ? "selected" : ""}`}
                    >
                      <strong className="search-item-title">
                        {item.title}
                      </strong>
                      <div
                        className="search-item-snippet"
                        dangerouslySetInnerHTML={{ __html: item.snippet }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && keyword.trim() && keyword.trim() !== "랜덤" && !isSearching && (
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "1rem" }}>검색 후 아래에서 문서를 선택해주세요.</p>
              )}

              <div className="qs-modal-actions">
                <button type="button" className="app-btn app-btn-ghost" onClick={() => setShowKeywordModal(false)}>취소</button>
                <button
                  type="button"
                  className="app-btn app-btn-primary"
                  disabled={!selectedTarget && keyword.trim() !== "랜덤"}
                  onClick={() => {
                    setShowKeywordModal(false);
                    // "랜덤" 키워드인 경우 바로 랜덤 모드로 시작
                    if (keyword.trim() === "랜덤") {
                      navigate("/game", {
                        state: {
                          mode: "random"
                        }
                      });
                    } else {
                      // 일반 키워드인 경우 선택된 타겟으로 시작
                      navigate("/game", {
                        state: {
                          mode: "custom",
                          rawKeyword: keyword.trim(),
                          targetTitle: selectedTarget.title
                        }
                      });
                    }
                  }}
                >
                  {keyword.trim() === "랜덤"
                    ? "랜덤 목표로 시작"
                    : (selectedTarget ? `'${selectedTarget.title}' 시작` : "목표를 선택하세요")}
                </button>
              </div>
            </ExpeditionDialog>
          </div>
        )}

        {/* ── 오늘의 도전 ── */}
        <section className="dashboard-card daily-card" aria-busy={!dailyChallenge}>
          <div className="daily-head">
            <span className="daily-badge">TODAY’S RACE · 오늘의 탐험</span>
            <span className="daily-date">{new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</span>
          </div>
          <p className="daily-keyword">{dailyChallenge?.keyword ?? "오늘의 탐험을 불러오는 중…"}</p>
          {dailyChallenge && <p className="daily-hint">{dailyChallenge.hint}</p>}
          <button
            type="button"
            className="app-btn app-btn-primary daily-btn"
            disabled={!dailyChallenge}
            onClick={() => {
              if (!dailyChallenge) return;
              navigate("/game", {
                state: {
                  mode: "daily",
                  keyword: dailyChallenge.keyword,
                  targetTitle: dailyChallenge.keyword,
                },
              });
            }}
          >
            오늘의 탐험 시작 →
          </button>
        </section>

        {view === "home" && <>
        <div className="wr-explorer-featured">
          <section className="wr-my-explorer"><p className="wr-kicker">MY EXPLORER · 내 탐험가</p><div className="wr-explorer-identity"><ExplorerAvatar size={84} /><div><h2>{user.displayName}</h2><p>{user.isGuest ? "게스트 탐험가" : headerLevel !== null ? `Lv.${headerLevel}` : "레벨을 확인하지 못했습니다"}</p></div></div>
          {user.isGuest ? <p>로그인하면 탐험 기록과 XP가 저장됩니다.</p> : xpSummary && <div className="wr-xp"><span>누적 {xpSummary.totalXp} XP</span><progress aria-label="현재 레벨 XP" value={xpSummary.currentLevelXp} max={xpSummary.nextLevelXp || 1} /><small>{xpSummary.currentLevelXp} / {xpSummary.nextLevelXp} XP</small></div>}
          {!user.isGuest && <div className="wr-explorer-links"><Link to="/profile">프로필 보기 →</Link><Link to="/achievements">업적 보기 →</Link></div>}
        </section>
        <section className="dashboard-card weekly-card"><p className="wr-kicker">BASE CAMP RANKING</p>
          <div className="recent-head">
            <div>
              <h2>

                {rankingView === "today"
                  ? "오늘 TOP 3"
                  : rankingView === "weekly"
                    ? "이번 주 TOP 3"
                    : "전체 TOP 3"}
              </h2>

              <div className="ranking-tabs">
                <button
                  type="button"
                  className={rankingView === "today" ? "active" : ""}
                  onClick={() => setRankingView("today")}
                >
                  오늘
                </button>
                <button
                  type="button"
                  className={rankingView === "weekly" ? "active" : ""}
                  onClick={() => setRankingView("weekly")}
                >
                  이번 주
                </button>
                <button
                  type="button"
                  className={rankingView === "all" ? "active" : ""}
                  onClick={() => setRankingView("all")}
                >
                  전체
                </button>
              </div>
            </div>

            {/* /ranking은 ProtectedRoute다 (App.jsx). 게이팅이 없으면 게스트가 눌러도
                /login으로 되돌려 보낸다 — 패킷 17 §6. 같은 목적지의 "전체 랭킹 →"과
                동일하게 조건부 렌더로 숨긴다 */}
            {!user.isGuest && (
              <button type="button" className="text-btn" onClick={() => navigate("/ranking")}>
                전체 보기 →
              </button>
            )}
          </div>

          {rankingTabs[rankingView].length === 0 ? (
            <p className="dashboard-muted">
              {rankingView === "today"
                ? "오늘 기록이 아직 없습니다."
                : rankingView === "weekly"
                  ? "이번 주 기록이 아직 없습니다."
                  : "전체 기록이 아직 없습니다."}
            </p>
          ) : (
            <ol className="weekly-list ranking-rotate-list">
              {rankingTabs[rankingView].map((r, i) => (
                <li key={r.id ?? `${rankingView}-${i}`} className="weekly-item">
                  <span className="wi-medal">{rankMedal(i)}</span>
                  <span className="wi-name">{r.playerName}</span>
                  <span className="wi-target">{r.targetTitle}</span>
                  <span className="wi-time">{formatDuration(r.elapsedSeconds)}</span>
                </li>
              ))}
            </ol>
          )}

          {user.isGuest && (
            <p className="dashboard-muted">
              로그인하면 전체 랭킹을 볼 수 있어요.
            </p>
          )}
        </section>

        </div>
        {/* ── 최근 기록 (최대 3개) ── */}
        <section className="dashboard-card recent-card">
          <img className="wr-recent-route" src="/assets/wiki-race/mini-route.png" alt="" />
          <div className="recent-head">
            <h2>최근 탐험</h2>
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

        <section className="wr-base-board"><p className="wr-kicker">BASE CAMP BOARD · 탐험 기록판</p>
        {/* ── 통계 그리드 (종합 전적) ── */}
        <section className="dashboard-grid">
          <article className="dashboard-card">
            <p className="card-label">싱글 플레이</p>
            <p className="card-value">{loading ? "…" : stats.gamesPlayed > 0 ? `${stats.gamesPlayed}회` : "-"}</p>
            <p className="card-sub-label">최고: {formatDuration(stats.bestTime)}</p>
          </article>
          <article className="dashboard-card">
            <p className="card-label">1 VS 1 대전</p>
            <p className="card-value">
              {loading ? "…" : user.isGuest ? "-" : `${stats.detailed?.pvp?.wins || 0}승 ${stats.detailed?.pvp?.losses || 0}패`}
            </p>
            <p className="card-sub-label">승률: {stats.detailed?.pvp?.winRate || 0}%</p>
          </article>
          <article className="dashboard-card">
            <p className="card-label">그룹 레이스</p>
            <p className="card-value">
              {loading ? "…" : user.isGuest ? "-" : `${(stats.detailed?.group?.first || 0) + (stats.detailed?.group?.second || 0) + (stats.detailed?.group?.third || 0)}회`}
            </p>
            <p className="card-sub-label">1등: {stats.detailed?.group?.first || 0}회</p>
          </article>
        </section>

<div className="wr-board-links"><Link to="/guide">플레이 가이드 →</Link><button type="button" onClick={() => setShowHelp(true)}>게임 설명 →</button><img src="/assets/wiki-race/gear-cluster.png" height="54" alt="" /></div></section>
        </>}
        {/* ── 도움말 모달 ── */}
        {showHelp && (
          <div className="help-backdrop" onClick={() => setShowHelp(false)}>
            <ExpeditionDialog className="help-modal" titleId="wr-help-title" onClose={() => setShowHelp(false)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--app-line)", paddingBottom: "0.75rem" }}>
                <h2 id="wr-help-title" style={{ margin: 0, fontSize: "1.25rem" }}>Wiki Race (위키 레이스)</h2>
                <button type="button" className="text-btn" onClick={() => setShowHelp(false)} style={{ fontSize: "1.5rem", lineHeight: 1 }}>
                  &times;
                </button>
              </div>

              <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "8px" }}>
                <h3>1. Wiki Race란?</h3>
                <ul>
                  <li>위키 문서 안의 링크를 따라 이동해서 목표 문서에 도달하는 게임입니다.</li>
                  <li>시간과 이동 횟수가 기록에 반영됩니다.</li>
                </ul>

                <h3>2. 혼자서 플레이</h3>
                <ul>
                  <li>목표 문서를 직접 검색해서 선택할 수 있습니다.</li>
                  <li>시작 문서에서 링크만 따라 목표 문서까지 이동합니다.</li>
                  <li>아이템을 사용할 수 있습니다.</li>
                  <li>새로고침하면 진행 중인 게임은 유지됩니다.</li>
                  <li>“포기하고 로비로”를 누르면 기록과 아이템 상태가 초기화됩니다.</li>
                </ul>

                <h3>3. 온라인 플레이</h3>
                <ul>
                  <li>친구와 실시간으로 대결할 수 있습니다.</li>
                  <li>1vs1 모드와 그룹모드가 있습니다.</li>
                  <li>방을 만들거나 방 코드로 참가 가능합니다.</li>
                  <li>Supabase Realtime 기반으로 상대 진행 상황이 반영됩니다.</li>
                </ul>

                <h3>4. 랭킹</h3>
                <ul>
                  <li>오늘 / 이번 주 / 전체 랭킹을 확인할 수 있습니다.</li>
                  <li>기록은 도착 시간과 클릭 수를 기준으로 비교됩니다.</li>
                </ul>
              </div>
            </ExpeditionDialog>
          </div>
        )}
        {/* ⬇️ 메인 메뉴 하단 가장 아래쪽에 자연스럽게 광고 배치 */}
        <div style={{ marginTop: "2rem", marginBottom: "1rem" }}>
          <AdBanner adSlot="3144203546" />
        </div>

        <footer className="dashboard-footer-links">
          <Link to="/about">서비스 소개</Link>
          <Link to="/guide">플레이 가이드</Link>
          <Link to="/privacy">개인정보처리방침</Link>
          <Link to="/terms">이용약관</Link>
        </footer>
    </WikiRaceShell>
  );
}
