/**
 * 그룹 대기실 START 표시 상태 — `start_group_room_game_v2`의 거부 조건을 **그대로** 비춘다.
 *
 * 서버가 권위다. 이 함수는 버튼 비활성과 짧은 사유 문구를 만들 뿐이고, 서버 거부는
 * 호출처가 그대로 보여 준다. 규칙을 새로 만들지 않도록 서버 순서를 따른다:
 * 인원(3명 이상) → 전원 READY + 제출 page_id → 서로 다른 page_id 2개 이상.
 * (`supabase/migrations/20260814103000_group_final_gaps_v13.sql` start_group_room_game_v2)
 */
export const GROUP_MIN_PLAYERS = 3;

export const GROUP_START_BLOCK = Object.freeze({
  NOT_WAITING: "not_waiting",
  TOO_FEW: "too_few",
  NOT_READY: "not_ready",
  NOT_DISTINCT: "not_distinct",
});

const hasBatchim = (text) => {
  const code = String(text).charCodeAt(String(text).length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
};

const isPrepared = (player) => !!player?.is_ready && !!player?.submitted_target_page_id;

/**
 * @param {object} input
 * @param {Array<object>} input.players room_players 행
 * @param {string|undefined} input.status game_rooms.status
 * @param {string|undefined} input.myUserId
 * @param {(player: object) => string} [input.nameOf]
 */
export function getGroupStartState({ players = [], status, myUserId, nameOf = (player) => player?.nickname_snapshot ?? "" }) {
  const count = players.length;
  const readyCount = players.filter((player) => player.is_ready).length;
  const distinctCount = new Set(players.filter(isPrepared).map((player) => String(player.submitted_target_page_id))).size;
  const base = { count, readyCount, distinctCount };

  if (status !== "waiting") return { ...base, ok: false, code: GROUP_START_BLOCK.NOT_WAITING, reason: "대기 중인 방이 아닙니다" };
  if (count < GROUP_MIN_PLAYERS) {
    return { ...base, ok: false, code: GROUP_START_BLOCK.TOO_FEW, reason: `최소 ${GROUP_MIN_PLAYERS}명의 참가자가 필요합니다 · 지금 ${count}명` };
  }
  const waiting = players.filter((player) => !isPrepared(player));
  if (waiting.length > 0) {
    const meWaiting = waiting.some((player) => player.user_id === myUserId);
    let reason;
    if (waiting.length === 1 && meWaiting) reason = "내 후보 선택과 READY가 필요합니다";
    else if (waiting.length === 1) {
      const name = nameOf(waiting[0]);
      reason = name ? `${name}${hasBatchim(name) ? "이" : "가"} 준비 중입니다` : "1명이 준비 중입니다";
    } else reason = meWaiting ? `나를 포함해 ${waiting.length}명이 준비 중입니다` : `${waiting.length}명이 준비 중입니다`;
    return { ...base, ok: false, code: GROUP_START_BLOCK.NOT_READY, reason };
  }
  if (distinctCount < 2) {
    return { ...base, ok: false, code: GROUP_START_BLOCK.NOT_DISTINCT, reason: `서로 다른 후보 문서가 2개 이상 필요합니다 · 지금 ${distinctCount}개` };
  }
  return { ...base, ok: true, code: null, reason: "모든 참가자가 준비되었습니다 · 시작할 수 있습니다" };
}
