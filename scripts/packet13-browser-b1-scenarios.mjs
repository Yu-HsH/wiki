export const PACKET13_B1_SCENARIOS = Object.freeze([
  Object.freeze({ name: "two-player-start-rejected", playerCount: 2 }),
  Object.freeze({ name: "three-player-move-and-f5", playerCount: 3 }),
  Object.freeze({ name: "waiting-host-f5", playerCount: 3 }),
  Object.freeze({ name: "playing-host-offline", playerCount: 3 }),
  Object.freeze({ name: "playing-host-explicit-leave", playerCount: 3 }),
  Object.freeze({ name: "unfinished-emoji-rejected", playerCount: 4 }),
  Object.freeze({ name: "spectator-mute-ui", playerCount: 4 }),
  Object.freeze({ name: "four-player-grace-and-spectator-f5", playerCount: 4 }),
  Object.freeze({ name: "five-player-smoke", playerCount: 5 }),
  Object.freeze({ name: "six-player-smoke", playerCount: 6 }),
  Object.freeze({ name: "seven-player-smoke", playerCount: 7 }),
  Object.freeze({ name: "eight-player-capacity", playerCount: 8, rejectedJoinAttempts: 1 }),
]);

export function validatePacket13B1ScenarioConfigs(configs = PACKET13_B1_SCENARIOS) {
  if (!Array.isArray(configs) || configs.length !== 12) {
    throw new Error("Packet 13 B1 must define exactly 12 scenarios");
  }
  const names = new Set();
  for (const config of configs) {
    if (!config || typeof config.name !== "string" || !config.name) {
      throw new Error("Packet 13 B1 scenario name is required");
    }
    if (names.has(config.name)) throw new Error(`duplicate Packet 13 B1 scenario: ${config.name}`);
    names.add(config.name);
    if (!Number.isInteger(config.playerCount) || config.playerCount < 2 || config.playerCount > 8) {
      throw new Error(`invalid Packet 13 B1 playerCount for ${config.name}`);
    }
    const rejectedJoinAttempts = config.rejectedJoinAttempts ?? 0;
    if (!Number.isInteger(rejectedJoinAttempts) || rejectedJoinAttempts < 0) {
      throw new Error(`invalid Packet 13 B1 rejectedJoinAttempts for ${config.name}`);
    }
    if (config.name === "eight-player-capacity" && rejectedJoinAttempts !== 1) {
      throw new Error("eight-player-capacity must define one rejected join attempt");
    }
    if (config.name !== "eight-player-capacity" && rejectedJoinAttempts !== 0) {
      throw new Error(`${config.name} must not define rejected join attempts`);
    }
  }
  return true;
}

validatePacket13B1ScenarioConfigs();

export function getPacket13B1Scenario(name) {
  const config = PACKET13_B1_SCENARIOS.find((candidate) => candidate.name === name);
  if (!config) throw new Error(`unknown Packet 13 B1 scenario: ${name}`);
  return config;
}
