import { useCallback, useEffect, useRef, useState } from "react";
import { createRaceMotionGate } from "../utils/raceMotion.js";
import { audioManager } from "../services/audioManager.js";

/** Called only by successful move handlers; snapshots never generate motion. */
export default function useRaceMotion() {
  const gate = useRef(createRaceMotionGate());
  const timer = useRef(null);
  const [motion, setMotion] = useState(null);
  useEffect(() => {
    const stop = () => {
      if (document.visibilityState !== "visible") {
        clearTimeout(timer.current);
        setMotion(null);
      }
    };
    document.addEventListener("visibilitychange", stop);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);
  const approve = useCallback((identity, appended, tone) => {
    // Successful move handlers only; a snapshot never calls approve.
    void audioManager.play('navigate', { key: `move:${identity}` });
    if (!gate.current(identity, document.visibilityState === "visible",
      window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    clearTimeout(timer.current);
    setMotion(previous => ({ variant: previous?.variant === "a" ? "b" : "a", appended, tone }));
    timer.current = setTimeout(() => setMotion(null), 450);
  }, []);
  return [motion, approve];
}
