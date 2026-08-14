# Local-only reproducible concurrent idempotency test.
# Run from C:\Project\wiki after the local migrations are applied:
# powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\server_authority_concurrency_v2.ps1

$ErrorActionPreference = 'Stop'
$dbContainer = 'supabase_db_wiki'
$userId = [guid]::NewGuid()
$roomId = [guid]::NewGuid()
$playerId = [guid]::NewGuid()
$snapshotId = [guid]::NewGuid()
$requestId = [guid]::NewGuid()
$correlationId = [guid]::NewGuid()
$middlePageId = "concurrent-middle-$($roomId.ToString('N'))"
$targetPageId = "concurrent-target-$($roomId.ToString('N'))"

function Invoke-LocalPsql {
  param([Parameter(Mandatory)][string]$Sql)

  $result = $Sql | docker exec -i $dbContainer psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) {
    throw "local psql failed: $($result -join "`n")"
  }
  return @($result)
}

function Invoke-ConcurrentMove {
  param(
    [Parameter(Mandatory)][string]$Container,
    [Parameter(Mandatory)][string]$Sql
  )

  $output = $Sql | docker exec -i $Container psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = @($output)
  }
}

$setupSql = @"
begin;
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('$userId', 'authenticated', 'authenticated', 'concurrent-$($roomId.ToString('N'))@local.test', '{}', '{}', now(), now());
insert into public.profiles (id, username, nickname, synthetic_email)
values ('$userId', 'concurrent-$($roomId.ToString('N'))', 'Concurrent One', 'concurrent-$($roomId.ToString('N'))@local.test');
insert into public.wiki_pages(page_id, canonical_title)
values ('$middlePageId', 'Concurrent Middle'), ('$targetPageId', 'Concurrent Target');
insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values ('$snapshotId', '$middlePageId', '400', 'Concurrent Middle');
insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values ('$([guid]::NewGuid())', '$targetPageId', '500', 'Concurrent Target');
insert into public.wiki_snapshot_links(snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal)
select id, '$targetPageId', '500', 'Concurrent Target', 'Concurrent Target', 0
from public.wiki_page_snapshots where page_id = '$middlePageId' and revision_id = '400';
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, use_items, state_version, game_starts_at, game_deadline_at,
  group_start_title, group_start_page_id, group_start_revision_id,
  group_target_title, group_target_page_id, group_target_revision_id
)
values (
  '$roomId', 'V2CONCUR-$($roomId.ToString('N').Substring(0, 8))', '$userId', 'playing', 'group', 2, 2,
  1, false, 0, now() - interval '5 seconds', now() + interval '5 minutes',
  'Concurrent Middle', '$middlePageId', '400', 'Concurrent Target', '$targetPageId', '500'
);
insert into public.room_players(
  id, room_id, user_id, role, nickname_snapshot, player_status,
  start_title, target_title, current_title, start_page_id, start_revision_id,
  target_page_id, target_revision_id, current_page_id, current_revision_id,
  path_titles, path_page_ids, path_revision_ids, progress_version, heartbeat_at, last_seen_at
)
values (
  '$playerId', '$roomId', '$userId', 'host', 'Concurrent One', 'playing',
  'Concurrent Middle', 'Concurrent Target', 'Concurrent Middle', '$middlePageId', '400',
  '$targetPageId', '500', '$middlePageId', '400',
  array['Concurrent Middle'], array['$middlePageId'], array['400'], 0, now(), now()
);
commit;
"@

$moveSql = @"
set role authenticated;
set request.jwt.claim.sub = '$userId';
select public.apply_group_move_v2(
  '$roomId', '$requestId', '$correlationId', 0,
  '$targetPageId', null, null, 'Concurrent Target', 'NORMAL_LINK', null, null
)->>'code';
"@

try {
  Invoke-LocalPsql $setupSql | Out-Null

  $jobA = Start-Job -ScriptBlock ${function:Invoke-ConcurrentMove} -ArgumentList $dbContainer, $moveSql
  $jobB = Start-Job -ScriptBlock ${function:Invoke-ConcurrentMove} -ArgumentList $dbContainer, $moveSql
  Wait-Job -Job $jobA, $jobB | Out-Null
  $results = @(Receive-Job -Job $jobA, $jobB)
  Remove-Job -Job $jobA, $jobB -Force

  if ($results.Count -ne 2 -or ($results | Where-Object ExitCode -ne 0).Count -ne 0) {
    throw "concurrent psql session failed: $($results | ConvertTo-Json -Compress)"
  }

  $codes = @($results | ForEach-Object { $_.Output | Where-Object { $_ -eq 'APPLIED' } })
  if ($codes.Count -ne 2 -or ($codes | Where-Object { $_ -ne 'APPLIED' }).Count -ne 0) {
    throw "unexpected concurrent RPC responses: $($codes -join ', ')"
  }

  $eventCount = [int](@(Invoke-LocalPsql "select count(*) from public.game_move_events where game_id = '$roomId';")[0])
  $requestCount = [int](@(Invoke-LocalPsql "select count(*) from public.game_mutation_requests where game_id = '$roomId';")[0])
  $progressVersion = [int64](@(Invoke-LocalPsql "select progress_version from public.room_players where id = '$playerId';")[0])
  $moveCount = [int](@(Invoke-LocalPsql "select move_count from public.room_players where id = '$playerId';")[0])

  if ($eventCount -ne 1 -or $requestCount -ne 1 -or $progressVersion -ne 1 -or $moveCount -ne 1) {
    throw "idempotency invariant failed: events=$eventCount requests=$requestCount progress=$progressVersion moves=$moveCount"
  }

  Write-Output "PASS concurrent duplicate request_id: responses=2 events=1 requests=1 progress_version=1 move_count=1"
}
finally {
  Invoke-LocalPsql "delete from public.game_rooms where id = '$roomId'; delete from public.wiki_pages where page_id in ('$middlePageId', '$targetPageId'); delete from auth.users where id = '$userId';" | Out-Null
}
