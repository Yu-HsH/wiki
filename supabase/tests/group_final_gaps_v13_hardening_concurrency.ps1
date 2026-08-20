param(
  [ValidateSet('all', 'host', 'emoji', 'third-finish')]
  [string]$Scenario = 'all',
  [string]$DbContainer = 'supabase_db_wiki'
)

# Local-only two-session regression harness for Packet 13 hardening.
# It must be run only after the local migrations are applied:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\group_final_gaps_v13_hardening_concurrency.ps1
#
# This script deliberately fails when Docker/psql is unavailable. It never
# treats an unavailable local database as a passing concurrency result.

$ErrorActionPreference = 'Stop'
$dbContainer = $DbContainer
$script:HarnessHelperPath = Join-Path $PSScriptRoot 'group_final_gaps_v13_hardening_concurrency_helpers.ps1'
. $script:HarnessHelperPath
$script:HarnessHelperInitialization = [scriptblock]::Create(". '$($script:HarnessHelperPath)'")
$script:CleanupState = New-CleanupState

function Invoke-ContainerPsqlResult {
  param(
    [Parameter(Mandatory)][string]$Container,
    [Parameter(Mandatory)][string]$Sql,
    [string]$WorkerName = 'local-psql'
  )

  $docker = if ($env:OS -eq 'Windows_NT') { 'docker.exe' } else { 'docker' }
  return Invoke-SeparatedProcess -FileName $docker -WorkerName $WorkerName -InputText $Sql -ArgumentList @(
    'exec', '-i', $Container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-v', 'ON_ERROR_STOP=1', '-At'
  )
}

function Get-ResultStdoutLines {
  param([Parameter(Mandatory)][object]$Result)

  if ([string]::IsNullOrEmpty([string]$Result.Stdout)) { return @() }
  return @(([string]$Result.Stdout -split "`r?`n"))
}

function Invoke-LocalPsql {
  param([Parameter(Mandatory)][string]$Sql)

  $result = Invoke-ContainerPsqlResult -Container $dbContainer -Sql $Sql -WorkerName 'local-psql'
  if ($result.ExitCode -ne 0 -or $result.TimedOut -or $result.ConnectionLoss) {
    throw "local psql failed: exit_code=$($result.ExitCode) timeout=$($result.TimedOut) stdout=$(Protect-HarnessText $result.Stdout) stderr=$(Protect-HarnessText $result.Stderr)"
  }
  return @(Get-ResultStdoutLines -Result $result)
}

function Invoke-ConcurrentSql {
  param(
    [Parameter(Mandatory)][string]$Container,
    [Parameter(Mandatory)][string]$Sql,
    [string]$WorkerName = 'concurrent-sql'
  )

  $docker = if ($env:OS -eq 'Windows_NT') { 'docker.exe' } else { 'docker' }
  return Invoke-SeparatedProcess -FileName $docker -WorkerName $WorkerName -InputText $Sql -ArgumentList @(
    'exec', '-i', $Container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-P', 'pager=off'
  )
}

function Invoke-CatalogPsql {
  param([Parameter(Mandatory)][string]$Sql)

  $docker = if ($env:OS -eq 'Windows_NT') { 'docker.exe' } else { 'docker' }
  $result = Invoke-SeparatedProcess -FileName $docker -WorkerName 'catalog-psql' -InputText $Sql -ArgumentList @(
    'exec', '-i', $dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-P', 'pager=off'
  )
  if ($result.ExitCode -ne 0 -or $result.TimedOut -or $result.ConnectionLoss) {
    throw "catalog psql failed: exit_code=$($result.ExitCode) timeout=$($result.TimedOut) stdout=$(Protect-HarnessText $result.Stdout) stderr=$(Protect-HarnessText $result.Stderr)"
  }
  return @(Get-ResultStdoutLines -Result $result)
}

function Get-SessionObservation {
  param([Parameter(Mandatory)][string]$ApplicationName)

  if ([string]::IsNullOrWhiteSpace($ApplicationName)) {
    throw 'catalog observation requires a non-empty application name'
  }
  $safeName = ([string]$ApplicationName).Replace("'", "''")
  $sql = @"
select a.pid::text || '|'
  || coalesce(a.state, '') || '|'
  || coalesce(a.wait_event_type, '') || '|'
  || coalesce(a.wait_event, '') || '|'
  || coalesce(a.xact_start::text, '') || '|'
  || coalesce(array_to_string(pg_blocking_pids(a.pid), ','), '') || '|'
  || (select count(*)::text from pg_locks l where l.pid = a.pid and l.relation = 'public.game_rooms'::regclass and l.granted)
  || '|'
  || (select count(*)::text from pg_locks l where l.pid = a.pid and l.locktype = 'advisory' and l.granted)
  || '|'
  || (select count(*)::text from pg_locks l where l.pid = a.pid and l.locktype = 'advisory' and not l.granted)
from pg_stat_activity a
where a.application_name = '$safeName';
"@
  $rawLine = @(Invoke-CatalogPsql $sql)[0]
  $line = if ($null -eq $rawLine) { '' } else { ([string]$rawLine).Trim() }
  if ([string]::IsNullOrWhiteSpace($line)) { return $null }
  $parts = $line -split '\|'
  return [pscustomobject]@{
    Pid = [int]$parts[0]
    State = $parts[1]
    WaitEventType = $parts[2]
    WaitEvent = $parts[3]
    XactStart = $parts[4]
    BlockingPids = $parts[5]
    RoomLocks = [int]$parts[6]
    AdvisoryGranted = [int]$parts[7]
    AdvisoryWaiting = [int]$parts[8]
  }
}

function Wait-SessionObservation {
  param(
    [Parameter(Mandatory)][string]$ApplicationName,
    [Parameter(Mandatory)][scriptblock]$Predicate,
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][System.Management.Automation.Job]$Job,
    [int]$TimeoutSeconds = 30
  )

  $until = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $until) {
    if ($Job.State -in @('Completed', 'Failed', 'Stopped')) {
      $early = @(Receive-Job -Job $Job -Keep -ErrorAction Stop)
      throw "$Label session exited before the expected catalog state: state=$($Job.State) raw=$($early | ConvertTo-Json -Compress)"
    }
    $observation = Get-SessionObservation -ApplicationName $ApplicationName
    if ($null -ne $observation -and (& $Predicate $observation)) {
      return $observation
    }
    Start-Sleep -Milliseconds 50
  }
  throw "$Label catalog state was not observed within ${TimeoutSeconds}s"
}

function New-BarrierCoordinator {
  param(
    [Parameter(Mandatory)][string]$ApplicationName,
    [Parameter(Mandatory)][long]$AdvisoryKey
  )

  $sql = @"
set application_name = '$ApplicationName';
begin;
select pg_catalog.pg_advisory_xact_lock($AdvisoryKey);
select pg_catalog.pg_sleep(600);
rollback;
"@
  return Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $sql, $ApplicationName
}

function Release-BarrierCoordinator {
  param(
    [Parameter(Mandatory)][int]$CoordinatorPid,
    [Parameter(Mandatory)][System.Management.Automation.Job]$CoordinatorJob
  )

  $releasedAt = (Get-Date).ToUniversalTime().ToString('o')
  $releaseOutput = @(Invoke-LocalPsql "select pg_catalog.pg_cancel_backend($CoordinatorPid);")
  $releaseLine = ([string]$releaseOutput[0]).Trim()
  if ($releaseLine -ne 't') {
    throw "barrier coordinator release failed: pid=$CoordinatorPid result=$($releaseOutput -join "`n")"
  }
  Write-Output "BARRIER_RELEASED coordinator_pid=$CoordinatorPid released_at=$releasedAt"
  $completed = Wait-Job -Job $CoordinatorJob -Timeout 10
  if ($null -eq $completed) {
    throw "barrier coordinator did not terminate after explicit release: pid=$CoordinatorPid"
  }
  $raw = @(Receive-Job -Job $CoordinatorJob -Keep -ErrorAction Stop)
  $coordinatorResult = $raw | Where-Object { $_.PSObject.Properties.Name -contains 'ExitCode' } | Select-Object -Last 1
  if ($null -eq $coordinatorResult) {
    throw "barrier coordinator returned no structured process result: pid=$CoordinatorPid"
  }
  Write-Output "COORDINATOR_PROCESS_RESULT worker=$($coordinatorResult.WorkerName) process_id=$($coordinatorResult.ProcessId) exit_code=$($coordinatorResult.ExitCode) timeout=$($coordinatorResult.TimedOut) connection_loss=$($coordinatorResult.ConnectionLoss) start_error=$(Protect-HarnessText $coordinatorResult.StartError) expected=cancelled"
  if (-not [string]::IsNullOrEmpty([string]$coordinatorResult.Stdout)) {
    Write-Output 'COORDINATOR_STDOUT_BEGIN'
    Write-Output (Protect-HarnessText $coordinatorResult.Stdout).TrimEnd()
    Write-Output 'COORDINATOR_STDOUT_END'
  }
  if (-not [string]::IsNullOrEmpty([string]$coordinatorResult.Stderr)) {
    Write-Output 'COORDINATOR_STDERR_BEGIN'
    Write-Output (Protect-HarnessText $coordinatorResult.Stderr).TrimEnd()
    Write-Output 'COORDINATOR_STDERR_END'
  }
}

function Receive-RequiredWorker {
  param(
    [Parameter(Mandatory)][System.Management.Automation.Job]$Job,
    [Parameter(Mandatory)][string]$Label
  )

  $completed = Wait-Job -Job $Job -Timeout 30
  if ($null -eq $completed) {
    throw "$Label did not complete within 30s"
  }
  $raw = @(Receive-Job -Job $Job -Keep -ErrorAction Stop)
  if ($raw.Count -eq 0) {
    throw "$Label returned no structured process result"
  }
  $result = $raw | Select-Object -Last 1
  Write-Output "$Label PROCESS_RESULT worker=$($result.WorkerName) process_id=$($result.ProcessId) start=$($result.StartedAtUtc) end=$($result.EndedAtUtc) exit_code=$($result.ExitCode) timeout=$($result.TimedOut) connection_loss=$($result.ConnectionLoss) start_error=$(Protect-HarnessText $result.StartError) cleanup_status=$($result.CleanupStatus)"
  if (-not [string]::IsNullOrEmpty([string]$result.Stdout)) {
    Write-Output "$Label STDOUT_BEGIN"
    Write-Output (Protect-HarnessText $result.Stdout).TrimEnd()
    Write-Output "$Label STDOUT_END"
  }
  if (-not [string]::IsNullOrEmpty([string]$result.Stderr)) {
    Write-Output "$Label STDERR_BEGIN"
    Write-Output (Protect-HarnessText $result.Stderr).TrimEnd()
    Write-Output "$Label STDERR_END"
  }
  if ($result.TimedOut -or $result.ExitCode -ne 0) {
    throw "$Label failed with exit_code=$($result.ExitCode) timeout=$($result.TimedOut)"
  }
  if ($result.ConnectionLoss) {
    throw "$Label contained a dangerous runtime marker"
  }
  return $result
}

function Invoke-TrackedCleanupSql {
  param(
    [Parameter(Mandatory)][string]$JobName,
    [Parameter(Mandatory)][string]$Sql
  )

  $result = Invoke-CleanupAction -State $script:CleanupState -JobName $JobName -Stage 'fixture-sql' -Action {
    @(Invoke-LocalPsql $Sql)
  }
  if ($result.Success) {
    foreach ($line in @($result.Value)) { Write-Output "CLEANUP_FIXTURE $([string]$line)" }
    Write-Output "CLEANUP_STEP job=$JobName stage=fixture-sql status=pass"
  }
  else {
    Write-Output "CLEANUP_STEP job=$JobName stage=fixture-sql status=fail"
  }
}

function Write-WorkerEvidence {
  param([Parameter(Mandatory)][object]$Result,[Parameter(Mandatory)][string]$Label)

  Write-Output "$Label PROCESS_RESULT worker=$($Result.WorkerName) process_id=$($Result.ProcessId) start=$($Result.StartedAtUtc) end=$($Result.EndedAtUtc) exit_code=$($Result.ExitCode) timeout=$($Result.TimedOut) connection_loss=$($Result.ConnectionLoss) start_error=$(Protect-HarnessText $Result.StartError) cleanup_status=$($Result.CleanupStatus)"
  if (-not [string]::IsNullOrEmpty([string]$Result.Stdout)) {
    Write-Output "$Label STDOUT_BEGIN"
    Write-Output (Protect-HarnessText $Result.Stdout).TrimEnd()
    Write-Output "$Label STDOUT_END"
  }
  if (-not [string]::IsNullOrEmpty([string]$Result.Stderr)) {
    Write-Output "$Label STDERR_BEGIN"
    Write-Output (Protect-HarnessText $Result.Stderr).TrimEnd()
    Write-Output "$Label STDERR_END"
  }
}

function Assert-WorkerResult {
  param([Parameter(Mandatory)][object]$Result,[Parameter(Mandatory)][string]$Label)

  if ($Result.TimedOut -or $Result.ExitCode -ne 0) {
    throw "$Label failed with exit_code=$($Result.ExitCode) timeout=$($Result.TimedOut)"
  }
  if ($Result.ConnectionLoss) {
    throw "$Label contained a dangerous runtime marker"
  }
}

function New-DeterministicFixture {
  param(
    [Parameter(Mandatory)][ValidateSet('hard', 'grace', 'hard-equality', 'grace-equality')][string]$DeadlineKind
  )

  $roomId = [guid]::NewGuid()
  $users = 1..3 | ForEach-Object { [guid]::NewGuid() }
  $spectatorId = $users[0]
  $activeOne = $users[1]
  $activeTwo = $users[2]
  $isGrace = $DeadlineKind -in @('grace', 'grace-equality')
  $isEquality = $DeadlineKind -in @('hard-equality', 'grace-equality')
  $roomStatus = if ($isGrace) { 'grace_period' } else { 'playing' }
  $reason = if ($isGrace) { 'grace_timeout' } else { 'time_limit' }

  if ($DeadlineKind -eq 'hard') {
    $deadlineSql = "clock_timestamp() - interval '1 second'"
    $graceSql = 'null'
    $graceEndsSql = 'null'
    $deadlineSetup = ''
  }
  elseif ($DeadlineKind -eq 'grace') {
    $deadlineSql = "clock_timestamp() + interval '10 minutes'"
    $graceSql = "clock_timestamp() - interval '3 seconds'"
    $graceEndsSql = "clock_timestamp() - interval '1 second'"
    $deadlineSetup = ''
  }
  elseif ($DeadlineKind -eq 'hard-equality') {
    $deadlineSetup = "select clock_timestamp() as r3_deadline \gset`nselect 'EQUALITY_DEADLINE|' || :'r3_deadline';"
    $deadlineSql = ":'r3_deadline'::timestamptz"
    $graceSql = 'null'
    $graceEndsSql = 'null'
  }
  else {
    $deadlineSetup = "select clock_timestamp() as r3_deadline \gset`nselect 'EQUALITY_DEADLINE|' || :'r3_deadline';"
    $deadlineSql = ":'r3_deadline'::timestamptz + interval '10 minutes'"
    $graceSql = ":'r3_deadline'::timestamptz - interval '3 seconds'"
    $graceEndsSql = ":'r3_deadline'::timestamptz"
  }

  $setupSql = @"
begin;
$deadlineSetup
$(New-AuthAndProfilesSql -UserIds $users)
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, use_items, game_duration_seconds, grace_duration_seconds,
  game_starts_at, game_deadline_at, grace_started_at, grace_ends_at, finished_count
)
values ('$roomId', 'R3-$($roomId.ToString('N').Substring(0, 10))', '$spectatorId',
  '$roomStatus', 'group', 3, 3, 3, false, 1200, 120,
  clock_timestamp() - interval '20 seconds', $deadlineSql, $graceSql, $graceEndsSql, 1);
insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished,
  rank, finished_at, start_title, target_title, current_title, path_titles
)
values
  ('$roomId', '$spectatorId', 'host', 'R3 Spectator', 'finished', true, 1, now(), 'Start', 'Target', 'Target', array['Start','Target']),
  ('$roomId', '$activeOne', 'guest', 'R3 Active One', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']),
  ('$roomId', '$activeTwo', 'guest', 'R3 Active Two', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']);
insert into public.group_match_results(
  room_id, user_id, nickname_snapshot, result_status, rank, is_winner,
  start_title, target_title, current_title, move_count, path_titles,
  finished_at, finalized_at
)
values ('$roomId', '$spectatorId', 'R3 Spectator', 'finished', 1, true,
  'Start', 'Target', 'Target', 1, array['Start','Target'], now(), now());
commit;
"@

  return [pscustomobject]@{
    RoomId = $roomId
    SpectatorId = $spectatorId
    ActiveOne = $activeOne
    ActiveTwo = $activeTwo
    Users = $users
    SetupSql = $setupSql
    ExpectedReason = $reason
  }
}

function New-DeterministicSessionSql {
  param(
    [Parameter(Mandatory)][string]$ApplicationName,
    [Parameter(Mandatory)][guid]$UserId,
    [Parameter(Mandatory)][guid]$RoomId,
    [Parameter(Mandatory)][long]$AdvisoryKey,
    [Parameter(Mandatory)][ValidateSet('finalizer', 'emoji')][string]$Operation
  )

  $operationSql = if ($Operation -eq 'finalizer') {
    @"
select 'FINALIZER_RESULT|' || coalesce((q.result).status::text, '') || '|' || coalesce((q.result).finished_reason::text, '')
from (select public.finalize_group_room_if_expired('$RoomId') as result) q;
"@
  }
  else {
    @"
select 'EMOJI_RESULT|' || coalesce(q.result->>'accepted', '') || '|' || coalesce(q.result->>'code', '') || '|' || coalesce(q.result->>'finalized', '')
from (select public.send_group_spectator_emoji_v13('$RoomId', 'cheer') as result) q;
"@
  }

  return @"
set application_name = '$ApplicationName';
-- The direct row lock is intentionally observed from the admin diagnostic
-- connection because authenticated has no table UPDATE privilege. The RPC
-- still receives the real auth.uid claim and executes as its SECURITY DEFINER.
set role postgres;
set request.jwt.claim.sub = '$UserId';
select 'SESSION_START|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
begin;
select id from public.game_rooms where id = '$RoomId' for update;
select 'ROOM_LOCK_ACQUIRED|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
$operationSql
select 'OPERATION_COMPLETE|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
select 'BARRIER_WAIT|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
select pg_catalog.pg_advisory_xact_lock($AdvisoryKey);
select 'BARRIER_RESUMED|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
commit;
select 'COMMIT|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
"@
}

function New-DeterministicFollowerSql {
  param(
    [Parameter(Mandatory)][string]$ApplicationName,
    [Parameter(Mandatory)][guid]$UserId,
    [Parameter(Mandatory)][guid]$RoomId,
    [Parameter(Mandatory)][ValidateSet('finalizer', 'emoji')][string]$Operation
  )

  $operationSql = if ($Operation -eq 'finalizer') {
    @"
select 'FINALIZER_RESULT|' || coalesce((q.result).status::text, '') || '|' || coalesce((q.result).finished_reason::text, '')
from (select public.finalize_group_room_if_expired('$RoomId') as result) q;
"@
  }
  else {
    @"
select 'EMOJI_RESULT|' || coalesce(q.result->>'accepted', '') || '|' || coalesce(q.result->>'code', '') || '|' || coalesce(q.result->>'finalized', '')
from (select public.send_group_spectator_emoji_v13('$RoomId', 'cheer') as result) q;
"@
  }

  return @"
set application_name = '$ApplicationName';
-- The production RPC is exercised with the real auth.uid claim; table access
-- remains inside the SECURITY DEFINER function.
set role postgres;
set request.jwt.claim.sub = '$UserId';
select 'SESSION_START|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
$operationSql
select 'SESSION_END|' || pg_backend_pid()::text || '|' || clock_timestamp()::text;
"@
}

function Assert-DeterministicInvariant {
  param(
    [Parameter(Mandatory)][guid]$RoomId,
    [Parameter(Mandatory)][guid]$ExpectedHost,
    [Parameter(Mandatory)][string]$ExpectedReason,
    [Parameter(Mandatory)][string]$Label
  )

  $sql = @"
select concat_ws('|',
  r.status,
  r.finished_reason,
  (select count(*) from public.group_match_results where room_id = '$RoomId'),
  (select count(*) from public.group_match_results where room_id = '$RoomId' and result_status = 'retired'),
  (select count(*) from public.room_events where room_id = '$RoomId' and event_type = 'player_retired'),
  (select count(*) from public.room_events where room_id = '$RoomId' and event_type = 'game_end'),
  (select count(*) from public.room_events where room_id = '$RoomId' and event_type = 'group_spectator_emoji'),
  (select count(*) from public.group_spectator_emoji_rate_limits where room_id = '$RoomId'),
  r.host_user_id::text,
  (select count(*) from public.room_players where room_id = '$RoomId' and player_status = 'retired')
)
from public.game_rooms r where r.id = '$RoomId';
"@
  $actual = ([string](@(Invoke-LocalPsql $sql)[0])).Trim()
  $expected = "finished|$ExpectedReason|3|2|2|1|0|0|$ExpectedHost|2"
  if ($actual -cne $expected) {
    throw "$Label invariant mismatch: expected='$expected' actual='$actual'"
  }
  Write-Output "$Label INVARIANT $actual"
}

function Test-OutputLine {
  param(
    [Parameter(Mandatory)][object]$Result,
    [Parameter(Mandatory)][string]$Pattern,
    [Parameter(Mandatory)][string]$Label
  )
  $lines = @((Get-ResultStdoutLines -Result $Result) | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -match $Pattern })
  if ($lines.Count -ne 1) {
    throw "$Label expected one stdout line matching '$Pattern', got: $(Protect-HarnessText $Result.Stdout)"
  }
  return $lines[0]
}

function Run-DeterministicLockOrderScenario {
  param(
    [Parameter(Mandatory)][ValidateSet('hard', 'grace')][string]$DeadlineKind,
    [Parameter(Mandatory)][ValidateSet('finalizer-first', 'emoji-first')][string]$Order
  )

  $fixture = New-DeterministicFixture -DeadlineKind $DeadlineKind
  $roomId = $fixture.RoomId
  $applicationSuffix = $roomId.ToString('N').Substring(0, 12)
  $coordinatorName = "r3-coordinator-$applicationSuffix"
  $aName = "r3-a-$applicationSuffix"
  $bName = "r3-b-$applicationSuffix"
  $advisoryKey = [long](Get-Random -Minimum 1000000 -Maximum 2147483647)
  $coordinatorJob = $null
  $jobA = $null
  $jobB = $null
  $coordinatorPid = $null
  $barrierReleased = $false

  try {
    $setupOutput = @(Invoke-LocalPsql $fixture.SetupSql)
    Write-Output "SCENARIO $DeadlineKind $Order room_id=$roomId users=$($fixture.Users -join ',')"
    foreach ($line in $setupOutput) { Write-Output "FIXTURE_RAW $([string]$line)" }

    $coordinatorJob = New-BarrierCoordinator -ApplicationName $coordinatorName -AdvisoryKey $advisoryKey
    $coordinatorObservation = Wait-SessionObservation -ApplicationName $coordinatorName -Label 'coordinator-advisory-owner' -Job $coordinatorJob -Predicate {
      param($row)
      $row.AdvisoryGranted -ge 1 -and $row.AdvisoryWaiting -eq 0
    }
    $coordinatorPid = $coordinatorObservation.Pid
    Write-Output ("OBSERVED coordinator-advisory-owner pid=$($coordinatorObservation.Pid) xact_start=$($coordinatorObservation.XactStart) " +
      "wait_event_type=$($coordinatorObservation.WaitEventType) wait_event=$($coordinatorObservation.WaitEvent) " +
      "advisory_granted=$($coordinatorObservation.AdvisoryGranted) blocking_pids=$($coordinatorObservation.BlockingPids)")

    $aOperation = if ($Order -eq 'finalizer-first') { 'finalizer' } else { 'emoji' }
    $bOperation = if ($Order -eq 'finalizer-first') { 'emoji' } else { 'finalizer' }
    $aUser = if ($aOperation -eq 'finalizer') { $fixture.ActiveOne } else { $fixture.SpectatorId }
    $bUser = if ($bOperation -eq 'finalizer') { $fixture.ActiveOne } else { $fixture.SpectatorId }
    $sqlA = New-DeterministicSessionSql -ApplicationName $aName -UserId $aUser -RoomId $roomId -AdvisoryKey $advisoryKey -Operation $aOperation
    $sqlB = New-DeterministicFollowerSql -ApplicationName $bName -UserId $bUser -RoomId $roomId -Operation $bOperation

    $jobA = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $sqlA, $aName
    $aObservation = Wait-SessionObservation -ApplicationName $aName -Label 'session-a-room-lock-and-barrier-wait' -Job $jobA -Predicate {
      param($row)
      $row.RoomLocks -ge 1 -and $row.WaitEventType -eq 'Lock' -and $row.WaitEvent -match 'advisory' -and $row.AdvisoryWaiting -ge 1
    }
    Write-Output ("OBSERVED session-a-room-lock-and-barrier-wait pid=$($aObservation.Pid) xact_start=$($aObservation.XactStart) " +
      "wait_event_type=$($aObservation.WaitEventType) wait_event=$($aObservation.WaitEvent) " +
      "room_locks=$($aObservation.RoomLocks) advisory_waiting=$($aObservation.AdvisoryWaiting) blocking_pids=$($aObservation.BlockingPids)")

    $jobB = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $sqlB, $bName
    $bObservation = Wait-SessionObservation -ApplicationName $bName -Label 'session-b-room-lock-wait' -Job $jobB -Predicate {
      param($row)
      $row.WaitEventType -eq 'Lock' -and $row.BlockingPids -split ',' -contains ([string]$aObservation.Pid)
    }
    Write-Output ("OBSERVED session-b-room-lock-wait pid=$($bObservation.Pid) xact_start=$($bObservation.XactStart) " +
      "wait_event_type=$($bObservation.WaitEventType) wait_event=$($bObservation.WaitEvent) " +
      "room_locks=$($bObservation.RoomLocks) advisory_waiting=$($bObservation.AdvisoryWaiting) blocking_pids=$($bObservation.BlockingPids) " +
      "lock_owner_pid=$($aObservation.Pid)")

    $barrierReleasedAt = (Get-Date).ToUniversalTime().ToString('o')
    Release-BarrierCoordinator -CoordinatorPid $coordinatorPid -CoordinatorJob $coordinatorJob | ForEach-Object { Write-Output $_ }
    $coordinatorPid = $null
    $barrierReleased = $true
    Write-Output "BARRIER_RELEASE_OBSERVED scenario=$DeadlineKind/$Order released_at=$barrierReleasedAt"

    $aResult = Receive-RequiredWorker -Job $jobA -Label 'session-a'
    $bResult = Receive-RequiredWorker -Job $jobB -Label 'session-b'

    if ($Order -eq 'finalizer-first') {
      Test-OutputLine -Result $aResult -Pattern '^FINALIZER_RESULT\|finished\|(?:time_limit|grace_timeout)$' -Label 'finalizer-first session A finalizer result' | ForEach-Object { Write-Output "ASSERT $_" }
      Test-OutputLine -Result $bResult -Pattern '^EMOJI_RESULT\|false\|SPECTATOR_ROOM_EXPIRED\|false$' -Label 'finalizer-first session B emoji result' | ForEach-Object { Write-Output "ASSERT $_" }
    }
    else {
      Test-OutputLine -Result $aResult -Pattern '^EMOJI_RESULT\|false\|SPECTATOR_ROOM_EXPIRED\|true$' -Label 'emoji-first session A emoji result' | ForEach-Object { Write-Output "ASSERT $_" }
      Test-OutputLine -Result $bResult -Pattern '^FINALIZER_RESULT\|finished\|(?:time_limit|grace_timeout)$' -Label 'emoji-first session B finalizer result' | ForEach-Object { Write-Output "ASSERT $_" }
    }
    Assert-DeterministicInvariant -RoomId $roomId -ExpectedHost $fixture.SpectatorId -ExpectedReason $fixture.ExpectedReason -Label "$DeadlineKind $Order"
    Write-Output "PASS deterministic lock order $DeadlineKind $Order lock_owner=$($aObservation.Pid) waiter=$($bObservation.Pid) barrier_released_at=$barrierReleasedAt"
  }
  finally {
    if ($null -ne $coordinatorPid) {
      $releaseResult = Invoke-CleanupAction -State $script:CleanupState -JobName 'barrier-coordinator' -Stage 'cancel-backend' -JobId $coordinatorPid -Action {
        $releaseOutput = @(Invoke-LocalPsql "select pg_catalog.pg_cancel_backend($coordinatorPid);")
        $releaseLine = ([string]$releaseOutput[0]).Trim()
        if ($releaseLine -ne 't') { throw "coordinator cancel returned '$releaseLine'" }
        return $releaseOutput
      }
      if ($releaseResult.Success) {
        Write-Output "CLEANUP coordinator_pid=$coordinatorPid result=$(@($releaseResult.Value) -join ',')"
      }
      else {
        Write-Output "CLEANUP coordinator_pid=$coordinatorPid result=failed"
      }
    }
    $jobIndex = 0
    foreach ($job in @($jobA, $jobB, $coordinatorJob)) {
      if ($null -ne $job) {
        $jobIndex++
        [void](Invoke-JobCleanup -Job $job -JobName "deterministic-job-$jobIndex" -State $script:CleanupState)
      }
    }
    Invoke-TrackedCleanupSql -JobName 'deterministic-fixture' -Sql "delete from public.game_rooms where id = '$roomId'; delete from auth.users where id in ('$($fixture.SpectatorId)', '$($fixture.ActiveOne)', '$($fixture.ActiveTwo)');"
  }
}

function Run-DeadlineEqualityScenario {
  param(
    [Parameter(Mandatory)][ValidateSet('hard-equality', 'grace-equality')][string]$DeadlineKind
  )

  $fixture = New-DeterministicFixture -DeadlineKind $DeadlineKind
  $roomId = $fixture.RoomId
  $appName = "r3-equality-$($roomId.ToString('N').Substring(0, 12))"
  $sql = New-DeterministicFollowerSql -ApplicationName $appName -UserId $fixture.SpectatorId -RoomId $roomId -Operation 'emoji'
  try {
    $setupOutput = @(Invoke-LocalPsql $fixture.SetupSql)
    Write-Output "SCENARIO $DeadlineKind room_id=$roomId user=$($fixture.SpectatorId)"
    foreach ($line in $setupOutput) { Write-Output "FIXTURE_RAW $([string]$line)" }
    $result = Invoke-ConcurrentSql -Container $dbContainer -Sql $sql -WorkerName $appName
    Write-WorkerEvidence -Result $result -Label 'equality-session'
    Assert-WorkerResult -Result $result -Label 'deadline equality RPC'
    Test-OutputLine -Result $result -Pattern '^EMOJI_RESULT\|false\|SPECTATOR_ROOM_EXPIRED\|true$' -Label "$DeadlineKind equality emoji result" | ForEach-Object { Write-Output "ASSERT $_" }
    Assert-DeterministicInvariant -RoomId $roomId -ExpectedHost $fixture.SpectatorId -ExpectedReason $fixture.ExpectedReason -Label $DeadlineKind
    Write-Output "PASS deadline equality $DeadlineKind"
  }
  finally {
    Invoke-TrackedCleanupSql -JobName 'deadline-equality-fixture' -Sql "delete from public.game_rooms where id = '$roomId'; delete from auth.users where id in ('$($fixture.SpectatorId)', '$($fixture.ActiveOne)', '$($fixture.ActiveTwo)');"
  }
}

function Assert-Scalar {
  param(
    [Parameter(Mandatory)][string]$Sql,
    [Parameter(Mandatory)][string]$Expected,
    [Parameter(Mandatory)][string]$Message
  )

  $actual = [string](@(Invoke-LocalPsql $Sql)[0]).Trim()
  if ($actual -cne $Expected) {
    throw "${Message}: expected '$Expected', got '$actual'"
  }
}

function New-AuthAndProfilesSql {
  param([Parameter(Mandatory)][guid[]]$UserIds)

  $rows = foreach ($userId in $UserIds) {
    $textId = $userId.ToString()
    @"
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('$textId', 'authenticated', 'authenticated', 'hardening-$($userId.ToString('N'))@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id, username, nickname, synthetic_email)
values ('$textId', 'hardening-$($userId.ToString('N'))', 'Hardening $($userId.ToString('N').Substring(0, 6))', 'hardening-$($userId.ToString('N'))@local.test')
on conflict (id) do nothing;
"@
  }
  return ($rows -join "`n")
}

function Run-HostLeaveScenario {
  $roomId = [guid]::NewGuid()
  $users = 1..3 | ForEach-Object { [guid]::NewGuid() }
  $hostId = $users[0]
  $guestOne = $users[1]
  $guestTwo = $users[2]
  $jobHost = $null
  $jobGuest = $null

  $setupSql = @"
begin;
$(New-AuthAndProfilesSql -UserIds $users)
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, use_items, game_duration_seconds, grace_duration_seconds,
  finished_count, finished_at, finished_reason
)
values ('$roomId', 'HARDHOST-$($roomId.ToString('N').Substring(0, 8))', '$hostId',
  'finished', 'group', 3, 3, 3, false, 1200, 120, 3, now(), 'all_resolved');
insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished,
  rank, finished_at, start_title, target_title, current_title, path_titles
)
values
  ('$roomId', '$hostId', 'host', 'Hardening Host', 'finished', true, 1, now(), 'Start', 'Target', 'Target', array['Start','Target']),
  ('$roomId', '$guestOne', 'guest', 'Hardening Guest One', 'finished', true, 2, now(), 'Start', 'Target', 'Target', array['Start','Target']),
  ('$roomId', '$guestTwo', 'guest', 'Hardening Guest Two', 'finished', true, 3, now(), 'Start', 'Target', 'Target', array['Start','Target']);
insert into public.group_match_results(
  room_id, user_id, nickname_snapshot, result_status, rank, is_winner,
  start_title, target_title, current_title, move_count, path_titles,
  finished_at, finalized_at
)
values
  ('$roomId', '$hostId', 'Hardening Host', 'finished', 1, true, 'Start', 'Target', 'Target', 1, array['Start','Target'], now(), now()),
  ('$roomId', '$guestOne', 'Hardening Guest One', 'finished', 2, true, 'Start', 'Target', 'Target', 1, array['Start','Target'], now(), now()),
  ('$roomId', '$guestTwo', 'Hardening Guest Two', 'finished', 3, true, 'Start', 'Target', 'Target', 1, array['Start','Target'], now(), now());
commit;
"@

  $leaveHost = @"
set role authenticated;
set request.jwt.claim.sub = '$hostId';
select public.leave_group_player('$roomId', 'left');
"@
  $leaveGuest = @"
set role authenticated;
set request.jwt.claim.sub = '$guestOne';
select public.leave_group_player('$roomId', 'left');
"@

  try {
    Invoke-LocalPsql $setupSql | Out-Null
      $jobHost = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $leaveHost, 'host-leave-host'
      $jobGuest = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $leaveGuest, 'host-leave-guest'
    $completed = @(Wait-Job -Job $jobHost, $jobGuest -Timeout 30)
    if ($completed.Count -ne 2) { throw 'concurrent host leave did not complete within 30s' }
    $hostResult = @(Receive-Job -Job $jobHost -Keep -ErrorAction Stop) | Select-Object -Last 1
    $guestResult = @(Receive-Job -Job $jobGuest -Keep -ErrorAction Stop) | Select-Object -Last 1
    $results = @($hostResult, $guestResult)
    Write-WorkerEvidence -Result $hostResult -Label 'host-leave-host'
    Write-WorkerEvidence -Result $guestResult -Label 'host-leave-guest'
    Assert-WorkerResult -Result $hostResult -Label 'concurrent host leave host'
    Assert-WorkerResult -Result $guestResult -Label 'concurrent host leave guest'

    Assert-Scalar "select count(*) from public.room_players where room_id = '$roomId';" '1' 'concurrent host leave keeps one member'
    Assert-Scalar "select count(*) from public.room_players where room_id = '$roomId' and role = 'host';" '1' 'concurrent host leave keeps exactly one host role'
    Assert-Scalar "select (host_user_id = (select user_id from public.room_players where room_id = '$roomId'))::int from public.game_rooms where id = '$roomId';" '1' 'host reference matches the remaining member'
    Assert-Scalar "select count(*) from public.group_match_results where room_id = '$roomId';" '3' 'finished results survive spectator leaves'

    Invoke-LocalPsql @"
set role authenticated;
set request.jwt.claim.sub = '$guestTwo';
select public.leave_group_player('$roomId', 'left');
"@ | Out-Null

    Assert-Scalar "select count(*) from public.room_players where room_id = '$roomId';" '0' 'last finished spectator leaves membership'
    Assert-Scalar "select (host_user_id is null)::int from public.game_rooms where id = '$roomId';" '1' 'empty finished room has no stale active host reference'
    Assert-Scalar "select count(*) from public.group_match_results where room_id = '$roomId';" '3' 'empty finished room preserves result history'
    Write-Output 'PASS host leave concurrency and empty-room host clearing'
  }
  finally {
    if ($null -ne $jobHost) { [void](Invoke-JobCleanup -Job $jobHost -JobName 'host-leave-host' -State $script:CleanupState) }
    if ($null -ne $jobGuest) { [void](Invoke-JobCleanup -Job $jobGuest -JobName 'host-leave-guest' -State $script:CleanupState) }
    Invoke-TrackedCleanupSql -JobName 'host-leave-fixture' -Sql "delete from public.game_rooms where id = '$roomId'; delete from auth.users where id in ('$hostId', '$guestOne', '$guestTwo');"
  }
}

function Run-EmojiDeadlineScenario {
  param(
    [ValidateSet('hard-before', 'hard-alone', 'hard', 'grace-before', 'grace-alone', 'grace')]
    [string]$DeadlineKind = 'hard'
  )

  $roomId = [guid]::NewGuid()
  $users = 1..3 | ForEach-Object { [guid]::NewGuid() }
  $spectatorId = $users[0]
  $activeOne = $users[1]
  $activeTwo = $users[2]
  $jobEmoji = $null
  $jobFinalizer = $null

  $expectRejected = $DeadlineKind -in @('hard-alone', 'hard', 'grace-alone', 'grace')
  $runConcurrentFinalizer = $DeadlineKind -in @('hard', 'grace')

  if ($DeadlineKind -eq 'hard-before') {
    $roomStatus = 'playing'
    $gameStartsAt = "clock_timestamp() - interval '20 seconds'"
    $gameDeadlineAt = "clock_timestamp() + interval '10 seconds'"
    $graceStartedAt = 'null'
    $graceEndsAt = 'null'
  }
  elseif ($DeadlineKind -in @('hard-alone', 'hard')) {
    $roomStatus = 'playing'
    $gameStartsAt = "clock_timestamp() - interval '20 seconds'"
    $gameDeadlineAt = "clock_timestamp() - interval '1 second'"
    $graceStartedAt = 'null'
    $graceEndsAt = 'null'
  }
  elseif ($DeadlineKind -eq 'grace-before') {
    $roomStatus = 'grace_period'
    $gameStartsAt = "clock_timestamp() - interval '20 seconds'"
    $gameDeadlineAt = "clock_timestamp() + interval '10 minutes'"
    $graceStartedAt = "clock_timestamp() - interval '3 seconds'"
    $graceEndsAt = "clock_timestamp() + interval '10 seconds'"
  }
  else {
    $roomStatus = 'grace_period'
    $gameStartsAt = "clock_timestamp() - interval '20 seconds'"
    $gameDeadlineAt = "clock_timestamp() + interval '10 minutes'"
    $graceStartedAt = "clock_timestamp() - interval '3 seconds'"
    $graceEndsAt = "clock_timestamp() - interval '1 second'"
  }

  $setupSql = @"
begin;
$(New-AuthAndProfilesSql -UserIds $users)
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, use_items, game_duration_seconds, grace_duration_seconds,
  game_starts_at, game_deadline_at, grace_started_at, grace_ends_at, finished_count
)
values ('$roomId', 'HARDEMOJI-$($roomId.ToString('N').Substring(0, 8))', '$spectatorId',
  '$roomStatus', 'group', 3, 3, 3, false, 1200, 120,
  $gameStartsAt, $gameDeadlineAt, $graceStartedAt, $graceEndsAt, 1);
insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished,
  rank, finished_at, start_title, target_title, current_title, path_titles
)
values
  ('$roomId', '$spectatorId', 'host', 'Hardening Spectator', 'finished', true, 1, now(), 'Start', 'Target', 'Target', array['Start','Target']),
  ('$roomId', '$activeOne', 'guest', 'Hardening Active One', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']),
  ('$roomId', '$activeTwo', 'guest', 'Hardening Active Two', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']);
insert into public.group_match_results(
  room_id, user_id, nickname_snapshot, result_status, rank, is_winner,
  start_title, target_title, current_title, move_count, path_titles,
  finished_at, finalized_at
)
values ('$roomId', '$spectatorId', 'Hardening Spectator', 'finished', 1, true,
  'Start', 'Target', 'Target', 1, array['Start','Target'], now(), now());
commit;
"@

  if ($expectRejected) {
    $emojiSql = @"
set role authenticated;
set request.jwt.claim.sub = '$spectatorId';
select (public.send_group_spectator_emoji_v13('$roomId', 'cheer')->>'code');
"@
  }
  else {
    $emojiSql = @"
set role authenticated;
set request.jwt.claim.sub = '$spectatorId';
select public.send_group_spectator_emoji_v13('$roomId', 'cheer');
"@
  }
  $finalizerSql = @"
set role authenticated;
set request.jwt.claim.sub = '$activeOne';
select public.finalize_group_room_if_expired('$roomId');
"@

  try {
    Invoke-LocalPsql $setupSql | Out-Null
    if ($runConcurrentFinalizer) {
      $jobEmoji = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $emojiSql, 'deadline-emoji'
      $jobFinalizer = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $finalizerSql, 'deadline-finalizer'
      $completed = @(Wait-Job -Job $jobEmoji, $jobFinalizer -Timeout 30)
      if ($completed.Count -ne 2) { throw 'concurrent finalizer/emoji did not complete within 30s' }
      $emojiResult = @(Receive-Job -Job $jobEmoji -Keep -ErrorAction Stop) | Select-Object -Last 1
      $finalizerResult = @(Receive-Job -Job $jobFinalizer -Keep -ErrorAction Stop) | Select-Object -Last 1
      $results = @($emojiResult, $finalizerResult)
      Write-WorkerEvidence -Result $emojiResult -Label 'deadline-emoji'
      Write-WorkerEvidence -Result $finalizerResult -Label 'deadline-finalizer'
      Assert-WorkerResult -Result $emojiResult -Label 'concurrent deadline emoji'
      Assert-WorkerResult -Result $finalizerResult -Label 'concurrent deadline finalizer'
      $codes = @(
        $results |
          ForEach-Object { ([string]$_.Stdout -split "`r?`n") } |
          ForEach-Object { ([string]$_).Trim() } |
          Where-Object { $_ -eq 'SPECTATOR_ROOM_EXPIRED' }
      )
      if ($codes.Count -ne 1) {
        throw "concurrent expired emoji response was not structured: $($results | ConvertTo-Json -Compress)"
      }
    }
    elseif ($expectRejected) {
      $result = Invoke-ConcurrentSql -Container $dbContainer -Sql $emojiSql -WorkerName 'deadline-emoji-standalone'
      $standaloneCode = @(
        ([string]$result.Stdout -split "`r?`n") |
          ForEach-Object { ([string]$_).Trim() } |
          Where-Object { $_ -eq 'SPECTATOR_ROOM_EXPIRED' }
      )
      if ($result.ExitCode -ne 0 -or $standaloneCode.Count -ne 1) {
        throw "standalone expired emoji response was not structured: $($result | ConvertTo-Json -Compress)"
      }
    }
    else {
      $result = Invoke-ConcurrentSql -Container $dbContainer -Sql $emojiSql -WorkerName 'deadline-emoji-before'
      if ($result.ExitCode -ne 0) {
        throw "pre-deadline emoji unexpectedly failed: $($result | ConvertTo-Json -Compress)"
      }
    }

    $expectedStatus = if ($expectRejected) { 'finished' } else { $roomStatus }
    $expectedEventCount = if ($expectRejected) { '0' } else { '1' }
    $expectedLedgerCount = if ($expectRejected) { '0' } else { '1' }
    Assert-Scalar "select status from public.game_rooms where id = '$roomId';" $expectedStatus "$DeadlineKind emoji keeps expected room status"
    Assert-Scalar "select count(*) from public.room_events where room_id = '$roomId' and event_type = 'group_spectator_emoji';" $expectedEventCount "$DeadlineKind emoji event count"
    Assert-Scalar "select count(*) from public.group_spectator_emoji_rate_limits where room_id = '$roomId';" $expectedLedgerCount "$DeadlineKind emoji rate ledger count"
    Write-Output "PASS $DeadlineKind deadline emoji behavior"
  }
  finally {
    if ($null -ne $jobEmoji) { [void](Invoke-JobCleanup -Job $jobEmoji -JobName 'deadline-emoji' -State $script:CleanupState) }
    if ($null -ne $jobFinalizer) { [void](Invoke-JobCleanup -Job $jobFinalizer -JobName 'deadline-finalizer' -State $script:CleanupState) }
    Invoke-TrackedCleanupSql -JobName 'deadline-emoji-fixture' -Sql "delete from public.game_rooms where id = '$roomId'; delete from auth.users where id in ('$spectatorId', '$activeOne', '$activeTwo');"
  }
}

function Run-ThirdFinishScenario {
  $roomId = [guid]::NewGuid()
  $users = 1..4 | ForEach-Object { [guid]::NewGuid() }
  $finishedOne = $users[0]
  $finishedTwo = $users[1]
  $thirdUser = $users[2]
  $fourthUser = $users[3]
  $middlePageId = "hardening-middle-$($roomId.ToString('N'))"
  $targetPageId = "hardening-target-$($roomId.ToString('N'))"
  $middleSnapshotId = [guid]::NewGuid()
  $targetSnapshotId = [guid]::NewGuid()
  $requestOne = [guid]::NewGuid()
  $requestTwo = [guid]::NewGuid()
  $correlationOne = [guid]::NewGuid()
  $correlationTwo = [guid]::NewGuid()
  $jobOne = $null
  $jobTwo = $null

  $setupSql = @"
begin;
$(New-AuthAndProfilesSql -UserIds $users)
insert into public.wiki_pages(page_id, canonical_title)
values ('$middlePageId', 'Hardening Middle'), ('$targetPageId', 'Hardening Target');
insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('$middleSnapshotId', '$middlePageId', '400', 'Hardening Middle'),
  ('$targetSnapshotId', '$targetPageId', '500', 'Hardening Target');
insert into public.wiki_snapshot_links(
  snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal
)
values ('$middleSnapshotId', '$targetPageId', '500', 'Hardening Target', 'Hardening Target', 0);
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, use_items, game_duration_seconds, grace_duration_seconds,
  game_starts_at, game_deadline_at, group_start_title, group_start_page_id,
  group_start_revision_id, group_target_title, group_target_page_id,
  group_target_revision_id, finished_count
)
values ('$roomId', 'HARDTHIRD-$($roomId.ToString('N').Substring(0, 8))', '$finishedOne',
  'playing', 'group', 4, 4, 3, false, 1200, 120,
  clock_timestamp() - interval '10 seconds', clock_timestamp() + interval '10 minutes',
  'Hardening Middle', '$middlePageId', '400', 'Hardening Target', '$targetPageId', '500', 2);
insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished,
  rank, finished_at, start_title, target_title, current_title,
  start_page_id, start_revision_id, target_page_id, target_revision_id,
  current_page_id, current_revision_id, path_titles, path_page_ids,
  path_revision_ids, progress_version
)
values
  ('$roomId', '$finishedOne', 'host', 'Hardening Finished One', 'finished', true, 1, now(), 'Hardening Middle', 'Hardening Target', 'Hardening Target', '$middlePageId', '400', '$targetPageId', '500', '$targetPageId', '500', array['Hardening Middle','Hardening Target'], array['$middlePageId','$targetPageId'], array['400','500'], 1),
  ('$roomId', '$finishedTwo', 'guest', 'Hardening Finished Two', 'finished', true, 2, now(), 'Hardening Middle', 'Hardening Target', 'Hardening Target', '$middlePageId', '400', '$targetPageId', '500', '$targetPageId', '500', array['Hardening Middle','Hardening Target'], array['$middlePageId','$targetPageId'], array['400','500'], 1),
  ('$roomId', '$thirdUser', 'guest', 'Hardening Third', 'playing', false, null, null, 'Hardening Middle', 'Hardening Target', 'Hardening Middle', '$middlePageId', '400', '$targetPageId', '500', '$middlePageId', '400', array['Hardening Middle'], array['$middlePageId'], array['400'], 0),
  ('$roomId', '$fourthUser', 'guest', 'Hardening Fourth', 'playing', false, null, null, 'Hardening Middle', 'Hardening Target', 'Hardening Middle', '$middlePageId', '400', '$targetPageId', '500', '$middlePageId', '400', array['Hardening Middle'], array['$middlePageId'], array['400'], 0);
insert into public.group_match_results(
  room_id, user_id, nickname_snapshot, result_status, rank, is_winner,
  start_title, target_title, current_title, move_count, path_titles,
  finished_at, finalized_at
)
values
  ('$roomId', '$finishedOne', 'Hardening Finished One', 'finished', 1, true, 'Hardening Middle', 'Hardening Target', 'Hardening Target', 1, array['Hardening Middle','Hardening Target'], now(), now()),
  ('$roomId', '$finishedTwo', 'Hardening Finished Two', 'finished', 2, true, 'Hardening Middle', 'Hardening Target', 'Hardening Target', 1, array['Hardening Middle','Hardening Target'], now(), now());
commit;
"@

  $moveOne = @"
set role authenticated;
set request.jwt.claim.sub = '$thirdUser';
select 'PACKET13_RESULT|third-finish-one|' || coalesce((public.apply_group_move_v2(
  '$roomId', '$requestOne', '$correlationOne', 0,
  '$targetPageId', null, 'Hardening Target', 'Hardening Target', 'NORMAL_LINK', null, null
)->>'code'), '');
"@
  $moveTwo = @"
set role authenticated;
set request.jwt.claim.sub = '$thirdUser';
select 'PACKET13_RESULT|third-finish-two|' || coalesce((public.apply_group_move_v2(
  '$roomId', '$requestTwo', '$correlationTwo', 0,
  '$targetPageId', null, 'Hardening Target', 'Hardening Target', 'NORMAL_LINK', null, null
)->>'code'), '');
"@

  try {
    Invoke-LocalPsql $setupSql | Out-Null
    $jobOne = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $moveOne, 'third-finish-one'
    $jobTwo = Start-Job -InitializationScript $script:HarnessHelperInitialization -ScriptBlock ${function:Invoke-ConcurrentSql} -ArgumentList $dbContainer, $moveTwo, 'third-finish-two'
    $completed = @(Wait-Job -Job $jobOne, $jobTwo -Timeout 30)
    if ($completed.Count -ne 2) { throw 'concurrent third finish did not complete within 30s' }
    $resultOne = @(Receive-Job -Job $jobOne -Keep -ErrorAction Stop) | Select-Object -Last 1
    $resultTwo = @(Receive-Job -Job $jobTwo -Keep -ErrorAction Stop) | Select-Object -Last 1
    $results = @($resultOne, $resultTwo)
    Write-WorkerEvidence -Result $resultOne -Label 'third-finish-one'
    Write-WorkerEvidence -Result $resultTwo -Label 'third-finish-two'
    Assert-WorkerResult -Result $resultOne -Label 'concurrent third finish one'
    Assert-WorkerResult -Result $resultTwo -Label 'concurrent third finish two'
    $allowedThirdFinishCodes = @('APPLIED', 'STATE_VERSION_CONFLICT', 'GAME_NOT_ACTIVE')
    $packetMarkers = Parse-Packet13WorkerResults -Results $results -ExpectedWorkers @('third-finish-one', 'third-finish-two') -AllowedCodes $allowedThirdFinishCodes
    foreach ($marker in $packetMarkers) { Write-Output "THIRD_FINISH_MARKER worker=$($marker.WorkerName) code=$($marker.Code) line=$($marker.Line)" }
    $codes = @($packetMarkers | ForEach-Object { $_.Code })
    $appliedCount = @($codes | Where-Object { $_ -eq 'APPLIED' }).Count
    $nonAppliedCount = @($codes | Where-Object { $_ -in @('STATE_VERSION_CONFLICT', 'GAME_NOT_ACTIVE') }).Count
    if ($codes.Count -ne 2 -or $appliedCount -ne 1 -or $nonAppliedCount -ne 1) {
      throw "unexpected concurrent third-finish codes: $($codes -join ', ')"
    }
    Assert-Scalar "select status from public.game_rooms where id = '$roomId';" 'grace_period' 'third finish starts grace exactly once'
    Assert-Scalar "select count(*) from public.group_match_results where room_id = '$roomId' and user_id = '$thirdUser';" '1' 'third finisher has one result row'
    Assert-Scalar "select count(*) from public.room_events where room_id = '$roomId' and event_type = 'player_finish' and user_id = '$thirdUser';" '1' 'third finish event is emitted once'
    Write-Output 'PASS distinct-request concurrent third finish'
  }
  finally {
    if ($null -ne $jobOne) { [void](Invoke-JobCleanup -Job $jobOne -JobName 'third-finish-one' -State $script:CleanupState) }
    if ($null -ne $jobTwo) { [void](Invoke-JobCleanup -Job $jobTwo -JobName 'third-finish-two' -State $script:CleanupState) }
    Invoke-TrackedCleanupSql -JobName 'third-finish-fixture' -Sql "delete from public.game_rooms where id = '$roomId'; delete from public.wiki_pages where page_id in ('$middlePageId', '$targetPageId'); delete from auth.users where id in ('$finishedOne', '$finishedTwo', '$thirdUser', '$fourthUser');"
  }
}

$primaryFailure = $null
try {
  if ($Scenario -in @('all', 'host')) { Run-HostLeaveScenario }
  if ($Scenario -in @('all', 'emoji')) {
    Run-DeterministicLockOrderScenario -DeadlineKind hard -Order finalizer-first
    Run-DeterministicLockOrderScenario -DeadlineKind hard -Order emoji-first
    Run-DeterministicLockOrderScenario -DeadlineKind grace -Order finalizer-first
    Run-DeterministicLockOrderScenario -DeadlineKind grace -Order emoji-first
    Run-DeadlineEqualityScenario -DeadlineKind hard-equality
    Run-DeadlineEqualityScenario -DeadlineKind grace-equality
  }
  if ($Scenario -in @('all', 'third-finish')) { Run-ThirdFinishScenario }
}
catch {
  $primaryFailure = $_
}

if ($null -ne $primaryFailure) {
  [Console]::Error.WriteLine("PRIMARY_FAILURE $($primaryFailure.Exception.ToString())")
  if ($primaryFailure.ScriptStackTrace) { [Console]::Error.WriteLine("PRIMARY_STACK $($primaryFailure.ScriptStackTrace)") }
}
if ($script:CleanupState.Failures.Count -gt 0) {
  [Console]::Error.WriteLine("CLEANUP_FAILURE_COUNT $($script:CleanupState.Failures.Count)")
  foreach ($failure in $script:CleanupState.Failures) {
    [Console]::Error.WriteLine("CLEANUP_FAILURE $(Format-CleanupFailure -Failure $failure)")
  }
}
if ($null -ne $primaryFailure -or $script:CleanupState.Failures.Count -gt 0) {
  exit 1
}
