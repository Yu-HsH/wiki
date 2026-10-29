import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, readAudioSettings, AUDIO_SETTINGS_KEY } from '../services/audioManager.js';
import { createAudioTimeline, SINGLE_AUDIO_CUES } from '../utils/audioTimeline.js';
import { AUDIO_ASSETS, duelCueSound } from '../services/audioAssets.js';

function fakeHost() {
  const stores = () => ({ values: new Map(), getItem(k) { return this.values.get(k) ?? null; }, setItem(k,v) { this.values.set(k,v); } });
  let now = 0;
  const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value=v; }, setTargetAtTime(v) { this.value=v; }, linearRampToValueAtTime(v) { this.value=v; } });
  const node = () => ({ gain: param(), playbackRate: param(), connect() {}, disconnect() {}, start() { this.started=true; }, stop() { this.stopped=true; } });
  const host = { document: { hidden:false }, localStorage: stores(), sessionStorage: stores(), performance: { now: () => now },
    CustomEvent: class { constructor(type, { detail }) { this.type=type; this.detail=detail; } }, events: [], dispatchEvent(e) { this.events.push(e.detail); },
    async fetch() { return { ok:true, arrayBuffer:async()=>new ArrayBuffer(2) }; },
    AudioContext: class { state='suspended'; currentTime=0; destination={}; nodes=[];
      createGain() { return node(); } createBufferSource() { const s=node(); this.nodes.push(s); return s; }
      async decodeAudioData() { return { duration:1 }; } async resume() { this.state='running'; } async suspend() { this.state='suspended'; }
    }, tick(ms) { now+=ms; },
  };
  return host;
}
test('audio settings validate malformed storage and clamp independent buses', () => {
  assert.deepEqual(readAudioSettings('broken'), {muted:false,bgm:.28,sfx:.75});
  assert.deepEqual(readAudioSettings('{"muted":"false","bgm":2,"sfx":-1}'), {muted:false,bgm:1,sfx:0});
});
test('effects before unlock are consumed and never replayed after gesture', async () => {
  const m=new AudioManager(fakeHost()); assert.equal(await m.play('go',{key:'early'}),false);
  await m.unlock(); assert.equal(await m.play('go',{key:'early'}),false);
  assert.equal(await m.play('go',{key:'fresh'}),true);
});
test('muting and zero SFX consume events, settings persist independently', async () => {
  const host=fakeHost(),m=new AudioManager(host); await m.unlock();
  m.update({muted:true,bgm:.2,sfx:.6}); assert.equal(await m.play('tick',{key:'muted'}),false);
  m.update({muted:false,sfx:0}); assert.equal(await m.play('tick',{key:'zero'}),false);
  m.update({sfx:.6}); assert.equal(await m.play('tick',{key:'muted'}),false);
  assert.deepEqual(new AudioManager(host).settings,{muted:false,bgm:.2,sfx:.6});
  assert.ok(host.localStorage.getItem(AUDIO_SETTINGS_KEY));
});
test('F5 uses persisted session identities; duplicate realtime responses play once', async () => {
  const host=fakeHost(),m=new AudioManager(host); await m.unlock();
  assert.equal(await m.play('ink',{key:'event-id'}),true); assert.equal(await m.play('ink',{key:'event-id'}),false);
  const restored=new AudioManager(host); await restored.unlock(); assert.equal(await restored.play('ink',{key:'event-id'}),false);
});
test('hidden and route-change decode races discard rather than queue SFX', async () => {
  const host=fakeHost(),m=new AudioManager(host); await m.unlock();
  let resolve; host.fetch=()=>new Promise(r=>{ resolve=r; });
  const pending=m.play('ink',{key:'pending'}); m.setScene('/play');
  resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)}); assert.equal(await pending,false);
  host.document.hidden=true; assert.equal(await m.play('ink',{key:'hidden'}),false);
  host.document.hidden=false; assert.equal(await m.play('ink',{key:'hidden'}),false);
});
test('slow decoding expires a sound rather than firing late', async () => {
  const host=fakeHost(),m=new AudioManager(host); await m.unlock();
  host.fetch=async()=>{host.tick(220);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};};
  assert.equal(await m.play('go',{key:'late'}),false);
});
test('autoplay rejection safely recovers on a later gesture', async () => {
  const host=fakeHost(),m=new AudioManager(host); await m.unlock();
  m.context.resume=async()=>{throw Error('NotAllowedError');}; assert.equal(await m.unlock(),false);
  assert.equal(m.status,'waiting'); m.context.resume=async()=>{m.context.state='running';}; assert.equal(await m.unlock(),true);
});
test('audio and storage failures never throw into gameplay', async () => {
  const host=fakeHost(); host.localStorage.getItem=()=>{throw Error('denied');}; host.sessionStorage.setItem=()=>{throw Error('denied');};
  const m=new AudioManager(host); await m.unlock(); host.fetch=async()=>{throw Error('offline');};
  assert.equal(await m.play('go',{key:'unavailable'}),false); assert.equal(m.claim('unavailable'),false);
});
test('concurrent HOME syncs create one seamless loop and leaving fades it', async () => {
  const host=fakeHost(),m=new AudioManager(host); await m.unlock(); m.setScene('home');
  await Promise.all([m.syncBgm(),m.syncBgm()]); await new Promise(r=>setImmediate(r));
  assert.equal(m.context.nodes.length,1); assert.equal(m.bgm.source.loop,true);
  const source=m.bgm.source; m.setScene('/game'); assert.equal(m.bgm,null); assert.equal(source.stopped,true);
});
test('skip cancels both playing and decoding voices for its scope', async () => {
  const m=new AudioManager(fakeHost()); await m.unlock(); await m.play('go',{key:'start:a:go'});
  const voice=[...m.voices][0]; m.cancelScope('start:a'); assert.equal(voice.source.stopped,true);
  assert.equal(await m.play('tick',{key:'start:a:tick'}),false);
});
test('voice count is bounded during a burst of different confirmed events', async () => {
  const host=fakeHost(),m=new AudioManager(host); await m.unlock();
  for(let i=0;i<10;i++){host.tick(80);await m.play('tick',{key:'burst:'+i});} assert.equal(m.voices.size,4);
});
test('first gesture warms only the current game mode and deduplicates shared asset URLs', async () => {
  const host=fakeHost(),urls=[];host.fetch=async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};};
  const m=new AudioManager(host);m.setScene('/multiplayer/game/local-room');assert.equal(urls.length,0);
  await m.unlock();await new Promise(r=>setImmediate(r));
  assert.equal(urls.length,15);assert.equal(new Set(urls).size,15);assert.ok(!urls.some(url=>url===AUDIO_ASSETS.home.url||url===AUDIO_ASSETS.jungle.url));
  assert.equal(urls.filter(url=>url.includes('/sfx-v04/')).length,5);
  assert.equal(urls.filter(url=>url.includes('/sfx-v05/')).length,1);
  await m.unlock();assert.equal(urls.length,15);
});

test('UI clicks do not consume gameplay claims or evict four active game sounds', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();
  for(let i=0;i<4;i++){host.tick(80);await m.play('tick',{key:'game:'+i});}
  const gameSources=[...m.voices].map(v=>v.source);
  for(let i=0;i<20;i++){host.tick(80);assert.equal(await m.playUiClick(),true);}
  assert.equal(m.claims.size,4);assert.equal(m.voices.size,4);
  assert.ok(gameSources.every(source=>!source.stopped));
  const click=m.uiVoice;m.setScene('/play');assert.ok(!click.stopped);
  m.stopEffects();assert.equal(click.stopped,true);
});

test('UI click rate limit and mute/hidden settings never queue a later click', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();
  assert.equal(await m.playUiClick(),true);assert.equal(await m.playUiClick(),false);
  host.tick(80);m.update({muted:true});assert.equal(await m.playUiClick(),false);
  m.update({muted:false});host.document.hidden=true;assert.equal(await m.playUiClick(),false);
  host.document.hidden=false;assert.equal(m.uiVoice,null);
  host.tick(80);assert.equal(await m.playUiClick(),true);assert.equal(m.claims.size,0);
});

test('a pending UI decode is cancelled by mute and expired decoding stays silent', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();await m.load('uiClick');m.buffers.clear();
  let release;host.fetch=()=>new Promise(resolve=>{release=resolve;});
  const pending=m.playUiClick();m.update({muted:true});release({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
  assert.equal(await pending,false);m.update({muted:false});assert.equal(m.uiVoice,null);
  host.tick(150);m.buffers.clear();host.fetch=async()=>{host.tick(150);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};};
  assert.equal(await m.playUiClick(),false);assert.equal(m.uiVoice,null);
});
test('HOME re-entry during a pending BGM decode recovers exactly one loop', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();
  let resolve;host.fetch=()=>new Promise(r=>{resolve=r;});
  m.setScene('home');m.setScene('/play');m.setScene('home');
  resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});await new Promise(r=>setImmediate(r));
  assert.equal(m.context.nodes.length,1);assert.ok(m.bgm);
});

test('jungle BGM requires the current route and an active page phase, with one loop', async () => {
  const host=fakeHost(),m=new AudioManager(host);m.setScene('/game/');await m.unlock();
  assert.equal(m.bgm,undefined);
  m.setGameplay('run','/another-game',true);await new Promise(r=>setImmediate(r));assert.equal(m.bgm,undefined);
  m.setGameplay('run','/game',true);await new Promise(r=>setImmediate(r));assert.equal(m.bgm.name,'jungle');
  const voice=m.bgm;m.setGameplay('run','/game',true);await new Promise(r=>setImmediate(r));assert.equal(m.bgm,voice);
  m.clearGameplay('other-run');assert.equal(m.bgm,voice);
  m.setGameplay('run','/game',false);assert.equal(m.bgm,null);assert.equal(voice.source.stopped,true);
});

test('HOME decode arriving after gameplay begins cannot start the old music', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();
  let release;host.fetch=url=>url.includes('home-')?new Promise(r=>{release=r;}):Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
  m.setScene('home');m.setScene('/game');m.setGameplay('run','/game',true);
  release({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});await new Promise(r=>setImmediate(r));
  assert.equal(m.bgm.name,'jungle');assert.equal(host.events.filter(e=>e.type==='bgm-start'&&e.sound==='home').length,0);
});

test('result or departure during jungle decoding discards music instead of starting late', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();m.setScene('/game');
  let release;host.fetch=url=>url===AUDIO_ASSETS.jungle.url?new Promise(r=>{release=r;}):Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
  m.setGameplay('run','/game',true);m.setGameplay('run','/game',false);
  release({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});await new Promise(r=>setImmediate(r));
  assert.ok(!m.bgm);assert.equal(host.events.filter(e=>e.type==='bgm-start').length,0);
});

test('request feedback settles once and successful commit cannot later sound rejected', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();
  const save=m.action('save');assert.equal(save('saved'),true);assert.equal(save('denied'),false);
  const applied=m.action('item');assert.equal(applied(null),false);assert.equal(applied('denied'),false);
  await new Promise(r=>setImmediate(r));assert.equal(host.events.filter(e=>e.sound==='saved'&&e.type==='sfx').length,1);
  assert.equal(host.events.filter(e=>e.sound==='denied'&&e.type==='sfx').length,0);
});

test('result BGM follows visible records on the current route and keeps one voice', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();m.setScene('/game');
  m.setResult('run','/another-game',true);await new Promise(r=>setImmediate(r));assert.ok(!m.bgm);
  m.setResult('run','/game',false);await new Promise(r=>setImmediate(r));assert.ok(!m.bgm);
  m.setResult('run','/game',true);await new Promise(r=>setImmediate(r));assert.equal(m.bgm.name,'result');
  const voice=m.bgm;m.setResult('run','/game',true);m.clearResult('old-run');await new Promise(r=>setImmediate(r));assert.equal(m.bgm,voice);
  m.clearResult('run');assert.equal(m.bgm,null);assert.equal(voice.source.stopped,true);
});

test('result records wait for the real arrival voice end instead of a scene-length timer', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();m.setScene('/game');
  await m.play('finish',{key:'arrival'});const arrival=[...m.voices][0];
  m.setResult('run','/game',true);await new Promise(r=>setImmediate(r));assert.ok(!m.bgm);
  arrival.source.onended();await new Promise(r=>setImmediate(r));assert.equal(m.bgm.name,'result');
  assert.equal(host.events.filter(e=>e.type==='sfx'&&e.sound==='finish').length,1);
  assert.equal(host.events.filter(e=>e.type==='bgm-start').length,1);
});

test('result BGM decoding rechecks a newly started verdict voice before playing', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();m.setScene('/game');await new Promise(r=>setImmediate(r));
  let release;host.fetch=url=>url===AUDIO_ASSETS.result.url?new Promise(r=>{release=r;}):Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
  m.setResult('run','/game',true);await m.play('loss',{key:'verdict'});
  release({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});await new Promise(r=>setImmediate(r));assert.ok(!m.bgm);
  [...m.voices][0].source.onended();await new Promise(r=>setImmediate(r));assert.equal(m.bgm.name,'result');
});

test('leaving a result during decoding cannot start its music late', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();m.setScene('/game');await new Promise(r=>setImmediate(r));
  let release;host.fetch=url=>url===AUDIO_ASSETS.result.url?new Promise(r=>{release=r;}):Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
  m.setResult('run','/game',true);m.setScene('/play');m.clearResult('run');
  release({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});await new Promise(r=>setImmediate(r));assert.ok(!m.bgm);
  assert.equal(host.events.filter(e=>e.type==='bgm-start').length,0);
});

test('result music survives quiet F5-style entry, mute/hidden recovery and SFX zero independently', async () => {
  const host=fakeHost(),m=new AudioManager(host);m.setScene('/game');m.setResult('recovered','/game',true);assert.ok(!m.bgm);
  m.update({sfx:0});await m.unlock();await new Promise(r=>setImmediate(r));assert.equal(m.bgm.name,'result');
  assert.equal(host.events.filter(e=>e.type==='sfx').length,0);
  m.update({muted:true});assert.equal(m.bgm,null);m.update({muted:false});await new Promise(r=>setImmediate(r));assert.equal(m.bgm.name,'result');
  host.document.hidden=true;m.stopBgm(0);await m.syncBgm();assert.equal(m.bgm,null);
  host.document.hidden=false;await m.wake();await new Promise(r=>setImmediate(r));assert.equal(m.bgm.name,'result');
});

test('request completion after route change or mute never queues its sound', async () => {
  const host=fakeHost(),m=new AudioManager(host);await m.unlock();
  const departed=m.action('save');m.setScene('/profile');assert.equal(departed('saved'),false);
  const muted=m.action('save');m.update({muted:true});assert.equal(muted('saved'),false);
  m.update({muted:false});await new Promise(r=>setImmediate(r));assert.equal(host.events.filter(e=>e.type==='sfx').length,0);
});
test('Single audio follows each exact existing visual boundary once', () => {
  const step=createAudioTimeline(),events=[];
  for(let ms=0;ms<=8600;ms+=10)events.push(...step(ms,SINGLE_AUDIO_CUES).map(e=>[e.id,ms]));
  assert.deepEqual(events,SINGLE_AUDIO_CUES.map(e=>[e.id,e.at]));
  assert.equal(step(8600,SINGLE_AUDIO_CUES).length,0);
});
test('late mount, stall, skip and reduced-motion never catch up past cues', () => {
  for(const ms of [300,3000,8100])assert.equal(createAudioTimeline()(ms,SINGLE_AUDIO_CUES).length,0);
  const step=createAudioTimeline();step(0,SINGLE_AUDIO_CUES);assert.equal(step(8100,SINGLE_AUDIO_CUES).length,0);
  const quiet=createAudioTimeline();quiet(0,SINGLE_AUDIO_CUES);quiet(8100,SINGLE_AUDIO_CUES,false);
  assert.equal(quiet(8110,SINGLE_AUDIO_CUES,true).length,0);
});
test('Duel applied/blocked/reflected/failure use separate semantic sounds', () => {
  assert.equal(duelCueSound({kind:'hit',motif:'ink'}),'ink');
  assert.equal(duelCueSound({kind:'use',motif:'seal',outcome:'blocked'}),'shield');
  assert.equal(duelCueSound({kind:'reflect',motif:'ink'}),'reflect');
  assert.equal(duelCueSound({kind:'use',motif:'search'}),'itemReveal');
  assert.equal(duelCueSound({kind:'void',motif:'move'}),null);assert.equal(duelCueSound({kind:'failure'}),null);
});

// A controllable AudioContext clock verifies lifetime, not just a play event.
async function lifetimeManager() {
  const host = fakeHost(), manager = new AudioManager(host);
  await manager.unlock();
  manager.buffers.set(AUDIO_ASSETS.win.url, { duration: 3.8 });
  manager.buffers.set(AUDIO_ASSETS.go.url, { duration: 1.3 });
  const create = manager.context.createBufferSource.bind(manager.context);
  manager.context.createBufferSource = () => {
    const source = create();
    source.start = (at = manager.context.currentTime, offset = 0, length = source.buffer.duration) => {
      source.started = true; source.endsAt = at + length / source.playbackRate.value;
    };
    return source;
  };
  const advance = async seconds => {
    host.tick(seconds * 1000); manager.context.currentTime += seconds;
    for (const source of manager.context.nodes) if (source.started && !source.stopped && !source.loop && !source.ended && source.endsAt <= manager.context.currentTime) {
      source.ended = true; source.onended?.();
    }
    await new Promise(resolve => setImmediate(resolve));
  };
  return { host, manager, advance };
}

test('AUDIO-01: normal 2.7s cover completion preserves the 3.8s verdict and starts result music once on ended', async () => {
  const { host, manager: m, advance } = await lifetimeManager();
  m.setScene('/multiplayer/game/a');
  await advance(.86); await m.play('win', { key: 'duel-result:a:verdict' });
  const voice = [...m.voices][0];
  await advance(1.84); m.completeScope('duel-result:a', ['win']);
  m.setResult('a', '/multiplayer/game/a', true); await m.syncBgm();
  assert.ok(!voice.source.stopped); assert.equal(m.bgm, undefined);
  await advance(1.95); assert.ok(!voice.source.ended); assert.ok(!m.bgm);
  await advance(.01); assert.ok(voice.source.ended); assert.equal(m.bgm.name, 'result');
  await m.syncBgm(); m.setResult('a', '/multiplayer/game/a', true);
  assert.equal(host.events.filter(e => e.type === 'bgm-start' && e.sound === 'result').length, 1);
  assert.equal(await m.play('win', { key: 'duel-result:a:verdict' }), false);
});

test('AUDIO-02: normal 8.6s start seals its scope while the 8100ms go lasts 1.3s', async () => {
  const { manager: m, advance } = await lifetimeManager();
  await advance(8.1); await m.play('go', { key: 'single-start:a:go' });
  const voice = [...m.voices][0];
  await advance(.5); m.completeScope('single-start:a', ['go']);
  assert.equal(m.context.currentTime, 8.6); assert.ok(!voice.source.stopped);
  await advance(.79); assert.ok(!voice.source.ended);
  await advance(.02); assert.ok(voice.source.ended);
  assert.equal(await m.play('tick', { key: 'single-start:a:late' }), false);
});

test('normal completion rejects pending decode even within freshness limit and never catches up after unlock', async () => {
  const { host, manager: m } = await lifetimeManager();
  m.buffers.delete(AUDIO_ASSETS.go.url);
  let release; host.fetch = () => new Promise(resolve => { release = resolve; });
  const pending = m.play('go', { key: 'single-start:loading:go' });
  m.completeScope('single-start:loading', ['go']);
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) });
  assert.equal(await pending, false); assert.equal(m.voices.size, 0);
  await m.unlock(); assert.equal(await m.play('tick', { key: 'single-start:loading:past' }), false);
});

for (const reason of ['skip', 'hidden', 'pagehide', 'route', 'mute', 'sfx-zero', 'new-sequence']) {
  test(`completed tails remain cancellable on ${reason}, with no stale replay`, async () => {
    const { host, manager: m } = await lifetimeManager();
    m.setScene('/game'); await m.play('go', { key: 'single-start:a:go' });
    const voice = [...m.voices][0]; m.completeScope('single-start:a', ['go']);
    if (reason === 'skip') m.cancelScope('single-start:a');
    else if (reason === 'route') m.setScene('/play');
    else if (reason === 'mute') m.update({ muted: true });
    else if (reason === 'sfx-zero') m.update({ sfx: 0 });
    else if (reason === 'new-sequence') m.beginScope('single-start:b');
    else { host.document.hidden = reason === 'hidden'; m.stopEffects(); }
    assert.equal(voice.source.stopped, true);
    host.document.hidden = false; m.update({ muted: false, sfx: .75 });
    assert.equal(await m.play('go', { key: 'single-start:a:go' }), false);
  });
}

test('scope completion cannot release another match and independent bus settings still apply', async () => {
  const { host, manager: m } = await lifetimeManager();
  await m.play('go', { key: 'single-start:a:go' }); host.tick(100);
  await m.play('go', { key: 'single-start:b:go' });
  m.completeScope('single-start:a', ['go']);
  assert.equal([...m.voices].filter(v => v.completedScope).length, 1);
  m.update({ bgm: .17, sfx: .43 });
  assert.equal(m.bgmBus.gain.value, .17); assert.equal(m.sfxBus.gain.value, .43);
  assert.ok([...m.voices].every(v => !v.source.stopped));
  const restored = new AudioManager(host); await restored.unlock();
  assert.equal(await restored.play('go', { key: 'single-start:a:go' }), false);
});

test('the first screen and login share one opening loop after a gesture, then yield to HOME', async () => {
  const host = fakeHost(), m = new AudioManager(host);
  m.setScene('/'); assert.ok(!m.context); await m.unlock();
  await new Promise(r => setImmediate(r));
  assert.equal(m.bgm.name, 'opening'); assert.equal(m.bgm.source.loop, true);
  const opening = m.bgm.source;
  m.setScene('/login/'); await m.syncBgm();
  assert.equal(m.bgm.source, opening);
  assert.equal(host.events.filter(e => e.type === 'bgm-start' && e.sound === 'opening').length, 1);
  m.setScene('home'); await new Promise(r => setImmediate(r));
  assert.equal(opening.stopped, true); assert.equal(m.bgm.name, 'home');
});

test('opening decode arriving after leaving login never starts in HOME, gameplay or public pages', async () => {
  for (const destination of ['home', '/game', '/guide']) {
    const host = fakeHost(), m = new AudioManager(host);
    await m.unlock();
    let release; const fetch = host.fetch;
    host.fetch = url => url === AUDIO_ASSETS.opening.url ? new Promise(r => { release = r; }) : fetch(url);
    m.setScene('/login'); m.setScene(destination);
    release({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) });
    await new Promise(r => setImmediate(r));
    assert.equal(host.events.filter(e => e.type === 'bgm-start' && e.sound === 'opening').length, 0, destination);
    if (destination === 'home') assert.equal(m.bgm.name, 'home');
  }
});

test('opening retains independent BGM/SFX settings and no late music after departure', async () => {
  const host = fakeHost(), m = new AudioManager(host);
  m.setScene('/login'); await m.unlock();
  await new Promise(r => setImmediate(r)); assert.equal(m.bgm.name, 'opening');
  m.update({ sfx: 0, bgm: .19 }); assert.equal(m.bgm.name, 'opening'); assert.equal(m.bgmBus.gain.value, .19);
  m.update({ muted: true }); assert.equal(m.bgm, null);
  m.update({ muted: false }); await new Promise(r => setImmediate(r)); assert.equal(m.bgm.name, 'opening');
  m.update({ bgm: 0, sfx: .43 }); assert.equal(m.bgm, null); assert.equal(m.sfxBus.gain.value, .43);
  m.setScene('/play'); m.update({ bgm: .28 }); await new Promise(r => setImmediate(r)); assert.equal(m.bgm, null);
});
