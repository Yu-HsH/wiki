import { useCallback, useEffect, useRef, useState } from 'react';
import { appendDuelRecent, createDuelFeedbackGate, describeDuelFeedback, DUEL_FEEDBACK_MS, DUEL_NOTICE_MS } from '../utils/duelFeedback.js';
import { audioManager } from '../services/audioManager.js';
import { duelCueSound } from '../services/audioAssets.js';

// No queue: at most three concurrent stamps, each expires from its own receipt time.
// Snapshots never call emit. Hidden/recovered/ended screens remain static.
export default function useDuelFeedback({ roomId, userId, opponentId, enabled }) {
  const [cues, setCues] = useState([]);
  const [notices, setNotices] = useState([]);
  const [recent, setRecent] = useState([]);
  const timer = useRef(null);
  const noticeTimer = useRef(null);
  const gate = useRef(createDuelFeedbackGate(Date.now()));
  const current = useRef({ userId, opponentId, enabled });
  current.current = { userId, opponentId, enabled };
  useEffect(() => {
    gate.current = createDuelFeedbackGate(Date.now());
    setCues([]);
    setNotices([]);
    setRecent([]);
    const visibility = () => {
      clearTimeout(timer.current);
      clearTimeout(noticeTimer.current);
      setCues([]);
      setNotices([]);
      if (document.visibilityState === 'visible') gate.current.resume(Date.now());
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(timer.current); clearTimeout(noticeTimer.current); document.removeEventListener('visibilitychange', visibility); };
  }, [roomId, userId]);
  useEffect(() => {
    if (!enabled) { clearTimeout(timer.current); clearTimeout(noticeTimer.current); setCues([]); setNotices([]); setRecent([]); }
    else gate.current.resume(Date.now());
  }, [enabled]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!cues.length) return undefined;
    timer.current = setTimeout(() => setCues(prev => prev.filter(cue => cue.until > Date.now())), Math.max(0, Math.min(...cues.map(c => c.until)) - Date.now()));
    return () => clearTimeout(timer.current);
  }, [cues]);
  useEffect(() => {
    clearTimeout(noticeTimer.current);
    if (!notices.length) return undefined;
    noticeTimer.current = setTimeout(() => setNotices(prev => prev.filter(c => c.until > Date.now())), Math.max(0, Math.min(...notices.map(c => c.until)) - Date.now()));
    return () => clearTimeout(noticeTimer.current);
  }, [notices]);
  const emit = useCallback((event, options = {}) => {
    const cue = describeDuelFeedback(event, { ...current.current, ...options });
    if (!cue || !current.current.enabled || !gate.current.accept(cue, {
      now: Date.now(), visible: document.visibilityState === 'visible', skewMs: options.skewMs,
    })) return false;
    const sound = duelCueSound({ ...cue, outcome: event.result });
    if (sound) void audioManager.play(sound, { key: `duel-item:${event.itemEventId}` });
    setCues(prev => [...prev.filter(c => c.until > Date.now()), { ...cue, until: Date.now() + DUEL_FEEDBACK_MS }].slice(-3));
    setNotices(prev => [...prev.filter(c => c.until > Date.now()), { ...cue, until: Date.now() + DUEL_NOTICE_MS }].slice(-3));
    setRecent(prev => appendDuelRecent(prev, cue));
    return true;
  }, []);
  const fail = useCallback((item, grantId, message) => {
    if (!current.current.enabled || document.visibilityState !== 'visible') return;
    const cue = { id: `failure:${grantId}:${Date.now()}`, itemId: item.id, name: item.name,
      grantId, kind: 'failure', motif: 'failure', label: message, headline: `${item.name} · ${message}`, detail: '사용 실패', serverTimestamp: Date.now(), tone: 'blue', until: Date.now() + DUEL_FEEDBACK_MS };
    setCues(prev => [...prev.filter(c => c.until > Date.now()), cue].slice(-3));
    setNotices(prev => [...prev.filter(c => c.until > Date.now()), { ...cue, until: Date.now() + DUEL_NOTICE_MS }].slice(-3));
  }, []);
  return { cues, notices, recent, emit, fail };
}
