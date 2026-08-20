import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPacket13B1Scenario,
  PACKET13_B1_SCENARIOS,
  validatePacket13B1ScenarioConfigs,
} from "../scripts/packet13-browser-b1-scenarios.mjs";

test("Packet 13 B1 smoke scenarios use explicit player counts", () => {
  assert.equal(getPacket13B1Scenario("five-player-smoke").playerCount, 5);
  assert.equal(getPacket13B1Scenario("six-player-smoke").playerCount, 6);
  assert.equal(getPacket13B1Scenario("seven-player-smoke").playerCount, 7);
  assert.deepEqual(getPacket13B1Scenario("eight-player-capacity"), {
    name: "eight-player-capacity",
    playerCount: 8,
    rejectedJoinAttempts: 1,
  });
});

test("Packet 13 B1 scenario contracts are unique and bounded", () => {
  assert.equal(validatePacket13B1ScenarioConfigs(), true);
  assert.equal(new Set(PACKET13_B1_SCENARIOS.map((scenario) => scenario.name)).size, 12);
  assert.ok(PACKET13_B1_SCENARIOS.every(({ playerCount }) => Number.isInteger(playerCount) && playerCount >= 2 && playerCount <= 8));
});

test("Packet 13 B1 runner does not derive playerCount from an array index", () => {
  const runnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "packet13-browser-b1.mjs");
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.doesNotMatch(source, /\[\[\s*4\s*,\s*SCENARIO_NAMES/);
  assert.doesNotMatch(source, /maxPlayers:\s*index/);
  assert.doesNotMatch(source, /runScenario\(name,\s*index/);
});
