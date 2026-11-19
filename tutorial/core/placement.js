const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function viewportBounds(viewport, fallback) {
  return { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
    width: viewport?.width || fallback.width, height: viewport?.height || fallback.height };
}
export function overlaps(a, b) {
  return !!a && !!b && a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}
// Bound the bubble to visualViewport, not the layout viewport covered by a soft keyboard.
export function placeTutorial({ viewport, target, bubble, protectedRects = [], gap = 16, overview = false }) {
  const edge = 12;
  const width = Math.min(bubble.width, viewport.width - edge * 2);
  const height = Math.min(bubble.height, viewport.height - edge * 2);
  const bound = (left, top) => ({ left: clamp(left, viewport.left + edge, viewport.left + viewport.width - width - edge), top: clamp(top, viewport.top + edge, viewport.top + viewport.height - height - edge), width, height });
  const center = bound(viewport.left + (viewport.width - width) / 2, viewport.top + (viewport.height - height) / 2);
  if (!target) {
    const bottom = bound(viewport.left + (viewport.width - width) / 2, viewport.top + viewport.height - height - edge);
    const top = bound(viewport.left + (viewport.width - width) / 2, viewport.top + edge);
    const options = overview ? [bottom, top, center] : [center, bottom, top];
    const safe = options.find(rect => !protectedRects.some(protectedRect => overlaps(rect, protectedRect)));
    return safe ? { ...safe, blocked: false } : { ...center, blocked: true };
  }
  const candidates = [bound(target.left + (target.width - width) / 2, target.top + target.height + gap), bound(target.left + (target.width - width) / 2, target.top - height - gap), bound(target.left - width - gap, target.top), bound(target.left + target.width + gap, target.top), bound(viewport.left + (viewport.width - width) / 2, viewport.top + edge), bound(viewport.left + (viewport.width - width) / 2, viewport.top + viewport.height - height - edge)];
  const safe = candidates.find(rect => ![target, ...protectedRects].some(protectedRect => overlaps(rect, protectedRect)));
  return safe ? { ...safe, blocked: false } : { ...center, blocked: true };
}


// Plan one bounded document scroll; readiness still comes from a fresh real DOM measurement.
export function planTutorialScroll({ viewport, target, bubble, protectedRects = [], scrollY, maxScrollY }) {
  const edge = 12;
  if (!target || target.width <= 0 || target.height <= 0 || target.height > viewport.height - edge * 2 || !Number.isFinite(scrollY) || !Number.isFinite(maxScrollY)) return null;
  if (!placeTutorial({ viewport, target, bubble, protectedRects }).blocked) return null;
  const candidates = [viewport.top + edge, viewport.top + viewport.height - target.height - edge]
    .map(top => {
      const nextScrollY = clamp(scrollY + target.top - top, 0, Math.max(0, maxScrollY));
      const movedTarget = { ...target, top: target.top - (nextScrollY - scrollY) };
      const placement = placeTutorial({ viewport, target: movedTarget, bubble, protectedRects });
      const fullyVisible = movedTarget.left >= viewport.left && movedTarget.left + movedTarget.width <= viewport.left + viewport.width && movedTarget.top >= viewport.top && movedTarget.top + movedTarget.height <= viewport.top + viewport.height;
      return { scrollY: nextScrollY, distance: Math.abs(nextScrollY - scrollY), safe: fullyVisible && !placement.blocked };
    })
    .filter(candidate => candidate.safe && candidate.distance >= 1)
    .sort((a, b) => a.distance - b.distance);
  return candidates.length ? { scrollY: candidates[0].scrollY } : null;
}
