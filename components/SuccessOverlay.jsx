import React, { useEffect, useState } from "react";
import { useAuth } from "../authContext";
import { fetchRankings } from "../rankingService";
import { formatDuration } from "../services/wikiService";

/**
 * 게임 성공 시 표시되는 오버레이 컴포넌트
 * - 최종 기록(시간, 클릭 수) 표시
 * - 플레이어가 이동한 전체 경로 표시
 * - 랭킹 정보 요약
 */
export default function SuccessOverlay({
  targetTitle,
  elapsedSeconds,
  clickCount,
  pathTitles = [],
  onReturnToLobby,
}) {
  const { user } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [myRankIndex, setMyRankIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkRankings = async () => {
      try {
        setIsLoading(true);
        const data = await fetchRankings({ limit: 10 });
        setRankings(data);

        // 내 순위 찾기
        const myIndex = data.findIndex(
          (r) => r.elapsedSeconds === elapsedSeconds && r.clickCount === clickCount && r.targetTitle === targetTitle
        );
        setMyRankIndex(myIndex !== -1 ? myIndex + 1 : -1);
      } catch (error) {
        console.error("랭킹을 불러오지 못했습니다.", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkRankings();
  }, [elapsedSeconds, clickCount, targetTitle]);

  return (
    <div style={overlayStyle}>
      <div style={modalCardStyle}>
        {/* 상단 헤더 섹션 */}
        <div style={headerStyle}>
          <div style={iconBadgeStyle}>🏆</div>
          <h2 style={titleStyle}>Mission Accomplished!</h2>
          <p style={subtitleStyle}>목표 지점에 성공적으로 도달했습니다</p>
        </div>

        {/* 주요 기록 요약 */}
        <div style={statsContainerStyle}>
          <div style={statBoxStyle}>
            <span style={statLabelStyle}>걸린 시간</span>
            <span style={{ ...statValueStyle, color: "var(--brand)" }}>
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
          <div style={statBoxStyle}>
            <span style={statLabelStyle}>이동 횟수</span>
            <span style={statValueStyle}>{clickCount} 회</span>
          </div>
        </div>

        <div style={contentAreaStyle}>
          {/* 목표 문서 강조 */}
          <div style={targetDisplayStyle}>
            <span style={targetLabelStyle}>도착지</span>
            <span style={targetTitleStyle}>{targetTitle}</span>
          </div>

          {/* 이동 경로 (타임라인 스타일) */}
          <div style={pathSectionStyle}>
            <h3 style={sectionTitleStyle}>이동 경로</h3>
            <div style={timelineStyle}>
              {pathTitles.map((title, index) => (
                <div key={`${title}-${index}`} style={timelineItemStyle}>
                  <div style={dotStyle}>
                    <div style={dotInnerStyle} />
                  </div>
                  <div style={timelineTextStyle}>{title}</div>
                  {index < pathTitles.length - 1 && <div style={lineStyle} />}
                </div>
              ))}
            </div>
          </div>

          {/* 랭킹 정보 */}
          <div style={rankingBoxStyle}>
            <h3 style={sectionTitleStyle}>실시간 랭킹 현황</h3>
            {isLoading ? (
              <p style={loadingTextStyle}>랭킹 분석 중...</p>
            ) : (
              <div>
                <p style={myRankTextStyle}>
                  {user?.isGuest
                    ? "게스트는 랭킹에 등록되지 않습니다."
                    : myRankIndex > 0
                      ? `🎉 현재 전체 ${myRankIndex}위를 기록 중입니다!`
                      : "아쉽게도 순위권에 들지 못했습니다."}
                </p>
                <div style={miniRankingListStyle}>
                  {rankings.slice(0, 3).map((r, idx) => (
                    <div key={r.id || idx} style={miniRankingItemStyle}>
                      <span>{["🥇", "🥈", "🥉"][idx]} {r.playerName}</span>
                      <span style={{ fontWeight: "600" }}>{formatDuration(r.elapsedSeconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div style={footerStyle}>
          <button
            style={secondaryButtonStyle}
            onClick={() => window.location.reload()} // 다시 도전 (새로고침)
          >
            다시 도전
          </button>
          <button style={primaryButtonStyle} onClick={onReturnToLobby}>
            로비로 이동
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Styles ---

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 2000,
  background: "rgba(10, 15, 20, 0.75)",
  backdropFilter: "blur(8px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px",
  overflowY: "auto",
};

const modalCardStyle = {
  width: "100%",
  maxWidth: "480px",
  background: "#ffffff",
  borderRadius: "24px",
  overflow: "hidden",
  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
  display: "flex",
  flexDirection: "column",
  animation: "modalFadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
};

const headerStyle = {
  background: "linear-gradient(135deg, #00a495 0%, #007d73 100%)",
  padding: "32px 24px",
  textAlign: "center",
  color: "#ffffff",
};

const iconBadgeStyle = {
  fontSize: "40px",
  marginBottom: "12px",
};

const titleStyle = {
  margin: 0,
  fontSize: "26px",
  fontWeight: "800",
  letterSpacing: "-0.02em",
};

const subtitleStyle = {
  margin: "4px 0 0",
  opacity: 0.9,
  fontSize: "14px",
};

const statsContainerStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  padding: "20px 24px",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
};

const statBoxStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "12px",
  background: "#ffffff",
  borderRadius: "16px",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
};

const statLabelStyle = {
  fontSize: "11px",
  fontWeight: "700",
  color: "#64748b",
  textTransform: "uppercase",
  marginBottom: "4px",
};

const statValueStyle = {
  fontSize: "20px",
  fontWeight: "800",
  color: "#1e293b",
};

const contentAreaStyle = {
  padding: "24px",
  maxHeight: "350px",
  overflowY: "auto",
};

const targetDisplayStyle = {
  textAlign: "center",
  marginBottom: "24px",
  padding: "16px",
  background: "rgba(0, 164, 149, 0.05)",
  borderRadius: "16px",
  border: "1px dashed rgba(0, 164, 149, 0.3)",
};

const targetLabelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#007d73",
  fontWeight: "700",
  marginBottom: "4px",
};

const targetTitleStyle = {
  fontSize: "18px",
  fontWeight: "800",
  color: "#0f172a",
};

const pathSectionStyle = {
  marginBottom: "24px",
};

const sectionTitleStyle = {
  fontSize: "14px",
  fontWeight: "700",
  color: "#475569",
  marginBottom: "12px",
  display: "flex",
  alignItems: "center",
};

const timelineStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const timelineItemStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "8px 0",
};

const dotStyle = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  background: "#e2e8f0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1,
};

const dotInnerStyle = {
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  background: "#94a3b8",
};

const lineStyle = {
  position: "absolute",
  left: "5.5px",
  top: "20px",
  width: "1px",
  height: "calc(100% - 12px)",
  background: "#e2e8f0",
};

const timelineTextStyle = {
  fontSize: "14px",
  color: "#334155",
  fontWeight: "500",
};

const rankingBoxStyle = {
  background: "#f1f5f9",
  padding: "16px",
  borderRadius: "16px",
};

const loadingTextStyle = {
  fontSize: "13px",
  color: "#64748b",
  fontStyle: "italic",
};

const myRankTextStyle = {
  fontSize: "14px",
  fontWeight: "700",
  color: "#0f172a",
  marginBottom: "12px",
};

const miniRankingListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const miniRankingItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "13px",
  color: "#475569",
  padding: "4px 0",
  borderBottom: "1px solid #e2e8f0",
};

const footerStyle = {
  padding: "24px",
  display: "flex",
  gap: "12px",
  borderTop: "1px solid #f1f5f9",
};

const primaryButtonStyle = {
  flex: 1.5,
  background: "#00a495",
  color: "#ffffff",
  border: "none",
  borderRadius: "14px",
  padding: "14px",
  fontSize: "15px",
  fontWeight: "700",
  cursor: "pointer",
  transition: "all 0.2s",
};

const secondaryButtonStyle = {
  flex: 1,
  background: "#ffffff",
  color: "#475569",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "14px",
  fontSize: "15px",
  fontWeight: "600",
  cursor: "pointer",
};
