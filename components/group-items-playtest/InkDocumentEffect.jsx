import React,{useEffect,useState} from "react";
import {resolveInkArt} from "./inkArtManifest.js";
import InkArtSlot from "./InkArtSlot.jsx";
/** C supplies the visible count. Wiping affects this local view only. */
export default function InkDocumentEffect({pulse=null,hiddenSlots=[],artManifest,artResolver=resolveInkArt,impactEvents=null,staticFallback=false,artMode="legacy",visualOpacity=1,inkLayout="original"}){
 const [reduced,setReduced]=useState(()=>globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches??false);
 useEffect(()=>{const query=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setReduced(query.matches);query.addEventListener("change",change);return()=>query.removeEventListener("change",change);},[]);
 if(!pulse)return null;
 return <div className="gip-ink" data-art-mode={artMode} data-ink-layout={inkLayout} style={{opacity:visualOpacity}} data-visual-opacity={visualOpacity} data-pulse={pulse.index} data-tier={pulse.tier} data-effect-id={pulse.effectId} aria-label={`먹물 ${pulse.index}개`} role="img">
  {Array.from({length:pulse.index},(_,index)=><InkArtSlot key={pulse.effectId+":"+index} index={index} staticFallback={staticFallback} asset={artResolver(pulse.tier,index,artManifest)} reduced={reduced} impactEventId={impactEvents?.[index]} animate={impactEvents?Boolean(impactEvents[index]):pulse.animate&&index===pulse.index-1} hidden={hiddenSlots.includes(pulse.effectId+":"+index)}/>)}
  <span className="gip-ink-label">먹물 · {pulse.index}/3</span>
 </div>;
}
