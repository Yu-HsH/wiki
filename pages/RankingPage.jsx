import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { LOBBY_PATH } from "../utils/appRoutes";
import { fetchRankings, fetchXpRankings } from "../rankingService";
import UserProfileModal from "../components/UserProfileModal"; // 1. 모달 import
import ProfileCard from "../components/ProfileCard";
import { DENSITY, NAME_FALLBACK, buildProfileCard } from "../utils/profileCard.js";
import { formatXp } from "../utils/xpProgress.js";

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
  const { user } = useAuth();
  const [period, setPeriod] = useState("all"); // "all", "weekly", "daily", XP_TAB
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  // 탭 전환 직후 한 프레임 동안 다른 형태의 행이 그려지지 않도록 상태를 나눈다.
  const [xpRows, setXpRows] = useState([]);
  const isXpTab = period === XP_TAB;
  const [expandedId, setExpandedId] = useState(null);

  // 2. 모달 상태 추가
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // 4. 클릭 핸들러
  const handleUserClick = (userId) => {
    setSelectedUserId(userId);
    setIsProfileModalOpen(true);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        if (period === XP_TAB) {
          const rows = await fetchXpRankings({ limit: 50 });
          if (!cancelled) setXpRows(rows);
        } else {
          const ranking = await fetchRankings({ period, limit: 50 });
          if (!cancelled) setRecords(ranking);
        }
      } catch (fetchError) {
        if (!cancelled) setError(fetchError?.message || "Could not load ranking.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-badge">RANKING</p>
          <h1>{isXpTab ? "XP Leaderboard" : "Time Attack Leaderboard"}</h1>
          <p className="dashboard-muted">
            {isXpTab ? "누적 XP가 많은 탐험가 순입니다." : "Fastest players to reach random target pages."}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate(LOBBY_PATH)}>
            Lobby
          </button>
        </div>
      </header>

      <section className="dashboard-card ranking-toolbar">
        <div className="toggle-wrap ranking-filter-tabs">
          <button
            type="button"
            className={period === "daily" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setPeriod("daily")}
          >
            Daily
          </button>
          <button
            type="button"
            className={period === "weekly" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setPeriod("weekly")}
          >
            Weekly
          </button>
          <button
            type="button"
            className={period === "all" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setPeriod("all")}
          >
            All Time
          </button>
          <button
            type="button"
            className={isXpTab ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setPeriod(XP_TAB)}
          >
            XP
          </button>
        </div>
      </section>

      <section className="dashboard-card ranking-table-wrap">
        {loading && <p className="dashboard-muted">Loading ranking...</p>}
        {error && <p className="app-error">{error}</p>}
        {!loading && !error && isXpTab && xpRows.length === 0 && (
          <p className="dashboard-muted">아직 XP를 얻은 탐험가가 없습니다. 게임을 완주하면 이곳에 이름이 올라갑니다.</p>
        )}

        {!loading && isXpTab && xpRows.length > 0 && (
          <div className="ranking-table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>누적 XP</th>
                </tr>
              </thead>
              <tbody>
                {xpRows.map((row, index) => {
                  const isMine = row.userId === user.id;
                  // C5 §4 랭킹 = COMPACT. 레벨은 profile_level computed field 값이다.
                  const profileCard = buildProfileCard({
                    userId: row.userId,
                    nickname: row.nickname,
                    level: row.level,
                    legacyImageUrl: row.profileImageUrl,
                    source: "live",
                  });

                  return (
                    <tr key={row.userId} className={isMine ? "mine" : ""}>
                      <td>{index + 1}</td>
                      <td className="ranking-player-cell">
                        <ProfileCard
                          card={profileCard}
                          size="sm"
                          density={DENSITY.COMPACT}
                          nameFallback={NAME_FALLBACK.EXPLORER}
                          interactive
                          onClick={() => handleUserClick(row.userId)}
                        />
                      </td>
                      <td>{formatXp(row.totalXp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && !isXpTab && records.length === 0 && (
          <p className="dashboard-muted">No records yet. Start the first run.</p>
        )}

        {!loading && !isXpTab && records.length > 0 && (
          <div className="ranking-table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Target</th>
                  <th>Time</th>
                  <th>Clicks</th>
                  <th>Date</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const isMine = record.userId === user.id;
                  const isExpanded = expandedId === record.id;
                  const rowKey = record.id || `${record.userId}-${record.createdAt}-${index}`;

                  // C5 §2의 카드 형태. 레벨은 15b가 채운다. 칭호·배지는 아직 슬롯이다.
                  const profileCard = buildProfileCard({
                    userId: record.userId,
                    nickname: record.nickname || record.playerName,
                    level: record.level ?? null,
                    legacyImageUrl: record.profileImageUrl,
                    source: "live",
                  });

                  return (
                    <React.Fragment key={rowKey}>
                      <tr className={isMine ? "mine" : ""}>
                        <td>{index + 1}</td>
                        {/* 3. 플레이어 영역 클릭 가능하게 수정 */}
                        <td className="ranking-player-cell">
                          <ProfileCard
                            card={profileCard}
                            size="sm"
                            density={DENSITY.COMPACT}
                            nameFallback={NAME_FALLBACK.EXPLORER}
                            interactive
                            onClick={() => handleUserClick(record.userId)}
                          />
                        </td>
                        <td>{record.targetTitle}</td>
                        <td>{formatDuration(record.elapsedSeconds)}</td>
                        <td>{record.clickCount}</td>
                        <td>{formatDate(record.createdAt)}</td>
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
    </div>
  );
}
