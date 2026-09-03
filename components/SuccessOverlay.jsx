import React, { useEffect, useState } from "react";
import { useAuth } from "../authContext";
import { fetchRankings, fetchSingleRunResult } from "../rankingService";
import { formatDuration } from "../services/wikiService";

/**
 * 게임 성공 시 표시되는 오버레이 컴포넌트
 * - 최종 기록(시간, 클릭 수) 표시 — 서버가 확정한 값이 있으면 그것을 표시합니다
 * - 플레이어가 이동한 전체 경로 표시
 * - 랭킹 정보 요약
 *
 * **순위는 서버가 셉니다.** 이 화면이 랭킹 목록을 훑어 자기 기록을 찾아내지 않습니다 —
 * 시간·이동 횟수·목표 문서가 우연히 같은 남의 기록을 자기 것으로 오인할 수 있었고,
 * 상위 10건 밖이면 순위 자체가 없었습니다. 결과 화면과 프로필 history는 이제 같은
 * 조회 경로(`rankingService.fetchSingleGameRecords`)를 지납니다 (패킷 17 §4).
 */
export default function SuccessOverlay({
  runId = null,
  targetTitle,
  elapsedSeconds,
  clickCount,
  pathTitles = [],
  onReturnToLobby,
}) {
  const { user } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [serverResult, setServerResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadResult = async () => {
      setIsLoading(true);

      // 상단 미니 랭킹(표시용)과 내 순위(서버 확정값)는 서로 다른 조회다.
      const [rankingList, runResult] = await Promise.allSettled([
        fetchRankings({ limit: 10 }),
        fetchSingleRunResult({ runId }),
      ]);

      if (cancelled) return;

      if (rankingList.status === "fulfilled") {
        setRankings(rankingList.value);
      } else {
        console.error("랭킹을 불러오지 못했습니다.", rankingList.reason);
      }

      if (runResult.status === "fulfilled") {
        setServerResult(runResult.value);
      } else {
        console.error("서버 확정 결과를 불러오지 못했습니다.", runResult.reason);
      }

      setIsLoading(false);
    };

    loadResult();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // 서버에 확정된 기록이 있으면 그 값이 우선이다. 게스트 런은 영구 행을 만들지 않으므로
  // 서버 기록이 없고, 그때는 화면에 들고 있던 진행 값을 그대로 보여준다.
  const serverRecord = serverResult?.record ?? null;
  const displayTargetTitle = serverRecord?.targetTitle ?? targetTitle;
  const displayElapsedSeconds = serverRecord?.elapsedSeconds ?? elapsedSeconds;
  const displayClickCount = serverRecord?.clickCount ?? clickCount;
  const displayPathTitles = serverRecord?.pathTitles?.length
    ? serverRecord.pathTitles
    : pathTitles;
  const serverRank = serverResult?.rank ?? null;
  const serverTotalCount = serverResult?.totalCount ?? null;

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
              {formatDuration(displayElapsedSeconds)}
            </span>
          </div>
          <div style={statBoxStyle}>
            <span style={statLabelStyle}>이동 횟수</span>
            <span style={statValueStyle}>{displayClickCount} 회</span>
          </div>
        </div>

        <div style={contentAreaStyle}>
          {/* 목표 문서 강조 */}
          <div style={targetDisplayStyle}>
            <span style={targetLabelStyle}>도착지</span>
            <span style={targetTitleStyle}>{displayTargetTitle}</span>
          </div>

          {/* 이동 경로 (타임라인 스타일) */}
          <div style={pathSectionStyle}>
            <h3 style={sectionTitleStyle}>이동 경로</h3>
            <div style={timelineStyle}>
              {displayPathTitles.map((title, index) => (
                <div key={`${title}-${index}`} style={timelineItemStyle}>
                  <div style={dotStyle}>
                    <div style={dotInnerStyle} />
                  </div>
                  <div style={timelineTextStyle}>{title}</div>
                  {index < displayPathTitles.length - 1 && <div style={lineStyle} />}
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
                    : serverRank
                      ? serverTotalCount
                        ? `🎉 서버 확정 기록 ${serverTotalCount}건 중 ${serverRank}위입니다!`
                        : `🎉 서버 확정 순위 ${serverRank}위입니다!`
                      : "서버에서 확정된 순위를 아직 불러오지 못했습니다."}
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
