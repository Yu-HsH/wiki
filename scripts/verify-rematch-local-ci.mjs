import fs from "node:fs";
import path from "node:path";
import {
  EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli, runPsql,
} from "./supabase-runtime-common.mjs";
import { parseTapTranscript } from "./supabase-runtime-validation.mjs";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" ||
    process.env.WIKI_VALIDATION_WORKDIR || process.env.SUPABASE_DB_CONTAINER ||
    readProjectId() !== TARGET_PROJECT_ID) {
  throw new Error("REFUSED: ONLY disposable GitHub Actions local Supabase");
}
const cli=runCli(["--version"]);
if(cli.status!==0 || cli.stdout.trim()!==EXPECTED_CLI_VERSION) {
  throw new Error("REFUSED: unpinned Supabase CLI");
}
const container=expectedDbContainer();
const checked=inspectContainer(container);
if(checked.status!==0 || JSON.parse(checked.stdout).State?.Health?.Status!=="healthy") {
  throw new Error("REFUSED: local database not healthy");
}
const sql=fs.readFileSync(path.join(repoRoot,"supabase/tests/multiplayer_rematch_v1.sql"),"utf8");
const r=runPsql(container,sql,{timeout:180000});
if(r.status!==0){
  console.error(r.stdout.slice(-14000));
  console.error(r.stderr.slice(-14000));
  throw new Error("REMATCH PG TAP SQL ERROR");
}
const output=r.stdout.replace(/\r\n/g,"\n");
const plans=[...output.matchAll(/^\s*1\.\.(\d+)\s*$/gm)].map(x=>Number(x[1]));
if(plans.length!==1 || plans[0]<1)throw new Error("Rematch pgTAP plan missing");
const parsed=parseTapTranscript(output,plans[0]);
if(!parsed.pass){
  console.error(output.slice(-14000));
  throw new Error("REMATCH PGTAP FAILED: "+parsed.detail);
}
console.log("PASS local-only multiplayer rematch pgTAP: "+parsed.detail);
