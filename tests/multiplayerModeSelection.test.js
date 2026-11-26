import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getScopedMultiplayerMode, resolveMultiplayerMode } from "../utils/multiplayerModeSelection.js";
import { readRoomCode } from "../utils/roomCode.js";

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
  assert.match(page, /\{selectedMode && <section className="mp-card mp-card--create"/);
  assert.match(page, /if \(selectedMode === "duel"\)/);
});

test("room codes use their server format regardless of the mode selected in PLAY", () => {
  assert.deepEqual(readRoomCode(" jungle "), { code: "JUNGLE", family: "legacy" });
  assert.deepEqual(readRoomCode("0123abcdef45"), { code: "0123ABCDEF45", family: "group" });
  assert.deepEqual(readRoomCode("0123456789abcdef"), { code: "0123456789ABCDEF", family: "duel" });
  assert.throws(() => readRoomCode(""), /ROOM_CODE_REQUIRED/);
  assert.throws(() => readRoomCode("NOTHEX123456"), /ROOM_CODE_INVALID/);
  assert.throws(() => readRoomCode("12345678901234567"), /ROOM_CODE_INVALID/);
});
