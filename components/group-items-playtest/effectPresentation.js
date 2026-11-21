/** Display-only boundaries. C remains the authority for effects, deadlines and outcomes. */
export function inkVisualOpacity(effect,now,{reduced=false,staticMode=false}={}){
 if(!effect||!Number.isFinite(now)||!Number.isFinite(effect.startsAt)||!Number.isFinite(effect.expiresAt)||now<effect.startsAt||now>=effect.expiresAt)return 0;
 if(reduced||staticMode)return 1;
 return Math.min(1,Math.max(0,(effect.expiresAt-now)/180));
}
export function warningEventDecision(event,view,now=view?.now){
 if(event?.type!=="attack_warning"||event.suppressed||!view||view.viewer?.mode!=="participant"||view.viewer.readOnly||event.recipientId!==view.viewer.id)return {ok:false,code:"NOT_LIVE_RECIPIENT"};
 if(!Number.isFinite(now)||!Number.isFinite(event.at)||now<event.at||now-event.at>150)return {ok:false,code:"STALE_WARNING"};
 const warning=view.warnings?.find(row=>row.childId===event.childId);
 if(!warning||warning.status!=="pending"||!Number.isFinite(warning.dueAt)||warning.dueAt<=now)return {ok:false,code:"CLOSED_WARNING"};
 return {ok:true,childId:warning.childId,dueAt:warning.dueAt};
}
export function createWarningCueGate(){const events=new Set(),children=new Set();return {claim(event,view,now=view?.now){const decision=warningEventDecision(event,view,now);if(!decision.ok)return decision;const scope=view.sessionId+":"+view.viewer.id+":";if(events.has(scope+event.eventId)||children.has(scope+event.childId))return {ok:false,code:"DUPLICATE_WARNING"};events.add(scope+event.eventId);children.add(scope+event.childId);return decision;},clear(){events.clear();children.clear();}};}
