import React, { Children, useRef } from "react";

/**
 * Accessible horizontal pager. Keep content mounted for the slide animation,
 * but exclude offscreen links/buttons from keyboard navigation with inert.
 * Touch gestures never prevent vertical page scrolling.
 */
export default function HorizontalPager({ index = 0, onChange, label, className = "", children }) {
  const slides = Children.toArray(children);
  const active = Math.max(0, Math.min(slides.length - 1, index));
  const touchStart = useRef(null);

  function startTouch(event) {
    if (event.touches.length !== 1) return;
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  function endTouch(event) {
    const origin = touchStart.current;
    touchStart.current = null;
    if (!origin || event.changedTouches.length !== 1 || typeof onChange !== "function") return;
    const dx = event.changedTouches[0].clientX - origin.x;
    const dy = event.changedTouches[0].clientY - origin.y;
    if (Math.abs(dx) < 52 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    onChange(Math.max(0, Math.min(slides.length - 1, active + (dx < 0 ? 1 : -1))));
  }

  return (
    <div className={`wr-horizontal-pager ${className}`.trim()} role="region"
      aria-label={label} data-active-index={active} onTouchStart={startTouch} onTouchEnd={endTouch}
      onTouchCancel={() => { touchStart.current = null; }}>
      <div className="wr-horizontal-pager-track" style={{ transform: `translate3d(${-100 * active}%, 0, 0)` }}>
        {slides.map((slide, position) => (
          <div className="wr-horizontal-pager-slide" key={slide.key ?? position}
            aria-hidden={position !== active} inert={position === active ? undefined : ""}>
            {slide}
          </div>
        ))}
      </div>
    </div>
  );
}
