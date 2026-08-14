import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) =>
  readFileSync(new URL(relativePath, `${new URL("..", import.meta.url).href}/`), "utf8");

const groupService = read("services/groupMultiplayerService.js");
const profileStatsService = read("services/profileStatsService.js");
const groupGamePage = read("pages/GroupGamePage.jsx");
const duelService = read("services/multiplayerService.js");
const migration = read(
  "supabase/migrations/20260813072952_group_security_phase2c.sql"
);

test("그룹 서비스의 변경 작업은 Phase 2C RPC 경로만 사용한다", () => {
  for (const rpc of [
    "create_group_room",
    "join_group_room",
    "submit_group_target_v2",
    "set_group_ready",
    "apply_group_move_v2",
    "leave_group_waiting_room",
  ]) {
    assert.match(groupService, new RegExp(`rpc\\(["']${rpc}["']`));
  }

  assert.doesNotMatch(
    groupService,
    /\.from\(["'](?:game_rooms|room_players|room_events|group_match_history)["']\)\s*\.(?:insert|update|delete|upsert)\s*\(/s
  );
});

test("클라이언트 history UPSERT 경로가 제거되었다", () => {
  assert.doesNotMatch(profileStatsService, /recordGroupMatchHistory|\.upsert\s*\(/);
  assert.doesNotMatch(groupGamePage, /recordGroupMatchHistory/);
  assert.equal(existsSync(`${root}/utils/groupMatchHistory.js`), false);
});

test("progress RPC는 공식 결과·lifecycle 입력을 받지 않는다", () => {
  const start = migration.indexOf(
    "create or replace function public.update_group_progress"
  );
  const end = migration.indexOf("$$;", start);
  const progressFunction = migration.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(progressFunction, /p_current_title text/);
  assert.match(progressFunction, /p_move_count integer/);
  assert.match(progressFunction, /p_path_titles text\[\]/);
  assert.doesNotMatch(
    progressFunction,
    /p_(?:rank|has_finished|player_status|result_status|elapsed_seconds)/
  );
  assert.doesNotMatch(
    progressFunction,
    /\b(?:rank|has_finished|player_status|result_status)\s*=/
  );
});

test("history finalizer는 client payload 없이 authoritative 결과를 읽는다", () => {
  const start = migration.indexOf(
    "create or replace function private.sync_group_records"
  );
  const end = migration.indexOf("$$;", start);
  const finalizer = migration.slice(start, end);

  assert.match(finalizer, /from public\.group_match_results result/);
  assert.match(finalizer, /on conflict \(room_id, user_id\)/);
  assert.match(finalizer, /group_first_count/);
  assert.match(migration, /trg_finalize_group_records/);
  assert.match(migration, /after update of status on public\.game_rooms/);
  assert.match(
    migration,
    /create or replace function public\.finalize_group_records\(p_room_id uuid\)/
  );
});

test("RLS는 group direct write를 닫고 duel도 서버 권위 RPC를 사용한다", () => {
  for (const policy of [
    "Authenticated users can create duel rooms",
    "Duel players can update joined rooms",
    "Host can delete own duel room",
    "Authenticated users can join duel room_players",
    "Users can update their own duel player row",
    "Users can delete their own duel player row",
    "Duel players can insert their own room events",
  ]) {
    assert.match(migration, new RegExp(policy));
  }

  assert.match(migration, /and mode = 'duel'/);
  assert.match(migration, /room\.mode = 'duel'/);
  assert.match(duelService, /rpc\("create_duel_room_v2"/);
  assert.match(duelService, /rpc\("join_duel_room_v2"/);
  assert.match(duelService, /apply_duel_move_v2/);
  assert.match(duelService, /apply_duel_swap_v2/);
  assert.doesNotMatch(duelService, /\.from\(["']game_rooms["']\)\s*\.insert\s*\(/s);
  assert.doesNotMatch(duelService, /\.from\(["']room_players["']\)\s*\.update\s*\(/s);
});
