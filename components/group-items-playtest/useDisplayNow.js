import {useEffect,useRef,useState} from "react";
/** Smooth presentation clock, never dispatches or settles a C command. */
export function useDisplayNow(now=0,running=false){
 const anchor=useRef({now,at:performance.now()}),[display,setDisplay]=useState(now);
 useEffect(()=>{anchor.current={now,at:performance.now()};setDisplay(now);},[now,running]);
 useEffect(()=>{if(!running)return;let frame;const step=()=>{setDisplay(anchor.current.now+performance.now()-anchor.current.at);frame=requestAnimationFrame(step);};frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame);},[running]);
 return display;
}
