import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { fetchUserStats, fetchRankings } from "../rankingService";
import AdBanner from "../components/AdBanner";
import { searchWikiTitleCandidates } from "../services/wikiService";
import { fetchAllProfileStats } from "../services/profileStatsService";
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

export default function MainPage() {
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


  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [dailyChallenge, setDailyChallenge] = useState(getFallbackDailyChallenge);

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
      const challenge = await fetchTodayDailyChallenge();
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

  const rankMedal = (i) => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">

        {/* ── 헤더 ── */}
        <header className="dashboard-header">
          <div>
            <p className="dashboard-badge">Wiki Race</p>
            <h1>{user.displayName}님, 반가워요 👋</h1>
            <p className="dashboard-muted">
              {user.isGuest && (
                <span className="dashboard-muted">
                  게스트 모드로 접속 중입니다. 로그인하면 기록이 저장됩니다.
                </span>
              )}
            </p>
          </div>
          {/* 상단 액션 버튼 그룹 */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {!user.isGuest && (
              <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/profile")}>
                내 정보
              </button>
            )}
            <button type="button" className="app-btn app-btn-ghost" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </header>

        {/* ── 빠른 시작 카드 2개 ── */}
        <section className="quickstart-grid">
          <button
            type="button"
            className="quickstart-card quickstart-custom"
            onClick={() => { setKeyword(""); setShowKeywordModal(true); }}
          >
            <span className="qs-icon">🎯</span>
            <span className="qs-title">혼자서 플레이</span>
            <span className="qs-desc">내가 원하는 목표 문서를 직접 찾아가기</span>
          </button>
          {/* 온라인 경로는 로그인 전용이다 (패킷 17 §6).
              게이팅이 없으면 게스트가 눌러도 ProtectedRoute가 /login으로 되돌려 보낸다. */}
          <button
            type="button"
            className="quickstart-card quickstart-pvp"
            disabled={user.isGuest}
            aria-disabled={user.isGuest}
            onClick={() => {
              if (user.isGuest) return;
              navigate("/multiplayer");
            }}
          >
            <span className="qs-icon">⚔️</span>
            <span className="qs-title">온라인 플레이</span>
            <span className="qs-desc">
              {user.isGuest
                ? "로그인하면 친구들과 실시간 대결을 할 수 있어요"
                : "친구들과 실시간 위키 레이스 대결"}
            </span>
          </button>
        </section>

        {/* ── 키워드 입력 및 검색 모달 ── */}
        {showKeywordModal && (
          <div className="qs-modal-backdrop" onClick={() => setShowKeywordModal(false)}>
            <div className="qs-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="qs-modal-title">🎯 목표 문서 확정</h3>
              <p className="qs-modal-desc">위키백과에서 도달할 정확한 문서를 검색하고 선택하세요.</p>

              <div style={{ display: "flex", gap: "8px", marginBottom: "0.5rem" }}>
                <input
                  className="qs-modal-input"
                  style={{ flex: 1, margin: 0 }}
                  autoFocus
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
                    <div
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
                    </div>
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
            </div>
          </div>
        )}


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
            onClick={() => navigate("/game", {
              state: {
                mode: "custom",
                keyword: dailyChallenge.keyword,
                targetTitle: dailyChallenge.keyword,
              },
            })}
          >
            ★ 오늘의 도전에 참여하기
          </button>
        </section>

        <section className="dashboard-card weekly-card">
          <div className="recent-head">
            <div>
              <h2>
                🏆{" "}
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

            <button type="button" className="text-btn" onClick={() => navigate("/ranking")}>
              전체 보기 →
            </button>
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

        {/* 플로팅 도움말 버튼 */}
        <button type="button" className="help-button floating" onClick={() => setShowHelp(true)} aria-label="게임 설명">
          ?
        </button>

        {/* ── 도움말 모달 ── */}
        {showHelp && (
          <div className="help-backdrop" onClick={() => setShowHelp(false)}>
            <div className="help-modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--app-line)", paddingBottom: "0.75rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Wiki Race (위키 레이스)</h2>
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
            </div>
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
      </div>
    </div>
  );
}
