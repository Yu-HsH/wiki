import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_CATEGORY_ORDER,
  HIDDEN_KIND_LABELS,
  REWARD_KIND_LABELS,
  buildAchievementCard,
  buildAchievementScreen,
  buildAchievementSummary,
  buildResultReveal,
  formatHiddenDiscovered,
  formatNewAchievementNotice,
  formatRewardRef,
  formatTierLabel,
  shouldShowAchievementNotice,
} from "../utils/achievementDisplay.js";

// Track 16c: the achievement screen, the result reveal, the lobby notice and the profile summary.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const migration = read("supabase/migrations/20261002090000_achievements_rewards_v1.sql");

const reward = (rewardId, kind, displayName) => ({ rewardId, kind, displayName, assetRef: null });
const tier = (n, threshold, xp, extra = {}) => ({
  tier: n, threshold, xp, rewards: [], unlocked: false, unlockId: null, unlockedAt: null, seen: false, ...extra,
});

const wideWorld = {
  achievementId: "explore_unique_documents",
  category: "exploration",
  hidden: false,
  hiddenKind: null,
  name: "넓어진 세계",
  condition: "고유 문서 100 / 500 / 2,000개 방문",
  current: 140,
  tierCount: 3,
  unlockedTier: 1,
  nextThreshold: 500,
  tiers: [
    tier(1, 100, 30, { unlocked: true, unlockId: "u1", unlockedAt: "2026-10-03T01:00:00Z", seen: false }),
    tier(2, 500, 60, { rewards: [reward("frame_wide_world_2", "frame", "넓어진 세계 II")] }),
    tier(3, 2000, 120),
  ],
};

const firstArrival = {
  achievementId: "onboarding_first_finish",
  category: "onboarding",
  hidden: false,
  hiddenKind: null,
  name: "첫 도착",
  condition: "처음으로 정상 완주",
  current: 1,
  tierCount: 1,
  unlockedTier: 1,
  nextThreshold: null,
  tiers: [tier(1, 1, 30, { unlocked: true, unlockId: "u2", unlockedAt: "2026-10-03T02:00:00Z", seen: true })],
};

// Hidden cards come from the server only — this fixture uses a made-up name on purpose.
const foundHidden = {
  achievementId: "hidden_fixture",
  category: "exploration",
  hidden: true,
  hiddenKind: "challenge",
  name: "테스트 히든",
  condition: "테스트 조건",
  current: null,
  tierCount: 1,
  unlockedTier: 1,
  nextThreshold: null,
  tiers: [tier(1, 1, 120, { unlocked: true, unlockId: "u3", unlockedAt: "2026-10-03T03:00:00Z", seen: false })],
};

test("labels: categories match the DB CHECK, kinds match the C1 kinds and spec §9.2", () => {
  const check = migration.match(/category = any \(array\[([\s\S]*?)\]::text\[\]\)/);
  assert.ok(check);
  const dbCategories = [...check[1].matchAll(/'([a-z_]+)'/g)].map(([, value]) => value);
  assert.deepEqual([...ACHIEVEMENT_CATEGORY_ORDER], dbCategories, "same set, same order");
  for (const category of dbCategories) assert.ok(ACHIEVEMENT_CATEGORY_LABELS[category], category);

  const c1 = read("supabase/migrations/20261001090000_c1_reward_tables_v1.sql");
  const kinds = [...c1.match(/reward_catalog_kind_check check \(kind = any \(array\[([\s\S]*?)\]/)[1].matchAll(/'([a-z_]+)'/g)]
    .map(([, value]) => value);
  // 16d: 배지 kind 폐지 — 라벨은 C1 kind에서 badge를 뺀 8종 (16d-2가 DB CHECK에서도 뺀다)
  assert.deepEqual(Object.keys(REWARD_KIND_LABELS).sort(), kinds.filter((kind) => kind !== "badge").sort());
  assert.deepEqual({ ...HIDDEN_KIND_LABELS }, { fun: "재미", discovery: "발견", challenge: "도전" });
});

test("formatting: tiers, rewards, the hidden count and the lobby notice", () => {
  assert.equal(formatTierLabel(2, 3), "II");
  assert.equal(formatTierLabel(1, 1), "", "a single-tier achievement has no tier mark");
  assert.equal(formatRewardRef(reward("title_x", "title", "승부사")), "칭호 「승부사」");
  assert.equal(formatRewardRef({ kind: "badge", displayName: " " }), null);
  assert.equal(formatHiddenDiscovered(3), "발견 3 / ??");
  assert.equal(formatHiddenDiscovered(undefined), "발견 0 / ??");
  assert.equal(formatNewAchievementNotice(2), "새 업적 2개");
  assert.equal(formatNewAchievementNotice(0), null);
});

test("buildAchievementCard: tier, progress toward the next threshold, next reward, NEW", () => {
  const card = buildAchievementCard(wideWorld);
  assert.equal(card.tierLabel, "I");
  assert.deepEqual(card.progress, { current: 140, next: 500, percent: 28, label: "140 / 500" });
  assert.deepEqual(card.next, { tierLabel: "II", xp: 60, rewards: ["프레임 「넓어진 세계 II」"] });
  assert.equal(card.complete, false);
  assert.equal(card.isNew, true);
  assert.deepEqual(card.newUnlockIds, ["u1"]);
  assert.deepEqual(card.steps.map((step) => [step.label, step.unlocked]), [["I", true], ["II", false], ["III", false]]);

  const done = buildAchievementCard(firstArrival);
  assert.equal(done.complete, true);
  assert.equal(done.next, null);
  assert.equal(done.progress, null);
  assert.equal(done.isNew, false, "seen unlocks are not NEW");
});

test("buildAchievementCard: a once-type achievement has no 0 / 1 bar", () => {
  const ready = buildAchievementCard({
    ...firstArrival, achievementId: "onboarding_profile_complete", displayPolicy: "once",
    current: 0, unlockedTier: 0, nextThreshold: 1, tiers: [tier(1, 1, 30)],
  });
  assert.equal(ready.progress, null);
  assert.equal(ready.next.xp, 30);
  assert.equal(buildAchievementCard({ ...wideWorld, displayPolicy: "counter" }).progress.label, "140 / 500");
});

test("buildAchievementCard: hidden cards carry no progress and show their kind", () => {
  const card = buildAchievementCard(foundHidden);
  assert.equal(card.hidden, true);
  assert.equal(card.kindLabel, "도전");
  assert.equal(card.progress, null);
  assert.equal(card.complete, true);
});

test("buildAchievementScreen: sections in category order, one hidden card `발견 n / ??`", () => {
  const screen = buildAchievementScreen({
    ok: true,
    achievements: [wideWorld, firstArrival],
    hidden: { discovered: 1, achievements: [foundHidden] },
    unseenCount: 2,
  });
  assert.deepEqual(screen.sections.map((section) => section.label), ["첫걸음", "탐험"]);
  assert.equal(screen.hidden.label, "발견 1 / ??");
  assert.equal(screen.hidden.isNew, true);
  assert.equal(screen.unseenCount, 2);

  const empty = buildAchievementScreen({ ok: true, achievements: [], hidden: { discovered: 0, achievements: [] }, unseenCount: 0 });
  assert.equal(empty.hidden.label, "발견 0 / ??", "the hidden card is always there");
});

test("buildAchievementSummary: count with no denominator, latest three unlocks", () => {
  const summary = buildAchievementSummary({
    achievements: [wideWorld, firstArrival, { ...wideWorld, achievementId: "x", unlockedTier: 0, tiers: [tier(1, 10, 30)] }],
    hidden: { discovered: 1, achievements: [foundHidden] },
  });
  assert.equal(summary.achieved, 3, "2 general with a tier + 1 hidden");
  assert.deepEqual(summary.recent.map((unlock) => unlock.name), ["테스트 히든", "첫 도착", "넓어진 세계"]);
  assert.equal(summary.recent[2].tierLabel, "I");
  assert.equal(Object.hasOwn(summary, "total"), false, "no total — the hidden count stays secret");
});

test("buildResultReveal: server order (hidden first), several tiers fold into one card", () => {
  const reveal = buildResultReveal({
    ok: true,
    achievements: [
      {
        achievementId: "hidden_fixture", hidden: true, hiddenKind: "fun", name: "테스트 히든", condition: "c",
        tierCount: 1, xpTotal: 30,
        tiers: [{ unlockId: "h1", tier: 1, threshold: 1, xp: { amount: 30, ledgerId: "l1" }, rewards: [reward("t", "title", "칭호명")] }],
      },
      {
        achievementId: "explore_unique_documents", hidden: false, hiddenKind: null, name: "넓어진 세계", condition: "c",
        tierCount: 3, xpTotal: 90,
        tiers: [
          { unlockId: "g1", tier: 1, threshold: 100, xp: { amount: 30 }, rewards: [] },
          { unlockId: "g2", tier: 2, threshold: 500, xp: { amount: 60 }, rewards: [reward("f", "frame", "넓어진 세계 II")] },
        ],
      },
    ],
    xpTotal: 120,
  });
  assert.deepEqual(reveal.items.map((item) => item.hidden), [true, false]);
  assert.equal(reveal.items[0].kindLabel, "재미");
  assert.equal(reveal.items[1].tierLabel, "II", "two tiers at once → the higher one");
  assert.equal(reveal.items[1].xp, 90);
  assert.deepEqual(reveal.items[1].rewards, ["프레임 「넓어진 세계 II」"]);
  assert.equal(reveal.xpTotal, 120);
  assert.deepEqual(reveal.unlockIds, ["h1", "g1", "g2"]);

  assert.equal(buildResultReveal(null), null);
  assert.deepEqual(buildResultReveal({ ok: true, achievements: [], xpTotal: 0 }).items, []);
});

test("lobby notice: closing hides it for the session; more unseen later shows it again", () => {
  assert.equal(shouldShowAchievementNotice(2, null), true);
  assert.equal(shouldShowAchievementNotice(2, "2"), false, "dismissed at 2");
  assert.equal(shouldShowAchievementNotice(3, "2"), true, "a new unlock after dismissing");
  assert.equal(shouldShowAchievementNotice(0, null), false);
});

/* ── G5: no hidden name, condition or reward name in the front bundle (16c 수용조건) ── */

const FRONT_FILES = [
  "utils/achievementDisplay.js",
  "services/achievementService.js",
  "components/ResultAchievements.jsx",
  "components/ResultXp.jsx",
  "pages/AchievementsPage.jsx",
  "pages/MainPage.jsx",
  "pages/ProfilePage.jsx",
  "utils/xpResultDisplay.js",
  // 16d
  "utils/rewardTokens.js",
  "utils/profileCard.js",
  "components/ProfileCard.jsx",
  "components/ProfileRewardEditor.jsx",
  "components/FinishEffect.jsx",
  "hooks/useMatchExpression.js",
  "services/profileRewardService.js",
  "components/SuccessOverlay.jsx",
  "css/profileCard.css",
  "css/matchExpression.css",
  ...readdirSync(`${root}/public/profile-icons/x`).map((name) => `public/profile-icons/x/${name}`),
  ...readdirSync(`${root}/public/profile-icons`).filter((name) => name.endsWith(".svg")).map((name) => `public/profile-icons/${name}`),
];

test("G5: hidden achievement IDs, names, conditions and hidden reward names are not in front code", () => {
  const hiddenRows = [...migration.matchAll(
    /\('(hidden_[a-z0-9_]+)', '[a-z]+', true, '[a-z]+', '[a-z0-9_]+',\s*'[^']*',\s*'[a-z_]+', '[a-z]+', '([^']+)', '([^']+)'/g
  )];
  assert.equal(hiddenRows.length, 10, "16-HANDOFF §2: 10 hidden seeded");
  const hiddenRewards = [...migration.matchAll(/\('([a-z0-9_]+)',\s+'[a-z_]+',\s+'([^']+)',\s+'[^']*', null, false\)/g)];
  assert.equal(hiddenRewards.length, 15, "16-HANDOFF §3.2: 15 unlisted rewards");

  const secrets = [
    ...hiddenRows.flatMap(([, id, name, condition]) => [id, name, condition]),
    ...hiddenRewards.flatMap(([, id, name]) => [id, name]),
  ];
  for (const file of FRONT_FILES) {
    const source = read(file);
    for (const secret of secrets) {
      assert.equal(source.includes(secret), false, `${file} contains "${secret}"`);
    }
  }
});

/* ── wiring ── */

test("wiring: route, lobby entry and notice, profile summary, stylesheet", () => {
  const app = read("App.jsx");
  assert.match(app, /path="\/achievements" element=\{<ProtectedRoute><AchievementsPage \/><\/ProtectedRoute>\}/);

  const lobby = read("pages/MainPage.jsx");
  assert.match(lobby, /navigate\("\/achievements"\)/);
  assert.match(lobby, /shouldShowAchievementNotice\(unseenAchievements, achievementNoticeDismissed\)/);
  assert.match(lobby, /sessionStorage\.setItem\(ACHIEVEMENT_NOTICE_SESSION_KEY/);
  assert.doesNotMatch(lobby, /markAchievementsSeen/, "seen only on the achievement screen");

  const page = read("pages/AchievementsPage.jsx");
  assert.match(page, /markAchievementsSeen\(\)/, "entering the screen marks everything seen");

  const profile = read("pages/ProfilePage.jsx");
  assert.match(profile, /buildAchievementSummary\(response\)/);

  const styles = read("appStyles.js");
  assert.equal((styles.match(/import "\.\/css\/achievements\.css";/g) || []).length, 1);
  const css = read("css/achievements.css");
  const selectors = [...css.matchAll(/^([^\s/{}@][^{}]*)\{/gm)].map(([, selector]) => selector.trim())
    .filter((selector) => !/^(from|to)$/.test(selector));
  assert.ok(selectors.length > 0);
  for (const selector of selectors) {
    for (const part of selector.split(",")) assert.match(part.trim(), /^\.ach-/, part);
  }
});

test("wiring: the reveal honours reduced motion and marks only what it showed", () => {
  const reveal = read("components/ResultAchievements.jsx");
  assert.match(reveal, /prefers-reduced-motion: reduce/);
  assert.match(reveal, /items\s*\.slice\(0, visible\)\s*\.flatMap\(\(item\) => item\.unlockIds\)/);
  const css = read("css/achievements.css");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/, "animation only when motion is allowed");

  const xp = read("components/ResultXp.jsx");
  assert.match(xp, /loadAchievements\("single", sourceId\)/);
  assert.match(xp, /loadAchievements\("duel", result\.matchId\)/);
  assert.match(xp, /fetchLevelAtTotalXp\(summary\.totalXp - view\.totalAmount\)/);
});
