import { createPlaytestAudio } from "../group-items-playtest/playtestAudio.js";

export const PRODUCT_INK_PREVIEW_URL = "/__s4-review/ink-splash-180ms-three.wav";

// The V4 WAV already contains all three strikes. Play only the matching slice
// on each fresh server pulse so recovery cannot resume old audio.
const previewSegments = [0, .18, .36].map(offset => ({ offset, duration: .18 }));

export function createProductInkAudio(host, { preview = false } = {}) {
  return createPlaytestAudio(host, {
    inkAsset: preview ? { url: PRODUCT_INK_PREVIEW_URL, volume: .5 } : null,
    inkSegments: previewSegments,
  });
}
