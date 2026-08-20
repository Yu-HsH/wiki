param(
  [ValidateSet('db1', 'db2', 'all')][string]$Database = 'all',
  [string]$CliVersion = '2.114.0',
  [ValidatePattern('^public\.ecr\.aws/supabase/postgres:17\.6\.1\.(136|158)$')][string]$Image = 'public.ecr.aws/supabase/postgres:17.6.1.158',
  [switch]$KeepContainers
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$npxCommand = (Get-Command npx.cmd -ErrorAction Stop).Source
$script:failed = $false

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
  if (-not $process.Start()) { throw "failed to start $FileName" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($InputText)
  $process.StandardInput.Close()
  $process.WaitForExit()
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdoutTask.Result
    Stderr = $stderrTask.Result
  }
}

function Invoke-Docker {
  param([Parameter(Mandatory)][string[]]$Arguments, [string]$InputText = '')
  return Invoke-CapturedProcess -FileName 'docker' -Arguments $Arguments -InputText $InputText
}

function Invoke-Psql {
  param([Parameter(Mandatory)][string]$Container, [Parameter(Mandatory)][string]$Sql, [switch]$AllowFailure)
  $result = Invoke-Docker -Arguments @(
    'exec', '-i', $Container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', '-P', 'pager=off'
  ) -InputText $Sql
  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    throw "psql failed in ${Container}: $($result.Stderr)`n$($result.Stdout)"
  }
  return $result
}

function Wait-Database {
  param([Parameter(Mandatory)][string]$Container)
  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    $health = Invoke-Docker -Arguments @('inspect', '-f', '{{.State.Health.Status}}', $Container)
    $ready = Invoke-Docker -Arguments @('exec', $Container, 'pg_isready', '-U', 'postgres', '-d', 'postgres')
    if ($health.ExitCode -eq 0 -and $health.Stdout.Trim() -eq 'healthy' -and $ready.ExitCode -eq 0) {
      $first = Invoke-Psql -Container $Container -Sql 'select pg_postmaster_start_time()::text;' -AllowFailure
      Start-Sleep -Milliseconds 500
      $second = Invoke-Psql -Container $Container -Sql 'select pg_postmaster_start_time()::text;' -AllowFailure
      $firstStart = @($first.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
      $secondStart = @($second.Stdout -split "`r?`n" | Where-Object { $_ -ne '' }) | Select-Object -Last 1
      if ($first.ExitCode -eq 0 -and $second.ExitCode -eq 0 -and $firstStart -eq $secondStart) { return }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "database did not become stably ready: ${Container}"
}

function Start-CleanDatabase {
  param([Parameter(Mandatory)][string]$Container, [Parameter(Mandatory)][string]$Volume, [Parameter(Mandatory)][int]$Port, [Parameter(Mandatory)][string]$Image)
  $password = [guid]::NewGuid().ToString('N')
  $jwtSecret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $result = Invoke-Docker -Arguments @(
    'run', '-d', '--name', $Container, '--hostname', $Container,
    '-e', "POSTGRES_PASSWORD=$password", '-e', "JWT_SECRET=$jwtSecret", '-e', 'JWT_EXP=3600',
    '-p', "${Port}:5432", '-v', "${Volume}:/var/lib/postgresql/data", $Image
  )
  if ($result.ExitCode -ne 0) { throw "docker run failed for ${Container}: $($result.Stderr)" }
  Wait-Database -Container $Container
  return $password
}

function Remove-CleanDatabase {
  param([Parameter(Mandatory)][string]$Container, [Parameter(Mandatory)][string]$Volume)
  if ($KeepContainers) { return }
  $containerResult = Invoke-Docker -Arguments @('rm', '-f', $Container)
  $volumeResult = Invoke-Docker -Arguments @('volume', 'rm', $Volume)
  Write-Output "cleanup/$Container container_exit=$($containerResult.ExitCode) volume_exit=$($volumeResult.ExitCode)"
}

function Invoke-Runner {
  param([Parameter(Mandatory)][string]$Container, [Parameter(Mandatory)][string]$Password, [Parameter(Mandatory)][int]$Port)
  $dbUrl = "postgresql://postgres:$Password@127.0.0.1:$Port/postgres?sslmode=disable"
  $result = Invoke-CapturedProcess -FileName $npxCommand -Arguments @(
    '--yes', "supabase@$CliVersion", '--workdir', $repoRoot, 'db', 'push',
    '--db-url', $dbUrl, '--include-all', '--skip-vault', '--yes'
  )
  Write-Host "migration_runner/$Container exit_code=$($result.ExitCode)"
  if ($result.Stdout) { Write-Host $result.Stdout.TrimEnd() }
  if ($result.Stderr) { Write-Host $result.Stderr.TrimEnd() }
  if ($result.ExitCode -ne 0) {
    $script:failed = $true
    return $false
  }
  return $true
}

function Assert-MigrationHistory {
  param([Parameter(Mandatory)][string]$Container)
  $sql = @"
select version
from supabase_migrations.schema_migrations
where version in ('20260814103000','20260814113000','20260814123000')
order by version;
"@
  $result = Invoke-Psql -Container $Container -Sql $sql
  $versions = @($result.Stdout -split "`r?`n" | Where-Object { $_ -ne '' })
  $expected = @('20260814103000','20260814113000','20260814123000')
  $pass = (@($versions) -join ',') -eq ($expected -join ',')
  Write-Host "migration_history/$Container status=$(if ($pass) { 'PASS' } else { 'FAIL' }) versions=$(@($versions) -join ',')"
  if (-not $pass) { $script:failed = $true }
  return $pass
}

function Invoke-SqlTest {
  param([Parameter(Mandatory)][string]$Container, [Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$ExpectedLabel)
  $sql = Get-Content -Raw -LiteralPath (Join-Path $repoRoot $Path)
  $result = Invoke-Psql -Container $Container -Sql $sql -AllowFailure
  $text = (($result.Stdout, $result.Stderr) -join "`n")
  $notOk = @([regex]::Matches($text, '(?m)^not ok\b')).Count
  $ok = @([regex]::Matches($text, '(?m)^ok\b')).Count
  $pass = $result.ExitCode -eq 0 -and $notOk -eq 0
  Write-Host "pgTAP/$Container $ExpectedLabel status=$(if ($pass) { 'PASS' } else { 'FAIL' }) ok=$ok not_ok=$notOk exit_code=$($result.ExitCode)"
  if (-not $pass) {
    if ($result.Stdout) { Write-Host $result.Stdout.TrimEnd() }
    if ($result.Stderr) { Write-Host $result.Stderr.TrimEnd() }
    $script:failed = $true
  }
  return $pass
}

function Invoke-Concurrency {
  param([Parameter(Mandatory)][string]$Container)
  $result = Invoke-CapturedProcess -FileName 'pwsh' -Arguments @(
    '-NoLogo', '-NoProfile', '-File', (Join-Path $repoRoot 'supabase/tests/group_final_gaps_v13_hardening_concurrency.ps1'),
    '-DbContainer', $Container, '-Scenario', 'all'
  )
  $pass = $result.ExitCode -eq 0 -and $result.Stdout -notmatch '(?m)FAIL|error|exception'
  Write-Host "concurrency/$Container status=$(if ($pass) { 'PASS' } else { 'FAIL' }) exit_code=$($result.ExitCode)"
  if ($result.Stdout) { Write-Host $result.Stdout.TrimEnd() }
  if ($result.Stderr) { Write-Host $result.Stderr.TrimEnd() }
  if (-not $pass) { $script:failed = $true }
  return $pass
}

function Invoke-CrashRegression {
  param([Parameter(Mandatory)][string]$Container)
  $scriptPath = Join-Path $repoRoot 'supabase/tests/group_spectator_emoji_crash_diagnostic.ps1'
  foreach ($variant in @('prepare', 'new-minimal', 'anon', 'cleanup')) {
    $result = Invoke-CapturedProcess -FileName 'pwsh' -Arguments @(
      '-NoLogo', '-NoProfile', '-File', $scriptPath, '-DbContainer', $Container, '-Variant', $variant
    )
    $pass = $result.ExitCode -eq 0 -and $result.Stdout -notmatch '(?m)^CASE FAIL\b' -and $result.Stdout -notmatch '(?i)signal 11|segmentation fault|connection to server was lost'
    Write-Output "crash_regression/$Container/$variant status=$(if ($pass) { 'PASS' } else { 'FAIL' }) exit_code=$($result.ExitCode)"
    if ($result.Stdout) { Write-Output $result.Stdout.TrimEnd() }
    if ($result.Stderr) { Write-Output $result.Stderr.TrimEnd() }
    if (-not $pass) { $script:failed = $true; break }
  }
}

function Run-CleanDatabase {
  param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)][int]$Port)
  $container = "wiki_pkt13r_clean_$Label"
  $volume = "${container}_data"
  $image = $Image
  try {
    $password = Start-CleanDatabase -Container $container -Volume $volume -Port $Port -Image $image
    Write-Output "clean_db/$Label image=$image container=$container volume=$volume"
    if (-not (Invoke-Runner -Container $container -Password $password -Port $Port)) { return }
    if (-not (Assert-MigrationHistory -Container $container)) { return }
    [void](Invoke-SqlTest -Container $container -Path 'supabase/tests/group_final_gaps_v13.sql' -ExpectedLabel 'Packet13=33')
    [void](Invoke-SqlTest -Container $container -Path 'supabase/tests/group_spectator_emoji_atomicity.sql' -ExpectedLabel 'Atomicity=22')
    [void](Invoke-SqlTest -Container $container -Path 'supabase/tests/server_authority_v2.sql' -ExpectedLabel 'V2=no_plan')
    [void](Invoke-SqlTest -Container $container -Path 'supabase/tests/group_security_phase2c.sql' -ExpectedLabel 'Phase2C=no_plan')
    [void](Invoke-Concurrency -Container $container)
    Invoke-CrashRegression -Container $container
  }
  finally {
    Remove-CleanDatabase -Container $container -Volume $volume
  }
}

try {
  if ($Database -in @('all', 'db1')) { Run-CleanDatabase -Label 'db1' -Port 56201 }
  if ($Database -in @('all', 'db2')) { Run-CleanDatabase -Label 'db2' -Port 56202 }
}
catch {
  $script:failed = $true
  Write-Error $_
}

if ($script:failed) { exit 1 }
