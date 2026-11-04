import React from "react";

/**
 * Decorative-only layer: the approved artwork and its baked-in typography
 * never scale, shift or lose pointer access. Motion is CSS-only and
 * honors prefers-reduced-motion.
 */
export default function JungleAtmosphere({ variant = "hero" }) {
  return (
    <div className={`wr65-atmosphere wr65-atmosphere--${variant}`} aria-hidden="true">
      <span className="wr65-atmosphere__sunbeam" />
      <span className="wr65-atmosphere__firefly wr65-atmosphere__firefly--a" />
      <span className="wr65-atmosphere__firefly wr65-atmosphere__firefly--b" />
      <span className="wr65-atmosphere__firefly wr65-atmosphere__firefly--c" />
      <span className="wr65-atmosphere__leaf wr65-atmosphere__leaf--a" />
      <span className="wr65-atmosphere__leaf wr65-atmosphere__leaf--b" />
      <span className="wr65-atmosphere__leaf wr65-atmosphere__leaf--c" />
    </div>
  );
}
