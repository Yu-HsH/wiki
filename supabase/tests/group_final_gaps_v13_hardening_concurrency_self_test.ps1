param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'group_final_gaps_v13_hardening_concurrency_helpers.ps1')

function Assert-SelfTest {
  param([Parameter(Mandatory)][bool]$Condition,[Parameter(Mandatory)][string]$Message)
  if (-not $Condition) { throw "SELFTEST_ASSERTION_FAILED $Message" }
}

function New-SyntheticPacketResult {
  param(
    [Parameter(Mandatory)][string]$WorkerName,
    [Parameter(Mandatory)][string]$Stdout,
    [string]$Stderr = '',
    [int]$ExitCode = 0,
    [bool]$TimedOut = $false,
    [bool]$ConnectionLoss = $false
  )

  return [pscustomobject]@{
    WorkerName = $WorkerName
    ProcessId = 7001
    StartedAtUtc = '2026-08-18T00:00:00.0000000Z'
    EndedAtUtc = '2026-08-18T00:00:00.1000000Z'
    ExitCode = $ExitCode
    Stdout = $Stdout
    Stderr = $Stderr
    TimedOut = $TimedOut
    ConnectionLoss = $ConnectionLoss
    CleanupStatus = 'pass'
    StartError = ''
  }
}

function Assert-ParserAccept {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][object[]]$Results,
    [Parameter(Mandatory)][string[]]$ExpectedWorkers,
    [Parameter(Mandatory)][string[]]$AllowedCodes
  )

  try {
    $markers = @(Parse-Packet13WorkerResults -Results $Results -ExpectedWorkers $ExpectedWorkers -AllowedCodes $AllowedCodes)
  }
  catch {
    throw "parser positive case '$Name' rejected valid output: $($_.Exception.Message)"
  }
  Assert-SelfTest ($markers.Count -eq $ExpectedWorkers.Count) "$Name marker count mismatch"
  Write-Output "SELFTEST PASS parser-positive-$Name markers=$($markers.Count)"
}

function Assert-ParserReject {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][object[]]$Results,
    [Parameter(Mandatory)][string[]]$ExpectedWorkers,
    [Parameter(Mandatory)][string[]]$AllowedCodes,
    [string]$MessagePattern = ''
  )

  $rejected = $false
  $message = ''
  try {
    [void](Parse-Packet13WorkerResults -Results $Results -ExpectedWorkers $ExpectedWorkers -AllowedCodes $AllowedCodes)
  }
  catch {
    $rejected = $true
    $message = $_.Exception.Message
  }
  Assert-SelfTest $rejected "$Name was incorrectly accepted"
  if (-not [string]::IsNullOrEmpty($MessagePattern)) {
    Assert-SelfTest ($message -match $MessagePattern) "$Name diagnostic did not contain '$MessagePattern'"
  }
  Write-Output "SELFTEST PASS parser-negative-$Name"
}

try {
  $allowedCodes = @('APPLIED', 'STATE_VERSION_CONFLICT', 'GAME_NOT_ACTIVE')
  Assert-ParserAccept -Name 'lf-with-psql-status' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-a' -Stdout "SET`nSET`nPACKET13_RESULT|parser-a|APPLIED`n")) `
    -ExpectedWorkers @('parser-a') -AllowedCodes $allowedCodes
  Assert-ParserAccept -Name 'crlf-equals-marker' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-b' -Stdout "SET`r`n`r`nPACKET13_RESULT=APPLIED`r`n")) `
    -ExpectedWorkers @('parser-b') -AllowedCodes $allowedCodes
  Assert-ParserAccept -Name 'bare-marker' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-c' -Stdout 'PACKET13_RESULT|parser-c|APPLIED')) `
    -ExpectedWorkers @('parser-c') -AllowedCodes $allowedCodes
  Assert-ParserAccept -Name 'conflict-codes' `
    -Results @(
      (New-SyntheticPacketResult -WorkerName 'parser-conflict-a' -Stdout 'PACKET13_RESULT|parser-conflict-a|STATE_VERSION_CONFLICT'),
      (New-SyntheticPacketResult -WorkerName 'parser-conflict-b' -Stdout 'PACKET13_RESULT|parser-conflict-b|GAME_NOT_ACTIVE')
    ) `
    -ExpectedWorkers @('parser-conflict-a', 'parser-conflict-b') -AllowedCodes $allowedCodes

  Assert-ParserReject -Name 'marker-missing' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'SET`nSET')) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'duplicate-marker' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout "PACKET13_RESULT|parser-negative|APPLIED`nPACKET13_RESULT|parser-negative|APPLIED")) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'malformed-marker' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULT|parser-negative')) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'empty-code' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULT|parser-negative|')) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'unknown-code' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULT|parser-negative|UNKNOWN')) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'worker-mismatch' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULT|other-worker|APPLIED')) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'wrong-prefix' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULTX|parser-negative|APPLIED')) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'nonzero-child' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULT|parser-negative|APPLIED' -ExitCode 7)) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes -MessagePattern 'stdout=.*stderr='
  Assert-ParserReject -Name 'connection-loss' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULT|parser-negative|APPLIED' -ConnectionLoss $true)) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Assert-ParserReject -Name 'stderr-sql-error' `
    -Results @((New-SyntheticPacketResult -WorkerName 'parser-negative' -Stdout 'PACKET13_RESULT|parser-negative|APPLIED' -Stderr 'ERROR: injected SQL failure')) `
    -ExpectedWorkers @('parser-negative') -AllowedCodes $allowedCodes
  Write-Output 'SELFTEST PASS packet13-result-parser'

  $childCode = "Write-Output 'SELFTEST_STDOUT_MARKER'; [Console]::Error.WriteLine('SELFTEST_STDERR_MARKER'); exit 7"
  $streamResult = Invoke-SeparatedProcess -FileName 'pwsh' -WorkerName 'stream-failure-child' -TimeoutSeconds 10 -ArgumentList @(
    '-NoLogo', '-NoProfile', '-Command', $childCode
  )
  Assert-SelfTest ($streamResult.ExitCode -eq 7) "child exit code was $($streamResult.ExitCode)"
  Assert-SelfTest (-not $streamResult.TimedOut) 'stream child unexpectedly timed out'
  Assert-SelfTest ($streamResult.Stdout -match 'SELFTEST_STDOUT_MARKER') 'stdout marker was not preserved'
  Assert-SelfTest ($streamResult.Stderr -match 'SELFTEST_STDERR_MARKER') 'stderr marker was not preserved separately'
  Assert-SelfTest (-not ($streamResult.Stdout -match 'SELFTEST_STDERR_MARKER')) 'stderr marker leaked into stdout'
  Assert-SelfTest (-not ($streamResult.Stderr -match 'SELFTEST_STDOUT_MARKER')) 'stdout marker leaked into stderr'
  Write-Output "SELFTEST PASS separate-streams process_id=$($streamResult.ProcessId) exit_code=$($streamResult.ExitCode)"

  $fakeJob = [pscustomobject]@{ Id = 901; State = 'Running' }

  $stopMarks = @{ receive = $false; remove = $false }
  $stopState = New-CleanupState
  [void](Invoke-JobCleanup -Job $fakeJob -JobName 'inject-stop' -State $stopState `
    -StopAction { throw 'STOP_INJECTED' } `
    -ReceiveAction { $stopMarks.receive = $true; return 'received-after-stop-failure' } `
    -RemoveAction { $stopMarks.remove = $true; return 'removed-after-stop-failure' })
  Assert-SelfTest ($stopState.Failures.Count -eq 1 -and $stopState.Failures[0].Stage -eq 'stop') 'stop failure was not recorded'
  Assert-SelfTest ($stopMarks.receive -and $stopMarks.remove) 'receive/remove did not run after stop failure'
  Write-Output 'SELFTEST PASS cleanup-stop-failure-propagation'

  $receiveMarks = @{ remove = $false }
  $receiveState = New-CleanupState
  [void](Invoke-JobCleanup -Job $fakeJob -JobName 'inject-receive' -State $receiveState `
    -StopAction { return 'stopped' } `
    -ReceiveAction { throw 'RECEIVE_INJECTED' } `
    -RemoveAction { $receiveMarks.remove = $true; return 'removed-after-receive-failure' })
  Assert-SelfTest ($receiveState.Failures.Count -eq 1 -and $receiveState.Failures[0].Stage -eq 'receive') 'receive failure was not recorded'
  Assert-SelfTest $receiveMarks.remove 'remove did not run after receive failure'
  Write-Output 'SELFTEST PASS cleanup-receive-failure-propagation'

  $removeState = New-CleanupState
  [void](Invoke-JobCleanup -Job $fakeJob -JobName 'inject-remove' -State $removeState `
    -StopAction { return 'stopped' } `
    -ReceiveAction { return 'received' } `
    -RemoveAction { throw 'REMOVE_INJECTED' })
  Assert-SelfTest ($removeState.Failures.Count -eq 1 -and $removeState.Failures[0].Stage -eq 'remove') 'remove failure was not recorded'
  Write-Output 'SELFTEST PASS cleanup-remove-failure-propagation'

  $aggregateState = New-CleanupState
  $primaryRecord = $null
  try { throw 'PRIMARY_INJECTED' } catch { $primaryRecord = $_ }
  try { throw 'CLEANUP_INJECTED' } catch { [void](Add-CleanupFailure -State $aggregateState -JobName 'aggregate' -Stage 'remove' -Exception $_ -JobId 902) }
  $aggregateReport = @(
    "PRIMARY_FAILURE $($primaryRecord.Exception.Message)"
    $aggregateState.Failures | ForEach-Object { "CLEANUP_FAILURE $(Format-CleanupFailure -Failure $_)" }
  ) -join "`n"
  Assert-SelfTest ($aggregateReport -match 'PRIMARY_FAILURE PRIMARY_INJECTED') 'primary failure was not retained'
  Assert-SelfTest ($aggregateReport -match 'CLEANUP_FAILURE .*stage=remove.*CLEANUP_INJECTED') 'cleanup failure was not retained with primary failure'
  Write-Output 'SELFTEST PASS primary-and-cleanup-aggregate'

  $timeoutResult = Invoke-SeparatedProcess -FileName 'pwsh' -WorkerName 'timeout-child' -TimeoutSeconds 1 -ArgumentList @(
    '-NoLogo', '-NoProfile', '-Command', 'Start-Sleep -Seconds 30'
  )
  Assert-SelfTest $timeoutResult.TimedOut 'timeout child was not classified as timed out'
  Assert-SelfTest ($timeoutResult.ExitCode -ne 0) 'timeout child returned a passing exit code'
  Assert-SelfTest ($null -ne $timeoutResult.ProcessId) 'timeout child process id was not captured'
  $orphan = $false
  try { [void](Get-Process -Id $timeoutResult.ProcessId -ErrorAction Stop); $orphan = $true } catch { }
  Assert-SelfTest (-not $orphan) "timeout child process $($timeoutResult.ProcessId) is still running"
  Write-Output "SELFTEST PASS timeout-cleanup-orphan-free process_id=$($timeoutResult.ProcessId)"

  Write-Output 'SELFTEST PASS harness-fail-closed'
  exit 0
}
catch {
  [Console]::Error.WriteLine("SELFTEST PRIMARY_FAILURE $($_.Exception.ToString())")
  if ($_.ScriptStackTrace) { [Console]::Error.WriteLine("SELFTEST PRIMARY_STACK $($_.ScriptStackTrace)") }
  exit 1
}
