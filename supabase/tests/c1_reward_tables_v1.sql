-- Wiki Race 2.0 Track 17b-1 contract tests: C1 reward tables.
-- Run after 20261001090000_c1_reward_tables_v1.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/c1_reward_tables_v1.sql
--
-- Every fixture is rolled back; this file never touches a remote database.

begin;
create extension if not exists pgtap with schema extensions;
select plan(96);

set local role postgres;

-- U1..U3 have profiles. U4 is an auth user without a profile.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-017b-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'c1-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 4) as n
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email, profile_image_url, total_xp)
select ('00000000-0000-0000-017b-00000000000' || n)::uuid, 'c1-' || n, 'C1 ' || n, 'c1-' || n || '@local.test',
       case when n = 1 then 'https://example.test/legacy.png' end,
       case when n = 1 then 1000 else 0 end
  from generate_series(1, 3) as n
on conflict (id) do nothing;

create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-017b-00000000000' || n)::uuid $$;

create function pg_temp.act_as(p_user uuid) returns void language sql
as $$ select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true); select null::void $$;

-- Fixture rewards — one of each card kind, four badges, a retired badge and a
-- path_color. Granted to U1 as admin (grant_source_id may be null for admin).
insert into public.reward_catalog (reward_id, kind, display_name, asset_ref, retired)
values
  ('c1t_title_a', 'title', '테스트 칭호', null, false),
  ('c1t_badge_a', 'badge', '배지 A', '/b/a.svg', false),
  ('c1t_badge_b', 'badge', '배지 B', null, false),
  ('c1t_badge_c', 'badge', '배지 C', null, false),
  ('c1t_badge_d', 'badge', '배지 D', null, false),
  ('c1t_badge_old', 'badge', '은퇴 배지', null, true),
  ('c1t_frame_a', 'frame', '테스트 프레임', null, false),
  ('c1t_bg_a', 'background', '테스트 배경', null, false),
  ('c1t_path_a', 'path_color', '테스트 경로색', null, false),
  ('c1t_unowned', 'title', '미보유 칭호', null, false);

insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
select pg_temp.uid(1), r, 'admin'
  from unnest(array['c1t_title_a', 'c1t_badge_a', 'c1t_badge_b', 'c1t_badge_c', 'c1t_badge_d',
                    'c1t_badge_old', 'c1t_frame_a', 'c1t_bg_a', 'c1t_path_a']) as r;

-- ---------------------------------------------------------------------------
-- 1. Structure — C1 §1·§2·§3.
-- ---------------------------------------------------------------------------
select has_table('public', 'reward_catalog', 'reward_catalog exists');
select has_table('public', 'user_reward_inventory', 'user_reward_inventory exists');
select has_table('public', 'user_profile_equipment', 'user_profile_equipment exists');
select col_is_pk('public', 'reward_catalog', 'reward_id', 'catalog PK is reward_id');
select col_is_pk('public', 'user_reward_inventory', array['user_id', 'reward_id'], 'inventory PK is (user_id, reward_id)');
select col_is_pk('public', 'user_profile_equipment', array['user_id', 'slot', 'slot_index'], 'equipment PK is (user_id, slot, slot_index)');
select ok((select relrowsecurity from pg_class where oid = 'public.reward_catalog'::regclass), 'catalog RLS on');
select ok((select relrowsecurity from pg_class where oid = 'public.user_reward_inventory'::regclass), 'inventory RLS on');
select ok((select relrowsecurity from pg_class where oid = 'public.user_profile_equipment'::regclass), 'equipment RLS on');
select fk_ok('public', 'user_profile_equipment', array['user_id', 'reward_id'],
             'public', 'user_reward_inventory', array['user_id', 'reward_id'],
             'equipment (user_id, reward_id) references inventory');

-- Table ACL: authenticated reads only, anon nothing.
select table_privs_are('public', 'reward_catalog', 'authenticated', array['SELECT'], 'catalog: authenticated SELECT only');
select table_privs_are('public', 'user_reward_inventory', 'authenticated', array['SELECT'], 'inventory: authenticated SELECT only');
select table_privs_are('public', 'user_profile_equipment', 'authenticated', array['SELECT'], 'equipment: authenticated SELECT only');
select table_privs_are('public', 'reward_catalog', 'anon', array[]::text[], 'catalog: anon nothing');
select table_privs_are('public', 'user_reward_inventory', 'anon', array[]::text[], 'inventory: anon nothing');
select table_privs_are('public', 'user_profile_equipment', 'anon', array[]::text[], 'equipment: anon nothing');

-- Function ACL: authenticated only (C1 §4).
select function_privs_are('public', 'equip_profile_reward_v1', array['text', 'smallint', 'text'], 'anon', array[]::text[], 'equip: anon cannot execute');
select function_privs_are('public', 'unequip_profile_reward_v1', array['text', 'smallint'], 'anon', array[]::text[], 'unequip: anon cannot execute');
select function_privs_are('public', 'get_profile_card_v1', array['uuid'], 'anon', array[]::text[], 'get card: anon cannot execute');
select function_privs_are('public', 'get_profile_cards_v1', array['uuid[]'], 'anon', array[]::text[], 'get cards: anon cannot execute');
select function_privs_are('public', 'equip_profile_reward_v1', array['text', 'smallint', 'text'], 'authenticated', array['EXECUTE'], 'equip: authenticated executes');
select function_privs_are('public', 'get_profile_cards_v1', array['uuid[]'], 'authenticated', array['EXECUTE'], 'get cards: authenticated executes');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('equip_profile_reward_v1', 'unequip_profile_reward_v1', 'get_profile_card_v1', 'get_profile_cards_v1')
              and p.prosecdef
              and p.proconfig @> array['search_path=""']),
          4, 'all four RPCs are security definer with empty search_path');

-- ---------------------------------------------------------------------------
-- 2. Constraints — the structure enforces the two C1 §3.1 rules.
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
                    values (pg_temp.uid(2), 'title', 1, 'c1t_title_a') $$,
                 '23503', null, 'unowned reward cannot be equipped (FK)');
select throws_ok($$ insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
                    values (pg_temp.uid(1), 'badge', 4, 'c1t_badge_d') $$,
                 '23514', null, 'no 4th badge position (CHECK)');
select throws_ok($$ insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
                    values (pg_temp.uid(1), 'title', 2, 'c1t_title_a') $$,
                 '23514', null, 'non-badge slot_index must be 1 (CHECK)');
select throws_ok($$ insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
                    values (pg_temp.uid(1), 'hat', 1, 'c1t_title_a') $$,
                 '23514', null, 'unknown slot rejected (CHECK)');
select throws_ok($$ insert into public.reward_catalog (reward_id, kind, display_name) values ('c1t_bad', 'hat', 'x') $$,
                 '23514', null, 'unknown kind rejected (CHECK)');
select throws_ok($$ insert into public.reward_catalog (reward_id, kind, display_name) values ('Bad-Id', 'badge', 'x') $$,
                 '23514', null, 'reward_id format enforced (CHECK)');
select throws_ok($$ insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
                    values (pg_temp.uid(2), 'c1t_badge_a', 'reward_bundle') $$,
                 '23514', null, 'reward_bundle grant needs grant_source_id (CHECK)');
select throws_ok($$ insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
                    values (pg_temp.uid(4), 'c1t_badge_a', 'admin') $$,
                 '23503', null, 'no inventory without a profile (guest boundary)');
select lives_ok($$ insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
                   values (pg_temp.uid(1), 'c1t_badge_a', 'admin') on conflict do nothing $$,
                'regrant is idempotent via the PK');

-- ---------------------------------------------------------------------------
-- 3. Seed and default icon grant (decision ④).
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.reward_catalog where reward_id like 'icon_default_%' and kind = 'profile_icon'),
          6, 'six default icons seeded');
select is((select count(*)::int from public.reward_catalog
            where reward_id like 'icon_default_%' and asset_ref ~ '^/profile-icons/[a-z]+\.svg$'),
          6, 'default icons point at public/profile-icons');
select is((select array_agg(reward_id order by reward_id) from public.reward_catalog where reward_id like 'icon_default_%'),
          array['icon_default_book', 'icon_default_compass', 'icon_default_globe',
                'icon_default_lantern', 'icon_default_map', 'icon_default_quill'],
          'default icon ids are fixed');
select is((select count(*)::int from public.profiles p
            where (select count(*) from public.user_reward_inventory i
                    where i.user_id = p.id and i.reward_id like 'icon_default_%'
                      and i.grant_source_type = 'system_default') <> 6),
          0, 'every profile owns all six default icons (backfill + trigger)');
select has_trigger('public', 'profiles', 'profiles_grant_default_profile_icons', 'profiles has the default icon trigger');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-017b-000000000009', 'authenticated', 'authenticated', 'c1-9@local.test', '{}', '{}', now(), now());
insert into public.profiles (id, username, nickname, synthetic_email)
values ('00000000-0000-0000-017b-000000000009', 'c1-9', 'C1 9', 'c1-9@local.test');
select is((select count(*)::int from public.user_reward_inventory
            where user_id = '00000000-0000-0000-017b-000000000009' and grant_source_type = 'system_default'),
          6, 'a new profile gets six default icons from the trigger');

-- ---------------------------------------------------------------------------
-- 4. equip_profile_reward_v1 — failure codes.
-- ---------------------------------------------------------------------------
set local role authenticated;

select pg_temp.act_as(null);
select is(public.equip_profile_reward_v1('profile_icon', 1::smallint, 'icon_default_map') ->> 'code',
          'AUTH_REQUIRED', 'equip without a session: AUTH_REQUIRED');
select pg_temp.act_as(pg_temp.uid(4));
select is(public.equip_profile_reward_v1('profile_icon', 1::smallint, 'icon_default_map') ->> 'code',
          'AUTH_REQUIRED', 'equip by an auth user without profile: AUTH_REQUIRED');

select pg_temp.act_as(pg_temp.uid(1));
select is(public.equip_profile_reward_v1('title', 1::smallint, 'c1t_unowned') ->> 'code',
          'REWARD_NOT_OWNED', 'unowned reward: REWARD_NOT_OWNED');
select is(public.equip_profile_reward_v1('title', 1::smallint, 'c1t_does_not_exist') ->> 'code',
          'REWARD_NOT_OWNED', 'unknown reward: REWARD_NOT_OWNED');
select is(public.equip_profile_reward_v1('badge', 4::smallint, 'c1t_badge_d') ->> 'code',
          'SLOT_INDEX_INVALID', 'badge index 4: SLOT_INDEX_INVALID');
select is(public.equip_profile_reward_v1('badge', 0::smallint, 'c1t_badge_d') ->> 'code',
          'SLOT_INDEX_INVALID', 'badge index 0: SLOT_INDEX_INVALID');
select is(public.equip_profile_reward_v1('title', 2::smallint, 'c1t_title_a') ->> 'code',
          'SLOT_INDEX_INVALID', 'title index 2: SLOT_INDEX_INVALID');
select is(public.equip_profile_reward_v1('badge', 1::smallint, 'c1t_frame_a') ->> 'code',
          'SLOT_KIND_MISMATCH', 'frame into badge slot: SLOT_KIND_MISMATCH');
select is(public.equip_profile_reward_v1('title', 1::smallint, 'icon_default_map') ->> 'code',
          'SLOT_KIND_MISMATCH', 'icon into title slot: SLOT_KIND_MISMATCH');
select is(public.equip_profile_reward_v1('hat', 1::smallint, 'c1t_title_a') ->> 'code',
          'SLOT_KIND_MISMATCH', 'unknown slot: SLOT_KIND_MISMATCH');
select is(public.equip_profile_reward_v1('badge', 1::smallint, 'c1t_badge_old') ->> 'code',
          'REWARD_RETIRED', 'retired reward cannot be newly equipped: REWARD_RETIRED');

-- ---------------------------------------------------------------------------
-- 5. equip_profile_reward_v1 — success and state.
-- ---------------------------------------------------------------------------
select is(public.equip_profile_reward_v1('profile_icon', 1::smallint, 'icon_default_map') ->> 'ok',
          'true', 'equip a default icon');
select is((select count(*)::int from public.user_profile_equipment where user_id = pg_temp.uid(1) and slot = 'profile_icon'),
          1, 'icon slot holds one reward');
select is((public.equip_profile_reward_v1('profile_icon', null, 'icon_default_book') -> 'equipment' -> 0 ->> 'rewardId'),
          'icon_default_book', 'equipping another icon replaces it; null index means 1');
select is(public.equip_profile_reward_v1('title', 1::smallint, 'c1t_title_a') ->> 'ok', 'true', 'equip title');
select is(public.equip_profile_reward_v1('badge', 1::smallint, 'c1t_badge_a') ->> 'ok', 'true', 'equip badge 1');
select is(public.equip_profile_reward_v1('badge', 2::smallint, 'c1t_badge_b') ->> 'ok', 'true', 'equip badge 2');
select is(public.equip_profile_reward_v1('badge', 3::smallint, 'c1t_badge_c') ->> 'ok', 'true', 'equip badge 3');
select is(public.equip_profile_reward_v1('frame', 1::smallint, 'c1t_frame_a') ->> 'ok', 'true', 'equip frame');
select is(public.equip_profile_reward_v1('background', 1::smallint, 'c1t_bg_a') ->> 'ok', 'true', 'equip background');
select is(public.equip_profile_reward_v1('path_color', 1::smallint, 'c1t_path_a') ->> 'ok', 'true',
          'a match-expression slot is accepted too (9 slots)');

select is(jsonb_array_length(public.equip_profile_reward_v1('badge', 3::smallint, 'c1t_badge_c') -> 'equipment'),
          8, 'equip returns the full equipment state');

-- Moving badge A from 1 to 3 replaces C at 3 and empties 1.
select is((select array_agg(e ->> 'rewardId' order by (e ->> 'slotIndex')::int)
             from jsonb_array_elements(public.equip_profile_reward_v1('badge', 3::smallint, 'c1t_badge_a') -> 'equipment') e
            where e ->> 'slot' = 'badge'),
          array['c1t_badge_b', 'c1t_badge_a'], 'equipping an equipped badge elsewhere moves it');
select is((select count(*)::int from public.user_profile_equipment where user_id = pg_temp.uid(1) and reward_id = 'c1t_badge_a'),
          1, 'a reward sits in one place only');
select is(public.equip_profile_reward_v1('badge', 1::smallint, 'c1t_badge_c') ->> 'ok', 'true', 'refill badge 1');

-- Direct writes are not granted.
select throws_ok($$ insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
                    values (pg_temp.uid(1), 'badge', 1, 'c1t_badge_d') $$,
                 '42501', null, 'authenticated cannot write equipment directly');
select throws_ok($$ insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
                    values (pg_temp.uid(1), 'c1t_unowned', 'admin') $$,
                 '42501', null, 'authenticated cannot grant itself rewards');

-- ---------------------------------------------------------------------------
-- 6. RLS — inventory private, equipment public, retired hidden in catalog.
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.uid(2));
select is((select count(*)::int from public.user_reward_inventory where user_id = pg_temp.uid(1)),
          0, 'another user cannot read my inventory');
select is((select count(*)::int from public.user_reward_inventory where user_id = pg_temp.uid(2)),
          6, 'I can read my own inventory');
select is((select count(*)::int from public.user_profile_equipment where user_id = pg_temp.uid(1)),
          8, 'another user can read my equipment');
select is((select count(*)::int from public.reward_catalog where reward_id = 'c1t_badge_old'),
          0, 'retired rewards are hidden from the catalog');
select is((select count(*)::int from public.reward_catalog where reward_id = 'c1t_badge_a'),
          1, 'live rewards are readable');

set local role anon;
select throws_ok($$ select count(*) from public.reward_catalog $$, '42501', null, 'anon cannot read the catalog');
select throws_ok($$ select count(*) from public.user_profile_equipment $$, '42501', null, 'anon cannot read equipment');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_profile_card_v1 / get_profile_cards_v1 — C5 §2 shape.
-- ---------------------------------------------------------------------------
select is(public.get_profile_card_v1(pg_temp.uid(4)) ->> 'code', 'PROFILE_NOT_FOUND', 'no profile: PROFILE_NOT_FOUND');
select is(public.get_profile_card_v1(null) ->> 'code', 'PROFILE_NOT_FOUND', 'null id: PROFILE_NOT_FOUND');

select is((select array_agg(k order by k) from jsonb_object_keys(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card') k),
          array['background', 'badges', 'frame', 'icon', 'legacyImageUrl', 'level', 'nickname', 'source', 'title', 'userId'],
          'card has exactly the C5 §2 keys');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' ->> 'level',
          public.level_from_total_xp(1000)::text, 'card level comes from level_from_total_xp');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' ->> 'legacyImageUrl',
          'https://example.test/legacy.png', 'card keeps the legacy image url');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'icon' ->> 'assetRef',
          '/profile-icons/book.svg', 'card icon carries its asset_ref');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'title' ->> 'displayName',
          '테스트 칭호', 'card title carries its display name');
select is((select array_agg(b ->> 'rewardId' order by ord)
             from jsonb_array_elements(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'badges') with ordinality as t(b, ord)),
          array['c1t_badge_c', 'c1t_badge_b', 'c1t_badge_a'], 'badges come in slot_index order');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'frame' ->> 'rewardId', 'c1t_frame_a', 'card frame');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'background' ->> 'rewardId', 'c1t_bg_a', 'card background');
select ok(not (public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' ? 'pathColor'),
          'match-expression slots are not part of the card');
select is(public.get_profile_card_v1(pg_temp.uid(2)) -> 'card' -> 'badges', '[]'::jsonb, 'no badges: empty array');
select ok(public.get_profile_card_v1(pg_temp.uid(2)) -> 'card' -> 'icon' = 'null'::jsonb, 'no icon: null');

select is((select array_agg(k order by k)
             from jsonb_object_keys(public.get_profile_cards_v1(
               array[pg_temp.uid(1), pg_temp.uid(2), pg_temp.uid(1), pg_temp.uid(4), null]) -> 'cards') k),
          array[pg_temp.uid(1)::text, pg_temp.uid(2)::text], 'batch: dedupes, skips unknown and null ids');
select is(public.get_profile_cards_v1(array[]::uuid[]) -> 'cards', '{}'::jsonb, 'batch: empty input gives {}');
select is(public.get_profile_cards_v1(null) -> 'cards', '{}'::jsonb, 'batch: null input gives {}');
select is(public.get_profile_cards_v1((select array_agg(gen_random_uuid()) from generate_series(1, 101))) ->> 'code',
          'TOO_MANY_USERS', 'batch: more than 100 ids refused');
select is(public.get_profile_cards_v1(array[pg_temp.uid(1)]) -> 'cards' -> (pg_temp.uid(1)::text),
          public.get_profile_card_v1(pg_temp.uid(1)) -> 'card', 'single and batch give the same card');

-- ---------------------------------------------------------------------------
-- 8. Retire after equip stays equipped (decision ②); unequip; cascade.
-- ---------------------------------------------------------------------------
set local role postgres;
update public.reward_catalog set retired = true where reward_id = 'c1t_badge_b';
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(2));
select is((select b ->> 'retired'
             from jsonb_array_elements(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'badges') b
            where b ->> 'rewardId' = 'c1t_badge_b'),
          'true', 'a reward retired after equip still shows on another player''s card');

select pg_temp.act_as(pg_temp.uid(1));
select is(public.unequip_profile_reward_v1('badge', 2::smallint) ->> 'ok', 'true', 'unequip badge 2');
select is(public.unequip_profile_reward_v1('badge', 2::smallint) ->> 'code', 'SLOT_EMPTY', 'unequip empty slot: SLOT_EMPTY');
select is(public.equip_profile_reward_v1('badge', 2::smallint, 'c1t_badge_b') ->> 'code', 'REWARD_RETIRED',
          'once unequipped, the retired reward cannot come back');
select pg_temp.act_as(null);
select is(public.unequip_profile_reward_v1('title', 1::smallint) ->> 'code', 'AUTH_REQUIRED', 'unequip without a session');

set local role postgres;
delete from public.user_reward_inventory where user_id = pg_temp.uid(1) and reward_id = 'c1t_title_a';
select is((select count(*)::int from public.user_profile_equipment where user_id = pg_temp.uid(1) and slot = 'title'),
          0, 'revoking ownership removes the equipment (cascade)');

select * from finish();
rollback;
