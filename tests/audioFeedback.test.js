import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobbyAudioGate, createConnectionAudioGate } from '../utils/audioFeedback.js';
const room={status:'waiting',host_user_id:'host'};
const host={user_id:'host'},guest={user_id:'guest'};

test('Duel initial and reconciled snapshots are quiet; fresh join and target readiness are separate',()=>{
  const gate=createLobbyAudioGate('duel','host');
  assert.equal(gate.observe({room,players:[host]},true),null);
  assert.equal(gate.observe({room,players:[host,guest]},true).sound,'join');
  const ready=[{...host,target_title:'목표',target_page_id:1},guest];
  assert.equal(gate.observe({room,players:ready},true).sound,'ready');
  assert.equal(gate.observe({room,players:ready},true),null);
  assert.equal(gate.observe({room,players:[host,guest]},false),null);
});
test('simultaneous joined and ready state chooses a single ready cue',()=>{
  const gate=createLobbyAudioGate('duel','host');gate.observe({room,players:[host]});
  assert.equal(gate.observe({room,players:[{...host,target_title:'목표',target_page_id:1},guest]},true).sound,'ready');
});
test('Group readiness reuses current valid start conditions and ignores busy render state',()=>{
  const gate=createLobbyAudioGate('group','host');
  const players=[host,guest,{user_id:'third'}].map((p,i)=>({...p,is_ready:i<2,submitted_target_page_id:i+1}));
  gate.observe({room,players});
  assert.equal(gate.observe({room,players:players.map(p=>({...p,is_ready:true}))},true).sound,'ready');
  assert.equal(gate.observe({room,players:players.map(p=>({...p,is_ready:true}))},true),null);
});
test('reconnect/reset, hidden snapshots and initial ready state never catch up sounds',()=>{
  const gate=createLobbyAudioGate('duel','host'),ready={room,players:[{...host,target_title:'目標',target_page_id:1},guest]};
  assert.equal(gate.observe(ready,true),null);gate.reset();assert.equal(gate.observe(ready,true),null);
  gate.observe({room,players:[host]});assert.equal(gate.observe(ready,true,false),null);assert.equal(gate.observe(ready,true,true),null);
});
test('connection initial failure/normal recovery are quiet, established loss/recovery each play once',()=>{
  const gate=createConnectionAudioGate();assert.equal(gate.observe('lost',true,0),null);
  assert.equal(gate.observe('ok',true,100),null);assert.equal(gate.observe(null,true,200),null);
  assert.equal(gate.observe('lost',true,1000).sound,'connectionLost');assert.equal(gate.observe('lost',true,1100),null);
  assert.equal(gate.observe('ok',true,1200).sound,'connectionRestored');assert.equal(gate.observe('ok',true,1300),null);
  assert.equal(gate.observe('lost',true,1400),null);
});
test('hiding or leaving resets connection baseline and never announces stale restoration',()=>{
  const gate=createConnectionAudioGate();gate.observe('ok',true,0);gate.observe('lost',true,5000);
  assert.equal(gate.observe('lost',false,5100),null);assert.equal(gate.observe('ok',true,5200),null);
  gate.reset();assert.equal(gate.observe('lost',true,10000),null);
});
