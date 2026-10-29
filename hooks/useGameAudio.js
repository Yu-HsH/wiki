import { useEffect, useRef } from 'react';
import { audioManager } from '../services/audioManager.js';
import { createConnectionAudioGate } from '../utils/audioFeedback.js';

/** Existing page phases own gameplay music. Unknown/normal recovery is silent. */
export default function useGameAudio({ identity, route, playing, connection = null, ended = false }) {
  const connectionState = useRef(null);
  if (connectionState.current?.identity !== identity) connectionState.current = { identity, gate: createConnectionAudioGate(), mount: `${Date.now()}:${Math.random()}` };
  const state = connectionState.current;
  useEffect(() => {
    audioManager.setGameplay(identity, route, Boolean(playing) && !ended && connection !== 'lost' && navigator.onLine !== false);
    return () => audioManager.clearGameplay(identity);
  }, [identity, route, playing, connection, ended]);
  useEffect(() => {
    const observe = () => {
      audioManager.setGameplay(identity, route, Boolean(playing) && !ended && connection !== 'lost' && navigator.onLine !== false);
      if (ended) { state.gate.reset(); return; }
      const status = navigator.onLine === false ? 'lost' : connection;
      const cue = state.gate.observe(status, !document.hidden, Date.now());
      if (cue) void audioManager.play(cue.sound, { key: `connection:${identity}:${state.mount}:${cue.serial}:${cue.sound}` });
    };
    const online = () => {
      // Online is only a retry opportunity. Online pages confirm recovery through
      // their subsequent phase/connection props, never the browser signal alone.
      audioManager.setGameplay(identity, route, connection == null && Boolean(playing) && !ended);
    };
    observe();
    window.addEventListener('offline', observe); window.addEventListener('online', online);
    document.addEventListener('visibilitychange', observe);
    return () => { window.removeEventListener('offline', observe); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', observe); };
  }, [state, identity, route, playing, connection, ended]);
}
