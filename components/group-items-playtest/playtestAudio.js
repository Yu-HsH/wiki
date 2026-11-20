import {AUDIO_ASSETS} from "../../services/audioAssets.js";
import {createPulseAudioGate} from "./pulseAudioGate.js";
/** Opt-in fixture audio. Original WAV/catalog remain unchanged; no product manager/storage. */
export function createPlaytestAudio(host,{inkAsset=AUDIO_ASSETS.ink,inkSegments}={}){
 let disposed=false,enabled=false,context=null,buffer=null,ready="idle",loading=null,destination=null,recorder=null,recording=false,recordingSilence=null,lastVoiceEnd=0;
 const played=new Set(),active=new Set(),gate=createPulseAudioGate(inkSegments),records=[];
 const record=row=>{records.push({...row,observedAt:host?.performance?.now?.()??0});if(records.length>256)records.shift();};
 const stop=()=>{for(const voice of active){try{voice.stop?voice.stop():voice.pause();}catch{} }active.clear();};
 const prepare=()=>{
  if(disposed)return Promise.resolve(false);
  if(loading)return loading;
  const Context=host?.AudioContext||host?.webkitAudioContext;
  if(!Context||!host?.fetch||!inkAsset){ready="unsupported";return Promise.resolve(false);}
  try{context=new Context();destination=context.createMediaStreamDestination();ready="loading";
   loading=host.fetch(inkAsset.url).then(response=>{if(!response.ok)throw Error("INK_AUDIO_LOAD_FAILED");return response.arrayBuffer();}).then(bytes=>{if(disposed)return null;return context.decodeAudioData(bytes);}).then(value=>{if(disposed||!value)return false;buffer=value;ready="ready";return true;}).catch(()=>{if(!disposed)ready="failed";return false;});
  }catch{ready="failed";loading=Promise.resolve(false);}return loading;
 };
 const api={
  enable(value){if(disposed)return false;enabled=Boolean(value);if(!enabled)stop();else{prepare();context?.resume?.().catch(()=>{});}return enabled;},stop,
  clearView(){stop();records.length=0;},
  resetRun(){stop();records.length=0;played.clear();gate.clear();},
  dispose(){disposed=true;enabled=false;ready="disposed";stop();if(recording){recorder.stop();recording=false;}for(const track of destination?.stream?.getTracks?.()||[])track.stop();recordingSilence?.source.stop();recordingSilence?.source.disconnect();recordingSilence?.gain.disconnect();recordingSilence=null;context?.close?.();buffer=null;},
  inspect(){return {enabled,ready,contextState:context?.state||null,contextTime:context?.currentTime??null,recording,records:records.map(row=>({...row}))};},
  playPulse(event,view,options){
   const decision=gate.claim(event,view,options);
   const info={type:"ink_pulse",eventId:event?.eventId,effectId:event?.effectId,pulseIndex:event?.pulseIndex,eventAt:event?.at,
    presentationAt:event?.presentationAt,modelNow:view?.now,presentationNow:view?.presentationNow};
   if(!decision.ok){record({...info,status:"gate_rejected",reason:decision.code});return false;}
   if(!enabled||ready!=="ready"||context?.state!=="running"){record({...info,status:!enabled?"disabled":"not_ready"});return false;}
   const voice=context.createBufferSource(),gain=context.createGain(),start=context.currentTime;
   voice.buffer=buffer;voice.connect(gain);gain.connect(context.destination);gain.connect(destination);
   const volume=Math.min(.65,inkAsset.volume??.5),duration=decision.segment.duration;
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.004);gain.gain.setValueAtTime(volume,start+duration-.012);gain.gain.linearRampToValueAtTime(0,start+duration);
   active.add(voice);voice.onended=()=>{active.delete(voice);voice.disconnect();gain.disconnect();};
   voice.start(start,decision.segment.offset,duration);lastVoiceEnd=start+duration;
   record({...info,status:"played",contextTime:start,offset:decision.segment.offset,duration});return true;
  },
  play(key,kind){
   if(kind==="ink"||!enabled||played.has(key)||!host?.Audio)return false;
   const asset=AUDIO_ASSETS[kind];if(!asset||!asset.url.startsWith("/audio/"))return false;
   const voice=new host.Audio(asset.url);voice.volume=Math.min(.65,asset.volume??.5);voice.playbackRate=asset.rate??1;
   played.add(key);active.add(voice);voice.onended=()=>active.delete(voice);
   Promise.resolve(voice.play()).catch(()=>active.delete(voice));return true;
  },
  async startRecording(){
   if(!enabled||!await prepare()||disposed||!enabled||!host?.MediaRecorder||recording)return {ok:false,code:"AUDIO_CAPTURE_UNAVAILABLE"};
   await context.resume();const mime="audio/webm;codecs=opus";
   if(!host.MediaRecorder.isTypeSupported(mime))return {ok:false,code:"AUDIO_CAPTURE_UNAVAILABLE"};
   // Keep the recorder clock continuous through silence; this zero-gain source never reaches speakers.
   const source=context.createConstantSource(),gain=context.createGain();gain.gain.value=0;source.connect(gain);gain.connect(destination);source.start();recordingSilence={source,gain};
   const chunks=[];recorder=new host.MediaRecorder(destination.stream,{mimeType:mime});recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.savedChunks=chunks;recorder.start();recording=true;return {ok:true};
  },
  async stopRecording(){
   if(!recorder||!recording||disposed)return {ok:false,code:"NOT_RECORDING"};
   const current=recorder,deadline=Date.now()+2000;
   while(!disposed&&context.state==="running"&&Date.now()<deadline&&(active.size>0||context.currentTime<lastVoiceEnd))await new Promise(resolve=>setTimeout(resolve,20));
   await new Promise(resolve=>setTimeout(resolve,150));
   if(disposed||current.state!=="recording")return {ok:false,code:"RECORDING_ENDED"};
   return new Promise(resolve=>{current.onstop=()=>{recording=false;recordingSilence?.source.stop();recordingSilence?.source.disconnect();recordingSilence?.gain.disconnect();recordingSilence=null;resolve({ok:true,blob:new Blob(current.savedChunks,{type:current.mimeType})});};current.stop();});
  }
 };
 return api;
}
