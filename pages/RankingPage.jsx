import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { LOBBY_PATH } from "../utils/appRoutes";
import { fetchRankings, fetchExplorerXpRankings, fetchMyDailyCourseRank } from "../rankingService";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell";
import { fetchTodayDailyChallenge } from "../services/dailyChallengeService";
import UserProfileModal from "../components/UserProfileModal"; // 1. 모달 import
import ProfileCard from "../components/ProfileCard";
import useProfileCards from "../hooks/useProfileCards.js";
import { DENSITY, NAME_FALLBACK, buildProfileCard, mergeRewardSlots } from "../utils/profileCard.js";
import { formatXp } from "../utils/xpProgress.js";
import { getKstWeekRange, requireDailyCourse } from "../utils/dailyCourse.js";
import { isSupabaseConfigured } from "../supabaseClient.js";
import { serviceErrorMessage } from "../utils/serviceError.js";

/** 누적 XP 탭 — 기간 탭과 같은 줄에 있지만 데이터 원천이 다르다 (`profiles.total_xp`). */
const XP_TAB = "xp";

function formatDuration(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

export default function RankingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [period, setPeriod] = useState("daily");
  const [course, setCourse] = useState(null);
  const [dailyRank, setDailyRank] = useState(null);
  const [previousTiming, setPreviousTiming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [records, setRecords] = useState([]);
  // 탭 전환 직후 한 프레임 동안 다른 형태의 행이 그려지지 않도록 상태를 나눈다.
  const [xpRows, setXpRows] = useState([]);
  const isXpTab = period === XP_TAB || period === "weekly";
  const rankingRows = isXpTab ? xpRows : records;
  const topRows = rankingRows.filter((row, index) => (row.rank || index + 1) <= 3);
  const listRows = rankingRows.filter((row, index) => (row.rank || index + 1) > 3);
  const myRow = rankingRows.find(row => row.userId === user?.id);
  const myRank = period === "daily" ? dailyRank?.rank : myRow?.rank || (myRow ? rankingRows.indexOf(myRow) + 1 : null);
  const [expandedId, setExpandedId] = useState(null);

  // 행의 장착 상태(아이콘·칭호)는 보이는 표의 사용자 집합으로 배치 1회 조회한다 — 17b, N+1 없음.
  const rewardCards = useProfileCards(isXpTab ? xpRows.map((row) => row.userId) : records.map((record) => record.userId));

  const selectPeriod = (next) => {
    if (next === period) return;
    setLoading(true);
    setExpandedId(null);
    setPeriod(next);
  };

  // 2. 모달 상태 추가
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // 4. 클릭 핸들러
  const handleUserClick = (userId) => {
    setSelectedUserId(userId);
    setIsProfileModalOpen(true);
  };

  useEffect(() => {
    if (user?.isGuest && isSupabaseConfigured) {
      setLoading(false);
      setError("온라인 명예 기록판은 로그인 후 볼 수 있습니다. 게스트 탐험 기록은 저장되지 않습니다.");
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        if (period === XP_TAB || period === "weekly") {
          const rows = await fetchExplorerXpRankings({ weekly: period === "weekly", limit: 50 });
          if (!cancelled) setXpRows(rows);
        } else {
          let today = null;
          if (period === "daily") {
            today = await fetchTodayDailyChallenge();
            requireDailyCourse(today, { online: isSupabaseConfigured });
          }
          const ranking = await fetchRankings({ period, limit: 50, ...(previousTiming ? { timingContract: null } : {}) });
          if (!cancelled) setRecords(ranking);
          if (period === "daily") {
            const mine = await fetchMyDailyCourseRank(previousTiming ? { timingContract: null } : {});
            // A midnight boundary during the requests must not label old rows
            // with a new course, or new rows with an old course.
            requireDailyCourse(today, { online: isSupabaseConfigured });
            if (!cancelled) { setCourse(today); setDailyRank(mine); }
          }
        }
      } catch (fetchError) {
        console.error('랭킹 조회 실패:', fetchError);
        if (!cancelled) setError(serviceErrorMessage(fetchError, '랭킹'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [period, previousTiming, user?.id, user?.isGuest, reloadKey]);

  return (
    <WikiRaceShell user={user} level={null} onLogout={logout} view="ranking">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-badge">RANKING · 탐험가 명예 기록판</p>
          <h1>{period === "daily" ? "오늘의 탐험" : period === "weekly" ? "주간 탐험가" : isXpTab ? "탐험가 레벨" : "전체 시간 기록"}</h1>
          <p className="dashboard-muted">
            {period === "weekly" ? `${getKstWeekRange()} · 월요일 00:00부터 정상 플레이로 얻은 XP · 업적 XP 제외` : isXpTab ? "누적 XP가 많은 탐험가 순입니다." : period === "daily" ? "같은 코스의 개인 최고 기록 · 시간 → 이동 횟수 → 기록 시각" : "코스가 서로 다른 기존 기록입니다. 공통 코스 순위와 별도로 참고하세요."}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate(LOBBY_PATH)}>
            홈으로
          </button>
        </div>
      </header>

      <section className="dashboard-card ranking-toolbar">
        {!isXpTab && <label className="dashboard-muted">시간 기준 <select aria-label="시간 기록 기준" value={previousTiming ? 'previous' : 'reserved'} onChange={event => { setLoading(true); setPreviousTiming(event.target.value === 'previous'); }}><option value="reserved">새 시작 기준</option><option value="previous">이전 기록</option></select></label>}
        <div className="toggle-wrap ranking-filter-tabs">
          <button
            type="button"
            className={period === "daily" ? "toggle-btn active" : "toggle-btn"}
            aria-pressed={period === "daily"}
            onClick={() => selectPeriod("daily")}
          >
            오늘의 탐험
          </button>
          <button
            type="button"
            className={period === "weekly" ? "toggle-btn active" : "toggle-btn"}
            aria-pressed={period === "weekly"}
            onClick={() => selectPeriod("weekly")}
          >
            주간 탐험가
          </button>
          <button
            type="button"
            className={period === XP_TAB ? "toggle-btn active" : "toggle-btn"}
            aria-pressed={period === XP_TAB}
            onClick={() => selectPeriod(XP_TAB)}
          >
            탐험가 레벨
          </button>
        </div>
        <div className="ranking-reference">
          <small>코스가 서로 다른 기록 · 참고용</small>
          <button
            type="button"
            className={period === "all" ? "app-btn app-btn-ghost active" : "app-btn app-btn-ghost"}
            aria-pressed={period === "all"}
            onClick={() => selectPeriod("all")}
          >
            참고: 전체 시간
          </button>
        </div>
      </section>

      {period === "daily" && !loading && !error && course && <p className="ranking-summary">{course.challengeDate} · {course.startTitle} → {course.keyword}</p>}
      {!loading && !error && <>
        <div className="ranking-board-heading"><div><p className="wr-kicker">HONOR ROLL</p><h2>이번 기록의 선두 탐험가</h2></div><small>메달은 순위 장식이며 지급 보상이 아닙니다.</small></div>
        <div className="ranking-top" aria-label="상위 3명">{topRows.map((row,i) => <article data-rank={row.rank || i+1} key={row.id || row.userId}>
          <div className="ranking-place"><span className="ranking-medal" aria-hidden="true">{row.rank || i+1}</span><p className="wr-kicker">{row.rank || i+1}위 <small>탐험 기록</small></p></div>
          <ProfileCard card={mergeRewardSlots(buildProfileCard({userId:row.userId,nickname:row.nickname || row.playerName,level:row.level,legacyImageUrl:row.profileImageUrl,source:"live"}),rewardCards[row.userId])} density={DENSITY.FULL} nameFallback={NAME_FALLBACK.EXPLORER} interactive onClick={() => handleUserClick(row.userId)} />
          <div className="ranking-score"><small>{isXpTab ? period === "weekly" ? "주간 게임 XP" : "누적 XP" : "완주 시간 / 이동"}</small><strong>{isXpTab ? formatXp(row.rankingXp) : formatDuration(row.elapsedSeconds)}</strong>{!isXpTab && <span>{row.clickCount}회 이동</span>}</div>
        </article>)}</div>
        <section className="ranking-my-record" aria-label="내 기록">
          <div><p className="wr-kicker">MY RECORD</p><h2>{user?.isGuest ? "로그인하고 기록을 남겨 보세요" : myRank ? `내 순위 ${myRank}위` : "다음 기록의 주인공은 나"}</h2><p className="ranking-summary">{user?.isGuest ? "게스트 탐험은 개인 순위에 저장되지 않습니다." : period === "daily" ? myRank ? `${dailyRank.totalCount}명 중 ${myRank}위 · 개인 최고` : "오늘 코스의 유효한 완주 기록이 없습니다." : myRow ? `${myRank}위${isXpTab ? ` / ${myRow.totalCount}명` : ""}` : isXpTab ? "이번 랭킹에 집계된 XP가 없습니다." : "상위 50 기록에 내 기록이 없습니다."}</p></div>
          {myRow && <div className="ranking-my-score"><strong>{isXpTab ? formatXp(myRow.rankingXp) : `${formatDuration(myRow.elapsedSeconds)} · ${myRow.clickCount}회 이동`}</strong>{topRows[0] && (isXpTab || period === "daily") && <small>{isXpTab ? `1위와 ${Math.max(0,topRows[0].rankingXp-myRow.rankingXp).toLocaleString("ko-KR")} XP 차이` : `1위와 시간 ${formatDuration(Math.max(0,myRow.elapsedSeconds-topRows[0].elapsedSeconds))} 차이 · 이동·기록 시각도 순위에 반영`}</small>}</div>}
          {period === "daily" && myRank && !myRow && <small>순위는 전체 참가자 기준입니다. 상위 목록 밖의 상세 기록은 이 응답에 포함되지 않습니다.</small>}
          {!user?.isGuest && <button className="app-btn app-btn-ghost" onClick={() => navigate("/profile")}>내 탐험 카드 꾸미기 →</button>}
        </section>
        <div className="ranking-board-heading"><h2>전체 탐험 기록</h2><small>상위 기록 다음 순위 · 카드를 누르면 공개 프로필</small></div>
      </>}

      <section className="dashboard-card ranking-table-wrap">
        {loading && <p className="dashboard-muted" aria-busy="true">랭킹을 불러오는 중…</p>}
        {error && <div role="alert"><p className="app-error">{error}</p>{!user?.isGuest && <button type="button" className="app-btn app-btn-ghost" onClick={() => setReloadKey(value => value + 1)}>랭킹 다시 불러오기</button>}</div>}
        {error && user?.isGuest && <button type="button" className="app-btn app-btn-primary" onClick={async () => { await logout(); navigate("/login"); }}>로그인하기</button>}
        {!loading && !error && isXpTab && xpRows.length === 0 && (
          <p className="dashboard-muted">아직 XP를 얻은 탐험가가 없습니다. 게임을 완주하면 이곳에 이름이 올라갑니다.</p>
        )}

        {!loading && !error && rankingRows.length > 0 && listRows.length === 0 && <p className="dashboard-muted">상위 탐험가 외의 기록은 아직 없습니다.</p>}
        {!loading && !error && isXpTab && listRows.length > 0 && (
          <div className="ranking-table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>탐험가</th>
                  <th>{period === "weekly" ? "주간 플레이 XP" : "누적 XP"}</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((row, index) => {
                  const isMine = row.userId === user?.id;
                  // C5 §4 랭킹 = COMPACT. 레벨은 profile_level computed field 값이고,
                  // 아이콘·칭호는 배치 조회한 장착 상태다 (17b).
                  const profileCard = mergeRewardSlots(
                    buildProfileCard({
                      userId: row.userId,
                      nickname: row.nickname,
                      level: row.level,
                      legacyImageUrl: row.profileImageUrl,
                      source: "live",
                    }),
                    rewardCards[row.userId]
                  );

                  return (
                    <tr key={row.userId} className={isMine ? "mine" : ""}>
                      <td>{row.rank || index + 4}</td>
                      <td className="ranking-player-cell">
                        <ProfileCard
                          card={profileCard}
                          size="sm"
                          density={DENSITY.FULL}
                          nameFallback={NAME_FALLBACK.EXPLORER}
                          interactive
                          onClick={() => handleUserClick(row.userId)}
                        />
                      </td>
                      <td>{formatXp(row.rankingXp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && !isXpTab && records.length === 0 && (
          <p className="dashboard-muted">아직 완주 기록이 없습니다. 첫 탐험을 시작해 보세요.</p>
        )}

        {!loading && !error && !isXpTab && listRows.length > 0 && (
          <div className="ranking-table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>탐험가</th>
                  <th>목표</th>
                  <th>시간</th>
                  <th>이동</th>
                  <th>기록일</th>
                  <th>경로</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((record, index) => {
                  const isMine = record.userId === user?.id;
                  const isExpanded = expandedId === record.id;
                  const rowKey = record.id || `${record.userId}-${record.createdAt}-${index}`;

                  // C5 §2의 카드 형태. 레벨은 15b가, 아이콘·칭호는 장착 상태(17b)가 채운다.
                  const profileCard = mergeRewardSlots(
                    buildProfileCard({
                      userId: record.userId,
                      nickname: record.nickname || record.playerName,
                      level: record.level ?? null,
                      legacyImageUrl: record.profileImageUrl,
                      source: "live",
                    }),
                    rewardCards[record.userId]
                  );

                  return (
                    <React.Fragment key={rowKey}>
                      <tr className={isMine ? "mine" : ""}>
                        <td data-label="순위">{record.rank || index + 4}위</td>
                        {/* 3. 플레이어 영역 클릭 가능하게 수정 */}
                        <td className="ranking-player-cell">
                          <ProfileCard
                            card={profileCard}
                            size="sm"
                            density={DENSITY.FULL}
                            nameFallback={NAME_FALLBACK.EXPLORER}
                            interactive
                            onClick={() => handleUserClick(record.userId)}
                          />
                        </td>
                        <td data-label="목표">{record.targetTitle}</td>
                        <td data-label="시간">{formatDuration(record.elapsedSeconds)}</td>
                        <td data-label="이동">{record.clickCount}회</td>
                        <td data-label="기록일">{formatDate(record.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="text-btn ranking-path-toggle"
                            onClick={() => setExpandedId((prev) => (prev === record.id ? null : record.id))}
                          >
                            {isExpanded ? "닫기" : "경로 보기"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className={isMine ? "mine ranking-path-row" : "ranking-path-row"}>
                          <td colSpan="7" className="ranking-path-detail" style={{ padding: "12px 16px", backgroundColor: "rgba(0,0,0,0.02)", fontSize: "14px", lineHeight: "1.5" }}>
                            <strong>이동 경로:</strong>{" "}
                            {record.pathTitles && record.pathTitles.length > 0
                              ? record.pathTitles.join(" ➔ ")
                              : <span className="app-muted">경로 기록이 없습니다.</span>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 7. 모달 렌더링 (guest 로직 처리는 UserProfileModal 내부에서 수행됨) */}
      <UserProfileModal
        userId={selectedUserId}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </WikiRaceShell>
  );
}
