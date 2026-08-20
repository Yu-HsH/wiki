param(
  [ValidateSet('prepare', 'new-full', 'new-minimal', 'prepared-minimal', 'discard-minimal', 'long-lived', 'service-full', 'anon', 'stage-minimal', 'stage-full', 'cleanup')]
  [string]$Variant = 'prepare',
  [string]$DbContainer = 'supabase_db_wiki'
)

$ErrorActionPreference = 'Stop'
$dbContainer = $DbContainer
$script:caseFailed = $false

# Packet 13 Crash Diagnostic
#
# Observed local-log evidence:
#   2026-08-14 13:23:17.560 UTC, signal 11, auth/anon-check DO block,
#   room 05177bb2-e5f3-488a-bfd2-c0559b7105a4
#   2026-08-14 13:27:03.581 UTC, signal 11, direct SELECT,
#   room 0135c7b0-3574-4fc2-9321-55a44c7876ce, preset cheer
#
# The original 0135... rows and original SQL fixture are not recoverable from
# the current database/repository. This file preserves the observed boundary
# and creates explicitly labelled substitute full/minimal fixtures. It is not
# a byte-for-byte copy of the original crash fixture.
#
# Direct DB contract: psql inside the DB container, PostgreSQL port 5432,
# pooler/PostgREST bypassed, simple protocol unless PREPARE is selected, and
# JWT context represented only by request.jwt.claim.sub (never printed).
# Setup is committed; every stage mutation is inside a transaction and rolled
# back. Cleanup deletes only the fixed diagnostic IDs below.

$fullRoom = '00000000-0000-0000-0040-000000000001'
$minimalRoom = '00000000-0000-0000-0040-000000000002'
$fullUsers = @(
  '00000000-0000-0000-0041-000000000001',
  '00000000-0000-0000-0041-000000000002',
  '00000000-0000-0000-0041-000000000003',
  '00000000-0000-0000-0041-000000000004'
)
$minimalUsers = @(
  '00000000-0000-0000-0042-000000000001',
  '00000000-0000-0000-0042-000000000002',
  '00000000-0000-0000-0042-000000000003'
)
$allUsers = $fullUsers + $minimalUsers

function Invoke-CapturedProcess {
  param(
    [Parameter(Mandatory)][string]$FileName,
    [Parameter(Mandatory)][string[]]$Arguments,
    [string]$InputText = ''
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FileName
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) {
    [void]$startInfo.ArgumentList.Add($argument)
  }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  if (-not $process.Start()) {
    throw "failed to start process: $FileName"
  }

  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if ($null -ne $InputText) {
    $process.StandardInput.Write($InputText)
  }
  $process.StandardInput.Close()
  $process.WaitForExit()
  $stdout = $stdoutTask.Result
  $stderr = $stderrTask.Result
  $stopwatch.Stop()

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
    DurationMs = $stopwatch.ElapsedMilliseconds
  }
}

function Invoke-DiagnosticPsql {
  param(
    [Parameter(Mandatory)][string]$Sql,
    [switch]$AllowFailure
  )

  $process = Invoke-CapturedProcess -FileName 'docker' -Arguments @(
    'exec', '-i', $dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At'
  ) -InputText $Sql
  $output = @()
  if ($process.Stdout) { $output += @($process.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) }
  if ($process.Stderr) { $output += @($process.Stderr -split "`r?`n" | Where-Object { $_ -ne '' }) }
  $result = [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $process.Stdout
    Stderr = $process.Stderr
    Output = $output
    DurationMs = $process.DurationMs
  }
  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    throw "diagnostic psql failed: $($result.Output -join "`n")"
  }
  return $result
}

function Get-ContainerRestartCount {
  $process = Invoke-CapturedProcess -FileName 'docker' -Arguments @('inspect', '-f', '{{.RestartCount}}', $dbContainer)
  if ($process.ExitCode -ne 0) {
    throw "docker inspect failed: $($process.Stderr)"
  }
  return [int]$process.Stdout.Trim()
}

function Get-PostgresLogMarkers {
  $process = Invoke-CapturedProcess -FileName 'docker' -Arguments @('logs', '--timestamps', '--tail', '200', $dbContainer)
  if ($process.ExitCode -ne 0) {
    throw "docker logs failed: $($process.Stderr)"
  }
  $lines = @()
  if ($process.Stdout) { $lines += @($process.Stdout -split "`r?`n") }
  if ($process.Stderr) { $lines += @($process.Stderr -split "`r?`n") }
  return @($lines | Where-Object {
    $_ -match '(?i)signal 11|segmentation fault|server process.*terminated|database system is in recovery mode|automatic recovery|unexpected eof|all server processes terminated'
  })
}

function Get-RuntimeSnapshot {
  $db = Invoke-DiagnosticPsql "select pg_postmaster_start_time()::text as postmaster_start_time, current_setting('server_version') as server_version;" -AllowFailure
  if ($db.ExitCode -ne 0) {
    return [pscustomobject]@{
      PostmasterStartTime = $null
      ServerVersion = $null
      RestartCount = Get-ContainerRestartCount
      LogMarkers = @(Get-PostgresLogMarkers)
      DatabaseReachable = $false
    }
  }
  $line = @($db.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
  $parts = $line -split '\|', 2
  return [pscustomobject]@{
    PostmasterStartTime = $parts[0]
    ServerVersion = if ($parts.Count -gt 1) { $parts[1] } else { $null }
    RestartCount = Get-ContainerRestartCount
    LogMarkers = @(Get-PostgresLogMarkers)
    DatabaseReachable = $true
  }
}

function Test-ConnectionLoss {
  param([Parameter(Mandatory)][string]$Text)
  return $Text -match '(?i)server closed the connection unexpectedly|connection to server was lost|unexpected eof|database system is in recovery mode|could not connect to server'
}

function Test-SegmentationFault {
  param([Parameter(Mandatory)][string]$Text)
  return $Text -match '(?i)signal 11|segmentation fault|server process.*terminated'
}

function Write-ObservedResult {
  param(
    [Parameter(Mandatory)][string]$CaseName,
    [Parameter(Mandatory)][string]$Expected,
    [Parameter(Mandatory)]$Result,
    [Parameter(Mandatory)]$Before,
    [Parameter(Mandatory)]$After
  )

  $text = (($Result.Stdout, $Result.Stderr) -join "`n")
  $newMarkers = @($After.LogMarkers | Where-Object { $Before.LogMarkers -notcontains $_ })
  $connectionLoss = Test-ConnectionLoss -Text $text
  $segmentationFault = Test-SegmentationFault -Text (($text, ($newMarkers -join "`n")) -join "`n")
  $permissionDenied = $text -match '(?i)SQL state: 42501|permission denied for function|permission denied'
  $allowedReturn = $text -match '(?i)accepted.{0,20}true|"accepted": ?true'
  $postmasterChanged = $Before.PostmasterStartTime -and $After.PostmasterStartTime -and ($Before.PostmasterStartTime -ne $After.PostmasterStartTime)
  $restartChanged = $Before.RestartCount -ne $After.RestartCount

  $pass = if ($Expected -eq 'Denied') {
    $Result.ExitCode -ne 0 -and $permissionDenied -and -not $connectionLoss -and -not $segmentationFault -and -not $postmasterChanged -and -not $restartChanged
  } else {
    $Result.ExitCode -eq 0 -and $allowedReturn -and -not $connectionLoss -and -not $segmentationFault -and -not $postmasterChanged -and -not $restartChanged
  }
  $status = if ($pass) { 'PASS' } else { 'FAIL' }
  if (-not $pass) { $script:caseFailed = $true }

  Write-Output ("CASE {0} {1} expected={2} exit_code={3} connection_loss={4} signal11={5} permission_denied={6} allowed_return={7} postmaster_changed={8} restart_changed={9}" -f $status, $CaseName, $Expected, $Result.ExitCode, $connectionLoss, $segmentationFault, $permissionDenied, $allowedReturn, $postmasterChanged, $restartChanged)
  Write-Output "stdout_begin"
  if ($Result.Stdout) { Write-Output $Result.Stdout.TrimEnd() }
  Write-Output "stdout_end"
  Write-Output "stderr_begin"
  if ($Result.Stderr) { Write-Output $Result.Stderr.TrimEnd() }
  Write-Output "stderr_end"
  Write-Output "process_duration_ms=$($Result.DurationMs)"
  Write-Output "new_postgres_log_markers=$($newMarkers.Count)"
  if ($newMarkers.Count -gt 0) { $newMarkers | ForEach-Object { Write-Output "log_marker=$_" } }
}

function New-AuthProfileSql {
  param([Parameter(Mandatory)][string[]]$UserIds)

  $rows = foreach ($userId in $UserIds) {
    $compact = $userId.Replace('-', '')
    @"
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('$userId', 'authenticated', 'authenticated', 'crash-diag-$compact@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id, username, nickname, synthetic_email)
values ('$userId', 'crash-diag-$compact', 'Crash Diagnostic $($compact.Substring(0, 8))', 'crash-diag-$compact@local.test')
on conflict (id) do nothing;
"@
  }
  return ($rows -join "`n")
}

function Get-CleanupSql {
  $userList = $allUsers -join "','"
  return @"
delete from public.game_rooms where id in ('$fullRoom', '$minimalRoom');
delete from auth.users where id in ('$userList');
"@
}

function Get-SetupSql {
  $fullHost = $fullUsers[0]; $fullOne = $fullUsers[1]; $fullTwo = $fullUsers[2]; $fullThree = $fullUsers[3]
  $minimalHost = $minimalUsers[0]; $minimalOne = $minimalUsers[1]; $minimalTwo = $minimalUsers[2]

  return @"
begin;
$(New-AuthProfileSql -UserIds $allUsers)

insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, use_items, game_duration_seconds, grace_duration_seconds,
  game_starts_at, game_deadline_at, group_start_title, group_start_page_id,
  group_start_revision_id, group_target_title, group_target_page_id,
  group_target_revision_id, finished_count, state_version
)
values
  ('$fullRoom', 'CRASH-DIAG-FULL', '$fullHost', 'playing', 'group', 3, 4,
   3, false, 1200, 120, clock_timestamp() - interval '20 seconds',
   clock_timestamp() + interval '10 minutes', 'Full Start',
   'crash-diag-full-start', '100', 'Full Target', 'crash-diag-full-target',
   '200', 1, 12),
  ('$minimalRoom', 'CRASH-DIAG-MIN', '$minimalHost', 'playing', 'group', 3, 3,
   3, false, 1200, 120, clock_timestamp() - interval '20 seconds',
   clock_timestamp() + interval '10 minutes', 'Minimal Start', null, null,
   'Minimal Target', null, null, 1, 0);

insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished,
  rank, finished_at, start_title, target_title, current_title,
  start_page_id, start_revision_id, target_page_id, target_revision_id,
  current_page_id, current_revision_id, path_titles, path_page_ids,
  path_revision_ids, progress_version
)
values
  ('$fullRoom', '$fullHost', 'host', 'Full Spectator', 'finished', true, 1, now(),
   'Full Start', 'Full Target', 'Full Target', 'crash-diag-full-start', '100',
   'crash-diag-full-target', '200', 'crash-diag-full-target', '200',
   array['Full Start','Full Target'], array['crash-diag-full-start','crash-diag-full-target'], array['100','200'], 1),
  ('$fullRoom', '$fullOne', 'guest', 'Full Active One', 'playing', false, null, null,
   'Full Start', 'Full Target', 'Full Start', 'crash-diag-full-start', '100',
   'crash-diag-full-target', '200', 'crash-diag-full-start', '100',
   array['Full Start'], array['crash-diag-full-start'], array['100'], 0),
  ('$fullRoom', '$fullTwo', 'guest', 'Full Active Two', 'playing', false, null, null,
   'Full Start', 'Full Target', 'Full Start', 'crash-diag-full-start', '100',
   'crash-diag-full-target', '200', 'crash-diag-full-start', '100',
   array['Full Start'], array['crash-diag-full-start'], array['100'], 0),
  ('$fullRoom', '$fullThree', 'guest', 'Full Active Three', 'playing', false, null, null,
   'Full Start', 'Full Target', 'Full Start', 'crash-diag-full-start', '100',
   'crash-diag-full-target', '200', 'crash-diag-full-start', '100',
   array['Full Start'], array['crash-diag-full-start'], array['100'], 0);

insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished,
  rank, finished_at, start_title, target_title, current_title, path_titles
)
values
  ('$minimalRoom', '$minimalHost', 'host', 'Minimal Spectator', 'finished', true, 1, now(),
   'Minimal Start', 'Minimal Target', 'Minimal Target', array['Minimal Start','Minimal Target']),
  ('$minimalRoom', '$minimalOne', 'guest', 'Minimal Active One', 'playing', false, null, null,
   'Minimal Start', 'Minimal Target', 'Minimal Start', array['Minimal Start']),
  ('$minimalRoom', '$minimalTwo', 'guest', 'Minimal Active Two', 'playing', false, null, null,
   'Minimal Start', 'Minimal Target', 'Minimal Start', array['Minimal Start']);

insert into public.group_match_results(
  room_id, user_id, nickname_snapshot, result_status, rank, is_winner,
  start_title, target_title, current_title, move_count, path_titles,
  finished_at, finalized_at
)
values
  ('$fullRoom', '$fullHost', 'Full Spectator', 'finished', 1, true,
   'Full Start', 'Full Target', 'Full Target', 1, array['Full Start','Full Target'], now(), now()),
  ('$minimalRoom', '$minimalHost', 'Minimal Spectator', 'finished', 1, true,
   'Minimal Start', 'Minimal Target', 'Minimal Target', 1, array['Minimal Start','Minimal Target'], now(), now());
commit;
"@
}

function Get-CallSql {
  param(
    [Parameter(Mandatory)][string]$RoomId,
    [Parameter(Mandatory)][string]$UserId,
    [ValidateSet('authenticated', 'service_role', 'anon')][string]$Role = 'authenticated',
    [switch]$Prepared,
    [switch]$DiscardPlans
  )

  $call = if ($Prepared) {
    "prepare crash_diag_emoji(uuid, text) as select public.send_group_spectator_emoji_v13(`$1, `$2);`nexecute crash_diag_emoji('$RoomId', 'cheer');"
  } else {
    "select public.send_group_spectator_emoji_v13('$RoomId', 'cheer');"
  }
  $discard = if ($DiscardPlans) { 'discard plans;' } else { '' }
  $jwt = if ($Role -eq 'anon') { '' } else { "set request.jwt.claim.sub = '$UserId';" }
  return @"
set role $Role;
$jwt
select 'before', clock_timestamp(), pg_backend_pid(), pg_postmaster_start_time(), current_user, auth.uid(), pg_get_function_result('public.send_group_spectator_emoji_v13(uuid,text)'::regprocedure);
$discard
$call
select 'after', clock_timestamp(), pg_backend_pid(), pg_postmaster_start_time(), current_user, auth.uid();
"@
}

function Get-LongLivedSql {
  param(
    [Parameter(Mandatory)][string]$FullRoomId,
    [Parameter(Mandatory)][string]$FullUserId,
    [Parameter(Mandatory)][string]$MinimalRoomId,
    [Parameter(Mandatory)][string]$MinimalUserId
  )

  return @"
set role authenticated;
set request.jwt.claim.sub = '$FullUserId';
select 'full-before', pg_backend_pid(), pg_postmaster_start_time(), current_user, auth.uid();
select public.send_group_spectator_emoji_v13('$FullRoomId', 'cheer');
begin;
select 1 as transaction_probe;
commit;
discard plans;
set request.jwt.claim.sub = '$MinimalUserId';
select 'minimal-after-discard', pg_backend_pid(), pg_postmaster_start_time(), current_user, auth.uid();
select public.send_group_spectator_emoji_v13('$MinimalRoomId', 'cheer');
select 'long-lived-after', pg_backend_pid(), pg_postmaster_start_time();
"@
}

function Get-StageSql {
  param([Parameter(Mandatory)][string]$RoomId, [Parameter(Mandatory)][string]$UserId)

  return @"
create or replace function pg_temp.crash_diag_stage(p_room_id uuid, p_user_id uuid, p_stage text)
returns jsonb language plpgsql as `$$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_last_sent_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_event public.room_events;
begin
  if p_stage = 'room_lock' then
    select * into v_room from public.game_rooms where id = p_room_id for update;
    return jsonb_build_object('stage', p_stage, 'found', v_room.id is not null);
  elsif p_stage = 'player_lock' then
    select * into v_player from public.room_players where room_id = p_room_id and user_id = p_user_id for update;
    return jsonb_build_object('stage', p_stage, 'found', v_player.id is not null);
  elsif p_stage = 'preset' then
    if 'cheer' not in ('cheer', 'wow', 'hurry', 'clap', 'gg') then raise exception 'unexpected preset branch'; end if;
    return jsonb_build_object('stage', p_stage, 'accepted', true);
  elsif p_stage = 'rate_ledger' then
    select last_sent_at into v_last_sent_at from public.group_spectator_emoji_rate_limits where room_id = p_room_id and user_id = p_user_id for update;
    return jsonb_build_object('stage', p_stage, 'has_previous', v_last_sent_at is not null);
  elsif p_stage = 'event_insert' then
    insert into public.room_events(room_id, user_id, event_type, payload)
    values (p_room_id, p_user_id, 'group_spectator_emoji', jsonb_build_object('presetId', 'cheer', 'serverSentAt', v_now));
    return jsonb_build_object('stage', p_stage, 'inserted', true);
  elsif p_stage = 'returning_into' then
    insert into public.room_events(room_id, user_id, event_type, payload)
    values (p_room_id, p_user_id, 'group_spectator_emoji', jsonb_build_object('presetId', 'cheer', 'serverSentAt', v_now))
    returning * into v_event;
    return jsonb_build_object('stage', p_stage, 'event_id', v_event.id);
  elsif p_stage = 'to_jsonb' then
    insert into public.room_events(room_id, user_id, event_type, payload)
    values (p_room_id, p_user_id, 'group_spectator_emoji', jsonb_build_object('presetId', 'cheer', 'serverSentAt', v_now))
    returning * into v_event;
    return to_jsonb(v_event);
  elsif p_stage = 'jsonb_build_object' then
    insert into public.room_events(room_id, user_id, event_type, payload)
    values (p_room_id, p_user_id, 'group_spectator_emoji', jsonb_build_object('presetId', 'cheer', 'serverSentAt', v_now))
    returning * into v_event;
    return jsonb_build_object('accepted', true, 'event_id', v_event.id, 'event', to_jsonb(v_event));
  elsif p_stage = 'rate_upsert' then
    insert into public.group_spectator_emoji_rate_limits(room_id, user_id, last_sent_at)
    values (p_room_id, p_user_id, v_now)
    on conflict (room_id, user_id) do update set last_sent_at = excluded.last_sent_at;
    return jsonb_build_object('stage', p_stage, 'upserted', true);
  elsif p_stage = 'final_json' then
    insert into public.group_spectator_emoji_rate_limits(room_id, user_id, last_sent_at)
    values (p_room_id, p_user_id, v_now)
    on conflict (room_id, user_id) do update set last_sent_at = excluded.last_sent_at;
    insert into public.room_events(room_id, user_id, event_type, payload)
    values (p_room_id, p_user_id, 'group_spectator_emoji', jsonb_build_object('presetId', 'cheer', 'serverSentAt', v_now))
    returning * into v_event;
    return jsonb_build_object('accepted', true, 'code', 'ACCEPTED', 'event_id', v_event.id, 'event', to_jsonb(v_event));
  end if;
  raise exception 'unknown diagnostic stage: %', p_stage;
end;
`$$;

set role postgres;
begin;
select stage, pg_temp.crash_diag_stage('$RoomId', '$UserId', stage)
from unnest(array['room_lock','player_lock','preset','rate_ledger','event_insert','returning_into','to_jsonb','jsonb_build_object','rate_upsert','final_json']) as stages(stage);
rollback;
"@
}

function Wait-Database {
  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    $health = Invoke-CapturedProcess -FileName 'docker' -Arguments @('inspect', '-f', '{{.State.Health.Status}}', $dbContainer)
    $first = Invoke-DiagnosticPsql 'select pg_postmaster_start_time()::text;' -AllowFailure
    if ($health.ExitCode -eq 0 -and $health.Stdout.Trim() -eq 'healthy' -and $first.ExitCode -eq 0) {
      Start-Sleep -Milliseconds 500
      $second = Invoke-DiagnosticPsql 'select pg_postmaster_start_time()::text;' -AllowFailure
      $firstStart = @($first.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
      $secondStart = @($second.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
      if ($second.ExitCode -eq 0 -and $firstStart -and $firstStart -eq $secondStart) { return }
    }
    Start-Sleep -Milliseconds 500
  }
  throw 'database did not become ready after the diagnostic call'
}

function Invoke-ObservedCall {
  param(
    [Parameter(Mandatory)][string]$RoomId,
    [Parameter(Mandatory)][string]$UserId,
    [ValidateSet('authenticated', 'service_role', 'anon')][string]$Role = 'authenticated',
    [ValidateSet('Allowed', 'Denied')][string]$Expected = 'Allowed',
    [switch]$Prepared,
    [switch]$DiscardPlans
  )
  $before = Get-RuntimeSnapshot
  $result = Invoke-DiagnosticPsql (Get-CallSql -RoomId $RoomId -UserId $UserId -Role $Role -Prepared:$Prepared -DiscardPlans:$DiscardPlans) -AllowFailure
  if ($result.ExitCode -ne 0) { Wait-Database }
  $after = Get-RuntimeSnapshot
  Write-ObservedResult -CaseName "$Variant/$Role" -Expected $Expected -Result $result -Before $before -After $after
  return $result
}

switch ($Variant) {
  'prepare' {
    Invoke-DiagnosticPsql (Get-CleanupSql)
    Invoke-DiagnosticPsql (Get-SetupSql)
    Write-Output "prepared full_room=$fullRoom spectator=$($fullUsers[0])"
    Write-Output "prepared minimal_room=$minimalRoom spectator=$($minimalUsers[0])"
    Write-Output 'original fixture status: observed in logs only; not recoverable from current database/repository'
  }
  'new-full' { Invoke-ObservedCall -RoomId $fullRoom -UserId $fullUsers[0] -Expected Allowed }
  'new-minimal' { Invoke-ObservedCall -RoomId $minimalRoom -UserId $minimalUsers[0] -Expected Allowed }
  'prepared-minimal' { Invoke-ObservedCall -RoomId $minimalRoom -UserId $minimalUsers[0] -Expected Allowed -Prepared }
  'discard-minimal' { Invoke-ObservedCall -RoomId $minimalRoom -UserId $minimalUsers[0] -Expected Allowed -DiscardPlans }
  'service-full' { Invoke-ObservedCall -RoomId $fullRoom -UserId $fullUsers[0] -Role service_role -Expected Allowed }
  'anon' { Invoke-ObservedCall -RoomId $minimalRoom -UserId $minimalUsers[0] -Role anon -Expected Denied }
  'long-lived' {
    $result = Invoke-DiagnosticPsql (Get-LongLivedSql -FullRoomId $fullRoom -FullUserId $fullUsers[0] -MinimalRoomId $minimalRoom -MinimalUserId $minimalUsers[0]) -AllowFailure
    if ($result.ExitCode -ne 0) { Wait-Database }
    if ($result.ExitCode -ne 0) { $script:caseFailed = $true }
    Write-Output "CASE $(if ($result.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }) $Variant exit_code=$($result.ExitCode)"
    Write-Output "stdout_begin"; if ($result.Stdout) { Write-Output $result.Stdout.TrimEnd() }; Write-Output "stdout_end"
    Write-Output "stderr_begin"; if ($result.Stderr) { Write-Output $result.Stderr.TrimEnd() }; Write-Output "stderr_end"
  }
  'stage-minimal' {
    $result = Invoke-DiagnosticPsql (Get-StageSql -RoomId $minimalRoom -UserId $minimalUsers[0]) -AllowFailure
    if ($result.ExitCode -ne 0) { Wait-Database }
    if ($result.ExitCode -ne 0) { $script:caseFailed = $true }
    Write-Output "CASE $(if ($result.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }) $Variant exit_code=$($result.ExitCode)"
    Write-Output "stdout_begin"; if ($result.Stdout) { Write-Output $result.Stdout.TrimEnd() }; Write-Output "stdout_end"
    Write-Output "stderr_begin"; if ($result.Stderr) { Write-Output $result.Stderr.TrimEnd() }; Write-Output "stderr_end"
  }
  'stage-full' {
    $result = Invoke-DiagnosticPsql (Get-StageSql -RoomId $fullRoom -UserId $fullUsers[0]) -AllowFailure
    if ($result.ExitCode -ne 0) { Wait-Database }
    if ($result.ExitCode -ne 0) { $script:caseFailed = $true }
    Write-Output "CASE $(if ($result.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }) $Variant exit_code=$($result.ExitCode)"
    Write-Output "stdout_begin"; if ($result.Stdout) { Write-Output $result.Stdout.TrimEnd() }; Write-Output "stdout_end"
    Write-Output "stderr_begin"; if ($result.Stderr) { Write-Output $result.Stderr.TrimEnd() }; Write-Output "stderr_end"
  }
  'cleanup' {
    Invoke-DiagnosticPsql (Get-CleanupSql)
    Write-Output 'diagnostic fixtures cleaned'
  }
}

if ($script:caseFailed) {
  exit 1
}
