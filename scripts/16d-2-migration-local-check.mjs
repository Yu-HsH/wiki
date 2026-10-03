// 16d-2: run the badge-retirement migration on a pre-16d-2 local database that holds badges,
// and check the data path: owned rewards untouched, only badge-slot equipment removed,
// scripts/16d-check-badge-holders.sql before → rows, after → none. Local stack only.
// It resets the local database to 20261003090000 first and back to all migrations at the end.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expectedDbContainer, readProjectId, runCli, runPsql } from './supabase-runtime-common.mjs';

const container = expectedDbContainer(readProjectId());
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
function sql(statement) {
  const result = runPsql(container, statement);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const rows = (statement) => sql(statement).split(/\r?\n/).filter(Boolean);
function reset(version) {
  const args = ['db', 'reset', '--local', '--yes', ...(version ? ['--version', version] : [])];
  const result = runCli(args);
  assert.equal(result.status, 0, `db reset ${version ?? 'all'} failed: ${result.stderr}`);
}
const checks = [];
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };

reset('20261003090000');
try {
  assert.equal(sql('select max(version) from supabase_migrations.schema_migrations;'), '20261003090000');
  pass('local database at 20261003090000 (pre-16d-2)');

  // U1 wears three badges and a title; U2 owns badges but wears none; U3 wears only a frame.
  sql(`
    insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select ('00000000-0000-0000-0d2c-00000000000' || n)::uuid, 'authenticated', 'authenticated', 'd2-' || n || '@local.test', '{}', '{}', now(), now()
      from generate_series(1, 3) n;
    insert into public.profiles (id, username, nickname, synthetic_email)
    select ('00000000-0000-0000-0d2c-00000000000' || n)::uuid, 'd2-' || n, 'D2 ' || n, 'd2-' || n || '@local.test'
      from generate_series(1, 3) n;
    insert into public.user_reward_inventory (user_id, reward_id, grant_source_type) values
      ('00000000-0000-0000-0d2c-000000000001', 'badge_first_arrival', 'admin'),
      ('00000000-0000-0000-0d2c-000000000001', 'badge_daily_explorer_1', 'admin'),
      ('00000000-0000-0000-0d2c-000000000001', 'badge_signpost', 'admin'),
      ('00000000-0000-0000-0d2c-000000000001', 'title_daily_steps_1', 'admin'),
      ('00000000-0000-0000-0d2c-000000000002', 'badge_first_arrival', 'admin'),
      ('00000000-0000-0000-0d2c-000000000002', 'badge_group_together_1', 'admin'),
      ('00000000-0000-0000-0d2c-000000000003', 'frame_wide_world_1', 'admin');
    insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id) values
      ('00000000-0000-0000-0d2c-000000000001', 'badge', 1, 'badge_first_arrival'),
      ('00000000-0000-0000-0d2c-000000000001', 'badge', 2, 'badge_daily_explorer_1'),
      ('00000000-0000-0000-0d2c-000000000001', 'badge', 3, 'badge_signpost'),
      ('00000000-0000-0000-0d2c-000000000001', 'title', 1, 'title_daily_steps_1'),
      ('00000000-0000-0000-0d2c-000000000003', 'frame', 1, 'frame_wide_world_1');`);

  const inventoryBefore = rows(`select user_id || ':' || reward_id from public.user_reward_inventory
    where user_id::text like '00000000-0000-0000-0d2c-%' order by 1;`);
  const holdersBefore = rows(read('./16d-check-badge-holders.sql'));
  const byReward = Object.fromEntries(holdersBefore.map((line) => {
    const [reward, listed, holders, equipped, total] = line.split('|');
    return [reward, { listed, holders: Number(holders), equipped: Number(equipped), total: Number(total) }];
  }));
  assert.equal(holdersBefore.length, 11, 'one row per badge reward');
  assert.equal(byReward.badge_first_arrival.holders, 2);
  assert.equal(byReward.badge_first_arrival.equipped, 1);
  assert.equal(byReward.badge_group_together_1.equipped, 0);
  assert.equal(byReward.badge_signpost.listed, 'f');
  assert.equal(byReward.badge_first_arrival.total, 3, 'three badge-slot rows to be released');
  pass('holder query before: 11 rows · first_arrival 2 holders / 1 wearing · 3 badge-slot rows in total');

  const applied = runPsql(container, read('../supabase/migrations/20261003100000_badge_retirement_v1.sql'));
  assert.equal(applied.status, 0, applied.stderr);
  pass('migration file applied on the pre-16d-2 database');

  const inventoryAfter = rows(`select user_id || ':' || reward_id from public.user_reward_inventory
    where user_id::text like '00000000-0000-0000-0d2c-%' order by 1;`);
  assert.deepEqual(inventoryAfter, inventoryBefore);
  pass('owned rewards unchanged — no reward lost, none re-granted');

  assert.deepEqual(rows(`select user_id || ':' || slot || ':' || reward_id from public.user_profile_equipment
    where user_id::text like '00000000-0000-0000-0d2c-%' order by 1;`), [
    '00000000-0000-0000-0d2c-000000000001:title:title_daily_steps_1',
    '00000000-0000-0000-0d2c-000000000003:frame:frame_wide_world_1',
  ]);
  pass('only the 3 badge-slot rows are gone; the title and frame stay worn');

  assert.deepEqual(rows(read('./16d-check-badge-holders.sql')), []);
  pass('holder query after: 0 rows');

  assert.deepEqual(rows(`select reward_id || ':' || kind from public.reward_catalog
    where reward_id in ('badge_first_arrival', 'badge_daily_explorer_1', 'badge_group_together_1', 'badge_signpost') order by 1;`), [
    'badge_daily_explorer_1:title', 'badge_first_arrival:profile_icon', 'badge_group_together_1:title', 'badge_signpost:profile_icon',
  ]);
  const card = JSON.parse(sql(`select private.profile_cards_v1(array['00000000-0000-0000-0d2c-000000000001'::uuid])
    -> '00000000-0000-0000-0d2c-000000000001';`));
  assert.deepEqual(card.badges, []);
  assert.equal(card.title.rewardId, 'title_daily_steps_1');
  pass('kinds converted; U1 card keeps its title and badges is []');
} finally {
  reset(null);
  assert.equal(sql('select max(version) from supabase_migrations.schema_migrations;'), '20261003100000');
  pass('local database reset back to all migrations (20261003100000)');
  console.log(`16d-2 migration check: ${checks.length} checks`);
}
