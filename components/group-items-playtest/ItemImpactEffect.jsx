import React,{useEffect,useLayoutEffect,useRef,useState} from "react";
import InkDocumentEffect from "./InkDocumentEffect.jsx";
import {INK_USER_ART_MANIFEST,resolveInkUserArt} from "./inkUserArtManifest.js";
import {INK_WEBP_ART_MANIFEST,resolveInkWebpArt} from "./inkWebpArtManifest.js";
import {INK_PREVIEW_URLS} from "./inkPreviewUrls.js";
import {preloadInkImage,preloadInkTier} from "./inkImageCache.js";
import {inkVisualOpacity} from "./effectPresentation.js";
import {useDisplayNow} from "./useDisplayNow.js";
import {INK_AUDIO_MAX_LATENESS_MS,inkPulseLateness} from "./pulseAudioGate.js";
import {resolveFeedbackArt} from "./feedbackArtManifest.js";
/** Animation follows fresh C pulse events; it never creates pulses or changes expiry. */
export default function ItemImpactEffect({pulse,events=[],view,artMode="webp",activeTier="normal",running=false,hiddenSlots=[],inkLayout="original"}){
 const displayNow=useDisplayNow(view?.now??0,running);
 const effect=view?.effects?.find(row=>row.effectId===pulse?.effectId);
 const rasterManifest=artMode==="png"?INK_USER_ART_MANIFEST:artMode==="webp"?INK_WEBP_ART_MANIFEST:null;
 const resolver=artMode==="png"?resolveInkUserArt:artMode==="webp"?resolveInkWebpArt:artMode==="svg"?resolveFeedbackArt:undefined;
 useEffect(()=>{if(rasterManifest)for(const url of Object.values(INK_PREVIEW_URLS).flat())preloadInkImage(url);},[rasterManifest]);
 useEffect(()=>{if(rasterManifest)preloadInkTier(pulse?.tier||activeTier,rasterManifest);},[rasterManifest,pulse?.tier,activeTier]);
 const [flights,setFlights]=useState([]),seen=useRef(new Set()),timers=useRef(new Set());
 const [reduced,setReduced]=useState(()=>matchMedia("(prefers-reduced-motion: reduce)").matches);
 useEffect(()=>{const q=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setReduced(q.matches);q.addEventListener("change",change);return()=>q.removeEventListener("change",change);},[]);
 useLayoutEffect(()=>{setFlights([]);seen.current.clear();for(const t of timers.current)clearTimeout(t);timers.current.clear();return()=>{for(const t of timers.current)clearTimeout(t);};},[view?.viewer?.id,view?.sessionId,pulse?.effectId,pulse?.static]);
 // Claim and mount fresh pulses before the browser paints the full-size slot.
 useLayoutEffect(()=>{if(reduced||!pulse||pulse.static||view?.viewer.readOnly||document.hidden)return;
  for(const event of events){
   if(event.type!=="ink_pulse"||event.suppressed||event.recipientId!==view.viewer.id||event.effectId!==pulse.effectId||seen.current.has(event.eventId))continue;
   const lateness=inkPulseLateness(event,view);
   if(!Number.isFinite(lateness)||lateness<0||lateness>INK_AUDIO_MAX_LATENESS_MS)continue;
   seen.current.add(event.eventId);setFlights(rows=>[...rows,{id:event.eventId,index:event.pulseIndex,artMode}]);const timer=setTimeout(()=>{setFlights(rows=>rows.filter(row=>row.id!==event.eventId));timers.current.delete(timer);},460);timers.current.add(timer);
  }
 },[events,view?.now,reduced,pulse?.effectId]);
 const currentFlights=flights.filter(row=>row.artMode===artMode);
 const opacity=inkVisualOpacity(effect,displayNow,{reduced,staticMode:!running||pulse?.static});
 return <><InkDocumentEffect staticFallback artMode={artMode} inkLayout={inkLayout} visualOpacity={opacity} pulse={pulse} hiddenSlots={hiddenSlots} artResolver={resolver} impactEvents={Object.fromEntries(currentFlights.map(row=>[row.index,row.id]))}/>{pulse&&!reduced&&!rasterManifest&&<div className="gip-impact-motion" data-art-mode={artMode} data-ink-layout={inkLayout} data-tier={pulse.tier} aria-hidden="true">{currentFlights.map(flight=><span key={flight.id} className="gip-flight-group" data-index={flight.index+1} data-event-id={flight.id}><i className="gip-flight-drop"/><i className="gip-impact-ring"/></span>)}</div>}</>;
}
