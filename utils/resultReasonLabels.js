/**
 * C4 결과 사유 어휘 — 표시 매핑 단일 모듈.
 *
 * `docs/contracts/C4-RESULT-REASON.md` §3.1~§3.3의 **전사(轉寫)**다. 설계가 아니다.
 * 계약이 동결됐으므로 이 파일은 표를 옮겨 적을 뿐이고, 여기서 새 문구를 만들지 않는다.
 * 규칙은 **시안 > 코드 > 발명**이다 (C4 §3.1).
 *
 * - 저장 어휘는 통일하지 않는다. 저장은 현재 값을 유지하고 표시 계층에서 매핑한다 (C4 §0).
 * - 그래서 이 모듈은 DB 값을 **키로만** 쓴다. 키를 바꾸면 A·C와 동결 화면이 함께 깨진다
 *   (`docs/agent/TRACKS.md` §2.3-⑥).
 * - DB에 표시 문자열을 저장하지 않는다 (C4 §3.4).
 *
 * 소비자: 싱글 결과(트랙 B) · 1:1 결과(트랙 C, 읽기 전용 호출).
 * 그룹 결과는 아직 동결된 옛 포매터를 쓴다 — 그 모듈의 유일한 소비자가 동결된
 * `GroupGamePage.jsx`이기 때문이며, 통합 시점에 그 호출이 이 모듈로 교체된다
 * (C4 §3.1.1). 두 모듈이 잠시 공존하지만 같은 화면에 동시에 나타나지는 않는다.
 */

/** `group_match_results.result_status` — 2값 (C4 §2 표 3행) */
export const GROUP_RESULT_STATUSES = Object.freeze(["finished", "retired"]);

/** `group_match_results.retire_reason` · `room_players.retire_reason` — 5값 (C4 §2 표 4행) */
export const GROUP_RETIRE_REASONS = Object.freeze([
  "left",
  "forfeited",
  "time_limit",
  "grace_timeout",
  "disconnected_timeout",
]);

/** `game_rooms.finished_reason` 중 1:1 결과가 유도에 쓰는 값 (C4 §3.2) */
export const DUEL_FINISHED_REASONS = Object.freeze([
  "normal_finish",
  "forfeit",
  "cancelled",
]);

/** `single_game_runs.status` 중 결과 화면이 표시하는 값 — `active`는 결과가 아니다 (C4 §3.3) */
export const SINGLE_RESULT_STATUSES = Object.freeze([
  "completed",
  "abandoned",
  "expired",
]);

/**
 * 그룹 4용어 — 시안 §07 RESULT가 표시하는 어휘 (C4 §3.1).
 * 구분은 `result_status`(2값)가 아니라 `retire_reason`(5값)에서 나온다.
 */
export const GROUP_RESULT_TERMS = Object.freeze({
  finished: "완주",
  forfeit: "기권",
  retire: "리타이어",
  disconnectForfeit: "몰수",
});

/**
 * 그룹 부제 — **확정 (2026-09-02)** (C4 §3.1).
 * `disconnected_timeout`은 시안, 나머지 둘은 운영 코드 문자열을 채택했다.
 * `forfeited`·`left`에는 부제가 없다.
 */
export const GROUP_RETIRE_SUBTITLES = Object.freeze({
  disconnected_timeout: "재접속 유예 종료",
  grace_timeout: "유예 시간 초과",
  time_limit: "제한 시간 초과",
  forfeited: null,
  left: null,
});

const GROUP_RETIRE_TERMS = Object.freeze({
  forfeited: GROUP_RESULT_TERMS.forfeit,
  left: GROUP_RESULT_TERMS.forfeit,
  time_limit: GROUP_RESULT_TERMS.retire,
  grace_timeout: GROUP_RESULT_TERMS.retire,
  disconnected_timeout: GROUP_RESULT_TERMS.disconnectForfeit,
});

/**
 * 1:1 5경우 (C4 §3.2).
 * `match_history`에 사유 컬럼이 없으므로 `game_rooms.finished_reason`에서 유도한다.
 *
 * **XP 금액은 여기에 두지 않는다.** 금액의 소유자는 C2이고 이 모듈은 표시 어휘를 담는다.
 * `xpSourceType`은 C4 §3.2가 적은 연결 고리이며 `cancelled`는 지급이 없다 (`15` §2).
 */
const DUEL_RESULTS = Object.freeze({
  "normal_finish:win": Object.freeze({
    term: "승리",
    subtitle: null,
    xpSourceType: "duel_win_normal",
  }),
  "normal_finish:loss": Object.freeze({
    term: "패배",
    subtitle: null,
    xpSourceType: "duel_loss_normal",
  }),
  "forfeit:win": Object.freeze({
    term: "승리 · 상대 기권/이탈",
    subtitle: null,
    xpSourceType: "duel_win_forfeit",
  }),
  "forfeit:loss": Object.freeze({
    term: "패배 · 기권",
    subtitle: null,
    xpSourceType: "duel_loss_forfeit",
  }),
  cancelled: Object.freeze({
    term: "무효",
    subtitle: null,
    xpSourceType: null,
  }),
});

/** 싱글 3경우 (C4 §3.3) */
const SINGLE_RESULTS = Object.freeze({
  completed: Object.freeze({ term: "완주", subtitle: null }),
  abandoned: Object.freeze({ term: "포기", subtitle: null }),
  expired: Object.freeze({ term: "만료", subtitle: null }),
});

/**
 * 그룹 결과 표시 (C4 §3.1).
 *
 * @param {{resultStatus?: string, retireReason?: string|null}} input 저장된 값 그대로
 * @returns {{term: string, subtitle: string|null}|null}
 *   계약이 규정하지 않은 조합이면 `null`. **표시 문자열을 발명하지 않는다.**
 */
export function getGroupResultLabel({ resultStatus, retireReason } = {}) {
  if (resultStatus === "finished") {
    return { term: GROUP_RESULT_TERMS.finished, subtitle: null };
  }

  if (resultStatus !== "retired") return null;

  const term = GROUP_RETIRE_TERMS[retireReason];
  if (!term) return null;

  return { term, subtitle: GROUP_RETIRE_SUBTITLES[retireReason] ?? null };
}

/**
 * 1:1 결과 표시 (C4 §3.2).
 *
 * @param {{finishedReason?: string, isWinner?: boolean}} input
 *   `cancelled`는 승패를 보지 않는다 — 양쪽 모두 무효다.
 * @returns {{term: string, subtitle: string|null, xpSourceType: string|null}|null}
 */
export function getDuelResultLabel({ finishedReason, isWinner } = {}) {
  if (finishedReason === "cancelled") return DUEL_RESULTS.cancelled;
  if (finishedReason !== "normal_finish" && finishedReason !== "forfeit") {
    return null;
  }

  return DUEL_RESULTS[`${finishedReason}:${isWinner ? "win" : "loss"}`] ?? null;
}

/**
 * 싱글 결과 표시 (C4 §3.3).
 *
 * @param {string} status `single_game_runs.status`. `active`는 아직 결과가 아니다.
 * @returns {{term: string, subtitle: string|null}|null}
 */
export function getSingleResultLabel(status) {
  return SINGLE_RESULTS[status] ?? null;
}
