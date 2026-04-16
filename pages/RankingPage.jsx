import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { fetchRankings } from "../rankingService";

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
  const [weekly, setWeekly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const ranking = await fetchRankings({ weekly, limit: 50 });
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
  }, [weekly]);

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
          <button type="button" className="app-btn app-btn-primary" onClick={() => navigate("/game")}>
            Play
          </button>
        </div>
      </header>

      <section className="dashboard-card ranking-toolbar">
        <div className="toggle-wrap">
          <button
            type="button"
            className={!weekly ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setWeekly(false)}
          >
            All Time
          </button>
          <button
            type="button"
            className={weekly ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setWeekly(true)}
          >
            Weekly
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
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const isMine = record.userId === user.id;
                  return (
                    <tr key={record.id || `${record.userId}-${record.createdAt}-${index}`} className={isMine ? "mine" : ""}>
                      <td>{index + 1}</td>
                      <td>{record.playerName || "Unknown"}</td>
                      <td>{record.targetTitle}</td>
                      <td>{formatDuration(record.elapsedSeconds)}</td>
                      <td>{record.clickCount}</td>
                      <td>{formatDate(record.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
