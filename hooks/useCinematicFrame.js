import { useLayoutEffect, useRef } from "react";

/** Presentation clock only. Phase changes, server clocks and claims stay with the callers. */
export default function useCinematicFrame(root, active, draw, duration, onFrame, scheduledElapsedMs = 0) {
  const renderer = useRef(draw);
  const audioFrame = useRef(onFrame);
  audioFrame.current = onFrame;
  renderer.current = draw;
  const origin = useRef(null);
  const scheduledOffset = useRef(scheduledElapsedMs);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    if (!active) { origin.current = null; renderer.current(element, duration / 1000, true); audioFrame.current?.(-1, false); return undefined; }
    if (origin.current === null) origin.current = performance.now() - scheduledOffset.current;
    let frame;
    const render = () => {
      const position = performance.now() - origin.current;
      const elapsed = Math.max(0, Math.min(duration, position));
      element.dataset.cinematicMs = elapsed.toFixed(1);
      renderer.current(element, elapsed / 1000, false);
      // Keep the opening cue pending until the reserved intro begins.
      audioFrame.current?.(position < 0 ? -1 : elapsed, position >= 0);
      if (elapsed < duration) frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [root, active, duration]);
}
