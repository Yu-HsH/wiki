import React, { useLayoutEffect, useRef } from 'react';
import { finalIconUrl } from './finalAssetEvents.js';
import './finalExtraMotion.css';

const rouletteMessages={
  'roulette-win':'성공! 아이템 지급',
  'roulette-fail':'실패! 약화 페널티',
  'roulette-boost':'강화 성공! 특별 효과',
};
const thiefMessages={
  'thief-steal':'아이템 획득!',
  'thief-empty':'대상 아이템 없음',
  'thief-loss':'아이템을 빼앗겼어요',
};
const bolt='74,1 23,53 48,53 30,107 82,42 58,42 74,1';
const currentPaths=[
  'M0 21 51 12 84 27 137 11 163 20 219 12 259 26 309 15 353 23 400 12 452 21 488 11 524 21 577 12 624 23 675 12 711 20 758 10 815 25 858 13 895 24 942 11 1000 21',
  'M17 0 26 61 13 95 29 147 16 198 26 243 12 284 24 325 14 373 29 428 18 467 25 510 12 560',
  'M1000 541 951 548 902 531 858 550 808 538 752 549 707 530 667 548 621 534 564 546 523 536 477 550 426 535 381 547 325 535 274 548 235 536 185 551 135 537 90 550 47 533 0 541',
  'M983 560 973 513 987 467 971 427 984 385 971 334 985 286 974 242 987 192 972 144 984 99 971 54 984 0',
];

function itemImage(itemId, tier, className) {
  const src=finalIconUrl(itemId,tier);
  return src ? <img className={className} src={src} alt="" draggable={false}/> : null;
}

function ThunderCurrent() {
  return <span className="s5x-current" data-item-vfx="thunder-stun">
    <svg viewBox="0 0 1000 560" preserveAspectRatio="none" focusable="false">
      {currentPaths.map((path,index)=><path key={path} className={index%2 ? 's5x-current-alt' : undefined} d={path} vectorEffect="non-scaling-stroke"/>) }
    </svg>
  </span>;
}

function ThunderStrike({ kind }) {
  return <>
    <div className="s5x-cloud"><i/><i/><i/></div>
    <svg className="s5x-bolt" viewBox="0 0 96 110" focusable="false"><polygon points={bolt}/></svg>
    {kind==='thunder-guard'
      ? <div className="s5x-thunder-shield">{itemImage('shield')}</div>
      : <div className="s5x-thunder-ring"/>}
  </>;
}

function LostSign({ arrived, eventKey }) {
  const rotor=useRef(null);
  const motion=useRef([]);
  useLayoutEffect(()=>{
    const node=rotor.current;
    if (!node?.animate) return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    function updateMotion() {
      const transform=getComputedStyle(node).transform;
      const matrix=transform==='none' ? null : new DOMMatrixReadOnly(transform);
      const angle=matrix ? Math.atan2(matrix.m31,matrix.m11)*180/Math.PI : 0;
      for (const running of motion.current) running.cancel();
      motion.current=[];
      if (reduced.matches) return;
      const frame=(value,offset)=>({transform:`rotateY(${value}deg)`,offset});
      if (arrived) {
        const stop=Math.ceil((angle+66)/360)*360-32;
        motion.current=[node.animate([frame(angle,0),frame(stop+12,.75),frame(stop-5,.89),frame(stop,1)],
          {duration:360,easing:'cubic-bezier(.13,.68,.21,1)',fill:'forwards'})];
        return;
      }
      // The preview accelerates from 750 to 1710 degrees/s over 300ms. Only the boards rotate.
      motion.current=[node.animate([frame(0,0),frame(65,.25),frame(149,.5),frame(251,.75),frame(369,1)],
        {duration:300,fill:'forwards'}),node.animate([frame(369,0),frame(729,1)],
        {delay:300,duration:360000/1710,iterations:Infinity})];
    }
    updateMotion();
    reduced.addEventListener('change',updateMotion);
    return ()=>reduced.removeEventListener('change',updateMotion);
  },[arrived,eventKey]);
  useLayoutEffect(()=>()=>{
    for (const running of motion.current) running.cancel();
  },[]);

  return <div className="s5x-effect s5x-lost" data-item-vfx={arrived?'lost-arrive':'lost-active'}>
    <div className="s5x-sign">
      <i className="s5x-sign-streak"/>
      <i className="s5x-sign-pole"/>
      <div className="s5x-sign-rotor" ref={rotor}><b>←</b><b>→</b></div>
      <i className="s5x-sign-hub"/>
    </div>
    {arrived && <><i className="s5x-sign-impact"/><b className="s5x-sign-arrival">도착!</b></>}
  </div>;
}

function Roulette({ kind }) {
  return <><i className="s5x-roulette-wheel"/><i className="s5x-roulette-pointer"/>
    <b className="s5x-outcome s5x-roulette-result">{rouletteMessages[kind]}</b></>;
}

function Thief({ scene }) {
  const item=itemImage(scene.itemId,scene.itemTier);
  return <><i className="s5x-thief-streak"/>
    <span className="s5x-thief-item">{item??'—'}</span>
    {itemImage('thief',null,'s5x-thief-hand')}
    <b className="s5x-outcome s5x-thief-result">{thiefMessages[scene.kind]}</b></>;
}

function Cannon({ arrived }) {
  return <>
    <div className="s5x-cannon-portal"/>
    {arrived ? <><i className="s5x-cannon-land-burst"/><b className="s5x-outcome s5x-cannon-status">도착!</b></> :
      <>{itemImage('cannon',null,'s5x-cannon-gun')}<i className="s5x-cannon-muzzle"/><i className="s5x-cannon-orb"/></>}
  </>;
}

function Modifier({ weak }) {
  return <><i className="s5x-modifier-sparks"/><i className="s5x-modifier-beam"/>
    {itemImage(weak?'weakening':'enhancement',null,'s5x-modifier-scroll')}
    <b className="s5x-modifier-badge">{weak?'↓':'↑'}</b></>;
}

function ExtraScene({ scene }) {
  const kind=scene.kind;
  if (Object.hasOwn(rouletteMessages,kind)) return <Roulette kind={kind}/>;
  if (Object.hasOwn(thiefMessages,kind)) return <Thief scene={scene}/>;
  switch (kind) {
    case 'thunder-hit': case 'thunder-self': case 'thunder-guard': return <ThunderStrike kind={kind}/>;
    case 'cannon-fire': case 'cannon-arrive': return <Cannon arrived={kind==='cannon-arrive'}/>;
    case 'enhancement': case 'weakening': return <Modifier weak={kind==='weakening'}/>;
    case 'bookmark-save': return <><i className="s5x-bookmark-pin"/><i className="s5x-bookmark-ribbon">★</i></>;
    case 'bookmark-return': case 'undo': return <><i className="s5x-bookmark-leaf"/><b className="s5x-back-arrow">↶</b></>;
    case 'search': return <i className="s5x-search-radar"/>;
    case 'links': return <><i className="s5x-link-spark"/><div className="s5x-link-gather"><i>↗</i><i>↗</i><i>↗</i></div></>;
    default: return null;
  }
}

const extraKinds=new Set([
  ...Object.keys(rouletteMessages),...Object.keys(thiefMessages),'thunder-hit','thunder-self','thunder-guard',
  'cannon-fire','cannon-arrive','enhancement','weakening','bookmark-save','bookmark-return','undo','search','links',
]);

export function FinalExtraMotion({ scene,thunder=false,lost=false }) {
  const arrived=scene?.kind==='lost-arrive';
  return <>
    {thunder && <ThunderCurrent/>}
    {(lost || arrived) && <LostSign arrived={arrived} eventKey={arrived?scene.key:null}/>}
    {extraKinds.has(scene?.kind) && <div className="s5x-effect" key={`${scene.kind}:${scene.key}`} data-item-vfx={scene.kind}>
      <ExtraScene scene={scene}/>
    </div>}
  </>;
}
