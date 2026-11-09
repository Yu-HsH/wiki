// Disposable GitHub Actions Docker only. NEVER points at linked production.
import fs from "node:fs";
import path from "node:path";
import {
  EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli, runPsql,
} from "./supabase-runtime-common.mjs";
import { parseTapTranscript } from "./supabase-runtime-validation.mjs";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.CI !== "true") {
  throw new Error("REFUSED: disposable GitHub Actions runner required");
}
if (process.env.SUPABASE_DB_CONTAINER || process.env.WIKI_VALIDATION_WORKDIR) {
  throw new Error("REFUSED: no container/workdir override in this QA");
}
if (readProjectId() !== TARGET_PROJECT_ID) {
  throw new Error("REFUSED: wrong local project");
}
const cli = runCli(["--version"]);
if (cli.status !== 0 || cli.stdout.trim() !== EXPECTED_CLI_VERSION) {
  throw new Error("REFUSED: incorrect pinned Supabase CLI");
}
const container = expectedDbContainer();
const inspected = inspectContainer(container);
if (inspected.status !== 0) throw new Error("LOCAL DB CONTAINER NOT FOUND");
const state = JSON.parse(inspected.stdout);
if (state.State?.Health?.Status !== "healthy") throw new Error("LOCAL DB NOT HEALTHY");

const testSql = fs.readFileSync(path.join(repoRoot, "supabase/tests/public_waiting_room_expiry_v1.sql"), "utf8");
const result = runPsql(container, testSql, {timeout: 180000});
if (result.status !== 0) {
  console.error(result.stdout.slice(-12000));
  console.error(result.stderr.slice(-12000));
  throw new Error("LOCAL PGTAP SQL ERROR");
}
const transcript = result.stdout.replace(/\r\n/g,"\n");
const plans = [...transcript.matchAll(/^\s*1\.\.(\d+)\s*$/gm)].map(x=>Number(x[1]));
if (plans.length !== 1 || plans[0] < 1) {
  console.error(transcript.slice(-12000));
  throw new Error("PGTAP PLAN MISSING");
}
const resultTap = parseTapTranscript(transcript, plans[0]);
if (!resultTap.pass) {
  console.error(transcript.slice(-12000));
  throw new Error("LOCAL PGTAP FAILED: " + resultTap.detail);
}
console.log("PASS local-only public room TTL pgTAP: " + resultTap.detail);
