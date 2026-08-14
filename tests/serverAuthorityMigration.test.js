import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) =>
  readFileSync(`${root}/${relativePath}`, "utf8");

const foundation = read("supabase/migrations/20260814090000_server_authority_v2.sql");
const rpc = read("supabase/migrations/20260814091000_server_authority_rpc_v2.sql");
const duel = read("supabase/migrations/20260814092000_duel_authority_v2.sql");
const duelItems = read("supabase/migrations/20260814094000_duel_item_authority_v2.sql");
const cutover = read("supabase/migrations/20260814093000_server_authority_cutover_v2.sql");
const guestFunction = read("supabase/functions/single-run/index.ts");
const snapshotFunction = read("supabase/functions/wiki-snapshot/index.ts");

test("서버 권위 마이그레이션은 immutable event와 버전 projection을 만든다", () => {
  assert.match(foundation, /create table if not exists public\.game_move_events/);
  assert.match(foundation, /unique \(scope, game_id, actor_user_id, request_id\)/);
  assert.match(foundation, /state_version bigint not null default 0/);
  assert.match(foundation, /progress_version bigint not null default 0/);
  assert.match(foundation, /revoke all on table public\.game_move_events/);
});

test("이동 RPC는 row lock·expected version·스냅샷 링크 검증을 포함한다", () => {
  assert.match(rpc, /single_game_runs[\s\S]*for update/);
  assert.match(rpc, /p_expected_version is distinct from v_run\.state_version/);
  assert.match(rpc, /snapshot\.page_id = v_run\.current_page_id/);
  assert.match(rpc, /apply_group_move_v2/);
  assert.match(duel, /p_expected_version is distinct from v_player\.progress_version/);
  assert.match(duel, /snapshot\.page_id = v_player\.current_page_id/);
  assert.match(duel, /private\.resolve_wiki_revision/);
});

test("SWAP RPC 계약은 보존하되 서버 상태를 바꾸지 않고 비활성화한다", () => {
  assert.match(duelItems, /create or replace function public\.apply_duel_swap_v2/);
  assert.match(duelItems, /'SWAP'/);
  assert.match(duelItems, /SWAP_DISABLED/);
  assert.match(duelItems, /revoke all on function public\.apply_duel_swap_v2\(uuid, uuid, uuid, bigint\) from public, anon/);
  assert.doesNotMatch(duelItems, /insert into public\.(game_move_events|game_mutation_requests|match_history)/);
});

test("클라이언트 직접 mutation과 온라인 game_records 쓰기는 cutover에서 차단된다", () => {
  assert.match(cutover, /revoke insert, update, delete on table public\.game_rooms/);
  assert.match(cutover, /revoke insert, update, delete on table public\.room_players/);
  assert.match(cutover, /revoke insert, update, delete on table public\.game_records/);
  assert.match(cutover, /revoke insert, update, delete on table public\.match_history/);
  assert.match(cutover, /revoke execute on function public\.update_group_progress/);
  assert.match(cutover, /revoke execute on function public\.finish_group_player/);
  assert.match(cutover, /drop function if exists public\.update_group_progress/);
  assert.match(cutover, /drop function if exists public\.finish_group_player/);
});

test("게스트 Edge Function은 raw token 대신 SHA-256 hash를 저장한다", () => {
  assert.match(guestFunction, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(guestFunction, /guest_token_hash: tokenHash/);
  assert.doesNotMatch(guestFunction, /guest_token:\s*token/);
});

test("위키 snapshot 링크는 목적지 page revision도 캐시한다", () => {
  assert.match(snapshotFunction, /fetchRevisionIds/);
  assert.match(snapshotFunction, /targetRevisionId: targetRevisionIds\.get/);
  assert.match(snapshotFunction, /oldid: String\(initialPage\.revid\)/);
  assert.match(snapshotFunction, /replace_wiki_snapshot_v2/);
});
