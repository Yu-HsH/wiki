import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rewardPresentation, earnedRewardRefs, filterOwnedRewards } from "../utils/achievementDecoration.js";

const ref = (kind, extra = {}) => ({ rewardId: "fixture", displayName: "공개 견본", kind, assetRef: null, ...extra });
test("acquisition from result and inventory ownership remain distinct", () => {
  assert.match(rewardPresentation(ref("title"), { acquired: true }).acquisition, /획득 확인.*별도 확인/);
  assert.match(rewardPresentation(ref("title")).acquisition, /확인 불가/);
  assert.match(rewardPresentation(ref("title"), { ownedIds: new Set() }).acquisition, /미보유/);
  assert.match(rewardPresentation(ref("title"), { ownedIds: new Set(["fixture"]) }).acquisition, /보유 확인/);
});
test("titles and backgrounds explain where players equip them", () => {
  assert.equal(rewardPresentation(ref("title")).support, "supported");
  assert.equal(rewardPresentation(ref("profile_icon")).support, "limited");
  assert.match(rewardPresentation(ref("title")).description, /프로필 카드.*대표 칭호/);
  assert.match(rewardPresentation(ref("background")).description, /프로필 카드 배경/);
  assert.equal(rewardPresentation(ref("background")).equipSupported, true);
});
test("collection-only and future kinds do not claim equipment or live effects", () => {
  for (const kind of ["path_effect", "spectator_emoji", "future", "toString", null]) {
    const state = rewardPresentation(ref(kind), { ownedIds: new Set(["fixture"]) });
    assert.equal(state.equipSupported, false);
    assert.equal(state.support, "unsupported");
    assert.match(state.equipment, /장착 미지원/);
  }
});
test("match expressions disclose the implemented modes rather than promising every game", () => {
  assert.match(rewardPresentation(ref("finish_effect")).description, /싱글.*1:1 대전에서 승리/);
  assert.match(rewardPresentation(ref("path_color")).description, /싱글 결과.*탐험 경로/);
});
test("retired equipment stays visible without permitting new equipment", () => {
  const reward = ref("frame", { retired: true });
  assert.match(rewardPresentation(reward, { equippedId: "fixture" }).equipment, /장착 중.*해제만/);
  assert.match(rewardPresentation(reward).equipment, /새 장착 불가/);
});
test("earned specimens use only unlocked tiers, deduplicate and never mutate source", () => {
  const reward = ref("title");
  const response = { achievements: [{ achievementId: "public-fixture", tiers: [
    { unlocked: true, rewards: [reward, reward] },
    { unlocked: false, rewards: [ref("frame", { rewardId: "next" })] },
  ] }], hidden: { achievements: [] } };
  const snapshot = JSON.stringify(response);
  assert.deepEqual(earnedRewardRefs(response).get("public-fixture"), [reward]);
  assert.notEqual(earnedRewardRefs(response).get("public-fixture")[0], reward);
  assert.equal(JSON.stringify(response), snapshot);
  assert.deepEqual([...earnedRewardRefs(null)], []);
});
test("an unrevealed hidden tier cannot contribute an earned specimen", () => {
  const response = { hidden: { achievements: [{ achievementId: "fixture-only", tiers: [{ unlocked: false, rewards: [ref("title")] }] }] } };
  assert.deepEqual(earnedRewardRefs(response).get("fixture-only"), []);
});
test("new presenters and style changes introduce no hidden seed identifiers, names or conditions", () => {
  const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const seed = read("supabase/migrations/20261002090000_achievements_rewards_v1.sql");
  const hidden = [...seed.matchAll(/\('(hidden_[a-z0-9_]+)', '[a-z]+', true, '[a-z]+', '[a-z0-9_]+',\s*'[^']*',\s*'[a-z_]+', '[a-z]+', '([^']+)', '([^']+)'/g)];
  const rewards = [...seed.matchAll(/\('([a-z0-9_]+)',\s+'[a-z_]+',\s+'([^']+)',\s+'[^']*', null, false\)/g)];
  assert.ok(hidden.length > 0 && rewards.length > 0);
  const secrets = [...hidden.flatMap(([, id, name, condition]) => [id, name, condition]), ...rewards.flatMap(([, id, name]) => [id, name])];
  for (const path of ["components/AchievementRewardPreview.jsx", "components/ProfileRewardEditor.jsx", "components/ResultAchievements.jsx", "components/SingleAchievementCard.jsx", "pages/AchievementsPage.jsx", "utils/achievementDecoration.js", "css/wikiRaceAlbum.css", "css/wikiRaceCollection.css", "scripts/rewards-ux-browser.mjs"]) {
    for (const secret of secrets) assert.equal(read(path).includes(secret), false, path);
  }
});

test("practice import graph contains no services, authentication client or connected pages", () => {
  const seen = new Set();
  function visit(url) {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    assert.doesNotMatch(url.pathname, /\/(services|pages)\/|authContext|supabaseClient/);
    const source = readFileSync(url, "utf8");
    for (const [, relative] of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) visit(new URL(relative, url));
  }
  visit(new URL("../components/AchievementRewardPreview.jsx", import.meta.url));
  assert.ok(seen.size > 1, "checks transitive local imports, not only the entry file");
});

test("preview title anchor contains real controls, opens only on opt-in, and never leaks to production view", async t => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { parseFragment } = await import("parse5");
  const { StaticRouter } = await import("react-router");
  const server = await createServer({ configFile: false, envFile: false, appType: "custom",
    server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  t.after(() => server.close());
  const { ProfileRewardEditorPreview, RewardEditorView } = await server.ssrLoadModule("/components/AchievementRewardPreview.jsx");
  const reward = ref("title", { rewardId: "practice:title:fixture" });
  const props = { card: { nickname: "연습 카드" }, owned: [reward], goals: [], matchExpression: {}, onPreviewAction: () => {} };
  const nodes = html => {
    const result = [];
    const visit = node => { result.push(node); for (const child of node.childNodes ?? []) visit(child); };
    visit(parseFragment(html)); return result;
  };
  const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
  const render = (Component, input) => nodes(renderToStaticMarkup(Component === RewardEditorView
    ? createElement(StaticRouter, null, createElement(Component, input)) : createElement(Component, input)));
  const baseline = render(ProfileRewardEditorPreview, props);
  assert.equal(baseline.filter(node => attr(node, "data-tutorial-anchor") !== undefined).length, 0);
  assert.equal(baseline.filter(node => attr(node, "aria-expanded") === "true").length, 0);
  const anchored = render(ProfileRewardEditorPreview, { ...props, previewAnchors: { titleControls: "growth.title-controls" }, initialOpenSlot: "title" });
  const targets = anchored.filter(node => attr(node, "data-tutorial-anchor") === "growth.title-controls");
  assert.equal(targets.length, 1);
  assert.equal(targets[0].tagName, "li", "the title row, never the whole editor wrapper");
  const descendants = nodes(renderToStaticMarkup(createElement(ProfileRewardEditorPreview, { ...props,
    card: { ...props.card, title: reward }, previewAnchors: { titleControls: "growth.title-controls" }, initialOpenSlot: "title" })));
  assert.equal(anchored.filter(node => attr(node, "aria-expanded") === "true").length, 1);
  assert.ok(anchored.some(node => node.tagName === "button" && attr(node, "aria-pressed") === "false" && attr(node, "disabled") === undefined));
  assert.ok(descendants.some(node => node.tagName === "button" && node.childNodes?.some(child => child.value === "연습용 해제") && attr(node, "disabled") === undefined));
  const ignored = render(ProfileRewardEditorPreview, { ...props, previewAnchors: { titleControls: " " }, initialOpenSlot: "frame" });
  assert.equal(ignored.filter(node => attr(node, "data-tutorial-anchor") !== undefined).length, 0);
  assert.equal(ignored.filter(node => attr(node, "aria-expanded") === "true").length, 0);
  const production = render(RewardEditorView, { ...props, matchStatus: "ready", onAction: () => {}, preview: false,
    previewAnchors: { titleControls: "growth.title-controls" }, initialOpenSlot: "title" });
  assert.equal(production.filter(node => attr(node, "data-tutorial-anchor") !== undefined).length, 0);
  assert.equal(production.filter(node => attr(node, "aria-expanded") === "true").length, 0);
  assert.equal(baseline.filter(node => node.tagName === "input" && attr(node,"type") === "search").length,0,"tutorial stays compact");
  assert.equal(production.filter(node => node.tagName === "input" && attr(node,"type") === "search").length,1,"live collection can be searched");
});

test("collection search uses only supplied owned names, type and confirmed equipment without changing inputs", () => {
  const owned = [
    ref("title", {rewardId:"a",displayName:"TRAIL 칭호"}),
    ref("frame", {rewardId:"b",displayName:"연습 테두리"}),
    ref("title", {rewardId:"retired",retired:true}),
  ];
  const before=JSON.stringify(owned);
  assert.deepEqual(filterOwnedRewards(owned,{query:" trail "}).map(r=>r.rewardId),["a"]);
  assert.deepEqual(filterOwnedRewards(owned,{query:"ＴＲＡＩＬ",kind:"title"}).map(r=>r.rewardId),["a"]);
  assert.deepEqual(filterOwnedRewards(owned,{status:"equipped",equippedIds:new Set(["a"])}).map(r=>r.rewardId),["a"]);
  assert.deepEqual(filterOwnedRewards(owned,{status:"available",equippedIds:new Set(["a"])}).map(r=>r.rewardId),["b"]);
  assert.deepEqual(filterOwnedRewards(owned,{kind:"background"}),[]);
  assert.deepEqual(filterOwnedRewards(null),[]);
  assert.equal(JSON.stringify(owned),before);
});
