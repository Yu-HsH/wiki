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

/**
 * ⚠ 선행 결함 — 이 커밋이 만든 것이 아니고 고치지도 않았다.
 *
 * `DANGEROUS_RUNTIME_MARKERS`(preflight `postgres-log`·child process·TAP 경로)에는
 * **`panic`·`terminated`·`reinitializ*`·`starting up`이 없다.** 그 넷은
 * `PACKET13_CURRENT_FATAL_MARKERS`(log-window 경로)에만 있다. 두 목록의 커버리지가
 * 다르다는 뜻이다.
 *
 * **이 테스트는 그 차이를 고정해 두기 위한 것이다** — 수정이 아니라 등재다. 패턴을
 * 넓히는 변경은 `classifyChildProcessResult`·`parseTapTranscript`가 임의의 자식 프로세스
 * 출력에 돌기 때문에 새 오탐을 만들 수 있고, 그 판단은 별건이다 (CURRENT.md §2).
 * **넓히기로 결정하면 이 테스트가 먼저 실패해서 알려준다.**
 */
test('선행 결함 등재 — 두 마커 목록의 커버리지가 다르고, 둘 다 놓치는 줄이 하나 있다', () => {
  const runId = 'packet13-00000000-0000-0000-0000-000000000000';
  const baseline = {
    containerId: 'container-158',
    postmasterStartTime: '2026-08-18 01:31:36.816875+00',
    restartCount: 0,
  };
  const windowMarkers = (text) =>
    evaluatePacket13LogWindow({
      status: 0,
      runId,
      baseline,
      after: { ...baseline },
      text: [`LOG: PACKET13_GATE_START|${runId}`, text, `LOG: PACKET13_GATE_END|${runId}`].join('\n'),
    }).currentFatalMarkers.map((item) => item.marker);

  // 결함 A — DANGEROUS_RUNTIME_MARKERS에는 없고 log-window에는 있다.
  const onlyWindowCatches = [
    'PANIC:  could not write to file',
    'LOG:  all server processes terminated; reinitializing',
    'FATAL:  the database system is starting up',
  ];
  for (const text of onlyWindowCatches) {
    assert.equal(evaluateLogText({ status: 0, text }).dangerous, false, `커버리지가 바뀌었다: ${text}`);
    assert.notEqual(windowMarkers(text).length, 0, `log-window는 잡아야 한다: ${text}`);
  }

  // 결함 B — **둘 다 놓친다.** `server-terminated` 정규식이 `server process`와
  // `terminated`가 붙어 있기를 요구하는데, 실제 PostgreSQL 형식은 그 사이에
  // `(PID N) was`가 들어간다. signal 11만 별도 패턴으로 우연히 걸리고,
  // **signal 6·9 같은 다른 크래시는 어느 경로에서도 잡히지 않는다.**
  const caughtByNeither = 'LOG:  server process (PID 9) was terminated by signal 6: Aborted';
  assert.equal(evaluateLogText({ status: 0, text: caughtByNeither }).dangerous, false);
  assert.deepEqual(windowMarkers(caughtByNeither), []);

  // signal 11은 잡힌다 — 형식이 같은데도 결과가 갈리는 것이 결함 B의 증거다.
  const signal11 = 'LOG:  server process (PID 9) was terminated by signal 11: Segmentation fault';
  assert.equal(evaluateLogText({ status: 0, text: signal11 }).dangerous, true);
  assert.deepEqual(windowMarkers(signal11).sort(), ['segmentation-fault', 'signal-11']);
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
