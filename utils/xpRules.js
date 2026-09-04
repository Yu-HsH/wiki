/**
 * XP 규칙 — 카탈로그·감쇠·일일 경계의 단일 모듈 (트랙 15a).
 *
 * `docs/contracts/C2-XP-LEDGER.md` §3·§5와 `01-CONFIRMED-SPEC.md` §7.1·§7.2의
 * **전사(轉寫)**다. 설계가 아니다. 값은 확정 스펙이 단일 기준이고
 * (`15-XP-LEVEL-RANKING.md` §1이 완전히 일치한다), 여기서 새 값을 만들지 않는다.
 *
 * `15` §1의 "수치는 코드 상수가 아니라 설정 또는 데이터 카탈로그에서 관리한다"에 따라
 * XP 값을 함수에 흩지 않고 이 파일 한 곳의 표에 모았다.
 *
 * **이 모듈은 지급하지 않는다.** 지급은 `grant_xp_v1`이 하고 그 RPC는 `authenticated`에
 * execute가 없다 (C2 §7). 여기서 계산한 `baseAmount`·`amount`·`decayReason`을
 * 서버 결과 확정 경로가 인자로 넘긴다 — 그 연결은 **15c**다
 * (`docs/agent/TRACKS.md` §6.3).
 *
 * 레벨 공식은 여기 두지 않는다. `level_from_total_xp`가 단일 정의이고
 * (C3 §4) 요약은 `get_xp_summary_v1`이 돌려준다 — 파생값을 두 벌 갖지 않는다는
 * C3 §3의 결정을 프론트에서도 지킨다.
 */

/** `xp_ledger.xp_class` — 3값 (C2 §2) */
export const XP_CLASSES = Object.freeze(["gameplay", "achievement", "admin"]);

/**
 * `xp_ledger.source_type` — 14값 (C2 §3).
 * 순서는 계약 표와 같다. DB CHECK의 값 집합과 정확히 일치해야 한다.
 */
export const XP_SOURCE_TYPES = Object.freeze([
  "single_random_finish",
  "single_target_first_finish",
  "daily_course_first_finish",
  "duel_win_normal",
  "duel_loss_normal",
  "duel_win_forfeit",
  "duel_loss_forfeit",
  "group_rank_1",
  "group_rank_2",
  "group_rank_3",
  "group_rank_other",
  "group_retire",
  "achievement_unlock",
  "admin_adjustment",
]);

/**
 * `source_type` → `xp_class` (C2 §2 표).
 *
 * **업적 XP는 레벨에는 들어가고 주간 랭킹에서만 빠진다.** 그 한 줄 차이가 이 축이다.
 * 서버에서는 `private.xp_class_for_source`가 같은 표를 갖는다 — 두 곳이 어긋나면
 * 주간 랭킹의 제외 규칙이 조용히 틀어지므로 테스트가 둘을 함께 검사한다.
 */
export const XP_CLASS_BY_SOURCE_TYPE = Object.freeze({
  single_random_finish: "gameplay",
  single_target_first_finish: "gameplay",
  daily_course_first_finish: "gameplay",
  duel_win_normal: "gameplay",
  duel_loss_normal: "gameplay",
  duel_win_forfeit: "gameplay",
  duel_loss_forfeit: "gameplay",
  group_rank_1: "gameplay",
  group_rank_2: "gameplay",
  group_rank_3: "gameplay",
  group_rank_other: "gameplay",
  group_retire: "gameplay",
  achievement_unlock: "achievement",
  admin_adjustment: "admin",
});

/**
 * 확정 XP 값 — `01-CONFIRMED-SPEC.md` §7.1 (C2 §3 표).
 *
 * - `duel_loss_forfeit`·`group_retire`의 **0은 "지급 없음"이 아니다.** 0으로 지급하고
 *   행을 남긴다. 행이 없으면 "아직 지급 안 됨"과 "0으로 지급됨"이 구분되지 않는다 (C2 §3).
 * - `group_rank_2`는 **55**다. 시안의 40이 아니다 (G16).
 * - Freeze v1 `05-05`의 싱글 완주 `+40`은 쓰지 않는다 (G17).
 * - `achievement_unlock`은 단계별 30/60/120이라 여기 두지 않는다 — 패킷 16의 카탈로그다.
 * - `admin_adjustment`는 임의 값이라 카탈로그가 없다.
 */
export const XP_BY_SOURCE_TYPE = Object.freeze({
  single_random_finish: 20,
  single_target_first_finish: 15,
  daily_course_first_finish: 25,
  duel_win_normal: 50,
  duel_loss_normal: 25,
  duel_win_forfeit: 30,
  duel_loss_forfeit: 0,
  group_rank_1: 70,
  group_rank_2: 55,
  group_rank_3: 45,
  group_rank_other: 35,
  group_retire: 0,
});

/** `xp_ledger.decay_reason` — 2값. 감쇠가 없으면 `null`이다 (C2 §5) */
export const XP_DECAY_REASONS = Object.freeze([
  "duel_repeat_half",
  "duel_repeat_zero",
]);

/**
 * 같은 상대와의 1:1 반복 감쇠 (`01-CONFIRMED-SPEC.md` §7.2 · `15` §3).
 *
 * | 하루 경기 수 | 비율 | `decay_reason` |
 * |---|---|---|
 * | 1~3 | 100% | `null` |
 * | 4~5 | 50% | `duel_repeat_half` |
 * | 6+ | 0% | `duel_repeat_zero` |
 *
 * 경계는 **그 경기를 포함한 순번**이다 — 4번째 경기부터 50%다.
 */
export const DUEL_DECAY_TIERS = Object.freeze([
  Object.freeze({ maxGameNumber: 3, ratio: 1, decayReason: null }),
  Object.freeze({ maxGameNumber: 5, ratio: 0.5, decayReason: "duel_repeat_half" }),
  Object.freeze({ maxGameNumber: Infinity, ratio: 0, decayReason: "duel_repeat_zero" }),
]);

/**
 * 서비스 기준 시간대 — **KST** (C2 §8-②).
 *
 * `15` §3이 "서비스 기준 시간대를 명확히 사용"이라고만 해서 미확정으로 남아 있던
 * 항목이다. **KST로 확정했다** — `ensure_today_daily_challenge`가 이미
 * `now() at time zone 'Asia/Seoul'`로 오늘의 코스 경계를 잡고 있어, 다른 시간대를 쓰면
 * "오늘"이 두 뜻이 된다.
 */
export const SERVICE_TIME_ZONE = "Asia/Seoul";

/** KST = UTC+9. 고정 오프셋이며 서머타임이 없다. */
const SERVICE_UTC_OFFSET_MINUTES = 9 * 60;

/**
 * 주어진 시각이 서비스 기준으로 며칠인지 `YYYY-MM-DD`로 돌려준다.
 *
 * 감쇠는 "같은 상대와 **하루** 몇 경기"를 세므로 두 경기가 같은 날인지 판정할
 * 기준이 필요하다. 그 판정을 이 한 함수로 모은다.
 */
export function serviceDayKey(instant = new Date()) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + SERVICE_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** 두 시각이 서비스 기준으로 같은 날인가. */
export function isSameServiceDay(a, b) {
  const left = serviceDayKey(a);
  const right = serviceDayKey(b);
  return left !== null && left === right;
}

/**
 * 서비스 기준 그날의 00:00을 UTC 시각으로 돌려준다.
 * 일일 경계를 쿼리 조건으로 쓸 때 이 값을 넘긴다.
 */
export function serviceDayStart(instant = new Date()) {
  const dayKey = serviceDayKey(instant);
  if (dayKey === null) return null;
  return new Date(Date.parse(`${dayKey}T00:00:00.000Z`) - SERVICE_UTC_OFFSET_MINUTES * 60_000);
}

/**
 * 이번 경기가 같은 상대와의 그날 몇 번째인지로 감쇠 구간을 고른다.
 *
 * @param {number} gameNumberToday 이번 경기를 **포함한** 순번 (1부터).
 * @returns {{ratio: number, decayReason: string|null}}
 */
export function resolveDuelDecay(gameNumberToday) {
  const ordinal = Number.isFinite(gameNumberToday) ? Math.floor(gameNumberToday) : 1;
  const bounded = Math.max(ordinal, 1);
  const tier = DUEL_DECAY_TIERS.find((candidate) => bounded <= candidate.maxGameNumber);
  return { ratio: tier.ratio, decayReason: tier.decayReason };
}

/**
 * 감쇠를 적용해 원장에 넣을 세 값을 만든다.
 *
 * **정수 처리는 `floor`다** (C2 §8-①). `15` §7이 테스트 항목으로만 열거하고 규칙을
 * 정하지 않아 미확정이던 항목이며, **예측 가능한 쪽으로 확정했다** — 25 XP의 50%는
 * **13이 아니라 12**다. 반올림이면 값에 따라 사용자에게 유리한 방향과 불리한 방향이
 * 번갈아 나오고, 그 차이를 결과 화면에서 설명할 근거가 없다.
 *
 * 반환 형태는 `grant_xp_v1`의 인자 셋과 그대로 대응한다. CHECK 정합도 여기서 이미
 * 만족한다 — 감쇠가 없으면 `amount === baseAmount`이고 `decayReason`이 `null`이다.
 *
 * @param {number} baseAmount 감쇠 전 확정 XP.
 * @param {number} gameNumberToday 같은 상대와의 그날 순번 (이번 경기 포함, 1부터).
 * @returns {{baseAmount: number, amount: number, decayReason: string|null}}
 */
export function applyDuelDecay(baseAmount, gameNumberToday) {
  const base = Number.isFinite(baseAmount) ? Math.floor(baseAmount) : 0;
  const safeBase = Math.max(base, 0);
  const { ratio, decayReason } = resolveDuelDecay(gameNumberToday);
  const amount = Math.floor(safeBase * ratio);
  return {
    baseAmount: safeBase,
    // 감쇠가 없는데 floor 때문에 값이 흔들리는 일은 없다: ratio가 1이면 그대로다.
    amount,
    decayReason: amount === safeBase ? null : decayReason,
  };
}

/**
 * 감쇠가 없는 지급의 세 값. 싱글·그룹처럼 감쇠 규칙이 없는 경로가 쓴다.
 *
 * `source_type`이 카탈로그에 없으면 (`achievement_unlock`·`admin_adjustment`) `null`을
 * 돌려준다 — 값을 발명하지 않는다.
 */
export function resolveGrant(sourceType) {
  if (!Object.prototype.hasOwnProperty.call(XP_BY_SOURCE_TYPE, sourceType)) return null;
  const amount = XP_BY_SOURCE_TYPE[sourceType];
  return { baseAmount: amount, amount, decayReason: null };
}

/** `source_type`의 분류 축. 알 수 없는 값이면 `null`이다. */
export function xpClassOf(sourceType) {
  return XP_CLASS_BY_SOURCE_TYPE[sourceType] ?? null;
}

/** 주간 탐험가 랭킹에 세는 XP인가 — `gameplay`만이다 (C2 §2). */
export function countsTowardWeeklyRanking(sourceType) {
  return xpClassOf(sourceType) === "gameplay";
}

/**
 * 원장에 넣기 전 정합성 검사. `grant_xp_v1`의 `XP_AMOUNT_INVALID` 판정과 같은 규칙이며,
 * DB CHECK가 최종 권위다 (C2 §5).
 */
export function isConsistentGrant({ xpClass, baseAmount, amount, decayReason = null }) {
  if (!XP_CLASSES.includes(xpClass)) return false;
  if (!Number.isInteger(baseAmount) || !Number.isInteger(amount)) return false;

  if (xpClass !== "admin") {
    if (amount < 0 || baseAmount < 0) return false;
    if (amount > baseAmount) return false;
  }

  if (decayReason === null) return amount === baseAmount;
  return XP_DECAY_REASONS.includes(decayReason);
}
