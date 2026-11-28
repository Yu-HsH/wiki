import React, { useEffect, useRef } from "react";
import { CountdownJournal } from "../../CountdownOverlay.jsx";
import { useDisplayNow } from "../../group-items-playtest/useDisplayNow.js";
import { audioManager } from "../../../services/audioManager.js";

export default function ScheduledItemCountdown({ roomId, startsAt, serverObservedAt, startTitle, targetTitle, onBoundary, intro }) {
  const deadline = Date.parse(startsAt);
  const now = useDisplayNow(Date.parse(serverObservedAt), true);
  const seconds = Math.ceil((deadline - now) / 1000);
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
    const interval = setInterval(() => callback.current(), 250);
    return () => clearInterval(interval);
  }, [reached, deadline]);

  return <div className="countdown-overlay wr-page wr-start-overlay item-race-countdown" aria-live="assertive" aria-atomic="true"
    data-server-start-at={deadline}>
    {intro ? <><div className="item-race-intro">{intro}</div>
      <div className="item-race-intro-tick countdown-number" key={tick}>{tick ?? (reached ? "시작!" : "…")}</div></>
      : <CountdownJournal value={tick ?? (reached ? "시작!" : "…")} startTitle={startTitle} targetTitle={targetTitle} sequence />}
  </div>;
}
