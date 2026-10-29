import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, validationTarget, assertLocalApiTarget, runCli, runPsql } from '../scripts/supabase-runtime-common.mjs';

test('isolated validation refuses cross-project API, CLI and SQL before I/O', () => {
  const base=path.join(repoRoot,'.temp','next-goal-20261014');fs.mkdirSync(base,{recursive:true});
  const workdir=fs.mkdtempSync(path.join(base,'guard-test-'));
  fs.mkdirSync(path.join(workdir,'supabase'));
  fs.writeFileSync(path.join(workdir,'supabase','config.toml'),'project_id = "wiki-next-goal-guard-test"\n[api]\nport = 55421\n');
  const names=['WIKI_VALIDATION_WORKDIR','WIKI_VALIDATION_PROJECT_ID','SUPABASE_DB_CONTAINER'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
    process.env.WIKI_VALIDATION_WORKDIR=workdir;process.env.WIKI_VALIDATION_PROJECT_ID='wiki-next-goal-guard-test';delete process.env.SUPABASE_DB_CONTAINER;
    assert.equal(validationTarget().container,'supabase_db_wiki-next-goal-guard-test');
    assert.doesNotThrow(()=>assertLocalApiTarget('http://127.0.0.1:55421'));
    for(const url of ['http://127.0.0.1:54321','https://example.supabase.co','http://192.168.0.1:55421'])assert.throws(()=>assertLocalApiTarget(url),/REFUSED/);
    assert.throws(()=>runCli(['db','push','--linked']),/REFUSED/);
    assert.throws(()=>runCli(['db','push']),/REFUSED/);
    assert.throws(()=>runCli(['db','query','--db-url','https://example.supabase.co']),/REFUSED/);
    assert.throws(()=>runCli(['db','query','--local','--db-url=https://example.supabase.co']),/REFUSED/);
    assert.throws(()=>runCli(['--workdir='+repoRoot,'status']),/REFUSED/);
    assert.throws(()=>runCli(['--workdir',repoRoot,'status']),/REFUSED/);
    assert.throws(()=>runPsql('supabase_db_wiki-packet13-r2-clean158','select 1'),/REFUSED/);
    process.env.WIKI_VALIDATION_PROJECT_ID='wiki-packet13-r2-clean158';assert.throws(()=>validationTarget(),/REFUSED/);
    process.env.WIKI_VALIDATION_PROJECT_ID='wiki-next-goal-guard-test';process.env.WIKI_VALIDATION_WORKDIR=repoRoot;assert.throws(()=>validationTarget(),/REFUSED/);
  } finally {
    for(const name of names)if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];
    // Only this newly created, resolved directory can be removed.
    const resolved=fs.realpathSync(workdir);assert.ok(resolved.startsWith(fs.realpathSync(base)+path.sep));fs.rmSync(resolved,{recursive:true});
  }
});
