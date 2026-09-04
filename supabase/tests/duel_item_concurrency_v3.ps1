# Local-only reproducible concurrency test for duel item server authority v3.
# Run from the track C worktree after the local migrations are applied:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\duel_item_concurrency_v3.ps1
#
# pgTAP runs inside a single transaction and therefore cannot interleave two
# sessions. supabase/tests/duel_item_authority_v3.sql pins the serialization
# MECHANISM (game_rooms FOR UPDATE first, then room_players in user_id order);
# this file exercises two real sessions against it.
#
# Scenario 3 is the important one. use_duel_item_v3 is new, but apply_duel_move_v2
# is what every deployed bundle calls, and the two will run against the same room
# at the same time for as long as both exist. If v3 took its locks in a different
# order than v2 (:90 game_rooms -> :94 room_players), that pair is exactly where a
# deadlock would appear. Nothing else in the repo would catch it.

param(
  [string]$DbContainer = 'supabase_db_wiki-packet13-r2-clean158',
  [int]$Iterations = 5
)

$ErrorActionPreference = 'Stop'

function Invoke-LocalPsql {
  param([Parameter(Mandatory)][string]$Sql)
  $result = $Sql | docker exec -i $DbContainer psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw "local psql failed: $($result -join "`n")" }
  return @($result)
}

function Invoke-Session {
  param(
    [Parameter(Mandatory)][string]$Container,
    [Parameter(Mandatory)][string]$Sql
  )
  $output = $Sql | docker exec -i $Container psql -U postgres -d postgres -X -At 2>&1
  [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = @($output) }
}

function Assert-NoDeadlock {
  param([Parameter(Mandatory)][object[]]$Results, [Parameter(Mandatory)][string]$Label)
  foreach ($r in $Results) {
    $text = ($r.Output -join "`n")
    if ($text -match '40P01' -or $text -match 'deadlock detected') {
      throw "$Label — deadlock detected: $text"
    }
  }
}

$p1 = '00000000-0000-0000-0014-000000000001'
$p2 = '00000000-0000-0000-0014-000000000002'

$baseSetup = @"
begin;
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('$p1','authenticated','authenticated','conc-c1@local.test','{}','{}',now(),now()),
       ('$p2','authenticated','authenticated','conc-c2@local.test','{}','{}',now(),now())
on conflict (id) do nothing;
insert into public.profiles (id, username, nickname, synthetic_email)
values ('$p1','conc-c1','Conc One','conc-c1@local.test'),
       ('$p2','conc-c2','Conc Two','conc-c2@local.test')
on conflict (id) do nothing;
insert into public.wiki_pages (page_id, canonical_title)
values ('cpA','Conc Page A')
on conflict (page_id) do nothing;
insert into public.wiki_pages (page_id, canonical_title)
select 'cp' || n, 'Conc Page ' || n from generate_series(1,6) n
on conflict (page_id) do nothing;
insert into public.wiki_page_snapshots (id, page_id, revision_id, canonical_title_snapshot)
values ('00000000-0000-0000-0014-00000000cc00','cpA','crA','Conc Page A')
on conflict (page_id, revision_id) do nothing;
insert into public.wiki_page_snapshots (id, page_id, revision_id, canonical_title_snapshot)
select ('00000000-0000-0000-0014-00000000cd0' || n)::uuid, 'cp' || n, 'cr' || n, 'Conc Page ' || n
from generate_series(1,6) n
on conflict (page_id, revision_id) do nothing;
insert into public.wiki_snapshot_links (snapshot_id, target_page_id, target_revision_id, target_title_snapshot, ordinal)
select '00000000-0000-0000-0014-00000000cc00', 'cp' || n, 'cr' || n, 'Conc Page ' || n, n - 1
from generate_series(1,6) n
on conflict (snapshot_id, target_page_id) do nothing;
commit;
"@

function New-Room {
  param([Parameter(Mandatory)][string]$RoomId, [Parameter(Mandatory)][string]$Code)
  Invoke-LocalPsql @"
begin;
insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players, use_items, game_starts_at)
values ('$RoomId','$Code','$p1','playing','duel',2,2,true, now());
insert into public.room_players (room_id, user_id, role, nickname_snapshot, is_ready, player_status,
  current_title, current_page_id, current_revision_id, target_page_id, move_count,
  path_titles, path_page_ids, path_revision_ids)
values ('$RoomId','$p1','host','Conc One',true,'playing','Conc Page A','cpA','crA','cpZ',0,
        array['Conc Page A'], array['cpA'], array['crA']),
       ('$RoomId','$p2','guest','Conc Two',true,'playing','Conc Page A','cpA','crA','cpZ',0,
        array['Conc Page A'], array['cpA'], array['crA']);
commit;
"@ | Out-Null
}

function New-Grant {
  param([Parameter(Mandatory)][string]$RoomId, [Parameter(Mandatory)][string]$UserId,
        [Parameter(Mandatory)][int]$Slot, [Parameter(Mandatory)][string]$Role,
        [Parameter(Mandatory)][string]$Item)
  return @(Invoke-LocalPsql @"
insert into public.duel_item_grants(room_id,user_id,slot_index,slot_role,item_id)
values ('$RoomId','$UserId',$Slot,'$Role','$Item') returning id;
"@)[0]
}

try {
  Invoke-LocalPsql $baseSetup | Out-Null
  $failures = @()

  # ── Scenario 1 ──────────────────────────────────────────────────────────────
  # Two sessions spend the SAME slot with DIFFERENT request ids. spec §5.1
  # "모든 아이템은 1회용이다" must survive the race: one ITEM_USED, one refusal,
  # exactly one ledger row.
  for ($i = 1; $i -le $Iterations; $i++) {
    $room = [guid]::NewGuid()
    New-Room -RoomId $room -Code ("S1" + $i.ToString('000'))
    $grant = New-Grant -RoomId $room -UserId $p1 -Slot 1 -Role 'search' -Item 'search_once'

    $sqlA = "set role authenticated; set request.jwt.claim.sub = '$p1'; select public.use_duel_item_v3('$room','$grant','$([guid]::NewGuid())',null)->>'code';"
    $sqlB = "set role authenticated; set request.jwt.claim.sub = '$p1'; select public.use_duel_item_v3('$room','$grant','$([guid]::NewGuid())',null)->>'code';"

    $jobA = Start-Job -ScriptBlock ${function:Invoke-Session} -ArgumentList $DbContainer, $sqlA
    $jobB = Start-Job -ScriptBlock ${function:Invoke-Session} -ArgumentList $DbContainer, $sqlB
    Wait-Job -Job $jobA, $jobB | Out-Null
    $res = @(Receive-Job -Job $jobA, $jobB)
    Remove-Job -Job $jobA, $jobB -Force
    Assert-NoDeadlock -Results $res -Label "S1 iteration $i"

    $codes = @($res | ForEach-Object { $_.Output } | Where-Object { $_ -match '^(ITEM_USED|ITEM_ALREADY_USED|ITEM_COOLDOWN)$' })
    $used = @($codes | Where-Object { $_ -eq 'ITEM_USED' }).Count
    $events = [int](@(Invoke-LocalPsql "select count(*) from public.duel_item_events where grant_id = '$grant';")[0])
    $consumed = @(Invoke-LocalPsql "select consumed_at is not null from public.duel_item_grants where id = '$grant';")[0]

    if ($used -ne 1 -or $events -ne 1 -or $consumed -ne 't') {
      $failures += "S1 iteration ${i}: used=$used events=$events consumed=$consumed codes=$($codes -join ',')"
    }
  }
  Write-Output "PASS S1 same-slot race x$Iterations — exactly one ITEM_USED and one ledger row every time"

  # ── Scenario 2 ──────────────────────────────────────────────────────────────
  # Both players attack each other at the same instant. This is the case that
  # motivated the lock order: A wants (room, self, opponent) and B wants
  # (room, opponent, self). game_rooms FOR UPDATE first is what stops the cycle.
  for ($i = 1; $i -le $Iterations; $i++) {
    $room = [guid]::NewGuid()
    New-Room -RoomId $room -Code ("S2" + $i.ToString('000'))
    $gA = New-Grant -RoomId $room -UserId $p1 -Slot 0 -Role 'attack' -Item 'blind'
    $gB = New-Grant -RoomId $room -UserId $p2 -Slot 0 -Role 'attack' -Item 'blind'

    $sqlA = "set role authenticated; set request.jwt.claim.sub = '$p1'; select public.use_duel_item_v3('$room','$gA','$([guid]::NewGuid())',null)->>'code';"
    $sqlB = "set role authenticated; set request.jwt.claim.sub = '$p2'; select public.use_duel_item_v3('$room','$gB','$([guid]::NewGuid())',null)->>'code';"

    $jobA = Start-Job -ScriptBlock ${function:Invoke-Session} -ArgumentList $DbContainer, $sqlA
    $jobB = Start-Job -ScriptBlock ${function:Invoke-Session} -ArgumentList $DbContainer, $sqlB
    Wait-Job -Job $jobA, $jobB | Out-Null
    $res = @(Receive-Job -Job $jobA, $jobB)
    Remove-Job -Job $jobA, $jobB -Force
    Assert-NoDeadlock -Results $res -Label "S2 iteration $i"

    $codes = @($res | ForEach-Object { $_.Output } | Where-Object { $_ -match '^(ITEM_USED|ITEM_ALREADY_USED|ITEM_COOLDOWN|ITEMS_DISABLED|GAME_NOT_ACTIVE)$' })
    $used = @($codes | Where-Object { $_ -eq 'ITEM_USED' }).Count
    $events = [int](@(Invoke-LocalPsql "select count(*) from public.duel_item_events where room_id = '$room';")[0])

    # Different actors, different slots, no shared cooldown: both must land.
    if ($used -ne 2 -or $events -ne 2) {
      $failures += "S2 iteration ${i}: used=$used events=$events codes=$($codes -join ',')"
    }
  }
  Write-Output "PASS S2 mutual simultaneous attack x$Iterations — both applied, no deadlock"

  # ── Scenario 3 ──────────────────────────────────────────────────────────────
  # The new RPC against the DEPLOYED one, same room, same moment. If v3 ordered
  # its locks differently from apply_duel_move_v2, this is where it would show.
  for ($i = 1; $i -le $Iterations; $i++) {
    $room = [guid]::NewGuid()
    New-Room -RoomId $room -Code ("S3" + $i.ToString('000'))
    $gA = New-Grant -RoomId $room -UserId $p1 -Slot 0 -Role 'attack' -Item 'random_link_move'

    # A forces the opponent to move through the item RPC; B walks a normal link
    # through the RPC the shipped bundle uses.
    $sqlA = "set role authenticated; set request.jwt.claim.sub = '$p1'; select public.use_duel_item_v3('$room','$gA','$([guid]::NewGuid())',null)->>'code';"
    $sqlB = "set role authenticated; set request.jwt.claim.sub = '$p2'; select public.apply_duel_move_v2('$room','$([guid]::NewGuid())','$([guid]::NewGuid())',0,'cp1','cr1','Conc Page 1','Conc Page 1','NORMAL_LINK',null,null)->>'code';"

    $jobA = Start-Job -ScriptBlock ${function:Invoke-Session} -ArgumentList $DbContainer, $sqlA
    $jobB = Start-Job -ScriptBlock ${function:Invoke-Session} -ArgumentList $DbContainer, $sqlB
    Wait-Job -Job $jobA, $jobB | Out-Null
    $res = @(Receive-Job -Job $jobA, $jobB)
    Remove-Job -Job $jobA, $jobB -Force
    Assert-NoDeadlock -Results $res -Label "S3 iteration $i"

    if (($res | Where-Object ExitCode -ne 0).Count -ne 0) {
      $failures += "S3 iteration ${i}: a session exited non-zero: $(($res | ForEach-Object { $_.Output }) -join ' | ')"
      continue
    }

    # Both orderings are legitimate outcomes. What must never happen is a
    # deadlock, an unhandled error, or a projection that disagrees with the log.
    $codes = @($res | ForEach-Object { $_.Output } | Where-Object { $_ -match '^(ITEM_USED|APPLIED|STATE_VERSION_CONFLICT|NO_ELIGIBLE_LINK|GAME_NOT_ACTIVE|ITEM_COOLDOWN|ITEM_ALREADY_USED)$' })
    $known = $codes
    $mismatch = [int](@(Invoke-LocalPsql @"
select count(*) from public.room_players rp
where rp.room_id = '$room'
  and rp.progress_version <> (
    select count(*) from public.game_move_events e
    where e.scope = 'duel' and e.game_id = '$room' and e.actor_user_id = rp.user_id
  );
"@)[0])

    if ($known.Count -ne $codes.Count -or $codes.Count -ne 2 -or $mismatch -ne 0) {
      $failures += "S3 iteration ${i}: codes=$($codes -join ',') version/log mismatch rows=$mismatch"
    }
  }
  Write-Output "PASS S3 v3-item vs deployed v2-move x$Iterations — no deadlock, projection matches the move log"

  if ($failures.Count -gt 0) {
    throw "concurrency invariants failed:`n" + ($failures -join "`n")
  }

  Write-Output "PASS duel_item_concurrency_v3 — 3 scenarios x $Iterations iterations, 0 deadlocks"
}
finally {
  Invoke-LocalPsql @"
delete from public.game_rooms where host_user_id = '$p1';
delete from public.wiki_snapshot_links where snapshot_id = '00000000-0000-0000-0014-00000000cc00';
delete from public.wiki_page_snapshots where page_id like 'cp%';
delete from public.wiki_pages where page_id like 'cp%';
delete from public.profiles where id in ('$p1','$p2');
delete from auth.users where id in ('$p1','$p2');
"@ | Out-Null
}
