param(
  [string]$DbContainer = 'supabase_db_wiki',
  [string]$CliVersion = '2.114.0',
  [string]$ExpectedImage = 'public.ecr.aws/supabase/postgres:17.6.1.158',
  [string]$ExpectedImageId = 'sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459'
)

$ErrorActionPreference = 'Stop'
$failed = $false

function Invoke-Captured {
  param([Parameter(Mandatory)][string]$FileName, [Parameter(Mandatory)][string[]]$Arguments)
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FileName
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "failed to start $FileName" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdoutTask.Result
    Stderr = $stderrTask.Result
  }
}

$docker = (Get-Command docker.exe -ErrorAction Stop).Source
$npx = (Get-Command npx.cmd -ErrorAction Stop).Source

$cli = Invoke-Captured -FileName $npx -Arguments @('--yes', "supabase@$CliVersion", '--version')
$cliActual = $cli.Stdout.Trim()
$cliPass = $cli.ExitCode -eq 0 -and $cliActual -eq $CliVersion
Write-Output "CASE $(if ($cliPass) { 'PASS' } else { 'FAIL' }) cli expected=$CliVersion actual=$cliActual exit_code=$($cli.ExitCode)"
if (-not $cliPass) { $failed = $true }
if ($cli.Stderr) { Write-Output $cli.Stderr.TrimEnd() }

$container = Invoke-Captured -FileName $docker -Arguments @('inspect', $DbContainer, '--format', '{{.Config.Image}}|{{.Image}}')
if ($container.ExitCode -ne 0) {
  Write-Output "CASE FAIL container=$DbContainer reason=container_not_found"
  if ($container.Stderr) { Write-Output $container.Stderr.TrimEnd() }
  exit 1
}
$containerParts = $container.Stdout.Trim() -split '\|', 2
$actualImage = $containerParts[0]
$actualImageId = if ($containerParts.Count -gt 1) { $containerParts[1] } else { '' }
$imagePass = $actualImage -eq $ExpectedImage -and $actualImageId -eq $ExpectedImageId
Write-Output "CASE $(if ($imagePass) { 'PASS' } else { 'FAIL' }) image expected=$ExpectedImage actual=$actualImage image_id=$actualImageId"
if (-not $imagePass) { $failed = $true }

$digest = Invoke-Captured -FileName $docker -Arguments @('image', 'inspect', $actualImage, '--format', '{{json .RepoDigests}}')
Write-Output "image_repo_digest=$($digest.Stdout.Trim())"
if ($digest.ExitCode -ne 0) { $failed = $true }

if ($failed) { exit 1 }
