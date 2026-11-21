import React from "react";
import FeedbackIcon from "./FeedbackIcon.jsx";
export default function DefenseFeedback({cue,showMotion=true}){
 if(!cue)return null;
 return <>{showMotion&&<div className={"gip-defense-motion is-"+cue.kind} aria-hidden="true" data-outcome-key={cue.key}><i className="gip-defense-wave"/>{cue.kind==="parry_success"&&<i className="gip-counter-streak"/>}{cue.exhausted&&<span className="gip-shield-shatter">{[0,1,2,3].map(index=><i key={index} style={{"--piece":index}}/>)}</span>}</div>}<div className={"gip-defense-feedback is-"+cue.kind} data-feedback-kind={cue.kind} role="status"><span className="gip-defense-icon"><FeedbackIcon kind={cue.icon}/></span><div><strong>{cue.title}</strong><small>{cue.detail}</small>{cue.related?.length>0&&<small className="gip-related-result">함께 처리: {cue.related.join(" · ")}</small>}{cue.exhausted&&<span className="gip-shield-spent" data-shield-spent="true"><FeedbackIcon kind="spent"/>보호 소진 · 다음 공격에 주의</span>}</div></div></>;
}
