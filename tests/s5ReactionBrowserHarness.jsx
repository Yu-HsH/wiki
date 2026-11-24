// Isolated browser-only test harness; never bundled into the production app.
import React from "react";
import { createRoot } from "react-dom/client";
import AttackWarning from "../components/group-items-playtest/AttackWarning.jsx";
import { createS25InkPresentation } from "../components/group-items-playtest/s25InkPresentation.js";

export function initialize(){
  if(window.__s5ReactionBrowser)throw Error("S5_TEST_HARNESS_ALREADY_INITIALIZED");
  const legacy=createS25InkPresentation();
  const fixed=createS25InkPresentation({useReactionClock:true});
  const scope={sessionId:"isolated-s5",participantId:"victim",ownerEpoch:"1",bindingDigest:"s5-clock-qa"};
  const host=document.createElement("section");
  host.id="s5-high-rtt-clock-harness";
  host.style.cssText="position:fixed;z-index:99999;inset:0;background:#fff;display:flex;gap:24px;padding:30px;overflow:auto";
  document.body.append(host);
  const roots={};
  for(const mode of ["legacy","fixed"]){
    const column=document.createElement("section");
    column.setAttribute("data-reaction-clock",mode);
    column.style.cssText="flex:1;min-width:280px";
    host.append(column);
    roots[mode]=createRoot(column);
  }
  let current=null,clickCount=0;
  function redraw(){
    if(!current)throw Error("S5_NO_SAMPLE");
    const lv=legacy.frame().view, fv=fixed.frame().view;
    for(const [mode,view] of [["legacy",lv],["fixed",fv]]){
      roots[mode].render(React.createElement(AttackWarning,{
        warnings:view.warnings, now:view.warningNow??view.now,
        windowMs:1500, running:false, readOnly:false,
        onParry:()=>{if(mode==="fixed")clickCount++;}
      }));
    }
    return {legacyNow:lv.now,fixedNow:fv.warningNow,
      legacyDeadline:lv.warnings[0]?.dueAt,fixedDeadline:fv.warnings[0]?.dueAt};
  }
  window.__s5ReactionBrowser={
    accept(sample,rtt){
      current=sample;
      const snapshot={
        scope,interaction:"group_items",
        stateRevision:BigInt(sample.seq),recipientEventSeq:BigInt(sample.seq),
        serverObservedAt:sample.serverObservedAt,transportElapsedMs:rtt,
        inventoryVersion:"0",self:{status:"playing",currentPageId:"11",moveCount:0},
        projection:{kind:"playing",warnings:[{
          childId:"warning-1",canParry:true,dueAt:sample.deadline,
          sourceLabel:"공격자",itemName:"먹물"}],
          effects:[],inventory:[],targetOptions:[],protection:null,results:[]}
      };
      legacy.accept(snapshot);fixed.accept(snapshot);
      const frame=redraw();
      return {...frame,deadline:sample.deadline,rtt};
    },
    frame:redraw,
    clicks:()=>clickCount
  };
}
