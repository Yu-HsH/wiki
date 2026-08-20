param(
  [Parameter(Mandatory)][ValidatePattern('^public\.ecr\.aws/supabase/postgres:17\.6\.1\.(095|104|136|158)$')][string]$Image,
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9][a-z0-9_.-]{2,40}$')][string]$ContainerName,
  [Parameter(Mandatory)][ValidateRange(50000, 59999)][int]$HostPort,
  [ValidateSet('Single', 'Stress')][string]$Mode = 'Single',
  [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'
$volumeName = "${ContainerName}_data"
$runId = ([guid]::NewGuid().ToString('N')).Substring(0, 12)
$prefix = "wr13r_${runId}"
$script:caseFailed = $false
$script:crashObserved = $false
$script:started = $false

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
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  if (-not $process.Start()) { throw "failed to start process: $FileName" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($InputText)
  $process.StandardInput.Close()
  $process.WaitForExit()
  $stdout = $stdoutTask.Result
  $stderr = $stderrTask.Result
  $watch.Stop()

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
    DurationMs = $watch.ElapsedMilliseconds
  }
}

function Invoke-Docker {
  param([Parameter(Mandatory)][string[]]$Arguments, [string]$InputText = '')
  return Invoke-CapturedProcess -FileName 'docker' -Arguments $Arguments -InputText $InputText
}

function Invoke-Psql {
  param(
    [Parameter(Mandatory)][string]$Sql,
    [switch]$AllowFailure
  )
  $result = Invoke-Docker -Arguments @(
    'exec', '-i', $ContainerName, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', '-F', '|'
  ) -InputText $Sql
  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    throw "psql failed: $($result.Stderr)`n$($result.Stdout)"
  }
  return $result
}

function Get-RestartCount {
  $result = Invoke-Docker -Arguments @('inspect', '-f', '{{.RestartCount}}', $ContainerName)
  if ($result.ExitCode -ne 0) { throw "docker inspect failed: $($result.Stderr)" }
  return [int]$result.Stdout.Trim()
}

function Get-LogMarkers {
  $result = Invoke-Docker -Arguments @('logs', '--timestamps', '--tail', '200', $ContainerName)
  if ($result.ExitCode -ne 0) { throw "docker logs failed: $($result.Stderr)" }
  $lines = @()
  if ($result.Stdout) { $lines += @($result.Stdout -split "`r?`n") }
  if ($result.Stderr) { $lines += @($result.Stderr -split "`r?`n") }
  return @($lines | Where-Object {
    $_ -match '(?i)signal 11|segmentation fault|server process.*terminated|database system is in recovery mode|automatic recovery|unexpected eof|all server processes terminated'
  })
}

function Get-Snapshot {
  $result = Invoke-Psql "select pg_postmaster_start_time()::text, current_setting('server_version');" -AllowFailure
  $line = @($result.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
  $parts = if ($line) { $line -split '\|', 2 } else { @() }
  return [pscustomobject]@{
    Reachable = ($result.ExitCode -eq 0)
    PostmasterStartTime = if ($parts.Count -gt 0) { $parts[0] } else { $null }
    ServerVersion = if ($parts.Count -gt 1) { $parts[1] } else { $null }
    RestartCount = Get-RestartCount
    LogMarkers = @(Get-LogMarkers)
  }
}

function Wait-Database {
  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    $health = Invoke-Docker -Arguments @('inspect', '-f', '{{.State.Health.Status}}', $ContainerName)
    $ready = Invoke-Docker -Arguments @('exec', $ContainerName, 'pg_isready', '-U', 'postgres', '-d', 'postgres')
    if ($health.ExitCode -eq 0 -and $health.Stdout.Trim() -eq 'healthy' -and $ready.ExitCode -eq 0) {
      $first = Invoke-Psql 'select pg_postmaster_start_time()::text;' -AllowFailure
      Start-Sleep -Milliseconds 500
      $second = Invoke-Psql 'select pg_postmaster_start_time()::text;' -AllowFailure
      $firstStart = @($first.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
      $secondStart = @($second.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
      if ($first.ExitCode -eq 0 -and $second.ExitCode -eq 0 -and $firstStart -and $firstStart -eq $secondStart) { return }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "database did not become ready: $ContainerName"
}

function Start-DisposableDatabase {
  $password = [guid]::NewGuid().ToString('N')
  $jwtSecret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $result = Invoke-Docker -Arguments @(
    'run', '-d', '--name', $ContainerName, '--hostname', $ContainerName,
    '-e', "POSTGRES_PASSWORD=$password",
    '-e', "JWT_SECRET=$jwtSecret",
    '-e', 'JWT_EXP=3600',
    '-p', "${HostPort}:5432",
    '-v', "${volumeName}:/var/lib/postgresql/data",
    $Image
  )
  if ($result.ExitCode -ne 0) { throw "docker run failed: $($result.Stderr)" }
  $script:started = $true
  Wait-Database
}

function Remove-DisposableDatabase {
  if (-not $script:started -or $KeepContainer) { return }
  $stop = Invoke-Docker -Arguments @('rm', '-f', $ContainerName)
  $remove = Invoke-Docker -Arguments @('volume', 'rm', $volumeName)
  Write-Output "cleanup_container_exit=$($stop.ExitCode)"
  Write-Output "cleanup_volume_exit=$($remove.ExitCode)"
}

function Get-FunctionNames {
  return [pscustomobject]@{
    DeniedInteger = "${prefix}_denied_integer"
    DeniedText = "${prefix}_denied_text"
    DeniedJsonb = "${prefix}_denied_jsonb"
    AllowedInteger = "${prefix}_allowed_integer"
    AllowedText = "${prefix}_allowed_text"
    AllowedJsonb = "${prefix}_allowed_jsonb"
  }
}

function Install-MinimalFunctions {
  $f = Get-FunctionNames
  $sql = @"
begin;
create function public.$($f.DeniedInteger)() returns integer language sql as 'select 42';
create function public.$($f.DeniedText)() returns text language sql as 'select ''runtime-gate-text''';
create function public.$($f.DeniedJsonb)() returns jsonb language sql as 'select ''{"value": 42}''::jsonb';
revoke all on function public.$($f.DeniedInteger)() from public, anon, authenticated;
revoke all on function public.$($f.DeniedText)() from public, anon, authenticated;
revoke all on function public.$($f.DeniedJsonb)() from public, anon, authenticated;
grant execute on function public.$($f.DeniedInteger)() to service_role;
grant execute on function public.$($f.DeniedText)() to service_role;
grant execute on function public.$($f.DeniedJsonb)() to service_role;

create function public.$($f.AllowedInteger)() returns integer language sql as 'select 42';
create function public.$($f.AllowedText)() returns text language sql as 'select ''runtime-gate-text''';
create function public.$($f.AllowedJsonb)() returns jsonb language sql as 'select ''{"value": 42}''::jsonb';
revoke all on function public.$($f.AllowedInteger)() from public, anon;
revoke all on function public.$($f.AllowedText)() from public, anon;
revoke all on function public.$($f.AllowedJsonb)() from public, anon;
grant execute on function public.$($f.AllowedInteger)() to authenticated, service_role;
grant execute on function public.$($f.AllowedText)() to authenticated, service_role;
grant execute on function public.$($f.AllowedJsonb)() to authenticated, service_role;
commit;
"@
  Invoke-Psql $sql | Out-Null
  return $f
}

function Get-ExpectedText {
  param([ValidateSet('integer','text','jsonb')][string]$Kind)
  switch ($Kind) {
    'integer' { return '42' }
    'text' { return 'runtime-gate-text' }
    'jsonb' { return '{"value": 42}' }
  }
}

function Get-DirectSql {
  param([Parameter(Mandatory)][string]$FunctionName, [Parameter(Mandatory)][ValidateSet('anon','authenticated')][string]$Role)
  if ($Role -eq 'authenticated') {
    return "set role $Role; select pg_backend_pid(); select 'GATE_ALLOWED_VALUE:' || public.$FunctionName()::text;"
  }
  return "set role $Role; select pg_backend_pid(); select public.$FunctionName();"
}

function Get-AllowedLoopSql {
  param([Parameter(Mandatory)][string]$FunctionName, [Parameter(Mandatory)][string]$Expected, [Parameter(Mandatory)][int]$Count)
  $checks = 1..$Count | ForEach-Object {
    "do `$`$ begin if public.$FunctionName()::text <> '$Expected' then raise exception 'GATE_ALLOWED_VALUE_MISMATCH'; end if; raise notice 'GATE_ALLOWED_OK'; end `$`$;"
  }
  return "set role authenticated; select pg_backend_pid();`n$($checks -join "`n")"
}

function Get-DeniedLoopSql {
  param([Parameter(Mandatory)][string]$FunctionName, [Parameter(Mandatory)][int]$Count)
  $checks = 1..$Count | ForEach-Object {
    "do `$`$ declare v_state text; begin perform public.$FunctionName(); raise exception 'GATE_UNEXPECTED_SUCCESS'; exception when others then get stacked diagnostics v_state = returned_sqlstate; if v_state = '42501' then raise notice 'GATE_DENIED_OK'; else raise; end if; end; `$`$;"
  }
  return "set role anon; select pg_backend_pid();`n$($checks -join "`n")"
}

function Invoke-Case {
  param(
    [Parameter(Mandatory)][string]$CaseName,
    [Parameter(Mandatory)][string]$Sql,
    [ValidateSet('Allowed','Denied')][string]$Expected,
    [Parameter(Mandatory)][string]$ExpectedValue,
    [int]$ExpectedCount = 1
  )
  if ($script:crashObserved) { return $false }
  $before = Get-Snapshot
  $result = Invoke-Psql $Sql -AllowFailure
  if ($result.ExitCode -ne 0) { Wait-Database }
  $after = Get-Snapshot
  $text = (($result.Stdout, $result.Stderr) -join "`n")
  $newMarkers = @($after.LogMarkers | Where-Object { $before.LogMarkers -notcontains $_ })
  $connectionLoss = $text -match '(?i)server closed the connection unexpectedly|connection to server was lost|unexpected eof|database system is in recovery mode|could not connect to server'
  $signal11 = (($text, ($newMarkers -join "`n")) -join "`n") -match '(?i)signal 11|segmentation fault|server process.*terminated'
  $permissionDenied = $text -match '(?i)SQL state: 42501|permission denied for function|GATE_DENIED_OK'
  $allowed = if ($Sql -match '(?i)GATE_ALLOWED_OK') {
    ([regex]::Matches($text, 'GATE_ALLOWED_OK')).Count -eq $ExpectedCount
  } elseif ($Sql -match '(?i)GATE_ALLOWED_VALUE:') {
    $text -match [regex]::Escape("GATE_ALLOWED_VALUE:$ExpectedValue")
  } else {
    $text -match [regex]::Escape($ExpectedValue)
  }
  $postmasterChanged = $before.PostmasterStartTime -and $after.PostmasterStartTime -and $before.PostmasterStartTime -ne $after.PostmasterStartTime
  $restartChanged = $before.RestartCount -ne $after.RestartCount
  $deniedLoop = $Sql -match '(?i)GATE_DENIED_OK'
  $deniedResult = if ($deniedLoop) {
    $result.ExitCode -eq 0 -and ([regex]::Matches($text, 'GATE_DENIED_OK')).Count -eq $ExpectedCount
  } else {
    $result.ExitCode -ne 0 -and $permissionDenied
  }
  $pass = if ($Expected -eq 'Denied') {
    $deniedResult -and -not $connectionLoss -and -not $signal11 -and -not $postmasterChanged -and -not $restartChanged
  } else {
    $result.ExitCode -eq 0 -and $allowed -and -not $connectionLoss -and -not $signal11 -and -not $postmasterChanged -and -not $restartChanged
  }
  if (-not $pass) {
    $script:caseFailed = $true
    if ($connectionLoss -or $signal11) { $script:crashObserved = $true }
  }
  $status = if ($pass) { 'PASS' } else { 'FAIL' }
  Write-Output ("CASE {0} {1} expected={2} exit_code={3} connection_loss={4} signal11={5} permission_denied={6} postmaster_changed={7} restart_changed={8}" -f $status, $CaseName, $Expected, $result.ExitCode, $connectionLoss, $signal11, $permissionDenied, $postmasterChanged, $restartChanged)
  Write-Output "stdout_begin"; if ($result.Stdout) { Write-Output $result.Stdout.TrimEnd() }; Write-Output "stdout_end"
  Write-Output "stderr_begin"; if ($result.Stderr) { Write-Output $result.Stderr.TrimEnd() }; Write-Output "stderr_end"
  Write-Output "new_postgres_log_markers=$($newMarkers.Count)"
  if ($newMarkers.Count -gt 0) { $newMarkers | ForEach-Object { Write-Output "log_marker=$_" } }
  return $pass
}

function Invoke-PreparedAllowedCase {
  param([Parameter(Mandatory)][string]$FunctionName, [Parameter(Mandatory)][string]$Expected)
  $sql = "set role authenticated; prepare wr13r_prepared as select public.$FunctionName(); execute wr13r_prepared; discard plans; execute wr13r_prepared; deallocate wr13r_prepared;"
  return Invoke-Case -CaseName "prepared/$FunctionName" -Sql $sql -Expected Allowed -ExpectedValue $Expected
}

function Invoke-ImageGate {
  Start-DisposableDatabase
  $metadata = Invoke-Psql "select version(); show server_version; select pg_postmaster_start_time();"
  $preload = Invoke-Psql "show shared_preload_libraries;" -AllowFailure
  $supautils = Invoke-Psql "select name, setting from pg_settings where name in ('supautils.reserved_roles','supautils.superuser');" -AllowFailure
  Write-Output "image=$Image"
  Write-Output "container=$ContainerName"
  Write-Output "volume=$volumeName"
  Write-Output "image_id=$((Invoke-Docker -Arguments @('image','inspect',$Image,'-f','{{.Id}}')).Stdout.Trim())"
  Write-Output "image_digest=$((Invoke-Docker -Arguments @('image','inspect',$Image,'-f','{{json .RepoDigests}}')).Stdout.Trim())"
  Write-Output "runtime_metadata_begin"; Write-Output $metadata.Stdout.TrimEnd(); Write-Output "runtime_metadata_end"
  if ($preload.ExitCode -eq 0) {
    Write-Output "shared_preload_libraries=$($preload.Stdout.Trim())"
  } else {
    Write-Output "shared_preload_libraries=UNAVAILABLE (role cannot examine setting)"
    Write-Output "shared_preload_error=$($preload.Stderr.Trim())"
  }
  if ($supautils.ExitCode -eq 0) {
    Write-Output "supautils_settings_begin"; Write-Output $supautils.Stdout.TrimEnd(); Write-Output "supautils_settings_end"
  } else {
    Write-Output "supautils_settings=UNAVAILABLE"
    Write-Output "supautils_error=$($supautils.Stderr.Trim())"
  }

  $f = Install-MinimalFunctions
  $types = @(
    [pscustomobject]@{ Name = 'integer'; Denied = $f.DeniedInteger; Allowed = $f.AllowedInteger },
    [pscustomobject]@{ Name = 'text'; Denied = $f.DeniedText; Allowed = $f.AllowedText },
    [pscustomobject]@{ Name = 'jsonb'; Denied = $f.DeniedJsonb; Allowed = $f.AllowedJsonb }
  )

  foreach ($item in $types) {
    if ($script:crashObserved) { break }
    [void](Invoke-Case -CaseName "new-denied/$($item.Name)" -Sql (Get-DirectSql -FunctionName $item.Denied -Role anon) -Expected Denied -ExpectedValue (Get-ExpectedText $item.Name))
    if ($Mode -eq 'Single' -or $script:crashObserved) { continue }
    for ($i = 1; $i -le 20 -and -not $script:crashObserved; $i += 1) {
      [void](Invoke-Case -CaseName "new-denied/$($item.Name)/$i" -Sql (Get-DirectSql -FunctionName $item.Denied -Role anon) -Expected Denied -ExpectedValue (Get-ExpectedText $item.Name))
    }
    if ($script:crashObserved) { break }
    [void](Invoke-Case -CaseName "same-denied/$($item.Name)/100" -Sql (Get-DeniedLoopSql -FunctionName $item.Denied -Count 100) -Expected Denied -ExpectedValue (Get-ExpectedText $item.Name) -ExpectedCount 100)
  }

  foreach ($item in $types) {
    if ($script:crashObserved) { break }
    [void](Invoke-Case -CaseName "new-allowed/$($item.Name)" -Sql (Get-DirectSql -FunctionName $item.Allowed -Role authenticated) -Expected Allowed -ExpectedValue (Get-ExpectedText $item.Name))
    if ($Mode -eq 'Single' -or $script:crashObserved) { continue }
    for ($i = 1; $i -le 20 -and -not $script:crashObserved; $i += 1) {
      [void](Invoke-Case -CaseName "new-allowed/$($item.Name)/$i" -Sql (Get-DirectSql -FunctionName $item.Allowed -Role authenticated) -Expected Allowed -ExpectedValue (Get-ExpectedText $item.Name))
    }
    if ($script:crashObserved) { break }
    [void](Invoke-Case -CaseName "same-allowed/$($item.Name)/100" -Sql (Get-AllowedLoopSql -FunctionName $item.Allowed -Expected (Get-ExpectedText $item.Name) -Count 100) -Expected Allowed -ExpectedValue (Get-ExpectedText $item.Name) -ExpectedCount 100)
    [void](Invoke-PreparedAllowedCase -FunctionName $item.Allowed -Expected (Get-ExpectedText $item.Name))
  }

  $final = Get-Snapshot
  Write-Output "final_postmaster_start_time=$($final.PostmasterStartTime)"
  Write-Output "final_restart_count=$($final.RestartCount)"
  Write-Output "final_log_marker_count=$($final.LogMarkers.Count)"
  Write-Output "crash_observed=$script:crashObserved"
  Write-Output "gate_status=$(if ($script:caseFailed) { 'FAIL' } else { 'PASS' })"
}

try {
  Invoke-ImageGate
}
finally {
  Remove-DisposableDatabase
}

if ($script:caseFailed) { exit 1 }
