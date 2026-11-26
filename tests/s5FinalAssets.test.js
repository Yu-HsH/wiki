import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { createFinalAssetAudio } from '../components/group-items-jungle/finalAssetAudio.js';
import { finalIconUrl, finalInkPlacement, finalMovementSignal, finalReceiptSignal, finalResultSignal } from '../components/group-items-jungle/finalAssetEvents.js';
import { createFinalAssetPresentation } from '../components/group-items-jungle/finalAssetPresentation.js';

const receipt = (operation,code,extra={}) => ({receiptId:'receipt',operation,code,...extra});

test('S5: selected icon paths cover all three grades for 17 item IDs', () => {
  const ids='ink censor trap lost_link bookmark undo search link_index parry shield correction thunder thief roulette cannon enhancement weakening'.split(' ');
  const urls=ids.flatMap(id=>['normal','enhanced','weakened'].map(tier=>finalIconUrl(id,tier)));
  assert.equal(new Set(urls).size,51);
  const paths=readdirSync(new URL('../public/group-items-final-s5/icons',import.meta.url),{recursive:true})
    .map(path=>path.replaceAll('\\','/'));
  for (const url of urls) assert.ok(paths.includes(url.split('/icons/')[1]),url);
  assert.equal(finalIconUrl('unknown'),null);
});

test('S5: ink placement is reproducible and stays inside 320–430px viewport', () => {
  for (const width of [320,390,430,1280]) {
    for (const height of [240,560,900]) {
      for (const id of ['ink-a','ink-b','ink-c']) {
        const result=finalInkPlacement(id,width,height);
        assert.deepEqual(result,finalInkPlacement(id,width,height));
        assert.equal(result.length,3);
        for (const {left,top,width:size} of result) {
          assert.ok(left>=0 && top>=0 && left+size<=width && top+size<=height);
        }
      }
    }
  }
  assert.notDeepEqual(finalInkPlacement('ink-a',320,560),finalInkPlacement('ink-b',320,560));
});

test('S5: live receipt cues split confirmed branches and retain accepted failure semantics', () => {
  const cue=(...args)=>finalReceiptSignal(receipt(...args));
  assert.deepEqual(cue('parry','PARRY_ACCEPTED',{outcome:'reflected'}),{kind:'parry-reflect',asset:'reverse_link_parry/reflect'});
  assert.deepEqual(cue('parry','PARRY_ACCEPTED',{outcome:'reflection_blocked'}),{kind:'parry-block',asset:'reverse_link_parry/block'});
  assert.equal(finalReceiptSignal(receipt('parry','PARRY_ACCEPTED',{outcome:'blocked'}),'thunder').asset,'reverse_link_parry/block');
  assert.equal(finalReceiptSignal(receipt('parry','PARRY_ACCEPTED',{outcome:'reflected'}),'thunder').asset,'thunder_judgment/parry');
  assert.equal(cue('parry','PARRY_FAILED'),null);
  assert.equal(cue('trap_install','TRAP_INSTALLED',{trapId:'trap'}).kind,'trap-install');
  assert.equal(cue('normal_link','TRAP_STOPPED',{trapOutcome:'sealed'}).asset,'surprise_box/hit');
  assert.equal(cue('normal_link','MOVED',{trapOutcome:'blocked'}).asset,'surprise_box/reveal');
  assert.equal(cue('normal_link','MOVED',{trapOutcome:'arrival',stunEventSeq:'2'}).asset,'surprise_box/hit');
  assert.equal(cue('correction','CORRECTION_APPLIED',{closedEffectId:'effect'}).asset,'emergency_correction/success');
  assert.equal(cue('correction','CORRECTION_CHANCE_FAILED').asset,'emergency_correction/fail');
  assert.equal(cue('correction','NO_ACTIVE_EFFECT'),null);
  assert.equal(cue('thunder','THUNDER_SELF_PENALTY').asset,'thunder_judgment/self');
  assert.equal(cue('thief','THIEF_NO_TRANSFERABLE_GRANT').asset,'thief_hand/empty');
  assert.equal(cue('thief','THIEF_RESOLVED',{success:true}).asset,'thief_hand/steal');
  assert.equal(cue('thief','THIEF_RESOLVED',{success:false}).kind,'thief-loss');
  assert.equal(cue('roulette','ROULETTE_RESOLVED',{success:false}).asset,'chaos_roulette/fail');
  assert.equal(cue('roulette','ROULETTE_RESOLVED',{success:true}).asset,'chaos_roulette/win');
  assert.equal(cue('roulette','ROULETTE_RESOLVED',{success:true,automaticChild:{id:'child'}}).asset,'chaos_roulette/boost');
});

test('S5: protection and parry are distinguishable without inferring missing server fields', () => {
  const row={sourceParticipantId:'A',targetParticipantId:'B',itemId:'thunder'};
  const cue=(outcome,defenseKind,id)=>finalResultSignal({...row,outcome,defenseKind},id)?.asset;
  assert.equal(cue('hit',null,'B'),'thunder_judgment/hit');
  assert.equal(cue('hit',null,'A'),undefined);
  assert.equal(cue('blocked','protection','B'),'thunder_judgment/guard');
  assert.equal(cue('blocked','parry','B'),undefined);
  assert.equal(cue('blocked',null,'B'),undefined);
  assert.equal(cue('reflected','parry','A'),'thunder_judgment/hit');
  assert.equal(cue('reflected','parry','B'),undefined);
  assert.equal(cue('reflection_blocked','protection','A'),'thunder_judgment/guard');
});

test('S5: stale/mismatched movement cannot trigger lost or cannon arrival', () => {
  const current={currentPageId:'page',currentRevisionId:'revision',progressVersion:'4'};
  const move={operation:'cannon',moveId:'1',pageId:'page',revisionId:'revision',progressVersion:'4'};
  assert.equal(finalMovementSignal(move,current).asset,'dimension_cannon/arrive');
  assert.equal(finalMovementSignal({...move,operation:'lost_link'},current).asset,'lost_way/arrive');
  for (const [key,bad] of [['pageId','previous'],['revisionId','past'],['progressVersion','3'],['moveId','']])
    assert.equal(finalMovementSignal({...move,[key]:bad},current),null);
});

test('S5: F5/retransmission suppresses one-shots, a new live ink sequence uses one mix', () => {
  const heard=[],stuns=[];
  const audio={play:asset=>heard.push(asset),stun:id=>stuns.push(id),stop(){}};
  let mono=50;
  const p=createFinalAssetPresentation({receipt(){}},()=>audio,()=>mono);
  const move={operation:'cannon',moveId:'m1',pageId:'page',revisionId:'r1',progressVersion:'1'};
  const state={presentation:{serverObservedAt:1000},lastForcedMove:move,
    self:{currentPageId:'page',currentRevisionId:'r1',progressVersion:'1'},
    warnings:[],itemEffects:[{kind:'stun',source:'thunder',effectId:'stun',startsAt:900,expiresAt:1200}]};
  const frame={now:1000,view:{viewer:{readOnly:false}},events:[]};
  p.recover(state);
  assert.equal(p.observe(state,frame,true).thunder,true);
  assert.deepEqual(heard,[]);
  assert.equal(stuns.at(-1),'stun');
  p.receipt(receipt('correction','CORRECTION_APPLIED',{closedEffectId:'stun'}),{live:true,retransmitted:true});
  assert.deepEqual(heard,[]);
  assert.equal(p.observe(state,{...frame,now:1200},true).thunder,false);
  assert.equal(stuns.at(-1),undefined);
  p.playPulse({type:'ink_pulse',pulseIndex:0});
  p.playPulse({type:'ink_pulse',pulseIndex:1});
  p.playPulse({type:'ink_pulse',pulseIndex:2});
  assert.deepEqual(heard,['ink_blind/three_splashes']);
  const newMove={...move,moveId:'m2'};
  const landed={...state,lastForcedMove:newMove};
  p.pending('cannon',true);
  assert.deepEqual(p.observe(landed,frame,true).scenes,[]);
  p.receipt(receipt('cannon','CANNON_RESOLVED',{success:true,movement:newMove}),{live:true});
  p.pending('cannon',false);
  p.observe(landed,frame,true);
  assert.equal(heard.at(-1),'dimension_cannon/fire');
  mono+=799;
  assert.equal(p.observe(landed,frame,true).scenes.at(-1).kind,'cannon-fire');
  mono++;
  assert.equal(p.observe(landed,frame,true).scenes.at(-1).kind,'cannon-arrive');
  p.observe(landed,frame,true);
  assert.deepEqual(heard,['ink_blind/three_splashes','dimension_cannon/fire','dimension_cannon/arrive']);
});

test('S5: recover a shield and a seal silently, release once at the server expiry', () => {
  const heard=[];
  const p=createFinalAssetPresentation({receipt(){}},()=>({play:asset=>heard.push(asset),stun(){},stop(){}}));
  const state={presentation:{serverObservedAt:1000,projection:{protection:{startsAt:900,expiresAt:1300}}},
    self:{progressVersion:'2'},itemEffects:[{kind:'censor',effectId:'seal',startsAt:900,expiresAt:1200}]};
  const frame={now:1000,view:{viewer:{readOnly:false}},events:[]};
  p.recover(state);
  assert.equal(p.observe(state,frame,true).shieldActive,true);
  assert.deepEqual(heard,[]);
  assert.equal(p.observe(state,{...frame,now:1200},true).scenes.at(-1).kind,'censor-release');
  assert.equal(p.observe(state,{...frame,now:1300},true).shieldActive,false);
  assert.deepEqual(heard,['link_censor/release']);
});

test('S5: selected sound, mute, volume and authorized stun-loop synchronization', () => {
  const played=[];
  const document=new EventTarget();
  const host={document,Audio:class {
    constructor(url) { this.url=url; }
    play() { played.push(this); return Promise.resolve(); }
    pause() { this.paused=true; }
  }};
  const sound=createFinalAssetAudio(host,{stunLoopUrl:'/test/electric-loop.wav'});
  sound.play('thief_hand/steal');
  assert.equal(played.length,0);
  sound.enable(true);
  for (const held of ['link_censor/apply','thief_hand/laugh_layer','thunder_judgment/stun_loop']) sound.play(held);
  sound.play('thief_hand/steal');
  assert.equal(played.length,1);
  assert.match(played[0].url,/\/audio\/selected\/thief_hand\/steal\.wav$/);
  sound.setVolume(.3);
  assert.equal(played[0].volume,.3);
  sound.stun('stun');
  sound.stun('stun');
  assert.equal(played.length,2);
  assert.equal(played[1].loop,true);
  sound.stun(undefined);
  assert.equal(played[1].paused,true);
  sound.enable(false);
  assert.equal(played[0].paused,true);
  sound.dispose();
});
