import { useEffect, useRef, useState } from "react";
import { claimResultMotion } from "../utils/resultJournal.js";

/** Display only. Reuse the bounded result claim; no new storage key or server writes. */
export default function useSceneSequence(identity, { eligible = true, confirmed = true, duration = 1100, stopped = false } = {}) {
  const [active, setActive] = useState(false);
  const decision = useRef(null);
  useEffect(() => {
    setActive(false);
    if (!identity || !confirmed) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (decision.current?.identity !== identity) {
      let claimed = false;
      try { claimed = claimResultMotion(window.localStorage, identity); } catch { /* static */ }
      decision.current = { identity, allowed: claimed && eligible && !document.hidden && !media.matches, expires: Date.now() + duration };
    }
    // Consume hidden/reduced/recovered arrivals, never replay on visibility or preference changes.
    if (stopped || !eligible || document.hidden || media.matches) decision.current.allowed = false;
    if (!decision.current.allowed) return undefined;
    const remaining = decision.current.expires - Date.now();
    if (remaining <= 0) return undefined;
    setActive(true);
    const stop = () => { decision.current.allowed = false; setActive(false); };
    const hidden = () => { if (document.hidden) stop(); };
    // A different tab claiming this scene stops decoration here; rewards have separate owners.
    const storage = (event) => {
      if (event.key !== "wiki-race-result-motion-v1") return;
      try {
        const previous = JSON.parse(event.oldValue || "[]"), next = JSON.parse(event.newValue || "[]");
        if (!previous.includes(identity) && next.includes(identity)) stop();
      } catch { stop(); }
    };
    const timer = setTimeout(stop, remaining);
    document.addEventListener("visibilitychange", hidden);
    media.addEventListener("change", stop);
    window.addEventListener("storage", storage);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hidden);
      media.removeEventListener("change", stop);
      window.removeEventListener("storage", storage);
    };
  }, [identity, eligible, confirmed, duration, stopped]);
  return active;
}
