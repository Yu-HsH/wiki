import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = file => readFileSync(new URL("../"+file,import.meta.url),"utf8");
const sql = source("docs/ops/sql/multiplayer_rematch_v1.sql");

test("rematch uses new private room identities without rewriting result/XP",()=>{
  assert.match(sql,/create table private\.room_rematches_v1/);
  assert.match(sql,/source_room_id uuid primary key/);
  assert.match(sql,/next_room_id uuid not null unique/);
  assert.match(sql,/v_source\.status <> 'finished'/);
  assert.match(sql,/public\.create_duel_room_v2\(coalesce\(v_source\.use_items,true\)\)/);
  assert.match(sql,/public\.create_group_room\(v_source\.max_players,3,3\)/);
  assert.doesNotMatch(sql,/update\s+public\.game_rooms\s+set\s+status\s*=\s*'waiting'/i);
  assert.doesNotMatch(sql,/insert into public\.xp_ledger/i);
  assert.match(sql,/where id = p_source_room_id for update/);
});

test("only the former host can create and former members can accept rematches",()=>{
  assert.match(sql,/v_source\.host_user_id is distinct from auth\.uid\(\)/);
  assert.match(sql,/raise exception 'REMATCH_MEMBERS_ONLY'/);
  assert.match(sql,/create trigger room_players_rematch_membership_v1/);
  assert.match(sql,/before insert on public\.room_players/);
  assert.match(sql,/revoke all on private\.room_rematches_v1 from public, anon, authenticated/);
  for(const rpc of ["create_rematch_room_v1","get_rematch_room_v1","join_rematch_room_v1"]){
    assert.match(sql,new RegExp("grant execute on function public\\."+rpc+"\\(uuid\\) to authenticated"));
  }
});

test("duel and group results show opt-in rematch only after a finalized match",()=>{
  const duel=source("pages/MultiplayerGamePage.jsx");
  const group=source("pages/GroupGamePage.jsx");
  const component=source("components/RematchResultAction.jsx");
  for(const page of [duel,group]){
    assert.match(page,/import RematchResultAction from/);
    assert.match(page,/sourceRoomId=\{roomId\}/);
    assert.match(page,/enabled=\{room\?\.status === "finished"\}/);
  }
  assert.match(group,/view === "standings" && \(/);
  assert.match(component,/window\.setInterval\(\(\) => \{ void refresh\(\); \}, 6000\)/);
  assert.match(component,/isHost\s*\?\s*await createRematchRoom/);
  assert.match(component,/:\s*await joinRematchRoom/);
  assert.match(component,/\/multiplayer\/group\/room\//);
  assert.match(component,/\/multiplayer\/room\//);
  assert.doesNotMatch(component,/setIsReady|setGroupReady|setDuelTarget/);
});

test("SQL integration scenarios protect old records and guessed-code bypass",()=>{
  const testSql=source("supabase/tests/multiplayer_rematch_v1.sql");
  for(const phrase of ["Rematch creation and invitations do not award XP",
    "Uninvited user cannot join duel by guessed code",
    "Uninvited user cannot join group by guessed id",
    "Repeated duel creation returns the SAME room id",
    "All participants begin next round without inherited READY"]){
    assert.ok(testSql.includes(phrase),phrase);
  }
  assert.match(testSql,/begin;/);
  assert.match(testSql,/rollback;/);
});
