import { useEffect, useMemo, useRef } from 'react';
import { audioManager } from '../services/audioManager.js';
import { createAudioTimeline } from '../utils/audioTimeline.js';

export default function useAudioCues(identity, cues) {
  const state = useRef(null);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  if (state.current?.identity !== identity) state.current = { identity, step: createAudioTimeline(), enabled: false, completed: false, mount: 0 };
  const owner = state.current;
  // StrictMode can remount effects; cancelling only a live scope preserves the first frame.
  useEffect(() => {
    const version = ++owner.mount;
    if (identity) audioManager.beginScope(identity);
    return () => { queueMicrotask(() => {
      if (owner.mount === version && owner.enabled && !owner.completed) audioManager.cancelScope(identity);
    }); };
  }, [identity, owner]);
  return useMemo(() => {
    const frame = (ms, enabled = true) => {
      if (!identity || owner.completed) return;
      if (!enabled && owner.enabled) audioManager.cancelScope(identity);
      owner.enabled = enabled;
      if (ms < 0) return;
      for (const cue of owner.step(ms, cuesRef.current, enabled && !document.hidden)) {
        void audioManager.play(cue.sound, { key: `${identity}:${cue.id}` });
      }
    };
    frame.complete = finishSounds => {
      if (!identity || owner.completed) return;
      owner.completed = true;
      owner.enabled = false;
      audioManager.completeScope(identity, finishSounds);
    };
    return frame;
  }, [identity, owner]);
}
