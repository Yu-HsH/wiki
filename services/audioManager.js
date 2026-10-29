import { AUDIO_ASSETS } from './audioAssets.js';

export const AUDIO_SETTINGS_KEY = 'wiki-race-audio-v1';
const CLAIMS_KEY = 'wiki-race-audio-events-v1';
export const DEFAULT_AUDIO_SETTINGS = Object.freeze({ muted: false, bgm: .28, sfx: .75 });
export function readAudioSettings(raw) {
  try {
    const value = JSON.parse(raw);
    const volume = (key) => typeof value?.[key] === 'number' && Number.isFinite(value[key])
      ? Math.min(1, Math.max(0, value[key])) : DEFAULT_AUDIO_SETTINGS[key];
    return { muted: typeof value?.muted === 'boolean' ? value.muted : false, bgm: volume('bgm'), sfx: volume('sfx') };
  } catch { return { ...DEFAULT_AUDIO_SETTINGS }; }
}

/** One lazy Web Audio graph. Effects never queue across unlock, decoding, hide or routes. */
export class AudioManager {
  constructor(host = typeof window === 'undefined' ? null : window) {
    this.host = host;
    this.settings = readAudioSettings(this.read('localStorage', AUDIO_SETTINGS_KEY));
    this.listeners = new Set(); this.buffers = new Map(); this.loading = new Map();
    this.claims = new Set(); this.voices = new Set(); this.epoch = 0; this.scene = null;
    this.unlocked = false; this.status = 'waiting'; this.lastPlay = new Map();
    this.uiVoice = null; this.uiRequest = 0; this.uiPending = false; this.uiLast = -Infinity;
    this.cancelledScopes = new Set();
    this.actionPrefix = `${Date.now()}:${Math.random()}`; this.actionSerial = 0;
    try { for (const key of JSON.parse(this.read('sessionStorage', CLAIMS_KEY) || '[]').slice(0,2048)) this.claims.add(key); } catch { /* memory fallback */ }
    this.snapshot = this.state();
  }
  read(storage, key) { try { return this.host?.[storage]?.getItem(key); } catch { return null; } }
  state() { return { ...this.settings, status: this.status }; }
  publish() { this.snapshot = this.state(); this.listeners.forEach(fn => fn()); }
  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getSnapshot = () => this.snapshot;
  log(type, detail = {}) {
    // No user IDs/titles in diagnostics. Event keys remain in sessionStorage only.
    this.host?.dispatchEvent(new this.host.CustomEvent('wiki-race-audio', { detail: { type, at: this.host.performance.now(), ...detail } }));
  }
  attach() {
    if (!this.host) return () => {};
    const document = this.host.document;
    const gesture = event => { if (event.isTrusted) void this.unlock(); };
    const buttonClick = event => {
      if (!event.isTrusted) return;
      const target = event.target?.closest?.('button, [role="button"], .wr-header a[href]');
      if (!target || target.matches(':disabled') || target.closest('[aria-disabled="true"], [inert], [data-audio-ui="off"], .article-content')) return;
      void this.playUiClick();
    };
    const visibility = () => {
      this.stopEffects();
      if (document.hidden) { this.stopBgm(0); void this.context?.suspend().catch(() => {}); }
      else if (this.unlocked) void this.wake();
    };
    const pagehide = () => { this.stopEffects(); this.stopBgm(0); void this.context?.suspend().catch(() => {}); };
    const storage = event => { if (event.key === AUDIO_SETTINGS_KEY) { this.settings = readAudioSettings(event.newValue); this.applySettings(); } };
    document.addEventListener('pointerdown', gesture, true); document.addEventListener('keydown', gesture, true);
    document.addEventListener('click', buttonClick, true);
    document.addEventListener('visibilitychange', visibility); this.host.addEventListener('pagehide', pagehide);
    this.host.addEventListener('pageshow', visibility); this.host.addEventListener('storage', storage);
    return () => {
      document.removeEventListener('pointerdown', gesture, true); document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('click', buttonClick, true);
      document.removeEventListener('visibilitychange', visibility); this.host.removeEventListener('pagehide', pagehide);
      this.host.removeEventListener('pageshow', visibility); this.host.removeEventListener('storage', storage);
      this.stopEffects(); this.stopBgm(0);
    };
  }
  async unlock() {
    if (this.host?.document.hidden) return false;
    try {
      if (!this.context) {
        const Context = this.host.AudioContext || this.host.webkitAudioContext;
        if (!Context) throw new Error('unsupported');
        this.context = new Context();
        this.bgmBus = this.context.createGain(); this.sfxBus = this.context.createGain();
        this.bgmBus.connect(this.context.destination); this.sfxBus.connect(this.context.destination);
        this.applyGains();
      }
      await this.context.resume();
      this.unlocked = this.context.state === 'running';
      this.status = this.unlocked ? 'ready' : 'waiting'; this.publish();
      if (this.unlocked) { void this.syncBgm(); this.prepareScene(); this.prepare(['uiClick']); }
      return this.unlocked;
    } catch { this.status = 'waiting'; this.unlocked = false; this.publish(); this.log('autoplay-wait'); return false; }
  }
  async wake() { if (await this.unlock()) void this.syncBgm(); }
  update(patch) {
    this.settings = readAudioSettings(JSON.stringify({ ...this.settings, ...patch }));
    try { this.host.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* usable without persistence */ }
    this.applySettings();
  }
  applySettings() {
    if (this.settings.muted || this.settings.sfx === 0) this.stopEffects();
    this.applyGains();
    if (this.settings.muted || this.settings.bgm === 0) this.stopBgm(.08);
    else void this.syncBgm();
    this.publish();
  }
  applyGains() {
    if (!this.context) return;
    const at = this.context.currentTime;
    for (const [gain, value] of [[this.bgmBus, this.settings.bgm], [this.sfxBus, this.settings.sfx]]) {
      gain.gain.cancelScheduledValues(at); gain.gain.setTargetAtTime(this.settings.muted ? 0 : value, at, .025);
    }
  }
  setScene(scene) {
    scene = scene === 'home' ? scene : (scene || '/').replace(/\/+$/, '') || '/';
    if (scene === this.scene) return;
    // The short input click may finish across a route change; game sounds stop.
    this.scene = scene; this.stopEffects(false);
    void this.syncBgm();
    this.prepareScene();
  }
  prepareScene() {
    if (this.scene?.startsWith('/multiplayer/game/')) this.prepare(['impact','tick','go','navigate','ink','seal','shield','reflect','move','itemReveal','win','loss','retire','denied','connectionLost','connectionRestored']);
    else if (this.scene === '/game') this.prepare(['open','flip','reveal','tick','go','navigate','finish','connectionLost','connectionRestored']);
    else if (this.scene?.startsWith('/multiplayer/group/game/')) this.prepare(['open','reveal','tick','go','navigate','finish','personalArrival','connectionLost','connectionRestored']);
    else if (/^\/multiplayer\/(group\/)?room\//.test(this.scene || '')) this.prepare(['join','ready','denied']);
    else if (this.scene?.startsWith('/profile')) this.prepare(['saved','denied']);
  }
  setGameplay(identity, route, active) {
    this.gameplay = { identity, route, active };
    void this.syncBgm();
  }
  clearGameplay(identity) {
    if (this.gameplay?.identity !== identity) return;
    this.gameplay = null; void this.syncBgm();
  }
  setResult(identity, route, active) {
    this.result = { identity, route, active };
    void this.syncBgm();
  }
  clearResult(identity) {
    if (this.result?.identity !== identity) return;
    this.result = null; void this.syncBgm();
  }
  musicName() {
    if (this.scene === 'home' || ['/play', '/ranking', '/profile', '/achievements', '/multiplayer'].includes(this.scene)
      || /^\/multiplayer\/(group\/)?room\//.test(this.scene || '')) return 'home';
    if (this.scene === '/' || this.scene === '/login') return 'opening';
    if (this.result?.active && this.result.route === this.scene) return 'result';
    return this.gameplay?.active && this.gameplay.route === this.scene ? 'jungle' : null;
  }
  waitingForResultSound(name) {
    return name === 'result' && [...this.voices].some(voice => voice.category === 'result');
  }
  action(label) {
    const epoch = this.epoch, key = `action:${this.actionPrefix}:${++this.actionSerial}:${label}`;
    let settled = false;
    return sound => {
      if (settled) return false;
      settled = true;
      if (!sound || epoch !== this.epoch) return false;
      void this.play(sound, { key }); return true;
    };
  }
  async load(name) {
    const asset = AUDIO_ASSETS[name]; if (!asset || !this.context) return null;
    if (this.buffers.has(asset.url)) return this.buffers.get(asset.url);
    if (!this.loading.has(asset.url)) {
      const context = this.context;
      const promise = this.host.fetch(asset.url).then(response => {
        if (!response.ok) throw new Error('audio load'); return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).then(buffer => {
        this.buffers.set(asset.url, buffer); return buffer;
      }).catch(() => { this.log('asset-unavailable', { sound: name }); return null; })
        .finally(() => this.loading.delete(asset.url));
      this.loading.set(asset.url, promise);
    }
    return this.loading.get(asset.url);
  }
  prepare(names) { if (this.unlocked && !this.settings.muted && !this.host.document.hidden) names.forEach(name => { void this.load(name); }); }
  async syncBgm() {
    const name = this.musicName();
    if (this.bgm && this.bgm.name !== name) this.stopBgm(.32);
    if (!name || !this.unlocked || this.context?.state !== 'running' || this.host.document.hidden || this.settings.muted || !this.settings.bgm || this.bgm || this.bgmPending || this.waitingForResultSound(name)) return;
    this.bgmPending = true;
    const epoch = this.epoch, buffer = await this.load(name); this.bgmPending = false;
    if (epoch !== this.epoch || this.musicName() !== name) { if (this.musicName()) void this.syncBgm(); return; }
    if (!buffer || this.host.document.hidden || this.settings.muted || !this.settings.bgm || this.context.state !== 'running' || this.waitingForResultSound(name)) return;
    const source = this.context.createBufferSource(), gain = this.context.createGain(), now = this.context.currentTime;
    source.buffer = buffer; source.loop = true; source.connect(gain); gain.connect(this.bgmBus);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(AUDIO_ASSETS[name].volume ?? 1, now + .45);
    this.bgm = { source, gain, name }; source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(); this.log('bgm-start', { sound: name });
  }
  stopBgm(fade = .32) {
    const voice = this.bgm; this.bgm = null; if (!voice) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fade);
    try { voice.source.stop(now + fade + .005); } catch { /* already ended */ }
    this.log('bgm-stop', { fade });
  }
  claim(key) {
    if (!key || this.claims.has(key) || this.claims.size >= 2048) return false;
    this.claims.add(key);
    try { this.host.sessionStorage.setItem(CLAIMS_KEY, JSON.stringify([...this.claims])); } catch { /* memory fallback */ }
    return true;
  }
  cancelScope(scope) {
    if (!scope) return;
    this.cancelledScopes.add(scope);
    for (const voice of this.voices) if (voice.key.startsWith(`${scope}:`)) {
      try { voice.source.stop(); } catch { /* ended */ }
      this.voices.delete(voice);
    }
  }
  beginScope(scope) {
    // A tail may outlive its cover, but never a new sequence of the same kind.
    const family = scope.slice(0, scope.indexOf(':') + 1);
    for (const voice of this.voices) if (voice.completedScope && voice.completedScope !== scope && voice.completedScope.startsWith(family)) {
      try { voice.source.stop(); } catch { /* ended */ }
      this.voices.delete(voice);
    }
  }
  completeScope(scope, finishSounds = []) {
    if (!scope) return;
    // Seal requests, including in-flight decoding, before handing off the cover.
    // Only already-started, explicitly allowed voices may finish naturally.
    this.cancelledScopes.add(scope);
    for (const voice of this.voices) if (voice.key.startsWith(`${scope}:`)) {
      if (finishSounds.includes(voice.name)) voice.completedScope = scope;
      else {
        try { voice.source.stop(); } catch { /* ended */ }
        this.voices.delete(voice);
      }
    }
  }
  stopEffects(includeUi = true) {
    this.epoch++;
    for (const voice of this.voices) { try { voice.source.stop(); } catch { /* ended */ } }
    this.voices.clear();
    if (includeUi) this.stopUiClick();
  }
  stopUiClick() {
    this.uiRequest++;
    try { this.uiVoice?.stop(); } catch { /* ended */ }
    this.uiVoice = null;
  }
  async playUiClick() {
    const start = this.host?.performance.now();
    if (!this.host || this.settings.muted || !this.settings.sfx || this.host.document.hidden || this.uiPending || start - this.uiLast < 80) return false;
    this.uiLast = start; this.uiPending = true;
    const request = ++this.uiRequest;
    try {
      if (!this.unlocked && !await this.unlock()) return false;
      const buffer = await this.load('uiClick');
      if (!buffer || request !== this.uiRequest || this.host.performance.now() - start > 120 || this.host.document.hidden || this.settings.muted || !this.settings.sfx || this.context.state !== 'running') return false;
      const asset = AUDIO_ASSETS.uiClick, at = this.context.currentTime;
      // A separate single voice never evicts an item/result or consumes claims.
      try { this.uiVoice?.stop(); } catch { /* ended */ }
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      const duration = Math.min(buffer.duration, .08);
      source.buffer = buffer; source.connect(gain); gain.connect(this.sfxBus);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(asset.volume, at + .003);
      gain.gain.setValueAtTime(asset.volume, at + duration - .012); gain.gain.linearRampToValueAtTime(0, at + duration);
      this.uiVoice = source;
      source.onended = () => { if (this.uiVoice === source) this.uiVoice = null; source.disconnect(); gain.disconnect(); };
      source.start(at, 0, duration); this.log('ui', { sound: 'uiClick', category: 'ui' }); return true;
    } catch { return false; }
    finally { this.uiPending = false; }
  }
  async play(name, { key, maxAge = 180 } = {}) {
    if (!this.claim(key)) return false;
    if ([...this.cancelledScopes].some(scope => key.startsWith(`${scope}:`))) {
      this.log('sfx-skip', { sound: name, reason: 'cancelled' }); return false;
    }
    const asset = AUDIO_ASSETS[name], start = this.host?.performance.now(), epoch = this.epoch;
    if (!asset || !this.unlocked || this.context?.state !== 'running' || this.settings.muted || !this.settings.sfx || this.host.document.hidden) { this.log('sfx-skip', {sound:name,reason:this.host?.document.hidden?'hidden':this.settings.muted||!this.settings.sfx?'muted':'locked'}); return false; }
    const buffer = await this.load(name), nowMs = this.host.performance.now();
    if (!buffer || epoch !== this.epoch || [...this.cancelledScopes].some(scope => key.startsWith(`${scope}:`)) || nowMs - start > maxAge || this.host.document.hidden || this.settings.muted || !this.settings.sfx || this.context.state !== 'running') { this.log('sfx-skip',{sound:name,reason:!buffer?'unavailable':nowMs-start>maxAge?'expired':'cancelled'}); return false; }
    if (nowMs - (this.lastPlay.get(name) ?? -Infinity) < 70) return false;
    this.lastPlay.set(name, nowMs);
    const at = this.context.currentTime;
    // Rewards yield the long arrival jingle; no delayed reward queue after navigation.
    if (asset.category === 'reward') for (const voice of this.voices) if (voice.category === 'result') {
      voice.gain.gain.cancelScheduledValues(at); voice.gain.gain.setTargetAtTime(.12, at, .035);
    }
    if (this.voices.size >= 4) { const oldest = this.voices.values().next().value; oldest.source.stop(); this.voices.delete(oldest); }
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; source.playbackRate.value = asset.rate || 1; source.connect(gain); gain.connect(this.sfxBus);
    const length = Math.min(buffer.duration, asset.length || buffer.duration), duration = length / (asset.rate || 1);
    if (this.bgm && ['opening', 'jungle', 'result'].includes(this.bgm.name)) {
      const level = AUDIO_ASSETS[this.bgm.name].volume, duck = this.bgm.gain.gain;
      duck.cancelScheduledValues(at); duck.setValueAtTime(duck.value, at);
      duck.linearRampToValueAtTime(level * .4, at + .02);
      duck.setValueAtTime(level * .4, at + Math.max(.03, Math.min(duration, .7)));
      duck.linearRampToValueAtTime(level, at + Math.max(.03, Math.min(duration, .7)) + .3);
    }
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(asset.volume ?? 1, at + .006);
    gain.gain.setValueAtTime(asset.volume ?? 1, at + Math.max(.006, duration - .025)); gain.gain.linearRampToValueAtTime(0, at + duration);
    const voice = { source, gain, key, name, category: asset.category }; this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice); source.disconnect(); gain.disconnect();
      if (voice.category === 'result') void this.syncBgm();
    };
    source.start(at, 0, length); this.log('sfx', { sound: name, category: asset.category || 'effect' }); return true;
  }
}
export const audioManager = new AudioManager();
