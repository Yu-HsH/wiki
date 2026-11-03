// Rehearse the exact forward migrations against the explicitly isolated DB.
// Only this task's earlier LOCAL candidate objects are replaced inside a
// rollback-only transaction. Existing game/ledger data and migrations stay.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const container='supabase_db_wiki-next-goal-release-20261029';
const prepare=`begin;
do $reset$ declare d text; begin
  d:=pg_get_functiondef('public.use_duel_item_v3(uuid,uuid,uuid,uuid)'::regprocedure);
  d:=replace(d,$old$  if v_grant.item_id = 'search_once' and not (select search_enabled from private.duel_release_control_v1 where singleton) then
    return jsonb_build_object('ok',false,'code','SEARCH_DISABLED');
  end if;
$old$,'');
  if position('duel_release_control_v1' in d)>0 then raise exception 'UNREVIEWED_LOCAL_CONTROL_PATCH'; end if;
  execute d;
  d:=pg_get_functiondef('private.duel_search_guard_v1(uuid,uuid,uuid)'::regprocedure);
  d:=replace(d,E'  if not (select search_enabled from private.duel_release_control_v1 where singleton) then return ''SEARCH_DISABLED''; end if;\\n','');
  execute d;
end; $reset$;
drop trigger duel_room_entry_guard_v1 on public.game_rooms;
drop trigger duel_player_entry_guard_v1 on public.room_players;
drop function private.guard_duel_entry_v1();
drop function private.assert_duel_entry_v1();
drop table private.duel_release_control_v1;
drop function private.prune_duel_search_v1(integer);
drop index private.duel_search_sessions_snapshot_v1;
drop index private.duel_search_sessions_expiry_v1;
drop index private.duel_search_documents_created_v1;
`;
const migration=file=>fs.readFileSync(file,'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const sql=prepare+migration('supabase/migrations/20261102080000_duel_release_controls_v1.sql')+migration('supabase/migrations/20261103090000_duel_search_release_guard_v1.sql')+migration('supabase/migrations/20261103100000_duel_search_retention_v1.sql')+fs.readFileSync('supabase/tests/duel_release_controls_v1.sql','utf8').replace(/^begin;\s*$/m,'');
const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true});
fs.mkdirSync('.temp/search-cpu-20261103',{recursive:true});fs.writeFileSync('.temp/search-cpu-20261103/final-controls-pgtap.log',result.stdout+result.stderr);
assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/not ok|Looks like/);assert.match(result.stdout,/1\.\.34/);assert.match(result.stdout,/ROLLBACK/);console.log('Exact final migrations + 34 pgTAP checks passed; rollback only.');
