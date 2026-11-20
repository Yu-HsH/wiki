import React, { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { inkVisualOpacity } from '../group-items-playtest/effectPresentation.js';
import { FINAL_ASSET_ROOT,finalInkPlacement,finalIconUrl } from './finalAssetEvents.js';
import { FinalPriorityMotion } from './FinalPriorityMotion.jsx';
import { FinalExtraMotion } from './FinalExtraMotion.jsx';
import './finalAssetVfx.css';

const inkPng=[1,2,3].map(i=>FINAL_ASSET_ROOT+`vfx/ink/ink_jungle_${i}.png`);

export function preloadFinalInk() {
  for (const src of inkPng) new Image().src=src;
}

export function FinalItemIcon({item}) {
  const url=finalIconUrl(item?.itemId,item?.effectiveTier ?? item?.baseTier);
  return url ? <img className="s5-final-slot-icon" width="26" height="26" src={url} alt="" draggable={false}/> : null;
}

export function FinalInkVfx({pulse,frame}) {
  const layer=useRef(null);
  const [bounds,setBounds]=useState(null);
  useEffect(()=>{
    const node=layer.current;
    if (!node) return;
    const resize=()=>setBounds([node.clientWidth,node.clientHeight]);
    resize();
    if (typeof ResizeObserver!=='function') return;
    const observer=new ResizeObserver(resize);
    observer.observe(node);
    return ()=>observer.disconnect();
  },[Boolean(pulse)]);
  if (!pulse) return null;
  const effect=frame.view.effects.find(row=>row.effectId===pulse.effectId);
  const placements=bounds ? finalInkPlacement(pulse.effectId,...bounds) : [];
  const opacity=inkVisualOpacity(effect,frame.now,{staticMode:pulse.static});
  return <div ref={layer} className="s5-final-ink" data-item-vfx="ink-v5" data-effect-id={pulse.effectId} data-tier={pulse.tier}
    data-recovered={pulse.static} data-pulse={pulse.index} style={{opacity}} role="img" aria-label={`먹물 ${pulse.index}개`}>
    <i className="s5-final-ink-shade" aria-hidden="true"/>
    {placements.slice(0,pulse.index).map((style,index)=><React.Fragment key={`${pulse.effectId}:${index}`}>
      <img className="s5-final-ink-splash" data-ink-strike={index+1} src={inkPng[index]} style={style} alt="" draggable={false}/>
      {!pulse.static && <i className="s5-final-ink-impact" style={{
        left:style.left+style.width*.5,top:style.top+style.width*.48,width:Math.min(125,style.width*.9),
      }} aria-hidden="true"/>}
    </React.Fragment>)}
  </div>;
}

export function FinalItemMotion({value}) {
  if (!value) return null;
  const {scene,shieldActive,thunder,lost}=value;
  return <div className="s5-final-motion" aria-hidden="true">
    <FinalPriorityMotion scene={scene} shieldActive={shieldActive}/>
    <FinalExtraMotion scene={scene} thunder={thunder} lost={lost}/>
  </div>;
}

export function FinalAssetOverlay({value,pulse,frame}) {
  const overlay=useRef(null);
  const [bounds,setBounds]=useState(null);
  useLayoutEffect(()=>{
    const article=overlay.current.parentElement;
    const shell=article.closest('.wr-race-shell');
    const header=shell?.querySelector('.wr-race-hud');
    const dock=shell?.querySelector('[data-s5-sticky-dock]');
    let pending=null;
    function measure() {
      pending=null;
      const rect=article.getBoundingClientRect();
      const left=Math.max(0,rect.left), top=Math.max(0,rect.top,header?.getBoundingClientRect().bottom??0);
      const width=Math.max(0,Math.min(innerWidth,rect.right)-left);
      const height=Math.max(0,Math.min(innerHeight,rect.bottom,dock?.getBoundingClientRect().top??innerHeight)-top);
      setBounds(previous=>previous?.left===left && previous.top===top && previous.width===width && previous.height===height
        ? previous : {left,top,width,height});
    }
    function queueMeasure() {
      if (pending===null) pending=requestAnimationFrame(measure);
    }
    const size=typeof ResizeObserver==='function' ? new ResizeObserver(queueMeasure) : null;
    size?.observe(article);
    if (header) size?.observe(header);
    if (dock) size?.observe(dock);
    window.addEventListener('scroll',queueMeasure,{passive:true,capture:true});
    window.addEventListener('resize',queueMeasure);
    measure();
    return ()=>{
      if (pending!==null) cancelAnimationFrame(pending);
      size?.disconnect();
      window.removeEventListener('scroll',queueMeasure,true);
      window.removeEventListener('resize',queueMeasure);
    };
  },[]);
  return <div className="s5-final-viewport" ref={overlay} style={bounds??undefined}>
    {bounds && <>
      <FinalInkVfx pulse={pulse} frame={frame}/>
      <FinalItemMotion value={value}/>
    </>}
  </div>;
}
