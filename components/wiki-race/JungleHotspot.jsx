import React, { useEffect, useRef } from "react";

// One shot only; replaying a hotspot replaces its previous effect.
export function useJunglePulse() {
  const running = useRef(null);
  useEffect(() => {
    const stop = () => running.current?.cancel();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", stop);
      stop();
    };
  }, []);

  return (element, frames, duration) => {
    running.current?.cancel();
    if (!element?.animate || document.hidden) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    running.current = element.animate(reduce ? [{ opacity: .9 }, { opacity: 0 }] : frames,
      { duration: reduce ? 240 : duration, easing: "ease-out" });
    running.current.id = "wr65-scene-pulse";
  };
}

export default function JungleHotspot({ kind, label, onReveal }) {
  const light = useRef(null);
  const pulse = useJunglePulse();

  return <button type="button" className={`wr65-hotspot wr65-hotspot--${kind}`} aria-label={label}
    onClick={event => {
      pulse(light.current, [
        { opacity: .95, transform: "scale(.8)" },
        { opacity: .7, transform: "scale(1) rotate(12deg)", offset: .3 },
        { opacity: 0, transform: "scale(1.3) rotate(23deg)" },
      ], kind === "lantern" ? 760 : 560);
      onReveal?.(event);
    }}>
    <span ref={light} className="wr65-hotspot-pulse" aria-hidden="true" />
  </button>;
}
