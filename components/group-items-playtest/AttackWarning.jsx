import React,{useEffect,useRef,useState} from "react";
import FeedbackIcon from "./FeedbackIcon.jsx";
import {useDisplayNow} from "./useDisplayNow.js";
import {warningEventDecision} from "./effectPresentation.js";
import {warningDisplay} from "./attackFeedback.js";
/** A presentation clock only: deadline and eligibility are always supplied by C. */
export default function AttackWarning({warnings=[],now=0,windowMs,running=false,readOnly=false,parryPending=false,onParry,itemPresentation={name:"먹물",icon:"ink"}}){
 const displayNow=useDisplayNow(now,running);
 if(readOnly||!warnings.length)return null;
 const ordered=[...warnings].sort((a,b)=>a.dueAt-b.dueAt);
 const multiple=ordered.length>1;
 return <div className="gip-warnings gip-attack-warnings" data-multiple={multiple} aria-label={"받은 공격 "+warnings.length+"건"}>
  <span className="gip-feedback-sr" role="status" aria-live="polite" aria-atomic="true">{ordered.map((warning,index)=>(index+1)+"번째: "+(warning.sourceLabel||"상대")+"의 "+(warning.itemName || itemPresentation.name)+" 공격. "+(warning.canParry?"패링할 수 있어요.":"지금 패링할 수 없어요.")).join(" ")}</span>
  {multiple&&<div className="gip-warning-summary">받은 공격 {warnings.length}건 <span>마감 가까운 순 · {ordered.some(warning=>warning.itemName) ? "아이템" : itemPresentation.name}</span></div>}
  <div className="gip-warning-list">{ordered.map((warning,index)=>{
   const display=warningDisplay(warning,displayNow,windowMs,{readOnly});
   const urgent=!display.expired&&display.fraction<=.25;
   const source=warning.sourceLabel||"상대";
   return <div className="gip-warning gip-attack-warning" key={warning.childId} data-child-id={warning.childId} data-remaining={Math.round(display.remainingMs)} data-fraction={display.fraction} data-expired={display.expired} data-urgent={urgent}>
    <span className="gip-attack-icon"><FeedbackIcon kind={itemPresentation.icon}/></span>
    <span className="gip-warning-copy" id={"warning-"+warning.childId}>
     <strong>{warning.itemName || itemPresentation.name} 공격</strong>
     <small>{source} → 나{multiple?" · "+(index+1)+"번째":""}</small>
     <span className="gip-warning-hint">{display.expired?"마감 · 판정 확인 중":urgent?"마감 임박":warning.canParry?"패링으로 반격하세요":"지금 패링할 수 없어요"}</span>
    </span>
    {multiple&&<span className="gip-warning-short" aria-hidden="true">{index+1}. {source}</span>}
    <button type="button" className="gip-parry gip-parry-dial" aria-label="패링" aria-describedby={"warning-"+warning.childId+" reaction-"+warning.childId} disabled={parryPending || !display.canReact} onClick={()=>onParry?.(warning)}>
     <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="gip-dial-track" cx="32" cy="32" r="28"/><circle className="gip-dial-time" cx="32" cy="32" r="28" pathLength="1" strokeDasharray="1" strokeDashoffset={1-display.fraction}/></svg>
     <span>패링</span><small id={"reaction-"+warning.childId}>{parryPending?"확인 중":display.expired?"마감":(urgent?"임박 ":"")+display.label+"초"}</small>
    </button>
   </div>;
  })}</div>
 </div>;
}
export function AttackWarningEdge({view,events=[],running=false,windowMs,tone="base"}){
 const now=useDisplayNow(view?.warningNow??view?.now??0,running),previous=useRef(new Set()),seen=useRef(new Set()),timer=useRef(null);
 const [intro,setIntro]=useState(null),[reduced,setReduced]=useState(()=>matchMedia("(prefers-reduced-motion: reduce)").matches);
 useEffect(()=>{const q=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setReduced(q.matches);q.addEventListener("change",change);return()=>q.removeEventListener("change",change);},[]);
 useEffect(()=>{setIntro(null);previous.current.clear();seen.current.clear();clearTimeout(timer.current);return()=>clearTimeout(timer.current);},[view?.viewer.id,view?.sessionId]);
 useEffect(()=>{const active=new Set((view?.warnings||[]).filter(w=>w.dueAt>(view.warningNow??view.now)).map(w=>w.childId));
  const warningView=view?{...view,now:view.warningNow??view.now}:view;
  const fresh=events.find(event=>warningEventDecision(event,warningView).ok&&!seen.current.has(event.eventId));
  for(const event of events)if(event.type==="attack_warning")seen.current.add(event.eventId);
  if(fresh&&previous.current.size===0&&!reduced&&!document.hidden){setIntro(fresh.eventId);clearTimeout(timer.current);timer.current=setTimeout(()=>setIntro(null),300);}
  previous.current=active;
 },[events,view?.warnings,reduced]);
 const active=(view?.warnings||[]).filter(w=>w.dueAt>now);
 if(!view||view.viewer.readOnly||!active.length)return null;
 const urgency=1-Math.min(...active.map(w=>warningDisplay(w,now,windowMs).fraction));
 return <div className="gip-attack-edge gip-attack-edge-coral" data-intro={intro?"true":"false"} data-intro-event={intro||undefined} data-warning-count={active.length} data-tone={tone} data-urgency={urgency.toFixed(3)} style={{"--gip-warning-strength":tone==="strong"?.42+urgency*.38:.28+urgency*.34}} aria-hidden="true"><i className="gip-attack-edge-breath"/></div>;
}
