import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { fetchRankings } from "../rankingService";
import AdBanner from "../components/AdBanner";
import UserProfileModal from "../components/UserProfileModal"; // 1. 모달 import

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
  const [period, setPeriod] = useState("all"); // "all", "weekly", "daily"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
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
        const ranking = await fetchRankings({ period, limit: 50 });
        if (!cancelled) setRecords(ranking);
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
          <h1>Time Attack Leaderboard</h1>
          <p className="dashboard-muted">Fastest players to reach random target pages.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/main")}>
            Main
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
        </div>
      </section>

      <section className="dashboard-card ranking-table-wrap">
        {loading && <p className="dashboard-muted">Loading ranking...</p>}
        {error && <p className="app-error">{error}</p>}
        {!loading && !error && records.length === 0 && (
          <p className="dashboard-muted">No records yet. Start the first run.</p>
        )}

        {!loading && records.length > 0 && (
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

                  // 이름 결정 로직 (프로필 닉네임 우선)
                  const displayName = record.nickname || record.playerName || "Unknown";
                  const initial = displayName.charAt(0).toUpperCase();

                  return (
                    <React.Fragment key={rowKey}>
                      <tr className={isMine ? "mine" : ""}>
                        <td>{index + 1}</td>
                        {/* 3. 플레이어 영역 클릭 가능하게 수정 */}
                        <td
                          className="ranking-player-cell"
                          onClick={() => handleUserClick(record.userId)}
                          style={{ cursor: "pointer" }}
                        >
                          <div className="ranking-avatar">
                            {record.profileImageUrl ? (
                              <img src={record.profileImageUrl} alt="" className="ranking-avatar-img" />
                            ) : (
                              <div className="ranking-avatar-fallback">{initial}</div>
                            )}
                          </div>
                          <span className="ranking-player-name" style={{ textDecoration: "underline" }}>{displayName}</span>
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
      <div style={{ marginTop: "2rem", width: "100%" }}>
        <AdBanner />
      </div>

      {/* 7. 모달 렌더링 (guest 로직 처리는 UserProfileModal 내부에서 수행됨) */}
      <UserProfileModal
        userId={selectedUserId}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  );
}
