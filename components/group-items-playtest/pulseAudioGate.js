/** A presentation-only freshness limit; never decides attack timing or effect lifetime. */
export const INK_AUDIO_MAX_LATENESS_MS=150;
export const INK_AUDIO_SEGMENTS=Object.freeze([0,.62,1.24].map(offset=>Object.freeze({offset,duration:.16})));
export function inkPulseLateness(event,view){
 return event.presentationAt===undefined ? view.now-event.at : view.presentationNow-event.presentationAt;
}
export function createPulseAudioGate(segments=INK_AUDIO_SEGMENTS){
 const eventKeys=new Set(),pulseKeys=new Set();
 return {clear(){eventKeys.clear();pulseKeys.clear();},claim(event,view,{hidden=false}={}){
  if(!view||view.viewer?.mode!=="participant"||view.viewer.readOnly||hidden)return {ok:false,code:"READ_ONLY_OR_HIDDEN"};
  if(event?.type!=="ink_pulse"||event.suppressed||event.recipientId!==view.viewer.id||!Number.isInteger(event.pulseIndex)||event.pulseIndex<0||event.pulseIndex>2||typeof event.eventId!=="string")return {ok:false,code:"SUPPRESSED_OR_INVALID"};
  const effect=view.effects?.find(row=>row.effectId===event.effectId&&row.kind==="ink");
  const lateness=inkPulseLateness(event,view);
  if(!effect||effect.pulseTimes?.[event.pulseIndex]!==event.at||view.now<effect.startsAt||view.now>=effect.expiresAt
    ||(event.presentationAt!==undefined&&effect.presentationPulseTimes?.[event.pulseIndex]!==event.presentationAt)
    ||!Number.isFinite(lateness)||lateness<0||lateness>INK_AUDIO_MAX_LATENESS_MS)return {ok:false,code:"STALE_OR_EXPIRED"};
  const eventKey=view.sessionId+":"+event.eventId,pulseKey=view.sessionId+":"+event.effectId+":"+event.pulseIndex;
  if(eventKeys.has(eventKey)||pulseKeys.has(pulseKey))return {ok:false,code:"DUPLICATE"};
  eventKeys.add(eventKey);pulseKeys.add(pulseKey);return {ok:true,key:pulseKey,segment:segments[event.pulseIndex]};
 }};
}
