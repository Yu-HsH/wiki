import React, { useEffect, useState } from "react";
import { useAuth } from "../authContext";
import { fetchRankings, fetchSingleRunResult } from "../rankingService";
import { formatDuration } from "../services/wikiService";
import ResultXp from "./ResultXp.jsx";
import FinishEffect from "./FinishEffect.jsx";
import useMatchExpression from "../hooks/useMatchExpression.js";
import { pathColor } from "../utils/rewardTokens.js";
import { getSingleResultLabel } from "../utils/resultReasonLabels.js";
import {
  ResultActions,
  ResultCard,
  ResultCourse,
  ResultOutcome,
  ResultScene,
  ResultScreen,
  ResultStats,
  ResultXpRow,
} from "./wiki-race/result/ResultParts.jsx";

/**
 * 싱글 완주 결과 — Phase 4 Jungle Expedition RESULT (가장 단순한 결과 변형: 상대·순위표 개념 없음).
 * - 최종 기록(시간, 클릭 수) 표시 — 서버가 확정한 값이 있으면 그것을 표시합니다
 * - 플레이어가 이동한 전체 경로 표시
 * - 랭킹 정보 요약
 * - 행동은 실제 동작 그대로: "새 게임 선택"(/play) · "로비로 이동"(기존 로비 복귀). 재도전 계약은 없다.
 *
 * **순위는 서버가 셉니다.** 이 화면이 랭킹 목록을 훑어 자기 기록을 찾아내지 않습니다 —
 * 시간·이동 횟수·목표 문서가 우연히 같은 남의 기록을 자기 것으로 오인할 수 있었고,
 * 상위 10건 밖이면 순위 자체가 없었습니다. 결과 화면과 프로필 history는 이제 같은
 * 조회 경로(`rankingService.fetchSingleGameRecords`)를 지납니다 (패킷 17 §4).
 */
export default function SuccessOverlay({
  runId = null,
  startTitle = "",
  targetTitle,
  elapsedSeconds,
  clickCount,
  pathTitles = [],
  isGuest = false,
  onNewGame,
  onReturnToLobby,
}) {
  const { user } = useAuth();
  // 경기 표현 (16d 판정 4) — 장착한 경로 색상은 타임라인 선·노드, 완주 효과는 도착 노드. 게스트는 없다
  const matchExpression = useMatchExpression(user && !user.isGuest ? user.id : null);
  const pathHex = pathColor(matchExpression.path_color);
  const [rankings, setRankings] = useState([]);
  const [serverResult, setServerResult] = useState(null);
  const [serverResultFailed, setServerResultFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const guestView = isGuest || Boolean(user?.isGuest);

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
        setServerResultFailed(true);
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

  const completedTerm = getSingleResultLabel("completed")?.term ?? "완주";
  const courseStart = startTitle || displayPathTitles[0] || "";
  const rankText = guestView
    ? "게스트는 랭킹에 등록되지 않습니다."
    : serverRank
      ? serverTotalCount
        ? `서버 확정 기록 ${serverTotalCount}건 중 ${serverRank}위입니다`
        : `서버 확정 순위 ${serverRank}위입니다`
      : "서버에서 확정된 순위를 아직 불러오지 못했습니다.";

  return (
    <ResultScreen mode="single" tone="win" layer="overlay" titleId="wr-single-result-title" testId="single-result">
      <ResultScene mascot="win" reached celebration="full" destination={displayTargetTitle} />
      <ResultCard>
        <ResultOutcome
          kicker="EXPEDITION COMPLETE · 완주"
          titleId="wr-single-result-title"
          title={completedTerm}
          meta="싱글 탐험"
          pill={{ tone: "gold", text: "목표 도달", icon: "flag" }}
        />

        {/* 기록 ▸ XP ▸ 경로 순서 (패킷 15 §6) */}
        <ResultStats
          items={[
            { label: "시간", icon: "timer", value: formatDuration(displayElapsedSeconds) },
            { label: "이동", value: `${displayClickCount}회` },
            { label: "코스", wide: true, value: <ResultCourse start={courseStart} target={displayTargetTitle} /> },
          ]}
        />

        {/* 이번 결과 XP — 서버 기록이 확정된 뒤에만 조회한다 */}
        <ResultXpRow>
          {isLoading ? (
            <p className="rxp-note" role="status">XP 지급 정보를 확인하는 중입니다.</p>
          ) : (
            <ResultXp
              scope="single"
              isGuest={guestView}
              userId={user?.id ?? null}
              sourceId={serverRecord?.id ?? null}
              unavailable={serverResultFailed}
            />
          )}
        </ResultXpRow>

        {/* 이동 경로 — 장착한 경로 색상은 노드·선, 완주 효과는 도착 노드 */}
        <section className="wr-result-row wr-result-route" aria-labelledby="wr-single-route-title">
          <div className="wr-rroute-head">
            <h2 id="wr-single-route-title" className="wr-hud-label">MY ROUTE · 이동 경로</h2>
            <small>{displayPathTitles.length}문서</small>
          </div>
          <ol className="wr-tl">
            {displayPathTitles.map((title, index) => {
              const isLast = index === displayPathTitles.length - 1;
              const dot = (
                <span className="wr-tl-dot">
                  <span className="wr-tl-dot-inner" style={pathHex ? { background: pathHex } : undefined} />
                </span>
              );
              return (
                <li key={`${title}-${index}`} className={`wr-tl-item ${isLast ? "is-last" : ""}`}>
                  {isLast ? <FinishEffect effect={matchExpression.finish_effect}>{dot}</FinishEffect> : dot}
                  <span className="wr-tl-title" title={title}>{title}</span>
                  {!isLast && <span className="wr-tl-line" aria-hidden="true" style={pathHex ? { background: pathHex } : undefined} />}
                </li>
              );
            })}
          </ol>
        </section>

        {/* 서버 확정 순위 — 이 화면이 랭킹 목록에서 자기 기록을 찾지 않는다 */}
        <section className="wr-result-row wr-rrank" aria-labelledby="wr-single-rank-title">
          <h2 id="wr-single-rank-title" className="wr-hud-label">RANKING · 실시간 랭킹 현황</h2>
          {isLoading ? (
            <p role="status">랭킹 분석 중...</p>
          ) : (
            <>
              <p>{rankText}</p>
              {rankings.length > 0 && (
                <ol aria-label="상위 기록">
                  {rankings.slice(0, 3).map((r, idx) => (
                    <li key={r.id || idx}>
                      <span>{idx + 1}위 {r.playerName}</span>
                      <span>{formatDuration(r.elapsedSeconds)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>

        <ResultActions>
          <button type="button" className="wr-race-btn wr-race-btn--primary wr-race-btn--lg" onClick={onNewGame}>
            새 게임 선택
          </button>
          <button type="button" className="wr-race-btn" onClick={onReturnToLobby}>
            로비로 이동
          </button>
        </ResultActions>
      </ResultCard>
    </ResultScreen>
  );
}
