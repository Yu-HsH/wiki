import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli } from "./supabase-runtime-common.mjs";

export function itemRaceBrowserRuntime(localReview) {
  if (process.env.WIKI_VALIDATION_WORKDIR || process.env.SUPABASE_DB_CONTAINER) {
    throw Error("REFUSED: browser QA does not accept a database override");
  }
  const reviewRoot = path.join(repoRoot, ".temp", "review-r1-r4");
  const workdir = localReview ? path.join(reviewRoot, "stack") : repoRoot;
  const projectId = localReview ? "wiki-playtest-review-20261128-final" : TARGET_PROJECT_ID;
  if (localReview) {
    assert.equal(fs.realpathSync(workdir), workdir, "disposable review workdir");
    const config = fs.readFileSync(path.join(workdir, "supabase", "config.toml"), "utf8");
    assert.equal(config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1], projectId);
  } else if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" || readProjectId() !== projectId) {
    throw Error("REFUSED: disposable GitHub Actions + pinned local database only");
  }

  const version = runCli(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), EXPECTED_CLI_VERSION);
  const container = expectedDbContainer(projectId);
  const checked = inspectContainer(container);
  assert.equal(checked.status, 0);
  assert.equal(JSON.parse(checked.stdout).State?.Health?.Status, "healthy");
  const status = runCli(["--workdir", workdir, "status", "-o", "env"]);
  assert.equal(status.status, 0);
  const env = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
  assert.equal(env.API_URL, localReview ? "http://127.0.0.1:59321" : "http://127.0.0.1:54321");
  assert.ok(env.ANON_KEY && env.SERVICE_ROLE_KEY);
  return { container, env, evidenceRoot: localReview ? path.join(reviewRoot, "evidence") : path.join(repoRoot, "test-results") };
}
