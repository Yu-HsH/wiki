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

for (const recovering of [false, true]) {
  test(`S5 shows a new warning after the first slow read (${recovering ? "recovery" : "cold"})`, () => {
    let mono = 7000;
    const presentation = createS25InkPresentation({presentationNow:()=>mono,useReactionClock:true});
    if (recovering) presentation.suspend();
    presentation.accept(sample({observed:107000,rtt:7000,due:107000}),{recovering});
    mono = 7020;
    presentation.accept(sample({observed:107010,rtt:20,seq:2,due:107000}));
    mono = 10010;
    presentation.accept(sample({observed:110000,rtt:20,seq:3,due:111500}));
    const { warningNow, warnings } = presentation.frame().view;
    assert.equal(warnings[0].canParry, true);
    assert.equal(warnings[0].dueAt - warningNow, 1490);
  });
}

test("S5 uses a fast sample to keep the warning visible through upstream delay",()=>{
  let mono=0;
  const p=createS25InkPresentation({presentationNow:()=>mono,useReactionClock:true});
  p.accept(sample({observed:98590,rtt:20}));
  mono=1400;
  p.accept(sample({observed:99990,rtt:1400,seq:2}));
  const view=p.frame().view;
  assert.equal(view.now,101390,"effect upper bound stays conservative");
  assert.equal(view.warningNow,100000,"upstream wait did not consume the displayed window twice");
  mono=2649;
  assert.equal(p.frame().view.warningNow,101249);
  mono=2650;
  assert.equal(p.frame().view.warningNow,101250,"deadline is not extended");
});

test("S5 includes return delay when an observed warning arrives late",()=>{
  let mono=0;
  const p=createS25InkPresentation({presentationNow:()=>mono,useReactionClock:true});
  p.accept(sample({observed:99990,rtt:20}));
  mono=155;
  const view=p.accept(sample({observed:100004,rtt:155,due:100145,seq:2})) && p.frame().view;
  assert.equal(view.warningNow,100155);
  assert.ok(view.warningNow>=view.warnings[0].dueAt);
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
  assert.equal(p.frame().view.warningNow,100505);
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
