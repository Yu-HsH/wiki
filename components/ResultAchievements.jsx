import React, { useContext, useEffect, useRef, useState } from "react";
import { DuelEndRecordsVisible } from "./cinematic/DuelEndVisibility.js";
import { markAchievementsSeen } from "../services/achievementService.js";
import { ResultAchievementCards } from "./AchievementRewardPreview.jsx";

const REVEAL_STEP_MS = 600;
function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Connected result: preserve reveal order, visibility gate and seen-only-after-display contract. */
export default function ResultAchievements({ reveal, tone = "light", presentation }) {
  const recordsVisible = useContext(DuelEndRecordsVisible);
  const items = reveal?.items ?? [];
  const [reducedMotion] = useState(prefersReducedMotion);
  const [visible, setVisible] = useState(() => (reducedMotion ? items.length : Math.min(1, items.length)));
  const markedRef = useRef(new Set());

  useEffect(() => {
    if (!recordsVisible || visible >= items.length) return undefined;
    const timer = setTimeout(() => setVisible(count => count + 1), REVEAL_STEP_MS);
    return () => clearTimeout(timer);
  }, [visible, items.length, recordsVisible]);

  useEffect(() => {
    if (!recordsVisible) return;
    const ids = items
      .slice(0, visible)
      .flatMap((item) => item.unlockIds)
      .filter(id => !markedRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach(id => markedRef.current.add(id));
    markAchievementsSeen({ unlockIds: ids }).catch(error => {
      ids.forEach(id => markedRef.current.delete(id));
      console.error("업적 확인 표시를 남기지 못했습니다.", error);
    });
  }, [visible, items, recordsVisible]);

  return <ResultAchievementCards items={items.slice(0, visible)} total={items.length} tone={tone} presentation={presentation} reducedMotion={reducedMotion} />;
}
