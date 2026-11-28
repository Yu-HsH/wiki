import {useEffect,useRef,useState} from "react";
/** Smooth presentation clock, never dispatches or settles a C command. */
export function useDisplayNow(now=0,running=false,sampledAt){
 const anchor=useRef({now,at:performance.now()}),[display,setDisplay]=useState(now);
 useEffect(()=>{
  const current=performance.now();
  anchor.current={now,at:sampledAt??current};
  setDisplay(now+Math.max(0,current-anchor.current.at));
 },[now,running,sampledAt]);
 useEffect(()=>{if(!running)return;let frame;const step=()=>{setDisplay(anchor.current.now+performance.now()-anchor.current.at);frame=requestAnimationFrame(step);};frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame);},[running]);
 return display;
}
