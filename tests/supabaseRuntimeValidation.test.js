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

/* ────────────────────────────────────────────────────────────
 * standby EOF 오탐 — 2026-09-04 해소 (CURRENT.md §2 관찰)
 * ──────────────────────────────────────────────────────────── */

// 로컬 스택에서 실제로 관측된 줄 그대로다 (`docker logs --timestamps`).
const STANDBY_EOF_LINE =
  '2026-09-03T11:15:08.400524497Z 172.19.0.7 2026-09-03 11:15:08.400 UTC [386377] supabase_admin@postgres LOG:  unexpected EOF on standby connection';
const STANDBY_EOF_STATEMENT_LINE =
  "2026-09-03T11:15:08.400561065Z 172.19.0.7 2026-09-03 11:15:08.400 UTC [386377] supabase_admin@postgres STATEMENT:  START_REPLICATION SLOT supabase_realtime_messages_replication_slot_ LOGICAL 0/0 (proto_version '2', publication_names 'supabase_realtime_messages_publication', binary 'true')";
const CHECKPOINT_LINE =
  '2026-09-03T11:19:11.708921866Z  2026-09-03 11:19:11.708 UTC [33] LOG:  checkpoint starting: time';

test('standby EOF는 정상 로그다 — LOG severity면 통과한다', () => {
  const result = evaluateLogText({
    status: 0,
    text: [CHECKPOINT_LINE, STANDBY_EOF_LINE, STANDBY_EOF_STATEMENT_LINE, CHECKPOINT_LINE].join('\n'),
  });
  assert.equal(result.pass, true);
  assert.equal(result.dangerous, false);
  // 면제가 조용히 일어나지 않는다 — 몇 줄을 뺐는지 detail에 남는다.
  assert.equal(result.benignSuppressed, 1);
  assert.match(result.detail, /benign_suppressed=1/);
});

test('면제는 severity로 좁혀져 있다 — FATAL·PANIC 변형은 여전히 위험이다', () => {
  const fatal = STANDBY_EOF_LINE.replace('LOG:', 'FATAL:');
  const panic = STANDBY_EOF_LINE.replace('LOG:', 'PANIC:');
  assert.equal(evaluateLogText({ status: 0, text: fatal }).pass, false);
  assert.equal(evaluateLogText({ status: 0, text: panic }).pass, false);
  // client connection은 다른 메시지다. 면제 목록에 없으므로 그대로 걸린다.
  assert.equal(
    evaluateLogText({ status: 0, text: STANDBY_EOF_LINE.replace('standby', 'client') }).pass,
    false
  );
});

test('면제는 줄 단위다 — 같은 텍스트의 다른 줄에 있는 크래시는 그대로 잡는다', () => {
  const result = evaluateLogText({
    status: 0,
    text: [
      STANDBY_EOF_LINE,
      '2026-09-03 11:16:00 UTC [33] LOG:  server process (PID 999) was terminated by signal 11: Segmentation fault',
      STANDBY_EOF_LINE,
    ].join('\n'),
  });
  assert.equal(result.pass, false);
  assert.equal(result.dangerous, true);
  assert.equal(result.benignSuppressed, 2);
});

test('기존 negative 케이스 전건 유지 — 면제가 크래시 탐지를 넓게 뚫지 않는다', () => {
  const stillDangerous = [
    'LOG:  server process was terminated by signal 11',
    'signal_11',
    'segmentation fault',
    'FATAL: 57P02 crash shutdown',
    'connection reset by peer',
    'connection to server was lost',
    'FATAL:  the database system is in recovery mode',
    // client connection은 다른 메시지다 — 면제 목록에 없다.
    'unexpected EOF on client connection',
    // severity 없이 메시지만 있는 형태도 면제 대상이 아니다.
    'unexpected EOF on standby connection',
    // severity가 LOG가 아니면 면제되지 않는다.
    'FATAL:  unexpected EOF on standby connection',
  ];
  for (const text of stillDangerous) {
    assert.equal(evaluateLogText({ status: 0, text }).pass, false, `면제되면 안 된다: ${text}`);
    assert.equal(
      classifyChildProcessResult({ status: 0, stdout: text, stderr: '' }).pass,
      false,
      `면제되면 안 된다: ${text}`
    );
  }
});

/* ────────────────────────────────────────────────────────────
 * P1·P2 — 크래시 탐지 범위. 2026-09-04 해소
 *
 * 이전 상태: `DANGEROUS_RUNTIME_MARKERS`에 panic·terminated·reinitializing이
 * 없었고(P1), `server-terminated` 정규식이 실제 PostgreSQL 형식과 맞지 않아
 * **signal 11 외의 모든 시그널 크래시를 두 목록이 모두 놓쳤다**(P2).
 * signal 11이 잡히던 것은 정규식이 아니라 `signal 11` 리터럴 덕분이었다.
 * ──────────────────────────────────────────────────────────── */

const CRASH_BASELINE = {
  containerId: 'container-158',
  postmasterStartTime: '2026-08-18 01:31:36.816875+00',
  restartCount: 0,
};
const CRASH_RUN_ID = 'packet13-00000000-0000-0000-0000-000000000000';

function windowMarkersFor(text) {
  return evaluatePacket13LogWindow({
    status: 0,
    runId: CRASH_RUN_ID,
    baseline: CRASH_BASELINE,
    after: { ...CRASH_BASELINE },
    text: [
      `LOG: PACKET13_GATE_START|${CRASH_RUN_ID}`,
      text,
      `LOG: PACKET13_GATE_END|${CRASH_RUN_ID}`,
    ].join('\n'),
  }).currentFatalMarkers.map((item) => item.marker);
}

test('P2 해소 — 시그널 번호와 무관하게 프로세스 종료를 잡는다 (두 목록 모두)', () => {
  // 실제 PostgreSQL 형식. `server process`와 `terminated` 사이에 `(PID N) was`가 있다.
  const crashes = [
    'LOG:  server process (PID 9) was terminated by signal 6: Aborted',
    'LOG:  server process (PID 123) was terminated by signal 9: Killed',
    'LOG:  server process (PID 123) was terminated by signal 11: Segmentation fault',
    'LOG:  server process (PID 4321) was terminated by signal 15: Terminated',
  ];
  for (const text of crashes) {
    assert.equal(evaluateLogText({ status: 0, text }).pass, false, `잡아야 한다: ${text}`);
    assert.equal(
      classifyChildProcessResult({ status: 0, stdout: text, stderr: '' }).pass,
      false,
      `잡아야 한다: ${text}`
    );
    assert.ok(windowMarkersFor(text).includes('terminated-by-signal'), `log-window: ${text}`);
    assert.ok(windowMarkersFor(text).includes('server-terminated'), `log-window: ${text}`);
  }

  // signal 11이 잡히는 이유가 더 이상 리터럴 하나에만 있지 않다.
  const signal11 = crashes[2];
  assert.deepEqual(
    windowMarkersFor(signal11).sort(),
    ['segmentation-fault', 'server-terminated', 'signal-11', 'terminated-by-signal']
  );
});

test('P1 해소 — PANIC·terminated·reinitializing이 DANGEROUS_RUNTIME_MARKERS에 들어왔다', () => {
  const nowDangerous = [
    'PANIC:  could not write to file',
    'panic: runtime error: invalid memory address',
    'LOG:  all server processes terminated; reinitializing',
    'LOG:  server terminated by administrator command',
  ];
  for (const text of nowDangerous) {
    assert.equal(evaluateLogText({ status: 0, text }).pass, false, `잡아야 한다: ${text}`);
    assert.equal(
      classifyChildProcessResult({ status: 0, stdout: text, stderr: '' }).pass,
      false,
      `잡아야 한다: ${text}`
    );
  }

  // severity 필드를 요구하므로 산문의 "panic"은 잡지 않는다.
  assert.equal(evaluateLogText({ status: 0, text: 'do not panic, this is fine' }).pass, true);
});

/**
 * `starting up`·`automatic recovery`는 **의도적으로 넣지 않았다.**
 *
 * 전체 로그 31,040줄 실측에서 `the database system is starting up`이 **134회**,
 * `automatic recovery in progress`가 **6회** 나오는데 **전부 정상 부팅이다** —
 * 4번의 컨테이너 기동에 몰려 있고, 이 스택은 매 기동이 crash recovery로 시작한다.
 * `starting up`은 severity가 `FATAL:`이라 **severity 게이트로도 걸러지지 않는다.**
 *
 * 둘은 `PACKET13_CURRENT_FATAL_MARKERS`에는 남는다 — 그쪽은 START/END로 잘라낸
 * **창 안**만 보므로 "실행 중에 재기동됐다"는 뜻이 되어 판정이 성립한다.
 */
test('부팅 로그는 위험이 아니다 — 창 없는 경로에서 starting up·automatic recovery를 뺀 이유', () => {
  const bootLines = [
    '2026-08-23 14:01:32.897 UTC [70] authenticator@postgres FATAL:  the database system is starting up',
    '2026-08-18 01:31:40.738 UTC [37] LOG:  database system was not properly shut down; automatic recovery in progress',
  ];
  for (const text of bootLines) {
    // 창이 없는 경로 — 정상 부팅과 구분할 수 없으므로 통과시킨다.
    assert.equal(evaluateLogText({ status: 0, text }).pass, true, `오탐이면 안 된다: ${text}`);
    // 창이 있는 경로 — 창 안에 있으면 재기동이므로 잡는다.
    assert.ok(windowMarkersFor(text).includes('recovery'), `log-window는 잡아야 한다: ${text}`);
  }
});

test('log-window 경로에도 같은 면제가 걸린다 — standby EOF는 current fatal이 아니다', () => {
  const runId = 'packet13-00000000-0000-0000-0000-000000000000';
  const baseline = {
    containerId: 'container-158',
    postmasterStartTime: '2026-08-18 01:31:36.816875+00',
    restartCount: 0,
  };
  const start = `PACKET13_GATE_START|${runId}`;
  const end = `PACKET13_GATE_END|${runId}`;

  const benign = evaluatePacket13LogWindow({
    status: 0,
    runId,
    baseline,
    after: { ...baseline },
    text: [`LOG: ${start}`, STANDBY_EOF_LINE, `LOG: ${end}`].join('\n'),
  });
  assert.equal(benign.pass, true);
  assert.equal(benign.currentFatalMarkers.length, 0);

  // 같은 창 안의 진짜 크래시는 그대로 잡힌다.
  const crash = evaluatePacket13LogWindow({
    status: 0,
    runId,
    baseline,
    after: { ...baseline },
    text: [`LOG: ${start}`, STANDBY_EOF_LINE, 'LOG: backend exited on signal 11', `LOG: ${end}`].join('\n'),
  });
  assert.equal(crash.pass, false);
  assert.equal(crash.currentFatalMarkers.some((item) => item.marker === 'signal-11'), true);
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
