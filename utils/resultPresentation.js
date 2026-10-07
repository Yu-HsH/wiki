import { formatDuration } from "../services/wikiService.js";
import { getDuelResultLabel, getGroupResultLabel, GROUP_RESULT_TERMS } from "./resultReasonLabels.js";

/**
 * Phase 4 RESULT — 표시 매핑만 (Freeze 07 · 08).
 *
 * 입력은 서버가 이미 확정한 값이다: 1:1은 `buildDuelResultPresentation`(방의 `finished_reason`·
 * `winner_user_id`), 그룹은 `buildGroupFinalStandings`(`group_match_results` 순위·상태).
 * **여기서 승패·순위·XP를 정하지 않는다.** 사유 어휘는 `resultReasonLabels.js`(C4)를 읽기만 한다.
 */

export const RETIRE_TERM = GROUP_RESULT_TERMS.retire; // "리타이어"

const DASH = "–";

/**
 * 리타이어 보조 문구 — 표제는 언제나 "리타이어", 실제 사유는 C4 어휘로 보조 설명한다
 * `[사용자 결정, 2026-10-07]`. 사유를 모르면 `null` (문구를 발명하지 않는다).
 *
 * - forfeited / left → "기권"
 * - time_limit → "제한 시간 초과" · grace_timeout → "유예 시간 초과"
 * - disconnected_timeout → "몰수 · 재접속 유예 종료"
 */
export function getGroupRetireDetail(retireReason) {
  const label = getGroupResultLabel({ resultStatus: "retired", retireReason });
  if (!label) return null;
  if (label.term === RETIRE_TERM) return label.subtitle || null;
  return [label.term, label.subtitle].filter(Boolean).join(" · ");
}

/** 순위에 따른 축하 강도 (Freeze 08): 1위 전체 · 2–3위 금색 점 · 4위 이하/리타이어 없음. */
export function getGroupCelebration(rank, retired = false) {
  if (retired || !Number.isInteger(rank)) return "none";
  if (rank === 1) return "full";
  if (rank <= 3) return "dots";
  return "none";
}

const formatSeconds = (value) => (Number.isFinite(value) && value >= 0 ? formatDuration(value) : DASH);
const formatMoves = (value, suffix = "이동") => (Number.isFinite(value) ? `${value} ${suffix}` : DASH);

/**
 * 최종 순위 표 행 — `buildGroupFinalStandings()` 결과 순서를 그대로 쓴다 (정렬·순위 계산 없음).
 * 리타이어는 순위 –, 시간 –, 상태 "리타이어" + 보조 사유.
 */
export function buildGroupStandingRows(standings = [], userId = null) {
  return standings.map((entry, index) => {
    const retired = entry?.result_status === "retired";
    return {
      key: entry?.id || entry?.user_id || `row-${index}`,
      userId: entry?.user_id ?? null,
      isMe: Boolean(userId) && entry?.user_id === userId,
      retired,
      isWinner: !retired && entry?.is_winner === true,
      rank: !retired && Number.isInteger(entry?.rank) ? entry.rank : null,
      name: entry?.nickname_snapshot || "참가자",
      time: retired ? DASH : formatSeconds(entry?.elapsed_seconds),
      moves: formatMoves(entry?.move_count),
      status: retired ? RETIRE_TERM : GROUP_RESULT_TERMS.finished,
      reason: retired ? getGroupRetireDetail(entry?.retire_reason || entry?.leave_reason) : null,
    };
  });
}

export function countGroupStandings(standings = []) {
  return standings.reduce((counts, entry) => {
    if (entry?.result_status === "retired") counts.retired += 1;
    else if (entry?.result_status === "finished") counts.finished += 1;
    return counts;
  }, { finished: 0, retired: 0 });
}

/**
 * 그룹 최종(B) · 리타이어(C) 내 결과 표시 모델.
 *
 * @param {object|null} ownResult 내 `buildGroupFinalStandings` 행
 * @param {{view: "retired"|"standings"}} options C는 리타이어의 표시 단계일 뿐 서버 상태가 아니다
 */
export function buildGroupOwnOutcome(ownResult, { view = "standings" } = {}) {
  const retired = ownResult?.result_status === "retired";
  if (!ownResult) {
    return { tone: "neutral", mascot: null, celebration: "none", title: "최종 결과", kicker: "FINAL RESULT · 최종 결과", detail: null, pill: { tone: "neutral", text: "결과 확인 중", icon: "timer" }, stats: [] };
  }
  if (retired) {
    return {
      tone: "retire",
      mascot: "lose",
      celebration: "none",
      kicker: view === "retired" ? "MY RESULT · 내 기록" : "FINAL RESULT · 최종 결과",
      title: RETIRE_TERM,
      detail: getGroupRetireDetail(ownResult.retire_reason || ownResult.leave_reason),
      pill: view === "retired"
        ? { tone: "neutral", text: "목표 미도달", icon: null }
        : { tone: "neutral", text: "결과 확정", icon: "check" },
      stats: [
        { label: "순위", value: DASH, muted: true },
        { label: "완주 시간", value: DASH, muted: true, icon: "timer" },
        { label: "이동", value: Number.isFinite(ownResult.move_count) ? `${ownResult.move_count}회` : DASH },
      ],
    };
  }
  const rank = Number.isInteger(ownResult.rank) ? ownResult.rank : null;
  return {
    tone: "win",
    mascot: "win",
    celebration: getGroupCelebration(rank),
    kicker: "FINAL RESULT · 최종 결과",
    title: rank ? `${rank}위 완주` : "완주",
    detail: null,
    pill: { tone: "neutral", text: "결과 확정", icon: "check" },
    stats: [
      { label: "순위", value: rank ? `${rank}위` : DASH },
      { label: "시간", value: formatSeconds(ownResult.elapsed_seconds), icon: "timer" },
      { label: "이동", value: Number.isFinite(ownResult.move_count) ? `${ownResult.move_count}회` : DASH },
    ],
  };
}

/**
 * 1:1 결과 표시 모델. `presentation`은 `buildDuelResultPresentation()` — 방이 확정한 사유·승자.
 * 방 행이 아직 오지 않은 짧은 순간(상대 완주 신호가 먼저 온 경우)에는 페이지 phase만 안다.
 *
 * @param {{room: object|null, presentation: object|null, phaseWon: boolean}} input
 */
export function buildDuelOutcomeView({ room = null, presentation = null, phaseWon = false } = {}) {
  const reason = room?.finished_reason ?? null;
  if (reason === "cancelled") {
    return {
      tone: "neutral", mascot: null, reached: false, celebration: "none",
      kicker: "MATCH RESULT · 경기 결과", title: presentation?.term || "무효",
      status: "무효", pill: { tone: "neutral", text: "경기 무효", icon: null },
    };
  }
  const won = presentation ? presentation.isWinner : phaseWon;
  const title = presentation?.term || (won ? "승리" : "패배");
  // 보조 사유는 C4 어휘(예: "승리 · 상대 기권/이탈", "패배 · 기권")의 뒷부분 — 방이 확정한 사유일 때만.
  const label = presentation ? getDuelResultLabel({ finishedReason: reason, isWinner: won }) : null;
  const secondary = label?.term?.split(" · ").slice(1).join(" · ") || null;
  if (won) {
    const reached = reason === "normal_finish" || (!presentation && phaseWon);
    return {
      tone: "win", mascot: "win", reached, celebration: reached ? "full" : "dots",
      kicker: reached ? "EXPEDITION COMPLETE · 완주" : "MATCH RESULT · 경기 결과",
      title, status: "승리",
      pill: { tone: "gold", text: reached ? "목표 도달 · 상대보다 먼저" : secondary || "상대 기권/이탈", icon: reached ? "flag" : null },
    };
  }
  return {
    tone: "lose", mascot: "lose", reached: false, celebration: "none",
    kicker: "EXPEDITION INCOMPLETE · 미완주", title, status: "패배",
    pill: { tone: "neutral", text: reason === "normal_finish" ? "상대 먼저 도달" : secondary || "결과 확인 중", icon: null },
  };
}
