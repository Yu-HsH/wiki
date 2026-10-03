// 16b-r: the exact SQL Editor files (dry-run · apply) against a local fixture, all inside one rolled-back transaction.
//   node scripts/16b-r-retro-local-run.mjs           — 13-user fixture, expected numbers, idempotency
//   node scripts/16b-r-retro-local-run.mjs --scale   — 143 users with pessimistic volumes, dry-run timing only
// Local stack only. Nothing is committed: the outer transaction is rolled back at the end.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expectedDbContainer, readProjectId, runPsql } from './supabase-runtime-common.mjs';

const read = (path) => fs.readFileSync(new URL(`./${path}`, import.meta.url), 'utf8');
const container = expectedDbContainer(readProjectId());
const scale = process.argv.includes('--scale');
const dryRun = read('16b-r-retro-dryrun.sql');
const apply = read('16b-r-retro-apply.sql');

// 143 users (production 2026-09-02: 145 users · 59 game_records) with far more history than production:
// 40 single finishes each, every adjacent pair 10 duels, 25 eight-player group rooms — all with move events,
// plus 100 event-less duels to exercise the exclusion path.
const scaleFixture = `
begin;
set local role postgres;
alter table public.game_records disable trigger trg_record_single_result_achievements;
alter table public.game_records disable trigger trg_grant_single_result_xp;
alter table public.match_history disable trigger trg_record_duel_result_achievements;
alter table public.match_history disable trigger trg_grant_duel_result_xp;
create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-016f-' || lpad(n::text, 12, '0'))::uuid $$;
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.uid(n), 'authenticated', 'authenticated', 'rs-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 143) n;
insert into public.profiles (id, username, nickname, synthetic_email)
select pg_temp.uid(n), 'rs-' || n, 'RS ' || n, 'rs-' || n || '@local.test' from generate_series(1, 143) n;
create temp table s_runs as
select gen_random_uuid() as run, pg_temp.uid(u) as user_id, k, now() - (k * interval '6 hours') as at
  from generate_series(1, 143) u, generate_series(1, 40) k;
insert into public.single_game_runs (id, user_id, status, start_page_id, start_revision_id, start_title_snapshot,
  target_page_id, target_revision_id, target_title_snapshot, current_page_id, current_revision_id, current_title_snapshot,
  move_count, path_page_ids, path_revision_ids, path_title_snapshots, started_at, finished_at, created_at)
select run, user_id, 'completed', 'rs-s', '1', 'rs-s', 'rs-t' || (k % 15), '1', 'RS ' || (k % 15),
       'rs-t' || (k % 15), '1', 'RS ' || (k % 15), 3 + k % 4, array['rs-s', 'rs-t' || (k % 15)], array['1', '1'],
       array['rs-s', 'RS ' || (k % 15)], at - interval '1 minute', at, at - interval '1 minute'
  from s_runs;
insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
  event_type, from_page_id, to_page_id, move_delta, version_before, version_after, server_timestamp)
select 'single', run, user_id, user_id, gen_random_uuid(), gen_random_uuid(), 'NORMAL_LINK', 'rs-s', 'rs-t' || (k % 15) || '-' || (k % 7), 1, 0, 1, at
  from s_runs;
insert into public.game_records (run_id, user_id, player_name, start_title, target_title, elapsed_seconds, click_count,
  path_titles, start_page_id, target_page_id, start_revision_id, target_revision_id, result_status, created_at)
select run, user_id, 'RS', 'rs-s', 'RS ' || (k % 15), 60, 3 + k % 4, array['rs-s', 'RS ' || (k % 15)],
       'rs-s', 'rs-t' || (k % 15), '1', '1', 'completed', at
  from s_runs;
create temp table s_duels as
select gen_random_uuid() as room, pg_temp.uid(u) as winner, pg_temp.uid(u % 143 + 1) as loser,
       now() - (k * interval '1 day') as at, k <= 10 as events
  from generate_series(1, 143) u, generate_series(1, 10) k
union all
select gen_random_uuid(), pg_temp.uid(u), pg_temp.uid((u + 1) % 143 + 1), now() - interval '200 days', false
  from generate_series(1, 100) u;
insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players, use_items,
  game_starts_at, finished_at, finished_reason)
select room, 'RS' || substr(replace(room::text, '-', ''), 1, 8), winner, 'finished', 'duel', 2, 2, false,
       at - interval '1 minute', at, 'normal_finish' from s_duels;
insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
  event_type, from_page_id, to_page_id, move_delta, version_before, version_after, server_timestamp)
select 'duel', room, winner, winner, gen_random_uuid(), gen_random_uuid(), 'NORMAL_LINK', 'rs-f', 'rs-d', 1, 0, 1, at
  from s_duels where events;
insert into public.match_history (room_id, winner_user_id, loser_user_id, duration_seconds, result_status, result_reason, finalized_at)
select room, winner, loser, 60, 'completed', 'normal_finish', at from s_duels;
create temp table s_groups as
select gen_random_uuid() as room, g, now() - (g * interval '2 days') as at from generate_series(1, 25) g;
insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players, use_items,
  finish_rank_limit, game_starts_at, finished_at, finished_reason)
select room, 'RG' || substr(replace(room::text, '-', ''), 1, 8), pg_temp.uid((g * 5) % 143 + 1), 'finished', 'group', 3, 8,
       false, 3, at - interval '10 minutes', at, 'all_resolved' from s_groups;
insert into public.group_match_results (room_id, user_id, rank, is_winner, move_count, finished_at, result_status, finalized_at)
select room, pg_temp.uid(((g * 5 + m) % 143) + 1), m, m = 1, 3, at - interval '1 minute', 'finished', at
  from s_groups, generate_series(1, 8) m;
insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
  event_type, from_page_id, to_page_id, move_delta, version_before, version_after, server_timestamp)
select 'group', room, pg_temp.uid(((g * 5 + m) % 143) + 1), pg_temp.uid(((g * 5 + m) % 143) + 1), gen_random_uuid(),
       gen_random_uuid(), 'NORMAL_LINK', 'rs-g', 'rs-gt', 1, 0, 1, at - interval '1 minute'
  from s_groups, generate_series(1, 8) m;
alter table public.game_records enable trigger trg_record_single_result_achievements;
alter table public.game_records enable trigger trg_grant_single_result_xp;
alter table public.match_history enable trigger trg_record_duel_result_achievements;
alter table public.match_history enable trigger trg_grant_duel_result_xp;
`;

const fixture = scale ? scaleFixture : read('16b-r-retro-local-fixture.sql');
const fixtureUsers = scale
  ? "select count(*) from public.user_achievement_unlocks where user_id::text like '00000000-0000-0000-016f-%'"
  : "select count(*) from public.user_achievement_unlocks where user_id::text like '00000000-0000-0000-016e-%'";
const marker = (name) => `\\echo '@@ ${name}'\n`;
const script = [
  fixture,
  marker('dry'), dryRun,
  marker('after-dry'), `${fixtureUsers};\n`,
  ...(scale ? [] : [marker('apply1'), apply, marker('apply2'), apply, marker('after-apply'), `${fixtureUsers};\n`]),
  'rollback;\n',
].join('\n');

const started = Date.now();
const result = runPsql(container, script);
assert.equal(result.status, 0, result.stderr);
const sections = {};
let current = null;
for (const line of result.stdout.split(/\r?\n/)) {
  const match = line.match(/^@@ (.+)$/);
  if (match) { current = match[1]; sections[current] = []; continue; }
  if (current && line.includes('|')) sections[current].push(line.split('|'));
  else if (current && /^\d+$/.test(line)) sections[current].push([line]);
}
const report = (name) => Object.fromEntries(sections[name].filter((row) => row.length === 4).map(([, , item, value]) => [item, value]));
const rows = (name) => sections[name].filter((row) => row.length === 4);
const print = (name) => {
  console.log(`\n== ${name}`);
  for (const [ord, section, item, value] of rows(name)) console.log(`${ord.padStart(3)} ${section} | ${item} | ${value}`);
};

print('dry');
const dry = report('dry');
assert.equal(dry['모드'], 'DRY-RUN — 전부 되돌림');
assert.equal(Number(dry['실패']), 0);
assert.equal(Number(sections['after-dry'][0][0]), 0, 'the dry-run leaves no unlock behind');
console.log('\nPASS dry-run: report returned as the last result; zero unlocks left behind');

if (scale) {
  console.log(`PASS scale dry-run: ${dry['소요 ms']} ms in the database (whole psql run incl. fixture ${Date.now() - started} ms)`);
} else {
  print('apply1');
  const first = report('apply1');
  const second = report('apply2');
  for (const key of Object.keys(dry).filter((key) => !['모드', '소요 ms'].includes(key))) {
    assert.equal(first[key], dry[key], `apply matches the dry-run: ${key}`);
  }
  assert.deepEqual(rows('apply1').filter(([ord]) => Number(ord) >= 100).map((row) => row.slice(1)),
    rows('dry').filter(([ord]) => Number(ord) >= 100).map((row) => row.slice(1)), 'distributions match');
  console.log('PASS apply = dry-run (every count and distribution)');
  const expected = {
    '해금 합계': '26', 'XP 합계': '780', '해금 받은 사용자': '11',
    '이동 이벤트 없는 1:1 결과': '7', '이동 이벤트 없는 그룹 결과': '1',
    '그중 16b 누적 판정기가 원천에서 여전히 세는 결과 (정상 승패 1:1 · 완주자 있는 그룹)': '8',
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(first[key], value, key);
  console.log('PASS fixture expectations (26 unlocks · 780 XP · 11 users · excluded 7 duel + 1 group)');
  print('apply2');
  assert.equal(second['해금 합계'], '0'); assert.equal(second['XP 합계'], '0'); assert.equal(second['방문 문서 행 추가'], '0');
  console.log('PASS second apply: 0 unlocks · 0 XP · 0 visits (idempotent)');
  assert.ok(Number(sections['after-apply'][0][0]) === 26);
}
const left = runPsql(container, `${fixtureUsers.replace('user_achievement_unlocks', 'profiles').replace('user_id::text', 'id::text')};`);
assert.equal(left.stdout.trim(), '0', 'rolled back: no fixture profile remains');
console.log('PASS rolled back: nothing left in the local database');
