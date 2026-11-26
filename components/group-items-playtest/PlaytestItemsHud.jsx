import AttackWarning from "./AttackWarning.jsx";
import React,{useEffect,useId,useRef,useState} from "react";
import { createPortal } from "react-dom";
import ItemRaceSlots, { ItemRaceDescription } from "../wiki-race/race/ItemRaceSlots.jsx";

/** Small presenter only: availability, effect outcomes and deadlines come from C. */
export default function PlaytestItemsHud({view,visible=true,onUse,onParry,onReturn,enhancedFeedback=false,running=false,warningWindowMs,numberSlots=false,toolbar,supplySeconds}){
 const id=useId(),panel=useRef(null),toggle=useRef(null),opener=useRef(null);
 const [open,setOpen]=useState(false),[grantId,setGrantId]=useState(null),[targetIds,setTargetIds]=useState([]);
 const selected=view?.inventory?.find(item=>item&&item.grantId===grantId);
 const [boostIds,setBoostIds]=useState([]);
 const selectingBoost=selected?.action==='enhancement' && Array.isArray(selected.modifierKinds);
 const boostTargets=selectingBoost ? view.inventory.filter(item=>item && item.grantId!==grantId &&
   !item.modifierKinds.includes('enhancement')) : [];
 const selectedBoost=boostIds.filter(id=>boostTargets.some(item=>item.grantId===id));
 const requiredBoost=Math.min(selected?.effectiveTier==='enhanced'?2:1,boostTargets.length);
 const chosen=targetIds.filter(id=>view?.targets?.some(target=>target.participantId===id&&target.canSelect));
 const warnings=view?.warnings||[];
 useEffect(()=>{setOpen(false);setGrantId(null);setTargetIds([]);},[view?.viewer?.id,view?.sessionId]);
 useEffect(()=>{if(open)panel.current?.querySelector("button,input")?.focus();},[open]);
 if(!visible)return null;
 if(!view)return <section className="gip-hud" role="status">경기 상태를 확인해 주세요.</section>;
 const close=()=>{setOpen(false);requestAnimationFrame(()=>(opener.current&&!opener.current.disabled?opener.current:toggle.current)?.focus());};
 const show=event=>{opener.current=event.currentTarget;setOpen(true);};
 const readOnly=view.viewer.readOnly;
 const slots=[view.inventory?.[0]||null,view.inventory?.[1]||null];
 const startSelection=(item,event)=>{
   if(item.requiresTarget&&item.targetLimit===1&&item.action!=="attack")setTargetIds([]);
   setBoostIds([]);
   setGrantId(item.grantId);
   show(event);
 };
 const productSlots = slots.map(item=>item && {
   key:item.grantId,itemId:item.itemId,tier:item.effectiveTier,available:item.canSelect,
 });
 return <section className="gip-hud" aria-label="아이템 도구" onKeyDown={event=>{if(open&&event.key==="Escape"){event.preventDefault();close();}}}>
  {toolbar && !readOnly && createPortal(<ItemRaceSlots items={productSlots} selected={grantId}
    select={(item,event)=>startSelection(slots.find(slot=>slot?.grantId===item.key),event)}
    expanded={open} panelId={id} supplySeconds={supplySeconds}/>, toolbar)}
  {open&&!readOnly&&<div className="gip-panel" id={id} ref={panel}>
   <div className="gip-panel-head"><strong>{selected?.label||"도구와 대상"}</strong><button type="button" onClick={close} aria-label="도구 선택 닫기">닫기 ×</button></div>
   {toolbar && selected && <p className="gip-item-details"><ItemRaceDescription itemId={selected.itemId} tier={selected.effectiveTier}/></p>}
   {selected?.action==="parry"&&<p className="gip-right">공격을 받으면 아래 패링 버튼으로 사용할 수 있어요.</p>}<div className="gip-choices">{selectingBoost && <fieldset><legend>강화할 아이템</legend>
    {boostTargets.map(item=><label key={item.grantId}><input type="checkbox"
      checked={selectedBoost.includes(item.grantId)}
      onChange={event=>setBoostIds(old=>event.target.checked?[...old,item.grantId]:old.filter(id=>id!==item.grantId))}/>
      <span>{item.label}</span></label>)}
    {boostTargets.length===0 && <p>다음 보급 아이템에 적용해요.</p>}
   </fieldset>}<fieldset disabled={!selected?.requiresTarget}><legend>사용할 대상</legend>{view.targets.map(target=><label key={target.participantId}><input type="checkbox" disabled={!selected?.requiresTarget||!target.canSelect||(!chosen.includes(target.participantId)&&chosen.length>=(selected?.targetLimit??0))} checked={chosen.includes(target.participantId)} onChange={event=>setTargetIds(old=>event.target.checked?[...old,target.participantId]:old.filter(id=>id!==target.participantId))}/><span>{target.displayName}</span></label>)}</fieldset>
   <button className="gip-use" type="button" disabled={!selected?.canSelect||(selectingBoost&&selectedBoost.length!==requiredBoost)||(selected.requiresTarget&&(!chosen.length||chosen.length>selected.targetLimit||(selected.action==="attack"&&!view.controls.canAttack)))||selected.requiresWarning} onClick={()=>{const result=onUse?.({grantId:selected.grantId,targetIds:chosen,targetGrantIds:selectedBoost,action:selected.action});if(result?.ok)close();}}>사용하기</button></div>
   {view.bookmarkRight&&<p className="gip-right">↳ {view.bookmarkRight.originLabel} · 별도 복귀 권리</p>}
  </div>}
  {view.serverTransport==="s2.5"&&!readOnly&&view.protection?.length>0&&<p className="gip-right" role="status">보호 활성 · 차단 {view.protection[0].remainingCharges}회 남음</p>}
  {enhancedFeedback?<AttackWarning warnings={warnings} now={view.warningNow ?? view.now} windowMs={warningWindowMs} running={running} readOnly={readOnly} onParry={onParry}/>:!readOnly&&warnings.length>0&&<div className="gip-warnings" aria-label={"받은 공격 "+warnings.length+"건"}>{warnings.map((warning,index)=><div className="gip-warning" role="status" key={warning.childId}>
   <span className="gip-warning-mark" aria-hidden="true">!</span><span className="gip-warning-copy"><strong>{warning.sourceLabel||"상대"} · 먹물 공격{index===0&&warnings.length>1&&<span className="gip-warning-count">총 {warnings.length}건 ↕</span>}</strong><small>{warning.status==="pending"?"지금 반응해 주세요":"보호 판정 대기"}{index===0&&warnings.length>1?" · 아래로 더 보기":""}</small></span>
   <button type="button" className="gip-parry" disabled={!warning.canParry} onClick={()=>onParry?.(warning)}>패링</button>
  </div>)}</div>}
  <div className="gip-bar">{readOnly?<span className="gip-readonly">{view.viewer.mode==="spectator"?"관전":view.status==="finished"?"경기 종료":view.viewer.status==="finished"?"완주":"읽기 전용"} · 개인 도구 비공개</span>:<>
   {!toolbar && <div className="gip-slots">{slots.map((item,index)=><button key={index} type="button" className="gip-slot" aria-label={item?(numberSlots?(index+1)+"번 가방 ":"")+item.label+" 선택":"빈 가방 "+(index+1)} aria-pressed={Boolean(selected&&selected.grantId===item?.grantId)} disabled={!item?.canSelect} onClick={event=>startSelection(item,event)}><span className="gip-slot-index" aria-hidden="true">{index+1}</span><span>{item?.label||"빈 칸"}</span></button>)}</div>}
   <button type="button" className="gip-bookmark" aria-label={view.bookmarkRight?"책갈피로 복귀":"별도 책갈피 없음"} title={view.bookmarkRight?.unavailableReason==="same_document"?"현재 문서에서는 복귀할 수 없어요":view.bookmarkRight?.originLabel} disabled={Boolean(view.bookmarkRight&&!view.bookmarkRight.canReturn)} onClick={event=>view.bookmarkRight?onReturn?.(view.bookmarkRight.rightId):(open?close():show(event))}><span aria-hidden="true">↳</span><small>{view.bookmarkRight?"복귀":"없음"}</small></button>
   <button type="button" ref={toggle} className="gip-toggle" aria-expanded={open} aria-controls={id} aria-label={open?"아이템 상세 접기":"아이템 상세 펼치기"} onClick={event=>open?close():show(event)}>{open?"접기":"상세"}<span aria-hidden="true">{open?"⌄":"⌃"}</span></button>
  </>}</div>
 </section>;
}
