import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { fetchSingleGameRecords, fetchRankings } from "../rankingService";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell";
import ExpeditionHero from "../components/wiki-race/ExpeditionHero";
import ExpeditionDialog from "../components/wiki-race/ExpeditionDialog";
import PlayPage from "./PlayPage";
import AdBanner from "../components/AdBanner";
import { searchWikiTitleCandidates } from "../services/wikiService";
import { fetchAllProfileStats } from "../services/profileStatsService";
import { serviceErrorMessage } from "../utils/serviceError.js";
import { fetchXpSummary } from "../services/xpService";
import { fetchMyAchievements } from "../services/achievementService";
import {
  ACHIEVEMENT_NOTICE_SESSION_KEY,
  formatNewAchievementNotice,
  shouldShowAchievementNotice,
} from "../utils/achievementDisplay";
import { fetchTodayDailyChallenge, getFallbackDailyChallenge } from "../services/dailyChallengeService";
import "../css/wikiRaceHome.css";
import ProfileCard from "../components/ProfileCard";
import useProfileCards from "../hooks/useProfileCards.js";
import { buildProfileCard, mergeRewardSlots } from "../utils/profileCard.js";
import WikiHighlights from "../components/WikiHighlights";
import { fetchExplorerXpRankings } from "../rankingService";
import useOwnProfileCard from "../hooks/useOwnProfileCard.js";
import { HOME_RANKING_TABS, nextHomeRankingTab, homeRankUsesTime } from "../utils/homeRanking.js";
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
    challenge: [],
  });

  const rewardCards = useProfileCards(view === "home" ? [...Object.values(rankingTabs).flat().map(row => row.userId), ...(!user.isGuest ? [user.id] : [])] : []);
  const [rankingView, setRankingView] = useState("today");
  const [rankingPaused, setRankingPaused] = useState(false);
  const manualRotationPause = useRef(0);
  // 헤더의 Lv. 표시. 게스트는 XP가 없으므로 항상 null이다 (15 §2).
  const [headerLevel, setHeaderLevel] = useState(null);
  const [xpSummary, setXpSummary] = useState(null);
  const ownCard = useOwnProfileCard(user, xpSummary?.level ?? null);
  // 결과 화면이 없는 해금(그룹·1:1 기권·장착·소급)을 묶어 알린다 (16c). 게스트는 업적이 없다.
  const [unseenAchievements, setUnseenAchievements] = useState(0);
  const [achievementNoticeDismissed, setAchievementNoticeDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(ACHIEVEMENT_NOTICE_SESSION_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (view !== "home") return undefined;
    const timer = setInterval(() => {
      if (rankingPaused || document.hidden || Date.now() < manualRotationPause.current
        || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      setRankingView(previous => nextHomeRankingTab(previous));
    }, 10000);
    return () => clearInterval(timer);
  }, [view, rankingPaused]);

  const selectHomeRanking = (tab) => {
    manualRotationPause.current = Date.now() + 30000;
    setRankingView(tab);
  };
  const activeRanking = HOME_RANKING_TABS.find(tab => tab.key === rankingView) ?? HOME_RANKING_TABS[0];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rankingErrors, setRankingErrors] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [statsSummaryError, setStatsSummaryError] = useState(false);
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  // 조회가 끝나기 전에는 코스가 없다. fallback을 초기값으로 두면 조회 전 클릭이 fallback 코스로
  // 게임을 시작하고, 그 완주는 오늘 코스가 아닌 목표 지정(15 XP)으로 분류된다 (15c 스모크 실측).
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const dailyCourseAvailable = Boolean(dailyChallenge?.startTitle && (!isSupabaseConfigured || dailyChallenge.source === "supabase"));

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
        const [records, todayRankings, weeklyRankings, allRankings, challengeRankings, detailedStats] = await Promise.allSettled([
          (user.isGuest ? Promise.resolve([]) : fetchSingleGameRecords({ userId: user.id })).then(records => ({ gamesPlayed: records.length, bestTime: records[0]?.elapsedSeconds ?? null, recentRecords: records.slice(0, 5) })),
          user.isGuest ? [] : fetchRankings({ period: "today_runs", limit: 3 }),
          user.isGuest ? [] : fetchExplorerXpRankings({ weekly: true, limit: 3 }),
          user.isGuest ? [] : fetchExplorerXpRankings({ limit: 3 }),
          user.isGuest ? [] : fetchRankings({ period: "daily", limit: 3 }),
          fetchAllProfileStats(user.id)
        ]);
        for (const [label, result] of Object.entries({ records, todayRankings, weeklyRankings, allRankings, challengeRankings, detailedStats })) {
          if (result.status === 'rejected') console.error(`HOME ${label} 조회 실패:`, result.reason);
        }

        if (!cancelled) {
          // HOME의 각 정보는 독립적이다. 한 랭킹 장애로 성공한 내 기록까지 지우지 않는다.
          setStats({
            ...(records.status === "fulfilled" ? records.value : { gamesPlayed: 0, bestTime: null, recentRecords: [] }),
            detailed: detailedStats.status === "fulfilled" ? detailedStats.value : null,
          });
          setError(records.status === "rejected" ? "탐험 기록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." : "");
          setStatsSummaryError(detailedStats.status === "rejected");
          setRankingTabs({
            today: todayRankings.status === "fulfilled" ? todayRankings.value.slice(0, 3) : [],
            weekly: weeklyRankings.status === "fulfilled" ? weeklyRankings.value.filter(row => row.rank <= 3).slice(0, 3) : [],
            all: allRankings.status === "fulfilled" ? allRankings.value.filter(row => row.rank <= 3).slice(0, 3) : [],
            challenge: challengeRankings.status === "fulfilled" ? challengeRankings.value.slice(0, 3) : [],
          });
          setRankingErrors({
            today: todayRankings.status === "rejected",
            weekly: weeklyRankings.status === "rejected",
            all: allRankings.status === "rejected",
            challenge: challengeRankings.status === "rejected",
          });
        }
      } catch (e) {
        console.error('HOME 통계 조회 실패:', e);
        if (!cancelled) setError(serviceErrorMessage(e, '통계'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.id, user.isGuest, reloadKey]);

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

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };


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
        ) : <ExpeditionHero notebook onPlay={() => navigate("/play")} />}

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
        <section className="dashboard-card daily-card" aria-busy={!dailyChallenge} aria-label="오늘의 도전">
          <div className="daily-head">
            <h2 className="daily-badge">오늘의 도전</h2>
            <span className="daily-date">{new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" })}</span>
          </div>
          {!dailyCourseAvailable && <p className="daily-keyword" role="status">{dailyChallenge ? "오늘의 공식 코스를 확인하지 못했습니다." : "오늘의 탐험을 불러오는 중…"}</p>}
          {dailyChallenge && dailyCourseAvailable && <p className="daily-hint">{dailyChallenge.hint}</p>}
          {dailyChallenge && dailyCourseAvailable && <div className="daily-course" aria-label="오늘의 탐험 경로">
            <span className="daily-endpoint"><small>시작 문서</small><strong>{dailyChallenge.startTitle || "공식 시작 문서 확인 필요"}</strong></span><span className="daily-direction" aria-hidden="true">→</span><span className="daily-endpoint"><small>목표 문서</small><strong>{dailyChallenge.keyword}</strong></span>
          </div>}
          <button
            type="button"
            className="app-btn app-btn-primary daily-btn"
            disabled={!dailyChallenge || !dailyChallenge.startTitle || (isSupabaseConfigured && dailyChallenge.source !== "supabase")}
            onClick={() => {
              if (!dailyChallenge) return;
              if (!dailyChallenge.startTitle || (isSupabaseConfigured && dailyChallenge.source !== "supabase")) return;
              navigate("/game", {
                state: {
                  mode: "daily",
                  keyword: dailyChallenge.keyword,
                  targetTitle: dailyChallenge.keyword,
                  startTitle: dailyChallenge.startTitle,
                  challengeDate: dailyChallenge.challengeDate,
                },
              });
            }}
          >
            오늘의 탐험 시작 →
          </button>
        </section>

        {view === "home" && <>
        <div className="wr-explorer-featured">
          <section className="wr-my-explorer" aria-labelledby="wr-explorer-heading"><h2 id="wr-explorer-heading">내 탐험가</h2><div className="wr-explorer-identity"><ProfileCard size="lg" density="full" card={ownCard} /></div>
          {user.isGuest ? <p>로그인하면 탐험 기록과 XP가 저장됩니다.</p> : xpSummary && <div className="wr-xp"><span>누적 {xpSummary.totalXp} XP</span><progress aria-label="현재 레벨 XP" value={xpSummary.currentLevelXp} max={xpSummary.nextLevelXp || 1} /><small>{xpSummary.currentLevelXp} / {xpSummary.nextLevelXp} XP</small></div>}
          {!user.isGuest && <div className="wr-explorer-stats" aria-label="내 탐험 기록">
            <div><small>싱글 완주</small><strong>{stats.detailed?.single?.totalWins ?? stats.gamesPlayed}<span>회</span></strong></div>
            <div><small>1:1 승리</small><strong>{stats.detailed?.pvp?.wins ?? 0}<span>승</span></strong></div>
            <div><small>그룹 1위</small><strong>{stats.detailed?.group?.first ?? 0}<span>회</span></strong></div>
          </div>}
          {!user.isGuest && <div className="wr-explorer-links"><Link to="/profile">프로필 보기 →</Link><Link to="/achievements">업적 보기 →{unseenAchievements > 0 ? ` (${unseenAchievements})` : ""}</Link></div>}
        </section>
        <section className="dashboard-card weekly-card" aria-label="탐험 랭킹"
          onMouseEnter={() => setRankingPaused(true)}
          onMouseLeave={() => setRankingPaused(false)}
          onFocusCapture={() => setRankingPaused(true)}
          onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setRankingPaused(false); }}>
          <div className="recent-head">
            <div>
              <h2>{activeRanking.title} <small>TOP 3</small></h2>
              <p className="wr-ranking-help">{activeRanking.help}</p>
              <div className="ranking-tabs" role="group" aria-label="홈 랭킹 종류">
                {HOME_RANKING_TABS.map(tab => (
                  <button key={tab.key} type="button"
                    aria-pressed={rankingView === tab.key}
                    className={rankingView === tab.key ? "active" : ""}
                    onClick={() => selectHomeRanking(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            {!user.isGuest && <button type="button" className="text-btn" onClick={() => navigate("/ranking")}>
              전체 보기 →
            </button>}
          </div>
          {user.isGuest ? (
            <p className="dashboard-muted">로그인하면 전체 랭킹을 볼 수 있어요.</p>
          ) : loading ? (
            <p className="dashboard-muted" role="status">랭킹을 불러오는 중…</p>
          ) : rankingErrors[rankingView] ? (
            <p className="dashboard-muted" role="status">랭킹을 불러오지 못했습니다. <button type="button" className="text-btn" onClick={() => setReloadKey(value => value + 1)}>랭킹 다시 불러오기</button></p>
          ) : rankingTabs[rankingView].length === 0 ? (
            <p className="dashboard-muted">
              {rankingView === "today" ? "오늘 완주 기록이 아직 없습니다."
                : rankingView === "weekly" ? "이번 주 획득한 게임 XP가 아직 없습니다."
                : rankingView === "challenge" ? "오늘의 도전 완주 기록이 아직 없습니다."
                : "누적 XP 기록이 아직 없습니다."}
            </p>
          ) : (
            <ol className="weekly-list ranking-rotate-list" aria-live="off">
              {rankingTabs[rankingView].map((r, i) => (
                <li key={r.id ?? `${rankingView}-${r.userId}-${i}`} className="weekly-item" data-rank={r.rank || i + 1}>
                  <span className="wi-medal" aria-label={`기록 ${r.rank || i + 1}번`}>{String(r.rank || i + 1).padStart(2, "0")}</span>
                  <div className="wr-rank-content">
                    <ProfileCard size="sm" density="compact" card={mergeRewardSlots(buildProfileCard({ userId: r.userId, nickname: r.nickname || r.playerName, level: r.level, legacyImageUrl: r.profileImageUrl, source: "live" }), rewardCards[r.userId])} />
                    {rankingView === "today" && <div className="wr-ranked-route" title={`${r.startTitle || "시작 미상"} → ${r.targetTitle || "목표 미상"}`}>
                      <span>{r.startTitle || "시작 문서"}</span><span aria-hidden="true">→</span><strong>{r.targetTitle || "목표 문서"}</strong>
                    </div>}
                    {rankingView === "challenge" && <span className="wr-ranked-route">오늘의 동일 코스 · {r.clickCount ?? "-"}회 이동</span>}
                  </div>
                  <div className="wr-ranked-score">
                    <strong>{homeRankUsesTime(rankingView) ? formatDuration(r.elapsedSeconds) : `${r.rankingXp?.toLocaleString("ko-KR") ?? 0} XP`}</strong>
                    {rankingView === "all" && <small>Lv.{r.level ?? "-"}</small>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="wr-rank-rotation-note">10초마다 자동 전환 · 직접 선택하면 30초간 유지</div>
        </section>

        </div>
        {/* ── 최근 기록 (최대 3개) ── */}
        <section className="dashboard-card recent-card">
          <div className="recent-head">
            <h2>최근 탐험</h2>
            {!user.isGuest && (
              <button type="button" className="text-btn" onClick={() => navigate("/ranking")}>
                전체 랭킹 →
              </button>
            )}
          </div>
          {error && <div role="alert"><p className="app-error">{error}</p><button type="button" className="app-btn app-btn-ghost" onClick={() => setReloadKey(value => value + 1)}>탐험 기록 다시 불러오기</button></div>}
          {!error && user.isGuest && (
            <p className="dashboard-muted">
              게스트 모드입니다. 기록 저장과 개인 통계는 로그인 후 이용할 수 있어요.
            </p>
          )}
          {!error && !user.isGuest && loading && <p className="dashboard-muted" role="status">탐험 기록을 불러오는 중…</p>}
          {!error && !loading && !user.isGuest && stats.recentRecords.length === 0 && (
            <p className="dashboard-muted">첫 플레이를 시작해 기록을 남겨보세요.</p>
          )}
          {!user.isGuest && stats.recentRecords.length > 0 && (
            <ul className="recent-list">
              {stats.recentRecords.slice(0, 3).map((record, index) => (
                <li key={`${record.createdAt}-${index}`} className="recent-item">
                  <div className="wr-record-route">
                    {record.startTitle && <><a href={`https://ko.wikipedia.org/wiki/${encodeURIComponent(record.startTitle)}`} target="_blank" rel="noopener noreferrer"><small>시작 문서</small>{record.startTitle}</a><span aria-hidden="true">→</span></>}
                    <a className="ri-title" href={`https://ko.wikipedia.org/wiki/${encodeURIComponent(record.targetTitle)}`} target="_blank" rel="noopener noreferrer"><small>목표 문서</small>{record.targetTitle}</a>
                    {record.pathTitles?.length > 0 && <details className="wr-record-path"><summary>기록된 경로 · {record.pathTitles.length}개 문서</summary><ol>{record.pathTitles.map((title, step) => <li key={step}><a href={`https://ko.wikipedia.org/wiki/${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer">{title}</a></li>)}</ol></details>}
                  </div>
                  <span className="ri-time">{formatDuration(record.elapsedSeconds)}</span>
                  <span className="ri-clicks">{record.clickCount}회 클릭</span>
                  <span className="ri-date">{formatDate(record.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="wr-base-board" aria-labelledby="wr-board-heading"><h2 id="wr-board-heading">탐험 기록판</h2>
        {(error || statsSummaryError) && <p className="dashboard-muted" role="status">일부 전적을 불러오지 못했습니다. <button type="button" className="text-btn" onClick={() => setReloadKey(value => value + 1)}>전적 다시 불러오기</button></p>}
        {/* ── 통계 그리드 (종합 전적) ── */}
        <section className="dashboard-grid">
          <article className="dashboard-card">
            <p className="card-label">싱글 플레이</p>
            <p className="card-value">{loading ? "…" : error ? "-" : stats.gamesPlayed > 0 ? `${stats.gamesPlayed}회` : "-"}</p>
            <p className="card-sub-label">최고: {formatDuration(stats.bestTime)}</p>
          </article>
          <article className="dashboard-card">
            <p className="card-label">1 VS 1 대전</p>
            <p className="card-value">
              {loading ? "…" : user.isGuest || statsSummaryError ? "-" : `${stats.detailed?.pvp?.wins || 0}승 ${stats.detailed?.pvp?.losses || 0}패`}
            </p>
            <p className="card-sub-label">승률: {loading || statsSummaryError ? '-' : `${stats.detailed?.pvp?.winRate || 0}%`}</p>
          </article>
          <article className="dashboard-card">
            <p className="card-label">그룹 레이스</p>
            <p className="card-value">
              {loading ? "…" : user.isGuest || statsSummaryError ? "-" : `${(stats.detailed?.group?.first || 0) + (stats.detailed?.group?.second || 0) + (stats.detailed?.group?.third || 0)}회`}
            </p>
            <p className="card-sub-label">1등: {loading || statsSummaryError ? '-' : `${stats.detailed?.group?.first || 0}회`}</p>
          </article>
        </section>

<div className="wr-board-links"><Link to="/guide">플레이 가이드 →</Link><button type="button" onClick={() => setShowHelp(true)}>게임 설명 →</button><img src="/assets/wiki-race/gear-cluster.png" height="54" alt="" /></div></section>
        <WikiHighlights />
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
                  <li>오늘의 탐험은 같은 시작·목표 코스의 개인 최고 기록을 비교합니다.</li>
                  <li>주간 탐험가는 경기 XP만, 탐험가 레벨은 누적 XP를 비교합니다.</li>
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
