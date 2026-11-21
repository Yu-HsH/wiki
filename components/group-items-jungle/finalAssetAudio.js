import { FINAL_ASSET_ROOT } from './finalAssetEvents.js';

const selectedAudioRoot=FINAL_ASSET_ROOT+'audio/selected/';
const inkUrl=selectedAudioRoot+'ink_blind/three_splashes.wav';

// Browser output only. A recovery can resume an active loop, never a historical one-shot.
export function createFinalAssetAudio(host,{stunLoopUrl=null}={}) {
  let enabled=false, volume=.65, stopped=false, activeLoop=null;
  let preparedInk=null;
  const playing=new Set();
  const muted=()=>!enabled || !volume || stopped || host.document?.hidden;

  function prepareInk() {
    if (!enabled || preparedInk || !host.Audio) return;
    preparedInk=new host.Audio(inkUrl);
    preparedInk.preload='auto';
  }
  function stopVoice(voice) {
    if (!voice) return;
    voice.pause();
    playing.delete(voice);
  }
  function stop() {
    for (const voice of playing) stopVoice(voice);
    if (activeLoop) stopVoice(activeLoop.voice);
    activeLoop=null;
  }
  function voice(url,loop=false) {
    if (muted() || !host.Audio) return null;
    const reuse=url===inkUrl && preparedInk && !playing.has(preparedInk);
    const output=reuse ? preparedInk : new host.Audio(url);
    if (reuse) output.currentTime=0;
    output.loop=loop;
    output.volume=volume;
    playing.add(output);
    output.onended=()=>playing.delete(output);
    const failed=()=>{
      playing.delete(output);
      if (activeLoop?.voice===output) activeLoop=null;
    };
    output.onerror=failed;
    try { Promise.resolve(output.play()).catch(failed); }
    catch { failed(); return null; }
    return output;
  }
  function visibility() { if (host.document?.hidden) stop(); }
  host.document?.addEventListener('visibilitychange',visibility);
  return {
    enable(value) {
      enabled=Boolean(value);
      if (enabled) prepareInk();
      else stop();
    },
    setVolume(value) {
      volume=Number.isFinite(value) ? Math.min(1,Math.max(0,value)) : .65;
      if (!volume) stop();
      else for (const output of playing) output.volume=volume;
    },
    play(asset) {
      if (typeof asset!=='string' || !/^[a-z_]+\/[a-z_]+$/.test(asset)
        || ['link_censor/apply','thief_hand/laugh_layer','thunder_judgment/stun_loop'].includes(asset)) return;
      voice(selectedAudioRoot+asset+'.wav');
    },
    stun(effectId) {
      if (activeLoop?.id===effectId && !muted()) return;
      if (activeLoop) stopVoice(activeLoop.voice);
      activeLoop=null;
      if (effectId && stunLoopUrl && !muted()) {
        const loop=voice(stunLoopUrl,true);
        if (loop) activeLoop={id:effectId,voice:loop};
      }
    },
    stop,
    dispose() {
      stopped=true;
      stop();
      preparedInk=null;
      host.document?.removeEventListener('visibilitychange',visibility);
    },
  };
}
