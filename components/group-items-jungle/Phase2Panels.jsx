import React,{useEffect,useState}from'react';
import{itemName,tierLabel}from'./s5UiContract.js';
import{remainingTime}from'./countdown.js';
import{FinalItemIcon}from'./FinalAssetVfx.jsx';
export function Phase2Rewards({state,now,inventory,disabled,onAct}){
 const offers=state.jokerOffers.flatMap(o=>o.candidates).filter(c=>Date.parse(c.expiresAt)>now).sort((a,b)=>a.sequence-b.sequence);
 if(!offers.length)return null;const head=offers[0],free=inventory.length<2;
 return <section className="s5-phase2-rewards" aria-label="임시 보상함">
  <h3>임시 보상함 · {offers.length}개</h3>
  <p>먼저 받은 보상부터 선택해 주세요. {Math.max(0,Math.ceil((Date.parse(head.expiresAt)-now)/1000))}초 남음</p>
  <p className="item-race-reward"><FinalItemIcon item={{itemId:head.itemId,effectiveTier:head.tier}}/>
   {[tierLabel(head.tier),itemName(head.itemId)].filter(Boolean).join(' ')}</p>
  {free&&<button type="button" disabled={disabled} onClick={()=>onAct('reward_claim',{candidateId:head.candidateId})}>보상 받기</button>}
  {inventory.map(g=><button type="button" key={g.grantId} disabled={disabled} onClick={()=>onAct('reward_claim',{candidateId:head.candidateId,replaceGrantId:g.grantId})}>
   {itemName(g.itemId)} 대신 받기
  </button>)}
  <button type="button" disabled={disabled} onClick={()=>onAct('reward_discard',{candidateId:head.candidateId})}>보상 포기</button>
  {offers.length>1&&<ol aria-label="대기 보상 순서">{offers.slice(1).map(c=><li key={c.candidateId}>{itemName(c.itemId)}</li>)}</ol>}
 </section>;
}
export function Phase2Countdown({lifecycle,serverObservedAt}){
 const [anchor,setAnchor]=useState(()=>({server:Date.parse(serverObservedAt),local:performance.now()})),[elapsed,setElapsed]=useState(0);
 useEffect(()=>{setAnchor({server:Date.parse(serverObservedAt),local:performance.now()});setElapsed(0);},[serverObservedAt]);
 useEffect(()=>{const id=setInterval(()=>setElapsed(performance.now()-anchor.local),250);return()=>clearInterval(id);},[anchor]);
 const remaining=remainingTime(lifecycle,anchor.server,elapsed);if(!remaining)return null;
 const {end,seconds,grace}=remaining,clock=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 return <section className="s5-phase2-countdown" aria-label="아이템전 경기 기한" data-server-end-at={new Date(end).toISOString()}>
  <span>{grace?'세 번째 완주 후 유예':'전체 경기'}</span><strong aria-label="종료까지 남은 시간">{clock}</strong>
 </section>;
}
