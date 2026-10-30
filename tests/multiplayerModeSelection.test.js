import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getScopedMultiplayerMode, resolveMultiplayerMode } from "../utils/multiplayerModeSelection.js";

const page = readFileSync(new URL("../pages/MultiplayerPage.jsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../pages/MainPage.jsx", import.meta.url), "utf8");

test("PLAY's duel selection stays duel even when a previous manual choice was group", () => {
  assert.equal(getScopedMultiplayerMode("duel"), "duel");
  assert.equal(resolveMultiplayerMode("duel", "group"), "duel");
});

test("PLAY's group selection stays group even when a previous manual choice was duel", () => {
  assert.equal(getScopedMultiplayerMode("group"), "group");
  assert.equal(resolveMultiplayerMode("group", "duel"), "group");
});

test("direct unscoped multiplayer URLs still support choosing a mode", () => {
  assert.equal(getScopedMultiplayerMode(null), null);
  assert.equal(getScopedMultiplayerMode("random"), null);
  assert.equal(resolveMultiplayerMode(null, null), null);
  assert.equal(resolveMultiplayerMode(null, "duel"), "duel");
  assert.equal(resolveMultiplayerMode(null, "group"), "group");
  assert.equal(resolveMultiplayerMode("unknown", "duel"), "duel");
});

test("mode-scoped entry hides duplicate chooser while preserving room cards and returning to PLAY", () => {
  assert.match(home, /navigate\(\x60\/multiplayer\?mode=\$\{mode\}\x60\)/);
  assert.match(page, /const routeMode = getScopedMultiplayerMode\(searchParams\.get\("mode"\)\)/);
  assert.match(page, /const selectedMode = resolveMultiplayerMode\(routeMode, manualMode\)/);
  assert.match(page, /\{!routeMode && <div className="mp-mode-grid"/);
  assert.match(page, /setManualMode\("duel"\)/);
  assert.match(page, /setManualMode\("group"\)/);
  assert.match(page, /onClick=\{\(\) => navigate\("\/play"\)\}/);
  assert.match(page, /selectedMode === "duel" &&/);
  assert.match(page, /selectedMode === "group" &&/);
});
