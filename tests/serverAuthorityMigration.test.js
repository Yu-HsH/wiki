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
const snapshotService = read("services/wikiSnapshotService.js");
const spectatorService = read("services/groupSpectatorService.js");

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

// 2026-08-29 계약 변경. 이전 계약은 "위키 snapshot 링크는 목적지 page revision도 캐시한다"로
// `fetchRevisionIds` 호출과 `targetRevisionId: targetRevisionIds.get`을 고정하고 있었다.
// 그 배치를 제거하면서(문서 1건당 62 → 32요청) 계약을 **제거의 유지**로 뒤집는다.
// 판단 근거는 `docs/agent/CURRENT.md` §5.5-3 — `target_revision_id`를 읽는 곳은
// `private.resolve_wiki_revision` 하나뿐이고, null이면 그 함수가 null을 돌려주는 경우가
// 늘지 않고 줄어든다.
test("위키 snapshot은 목적지 revision 배치를 다시 만들지 않는다", () => {
  // 식별자는 제거 사유를 적은 주석에 남아 있으므로 **호출·정의 형태**로 검사한다.
  assert.doesNotMatch(snapshotFunction, /async function fetchRevisionIds/);
  assert.doesNotMatch(snapshotFunction, /await fetchRevisionIds\(/);
  assert.doesNotMatch(snapshotFunction, /targetRevisionIds/);
  assert.doesNotMatch(snapshotFunction, /targetRevisionId:/);
  // 제거해도 되는 근거가 코드에 남아 있어야 한다.
  assert.match(snapshotFunction, /resolve_wiki_revision/);
  // pinned parse와 서버 쓰기 경로는 그대로다.
  assert.match(snapshotFunction, /oldid: String\(initialPage\.revid\)/);
  assert.match(snapshotFunction, /replace_wiki_snapshot_v2/);
});

test("위키 snapshot은 같은 page/revision을 재사용하고 본문은 요청할 때만 가져온다", () => {
  // warm 경로 두 개: 신원이 주어지고 본문이 필요 없으면 Wikipedia 요청 0건,
  // 본문이 필요하면 parse 뒤에 링크 그래프만 재사용한다.
  assert.match(snapshotFunction, /async function loadCachedSnapshot/);
  assert.match(
    snapshotFunction,
    /if \(expectedPageId && expectedRevisionId && !includeDocument\)/
  );
  assert.match(snapshotFunction, /const cachedAfterParse = await loadCachedSnapshot\(/);
  // 링크가 0건인 행은 재사용하지 않는다.
  assert.match(snapshotFunction, /if \(!links\.length\) return null;/);
  // PostgREST 행 제한 때문에 링크는 range로 끝까지 읽어야 한다.
  assert.match(snapshotFunction, /\.range\(offset, offset \+ pageSize - 1\)/);
});

test("본문 HTML은 관전 경로만 요청한다", () => {
  // 기본값이 false여야 나머지 호출부가 warm 시 Wikipedia를 0건으로 끝낸다.
  assert.match(
    snapshotService,
    /\{ requestId = createRequestId\(\), includeDocument = false \} = \{\}/
  );
  assert.match(snapshotService, /includeDocument,/);
  // 관전만 명시적으로 켠다.
  assert.match(spectatorService, /snapshotLoader\(identity, \{ includeDocument: true \}\)/);
  // 본문이 비면 관전은 조용히 넘어가지 않고 실패해야 한다.
  assert.match(spectatorService, /SPECTATOR_DOCUMENT_UNAVAILABLE/);
});
