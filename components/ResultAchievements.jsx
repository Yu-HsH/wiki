import React, { useEffect, useRef, useState } from "react";
import { markAchievementsSeen } from "../services/achievementService.js";

/** reveal 간격 — 카드가 한 장씩 나타난다. 모션 감소 설정이면 처음부터 전부 정적으로 보인다. */
const REVEAL_STEP_MS = 600;

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 결과 화면 업적 reveal (트랙 16c). 서버 순서 그대로 — 히든이 먼저다 (G9).
 *
 * **화면에 그려진 카드의 해금만 NEW를 해제한다.** 다 보이기 전에 화면을 떠나면 남은 카드는
 * seen이 되지 않아 로비 알림·업적 화면의 NEW가 받는다.
 *
 * @param {object} props
 * @param {{items: Array<object>}} props.reveal `buildResultReveal()` 결과
 * @param {"light"|"dark"} [props.tone]
 */
export default function ResultAchievements({ reveal, tone = "light" }) {
  const items = reveal?.items ?? [];
  const [reducedMotion] = useState(prefersReducedMotion);
  const [visible, setVisible] = useState(() => (reducedMotion ? items.length : Math.min(1, items.length)));
  const markedRef = useRef(new Set());

  useEffect(() => {
    if (visible >= items.length) return undefined;
    const timer = setTimeout(() => setVisible((count) => count + 1), REVEAL_STEP_MS);
    return () => clearTimeout(timer);
  }, [visible, items.length]);

  useEffect(() => {
    const ids = items
      .slice(0, visible)
      .flatMap((item) => item.unlockIds)
      .filter((id) => !markedRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => markedRef.current.add(id));
    markAchievementsSeen({ unlockIds: ids }).catch((error) => {
      ids.forEach((id) => markedRef.current.delete(id));
      console.error("업적 확인 표시를 남기지 못했습니다.", error);
    });
  }, [visible, items]);

  if (items.length === 0) return null;

  return (
    <div
      className={`ach-reveal ach-reveal--${tone}${reducedMotion ? " ach-reveal--static" : ""}`}
      data-testid="result-achievements"
      aria-live="polite"
    >
      {items.slice(0, visible).map((item) => (
        <div
          key={item.achievementId}
          className={`ach-reveal-card${item.hidden ? " ach-reveal-card--hidden" : ""}`}
        >
          <div className="ach-reveal-head">
            <span className="ach-reveal-tag">
              {item.hidden ? `히든 업적${item.kindLabel ? ` · ${item.kindLabel}` : ""}` : "업적 달성"}
            </span>
            {item.xp > 0 && <span className="ach-reveal-xp">+{item.xp.toLocaleString("ko-KR")} XP</span>}
          </div>
          <div className="ach-reveal-name">
            {item.name}
            {item.tierLabel && <span className="ach-tier"> {item.tierLabel}</span>}
          </div>
          {item.condition && <div className="ach-reveal-condition">{item.condition}</div>}
          {item.rewards.length > 0 && (
            <div className="ach-reveal-rewards">{item.rewards.join(" · ")}</div>
          )}
        </div>
      ))}
    </div>
  );
}
