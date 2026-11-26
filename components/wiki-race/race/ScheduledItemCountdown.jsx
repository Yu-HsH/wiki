import React, { useEffect, useRef } from "react";
import StartCourse from "../../StartCourse.jsx";
import { useDisplayNow } from "../../group-items-playtest/useDisplayNow.js";
import { audioManager } from "../../../services/audioManager.js";

export default function ScheduledItemCountdown({ roomId, startsAt, serverObservedAt, startTitle, targetTitle, onBoundary }) {
  const deadline = Date.parse(startsAt);
  const now = useDisplayNow(Date.parse(serverObservedAt), true);
  const seconds = Math.ceil((deadline - now) / 1000);
  const tick = seconds >= 1 && seconds <= 3 ? seconds : null;
  const reached = seconds <= 0;
  const callback = useRef(onBoundary);
  callback.current = onBoundary;

  useEffect(() => {
    if (tick === null || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void audioManager.play("tick", { key: `item-count:${roomId}:${startsAt}:${tick}` });
  }, [roomId, startsAt, tick]);

  useEffect(() => {
    if (!reached) return;
    callback.current();
    const interval = setInterval(() => callback.current(), 250);
    return () => clearInterval(interval);
  }, [reached, deadline]);

  return <div className="countdown-overlay wr-page wr-start-overlay" aria-live="assertive" aria-atomic="true"
    data-server-start-at={deadline}>
    <div className="countdown-journal has-course">
      <span className="wr-start-kicker">탐험 출발 준비</span>
      <StartCourse startTitle={startTitle} targetTitle={targetTitle}/>
      <div className="countdown-number" key={tick ?? (reached ? "start" : "wait")}>{tick ?? (reached ? "시작!" : "…")}</div>
      <span className="countdown-note">본문 링크를 따라 목표 문서로</span>
    </div>
  </div>;
}
