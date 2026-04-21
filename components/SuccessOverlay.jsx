import React, { useEffect, useState } from "react";
import { useAuth } from "../authContext";
import { fetchRankings } from "../rankingService";
import { formatDuration } from "../services/wikiService";

export default function SuccessOverlay({
  targetTitle,
  elapsedSeconds,
  clickCount,
  pathTitles = [],
  onReturnToMain,
}) {
  const { user } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [myRankIndex, setMyRankIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkRankings = async () => {
      try {
        setIsLoading(true);
        // fetch top 10 to display top 3 + find my rank
        const data = await fetchRankings({ limit: 10 });
        setRankings(data);

        // Find my rank (naively checking the exact match context in this flow)
        // Usually we get an ID from saveGameRecord but we can approximate or find the newly inserted
        const myIndex = data.findIndex(
          (r) => r.elapsedSeconds === elapsedSeconds && r.clickCount === clickCount && r.targetTitle === targetTitle
        );
        setMyRankIndex(myIndex !== -1 ? myIndex + 1 : -1); // 1-based index
      } catch (error) {
        console.error("랭킹을 불러오지 못했습니다.", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkRankings();
  }, [elapsedSeconds, clickCount, targetTitle, pathTitles]);

  return (
    <div style={overlayStyle}>
      <div className="current-page-card" style={modalContentStyle}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h2 style={{ color: "var(--brand)", fontSize: "28px", margin: "0 0 10px" }}>🎉 목표 도달 성공! 🎉</h2>
          <p style={{ fontSize: "16px", color: "var(--text-dim)", margin: 0 }}>
            <strong>{targetTitle}</strong> 문서에 성공적으로 도착했습니다.
          </p>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: "20px" }}>
          <div className="stat-card" style={{ background: "var(--bg-soft)" }}>
            <p className="stat-label">걸린 시간</p>
            <p className="stat-value" style={{ color: "var(--danger)" }}>{formatDuration(elapsedSeconds)}</p>
          </div>
          <div className="stat-card" style={{ background: "var(--bg-soft)" }}>
            <p className="stat-label">이동 횟수 (클릭)</p>
            <p className="stat-value">{clickCount} 회</p>
          </div>
        </div>
        {pathTitles.length > 0 && (
          <div style={pathBoxStyle}>
            <h3 style={pathTitleStyle}>이동 경로</h3>

            <ol style={pathListStyle}>
              {pathTitles.map((title, index) => (
                <li key={`${title}-${index}`} style={pathItemStyle}>
                  {title}
                </li>
              ))}
            </ol>
          </div>

        )}
        <div style={{ background: "var(--bg)", padding: "15px", borderRadius: "var(--radius-lg)", marginBottom: "20px" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "16px", borderBottom: "1px solid var(--line)", paddingBottom: "5px" }}>
            🏆 나의 기록 요약
          </h3>
          {isLoading ? (
            <p className="state-text loading">랭킹 데이터를 분석 중입니다...</p>
          ) : (
            <div>
              <p style={{ margin: "0 0 10px", fontWeight: "bold", color: "var(--brand-deep)" }}>
                {user?.isGuest
                  ? "게스트 모드입니다. 로그인 시 랭킹에 등록할 수 있습니다."
                  : `현재 기록은 ${myRankIndex > 0 ? `전체 ${myRankIndex}등` : "순위권 외"} 입니다!`
                }
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "14px" }}>
                {rankings.slice(0, 3).map((r, idx) => (
                  <li key={r.id || idx} style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span>{idx + 1}등 {r.playerName}</span>
                    <span style={{ fontWeight: "500" }}>{formatDuration(r.elapsedSeconds)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <button className="restart-btn" onClick={onReturnToMain}>
            메인 화면으로 돌아가기
          </button>
        </div>
      </div>
    </div >
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "rgba(0, 0, 0, 0.4)",
  backdropFilter: "blur(2px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px"
};

const modalContentStyle = {
  width: "100%",
  maxWidth: "500px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.15)"
};
const pathBoxStyle = {
  marginTop: "18px",
  padding: "14px 16px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(0,0,0,0.06)",
  textAlign: "left",
  maxHeight: "220px",
  overflowY: "auto",
};

const pathTitleStyle = {
  margin: "0 0 10px",
  fontSize: "16px",
  fontWeight: 800,
};

const pathListStyle = {
  margin: 0,
  paddingLeft: "20px",
};

const pathItemStyle = {
  marginBottom: "6px",
  lineHeight: 1.45,
};
