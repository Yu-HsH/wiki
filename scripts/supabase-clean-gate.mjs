import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  expectedDbContainer,
  inspectContainer,
  parseCliArgs,
  readProjectId,
  repoRoot,
  runCli,
  runDocker,
  runProcess,
  runPsql,
  safeLogText,
  writePacket13GateMarker,
} from './supabase-runtime-common.mjs';
import {
  classifyChildProcessResult,
  evaluatePacket13LogWindow,
  evaluatePacket13RuntimeBaseline,
  parseTapTranscript,
} from './supabase-runtime-validation.mjs';

const args = parseCliArgs(process.argv.slice(2));
if (args.help) {
  console.log(`사용법: npm run supabase:clean-gate

현재 project_id의 고정 로컬 스택에서 runtime baseline을 고정하고,
Packet 13 START/END log-window 안에서 migration/TAP/concurrency/crash 회귀를
fail-closed 검증합니다. 과거 컨테이너 로그는 별도 historical evidence로만 보고합니다.
`);
  process.exit(0);
}

const projectId = readProjectId();
const container = String(args.container || expectedDbContainer(projectId));
let failed = false;

function caseLine(name, pass, detail = '') {
  console.log(`CASE ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
  if (!pass) failed = true;
}

function printProcess(label, result) {
  console.log(`${label} exit_code=${result.status}`);
  if (result.stdout) console.log(safeLogText(result.stdout.trimEnd()));
  if (result.stderr) console.error(safeLogText(result.stderr.trimEnd()));
}

function runNode(script, extra = []) {
  return runProcess(process.execPath, [path.join(repoRoot, 'scripts', script), ...extra], { timeout: 10 * 60_000 });
}

function runtimeSnapshot(runtime, postmasterStartTime) {
  return {
    containerId: runtime?.Id ?? '',
    postmasterStartTime: postmasterStartTime ?? '',
    restartCount: Number.isInteger(Number(runtime?.RestartCount)) ? Number(runtime.RestartCount) : -1,
  };
}

function readPostmaster() {
  const result = runPsql(container, 'select pg_postmaster_start_time()::text;', { timeout: 120_000 });
  if (result.status !== 0) return { value: null, result };
  return { value: result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '', result };
}

function readRuntimeBaseline() {
  const inspect = inspectContainer(container);
  if (inspect.status !== 0) return { snapshot: null, inspect, postmaster: null };
  let runtime;
  try {
    runtime = JSON.parse(inspect.stdout.trim());
  } catch (error) {
    return { snapshot: null, inspect, postmaster: { value: null, result: { status: 1, stdout: '', stderr: error.message } } };
  }
  const postmaster = readPostmaster();
  return {
    snapshot: postmaster.value === null ? null : runtimeSnapshot(runtime, postmaster.value),
    inspect,
    postmaster,
  };
}

function requireGatePass(label) {
  if (failed) throw new Error(`Packet 13 clean gate stopped after ${label}`);
}

const preflight = runNode('supabase-runtime-preflight.mjs', ['--container', container, '--defer-log-check']);
printProcess('runtime-preflight', preflight);
caseLine('runtime-preflight', preflight.status === 0, `container=${container} log_check=deferred_to_window`);
if (preflight.status !== 0) process.exit(1);

const baselineResult = readRuntimeBaseline();
const baseline = baselineResult.snapshot;
caseLine('runtime-baseline', Boolean(baseline), baseline
  ? `container_id=${baseline.containerId} postmaster=${baseline.postmasterStartTime} restart_count=${baseline.restartCount}`
  : `inspect_exit=${baselineResult.inspect?.status ?? '<missing>'} postmaster_exit=${baselineResult.postmaster?.result?.status ?? '<missing>'}`);
if (!baseline) process.exit(1);

const runId = `packet13-${randomUUID()}`;
const startMarker = writePacket13GateMarker(container, runId, 'START');
printProcess('log-window/start-marker', startMarker);
const startPass = startMarker.status === 0 && !startMarker.signal && !startMarker.timedOut;
caseLine('log-window/start-marker', startPass, `run_id=${runId}`);
if (!startPass) process.exit(1);

try {
  const logWindowSelfTest = runNode('supabase-log-window-self-test.mjs', ['--run-id', runId]);
  printProcess('log-window/self-test', logWindowSelfTest);
  const logWindowSelfTestCheck = {
    pass: logWindowSelfTest.status === 0 && !logWindowSelfTest.signal && !logWindowSelfTest.timedOut,
    detail: `expected_exit_code=0 exit_code=${logWindowSelfTest.status} signal=${logWindowSelfTest.signal || '<none>'} timed_out=${logWindowSelfTest.timedOut}`,
  };
  caseLine('log-window/self-test', logWindowSelfTestCheck.pass, logWindowSelfTestCheck.detail);
  requireGatePass('log-window/self-test');

  const harnessSelfTestScript = path.join(repoRoot, 'supabase', 'tests', 'group_final_gaps_v13_hardening_concurrency_self_test.ps1');
  const harnessSelfTest = runProcess('pwsh', [
    '-NoLogo', '-NoProfile', '-File', harnessSelfTestScript,
  ], { timeout: 2 * 60_000 });
  printProcess('harness-self-test', harnessSelfTest);
  const harnessSelfTestCheck = classifyChildProcessResult(harnessSelfTest, 0);
  caseLine('harness-self-test', harnessSelfTestCheck.pass, harnessSelfTestCheck.detail);
  requireGatePass('harness-self-test');

  // Migration evidence must come from the pinned CLI runner, not raw psql.
  const push = runCli(['--workdir', repoRoot, 'db', 'push', '--local', '--include-all', '--skip-vault', '--yes'], { timeout: 15 * 60_000 });
  printProcess('migration-runner', push);
  caseLine('official-migration-runner', push.status === 0, `project=${projectId}`);
  requireGatePass('official-migration-runner');

  const psVersion = runProcess('pwsh', ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']);
  const psVersionText = psVersion.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '';
  const major = Number.parseInt(psVersionText.split('.')[0] ?? '', 10);
  caseLine('powershell7', psVersion.status === 0 && major >= 7,
    `version=${psVersionText || '<missing>'} exit_code=${psVersion.status}`);
  if (psVersion.stderr) console.error(safeLogText(psVersion.stderr.trimEnd()));
  requireGatePass('powershell7');

  const argumentListProbe = runProcess('pwsh', [
    '-NoLogo', '-NoProfile', '-Command',
    "$p = [System.Diagnostics.ProcessStartInfo]::new(); if ($null -eq $p.ArgumentList) { exit 2 }; 'ArgumentList=available'",
  ]);
  printProcess('powershell-argumentlist-probe', argumentListProbe);
  caseLine('powershell-argumentlist', argumentListProbe.status === 0 && argumentListProbe.stdout.includes('ArgumentList=available'));
  requireGatePass('powershell-argumentlist');

  const tests = [
    ['group_final_gaps_v13.sql', 'Packet13', 33],
    ['group_spectator_emoji_atomicity.sql', 'Atomicity', 22],
    ['server_authority_v2.sql', 'V2', 97],
    ['group_security_phase2c.sql', 'Phase2C', 49],
  ];

  function assertTap(label, result, expectedCount) {
    const combined = `${result.stdout}\n${result.stderr}`;
    const tap = parseTapTranscript(combined, expectedCount);
    const process = classifyChildProcessResult(result, 0);
    const pass = process.pass && tap.pass;
    caseLine(`tap/${label}`, pass,
      `${tap.detail} ${process.detail}`);
    if (!pass) printProcess(`tap/${label}/output`, result);
  }

  for (const [file, label, count] of tests) {
    const sql = fs.readFileSync(path.join(repoRoot, 'supabase', 'tests', file), 'utf8');
    const result = runPsql(container, sql, { timeout: 10 * 60_000 });
    assertTap(label, result, count);
    requireGatePass(`tap/${label}`);
  }

  const concurrencyScript = path.join(repoRoot, 'supabase', 'tests', 'group_final_gaps_v13_hardening_concurrency.ps1');
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    const concurrency = runProcess('pwsh', [
      '-NoLogo', '-NoProfile', '-File', concurrencyScript, '-DbContainer', container, '-Scenario', 'all',
    ], { timeout: 15 * 60_000 });
    printProcess(`concurrency/repeat-${repeat}`, concurrency);
    const concurrencyCheck = classifyChildProcessResult(concurrency, 0);
    caseLine(`concurrency/repeat-${repeat}`, concurrencyCheck.pass, `container=${container} ${concurrencyCheck.detail}`);
    requireGatePass(`concurrency/repeat-${repeat}`);
  }

  const crashScript = path.join(repoRoot, 'supabase', 'tests', 'group_spectator_emoji_crash_diagnostic.ps1');
  for (const variant of ['prepare', 'new-minimal', 'anon', 'cleanup']) {
    const result = runProcess('pwsh', [
      '-NoLogo', '-NoProfile', '-File', crashScript, '-DbContainer', container, '-Variant', variant,
    ], { timeout: 10 * 60_000 });
    printProcess(`crash-regression/${variant}`, result);
    const pass = classifyChildProcessResult(result, 0).pass
      && !/^CASE FAIL\b/m.test(`${result.stdout}\n${result.stderr}`);
    caseLine(`crash-regression/${variant}`, pass, `container=${container}`);
    requireGatePass(`crash-regression/${variant}`);
  }
} catch (error) {
  failed = true;
  console.error(`FATAL packet13-clean-gate ${safeLogText(error.stack || error.message || String(error))}`);
}

const endMarker = writePacket13GateMarker(container, runId, 'END');
printProcess('log-window/end-marker', endMarker);
caseLine('log-window/end-marker', endMarker.status === 0 && !endMarker.signal && !endMarker.timedOut, `run_id=${runId}`);

const afterResult = readRuntimeBaseline();
const after = afterResult.snapshot;
const baselineCheck = evaluatePacket13RuntimeBaseline({ before: baseline, after });
caseLine('log-window/runtime-baseline', baselineCheck.pass, baselineCheck.detail);

const logs = runDocker(['logs', '--timestamps', '--tail', '2000', container]);
const logText = `${logs.stdout}\n${logs.stderr}`;
const logCheck = evaluatePacket13LogWindow({
  status: logs.status,
  text: logText,
  runId,
  baseline,
  after,
});
caseLine('postgres-log-window', logCheck.pass, logCheck.detail);
console.log(`LOG_WINDOW run_id=${runId} start_line=${logCheck.startIndex ?? '<missing>'} end_line=${logCheck.endIndex ?? '<missing>'} current_fatal=${logCheck.currentFatalMarkers.length} historical_fatal=${logCheck.historicalFatalMarkers.length}`);
if (logCheck.currentFatalMarkers.length > 0) {
  for (const finding of logCheck.currentFatalMarkers) {
    console.error(`CURRENT_LOG_MARKER marker=${finding.marker} line=${finding.lineNumber} pid=${finding.backendPid || '<unknown>'} ${safeLogText(finding.line)}`);
  }
}
if (logCheck.historicalFatalMarkers.length > 0) {
  console.log(`HISTORICAL_LOG_MARKERS classification=outside_current_window ignored_for_current_verdict count=${logCheck.historicalFatalMarkers.length}`);
  for (const finding of logCheck.historicalFatalMarkers.slice(0, 20)) {
    console.log(`HISTORICAL_LOG_MARKER marker=${finding.marker} line=${finding.lineNumber} timestamp=${finding.timestamp || '<unknown>'} pid=${finding.backendPid || '<unknown>'} container_id=${finding.containerId || '<unknown>'} postmaster=${finding.postmasterStartTime || '<unknown>'} ${safeLogText(finding.line)}`);
  }
}

console.log(`PACKET13_CLEAN_GATE run_id=${runId} container=${container} current_window_pass=${logCheck.pass} overall_pass=${!failed}`);
process.exit(failed ? 1 : 0);
