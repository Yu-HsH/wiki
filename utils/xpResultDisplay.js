/**
 * 결과 화면 XP 영역 — 순수 표시 모델 (트랙 15c-2, 패킷 15 §6).
 *
 * 입력은 서버가 이미 확정한 두 값이다: 이번 결과의 본인 원장 행(`fetchResultXp`)과
 * 지급 후 요약(`fetchXpSummary`). **여기서 XP를 계산하지 않는다** — 금액·감쇠는
 * 15c-1 트리거가 원장에 적었고, 레벨은 `level_from_total_xp`가 정했다 (C3 §3·§4).
 *
 * ## 레벨업 판정 — 결과 XP + 업적 XP 합산, 다중 레벨업 (16c, 판정 9)
 *
 * 15c-2는 "한 결과는 최대 70 XP < 최소 필요량 100 → 레벨은 최대 1 오른다"는 전제로
 * `currentLevelXp` 하나로 판정했다. 16b부터 같은 결과가 업적 XP도 준다(최대 120/단계,
 * 여러 업적·단계 동시) — **70 + 120 = 190이라 전제가 깨진다.**
 *
 * 그래서 이번 획득량은 이 결과의 원장 행 합 + 이 결과가 연 업적의 원장 `xp.amount` 합이고,
 * "획득 전 레벨"은 서버의 `level_from_total_xp(totalXp - 획득량)`로 얻는다
 * (`services/achievementService.js` `fetchLevelAtTotalXp`). **공식은 프론트에 두지 않는다.**
 * 그 조회가 실패하면 `currentLevelXp < 획득량`으로 "올랐다"만 알고 이전 레벨은 모른다
 * (`from: null`).
 *
 * **한계:** 결과 화면을 여는 사이 다른 지급이 끼어들면 요약이 그만큼 앞서 있어 판정이
 * 어긋날 수 있다. 결과 직후 한 번 읽는 화면이라 받아들인다.
 *
 * ## 문구
 *
 * 사유 문구는 `01-CONFIRMED-SPEC.md` §7.1 · `15` §1 표의 이름을 **그대로 채택**했다.
 * 감쇠 안내 · 행 없음 안내 · 레벨업 · 업적 XP 줄은 시안·코드에 근거가 없어 **발명**이다 —
 * `docs/agent/PACKET-CONTRACT-GAPS.md`에 등재했고 디자인 확정 시 교체 대상이다
 * (C4 §3.1의 "시안 > 코드 > 발명").
 */

/** `source_type` → 사유 (spec §7.1 · 15 §1 표 이름). 화면이 없는 몰수 2종도 둔다 (부채 X3). */
export const XP_RESULT_REASON_LABELS = Object.freeze({
  single_random_finish: "랜덤 탐험 완주",
  single_target_first_finish: "목표 지정 탐험 최초 완주",
  daily_course_first_finish: "오늘의 탐험 코스 최초 완주",
  group_rank_1: "그룹 1위 완주",
  group_rank_2: "그룹 2위 완주",
  group_rank_3: "그룹 3위 완주",
  group_rank_other: "그룹 완주",
  group_retire: "그룹 미완주",
  duel_win_normal: "1:1 정상 승리",
  duel_loss_normal: "1:1 정상 패배",
  duel_win_forfeit: "상대 기권으로 승리",
  duel_loss_forfeit: "직접 기권·연결 이탈 패배",
});

/** `decay_reason` → 안내. **발명 문구** — 디자인 확정 시 교체. */
export const XP_DECAY_NOTES = Object.freeze({
  duel_repeat_half: "같은 상대와 오늘 4~5번째 경기 (50%)",
  duel_repeat_zero: "같은 상대와 오늘 6번째 이상 경기 (0%)",
});

/** 싱글 결과에 원장 행이 없을 때. **발명 문구** `[사용자 확정, 2026-09-30]`. */
export const XP_NO_GRANT_NOTE = "같은 코스는 처음 완주할 때만 XP를 받아요";

/** 게스트 — 15 §6 "guest는 로그인 시 저장 가능하다는 안내만 표시". */
export const XP_GUEST_NOTE = "로그인하면 XP와 레벨이 저장됩니다";

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

/** `+15 XP` — 시안 `+55 XP` 형식 (Freeze v1 `05-03`). */
export function formatXpGain(amount) {
  const value = toInteger(amount) ?? 0;
  return `+${value.toLocaleString("ko-KR")} XP`;
}

/** 결과 XP 줄과 나란히 놓이는 업적 XP 줄의 사유. **발명** (GAPS §4.5). */
export const XP_ACHIEVEMENT_REASON = "업적 달성";

/**
 * 지급 후 요약과 이번 획득량으로 레벨업을 판정한다.
 *
 * `levelBefore`(서버가 계산한 획득 전 레벨)가 있으면 그것과 지금 레벨을 비교한다 —
 * 여러 레벨을 한 번에 넘을 수 있다. 없으면 `currentLevelXp < 획득량`으로 오른 것만 안다.
 *
 * @returns {{from:number|null, to:number, steps:number|null}|null}
 */
export function detectLevelUp(summary, gainedAmount, levelBefore = null) {
  const gained = toInteger(gainedAmount);
  const level = toInteger(summary?.level);
  const current = toInteger(summary?.currentLevelXp);
  if (gained === null || gained <= 0 || level === null) return null;
  if (level < 2) return null;

  const before = toInteger(levelBefore);
  if (before !== null && before >= 1) {
    return level > before ? { from: before, to: level, steps: level - before } : null;
  }
  if (current === null) return null;
  return current < gained ? { from: null, to: level, steps: null } : null;
}

/** `레벨 업! Lv.3 → Lv.5 (+2)` · 이전 레벨을 모르면 `레벨 업! Lv.5`. **발명** (GAPS §4.5). */
export function formatLevelUp(levelUp) {
  if (!levelUp) return null;
  if (levelUp.from === null || levelUp.from === undefined) return `레벨 업! Lv.${levelUp.to}`;
  const steps = levelUp.steps > 1 ? ` (+${levelUp.steps})` : "";
  return `레벨 업! Lv.${levelUp.from} → Lv.${levelUp.to}${steps}`;
}

/**
 * 결과 화면 XP 영역의 표시 모델.
 *
 * @param {object} input
 * @param {"single"|"duel"} input.scope
 * @param {boolean} [input.isGuest]
 * @param {Array<{sourceType:string, baseAmount:number, amount:number, decayReason:string|null}>|null} input.entries
 *   `null`이면 아직 모른다(조회 전·실패) — 아무것도 그리지 않는다.
 * @param {object|null} [input.summary] 지급 후 `fetchXpSummary()` 결과
 * @param {number} [input.achievementXp] 이 결과가 연 업적의 원장 XP 합 (`get_result_achievements_v1.xpTotal`)
 * @param {number|null} [input.levelBefore] 서버가 계산한 획득 전 레벨 (`level_from_total_xp`)
 * @returns {null | {
 *   kind: "guest"|"none"|"granted",
 *   note: string|null,
 *   lines: Array<{sourceType:string, reason:string, gain:string, amount:number,
 *                 baseAmount:number, decayNote:string|null}>,
 *   totalAmount: number,
 *   levelUp: {from:number|null, to:number, steps:number|null}|null,
 *   summary: object|null,
 * }}
 */
export function buildResultXpView({
  scope,
  isGuest = false,
  entries,
  summary = null,
  achievementXp = 0,
  levelBefore = null,
} = {}) {
  if (isGuest) {
    return { kind: "guest", note: XP_GUEST_NOTE, lines: [], totalAmount: 0, levelUp: null, summary: null };
  }
  if (!Array.isArray(entries)) return null;

  const lines = entries
    .filter((entry) => entry && XP_RESULT_REASON_LABELS[entry.sourceType])
    .map((entry) => {
      const amount = toInteger(entry.amount) ?? 0;
      const baseAmount = toInteger(entry.baseAmount) ?? amount;
      const decayed = Boolean(entry.decayReason) && amount !== baseAmount;
      return {
        sourceType: entry.sourceType,
        reason: XP_RESULT_REASON_LABELS[entry.sourceType],
        gain: formatXpGain(amount),
        amount,
        baseAmount,
        decayNote: decayed
          ? `원래 ${baseAmount.toLocaleString("ko-KR")} XP · ${XP_DECAY_NOTES[entry.decayReason] ?? ""}`.trim()
          : null,
      };
    });

  // 싱글은 반복 완주면 결과 행이 없는 것이 정상이다 (C2 §3). 그래도 업적은 열릴 수 있다.
  const note = lines.length === 0 && scope === "single" ? XP_NO_GRANT_NOTE : null;

  const achievementAmount = toInteger(achievementXp) ?? 0;
  if (achievementAmount > 0) {
    lines.push({
      sourceType: "achievement_unlock",
      reason: XP_ACHIEVEMENT_REASON,
      gain: formatXpGain(achievementAmount),
      amount: achievementAmount,
      baseAmount: achievementAmount,
      decayNote: null,
    });
  }

  if (lines.length === 0) {
    // 1:1은 cancelled가 아니면 행이 있어야 하므로 안내를 만들지 않는다 — 호출자가 재조회·경고를 맡는다.
    if (note) {
      return { kind: "none", note, lines: [], totalAmount: 0, levelUp: null, summary };
    }
    return null;
  }

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    kind: "granted",
    note,
    lines,
    totalAmount,
    levelUp: detectLevelUp(summary, totalAmount, levelBefore),
    summary,
  };
}
