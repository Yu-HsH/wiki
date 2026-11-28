import React, { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { inkVisualOpacity } from '../group-items-playtest/effectPresentation.js';
import { FINAL_ASSET_ROOT,finalInkPlacement,finalIconUrl } from './finalAssetEvents.js';
import { FinalPriorityMotion } from './FinalPriorityMotion.jsx';
import { FinalExtraMotion } from './FinalExtraMotion.jsx';
import FinalAttackMotion from './FinalAttackMotion.jsx';
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
  const {scenes=[],shieldActive,thunder,lost}=value;
  const movement = scenes.filter(scene => scene.kind === 'lost-arrive').at(-1);
  return <div className="s5-final-motion" aria-hidden="true">
    <FinalPriorityMotion shieldActive={shieldActive}/>
    <FinalExtraMotion scene={movement} thunder={thunder} lost={lost}/>
    {scenes.filter(scene=>scene.kind!=='lost-arrive').map(scene=><React.Fragment key={scene.key}>
      <FinalPriorityMotion scene={scene}/>
      <FinalExtraMotion scene={scene}/>
      {scene.kind.startsWith('attack-') && <FinalAttackMotion scene={scene}/>}
    </React.Fragment>)}
  </div>;
}

export function FinalAssetOverlay({value,pulse,frame,children}) {
  const anchor=useRef(null);
  const [bounds,setBounds]=useState(null);
  useLayoutEffect(()=>{
    const article=anchor.current.parentElement;
    const shell=article.closest('.wr-race-shell');
    const header=shell?.querySelector('.wr-race-hud');
    const dock=shell?.querySelector('[data-item-race-dock], [data-s5-sticky-dock]');
    const viewport=window.visualViewport;
    let pending=null, outline=null;
    function measure() {
      pending=null;
      const rect=article.getBoundingClientRect();
      const x=viewport?.offsetLeft??0, y=viewport?.offsetTop??0;
      const right=x+(viewport?.width??window.innerWidth), bottom=y+(viewport?.height??window.innerHeight);
      const left=Math.max(x,rect.left);
      const top=Math.max(y,rect.top,header?.getBoundingClientRect().bottom??y);
      const width=Math.max(0,Math.min(right,rect.right)-left);
      const dockBounds=dock?.getBoundingClientRect();
      const nav=article.querySelector('.wiki-nav-rail');
      if (outline!==nav) {
        if (outline) size?.unobserve(outline);
        if (nav) size?.observe(nav);
        outline=nav;
      }
      const navBounds=nav?.getBoundingClientRect();
      const navTop=navBounds?.height && navBounds.width>=width*.45 && getComputedStyle(nav).position==='fixed'
        ? navBounds.top : bottom;
      const height=Math.max(0,Math.min(bottom,rect.bottom,dockBounds?.height ? dockBounds.top : bottom,navTop)-top);
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
    viewport?.addEventListener('resize',queueMeasure);
    viewport?.addEventListener('scroll',queueMeasure);
    measure();
    return ()=>{
      if (pending!==null) cancelAnimationFrame(pending);
      size?.disconnect();
      window.removeEventListener('scroll',queueMeasure,true);
      window.removeEventListener('resize',queueMeasure);
      viewport?.removeEventListener('resize',queueMeasure);
      viewport?.removeEventListener('scroll',queueMeasure);
    };
  },[]);
  const documentMotion = value?.scenes?.map(scene=>scene.kind).join(' ');
  return <><span hidden ref={anchor} data-item-document-motion={documentMotion || undefined}/>
    {bounds && createPortal(<div className="s5-final-viewport" style={bounds}>
      {children}
      <FinalInkVfx pulse={pulse} frame={frame}/>
      <FinalItemMotion value={value}/>
    </div>, document.body)}
  </>;
}
