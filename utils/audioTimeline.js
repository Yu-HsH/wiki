// Crossing detector driven ONLY by the animation's existing clock. No timers.
// A late initial mount, frame stall, skip, hide or restored scene consumes past cues.
export function createAudioTimeline() {
  let previous = null;
  const fired = new Set();
  return (ms, cues, enabled = true) => {
    const from = previous ?? -1; previous = ms;
    const result = [];
    for (const cue of cues) {
      if (fired.has(cue.id) || ms < cue.at) continue;
      fired.add(cue.id);
      if (enabled && from < cue.at && ms - cue.at <= 120 && (from < 0 ? ms <= 120 : ms - from <= 250)) result.push(cue);
    }
    return result;
  };
}
export const SINGLE_AUDIO_CUES = Object.freeze([
  { id: 'open', at: 100, sound: 'open' }, { id: 'first-document', at: 720, sound: 'reveal' },
  { id: 'flip', at: 2900, sound: 'flip' }, { id: 'second-document', at: 4000, sound: 'reveal' },
  { id: '3', at: 6000, sound: 'tick' }, { id: '2', at: 6700, sound: 'tick' },
  { id: '1', at: 7400, sound: 'tick' }, { id: 'go', at: 8100, sound: 'go' },
]);
