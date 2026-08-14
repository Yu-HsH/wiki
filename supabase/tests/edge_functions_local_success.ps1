# Local-only Edge Function success-path smoke test.
# The guest token is generated in memory and never printed or persisted raw.

$ErrorActionPreference = 'Stop'
$dbContainer = 'supabase_db_wiki'
$runId = [guid]::NewGuid()
$token = -join (1..48 | ForEach-Object { [char](Get-Random -Minimum 97 -Maximum 123) })
$startPageId = "edge-start-$($runId.ToString('N'))"
$middlePageId = "edge-middle-$($runId.ToString('N'))"
$targetPageId = "edge-target-$($runId.ToString('N'))"

function Invoke-LocalPsql {
  param([Parameter(Mandatory)][string]$Sql)
  $output = $Sql | docker exec -i $dbContainer psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw "local psql failed: $($output -join "`n")" }
}

function Invoke-Function {
  param([Parameter(Mandatory)][hashtable]$Body)
  $json = $Body | ConvertTo-Json -Depth 10
  return Invoke-RestMethod -Uri "http://127.0.0.1:54321/functions/v1/single-run" -Method Post -ContentType 'application/json' -Body $json
}

$setupSql = @"
begin;
insert into public.wiki_pages(page_id, canonical_title)
values ('$startPageId', 'Edge Start'), ('$middlePageId', 'Edge Middle'), ('$targetPageId', 'Edge Target');
insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('$([guid]::NewGuid())', '$startPageId', '100', 'Edge Start'),
  ('$([guid]::NewGuid())', '$middlePageId', '200', 'Edge Middle'),
  ('$([guid]::NewGuid())', '$targetPageId', '300', 'Edge Target');
insert into public.wiki_snapshot_links(snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal)
select id, '$middlePageId', '200', 'Edge Middle', 'Edge Middle', 0
from public.wiki_page_snapshots where page_id = '$startPageId' and revision_id = '100';
commit;
"@

try {
  Invoke-LocalPsql $setupSql

  $created = Invoke-Function @{
    action = 'create'
    guestToken = $token
    run = @{
      runId = $runId.ToString()
      start = @{ pageId = $startPageId; revisionId = '100'; canonicalTitle = 'Edge Start' }
      target = @{ pageId = $targetPageId; revisionId = '300'; canonicalTitle = 'Edge Target' }
    }
  }

  $moved = Invoke-Function @{
    action = 'move'
    guestToken = $token
    runId = $runId.ToString()
    requestId = ([guid]::NewGuid()).ToString()
    correlationId = ([guid]::NewGuid()).ToString()
    expectedVersion = 0
    nextPage = @{ pageId = $middlePageId; title = 'Edge Middle' }
    eventType = 'NORMAL_LINK'
  }

  $snapshot = Invoke-Function @{
    action = 'snapshot'
    guestToken = $token
    runId = $runId.ToString()
  }

  $left = Invoke-Function @{
    action = 'leave'
    guestToken = $token
    runId = $runId.ToString()
  }

  $codes = @($created.code, $moved.code, $snapshot.code, $left.code)
  if (($codes -join ',') -cne 'CREATED,APPLIED,SNAPSHOT,ABANDONED') {
    throw "unexpected single-run codes: $($codes -join ', ')"
  }
  Write-Output "PASS single-run Edge success: create=$($created.code) move=$($moved.code) snapshot=$($snapshot.code) leave=$($left.code)"
}
finally {
  Invoke-LocalPsql "delete from public.single_game_runs where id = '$runId'; delete from public.wiki_pages where page_id in ('$startPageId', '$middlePageId', '$targetPageId');"
}
