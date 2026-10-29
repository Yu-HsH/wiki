import { useLayoutEffect, useRef } from "react";

/** Presentation clock only. Phase changes, server clocks and claims stay with the callers. */
export default function useCinematicFrame(root, active, draw, duration, onFrame) {
  const renderer = useRef(draw);
  const audioFrame = useRef(onFrame);
  audioFrame.current = onFrame;
  renderer.current = draw;
  const origin = useRef(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    if (!active) { origin.current = null; renderer.current(element, duration / 1000, true); audioFrame.current?.(-1, false); return undefined; }
    if (origin.current === null) origin.current = performance.now();
    let frame;
    const render = () => {
      const elapsed = Math.min(duration, performance.now() - origin.current);
      element.dataset.cinematicMs = elapsed.toFixed(1);
      renderer.current(element, elapsed / 1000, false);
      audioFrame.current?.(elapsed, true);
      if (elapsed < duration) frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [root, active, duration]);
}
