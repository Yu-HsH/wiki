import test from 'node:test';
import assert from 'node:assert/strict';
import { appendDuelRecent, createDuelFeedbackGate, describeDuelFeedback, selectDuelNotice, selectLiveBlindExpiry, DUEL_FEEDBACK_MS, DUEL_NOTICE_MS } from '../utils/duelFeedback.js';

const ctx = { userId:'me', opponentId:'opp' };
const ev = { id:'e', itemEventId:'e', itemId:'blind', actorUserId:'opp', targetUserId:'me', result:'applied', serverTimestamp:1100 };
test('Duel: server outcomes distinguish hit, block and reflection direction',()=>{
  assert.equal(describeDuelFeedback(ev,ctx).kind,'hit');
  assert.equal(describeDuelFeedback({...ev,result:'blocked'},ctx).kind,'block');
  assert.equal(describeDuelFeedback({...ev,result:'reflected',targetUserId:'opp'},ctx).kind,'reflect');
  const own={...ev,actorUserId:'me',targetUserId:'me',result:'reflected'};
  assert.equal(describeDuelFeedback(own,{...ctx,own:true}).kind,'hit');
  assert.equal(describeDuelFeedback({...ev,actorUserId:'me',targetUserId:'opp',result:'blocked'},{...ctx,own:true}).label,'사용 · 상대가 차단');
});
test('Duel: defense activation is preparation; rollback is never inferred cleansing',()=>{
  const own={...ev,actorUserId:'me',targetUserId:'me'};
  assert.equal(describeDuelFeedback({...own,itemId:'cleanse_shield'},{...ctx,own:true}).label,'방어 준비');
  assert.equal(describeDuelFeedback({...own,itemId:'go_back'},{...ctx,own:true}).label,'되돌리기 적용');
  assert.equal(describeDuelFeedback({...ev,result:'void'},ctx),null);
  for(const patch of [{result:'unknown'},{itemId:'ink_blind'},{itemId:'swap_current'},{actorUserId:'stranger'},{itemEventId:null}])assert.equal(describeDuelFeedback({...ev,...patch},ctx),null);
});
test('Duel: historical rewind follows confirmed moved participants',()=>{
  const rewind={...ev,itemId:'history_rewind',targetUserId:'opp',metadata:{rewoundUserIds:['me']}};
  assert.equal(describeDuelFeedback(rewind,ctx).motif,'rewind');
  assert.equal(describeDuelFeedback({...rewind,metadata:{}},ctx),null);
  assert.equal(describeDuelFeedback(rewind,ctx).articleMotion,'rewind');
  const own={...rewind,actorUserId:'me',targetUserId:'me',metadata:{rewoundUserIds:['opp']}};
  assert.equal(describeDuelFeedback(own,{...ctx,own:true}).articleMotion,null);
  assert.equal(describeDuelFeedback(own,{...ctx,own:true}).headline,'역사 되감기 사용');
  assert.equal(describeDuelFeedback({...ev,itemId:'random_link_move'},ctx).articleMotion,'move');
  assert.equal(describeDuelFeedback({...ev,itemId:'random_link_move',result:'blocked'},ctx).articleMotion,null);
  assert.equal(describeDuelFeedback({...ev,itemId:'random_link_move',actorUserId:'me',targetUserId:'opp'},{...ctx,own:true}).articleMotion,null);
});
test('Duel: gate rejects duplicate, old, hidden, future and expired effects',()=>{
  const gate=createDuelFeedbackGate(1000), at={now:1200,visible:true};
  assert.equal(gate.accept(ev,at),true);
  assert.equal(gate.accept(ev,at),false);
  assert.equal(gate.accept({...ev,id:'old',serverTimestamp:999},at),false);
  assert.equal(gate.accept({...ev,id:'hidden'},{...at,visible:false}),false);
  gate.resume(1400);
  assert.equal(gate.accept({...ev,id:'delayed',serverTimestamp:1300},{now:1500,visible:true}),false);
  assert.equal(gate.accept({...ev,id:'no-clock',serverTimestamp:null},at),false);
  assert.equal(gate.accept({...ev,id:'future',serverTimestamp:2000},at),false);
  assert.equal(gate.accept({...ev,id:'expired',kind:'hit',effectExpiresAt:1100},at),false);
  assert.equal(gate.accept({...ev,id:'skew',serverTimestamp:6500},{now:1500,visible:true,skewMs:5000}),true);
  assert.equal(gate.accept({...ev,id:'late',serverTimestamp:1500},{now:4000,visible:true}),false);
});
test('Duel: bounded gate never evicts identities to replay them',()=>{
  const gate=createDuelFeedbackGate(1000);
  for(let i=0;i<256;i++)assert.equal(gate.accept({...ev,id:`e${i}`},{now:1200,visible:true}),true);
  assert.equal(gate.accept({...ev,id:'beyond'},{now:1200,visible:true}),false);
  assert.equal(gate.accept({...ev,id:'e0'},{now:1200,visible:true}),false);
});
test('Duel: blind display follows latest server expiry, excludes expired snapshots',()=>{
  const effects=[{itemId:'blind',expiresAt:1400},{itemId:'blind',expiresAt:1900},{itemId:'link_censorship',expiresAt:9000}];
  assert.equal(selectLiveBlindExpiry(effects,1500),1900);
  assert.equal(selectLiveBlindExpiry(effects,2000),null);
  assert.equal(selectLiveBlindExpiry([],1000),null);
});
test('Duel: readable notices retain identity, source and verdict without changing impact lifetime',()=>{
  assert.equal(DUEL_FEEDBACK_MS,650);assert.equal(DUEL_NOTICE_MS,2500);
  assert.equal(describeDuelFeedback(ev,ctx).headline,'먹물 공격에 피격');
  assert.equal(describeDuelFeedback({...ev,result:'blocked'},ctx).headline,'편집 보호로 공격 차단');
  assert.equal(describeDuelFeedback({...ev,result:'reflected',targetUserId:'opp'},ctx).headline,'역링크 반사 성공');
  assert.equal(describeDuelFeedback({...ev,actorUserId:'me',targetUserId:'opp'},{...ctx,own:true}).headline,'먹물 공격 사용');
});
test('Duel: newer confirmed use is not hidden by an older outcome; recent three remain unique',()=>{
  const a={...describeDuelFeedback(ev,ctx),id:'a',serverTimestamp:100};
  const b={...a,id:'b',kind:'use',serverTimestamp:200};
  assert.equal(selectDuelNotice([a,b]).id,'b');
  assert.equal(selectDuelNotice([b,a]).id,'b');
  assert.equal(selectDuelNotice([a,{...b,serverTimestamp:100}]).id,'a');
  assert.equal(selectDuelNotice([{...b,serverTimestamp:100},a]).id,'a');
  const c={...a,id:'c',kind:'block',serverTimestamp:300};
  assert.equal(selectDuelNotice([c,a,b]).id,'c');
  let recent=[];for(const cue of[a,b,c,b,{...a,id:'d',serverTimestamp:400}])recent=appendDuelRecent(recent,cue);
  assert.deepEqual(recent.map(c=>c.id),['b','c','d']);
});
