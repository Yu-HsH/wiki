import React from "react";
import { buildXpProgress, formatXp } from "../utils/xpProgress.js";

/**
 * 현재 레벨 안에서의 XP 진행 막대 — FULL 밀도(프로필 · 공개 프로필) 전용 (C5 §4).
 *
 * 레벨 숫자 자체는 `ProfileCard`의 `level` 슬롯이 그린다. 이 컴포넌트는 그 아래의
 * "현재/다음 XP"만 맡는다. 요약을 못 받으면 아무것도 렌더하지 않는다.
 *
 * @param {object} props
 * @param {object|null} props.summary `fetchXpSummary()` 결과
 */
export default function XpProgress({ summary, className = "" }) {
  const progress = buildXpProgress(summary);
  if (!progress) return null;

  return (
    <div className={["pcard-xp", className].filter(Boolean).join(" ")}>
      <div
        className="pcard-xp-bar"
        role="progressbar"
        aria-label={`레벨 ${progress.level} 진행도`}
        aria-valuemin={0}
        aria-valuemax={progress.nextLevelXp}
        aria-valuenow={progress.currentLevelXp}
      >
        <div className="pcard-xp-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="pcard-xp-meta">
        <span>{progress.label}</span>
        <span>누적 {formatXp(progress.totalXp)}</span>
      </div>
    </div>
  );
}
