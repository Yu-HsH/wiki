import React, { cloneElement, useEffect, useRef, useState } from "react";
import { CountdownJournal } from "../../CountdownOverlay.jsx";
import { useDisplayNow } from "../../group-items-playtest/useDisplayNow.js";
import { audioManager } from "../../../services/audioManager.js";

const introMs = 3500;
const holdMs = 400;
const countdownMs = 3000;

export default function ScheduledItemCountdown({ roomId, startsAt, serverObservedAt, clockAnchor, startTitle, targetTitle, onBoundary, intro }) {
  const deadline = Date.parse(startsAt);
  const now = useDisplayNow(clockAnchor?.server ?? Date.parse(serverObservedAt), true, clockAnchor?.local);
  const remaining = deadline - now;
  const seconds = Math.ceil(remaining / 1000);
  const inIntro = Boolean(intro && remaining > countdownMs);
  const [introOffset] = useState(() => introMs + holdMs + countdownMs - remaining);
  const tick = seconds >= 1 && seconds <= 3 ? seconds : null;
  const reached = seconds <= 0;
  const callback = useRef(onBoundary);
  callback.current = onBoundary;

  useEffect(() => {
    if (tick === null || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const key = `item-count:${roomId}:${startsAt}`;
    try {
      const last = Number(sessionStorage.getItem(key) ?? 4);
      if (tick >= last) return;
      sessionStorage.setItem(key, String(tick));
    } catch { /* Audio preferences still apply. */ }
    void audioManager.play("tick", { key: `${key}:${tick}` });
  }, [roomId, startsAt, tick]);

  useEffect(() => {
    if (!reached) return;
    callback.current();
    const interval = setInterval(() => callback.current(), 500);
    return () => clearInterval(interval);
  }, [reached, deadline]);

  return <div className="countdown-overlay wr-page wr-start-overlay item-race-countdown" aria-live="assertive" aria-atomic="true"
    data-server-start-at={deadline} data-countdown-stage={inIntro ? "intro" : reached ? "handoff" : tick ? "countdown" : "waiting"}>
    {inIntro ? <div className="item-race-intro">{cloneElement(intro, {
      presentationDuration:introMs,
      scheduledElapsedMs:introOffset,
      motionEligible:introOffset < introMs,
    })}</div> : <>
      <CountdownJournal value={tick ?? "…"} startTitle={startTitle} targetTitle={targetTitle} sequence />
      {reached && <p className="item-race-start-check">서버 시작 신호를 확인하고 있어요.</p>}
    </>}
  </div>;
}
