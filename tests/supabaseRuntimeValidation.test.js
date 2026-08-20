import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChildProcessResult,
  evaluateCliVersion,
  evaluateImageIdentity,
  evaluateLogText,
  evaluateMigrationHistory,
  evaluatePacket13LogWindow,
  evaluatePacket13RuntimeBaseline,
  evaluateRepositoryDigest,
  evaluateRpcAcl,
  evaluateRpcContract,
  parseTapTranscript,
} from '../scripts/supabase-runtime-validation.mjs';

test('runtime validators reject wrong CLI/image/digest/migration/RPC ACL contracts', () => {
  assert.equal(evaluateCliVersion({ status: 0, actual: '2.113.0' }).pass, false);
  assert.equal(evaluateImageIdentity({ image: 'wrong', imageId: 'wrong' }, 'approved', 'digest').pass, false);
  assert.equal(evaluateRepositoryDigest({ status: 0, repoDigests: ['wrong'] }, 'digest').pass, false);
  assert.equal(evaluateMigrationHistory({ versions: '20260814103000', count: '1' }).pass, false);
  assert.equal(evaluateRpcContract({ returnType: 'public.room_events', securityDefiner: 'true', searchPath: 'search_path=""' }).pass, false);
  assert.equal(evaluateRpcAcl({ anon: 'true', authenticated: 'true', serviceRole: 'true', publicExecute: 'true' }).pass, false);
});

test('process and log validators reject nonzero, connection loss, recovery, and signal 11', () => {
  assert.equal(classifyChildProcessResult({ status: 1, stdout: '', stderr: '' }).pass, false);
  assert.equal(classifyChildProcessResult({ status: 0, stdout: 'connection to server was lost', stderr: '' }).pass, false);
  assert.equal(classifyChildProcessResult({ status: 0, stdout: '', stderr: 'database system is in recovery mode' }).pass, false);
  assert.equal(evaluateLogText({ status: 0, text: 'signal 11' }).pass, false);
});

test('TAP validator rejects assertion shortfall, not ok, Bail out, skip, todo, and plan mismatch', () => {
  assert.equal(parseTapTranscript('1..2\nok 1 - one\nok 2 - two', 2).pass, true);
  assert.equal(parseTapTranscript('1..2\nok 1 - one', 2).pass, false);
  assert.equal(parseTapTranscript('1..2\nok 1 - one\nnot ok 2 - two', 2).pass, false);
  assert.equal(parseTapTranscript('Bail out! broken', 0).pass, false);
  assert.equal(parseTapTranscript('1..1\nok 1 - one # SKIP', 1).pass, false);
  assert.equal(parseTapTranscript('1..1\nok 1 - one # TODO', 1).pass, false);
  assert.equal(parseTapTranscript('1..3\nok 1 - one\nok 2 - two', 2).pass, false);
});

test('Packet 13 log-window validator ignores historical fatal markers and fails closed for current/runtime failures', () => {
  const runId = 'packet13-00000000-0000-0000-0000-000000000000';
  const baseline = {
    containerId: 'container-158',
    postmasterStartTime: '2026-08-18 01:31:36.816875+00',
    restartCount: 0,
  };
  const start = `PACKET13_GATE_START|${runId}`;
  const end = `PACKET13_GATE_END|${runId}`;
  const valid = evaluatePacket13LogWindow({
    status: 0,
    runId,
    baseline,
    after: { ...baseline },
    text: [
      'database system was not properly shut down; automatic recovery in progress',
      `LOG: ${start}`,
      'LOG: accepted RPC',
      `LOG: ${end}`,
    ].join('\n'),
  });
  assert.equal(valid.pass, true);
  assert.equal(valid.currentFatalMarkers.length, 0);
  assert.equal(valid.historicalFatalMarkers.length, 1);

  const currentCrash = evaluatePacket13LogWindow({
    status: 0,
    runId,
    baseline,
    after: { ...baseline },
    text: [start, 'PANIC: server process terminated', end].join('\n'),
  });
  assert.equal(currentCrash.pass, false);
  assert.equal(currentCrash.currentFatalMarkers.some((item) => item.marker === 'panic'), true);

  assert.equal(evaluatePacket13RuntimeBaseline({ before: baseline, after: { ...baseline, restartCount: 1 } }).pass, false);
});
