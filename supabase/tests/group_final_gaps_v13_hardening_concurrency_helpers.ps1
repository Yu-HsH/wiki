# Shared, local-only helpers for the Packet 13 concurrency harness and its
# fail-injection self-test. This file has no database side effects by itself.

function Protect-HarnessText {
  param([AllowNull()][object]$Value)

  $text = if ($null -eq $Value) { '' } else { [string]$Value }
  $text = [regex]::Replace($text, '(?im)(password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+', '$1=<redacted>')
  $text = [regex]::Replace($text, '(?i)bearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer <redacted>')
  $text = [regex]::Replace($text, '(?i)(postgres(?:ql)?://)[^\s]+', '$1<redacted>')
  return $text
}

function Get-HarnessConnectionLoss {
  param([AllowNull()][object]$Stdout, [AllowNull()][object]$Stderr)

  $combined = "$(if ($null -ne $Stdout) { [string]$Stdout })`n$(if ($null -ne $Stderr) { [string]$Stderr })"
  return $combined -match '(?i)signal[\s_-]*11|segmentation fault|57P02|connection (?:to server was lost|reset)|server closed the connection unexpectedly|unexpected eof|database system is in recovery mode'
}

function Invoke-SeparatedProcess {
  param(
    [Parameter(Mandatory)][string]$FileName,
    [Parameter(Mandatory)][string[]]$ArgumentList,
    [AllowEmptyString()][string]$InputText = '',
    [string]$WorkerName = 'worker',
    [int]$TimeoutSeconds = 60
  )

  if ($TimeoutSeconds -lt 1) { throw 'TimeoutSeconds must be at least 1' }

  $startedAt = (Get-Date).ToUniversalTime()
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $process.StartInfo.FileName = $FileName
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.CreateNoWindow = $true
  $process.StartInfo.RedirectStandardInput = $true
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  if ($null -eq $process.StartInfo.ArgumentList) {
    throw 'PowerShell 7 ProcessStartInfo.ArgumentList is required for separated child streams'
  }
  foreach ($argument in $ArgumentList) {
    [void]$process.StartInfo.ArgumentList.Add([string]$argument)
  }

  $processId = $null
  $started = $false
  $timedOut = $false
  $startError = ''
  $stdout = ''
  $stderr = ''
  $exitCode = 1
  $stdoutTask = $null
  $stderrTask = $null

  try {
    $started = $process.Start()
    if (-not $started) { throw "failed to start child process: $FileName" }
    $processId = $process.Id
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    try {
      $process.StandardInput.Write($InputText)
    }
    finally {
      $process.StandardInput.Close()
    }

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $timedOut = $true
      try { $process.Kill($true) } catch { $startError = "timeout kill failed: $($_.Exception.Message)" }
      [void]$process.WaitForExit(5000)
    }

    if ($null -ne $stdoutTask) { $stdout = $stdoutTask.GetAwaiter().GetResult() }
    if ($null -ne $stderrTask) { $stderr = $stderrTask.GetAwaiter().GetResult() }
    if (-not $timedOut) { $exitCode = $process.ExitCode } else { $exitCode = 124 }
  }
  catch {
    $startError = if ([string]::IsNullOrWhiteSpace($startError)) { $_.Exception.Message } else { "$startError; $($_.Exception.Message)" }
    if ($started -and $process.HasExited) {
      $exitCode = $process.ExitCode
    }
    if ($null -ne $stdoutTask) {
      try { $stdout = $stdoutTask.GetAwaiter().GetResult() } catch { }
    }
    if ($null -ne $stderrTask) {
      try { $stderr = $stderrTask.GetAwaiter().GetResult() } catch { }
    }
  }
  finally {
    $endedAt = (Get-Date).ToUniversalTime()
    if ($process -is [System.IDisposable]) { $process.Dispose() }
  }

  $connectionLoss = Get-HarnessConnectionLoss -Stdout $stdout -Stderr $stderr
  return [pscustomobject]@{
    WorkerName = $WorkerName
    ProcessId = $processId
    StartedAtUtc = $startedAt.ToString('o')
    EndedAtUtc = $endedAt.ToString('o')
    ExitCode = $exitCode
    Stdout = $stdout
    Stderr = $stderr
    TimedOut = $timedOut
    ConnectionLoss = [bool]$connectionLoss
    CleanupStatus = 'not_started'
    StartError = $startError
    Success = [bool](-not $timedOut -and $exitCode -eq 0)
  }
}

function New-CleanupState {
  return [pscustomobject]@{
    Steps = [System.Collections.Generic.List[object]]::new()
    Failures = [System.Collections.Generic.List[object]]::new()
  }
}

function Add-CleanupStep {
  param(
    [Parameter(Mandatory)][object]$State,
    [Parameter(Mandatory)][string]$JobName,
    [Parameter(Mandatory)][string]$Stage,
    [Parameter(Mandatory)][ValidateSet('pass', 'skip', 'fail')][string]$Status,
    [string]$Detail = ''
  )

  $step = [pscustomobject]@{
    JobName = $JobName
    Stage = $Stage
    Status = $Status
    Detail = Protect-HarnessText $Detail
    RecordedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  [void]$State.Steps.Add($step)
  return $step
}

function Add-CleanupFailure {
  param(
    [Parameter(Mandatory)][object]$State,
    [Parameter(Mandatory)][string]$JobName,
    [Parameter(Mandatory)][string]$Stage,
    [Parameter(Mandatory)][object]$Exception,
    [AllowNull()][object]$JobId = $null
  )

  $exceptionText = if ($null -ne $Exception.Exception) { $Exception.Exception.ToString() } else { $Exception.ToString() }
  $failure = [pscustomobject]@{
    JobName = $JobName
    JobId = if ($null -eq $JobId) { '' } else { [string]$JobId }
    Stage = $Stage
    Exception = Protect-HarnessText $exceptionText
    RecordedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  [void]$State.Failures.Add($failure)
  [void](Add-CleanupStep -State $State -JobName $JobName -Stage $Stage -Status fail -Detail $failure.Exception)
  return $failure
}

function Invoke-CleanupAction {
  param(
    [Parameter(Mandatory)][object]$State,
    [Parameter(Mandatory)][string]$JobName,
    [Parameter(Mandatory)][string]$Stage,
    [Parameter(Mandatory)][scriptblock]$Action,
    [AllowNull()][object]$JobId = $null
  )

  try {
    $value = & $Action
    $detail = if ($null -eq $value) { '' } else { "value=$([string]$value)" }
    $step = Add-CleanupStep -State $State -JobName $JobName -Stage $Stage -Status pass -Detail $detail
    return [pscustomobject]@{ Success = $true; Value = $value; Step = $step }
  }
  catch {
    $failure = Add-CleanupFailure -State $State -JobName $JobName -Stage $Stage -Exception $_ -JobId $JobId
    return [pscustomobject]@{ Success = $false; Value = $null; Failure = $failure }
  }
}

function Invoke-JobCleanup {
  param(
    [Parameter(Mandatory)][object]$Job,
    [Parameter(Mandatory)][string]$JobName,
    [Parameter(Mandatory)][object]$State,
    [scriptblock]$StopAction = $null,
    [scriptblock]$ReceiveAction = $null,
    [scriptblock]$RemoveAction = $null
  )

  $jobId = $Job.Id
  $failureCountBefore = @($State.Failures | Where-Object { $_.JobName -eq $JobName }).Count
  if ($null -eq $StopAction) { $StopAction = { Stop-Job -Job $Job -ErrorAction Stop } }
  if ($null -eq $ReceiveAction) { $ReceiveAction = { @(Receive-Job -Job $Job -Keep -ErrorAction Stop) } }
  if ($null -eq $RemoveAction) { $RemoveAction = { Remove-Job -Job $Job -Force -ErrorAction Stop } }

  if ($Job.State -eq 'Running' -or $Job.State -eq 'NotStarted') {
    $stop = Invoke-CleanupAction -State $State -JobName $JobName -Stage 'stop' -JobId $jobId -Action $StopAction
    Write-Output "CLEANUP_STEP job=$JobName job_id=$jobId stage=stop status=$(if ($stop.Success) { 'pass' } else { 'fail' })"
  }
  else {
    [void](Add-CleanupStep -State $State -JobName $JobName -Stage 'stop' -Status skip -Detail "state=$($Job.State)")
    Write-Output "CLEANUP_STEP job=$JobName job_id=$jobId stage=stop status=skip state=$($Job.State)"
  }

  $receive = Invoke-CleanupAction -State $State -JobName $JobName -Stage 'receive' -JobId $jobId -Action $ReceiveAction
  $drainedCount = if ($receive.Success -and $null -ne $receive.Value) { @($receive.Value).Count } else { 0 }
  Write-Output "CLEANUP_STEP job=$JobName job_id=$jobId stage=receive status=$(if ($receive.Success) { 'pass' } else { 'fail' }) drained=$drainedCount"

  $remove = Invoke-CleanupAction -State $State -JobName $JobName -Stage 'remove' -JobId $jobId -Action $RemoveAction
  Write-Output "CLEANUP_STEP job=$JobName job_id=$jobId stage=remove status=$(if ($remove.Success) { 'pass' } else { 'fail' })"
  $cleanupStatus = if (@($State.Failures | Where-Object { $_.JobName -eq $JobName }).Count -eq $failureCountBefore) { 'pass' } else { 'fail' }
  foreach ($workerResult in @($receive.Value)) {
    if ($null -ne $workerResult -and $workerResult.PSObject.Properties.Name -contains 'CleanupStatus') {
      $workerResult.CleanupStatus = $cleanupStatus
      Write-Output "CLEANUP_RESULT job=$JobName job_id=$jobId worker=$($workerResult.WorkerName) cleanup_status=$cleanupStatus"
    }
  }
  return [pscustomobject]@{ Stop = $null; Receive = $receive; Remove = $remove; CleanupStatus = $cleanupStatus }
}

function Format-CleanupFailure {
  param([Parameter(Mandatory)][object]$Failure)

  return "job=$($Failure.JobName) job_id=$($Failure.JobId) stage=$($Failure.Stage) exception=$($Failure.Exception) recorded_at=$($Failure.RecordedAtUtc)"
}

function Test-HarnessSqlErrorText {
  param([AllowNull()][object]$Stderr)

  $text = if ($null -eq $Stderr) { '' } else { [string]$Stderr }
  return $text -match '(?im)(?:^|\r?\n)\s*(?:ERROR|FATAL|PANIC):|psql:\s+error:|SQLSTATE(?:\s*[:=]\s*)?[0-9A-Z]{5}'
}

function Parse-Packet13WorkerResults {
  param(
    [Parameter(Mandatory)][object[]]$Results,
    [Parameter(Mandatory)][string[]]$ExpectedWorkers,
    [Parameter(Mandatory)][string[]]$AllowedCodes
  )

  $markerPrefix = 'PACKET13_RESULT|'
  $markerEqualsPrefix = 'PACKET13_RESULT='
  $markers = [System.Collections.Generic.List[object]]::new()
  foreach ($result in $Results) {
    if ($null -eq $result) { throw 'Packet 13 result parser received a null worker result' }
    $stdout = if ($null -eq $result.Stdout) { '' } else { [string]$result.Stdout }
    $stderr = if ($null -eq $result.Stderr) { '' } else { [string]$result.Stderr }
    $safeStdout = Protect-HarnessText $stdout
    $safeStderr = Protect-HarnessText $stderr
    if ($result.TimedOut -or $result.ExitCode -ne 0 -or $result.ConnectionLoss) {
      throw "Packet 13 worker failed: worker=$($result.WorkerName) exit_code=$($result.ExitCode) timeout=$($result.TimedOut) connection_loss=$($result.ConnectionLoss) stdout=$safeStdout stderr=$safeStderr"
    }
    if (Test-HarnessSqlErrorText -Stderr $stderr) {
      throw "Packet 13 worker stderr contains a SQL error: worker=$($result.WorkerName) stdout=$safeStdout stderr=$safeStderr"
    }

    $lines = if ([string]::IsNullOrEmpty($stdout)) { @() } else { @($stdout -split "`r?`n") }
    foreach ($rawLine in $lines) {
      $line = ([string]$rawLine).Trim()
      $markerWorker = $null
      $code = $null
      if ($line.StartsWith($markerPrefix, [System.StringComparison]::Ordinal)) {
        $fields = $line.Substring($markerPrefix.Length).Split('|', 2)
        if ($fields.Count -ne 2) {
          throw "Packet 13 worker marker is malformed: worker=$($result.WorkerName) stdout=$safeStdout stderr=$safeStderr"
        }
        $markerWorker = $fields[0].Trim()
        $code = $fields[1].Trim()
      }
      elseif ($line.StartsWith($markerEqualsPrefix, [System.StringComparison]::Ordinal)) {
        $markerWorker = if ($result.PSObject.Properties.Name -contains 'WorkerName') { ([string]$result.WorkerName).Trim() } else { '' }
        $code = $line.Substring($markerEqualsPrefix.Length).Trim()
      }
      else {
        continue
      }
      if ([string]::IsNullOrWhiteSpace($markerWorker) -or [string]::IsNullOrWhiteSpace($code)) {
        throw "Packet 13 worker marker is malformed: worker=$($result.WorkerName) stdout=$safeStdout stderr=$safeStderr"
      }
      if ($result.PSObject.Properties.Name -contains 'WorkerName' -and [string]$result.WorkerName -ne $markerWorker) {
        throw "Packet 13 marker worker mismatch: result_worker=$($result.WorkerName) marker_worker=$markerWorker stdout=$safeStdout stderr=$safeStderr"
      }
      if ($AllowedCodes -notcontains $code) {
        throw "Packet 13 marker code is not allowed: worker=$markerWorker code=$code stdout=$safeStdout stderr=$safeStderr"
      }
      [void]$markers.Add([pscustomobject]@{
        WorkerName = $markerWorker
        Code = $code
        Line = $line
      })
    }
  }

  if ($markers.Count -eq 0) { throw 'Packet 13 result marker count was 0' }
  $duplicateWorkers = @($markers | Group-Object -Property WorkerName | Where-Object Count -ne 1)
  if ($duplicateWorkers.Count -gt 0) {
    throw "Packet 13 result marker count per worker was not exactly 1: $($duplicateWorkers.Name -join ',')"
  }
  $expected = @($ExpectedWorkers | Sort-Object)
  $actual = @($markers.WorkerName | Sort-Object)
  if (($expected -join "`n") -cne ($actual -join "`n")) {
    throw "Packet 13 result workers mismatch: expected=$($expected -join ',') actual=$($actual -join ',')"
  }
  return @($markers)
}
