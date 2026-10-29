import test from "node:test";
import assert from "node:assert/strict";
import { createRaceMotionGate, approvedItemAccent, incomingItemAccent } from "../utils/raceMotion.js";

test("approved identities animate once; missing approval is static", () => {
  const gate = createRaceMotionGate();
  assert.equal(gate(null), false);
  assert.equal(gate("room:player:2"), true);
  assert.equal(gate("room:player:2"), false);
  assert.equal(gate("room:player:3"), true);
});
test("hidden and reduced events are consumed without catch-up", () => {
  const gate = createRaceMotionGate();
  assert.equal(gate("hidden", false), false);
  assert.equal(gate("hidden", true), false);
  assert.equal(gate("reduced", true, true), false);
  assert.equal(gate("reduced"), false);
});
test("capacity fails closed instead of replaying old moves", () => {
  const gate = createRaceMotionGate();
  for (let i = 0; i < 256; i++) assert.equal(gate(String(i)), true);
  assert.equal(gate("new"), false);
  assert.equal(gate("0"), false);
});

test("item selection, refusal, VOID and unknown verdict never celebrate", () => {
  for (const outcome of [null, {ok:false,itemEventId:"e",result:"applied"}, {ok:true,result:"applied"},
    {ok:true,itemEventId:"e",result:"void"}, {ok:true,itemEventId:"e",result:null}]) {
    assert.equal(approvedItemAccent(outcome, {category:"attack"}), null);
  }
  assert.equal(approvedItemAccent({ok:true,itemEventId:"e",result:"applied"}, {category:"attack"}), "attack");
  assert.equal(approvedItemAccent({ok:true,itemEventId:"e",result:"blocked"}, {}), "defense");
  assert.equal(approvedItemAccent({ok:true,itemEventId:"e",result:"applied"}, {slotRole:"attack"}), "attack");
  assert.equal(approvedItemAccent({ok:true,itemEventId:"e",result:"applied"}, {slotRole:"defense"}), "defense");
  assert.equal(approvedItemAccent({ok:true,itemEventId:"e",result:"blocked"}, {slotRole:"attack"}), "attack");
});
test("incoming item accent requires a recent server timestamp and participant", () => {
  const event = {itemEventId:"e",result:"blocked",serverTimestamp:1200,targetUserId:"me"};
  const options = {userId:"me",startedAt:1000,skewMs:100};
  assert.equal(incomingItemAccent(event, options), "defense");
  assert.equal(incomingItemAccent({...event,serverTimestamp:1050}, options), null);
  assert.equal(incomingItemAccent({...event,serverTimestamp:null}, options), null);
  assert.equal(incomingItemAccent({...event,targetUserId:"other"}, options), null);
  assert.equal(incomingItemAccent({...event,result:"void"}, options), null);
  const gate = createRaceMotionGate();
  assert.equal(gate(event.itemEventId), true);
  assert.equal(gate(event.itemEventId), false);
});
