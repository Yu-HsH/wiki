-- Wiki Race 2.0 contract tests for 20260928090000_c4_check_c3_grant_total_xp.sql.
-- Run after that migration on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/c4_check_c3_grant_total_xp.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- Scope: C3 §5.1/§7 (column-level UPDATE, total_xp unwritable by clients),
-- C3 §1 (total_xp DDL), C4 §4.1 (game_records.result_status CHECK).

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0928-000000000001', 'authenticated', 'authenticated', 'c3-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0928-000000000002', 'authenticated', 'authenticated', 'c3-2@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-0928-000000000001', 'c3-one', 'C3 One', 'c3-1@local.test'),
  ('00000000-0000-0000-0928-000000000002', 'c3-two', 'C3 Two', 'c3-2@local.test')
on conflict (id) do nothing;

/* ──────────────────────────────────────────────────────────────
 * ④ total_xp DDL — C3 §1.
 * ────────────────────────────────────────────────────────────── */

select has_column('public', 'profiles', 'total_xp', 'profiles.total_xp exists');
select col_type_is('public', 'profiles', 'total_xp', 'bigint', 'total_xp is bigint');
select col_not_null('public', 'profiles', 'total_xp', 'total_xp is not null');
select col_default_is('public', 'profiles', 'total_xp', '0', 'total_xp defaults to 0');
select is(
  (select total_xp from public.profiles where id = '00000000-0000-0000-0928-000000000001'),
  0::bigint,
  'a profile inserted without total_xp reads 0'
);
select col_has_check('public', 'profiles', 'total_xp', 'total_xp has a CHECK');
select throws_ok(
  $$update public.profiles set total_xp = -1 where id = '00000000-0000-0000-0928-000000000001'$$,
  '23514', null,
  'total_xp cannot go negative (profiles_total_xp_check)'
);
select has_index('public', 'profiles', 'profiles_total_xp_idx', 'profiles_total_xp_idx exists');

/* ──────────────────────────────────────────────────────────────
 * ③ privileges — C3 §5.1. Catalog view first, then behaviour.
 * ────────────────────────────────────────────────────────────── */

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated has no table-level UPDATE on profiles'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'anon has no table-level UPDATE on profiles'
);
select is(
  (select array_agg(column_name::text order by column_name::text)
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array['nickname', 'profile_image_url', 'updated_at'],
  'authenticated may UPDATE exactly nickname, profile_image_url, updated_at'
);
select is(
  (select count(*)::integer
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee = 'anon' and privilege_type = 'UPDATE'),
  0,
  'anon may UPDATE no column of profiles'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'total_xp', 'UPDATE'),
  'authenticated cannot UPDATE total_xp (added after the revoke)'
);
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    and has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'SELECT is untouched for both roles'
);
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'INSERT grant is untouched (RLS has no INSERT policy, so it stays denied)'
);
select is(
  (select count(*)::integer from pg_policy where polrelid = 'public.profiles'::regclass),
  5,
  'RLS policies on profiles are untouched (3 SELECT + 2 UPDATE)'
);

-- Behaviour as the signed-in owner. These are the two calls the front end makes.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0928-000000000001';

select lives_ok(
  $$update public.profiles set nickname = 'C3 Renamed', updated_at = now()
     where id = '00000000-0000-0000-0928-000000000001'$$,
  'owner can save nickname + updated_at (ProfilePage.jsx:97-98)'
);
select lives_ok(
  $$update public.profiles set profile_image_url = 'https://example.test/a.png', updated_at = now()
     where id = '00000000-0000-0000-0928-000000000001'$$,
  'owner can save profile_image_url + updated_at (ProfilePage.jsx:160-161)'
);
select throws_ok(
  $$update public.profiles set total_xp = 999999 where id = '00000000-0000-0000-0928-000000000001'$$,
  '42501', null,
  'owner cannot write total_xp — 42501 (C3 §7)'
);
select throws_ok(
  $$update public.profiles set nickname = 'x', total_xp = 1 where id = '00000000-0000-0000-0928-000000000001'$$,
  '42501', null,
  'smuggling total_xp next to an allowed column is still 42501'
);
select throws_ok(
  $$update public.profiles set username = 'c3-hijack' where id = '00000000-0000-0000-0928-000000000001'$$,
  '42501', null,
  'owner cannot write username (outside the 3-column list)'
);
select throws_ok(
  $$update public.profiles set synthetic_email = 'x@local.test' where id = '00000000-0000-0000-0928-000000000001'$$,
  '42501', null,
  'owner cannot write synthetic_email (outside the 3-column list)'
);
select throws_ok(
  $$insert into public.profiles (id, username, nickname, synthetic_email, total_xp)
    values ('00000000-0000-0000-0928-000000000009', 'c3-forged', 'Forged', 'f@local.test', 999999)$$,
  '42501', null,
  'a client insert carrying total_xp is refused by RLS'
);

-- RLS still scopes the allowed columns to the owner: another user's row is not updated.
select lives_ok(
  $$update public.profiles set nickname = 'Not Mine', updated_at = now()
     where id = '00000000-0000-0000-0928-000000000002'$$,
  'updating someone else''s nickname does not raise…'
);

set local role postgres;
select is(
  (select nickname from public.profiles where id = '00000000-0000-0000-0928-000000000002'),
  'C3 Two',
  '…and changes nothing (RLS policy untouched)'
);
select is(
  (select nickname || '|' || profile_image_url || '|' || total_xp::text
     from public.profiles where id = '00000000-0000-0000-0928-000000000001'),
  'C3 Renamed|https://example.test/a.png|0',
  'the owner''s allowed writes landed and total_xp stayed 0'
);

set local role anon;
select throws_ok(
  $$update public.profiles set nickname = 'anon' where id = '00000000-0000-0000-0928-000000000001'$$,
  '42501', null,
  'anon cannot UPDATE profiles at all'
);

/* ──────────────────────────────────────────────────────────────
 * ② game_records.result_status CHECK — C4 §4.1.
 * ────────────────────────────────────────────────────────────── */

set local role postgres;

select col_has_check('public', 'game_records', 'result_status', 'game_records.result_status has a CHECK');

select lives_ok(
  $$insert into public.game_records (user_id, player_name, start_title, target_title, elapsed_seconds, click_count, result_status)
    values ('00000000-0000-0000-0928-000000000001', 'C3 One', 'A', 'B', 10, 2, 'completed'),
           ('00000000-0000-0000-0928-000000000001', 'C3 One', 'A', 'B', 10, 2, 'abandoned'),
           ('00000000-0000-0000-0928-000000000001', 'C3 One', 'A', 'B', 10, 2, 'expired')$$,
  'completed / abandoned / expired are accepted'
);
select throws_ok(
  $$insert into public.game_records (user_id, player_name, start_title, target_title, elapsed_seconds, click_count, result_status)
    values ('00000000-0000-0000-0928-000000000001', 'C3 One', 'A', 'B', 10, 2, 'active')$$,
  '23514', null,
  '''active'' is refused — a record exists only after the run ended'
);

select * from finish();
rollback;
