import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PALETTE, finishTier, frameTier, pathColor } from "../utils/rewardTokens.js";
import { matchExpressionFromEquipment } from "../utils/profileCard.js";

// Track 16d-1: frame tiers, finish effect and path color from asset_ref tokens; earned-icon SVGs.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

test("palette: the five colors are exactly DESIGN-SYSTEM §1", () => {
  const doc = read("docs/design/DESIGN-SYSTEM.md");
  const fromDoc = Object.fromEntries(
    [...doc.matchAll(/\| \S+ `(blue|purple|gold|teal|coral)` \| `(#[0-9A-F]{6})` \|/g)].map(([, name, hex]) => [name, hex])
  );
  assert.deepEqual({ ...PALETTE }, fromDoc);
});

test("tokens: frame / finish / path — unknown, null and foreign prefixes fall back to null", () => {
  assert.equal(frameTier({ assetRef: "frame:tier-3" }), "tier-3");
  assert.equal(frameTier("frame:special"), "special");
  assert.equal(frameTier({ assetRef: null }), null, "old DB: no token → default ring");
  assert.equal(frameTier({ assetRef: "frame:tier-9" }), null);
  assert.equal(frameTier({ assetRef: "finish:tier-1" }), null, "another kind's token is not a frame");
  assert.equal(finishTier({ assetRef: "finish:tier-2" }), "tier-2");
  assert.equal(finishTier(null), null);
  assert.equal(pathColor({ assetRef: "path:purple" }), "#6E56C9");
  assert.equal(pathColor({ assetRef: "path:#ff0000" }), null, "only palette names");
  assert.equal(pathColor({ assetRef: "path:toString" }), null, "no prototype keys");
});

test("matchExpressionFromEquipment: only finish_effect and path_color, old badge rows ignored", () => {
  const value = matchExpressionFromEquipment([
    { slot: "badge", slotIndex: 2, reward: { rewardId: "b", kind: "badge", displayName: "옛 배지" } },
    { slot: "finish_effect", slotIndex: 1, reward: { rewardId: "f", kind: "finish_effect", displayName: "완주", assetRef: "finish:tier-1" } },
  ]);
  assert.deepEqual(Object.keys(value), ["finish_effect", "path_color"]);
  assert.equal(value.finish_effect.rewardId, "f");
  assert.equal(value.path_color, null);
  assert.deepEqual(matchExpressionFromEquipment(null), { finish_effect: null, path_color: null });
});

test("frames: tier classes from the token, special ring outside the avatar, static under reduced motion", () => {
  const card = read("components/ProfileCard.jsx");
  assert.match(card, /const tier = frame \? frameTier\(frame\) : null;/);
  assert.match(card, /tier \? `pcard--frame-\$\{tier\}` : ""/);
  assert.match(card, /tier === "special" \? \(\s*<span className="pcard-avatar-ring">/);
  const css = read("css/profileCard.css");
  for (const tier of ["tier-1", "tier-2", "tier-3", "special"]) assert.match(css, new RegExp(`\\.pcard--frame-${tier}`));
  assert.match(css, /\.pcard--frame-tier-3 \.pcard-avatar \{\s*box-shadow: [^;]*#b98a12;/i, "III = gold ring");
  assert.match(css, /border: 2px dashed #1d8b81;/i, "special = teal dashed");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.pcard-avatar-ring::after \{\s*animation:/);
});

test("results: single = path color on the timeline + finish effect on the last node; 1:1 = winner card only", () => {
  const overlay = read("components/SuccessOverlay.jsx");
  assert.match(overlay, /useMatchExpression\(user && !user\.isGuest \? user\.id : null\)/);
  assert.match(overlay, /const pathHex = pathColor\(matchExpression\.path_color\);/);
  assert.match(overlay, /isLast \? <FinishEffect effect=\{matchExpression\.finish_effect\}>\{dot\}<\/FinishEffect> : dot/);
  assert.match(overlay, /\{ \.\.\.lineStyle, background: pathHex \}/);

  const page = read("pages/MultiplayerGamePage.jsx");
  assert.match(page, /useMatchExpression\(phase === PHASE\.SUCCESS \? user\?\.id \?\? null : null\)/);
  assert.equal((page.match(/<FinishEffect /g) || []).length, 1, "winner card only");
  const win = page.slice(page.indexOf("{(phase === PHASE.SUCCESS || phase === PHASE.OPPONENT_WIN) && ("));
  assert.match(win, /room\?\.finished_reason !== "cancelled" && phase === PHASE.SUCCESS/);
  assert.match(win, /<FinishEffect effect=\{matchExpression\.finish_effect\} \/>/);
  assert.doesNotMatch(page, /pathColor|path_color/, "no path line on the 1:1 card (16d 판정 4)");

  const fx = read("css/matchExpression.css");
  assert.match(fx, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.fx-finish--tier-3::after,/);
  const selectors = [...fx.matchAll(/^([^\s/{}@][^{}]*)\{/gm)].map(([, s]) => s.trim()).filter((s) => !/^(from|to)$/.test(s));
  for (const selector of selectors) for (const part of selector.split(",")) assert.match(part.trim(), /^\.fx-/, part);
  assert.equal((read("appStyles.js").match(/import "\.\/css\/matchExpression\.css";/g) || []).length, 1);
});

test("earned-icon SVGs: 9 files in the default format; hidden ones opaque with a generic title", () => {
  const publicIcons = ["first-arrival", "shield", "group-together", "daily-explorer"];
  for (const name of publicIcons) {
    const svg = read(`public/profile-icons/${name}.svg`);
    assert.match(svg, /^<svg[^>]*viewBox="0 0 64 64"[^>]*><rect width="64" height="64" fill="#334155"\/>/);
    assert.match(svg, /stroke="#e2e8f0" stroke-width="3"/);
    assert.match(svg, /<title>[^<]+<\/title>/);
  }
  const hidden = readdirSync(`${root}/public/profile-icons/x`);
  assert.equal(hidden.length, 5);
  for (const file of hidden) {
    assert.match(file, /^[0-9a-f]{8}\.svg$/, "opaque file name (16d 판정 5)");
    const svg = read(`public/profile-icons/x/${file}`);
    assert.match(svg, /^<svg[^>]*viewBox="0 0 64 64"/);
    assert.match(svg, /<title>획득 아이콘<\/title>/, "generic title");
  }
});
