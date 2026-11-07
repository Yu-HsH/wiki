#!/usr/bin/env node
/** Offline only; never queries a user record or any live API. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { summarizeTwoHopWitness, summarizeCompletedPathProfiles } from "../utils/coursePathEvidence.js";

const load = relative => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
const pairs = load("../data/research/path-quality-two-hop-20261107.json").pairs;
const runs = load("../data/research/path-quality-played-15-20261107.json").rows;
const witnesses = pairs.map(summarizeTwoHopWitness);
const history = summarizeCompletedPathProfiles(runs);
const output = { scope: "OBSERVATION_ONLY", courses: witnesses, completedHistory: history };
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log("Wiki Race 2-hop path quality evidence, latest *cached* snapshots only");
  console.table(witnesses.map(x => ({
    start: x.start, goal: x.goal, twoHop: x.cachedTwoHopMidpoints,
    firstHopChoices: x.distinctFirstHops, earliestAnchor: x.earliestFirstLinkOrdinal,
    first50Anchors: x.firstLinkInFirst50Count,
  })));
  console.log("15 anonymized completed-play profiles (NOT a difficulty ranking)");
  console.table([history]);
  console.log("Missing observed paths != unreachable. Anchor order != on-screen visibility.");
}
