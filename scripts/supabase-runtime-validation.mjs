const DANGEROUS_RUNTIME_MARKERS = /\bsignal(?:\s+|[_-])11\b|segmentation fault|57P02|connection reset|connection to server was lost|unexpected eof|database system is in recovery mode/i;

const PACKET13_CURRENT_FATAL_MARKERS = [
  ['signal-11', /\bsignal(?:\s+|[_-])11\b/i],
  ['segmentation-fault', /\b(?:segmentation fault|segfault)\b/i],
  ['server-terminated', /\b(?:server process(?:es)?\s+(?:was\s+|were\s+)?terminated|server terminated|all server processes terminated)\b/i],
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
  const dangerous = DANGEROUS_RUNTIME_MARKERS.test(text || '');
  return {
    pass: status === 0 && !dangerous,
    dangerous,
    detail: `dangerous_marker=${dangerous}`,
  };
}

export function classifyChildProcessResult({ status, signal = null, stdout = '', stderr = '' }, expectedStatus = 0) {
  const text = `${stdout}\n${stderr}`;
  const dangerous = DANGEROUS_RUNTIME_MARKERS.test(text);
  return {
    pass: status === expectedStatus && !signal && !dangerous,
    dangerous,
    detail: `expected_exit_code=${expectedStatus} exit_code=${status} signal=${signal || '<none>'} dangerous=${dangerous}`,
  };
}

export function parseTapTranscript(text, expectedCount) {
  const source = String(text || '');
  const okCount = (source.match(/^\s*ok\b/gim) || []).length;
  const notOkCount = (source.match(/^\s*not ok\b/gim) || []).length;
  const plans = Array.from(source.matchAll(/^\s*1\.\.(\d+)\s*$/gim), (match) => Number(match[1]));
  const hasBailOut = /^\s*Bail out!/im.test(source);
  const hasSkipTodo = /^\s*(?:ok|not ok)\b.*#\s*(?:skip|todo)\b/im.test(source);
  const dangerous = DANGEROUS_RUNTIME_MARKERS.test(source);
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
