-- Wiki Race 2.0 Track 15a contract tests for the XP ledger.
-- Run after 20260903090000_xp_ledger_v1.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/xp_ledger_v1.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- Scope mirrors TRACKS.md §8-D acceptance conditions ①③④⑤⑥⑦⑧⑨.

begin;
create extension if not exists pgtap with schema extensions;
select plan(128);

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0015-000000000001', 'authenticated', 'authenticated', 'xp-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0015-000000000002', 'authenticated', 'authenticated', 'xp-2@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-0015-000000000001', 'xp-1', 'XP One', 'xp-1@local.test'),
  ('00000000-0000-0000-0015-000000000002', 'xp-2', 'XP Two', 'xp-2@local.test')
on conflict (id) do nothing;

/* ──────────────────────────────────────────────────────────────
 * 1. DDL — C2 §1. Acceptance ①.
 * ────────────────────────────────────────────────────────────── */

select has_table('public', 'xp_ledger', 'the XP ledger table exists');

select has_column('public', 'xp_ledger', 'xp_class',
  'the class axis that keeps achievement XP out of the weekly ranking exists');
select has_column('public', 'xp_ledger', 'source_type', 'source_type is stored');
select has_column('public', 'xp_ledger', 'source_id', 'source_id is stored');
select has_column('public', 'xp_ledger', 'base_amount',
  'the pre-decay amount is kept alongside the granted amount');
select has_column('public', 'xp_ledger', 'amount', 'the granted amount is stored');
select has_column('public', 'xp_ledger', 'decay_reason', 'the decay reason is stored');
select has_column('public', 'xp_ledger', 'granted_at',
  'granted_at drives the weekly window');

select col_not_null('public', 'xp_ledger', 'user_id',
  'guests cannot own a ledger row');
select col_not_null('public', 'xp_ledger', 'source_id',
  'a grant always names the server result it came from');
select col_is_null('public', 'xp_ledger', 'decay_reason',
  'no decay is expressed as a null reason');

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'xp_ledger_user_id_fkey'
      and conrelid = 'public.xp_ledger'::regclass
      and confrelid = 'public.profiles'::regclass
  ),
  'user_id references profiles, which is what blocks guest grants'
);

-- Named constraints: one unique key plus six checks (C2 §1).
select ok(
  exists (select 1 from pg_constraint
          where conname = 'xp_ledger_idempotent_uq'
            and conrelid = 'public.xp_ledger'::regclass and contype = 'u'),
  'the idempotency key is a named unique constraint'
);
select is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'xp_ledger_idempotent_uq'
     and conrelid = 'public.xp_ledger'::regclass),
  'UNIQUE (user_id, source_type, source_id)',
  'idempotency is keyed on user_id, source_type and source_id (C2 §4)'
);

select ok(
  exists (select 1 from pg_constraint where conname = 'xp_ledger_xp_class_check'
          and conrelid = 'public.xp_ledger'::regclass),
  'xp_class check is named'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'xp_ledger_source_type_check'
          and conrelid = 'public.xp_ledger'::regclass),
  'source_type check is named'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'xp_ledger_class_source_check'
          and conrelid = 'public.xp_ledger'::regclass),
  'class/source agreement check is named'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'xp_ledger_amount_sign_check'
          and conrelid = 'public.xp_ledger'::regclass),
  'amount sign check is named'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'xp_ledger_decay_range_check'
          and conrelid = 'public.xp_ledger'::regclass),
  'decay range check is named'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'xp_ledger_decay_reason_check'
          and conrelid = 'public.xp_ledger'::regclass),
  'decay reason check is named'
);

select has_index('public', 'xp_ledger', 'xp_ledger_user_granted_idx',
  'the per-user history index exists');
select has_index('public', 'xp_ledger', 'xp_ledger_weekly_idx',
  'the weekly ranking index exists');
select ok(
  (select indexdef like '%WHERE (xp_class = ''gameplay''::text)%'
   from pg_indexes
   where schemaname = 'public' and indexname = 'xp_ledger_weekly_idx'),
  'the weekly index is partial on gameplay, matching the C2 §2 predicate'
);

-- 14 source types, no more and no less (C2 §3).
select is(
  (select count(*)::integer from unnest(array[
     'single_random_finish', 'single_target_first_finish', 'daily_course_first_finish',
     'duel_win_normal', 'duel_loss_normal', 'duel_win_forfeit', 'duel_loss_forfeit',
     'group_rank_1', 'group_rank_2', 'group_rank_3', 'group_rank_other', 'group_retire',
     'achievement_unlock', 'admin_adjustment'
   ]) as s
   where pg_get_constraintdef(
     (select oid from pg_constraint
      where conname = 'xp_ledger_source_type_check'
        and conrelid = 'public.xp_ledger'::regclass)) like '%''' || s || '''%'),
  14,
  'all 14 contract source types are accepted by the CHECK'
);

/* ──────────────────────────────────────────────────────────────
 * 2. RLS and grants — C2 §6. Acceptance ⑧⑨.
 * ────────────────────────────────────────────────────────────── */

select ok(
  (select relrowsecurity from pg_class where oid = 'public.xp_ledger'::regclass),
  'row level security is enabled on the ledger'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'xp_ledger'
      and policyname = 'Users can read own xp ledger'
      and cmd = 'SELECT'
  ),
  'the own-rows select policy exists'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'xp_ledger'),
  1,
  'select is the only policy: there is no client write path'
);

select ok(has_table_privilege('authenticated', 'public.xp_ledger', 'select'),
  'authenticated can read the ledger through the policy');
select ok(not has_table_privilege('authenticated', 'public.xp_ledger', 'insert'),
  'authenticated cannot insert into the ledger');
select ok(not has_table_privilege('authenticated', 'public.xp_ledger', 'update'),
  'authenticated cannot update the ledger');
select ok(not has_table_privilege('authenticated', 'public.xp_ledger', 'delete'),
  'authenticated cannot delete from the ledger');
select ok(not has_table_privilege('anon', 'public.xp_ledger', 'select'),
  'guests cannot read the ledger at all');

-- Acceptance ⑨: grant_xp_v1 takes p_user_id, so authenticated must not reach it.
select ok(
  not has_function_privilege(
    'authenticated',
    'public.grant_xp_v1(uuid, text, uuid, integer, integer, text)',
    'execute'),
  'authenticated has no execute on grant_xp_v1 (C2 §7)'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.grant_xp_v1(uuid, text, uuid, integer, integer, text)',
    'execute'),
  'anon has no execute on grant_xp_v1'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.grant_xp_v1(uuid, text, uuid, integer, integer, text)',
    'execute'),
  'service_role can call grant_xp_v1'
);
select ok(
  has_function_privilege('authenticated', 'public.get_xp_summary_v1(uuid)', 'execute'),
  'authenticated can read its own XP summary'
);
select ok(
  not has_function_privilege('anon', 'public.get_xp_summary_v1(uuid)', 'execute'),
  'guests cannot call the XP summary'
);

select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'xp_ledger'
  ),
  'the ledger is not exposed through Realtime'
);

/* ──────────────────────────────────────────────────────────────
 * 3. Function shape — contracts/README RPC rules. Acceptance ②.
 * ────────────────────────────────────────────────────────────── */

select has_function('public', 'xp_to_next_level', array['integer'],
  'the per-level requirement function exists');
select has_function('public', 'level_from_total_xp', array['bigint'],
  'the level function exists');
select has_function('public', 'grant_xp_v1',
  array['uuid', 'text', 'uuid', 'integer', 'integer', 'text'],
  'the grant RPC exists with the contract signature');
select has_function('public', 'get_xp_summary_v1', array['uuid'],
  'the summary RPC exists with the contract signature');

select ok(
  (select prosecdef and coalesce(array_to_string(proconfig, ','), '') = 'search_path=""'
   from pg_proc where oid = 'public.grant_xp_v1(uuid, text, uuid, integer, integer, text)'::regprocedure),
  'grant_xp_v1 is security definer with an empty search_path'
);
select ok(
  (select prosecdef and coalesce(array_to_string(proconfig, ','), '') = 'search_path=""'
   from pg_proc where oid = 'public.get_xp_summary_v1(uuid)'::regprocedure),
  'get_xp_summary_v1 is security definer with an empty search_path'
);
select ok(
  (select provolatile = 'i' from pg_proc
   where oid = 'public.level_from_total_xp(bigint)'::regprocedure),
  'level_from_total_xp is immutable (C3 §4)'
);

-- Acceptance ②: the 15a/15b split holds only while this body leaves profiles alone.
select ok(
  (select prosrc !~* 'update\s+public\.profiles' from pg_proc
   where oid = 'public.grant_xp_v1(uuid, text, uuid, integer, integer, text)'::regprocedure),
  '15a grant_xp_v1 never updates public.profiles (TRACKS §6.1 condition C1)'
);

/* ──────────────────────────────────────────────────────────────
 * 4. Level formula — C3 §4 check table. Acceptance ⑦.
 * ────────────────────────────────────────────────────────────── */

select is(public.xp_to_next_level(1), 100, 'levels 1-5 cost 100 XP each');
select is(public.xp_to_next_level(5), 100, 'level 5 still costs 100');
select is(public.xp_to_next_level(6), 125, 'the requirement grows by 25 every five levels');
select is(public.xp_to_next_level(27), 225, 'level 27 needs 225 (C3 §4 check table)');
select is(public.xp_to_next_level(80), 475, 'level 80 still costs 475 — the cap starts one level later');
select is(public.xp_to_next_level(81), 500, 'from level 81 the cost stays 500');
select is(public.xp_to_next_level(200), 500, 'the cap holds far above level 81');

select is(public.level_from_total_xp(0), 1, 'zero XP is level 1');
select is(public.level_from_total_xp(99), 1, 'one XP short of level 2 is still level 1');
select is(public.level_from_total_xp(100), 2, '100 XP reaches level 2');
select is(public.level_from_total_xp(500), 6, 'five 100 XP levels reach level 6');
select is(public.level_from_total_xp(3974), 26, 'one XP short of level 27');
select is(public.level_from_total_xp(3975), 27, '3975 XP is level 27 (C3 §4 check table)');
select is(public.level_from_total_xp(-50), 1, 'a negative ledger sum floors at level 1');

/* ──────────────────────────────────────────────────────────────
 * 5. grant_xp_v1 behaviour.
 * ────────────────────────────────────────────────────────────── */

-- 5.1 A plain gameplay grant.
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'single_random_finish',
     '00000000-0000-0000-0016-000000000001', 20, 20) ->> 'granted'),
  'true',
  'a first grant is recorded'
);
select is(
  (select count(*)::integer from public.xp_ledger
   where user_id = '00000000-0000-0000-0015-000000000001'),
  1,
  'the first grant wrote exactly one row'
);
select is(
  (select xp_class from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000001'),
  'gameplay',
  'a match result is classified as gameplay'
);

-- 5.2 Acceptance ③: idempotency.
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'single_random_finish',
     '00000000-0000-0000-0016-000000000001', 20, 20) ->> 'granted'),
  'false',
  'a repeated call reports granted:false rather than failing'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'single_random_finish',
     '00000000-0000-0000-0016-000000000001', 20, 20) ->> 'ok'),
  'true',
  'granted:false is not an error (C2 §7)'
);
select is(
  (select count(*)::integer from public.xp_ledger
   where user_id = '00000000-0000-0000-0015-000000000001'
     and source_id = '00000000-0000-0000-0016-000000000001'),
  1,
  'three calls with the same result id leave exactly one row'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'single_random_finish',
     '00000000-0000-0000-0016-000000000001', 20, 20) ->> 'total_xp'),
  '20',
  'the cumulative total does not double on a repeated call'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'single_random_finish',
     '00000000-0000-0000-0016-000000000001', 20, 20) ->> 'ledger_id'),
  null,
  'a repeated call returns no new ledger id'
);

-- 5.3 The same result id under a different source type is a separate grant.
-- C2 §4 deliberately leaves the overlap open with the three-column key.
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'daily_course_first_finish',
     '00000000-0000-0000-0016-000000000001', 25, 25) ->> 'granted'),
  'true',
  'the same game_records id can also pay a daily course grant (C2 §4)'
);
select is(
  (select count(*)::integer from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000001'),
  2,
  'the overlap produced two rows, one per source type'
);

-- 5.4 The idempotency key is per user: one group result pays every player.
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000002', 'group_rank_1',
     '00000000-0000-0000-0016-000000000002', 70, 70) ->> 'granted'),
  'true',
  'the first player of a group result is paid'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'group_rank_2',
     '00000000-0000-0000-0016-000000000002', 55, 55) ->> 'granted'),
  'true',
  'a second player is paid from the same group result id'
);

-- 5.5 Acceptance ⑤: decay uses floor, so half of 25 is 12.
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000002', 'duel_loss_normal',
     '00000000-0000-0000-0016-000000000003', 25, 12, 'duel_repeat_half') ->> 'granted'),
  'true',
  'a halved duel loss is recorded'
);
select is(
  (select amount from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000003'),
  12,
  'half of 25 is 12 — floor, not round (C2 §8-①)'
);
select is(
  (select base_amount from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000003'),
  25,
  'the pre-decay value is kept next to it (15 §3)'
);
select is(
  (select decay_reason from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000003'),
  'duel_repeat_half',
  'the decay reason is recorded'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000002', 'duel_win_normal',
     '00000000-0000-0000-0016-000000000004', 50, 0, 'duel_repeat_zero') ->> 'granted'),
  'true',
  'the sixth duel of the day pays zero but still records the base value'
);
select is(
  (select base_amount || '/' || amount from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000004'),
  '50/0',
  'a zeroed grant keeps 50 as base_amount'
);

-- 5.6 Acceptance ⑥: zero XP still leaves a row.
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000002', 'duel_loss_forfeit',
     '00000000-0000-0000-0016-000000000005', 0, 0) ->> 'granted'),
  'true',
  'a forfeit loss is granted even though it is worth 0 XP'
);
select is(
  (select count(*)::integer from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000005'),
  1,
  'the 0 XP forfeit row exists, so a retry cannot be mistaken for a first grant'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000002', 'group_retire',
     '00000000-0000-0000-0016-000000000006', 0, 0) ->> 'granted'),
  'true',
  'a group RETIRE is granted at 0 XP'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000002', 'group_retire',
     '00000000-0000-0000-0016-000000000006', 0, 0) ->> 'granted'),
  'false',
  'the 0 XP row makes the RETIRE grant idempotent too'
);

-- 5.7 xp_class is derived, never passed in.
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000002', 'achievement_unlock',
     '00000000-0000-0000-0016-000000000007', 30, 30) ->> 'granted'),
  'true',
  'an achievement unlock is granted'
);
select is(
  (select xp_class from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000007'),
  'achievement',
  'achievement_unlock is classified as achievement, so it leaves the weekly ranking'
);
select is(
  (select xp_class from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000002'
     and user_id = '00000000-0000-0000-0015-000000000002'),
  'gameplay',
  'group results stay gameplay, so they count for the weekly ranking'
);

-- 5.8 Level transitions, including several levels at once (15 §4).
-- One call, captured once, so level_before and level_after describe the same
-- grant. xp-1 holds 20 + 25 + 55 = 100 XP going in.
create temporary table xp_multi_level_jump on commit drop as
select public.grant_xp_v1(
         '00000000-0000-0000-0015-000000000001', 'admin_adjustment',
         '00000000-0000-0000-0016-000000000008', 1000, 1000) as result;

select is(
  (select result ->> 'level_before' from xp_multi_level_jump),
  '2',
  'the 100 XP earned so far had already reached level 2'
);
select is(
  (select result ->> 'level_after' from xp_multi_level_jump),
  '10',
  'a single 1000 XP grant crosses eight thresholds at once (15 §4)'
);
select is(
  (select result ->> 'total_xp' from xp_multi_level_jump),
  '1100',
  'the returned total is the ledger sum after the grant'
);
select is(
  (select xp_class from public.xp_ledger
   where source_id = '00000000-0000-0000-0016-000000000008'),
  'admin',
  'admin_adjustment is classified as admin'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'admin_adjustment',
     '00000000-0000-0000-0016-00000000000a', -100, -100) ->> 'ok'),
  'true',
  'a negative admin adjustment is allowed (15 §2)'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'admin_adjustment',
     '00000000-0000-0000-0016-00000000000b', 0, 0) ->> 'total_xp'),
  '1000',
  'the negative adjustment reduced the cumulative total'
);

-- 5.9 Failure codes — C2 §7.
select is(
  (public.grant_xp_v1(
     null, 'single_random_finish',
     '00000000-0000-0000-0016-0000000000f0', 20, 20) ->> 'code'),
  'AUTH_REQUIRED',
  'a null user is rejected instead of raising a FK violation'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-0000000000ff', 'single_random_finish',
     '00000000-0000-0000-0016-0000000000f1', 20, 20) ->> 'code'),
  'AUTH_REQUIRED',
  'a user without a profile — a guest — cannot be granted XP'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'single_bogus_finish',
     '00000000-0000-0000-0016-0000000000f2', 20, 20) ->> 'code'),
  'XP_SOURCE_INVALID',
  'an unknown source type is rejected'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'single_random_finish',
     null, 20, 20) ->> 'code'),
  'XP_SOURCE_INVALID',
  'a missing source id is rejected'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'duel_win_normal',
     '00000000-0000-0000-0016-0000000000f3', 50, 60) ->> 'code'),
  'XP_AMOUNT_INVALID',
  'a grant larger than its base amount is rejected'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'duel_win_normal',
     '00000000-0000-0000-0016-0000000000f4', 50, 25) ->> 'code'),
  'XP_AMOUNT_INVALID',
  'a reduced amount without a decay reason is rejected'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'duel_win_normal',
     '00000000-0000-0000-0016-0000000000f5', 50, 25, 'duel_repeat_third') ->> 'code'),
  'XP_AMOUNT_INVALID',
  'an unknown decay reason is rejected'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'duel_win_normal',
     '00000000-0000-0000-0016-0000000000f6', 50, -10) ->> 'code'),
  'XP_AMOUNT_INVALID',
  'gameplay XP cannot be negative — only admin adjustments can'
);
select is(
  (public.grant_xp_v1(
     '00000000-0000-0000-0015-000000000001', 'duel_win_normal',
     '00000000-0000-0000-0016-0000000000f7', null, 50) ->> 'code'),
  'XP_AMOUNT_INVALID',
  'a missing base amount is rejected'
);
select is(
  (select count(*)::integer from public.xp_ledger
   where source_id::text like '00000000-0000-0000-0016-0000000000f%'),
  0,
  'no rejected call left a row behind'
);

/* ──────────────────────────────────────────────────────────────
 * 6. The CHECKs reject forged rows directly. Acceptance ④.
 * ────────────────────────────────────────────────────────────── */

select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'duel_win_normal',
            '00000000-0000-0000-0017-000000000001', 50, 25)$$,
  '23514',
  null,
  'a silent reduction without a decay reason violates xp_ledger_decay_reason_check'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount, decay_reason)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'duel_win_normal',
            '00000000-0000-0000-0017-000000000002', 50, 60, 'duel_repeat_half')$$,
  '23514',
  null,
  'granting more than the base amount violates xp_ledger_decay_range_check'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'achievement_unlock',
            '00000000-0000-0000-0017-000000000003', 30, 30)$$,
  '23514',
  null,
  'an achievement filed as gameplay violates xp_ledger_class_source_check'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-000000000001', 'admin', 'duel_win_normal',
            '00000000-0000-0000-0017-000000000004', 50, 50)$$,
  '23514',
  null,
  'a match result filed as an admin adjustment violates xp_ledger_class_source_check'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount, decay_reason)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'duel_win_normal',
            '00000000-0000-0000-0017-000000000005', 50, 25, 'duel_repeat_third')$$,
  '23514',
  null,
  'an invented decay reason violates xp_ledger_decay_reason_check'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'duel_mvp_bonus',
            '00000000-0000-0000-0017-000000000006', 50, 50)$$,
  '23514',
  null,
  'an unknown source type violates xp_ledger_source_type_check'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'duel_win_normal',
            '00000000-0000-0000-0017-000000000007', -50, -50)$$,
  '23514',
  null,
  'negative gameplay XP violates xp_ledger_amount_sign_check'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'single_random_finish',
            '00000000-0000-0000-0016-000000000001', 20, 20)$$,
  '23505',
  null,
  'a duplicate result id is refused by the idempotency key even on a direct insert'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-0000000000ff', 'gameplay', 'single_random_finish',
            '00000000-0000-0000-0017-000000000008', 20, 20)$$,
  '23503',
  null,
  'a user without a profile row cannot be given a ledger row'
);

/* ──────────────────────────────────────────────────────────────
 * 7. get_xp_summary_v1 — C2 §7.
 * ────────────────────────────────────────────────────────────── */

select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-0000000000ff') ->> 'code'),
  'PROFILE_NOT_FOUND',
  'a summary for a missing profile fails with PROFILE_NOT_FOUND'
);
select is(
  (public.get_xp_summary_v1(null) ->> 'code'),
  'PROFILE_NOT_FOUND',
  'a null user id fails the same way'
);

-- xp-2 currently holds 70 + 12 + 0 + 0 + 0 + 30 = 112 XP.
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'total_xp'),
  '112',
  'the summary total is the ledger sum, achievement XP included (C2 §2)'
);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'level'),
  '2',
  '112 XP is level 2'
);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'current_level_xp'),
  '12',
  'progress inside level 2 is the 12 XP past the 100 XP threshold'
);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'next_level_xp'),
  '100',
  'level 2 still needs 100 XP to reach level 3'
);

set local role postgres;
delete from public.xp_ledger where user_id = '00000000-0000-0000-0015-000000000002';
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'total_xp'),
  '0',
  'a player with no ledger rows reads back as 0 XP, not null'
);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'level'),
  '1',
  'zero XP is level 1'
);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'current_level_xp'),
  '0',
  'progress inside level 1 starts at 0'
);

insert into public.xp_ledger (user_id, xp_class, source_type, source_id, base_amount, amount)
values ('00000000-0000-0000-0015-000000000002', 'admin', 'admin_adjustment',
        '00000000-0000-0000-0018-000000000001', 3975, 3975);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'level'),
  '27',
  'the C3 §4 check value reaches level 27 through the summary RPC too'
);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'current_level_xp'),
  '0',
  '3975 XP lands exactly on the level 27 boundary'
);
select is(
  (public.get_xp_summary_v1('00000000-0000-0000-0015-000000000002') ->> 'next_level_xp'),
  '225',
  'level 27 needs 225 XP for level 28'
);

/* ──────────────────────────────────────────────────────────────
 * 8. RLS behaviour under the authenticated role.
 * ────────────────────────────────────────────────────────────── */

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0015-000000000001';
select is(
  (select count(*)::integer from public.xp_ledger),
  (select count(*)::integer from public.xp_ledger
   where user_id = '00000000-0000-0000-0015-000000000001'),
  'an authenticated reader sees only its own ledger rows'
);
select ok(
  (select count(*) from public.xp_ledger
   where user_id = '00000000-0000-0000-0015-000000000002') = 0,
  'the ledger rows of another explorer are invisible'
);
select throws_ok(
  $$insert into public.xp_ledger
      (user_id, xp_class, source_type, source_id, base_amount, amount)
    values ('00000000-0000-0000-0015-000000000001', 'gameplay', 'duel_win_normal',
            '00000000-0000-0000-0019-000000000001', 50, 50)$$,
  '42501',
  null,
  'a signed-in client cannot forge a ledger row'
);
select throws_ok(
  $$update public.xp_ledger set amount = 9999$$,
  '42501',
  null,
  'a signed-in client cannot inflate an existing grant'
);
select throws_ok(
  $$delete from public.xp_ledger$$,
  '42501',
  null,
  'a signed-in client cannot erase its own ledger'
);
select throws_ok(
  $$select public.grant_xp_v1('00000000-0000-0000-0015-000000000001',
      'duel_win_normal', '00000000-0000-0000-0019-000000000002', 50, 50)$$,
  '42501',
  null,
  'a signed-in client cannot call the grant RPC at all (C2 §7)'
);

set local role postgres;

select * from finish();
rollback;
