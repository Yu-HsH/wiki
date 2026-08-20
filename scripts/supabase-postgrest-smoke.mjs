import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  expectedDbContainer,
  inspectContainer,
  parseCliArgs,
  readProjectId,
  repoRoot,
  runCli,
  runDocker,
  runPsql,
  safeLogText,
  wait,
  writePacket13GateMarker,
} from './supabase-runtime-common.mjs';
import {
  evaluatePacket13LogWindow,
  evaluatePacket13RuntimeBaseline,
} from './supabase-runtime-validation.mjs';

const cliArgs = parseCliArgs(process.argv.slice(2));
const projectId = readProjectId();
const container = String(cliArgs.container || expectedDbContainer(projectId));
let failed = false;
let gateRunId = null;
let gateBaseline = null;
let gateStarted = false;

function caseLine(name, pass, detail = '') {
  console.log(`CASE ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
  if (!pass) failed = true;
}

function printProcess(label, result) {
  console.log(`${label} exit_code=${result.status}`);
  if (result.stdout) console.log(safeLogText(result.stdout.trimEnd()));
  if (result.stderr) console.error(safeLogText(result.stderr.trimEnd()));
}

function runtimeSnapshot(runtime, postmasterStartTime) {
  return {
    containerId: runtime?.Id ?? '',
    postmasterStartTime: postmasterStartTime ?? '',
    restartCount: Number.isInteger(Number(runtime?.RestartCount)) ? Number(runtime.RestartCount) : -1,
  };
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runFixtureSql(sql) {
  const result = runPsql(container, sql, { timeout: 120_000 });
  if (result.status !== 0) {
    console.error(safeLogText(result.stderr.trimEnd()));
    console.error(safeLogText(result.stdout.trimEnd()));
    throw new Error(`fixture SQL failed: exit_code=${result.status}`);
  }
}

function scalarSql(sql) {
  const result = runPsql(container, sql, { timeout: 120_000 });
  if (result.status !== 0) throw new Error(`assert SQL failed: ${safeLogText(result.stderr)}`);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '';
}

function readPublicStatus() {
  const status = runCli(['--workdir', repoRoot, 'status', '-o', 'env']);
  if (status.status !== 0) throw new Error(`supabase status failed: ${safeLogText(status.stderr)}`);
  const values = {};
  for (const line of status.stdout.split(/\r?\n/)) {
    const match = line.match(/^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  const envPath = path.join(repoRoot, '.env.local');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    const appKey = env.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)?.[1]?.trim();
    if (appKey) values.PUBLIC_KEY = appKey.replace(/^"|"$/g, '');
  }
  values.PUBLIC_KEY ||= values.PUBLISHABLE_KEY || values.ANON_KEY;
  if (!values.API_URL || !values.PUBLIC_KEY) throw new Error('status output/.env.local에 API_URL과 공개 key가 없습니다.');
  return values;
}

async function signUp(apiUrl, anonKey, label) {
  const email = `${label}-${randomUUID()}@local.test`;
  const password = `R2-${randomUUID()}-Password!`;
  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let response = await client.auth.signUp({ email, password });
  if (response.error) throw new Error(`auth signup failed for ${label}: ${response.error.message}`);
  let session = response.data.session;
  let user = response.data.user;
  if (!session && user) {
    response = await client.auth.signInWithPassword({ email, password });
    if (response.error) throw new Error(`auth signin failed for ${label}: ${response.error.message}`);
    session = response.data.session;
    user = response.data.user;
  }
  if (!session?.access_token || !user?.id) throw new Error(`auth session missing for ${label}`);
  return {
    id: user.id,
    client: createClient(apiUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    }),
  };
}

function roomSql({ roomId, roomCode, hostId, mode = 'group', status = 'playing', deadline, graceEnds = 'null', graceStarted = 'null', memberIds, duel = false }) {
  const startPage = `${roomCode.toLowerCase()}-start`;
  const targetPage = `${roomCode.toLowerCase()}-target`;
  const minPlayers = duel ? 2 : 3;
  const maxPlayers = duel ? 2 : 3;
  const rankLimit = duel ? 1 : 3;
  const users = memberIds.map((userId, index) => {
    const finished = index === 0;
    const role = index === 0 ? 'host' : 'guest';
    return `
insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished, rank, finished_at,
  start_title, target_title, current_title, start_page_id, start_revision_id,
  target_page_id, target_revision_id, current_page_id, current_revision_id,
  path_titles, path_page_ids, path_revision_ids, progress_version
) values (
  ${sqlQuote(roomId)}, ${sqlQuote(userId)}, ${sqlQuote(role)}, ${sqlQuote(`${roomCode}-${index}`)},
  ${sqlQuote(finished ? 'finished' : 'playing')}, ${finished ? 'true' : 'false'},
  ${finished ? '1' : 'null'}, ${finished ? 'clock_timestamp()' : 'null'},
  ${sqlQuote(`${roomCode} Start`)}, ${sqlQuote(`${roomCode} Target`)},
  ${sqlQuote(finished ? `${roomCode} Target` : `${roomCode} Start`)},
  ${sqlQuote(startPage)}, '1', ${sqlQuote(targetPage)}, '2',
  ${sqlQuote(finished ? targetPage : startPage)}, ${finished ? "'2'" : "'1'"},
  ${finished ? `array[${sqlQuote(`${roomCode} Start`)}, ${sqlQuote(`${roomCode} Target`)}]` : `array[${sqlQuote(`${roomCode} Start`)}]`},
  ${finished ? `array[${sqlQuote(startPage)}, ${sqlQuote(targetPage)}]` : `array[${sqlQuote(startPage)}]`},
  ${finished ? "array['1','2']" : "array['1']"}, ${finished ? '1' : '0'}
);`;
  }).join('\n');
  const result = memberIds.slice(0, 1).map((userId) => `
insert into public.group_match_results(
  room_id, user_id, nickname_snapshot, result_status, rank, is_winner,
  start_title, target_title, current_title, move_count, path_titles, finished_at, finalized_at
) values (
  ${sqlQuote(roomId)}, ${sqlQuote(userId)}, ${sqlQuote(`${roomCode}-0`)}, 'finished', 1, true,
  ${sqlQuote(`${roomCode} Start`)}, ${sqlQuote(`${roomCode} Target`)}, ${sqlQuote(`${roomCode} Target`)}, 1,
  array[${sqlQuote(`${roomCode} Start`)}, ${sqlQuote(`${roomCode} Target`)}], now(), now()
);`).join('\n');
  return `
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players, finish_rank_limit,
  use_items, game_duration_seconds, grace_duration_seconds, game_starts_at, game_deadline_at,
  grace_started_at, grace_ends_at, group_start_title, group_start_page_id,
  group_start_revision_id, group_target_title, group_target_page_id, group_target_revision_id,
  finished_count, state_version
) values (
  ${sqlQuote(roomId)}, ${sqlQuote(roomCode)}, ${sqlQuote(hostId)}, ${sqlQuote(status)}, ${sqlQuote(mode)},
  ${minPlayers}, ${maxPlayers}, ${rankLimit}, false, 1200, 120,
  clock_timestamp() - interval '20 seconds', ${deadline}, ${graceStarted}, ${graceEnds},
  ${sqlQuote(`${roomCode} Start`)}, ${sqlQuote(startPage)}, '1', ${sqlQuote(`${roomCode} Target`)},
  ${sqlQuote(targetPage)}, '2', 1, 0
);
${users}
${result}
`;
}

function apiError(response) {
  return response?.error ?? null;
}

function isTransportError(error) {
  return Boolean(error && !error.code && /fetch|network|socket|connection|timeout|econn|closed|reset/i.test(error.message ?? ''));
}

async function rpc(client, roomId, preset) {
  try {
    return await Promise.race([
      client.rpc('send_group_spectator_emoji_v13', { p_room_id: roomId, p_preset_id: preset }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP timeout')), 15_000)),
    ]);
  } catch (error) {
    return { data: null, error: { message: error.message, name: error.name } };
  }
}

async function main() {
  const beforeInspect = inspectContainer(container);
  if (beforeInspect.status !== 0) throw new Error(`target container missing: ${container}`);
  const beforeRuntime = JSON.parse(beforeInspect.stdout.trim());
  const beforePostmaster = scalarSql('select pg_postmaster_start_time()::text;');
  const baseline = runtimeSnapshot(beforeRuntime, beforePostmaster);
  caseLine('postgrest/runtime-baseline', Boolean(baseline.containerId && baseline.postmasterStartTime),
    `container_id=${baseline.containerId || '<missing>'} postmaster=${baseline.postmasterStartTime || '<missing>'} restart_count=${baseline.restartCount}`);
  if (failed) throw new Error('PostgREST smoke baseline unavailable');

  const runId = `packet13-${randomUUID()}`;
  const startMarker = writePacket13GateMarker(container, runId, 'START');
  printProcess('postgrest/log-window/start-marker', startMarker);
  const startPass = startMarker.status === 0 && !startMarker.signal && !startMarker.timedOut;
  caseLine('postgrest/log-window/start-marker', startPass, `run_id=${runId}`);
  if (!startPass) throw new Error('PostgREST smoke START marker failed');
  gateRunId = runId;
  gateBaseline = baseline;
  gateStarted = true;

  const status = readPublicStatus();
  const apiUrl = status.API_URL;
  const publicKey = status.PUBLIC_KEY;
  const anonClient = createClient(apiUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const spectator = await signUp(apiUrl, publicKey, 'r2-spectator');
  const activeOne = await signUp(apiUrl, publicKey, 'r2-active-one');
  const activeTwo = await signUp(apiUrl, publicKey, 'r2-active-two');
  const nonmember = await signUp(apiUrl, publicKey, 'r2-nonmember');
  const users = [spectator, activeOne, activeTwo, nonmember];

  const acceptedRoom = randomUUID();
  const hardRoom = randomUUID();
  const graceRoom = randomUUID();
  const duelRoom = randomUUID();
  const fixtureIds = [acceptedRoom, hardRoom, graceRoom, duelRoom];
  const profileSql = users.map((user, index) => `
insert into public.profiles(id, username, nickname, synthetic_email)
values (${sqlQuote(user.id)}, ${sqlQuote(`r2-user-${index}-${user.id.slice(0, 8)}`)}, ${sqlQuote(`R2 User ${index}`)}, ${sqlQuote(`r2-user-${index}-${user.id.slice(0, 8)}@local.test`)})
on conflict (id) do update set nickname = excluded.nickname;
`).join('\n');
  const fixtureSql = `begin;
${profileSql}
${roomSql({ roomId: acceptedRoom, roomCode: 'R2-ACCEPT', hostId: spectator.id, deadline: "clock_timestamp() + interval '90 seconds'", memberIds: [spectator.id, activeOne.id, activeTwo.id] })}
${roomSql({ roomId: hardRoom, roomCode: 'R2-HARD', hostId: spectator.id, deadline: "clock_timestamp() - interval '2 seconds'", memberIds: [spectator.id, activeOne.id, activeTwo.id] })}
${roomSql({ roomId: graceRoom, roomCode: 'R2-GRACE', hostId: spectator.id, status: 'grace_period', deadline: "clock_timestamp() - interval '10 seconds'", graceStarted: "clock_timestamp() - interval '8 seconds'", graceEnds: "clock_timestamp() - interval '2 seconds'", memberIds: [spectator.id, activeOne.id, activeTwo.id] })}
${roomSql({ roomId: duelRoom, roomCode: 'R2-DUEL', hostId: spectator.id, mode: 'duel', duel: true, deadline: "clock_timestamp() + interval '90 seconds'", memberIds: [spectator.id, activeOne.id] })}
commit;`;
  runFixtureSql(fixtureSql);

  try {
    const accepted = await rpc(spectator.client, acceptedRoom, 'cheer');
    const acceptedEventId = accepted.data?.event_id;
    caseLine('postgrest/authenticated-accepted', !apiError(accepted) && accepted.data?.accepted === true
      && accepted.data?.code === 'ACCEPTED'
      && acceptedEventId === accepted.data?.event?.id
      && accepted.data?.event?.event_type === 'group_spectator_emoji'
      && accepted.data?.event?.payload?.presetId === 'cheer',
    `transport_error=${isTransportError(apiError(accepted))}`);

    const retry = await rpc(spectator.client, acceptedRoom, 'wow');
    caseLine('postgrest/immediate-rate-limit', Boolean(apiError(retry))
      && !isTransportError(apiError(retry))
      && apiError(retry).message.includes('SPECTATOR_EMOJI_RATE_LIMIT'),
    `error_code=${apiError(retry)?.code || '<none>'}`);

    await wait(4_000);
    const delayed = await rpc(spectator.client, acceptedRoom, 'wow');
    caseLine('postgrest/four-second-retry', !apiError(delayed) && delayed.data?.accepted === true
      && delayed.data?.event?.payload?.presetId === 'wow',
    `transport_error=${isTransportError(apiError(delayed))}`);

    const invalidPreset = await rpc(spectator.client, acceptedRoom, 'invalid-r2-preset');
    caseLine('postgrest/invalid-preset', Boolean(apiError(invalidPreset))
      && !isTransportError(apiError(invalidPreset))
      && apiError(invalidPreset).message.includes('SPECTATOR_PRESET_INVALID'));

    const unfinished = await rpc(activeOne.client, acceptedRoom, 'cheer');
    caseLine('postgrest/unfinished-rejection', Boolean(apiError(unfinished))
      && !isTransportError(apiError(unfinished))
      && apiError(unfinished).message.includes('SPECTATOR_FINISH_REQUIRED'));

    const nonmemberResult = await rpc(nonmember.client, acceptedRoom, 'cheer');
    caseLine('postgrest/nonmember-rejection', Boolean(apiError(nonmemberResult))
      && !isTransportError(apiError(nonmemberResult))
      && apiError(nonmemberResult).message.includes('SPECTATOR_FINISH_REQUIRED'));

    const duelResult = await rpc(spectator.client, duelRoom, 'cheer');
    caseLine('postgrest/duel-rejection', Boolean(apiError(duelResult))
      && !isTransportError(apiError(duelResult))
      && apiError(duelResult).message.includes('NOT_A_GROUP'));

    const hardExpired = await rpc(spectator.client, hardRoom, 'cheer');
    const hardCounts = scalarSql(`select (select count(*) from public.room_events where room_id=${sqlQuote(hardRoom)} and event_type='group_spectator_emoji')::text || '|' || (select count(*) from public.group_spectator_emoji_rate_limits where room_id=${sqlQuote(hardRoom)})::text || '|' || (select count(*) from public.room_events where room_id=${sqlQuote(hardRoom)} and event_type='game_end')::text || '|' || (select status from public.game_rooms where id=${sqlQuote(hardRoom)});`);
    caseLine('postgrest/hard-expired-domain-rejection', !apiError(hardExpired)
      && hardExpired.data?.accepted === false
      && hardExpired.data?.code === 'SPECTATOR_ROOM_EXPIRED'
      && hardExpired.data?.event_id === null
      && hardCounts === '0|0|1|finished', `counts=${hardCounts}`);

    const graceExpired = await rpc(spectator.client, graceRoom, 'cheer');
    const graceCounts = scalarSql(`select (select count(*) from public.room_events where room_id=${sqlQuote(graceRoom)} and event_type='group_spectator_emoji')::text || '|' || (select count(*) from public.group_spectator_emoji_rate_limits where room_id=${sqlQuote(graceRoom)})::text || '|' || (select count(*) from public.room_events where room_id=${sqlQuote(graceRoom)} and event_type='game_end')::text || '|' || (select status from public.game_rooms where id=${sqlQuote(graceRoom)});`);
    caseLine('postgrest/grace-expired-domain-rejection', !apiError(graceExpired)
      && graceExpired.data?.accepted === false
      && graceExpired.data?.code === 'SPECTATOR_ROOM_EXPIRED'
      && graceExpired.data?.event_id === null
      && graceCounts === '0|0|1|finished', `counts=${graceCounts}`);

    const latestRoom = await spectator.client.from('game_rooms').select('id,status,state_version').eq('id', acceptedRoom).single();
    const latestResults = await spectator.client.from('group_match_results').select('room_id,user_id,result_status,rank').eq('room_id', acceptedRoom);
    caseLine('postgrest/latest-room-results', !apiError(latestRoom) && latestRoom.data?.id === acceptedRoom
      && !apiError(latestResults) && Array.isArray(latestResults.data) && latestResults.data.length >= 1,
    `room_error=${apiError(latestRoom)?.code || '<none>'} results_error=${apiError(latestResults)?.code || '<none>'}`);

    const directInsert = await spectator.client.from('room_events').insert({
      room_id: acceptedRoom, user_id: spectator.id, event_type: 'group_spectator_emoji', payload: { presetId: 'direct-r2' },
    });
    caseLine('postgrest/direct-room-events-insert-denied', Boolean(apiError(directInsert))
      && !isTransportError(apiError(directInsert))
      && (apiError(directInsert).code === '42501' || /permission denied|row-level security/i.test(apiError(directInsert).message)),
    `error_code=${apiError(directInsert)?.code || '<none>'}`);

    const anonRpc = await rpc(anonClient, acceptedRoom, 'clap');
    caseLine('postgrest/anon-rpc-denied', Boolean(apiError(anonRpc))
      && !isTransportError(apiError(anonRpc))
      && (apiError(anonRpc).code === '42501' || /permission denied|JWT|not authorized/i.test(apiError(anonRpc).message)),
    `error_code=${apiError(anonRpc)?.code || '<none>'}`);

    const acceptedEventCount = scalarSql(`select count(*)::text from public.room_events where room_id=${sqlQuote(acceptedRoom)} and event_type='group_spectator_emoji';`);
    const acceptedLedgerCount = scalarSql(`select count(*)::text from public.group_spectator_emoji_rate_limits where room_id=${sqlQuote(acceptedRoom)};`);
    caseLine('postgrest/accepted-event-ledger-counts', acceptedEventCount === '2' && acceptedLedgerCount === '1',
      `events=${acceptedEventCount} ledger=${acceptedLedgerCount}`);
  } finally {
    runFixtureSql(`delete from public.game_rooms where id in (${fixtureIds.map(sqlQuote).join(',')}); delete from auth.users where id in (${users.map((user) => sqlQuote(user.id)).join(',')});`);
  }

}

main().catch((error) => {
  failed = true;
  console.error(`FATAL postgrest-smoke ${safeLogText(error.stack || error.message || String(error))}`);
}).finally(() => {
  if (gateStarted && gateRunId && gateBaseline) {
    const endMarker = writePacket13GateMarker(container, gateRunId, 'END');
    printProcess('postgrest/log-window/end-marker', endMarker);
    caseLine('postgrest/log-window/end-marker', endMarker.status === 0 && !endMarker.signal && !endMarker.timedOut, `run_id=${gateRunId}`);

    const afterInspect = inspectContainer(container);
    let afterRuntime = null;
    if (afterInspect.status === 0) {
      try { afterRuntime = JSON.parse(afterInspect.stdout.trim()); } catch { afterRuntime = null; }
    }
    const afterPostmasterResult = runPsql(container, 'select pg_postmaster_start_time()::text;', { timeout: 120_000 });
    const afterPostmaster = afterPostmasterResult.status === 0
      ? afterPostmasterResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ''
      : '';
    const after = runtimeSnapshot(afterRuntime, afterPostmaster);
    const baselineCheck = evaluatePacket13RuntimeBaseline({ before: gateBaseline, after });
    caseLine('postgrest/runtime-baseline', baselineCheck.pass, baselineCheck.detail);

    const logs = runDocker(['logs', '--timestamps', '--tail', '2000', container]);
    const logText = `${logs.stdout}\n${logs.stderr}`;
    const logCheck = evaluatePacket13LogWindow({
      status: logs.status,
      text: logText,
      runId: gateRunId,
      baseline: gateBaseline,
      after,
    });
    caseLine('postgrest/runtime-stability', logCheck.pass, logCheck.detail);
    console.log(`POSTGREST_LOG_WINDOW run_id=${gateRunId} start_line=${logCheck.startIndex ?? '<missing>'} end_line=${logCheck.endIndex ?? '<missing>'} current_fatal=${logCheck.currentFatalMarkers.length} historical_fatal=${logCheck.historicalFatalMarkers.length}`);
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
  } else {
    failed = true;
    console.error('FATAL postgrest-smoke log-window was not started; no current-run verdict is possible');
  }
  process.exit(failed ? 1 : 0);
});
