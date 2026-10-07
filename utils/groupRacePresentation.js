/**
 * Phase 3 그룹 RACE/관전 표시 모델 — 순수 함수. 서버 값(room_players · game_rooms)만 읽고
 * 판정을 새로 만들지 않는다. 종료 시각은 기존 `getGroupActualEndAt`(min(20분, 3위+2분))을 쓴다.
 */
import { getGroupActualEndAt, getGroupRemainingSeconds } from "./groupGameTimer.js";
import { isGroupPlayerFinished, isGroupPlayerInactive } from "./groupGameFlow.js";

export const PARTICIPANT_STATE = Object.freeze({
  FINISHED: "finished",
  RACING: "racing",
  DISCONNECTED: "disconnected",
  RETIRED: "retired",
});

function rawStatus(player) {
  return String(player?.player_status || player?.status || "").toLowerCase();
}

/**
 * 일시 연결 끊김(`disconnected`)은 리타이어가 아니다 — 진행 중 그룹에 남는다.
 * 리타이어는 서버가 확정한 비활성 상태(retired · left · disconnected_timeout …)뿐이다.
 */
export function classifyGroupParticipant(player) {
  if (isGroupPlayerFinished(player)) return PARTICIPANT_STATE.FINISHED;
  if (rawStatus(player) === "disconnected") return PARTICIPANT_STATE.DISCONNECTED;
  if (isGroupPlayerInactive(player)) return PARTICIPANT_STATE.RETIRED;
  return PARTICIPANT_STATE.RACING;
}

/** 완주자(확정 순위) → 진행 중·연결 끊김(참가 순서, 추정 순위 없음) → 리타이어. */
export function orderGroupParticipants(players = []) {
  const indexed = players.map((player, index) => ({ player, index, state: classifyGroupParticipant(player) }));
  const rank = (entry) => (Number.isInteger(entry.player.rank) ? entry.player.rank : Number.MAX_SAFE_INTEGER);
  const finished = indexed.filter((e) => e.state === PARTICIPANT_STATE.FINISHED).sort((a, b) => rank(a) - rank(b) || a.index - b.index);
  const active = indexed.filter((e) => e.state === PARTICIPANT_STATE.RACING || e.state === PARTICIPANT_STATE.DISCONNECTED);
  const retired = indexed.filter((e) => e.state === PARTICIPANT_STATE.RETIRED);
  return [...finished, ...active, ...retired].map(({ player, state }) => ({ player, state }));
}

export function countGroupParticipants(players = []) {
  const counts = { finished: 0, active: 0, retired: 0, total: players.length };
  for (const player of players) {
    const state = classifyGroupParticipant(player);
    if (state === PARTICIPANT_STATE.FINISHED) counts.finished += 1;
    else if (state === PARTICIPANT_STATE.RETIRED) counts.retired += 1;
    else counts.active += 1;
  }
  return counts;
}

/**
 * HUD 마감 표시. 값은 언제나 "실제 종료 시각까지 남은 시간"이다 — 3위 완주 후 2:00을 새로 세지 않는다.
 * - playing      → "남은 시간" (20분 제한까지)
 * - grace_period → "마감까지" (min(20분, 3위+2분)까지). capped = 20분 제한이 더 이르다.
 * - finished     → "경기 종료"
 */
export function getGroupDeadlineView(room, now = Date.now()) {
  if (!room || room.status === "finished") {
    return { state: "ended", label: "경기 종료", seconds: 0, grace: false, capped: false };
  }
  const seconds = getGroupRemainingSeconds(room, now);
  if (room.status === "grace_period") {
    const end = getGroupActualEndAt(room);
    const hard = Date.parse(room.game_deadline_at || "");
    const capped = Boolean(end) && Number.isFinite(hard) && end.getTime() >= hard;
    return { state: "deadline", label: "마감까지", seconds, grace: true, capped };
  }
  return { state: "normal", label: "남은 시간", seconds, grace: false, capped: false };
}

export function getGroupGraceCopy(view) {
  if (!view?.grace) return null;
  return view.capped
    ? "3위 완주 · 20분 제한까지 남은 시간 안에 완주할 수 있습니다"
    : "3위 완주 · 남은 참가자는 이 시간 안에 완주할 수 있습니다";
}

/** 관전 대상 표시 상태 — 자동으로 다른 참가자로 바꾸지 않는다(끊김은 회색 유지). */
export function getWatchView(player) {
  const state = classifyGroupParticipant(player);
  if (state === PARTICIPANT_STATE.DISCONNECTED) return { state, live: false, label: "재연결 중" };
  if (state === PARTICIPANT_STATE.FINISHED) return { state, live: false, label: "완주" };
  if (state === PARTICIPANT_STATE.RETIRED) return { state, live: false, label: "리타이어" };
  return { state, live: true, label: "관전 중" };
}

/** 반응 스탬프는 보낸 사람 행에 3초 동안만 보인다(그 뒤에도 기록은 남는다). */
export const REACTION_STAMP_MS = 3000;
export function isReactionFresh(event, now = Date.now()) {
  return Boolean(event) && now - (event.createdAt ?? 0) < REACTION_STAMP_MS;
}
