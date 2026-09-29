/**
 * 레벨 진행도 표시 — 순수 로직 (패킷 15 §6 "프로필에 현재 레벨·현재/다음 XP 표시").
 *
 * 입력은 `services/xpService.js`의 `fetchXpSummary()` 결과다. **레벨과 진행도 쌍은 서버가
 * 계산한 값을 그대로 쓴다** — 레벨 공식은 DB의 `level_from_total_xp`에만 있다 (C3 §3·§4).
 * 여기서 하는 일은 막대 비율과 문구를 만드는 것뿐이다.
 *
 * JSX를 두지 않는 이유는 `utils/profileCard.js`와 같다: `npm test`에 JSX 로더가 없다.
 */

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** 천 단위 구분 — Freeze v1 `02-02`의 `12,480 XP` 형식. */
export function formatXp(value) {
  const number = toFiniteNumber(value);
  return `${(number ?? 0).toLocaleString("ko-KR")} XP`;
}

/**
 * 진행도 막대 모델. 요약이 없거나 형태가 맞지 않으면 `null` — 호출자는 아무것도 그리지 않는다.
 *
 * @param {{totalXp:number, level:number, currentLevelXp:number, nextLevelXp:number}|null} summary
 * @returns {{level:number, totalXp:number, currentLevelXp:number, nextLevelXp:number,
 *            percent:number, label:string}|null}
 */
export function buildXpProgress(summary) {
  if (!summary || typeof summary !== "object") return null;

  const level = toFiniteNumber(summary.level);
  const current = toFiniteNumber(summary.currentLevelXp);
  const next = toFiniteNumber(summary.nextLevelXp);
  if (level === null || current === null || next === null || next <= 0) return null;

  const clamped = Math.min(Math.max(current, 0), next);
  const percent = Math.floor((clamped / next) * 100);

  return {
    level,
    totalXp: toFiniteNumber(summary.totalXp) ?? 0,
    currentLevelXp: clamped,
    nextLevelXp: next,
    percent,
    label: `${clamped.toLocaleString("ko-KR")} / ${next.toLocaleString("ko-KR")} XP`,
  };
}
