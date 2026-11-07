#!/usr/bin/env node
/** Reproducible research only — no API keys, external calls or production changes. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { summarizeEntrywayValidation } from "../utils/courseEntrywayResearch.js";
import { proposeTargetHandling } from "../utils/courseTargetSuitabilityResearch.js";

const filename=fileURLToPath(new URL("../data/research/entryway-validation-17-group-courses-20261107.json", import.meta.url));
const fixtures=JSON.parse(readFileSync(filename,"utf8")).cases;
const analysis=summarizeEntrywayValidation(fixtures);
const policyExamples=[
  {surface:"automatic_target", pageprops:{disambiguation:true}},
  {surface:"automatic_target", contentReview:{tier:"explicit_or_high_risk",reviewed:true}},
  {surface:"public_room", contentReview:{tier:"explicit_or_high_risk",reviewed:true}},
  {surface:"user_selected", contentReview:{tier:"sensitive_non_graphic",reviewed:true}},
  {surface:"article_navigation", contentReview:{tier:"explicit_or_high_risk",reviewed:true}},
].map(({surface,...evidence})=>proposeTargetHandling(evidence,{surface}));
if(process.argv.includes("--json")){
  console.log(JSON.stringify({analysis,policyExamples},null,2));
}else{
  console.log("Wiki Race — read-only last-mile evidence, 17 real group room cohorts");
  console.table(analysis.cases.map(x=>({
    caseId:x.caseId, finished:String(x.finished)+"/"+String(x.players),
    state:x.analysis.reviewState,
    cachedInbound:x.analysis.cachedIncomingSources,
    earlyLinks:x.analysis.cachedFirst50Links,
    autoReject:x.analysis.autoReject
  })));
  console.log("Zero-finisher cases",analysis.observedNoFinisherRooms,
    "with no observed cached inbound",analysis.noFinisherWithCachedGap);
  console.log("CAUTION: cached gap != impossible; group outcome != objective difficulty.");
  console.table(policyExamples.map(x=>({
    surface:x.surface, proposal:x.proposal, enforcementActive:x.enforcementActive
  })));
}
