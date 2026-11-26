import test from "node:test";
import assert from "node:assert/strict";
import { newSupplyGrant } from "../hooks/useItemSupplyArrival.js";

const before={round:"0",inventory:["old"],revision:2,sideEffects:"same"};
const after={round:"1",inventory:["old","new"],revision:3,sideEffects:"same",observedAt:20120,dueAt:20000,
  initialRound:false,outcome:"granted",live:true};

test("play supply only for a single new grant after a confirmed fresh round",()=>{
  assert.equal(newSupplyGrant(before,after,true),"new");
  for (const change of [
    {round:"0"}, {inventory:["old"]}, {inventory:["reward","new"]}, {revision:4}, {sideEffects:"reward"},
    {live:false}, {observedAt:22500}, {outcome:"discarded_full"}, {round:"2"},
  ]) assert.equal(newSupplyGrant(before,{...after,...change},true),null);
  assert.equal(newSupplyGrant(after,after,true),null);
});

test("restore inventory silently, and accept explicit grant provenance even with coalesced changes",()=>{
  const initial={...after,round:"0",inventory:["first"],initialRound:true};
  assert.equal(newSupplyGrant(null,initial,false),null);
  assert.equal(newSupplyGrant(null,initial,true),"first");
  assert.equal(newSupplyGrant(before,{...after,revision:5,inventory:["reward","new"],grantId:"new"},true),"new");
  assert.equal(newSupplyGrant(before,{...after,grantId:"missing"},true),null);
});
