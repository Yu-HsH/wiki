import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { audioManager } from '../services/audioManager.js';
import '../css/wikiRaceAudio.css';

export default function AudioControls() {
  const { pathname } = useLocation();
  const settings = useSyncExternalStore(audioManager.subscribe, audioManager.getSnapshot, audioManager.getSnapshot);
  const [open, setOpen] = useState(false), root = useRef(null), button = useRef(null);
  useEffect(() => audioManager.attach(), []);
  useEffect(() => { audioManager.setScene(pathname.replace(/\/+$/, '') === '/lobby' ? 'home' : pathname); setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return <aside ref={root} className="wr-audio" aria-label="게임 소리" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <button ref={button} type="button" className="wr-audio-toggle" aria-label="사운드 설정" aria-expanded={open} aria-controls="wr-audio-panel" onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">{settings.muted ? '♪̸' : '♪'}</span><span>소리</span>
    </button>
    {open && <section id="wr-audio-panel" className="wr-audio-panel" aria-label="사운드 설정">
      <header><strong>소리 설정</strong><button type="button" aria-label="소리 설정 닫기" onClick={() => { setOpen(false); button.current?.focus(); }}>닫기</button></header>
      <label className="wr-audio-mute"><input type="checkbox" checked={settings.muted} onChange={event => audioManager.update({ muted: event.target.checked })} />전체 음소거</label>
      {[['bgm', '배경음악'], ['sfx', '효과음']].map(([key, label]) => <label className="wr-audio-volume" key={key}>
        <span>{label} <output>{Math.round(settings[key] * 100)}%</output></span>
        <input type="range" aria-label={`${label} 음량`} min="0" max="100" value={Math.round(settings[key] * 100)} onChange={event => audioManager.update({ [key]: Number(event.target.value) / 100 })} />
      </label>)}
      {settings.status !== 'ready' && <button type="button" className="wr-audio-enable" onClick={() => { void audioManager.unlock(); }}>소리 재생 활성화</button>}
    </section>}
  </aside>;
}
