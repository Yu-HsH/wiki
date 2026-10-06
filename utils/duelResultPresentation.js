import { getDuelResultLabel } from "./resultReasonLabels.js";

// 결과 판정은 방이 확정한 사유/승자만 사용한다. 참가자 사유는 설명에만 쓴다.
export function buildDuelResultPresentation(room, players = [], userId) {
  if (room?.status !== "finished" || !players.some((p) => p.user_id === userId)) return null;
  const isWinner = room.winner_user_id === userId;
  const label = getDuelResultLabel({ finishedReason: room.finished_reason, isWinner });
  if (!label) return null;
  if (room.finished_reason !== "cancelled" && !room.winner_user_id) return null;
  const loser = players.find((p) => p.user_id !== room.winner_user_id);
  const disconnected = loser?.retire_reason === "disconnected_timeout";
  const description = room.finished_reason === "normal_finish"
    ? isWinner ? "목표 문서에 먼저 도착했습니다." : "상대가 먼저 목표 문서에 도착했습니다."
    : room.finished_reason === "cancelled"
      ? "경기가 무효로 종료되었습니다."
      : disconnected
        ? isWinner ? "상대가 제한 시간 안에 복귀하지 못했습니다." : "제한 시간 안에 복귀하지 못했습니다."
        : loser?.retire_reason === "forfeited" || loser?.retire_reason === "left"
          ? isWinner ? "상대가 경기를 포기했습니다." : "경기를 포기했습니다."
          : "기권 또는 이탈로 경기가 종료되었습니다.";
  return { term: room.finished_reason === "cancelled" ? "무효" : isWinner ? "승리" : "패배", description, isWinner };
}

// Prefer player duration; otherwise use the finalized server clock boundary.
export function getDuelResultElapsedSeconds(room, player) {
  if (Number.isFinite(player?.elapsed_seconds) && player.elapsed_seconds >= 0) return player.elapsed_seconds;
  if (room?.status !== "finished" || !room.game_starts_at || !room.finished_at) return null;
  const start = Date.parse(room.game_starts_at);
  const end = Date.parse(room.finished_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 1000);
}
