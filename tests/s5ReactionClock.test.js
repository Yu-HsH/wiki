import test from "node:test";
import assert from "node:assert/strict";
import { createS25InkPresentation } from "../components/group-items-playtest/s25InkPresentation.js";

const scope=Object.freeze({sessionId:"session-A",participantId:"player-C",ownerEpoch:1,bindingDigest:"s5-clock"});
function sample({observed,rtt,seq=1,due=101250}){
  return {
    scope, interaction:"product", stateRevision:seq, recipientEventSeq:seq,
    serverObservedAt:observed, transportElapsedMs:rtt, inventoryVersion:1,
    self:{status:"playing",currentPageId:"start",moveCount:0},
    projection:{kind:"playing",warnings:[{childId:"attack-1",canParry:true,dueAt:due}],
      effects:[],inventory:[],targetOptions:[],protection:null,results:[]}
  };
}

test("S5 slow→fast RTT keeps the actual 1.5-second reaction warning visible",()=>{
  let mono=0;
  const p=createS25InkPresentation({presentationNow:()=>mono,useReactionClock:true});
  p.accept(sample({observed:100000,rtt:1400}));
  assert.equal(p.frame().view.now,101400,"effect upper bound stays conservative");
  assert.equal(p.frame().view.warningNow,100000,"reaction excludes RTT before observation");
  mono=40;
  p.accept(sample({observed:100040,rtt:40,seq:2}));
  const view=p.frame().view;
  assert.equal(view.now,101440);
  assert.equal(view.warningNow,100040);
  assert.ok(view.warningNow<view.warnings[0].dueAt,"warning must not close early");
  mono=1249;
  assert.equal(p.frame().view.warningNow,101249);
  mono=1250;
  assert.equal(p.frame().view.warningNow,101250,"deadline is not extended");
});

test("S5 reaction display estimate never rewinds on an older server observation",()=>{
  let mono=0;
  const p=createS25InkPresentation({presentationNow:()=>mono,useReactionClock:true});
  p.accept(sample({observed:100000,rtt:10}));
  mono=300;
  const before=p.frame().view.warningNow;
  p.accept(sample({observed:100050,rtt:20,seq:2}));
  assert.equal(p.frame().view.warningNow,before);
  mono=500;
  assert.equal(p.frame().view.warningNow,100500);
});

test("S5 F5/offline recovery leaves reaction time monotonic and eligibility server-defined",()=>{
  let mono=0;
  const p=createS25InkPresentation({presentationNow:()=>mono,useReactionClock:true});
  p.accept(sample({observed:100000,rtt:100}));
  mono=250;
  const before=p.frame().view.warningNow;
  p.suspend();
  p.accept(sample({observed:100100,rtt:20,seq:2}),{recovering:true});
  assert.equal(p.frame().view.warningNow,before);
  assert.equal(p.frame().view.warnings[0].canParry,true);
});

test("legacy 1:1 and group retain the original effect time and omit warningNow",()=>{
  let mono=0;
  const legacy=createS25InkPresentation({presentationNow:()=>mono});
  const s5=createS25InkPresentation({presentationNow:()=>mono,useReactionClock:true});
  for(const [seq,observed,rtt,t] of [[1,100000,1400,0],[2,100040,40,40],[3,100100,80,100]]){
    mono=t;
    const snap=sample({observed,rtt,seq});
    legacy.accept(snap);s5.accept(snap);
    const left=legacy.frame().view,right=s5.frame().view;
    assert.equal(left.now,right.now);
    assert.equal("warningNow" in left,false);
    assert.equal(typeof right.warningNow,"number");
    assert.deepEqual(left.warnings,right.warnings);
  }
});
