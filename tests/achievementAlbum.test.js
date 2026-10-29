import test from "node:test";
import assert from "node:assert/strict";
import { buildAchievementCard, buildAchievementScreen, buildResultReveal } from "../utils/achievementDisplay.js";
import { categoryDecoration, completionDecoration } from "../utils/achievementDecoration.js";

test("decoration maps only five public categories, never rewards or hidden placeholders", () => {
  for (const key of ["onboarding", "exploration", "daily", "duel", "group"]) assert.equal(categoryDecoration(key), `/assets/wiki-race/achievement-decoration/category-${key}.svg`);
  for (const key of ["collection", "hidden", "profile_icon", "frame", "toString", null]) assert.equal(categoryDecoration(key), null);
});

test("completion stamp requires final server unlocked state, not progress, NEW or partial tier", () => {
  const input = { achievementId: "fixture", unlockedTier: 1, tiers: [{ tier: 1, unlocked: true }, { tier: 2, unlocked: false }] };
  assert.equal(completionDecoration(buildAchievementCard(input)), null);
  assert.equal(completionDecoration({ complete: false, isNew: true, progress: { percent: 100 }, unlockedTier: 0 }), null);
  assert.equal(completionDecoration({ complete: true, unlockedTier: 0 }), null);
  assert.equal(completionDecoration(buildAchievementCard({ ...input, unlockedTier: 2, tiers: input.tiers.map(t => ({ ...t, unlocked: true })) })), "/assets/wiki-race/achievement-decoration/discovery-complete.svg");
});

test("album keeps public asset references without changing reward text or source", () => {
  const reward = { rewardId: "fixture", kind: "frame", displayName: "공개 견본", assetRef: "frame:tier-2" };
  const input = { achievementId: "fixture", description: "공개 설명", tiers: [{ tier: 1, xp: 30, unlocked: false, rewards: [reward] }] };
  const card = buildAchievementCard(input);
  assert.deepEqual(card.nextRewardRefs, [reward]);
  assert.notEqual(card.nextRewardRefs[0], reward);
  assert.equal(card.description, input.description);
  assert.deepEqual(card.next.rewards, ["프레임 「공개 견본」"]);
  assert.equal(input.tiers[0].unlocked, false);
});

test("empty and sealed album does not synthesize hidden cards or rewards", () => {
  const screen = buildAchievementScreen({ achievements: [], hidden: { discovered: 0, achievements: [] } });
  assert.deepEqual(screen.sections, []);
  assert.deepEqual(screen.hidden.cards, []);
  assert.equal(screen.hidden.label, "발견 0 / ??");
  assert.deepEqual(buildAchievementCard({ achievementId: "fixture", tiers: [] }).nextRewardRefs, []);
});

test("seen result requery cannot animate confirmed XP as a new unlock", () => {
  const reveal = buildResultReveal({ xpTotal: 30, achievements: [{ achievementId: "fixture", tiers: [{ seen: true, unlockId: "seen", xp: { amount: 30 }, rewards: [] }] }] });
  assert.deepEqual(reveal.items, []);
  assert.deepEqual(reveal.unlockIds, []);
});
