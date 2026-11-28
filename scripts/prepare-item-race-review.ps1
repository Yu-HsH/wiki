param([switch]$DatabaseOnly)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$root = Join-Path $repo '.temp/review-r1-r4'
$project = if ($DatabaseOnly) { 'wiki-playtest-review-20261128-gate' } else { 'wiki-playtest-review-20261128-final' }
$subnet = if ($DatabaseOnly) { '10.241.232.0/24' } else { '10.241.231.0/24' }
$portPrefix = if ($DatabaseOnly) { '5942' } else { '5932' }
$stack = Join-Path $root $(if ($DatabaseOnly) { 'stack-gate' } else { 'stack' })
$configRoot = Join-Path $stack 'supabase'
$network = "$project-net"
$env:SUPABASE_TELEMETRY_DISABLED = '1'

Push-Location $repo
try {
  $cli = Join-Path $repo 'node_modules/.bin/supabase.cmd'
  if ((& $cli --version) -ne '2.114.0') { throw 'Supabase CLI 2.114.0 is required' }
  New-Item -ItemType Directory -Force -Path $configRoot, (Join-Path $configRoot '.temp'), (Join-Path $root 'evidence') | Out-Null
  $configPath = Join-Path $configRoot 'config.toml'
  if ((Test-Path -LiteralPath $configPath) -and
      -not (Select-String -LiteralPath $configPath -Pattern ('^project_id = "'+$project+'"'))) {
    throw "Refusing to replace another project's config at $configPath"
  }
  $config = [IO.File]::ReadAllText((Join-Path $repo 'supabase/config.toml'))
  [IO.File]::WriteAllText($configPath, $config.Replace('wiki-packet13-r2-clean158', $project).Replace('5432', $portPrefix))
  [IO.File]::WriteAllText((Join-Path $configRoot '.temp/postgres-version'), "17.6.1.158`n")
  Copy-Item -LiteralPath 'supabase/migrations','supabase/functions','supabase/tests' -Destination $configRoot -Recurse -Force
  if (Test-Path -LiteralPath 'supabase/seed.sql') { Copy-Item -LiteralPath 'supabase/seed.sql' -Destination $configRoot -Force }
  docker network inspect $network *> $null
  if ($LASTEXITCODE -ne 0) {
    docker network create --subnet $subnet $network | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create the review network $network" }
  }
  $startLog = Join-Path $root "$project-start.log"
  & $cli --workdir $stack --network-id $network start --yes --exclude vector,studio,postgres-meta,storage-api,imgproxy,logflare,mailpit *> $startLog
  if ($LASTEXITCODE -ne 0) { throw "Local Supabase start failed. See $startLog" }

  $container = "supabase_db_$project"
  $gate = docker exec --user postgres $container psql -XwAt -U postgres -d postgres -c 'select entry_open from private.pr63_drain_gate where singleton'
  if ($LASTEXITCODE -ne 0) { throw 'Could not check the admission fixture' }
  if ($gate -eq 'f') {
    Get-Content -LiteralPath 'scripts/open-pr63-ci-admission.psql' -Raw |
      docker exec -i --user postgres $container psql -Xw -U postgres -d postgres -v pr63_ci_database=postgres
    if ($LASTEXITCODE -ne 0) { throw 'Admission fixture setup failed' }
  } elseif ($gate -ne 't') {
    throw 'Unexpected local admission fixture state'
  }
  Write-Output "Ready $project in $stack"
} finally {
  Pop-Location
}
