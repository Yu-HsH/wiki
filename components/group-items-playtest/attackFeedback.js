/** Presentation only. C decides deadline outcome, grants, defense and effect expiry. */
export function warningDisplay(warning,now,windowMs,{readOnly=false}={}){
 const valid=Number.isFinite(now)&&Number.isFinite(warning?.dueAt)&&Number.isFinite(windowMs)&&windowMs>0;
 const remaining=valid?Math.max(0,warning.dueAt-now):0;
 return {remainingMs:remaining,fraction:valid?Math.min(1,remaining/windowMs):0,label:(Math.ceil(remaining/100)/10).toFixed(1),canReact:valid&&!readOnly&&warning.canParry===true&&remaining>0,expired:remaining<=0};
}
export function defenseCue(event,view){
 if(!view||view.viewer?.mode!=="participant"||view.viewer.readOnly||event?.suppressed||event?.recipientId!==view.viewer.id)return null;
 if(!Number.isFinite(event.at)||event.at>view.now||view.now-event.at>500)return null;
 const base={at:event.at,key:event.eventId};
 if(event.type==="ink_started")return {...base,key:"hit:"+event.childId+":"+view.viewer.id,kind:"hit",title:"먹물 적중",detail:"링크와 스크롤은 계속 사용할 수 있어요",icon:"ink"};
 if(event.type!=="attack_resolved")return null;
 if(event.outcome==="hit")return {...base,key:"hit:"+event.childId+":"+view.viewer.id,kind:"hit",title:"먹물 적중",detail:"링크와 스크롤은 계속 사용할 수 있어요",icon:"ink"};
 if(event.outcome==="reflected")return {...base,kind:"parry_success",title:"패링 성공",detail:"먹물을 상대에게 반격했어요",icon:"reflect"};
 if(event.outcome==="reflection_blocked")return {...base,kind:"parry_success",title:"패링 성공",detail:"반격은 상대 보호에 막혔어요",icon:"reflect"};
 if(event.outcome==="blocked")return {...base,kind:"protected",title:"보호로 차단",detail:"이번 먹물 공격을 막았어요",icon:"shield",exhausted:Array.isArray(view.protection)&&view.protection.length===0};
 return null;
}
export function failureCue(receipt,view,{live=false}={}){
 if(!live||!view||view.viewer?.mode!=="participant"||view.viewer.readOnly||receipt?.actorId!==view.viewer.id||receipt.status!=="valid_failure")return null;
 return {key:"receipt:"+receipt.requestId,at:receipt.acceptedAt,kind:"parry_failed",title:"패링 실패",detail:"남은 보호는 공격 마감에 확인해요",icon:"failed",testOnly:true};
}
export function createFeedbackGate(){const seen=new Set();return {claim(cue,view){if(!cue||!view?.sessionId)return false;const key=view.sessionId+":"+view.viewer.id+":"+cue.key;if(seen.has(key))return false;seen.add(key);return true;},clear(){seen.clear();}};}
