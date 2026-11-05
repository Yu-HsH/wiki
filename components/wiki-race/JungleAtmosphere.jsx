import React, { useEffect, useRef } from "react";
import { getJungleParallaxOffsets } from "../../utils/jungleParallax.js";

// All decorative nodes are non-interactive. The original approved art and
// invisible real HTML buttons stay in their original positions.
const LEAVES = Object.freeze([
  { x: "8%", drift: "92px", duration: "12s", delay: "-9s", size: "13px" },
  { x: "17%", drift: "45px", duration: "15s", delay: "-3s", size: "17px" },
  { x: "24%", drift: "-35px", duration: "18s", delay: "-12s", size: "12px" },
  { x: "76%", drift: "52px", duration: "15s", delay: "-7s", size: "14px" },
  { x: "85%", drift: "-64px", duration: "17s", delay: "-14s", size: "18px" },
  { x: "94%", drift: "-94px", duration: "13s", delay: "-4s", size: "12px" },
  { x: "5%", drift: "46px", duration: "21s", delay: "-18s", size: "12px" },
  { x: "91%", drift: "-33px", duration: "20s", delay: "-12s", size: "15px" },
]);

const FIREFLIES = Object.freeze([
  { left: "9%", top: "57%", delay: "-4s", duration: "7s" },
  { left: "18%", top: "26%", delay: "-1s", duration: "9s" },
  { left: "26%", top: "67%", delay: "-7s", duration: "10s" },
  { left: "70%", top: "74%", delay: "-3s", duration: "8s" },
  { left: "81%", top: "46%", delay: "-6s", duration: "9s" },
  { left: "92%", top: "27%", delay: "-2s", duration: "11s" },
  { left: "63%", top: "12%", delay: "-8s", duration: "12s" },
]);

function DistantBirds() {
  return (
    <svg className="wr65-alive-birds" viewBox="0 0 190 45" focusable="false" aria-hidden="true">
      <g fill="none" stroke="#34483b" strokeWidth="3.4" strokeLinecap="round">
        <path d="M7 19q14 -19 30 0q16 -18 30 0" />
        <path d="M91 23q10 -12 20 0q10 -12 20 0" />
        <path d="M153 12q7 -9 14 0q7 -9 14 0" />
      </g>
    </svg>
  );
}

export default function JungleAtmosphere({ variant = "hero" }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.parentElement;
    if (!root || !stage || typeof window === "undefined") return undefined;

    let frame = 0;
    let position = null;
    let inView = true;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

    const applyOffsets = (value) => {
      root.style.setProperty("--wr65-near-x", value.nearX + "px");
      root.style.setProperty("--wr65-near-y", value.nearY + "px");
      root.style.setProperty("--wr65-far-x", value.farX + "px");
      root.style.setProperty("--wr65-far-y", value.farY + "px");
    };
    const reset = () => {
      position = null;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      applyOffsets({ nearX: 0, nearY: 0, farX: 0, farY: 0 });
    };
    const draw = () => {
      frame = 0;
      if (!position || !inView || document.hidden || motion?.matches) return;
      applyOffsets(getJungleParallaxOffsets(position.x, position.y, stage.getBoundingClientRect()));
    };
    const move = (event) => {
      if (!finePointer || event.pointerType === "touch" || !inView || document.hidden || motion?.matches) return;
      position = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      const paused = !inView || document.hidden;
      root.classList.toggle("is-paused", paused);
      if (paused) {
        reset();
        for (const animation of stage.getAnimations?.({ subtree: true }) ?? []) {
          if (animation.id === "wr65-scene-pulse") animation.cancel();
        }
      }
    };
    const onMotionChange = () => { if (motion?.matches) reset(); };
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
          inView = Boolean(entry?.isIntersecting);
          onVisibility();
        }, { threshold: 0.01 })
      : null;

    if (finePointer) {
      stage.addEventListener("pointermove", move, { passive: true });
      stage.addEventListener("pointerleave", reset);
    }
    motion?.addEventListener?.("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibility);
    // Track the art frame. The atmosphere itself can be hidden by motion preferences.
    observer?.observe(stage);
    onVisibility();

    return () => {
      if (finePointer) {
        stage.removeEventListener("pointermove", move);
        stage.removeEventListener("pointerleave", reset);
      }
      motion?.removeEventListener?.("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      reset();
    };
  }, [variant]);

  return (
    <div ref={rootRef} className={"wr65-atmosphere wr65-atmosphere--" + variant}
      aria-hidden="true">
      <span className="wr65-alive-mist wr65-alive-mist--left" />
      <span className="wr65-alive-mist wr65-alive-mist--right" />
      <span className="wr65-alive-sunbeam wr65-alive-sunbeam--left" />
      <span className="wr65-alive-sunbeam wr65-alive-sunbeam--right" />
      {variant === "landing" && <>
        <span className="wr65-waterlight wr65-waterlight--fall" />
        <span className="wr65-waterlight wr65-waterlight--river" />
      </>}
      <DistantBirds />
      {FIREFLIES.map((firefly, index) => (
        <span key={"firefly-" + index} className={`wr65-alive-firefly${index >= 3 ? " wr65-alive-firefly--extra" : ""}`}
          style={{ left: firefly.left, top: firefly.top,
            animationDelay: firefly.delay, animationDuration: firefly.duration }} />
      ))}
      {LEAVES.map((leaf, index) => (
        <span key={"leaf-" + index} className="wr65-alive-leaf-track"
          style={{ left: leaf.x, animationDelay: leaf.delay,
            animationDuration: leaf.duration, "--wr65-leaf-drift": leaf.drift,
            "--wr65-leaf-size": leaf.size }}>
          <span className="wr65-alive-leaf" />
        </span>
      ))}
    </div>
  );
}
