// PostgreSQL이 백엔드 크래시를 알리는 실제 형식은 이렇다:
//   LOG:  server process (PID 123) was terminated by signal 6: Aborted
//   LOG:  server process (PID 123) was terminated by signal 9: Killed
//   LOG:  server process (PID 123) was terminated by signal 11: Segmentation fault
// `server process`와 `terminated` 사이에 **`(PID N) was`가 들어간다.** 이 부분을
// 허용하지 않으면 시그널 번호와 무관하게 전부 놓친다 (P2, 2026-09-04).
const SERVER_PROCESS_TERMINATED = /\bserver process(?:es)?\s+(?:\(PID\s+\d+\)\s+)?(?:was\s+|were\s+)?terminated\b|\ball server processes terminated\b|\bserver terminated\b/i;

// 시그널 번호에 의존하지 않는다. 예전에는 `signal 11` 리터럴만 있어서
// **signal 6·9 크래시가 조용히 통과했다** (P2).
const TERMINATED_BY_SIGNAL = /\bterminated by signal\s+\d+\b/i;

const DANGEROUS_RUNTIME_MARKERS = new RegExp([
  /\bsignal(?:\s+|[_-])11\b/,
  /segmentation fault/,
  /57P02/,
  /connection reset/,
  /connection to server was lost/,
  /unexpected eof/,
  /database system is in recovery mode/,
  // ── 2026-09-04 추가 (P1). 넷 중 셋만 들어온다 — 제외 근거는 아래 주석. ──
  // severity 필드를 요구한다. 산문의 "panic"과 구분하려는 것이며, 자식 프로세스
  // 출력의 `panic: runtime error`(Go·Rust)도 콜론이 있어 그대로 잡힌다.
  /\bPANIC:/,
  TERMINATED_BY_SIGNAL,
  SERVER_PROCESS_TERMINATED,
  /\breinitializ(?:ing|ed|ation)\b/,
].map((part) => part.source).join('|'), 'i');

// **`database system is starting up`은 넣지 않았다** `[2026-09-04 실측]`.
// 전체 로그 31,040줄에서 **134회** 나오는데 전부 정상 부팅이다 — postgres가 아직
// 뜨는 중일 때 접속한 클라이언트(authenticator·supabase_admin·supabase_auth_admin)가
// 받는 응답이고, 4번의 컨테이너 기동에 몰려 있다. **severity가 `FATAL:`이라
// severity 게이트로도 걸러지지 않는다.**
//
// 같은 이유로 `automatic recovery in progress`(6회, 부팅마다 1회)도 넣지 않았다 —
// 이 스택은 매 기동이 crash recovery로 시작한다.
//
// 둘은 `PACKET13_CURRENT_FATAL_MARKERS`에는 남는다. 그쪽은 **START/END로 잘라낸
// 창 안**만 보므로 "실행 중에 재기동됐다"는 뜻이 되어 판정이 성립한다.
// `DANGEROUS_RUNTIME_MARKERS`는 창이 없어 같은 문자열이 정상 부팅과 구분되지 않는다.

// 정상 로그인데 위 패턴에 걸리는 줄. **줄 단위로만** 면제하고, 면제 조건에
// severity를 포함시킨다 — `LOG:`가 붙은 형태만 빼므로 `FATAL:`·`PANIC:` 변형은
// 그대로 위험으로 남는다.
//
// standby-eof: walsender가 복제 클라이언트(Supabase Realtime의 논리 슬롯)의
//   연결이 terminate 없이 끊길 때 남기는 줄이다. **크래시일 수 없다** — 이 줄을
//   쓰는 백엔드 자신이 살아서 로그를 쓰고 있다. 실제 크래시는 이 줄에 의존하지
//   않고 signal 11 · segfault · terminated · reinitializ* · recovery · PANIC ·
//   57P02가 각각 독립적으로 잡는다. 즉 면제해도 크래시가 조용해지지 않는다.
const BENIGN_RUNTIME_LOG_MARKERS = [
  ['standby-eof', /\bLOG:\s+unexpected EOF on standby connection\s*$/i],
];

function isBenignRuntimeLogLine(line) {
  return BENIGN_RUNTIME_LOG_MARKERS.some(([, pattern]) => pattern.test(line));
}

/**
 * 위험 마커 판정. **면제 줄을 걷어낸 뒤** 나머지 전체를 검사한다.
 * 줄 단위로 걷어내므로 같은 텍스트의 다른 줄에 있는 위험 마커는 그대로 걸린다.
 */
function hasDangerousRuntimeMarker(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const kept = lines.filter((line) => !isBenignRuntimeLogLine(line));
  return {
    dangerous: DANGEROUS_RUNTIME_MARKERS.test(kept.join('\n')),
    benignSuppressed: lines.length - kept.length,
  };
}

const PACKET13_CURRENT_FATAL_MARKERS = [
  ['signal-11', /\bsignal(?:\s+|[_-])11\b/i],
  ['segmentation-fault', /\b(?:segmentation fault|segfault)\b/i],
  // P2 수정 (2026-09-04) — `(PID N) was`를 허용한다. 이전 형태는
  // `server process`와 `terminated`가 붙어 있기를 요구해 실제 형식을 놓쳤다.
  ['server-terminated', SERVER_PROCESS_TERMINATED],
  // 시그널 번호 무관. `signal-11` 리터럴이 우연히 잡아주던 것을 규칙으로 만든다.
  ['terminated-by-signal', TERMINATED_BY_SIGNAL],
  ['reinitializing', /\breinitializ(?:ing|ed|ation)\b/i],
  ['recovery', /\b(?:automatic recovery|database system (?:is|was) in recovery|recovery in progress|database system is starting up)\b/i],
  ['interrupted', /\binterrupted\b/i],
  ['unexpected-eof', /\bunexpected eof\b/i],
  ['connection-lost', /\b(?:connection reset|connection to server was lost|connection lost)\b/i],
  ['panic', /\bpanic\b/i],
  ['sqlstate-57p02', /\b57P02\b/i],
];

function countOccurrences(text, token) {
  if (!token) return 0;
  let count = 0;
  let offset = 0;
  while (offset < text.length) {
    const index = text.indexOf(token, offset);
    if (index < 0) break;
    count += 1;
    offset = index + token.length;
  }
  return count;
}

function logLineContext(line, lineNumber, containerId, postmasterStartTime) {
  const timestamp = line.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+Z)\s+/)?.[1] ?? null;
  const backendPid = line.match(/\[(\d+)\]\s/)?.[1] ?? null;
  const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
  const postmasterMs = postmasterStartTime
    ? Date.parse(postmasterStartTime.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
    : Number.NaN;
  const postmasterKnown = Boolean(postmasterStartTime)
    && (!Number.isFinite(timestampMs) || !Number.isFinite(postmasterMs) || timestampMs >= postmasterMs);
  return {
    lineNumber,
    timestamp,
    containerId: containerId || null,
    postmasterStartTime: postmasterKnown ? postmasterStartTime : null,
    backendPid,
    line,
  };
}

function findPacket13FatalMarkers(lines, containerId, postmasterStartTime) {
  const findings = [];
  lines.forEach((line, index) => {
    // 같은 오탐이 여기에도 있다 — `unexpected-eof` 마커가 standby EOF를 잡는다.
    // 면제 조건은 위와 동일하다 (severity가 `LOG:`인 형태만).
    if (isBenignRuntimeLogLine(line)) return;
    for (const [marker, pattern] of PACKET13_CURRENT_FATAL_MARKERS) {
      if (pattern.test(line)) {
        findings.push({
          marker,
          ...logLineContext(line, index + 1, containerId, postmasterStartTime),
        });
      }
    }
  });
  return findings;
}

function runtimeIdentity(runtime) {
  return {
    containerId: runtime?.containerId ?? '',
    postmasterStartTime: runtime?.postmasterStartTime ?? '',
    restartCount: runtime?.restartCount,
  };
}

export function evaluatePacket13RuntimeBaseline({ before, after }) {
  const beforeIdentity = runtimeIdentity(before);
  const afterIdentity = runtimeIdentity(after);
  const containerStable = Boolean(beforeIdentity.containerId)
    && beforeIdentity.containerId === afterIdentity.containerId;
  const postmasterStable = Boolean(beforeIdentity.postmasterStartTime)
    && beforeIdentity.postmasterStartTime === afterIdentity.postmasterStartTime;
  const restartStable = Number.isInteger(beforeIdentity.restartCount)
    && beforeIdentity.restartCount >= 0
    && Number.isInteger(afterIdentity.restartCount)
    && afterIdentity.restartCount >= 0
    && beforeIdentity.restartCount === afterIdentity.restartCount;
  return {
    pass: containerStable && postmasterStable && restartStable,
    containerStable,
    postmasterStable,
    restartStable,
    detail: `container_stable=${containerStable} postmaster_stable=${postmasterStable} restart_before=${beforeIdentity.restartCount ?? '<missing>'} restart_after=${afterIdentity.restartCount ?? '<missing>'}`,
  };
}

export function evaluatePacket13LogWindow({
  status,
  text,
  runId,
  baseline,
  after,
}) {
  const source = String(text ?? '');
  const lines = source.split(/\r?\n/);
  const startMarker = `PACKET13_GATE_START|${runId}`;
  const endMarker = `PACKET13_GATE_END|${runId}`;
  const startCount = lines.reduce((count, line) => count + countOccurrences(line, startMarker), 0);
  const endCount = lines.reduce((count, line) => count + countOccurrences(line, endMarker), 0);
  const startIndexes = lines.flatMap((line, index) => (line.includes(startMarker) ? [index] : []));
  const endIndexes = lines.flatMap((line, index) => (line.includes(endMarker) ? [index] : []));
  const markersExactOnce = startCount === 1 && endCount === 1;
  const startIndex = startCount === 1 ? startIndexes[0] : -1;
  const endIndex = endCount === 1 ? endIndexes[0] : -1;
  const ordered = markersExactOnce && startIndex < endIndex;
  const windowLines = ordered ? lines.slice(startIndex + 1, endIndex) : [];
  const outsideLines = ordered
    ? [...lines.slice(0, startIndex), ...lines.slice(endIndex + 1)]
    : lines;
  const containerId = baseline?.containerId ?? '';
  const postmasterStartTime = baseline?.postmasterStartTime ?? '';
  const currentFatalMarkers = findPacket13FatalMarkers(windowLines, containerId, postmasterStartTime);
  const historicalFatalMarkers = findPacket13FatalMarkers(outsideLines, containerId, postmasterStartTime);
  const runtime = evaluatePacket13RuntimeBaseline({ before: baseline, after });
  const pass = status === 0 && markersExactOnce && ordered && currentFatalMarkers.length === 0 && runtime.pass;
  return {
    pass,
    runId,
    startMarker,
    endMarker,
    startCount,
    endCount,
    startIndex: startIndex >= 0 ? startIndex + 1 : null,
    endIndex: endIndex >= 0 ? endIndex + 1 : null,
    ordered,
    currentFatalMarkers,
    historicalFatalMarkers,
    runtime,
    detail: `exit_code=${status} start_count=${startCount} end_count=${endCount} ordered=${ordered} current_fatal=${currentFatalMarkers.length} historical_fatal=${historicalFatalMarkers.length} ${runtime.detail}`,
  };
}

export function evaluateCliVersion({ status, actual }, expected = '2.114.0') {
  return {
    pass: status === 0 && actual === expected,
    detail: `expected=${expected} actual=${actual || '<empty>'} exit_code=${status}`,
  };
}

export function evaluateImageIdentity({ image, imageId }, expectedImage, expectedImageId) {
  return {
    pass: image === expectedImage && imageId === expectedImageId,
    detail: `expected=${expectedImage} actual=${image || '<empty>'} image_id=${imageId || '<empty>'}`,
  };
}

export function evaluateRepositoryDigest({ status, repoDigests }, expectedImageId) {
  const expected = `public.ecr.aws/supabase/postgres@${expectedImageId}`;
  return {
    pass: status === 0 && Array.isArray(repoDigests) && repoDigests.includes(expected),
    detail: `expected=${expectedImageId} found=${Array.isArray(repoDigests) && repoDigests.length ? repoDigests.join(',') : '<none>'}`,
  };
}

export function evaluateRuntimeHealth({ state, health }) {
  return {
    pass: state === 'running' && (health === 'healthy' || health === ''),
    detail: `state=${state || '<empty>'} health=${health || '<none>'}`,
  };
}

export function evaluatePostgresVersion(serverVersion) {
  return {
    pass: /^17\.6(?:\.|$)/.test(serverVersion || ''),
    detail: `server_version=${serverVersion || '<empty>'}`,
  };
}

export function evaluateMigrationHistory({ versions, count }, expectedVersions = [
  '20260814103000',
  '20260814113000',
  '20260814123000',
]) {
  const expected = expectedVersions.join(',');
  return {
    pass: versions === expected && String(count) === String(expectedVersions.length),
    detail: `versions=${versions || '<none>'} count=${count || '<none>'}`,
  };
}

export function evaluateRpcContract({ returnType, securityDefiner, searchPath, dependencies = '0' }) {
  return {
    pass: returnType === 'jsonb' && securityDefiner === 'true' && searchPath === 'search_path=""',
    detail: `return=${returnType || '<missing>'} security_definer=${securityDefiner || '<missing>'} search_path_empty=${searchPath === 'search_path=""'} dependencies=${dependencies}`,
  };
}

export function evaluateRpcAcl({ anon, authenticated, serviceRole, publicExecute }) {
  return {
    pass: anon === 'false' && authenticated === 'true' && serviceRole === 'true' && publicExecute === 'false',
    detail: `anon_execute=${anon || '<missing>'} authenticated_execute=${authenticated || '<missing>'} service_role_execute=${serviceRole || '<missing>'} public_execute=${publicExecute || '<missing>'}`,
  };
}

export function evaluatePostmasterStability({ before, after, restartBefore, restartAfter }) {
  return {
    pass: Boolean(before) && before === after && restartBefore === restartAfter,
    detail: `before=${before || '<empty>'} after=${after || '<empty>'} restart_before=${restartBefore} restart_after=${restartAfter}`,
  };
}

export function evaluateLogText({ status, text }) {
  const { dangerous, benignSuppressed } = hasDangerousRuntimeMarker(text || '');
  return {
    pass: status === 0 && !dangerous,
    dangerous,
    benignSuppressed,
    detail: `dangerous_marker=${dangerous} benign_suppressed=${benignSuppressed}`,
  };
}

export function classifyChildProcessResult({ status, signal = null, stdout = '', stderr = '' }, expectedStatus = 0) {
  const text = `${stdout}\n${stderr}`;
  const { dangerous, benignSuppressed } = hasDangerousRuntimeMarker(text);
  return {
    pass: status === expectedStatus && !signal && !dangerous,
    dangerous,
    benignSuppressed,
    detail: `expected_exit_code=${expectedStatus} exit_code=${status} signal=${signal || '<none>'} dangerous=${dangerous} benign_suppressed=${benignSuppressed}`,
  };
}

export function parseTapTranscript(text, expectedCount) {
  const source = String(text || '');
  const okCount = (source.match(/^\s*ok\b/gim) || []).length;
  const notOkCount = (source.match(/^\s*not ok\b/gim) || []).length;
  const plans = Array.from(source.matchAll(/^\s*1\.\.(\d+)\s*$/gim), (match) => Number(match[1]));
  const hasBailOut = /^\s*Bail out!/im.test(source);
  const hasSkipTodo = /^\s*(?:ok|not ok)\b.*#\s*(?:skip|todo)\b/im.test(source);
  const { dangerous } = hasDangerousRuntimeMarker(source);
  const pass = okCount === expectedCount
    && notOkCount === 0
    && plans.length === 1
    && plans[0] === expectedCount
    && !hasBailOut
    && !hasSkipTodo
    && !dangerous;
  return {
    pass,
    okCount,
    notOkCount,
    plans,
    hasBailOut,
    hasSkipTodo,
    dangerous,
    detail: `expected=${expectedCount} ok=${okCount} not_ok=${notOkCount} plans=${plans.join(',') || '<none>'} bail_out=${hasBailOut} skip_todo=${hasSkipTodo} dangerous=${dangerous}`,
  };
}

export const dangerousRuntimeMarkers = DANGEROUS_RUNTIME_MARKERS;
export const benignRuntimeLogMarkers = BENIGN_RUNTIME_LOG_MARKERS;
export { isBenignRuntimeLogLine };
