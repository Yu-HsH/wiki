// A tiny pure helper so pointer math stays testable and cannot move clickable art.
// Returns pixel offsets for near foliage and distant mist only.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getJungleParallaxOffsets(clientX, clientY, rect) {
  const neutral = { nearX: 0, nearY: 0, farX: 0, farY: 0 };
  if (!rect || ![clientX, clientY, rect.left, rect.top, rect.width, rect.height]
    .every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return neutral;
  const x = clamp((clientX - rect.left - rect.width / 2) / (rect.width / 2), -1, 1);
  const y = clamp((clientY - rect.top - rect.height / 2) / (rect.height / 2), -1, 1);
  return {
    nearX: Math.round(x * 10),
    nearY: Math.round(y * 7),
    farX: Math.round(-x * 5) || 0,
    farY: Math.round(-y * 3) || 0,
  };
}
