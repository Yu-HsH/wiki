import test from "node:test";
import assert from "node:assert/strict";
import { resolveRewardArt, DEFAULT_REWARD_ART_KEY } from "../utils/rewardArt.js";
import { REWARD_ART_MANIFEST } from "../data/rewardArtManifest.js";
import { frameTier, finishTier, pathColor } from "../utils/rewardTokens.js";

const svg = Object.freeze({ src: "/assets/wiki-race/rewards/a001/v1.svg", width: 512, height: 512 });
const reward = (kind, assetRef) => Object.freeze({ kind, assetRef, rewardId: "fixture-visible", displayName: "검증용 보상" });
const map = (kind, key, art = svg) => ({ [kind]: { [key]: art } });

test("unconfigured delivered-art manifest preserves all existing renderers", () => {
  for (const [kind, ref] of [["profile_icon","/profile-icons/book.svg"],["frame","frame:special"],["background",null],["finish_effect","finish:tier-3"]]) {
    assert.deepEqual(REWARD_ART_MANIFEST[kind], {});
    assert.equal(resolveRewardArt(kind, reward(kind, ref)), null);
  }
});

test("registered static SVG/PNG selection leaves reward and legacy token semantics unchanged", () => {
  const ref = reward("frame", " frame:tier-2 ");
  assert.deepEqual(resolveRewardArt("frame", ref, map("frame","frame:tier-2")), svg);
  assert.equal(frameTier(ref), "tier-2");
  assert.equal(finishTier(reward("finish_effect","finish:tier-3")), "tier-3");
  assert.equal(pathColor(reward("path_color","path:purple")), "#6E56C9");
  assert.equal(ref.rewardId, "fixture-visible");
  const png = { ...svg, src: "/assets/wiki-race/rewards/a002/v2.png" };
  assert.deepEqual(resolveRewardArt("profile_icon", reward("profile_icon","/profile-icons/book.svg"), map("profile_icon","/profile-icons/book.svg",png)), png);
});

test("only an existing background reward may use the shared null-ref default", () => {
  const manifest = map("background", DEFAULT_REWARD_ART_KEY);
  assert.deepEqual(resolveRewardArt("background",reward("background",null),manifest),svg);
  assert.equal(resolveRewardArt("background",null,manifest),null);
  assert.equal(resolveRewardArt("background",reward("background","unknown"),manifest),null);
  for (const kind of ["profile_icon","frame","finish_effect"]) assert.equal(resolveRewardArt(kind,reward(kind,null),map(kind,DEFAULT_REWARD_ART_KEY)),null);
});

test("unimplemented media and unsupported kinds cannot activate a renderer", () => {
  for (const kind of ["title","path_color","path_effect","spectator_emoji"]) assert.equal(resolveRewardArt(kind,reward(kind,"registered"),map(kind,"registered")),null);
  for (const ext of ["webm","json","lottie","gif","jpg"]) assert.equal(resolveRewardArt("frame",reward("frame","frame:tier-1"),map("frame","frame:tier-1",{...svg,src:"/assets/wiki-race/rewards/a001/v1."+ext})),null);
  assert.equal(resolveRewardArt("frame", reward("finish_effect","frame:tier-1"),map("frame","frame:tier-1")),null);
});

test("invalid local descriptors fail closed to the current visual fallback", () => {
  const candidates = ["https://example.invalid/a.svg","//example.invalid/a.svg","data:image/svg+xml,x","javascript:x","/assets/wiki-race/rewards/../x.svg","/assets/wiki-race/rewards/a.svg?name=private","/assets/wiki-race/rewards/a.svg#id","/profile-icons/book.svg",{},Symbol("src")];
  for (const src of candidates) assert.equal(resolveRewardArt("frame",reward("frame","frame:tier-1"),map("frame","frame:tier-1",{...svg,src})),null);
  for (const width of [0,-1,1.5,8193,NaN,"512"]) assert.equal(resolveRewardArt("frame",reward("frame","frame:tier-1"),map("frame","frame:tier-1",{...svg,width})),null);
});

test("lookup never reads IDs, labels, hidden conditions, or entitlement", () => {
  const ref = { kind:"frame",assetRef:"frame:tier-1" };
  for (const key of ["rewardId","displayName","hidden","owned","condition"]) Object.defineProperty(ref,key,{get(){throw Error("forbidden visual lookup "+key);}});
  assert.deepEqual(resolveRewardArt("frame",ref,map("frame","frame:tier-1")),svg);
  assert.equal(resolveRewardArt("frame",{kind:"frame",assetRef:"unknown",rewardId:"frame:tier-1"},map("frame","frame:tier-1")),null);
});

test("inherited manifest keys and malformed RewardRefs cannot supply art", () => {
  assert.equal(resolveRewardArt("frame",reward("frame","frame:tier-1"),Object.create(map("frame","frame:tier-1"))),null);
  assert.equal(resolveRewardArt("frame",reward("frame","frame:tier-1"),{frame:Object.create({"frame:tier-1":svg})}),null);
  for (const ref of [null,undefined,"frame:tier-1",0,{kind:"frame",assetRef:{}}]) assert.equal(resolveRewardArt("frame",ref,map("frame","frame:tier-1")),null);
});

test("resolving art does not rewrite frozen manifest metadata or return arbitrary fields", () => {
  const entry = Object.freeze({...svg,price:9000,unlock:"ignored"});
  const manifest = Object.freeze({frame:Object.freeze({"frame:tier-1":entry})});
  const art = resolveRewardArt("frame",reward("frame","frame:tier-1"),manifest);
  assert.deepEqual(art,svg);
  assert.equal(Object.isFrozen(art),true);
  assert.equal(entry.price,9000);
});
