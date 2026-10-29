import { useEffect, useMemo, useRef } from 'react';
import { audioManager } from '../services/audioManager.js';
import { createLobbyAudioGate } from '../utils/audioFeedback.js';

/** Call only after an accepted read; mark initial/reconcile/reconnect reads quiet. */
export default function useLobbyAudio(mode, roomId, userId) {
  const owner = useRef(null), identity = `${mode}:${roomId}:${userId}`;
  if (owner.current?.identity !== identity) owner.current = { identity, snapshot: {}, gate: createLobbyAudioGate(mode, userId) };
  const current = owner.current;
  useEffect(() => {
    current.alive = true;
    const reset = () => { current.gate.reset(); };
    document.addEventListener('visibilitychange', reset);
    return () => { current.alive = false; document.removeEventListener('visibilitychange', reset); };
  }, [current]);
  return useMemo(() => {
    const observe = (patch, live = false) => {
      if (owner.current !== current || !current.alive) return;
      current.snapshot = { ...current.snapshot, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value != null)) };
      const cue = current.gate.observe(current.snapshot, live, !document.hidden);
      if (cue) void audioManager.play(cue.sound, { key: `lobby:${identity}:${cue.key}` });
    };
    observe.reset = () => current.gate.reset();
    return observe;
  }, [current, identity]);
}
