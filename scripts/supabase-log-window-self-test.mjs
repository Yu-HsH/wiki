import { parseCliArgs } from './supabase-runtime-common.mjs';
import {
  evaluatePacket13LogWindow,
  evaluatePacket13RuntimeBaseline,
} from './supabase-runtime-validation.mjs';

const args = parseCliArgs(process.argv.slice(2));
const runId = String(args['run-id'] || 'packet13-00000000-0000-0000-0000-000000000000');
const baseline = {
  containerId: 'container-158',
  postmasterStartTime: '2026-08-18 01:31:36.816875+00',
  restartCount: 0,
};
const after = { ...baseline };
const start = `PACKET13_GATE_START|${runId}`;
const end = `PACKET13_GATE_END|${runId}`;

function synthetic(lines, status = 0, afterRuntime = after) {
  return evaluatePacket13LogWindow({
    status,
    text: lines.join('\n'),
    runId,
    baseline,
    after: afterRuntime,
  });
}

function assertCase(name, result, expected) {
  if (result.pass !== expected) {
    throw new Error(`LOG_WINDOW_SELFTEST FAIL ${name}: ${result.detail}`);
  }
  console.log(`LOG_WINDOW_SELFTEST PASS ${name}`);
}

const historicalRecovery = '2026-08-18T01:31:37.000000000Z 2026-08-18 UTC [17] LOG: database system was not properly shut down; automatic recovery in progress';
const normal = '2026-08-18T01:32:00.000000000Z 2026-08-18 UTC [42] LOG: packet test completed';

assertCase('positive-historical-marker-ignored', synthetic([
  historicalRecovery,
  `2026-08-18T02:00:00.000000000Z 2026-08-18 UTC [100] LOG: ${start}`,
  normal,
  `2026-08-18T02:00:01.000000000Z 2026-08-18 UTC [100] LOG: ${end}`,
]), true);

assertCase('positive-crlf-window', synthetic([
  start,
  normal,
  end,
].join('\r\n').split('\n')), true);

assertCase('negative-start-missing', synthetic([normal, end]), false);
assertCase('negative-end-missing', synthetic([start, normal]), false);
assertCase('negative-duplicate-start', synthetic([start, start, normal, end]), false);
assertCase('negative-duplicate-end', synthetic([start, normal, end, end]), false);
assertCase('negative-reversed-markers', synthetic([end, normal, start]), false);
assertCase('negative-current-signal-11', synthetic([start, 'LOG: backend exited on signal 11', end]), false);
assertCase('negative-current-panic', synthetic([start, 'PANIC: server process terminated', end]), false);
assertCase('negative-container-changed', synthetic([start, normal, end], 0, {
  ...after,
  containerId: 'container-other',
}), false);
assertCase('negative-postmaster-changed', synthetic([start, normal, end], 0, {
  ...after,
  postmasterStartTime: '2026-08-18 03:00:00+00',
}), false);
assertCase('negative-restart-increased', synthetic([start, normal, end], 0, {
  ...after,
  restartCount: 1,
}), false);
assertCase('negative-log-command-failed', synthetic([start, normal, end], 1), false);

const baselineResult = evaluatePacket13RuntimeBaseline({ before: baseline, after });
assertCase('positive-runtime-baseline', {
  pass: baselineResult.pass,
}, true);

console.log(`LOG_WINDOW_SELFTEST COMPLETE run_id=${runId}`);
