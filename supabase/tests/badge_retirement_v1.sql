-- Wiki Race 2.0 Track 16d-2 contract tests: the badge reward kind is retired.
-- Run after 20261003100000_badge_retirement_v1.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/badge_retirement_v1.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- The data path (owned badges kept, badge-slot rows deleted) is checked on a pre-16d-2
-- database by scripts/16d-2-migration-local-check.mjs.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

set local role postgres;

-- ---------------------------------------------------------------------------
-- 1. Catalog — 11 former badges converted (16-HANDOFF §10.2), none left.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.reward_catalog where kind = 'badge'), 0, 'no badge rows remain');
select is((select count(*)::int from public.reward_catalog where reward_id like 'badge\_%' and kind = 'profile_icon'), 7,
          '7 former badges are profile icons');
select is((select count(*)::int from public.reward_catalog where reward_id like 'badge\_%' and kind = 'title'), 4,
          '4 former badges are titles');
select is((select array_agg(display_name order by reward_id) from public.reward_catalog
            where reward_id in ('badge_daily_explorer_1', 'badge_daily_explorer_2', 'badge_group_together_1', 'badge_group_together_2')),
          array['오늘도 탐험', '매일의 탐험가', '함께하는 탐험가', '함께하는 탐험'], 'converted display names (two invented, GAPS §4.5.1)');
select is((select count(*)::int from public.reward_catalog
            where reward_id like 'badge\_%' and kind = 'profile_icon' and asset_ref ~ '^/profile-icons/(x/[0-9a-f]{8}|[a-z-]+)\.svg$'),
          7, 'every converted icon points at an SVG under public/profile-icons');
select is((select count(*)::int from public.reward_catalog
            where reward_id like 'badge\_%' and kind = 'profile_icon' and listed = false and asset_ref like '/profile-icons/x/%'),
          4, 'hidden converted icons use opaque file names (16d 판정 5)');
select is((select count(*)::int from public.reward_catalog where reward_id like 'badge\_%' and kind = 'title' and asset_ref is not null),
          0, 'converted titles have no asset');

-- ---------------------------------------------------------------------------
-- 2. Tokens — 16-HANDOFF §10.4.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.reward_catalog where kind = 'frame' and asset_ref ~ '^frame:(tier-[123]|special)$'),
          (select count(*)::int from public.reward_catalog where kind = 'frame'), 'every frame carries a frame token');
select is((select asset_ref from public.reward_catalog where reward_id = 'frame_backlink_return'), 'frame:special', 'hidden frame is special');
select is((select count(*)::int from public.reward_catalog where kind = 'finish_effect' and asset_ref ~ '^finish:(tier-[123]|special)$'),
          (select count(*)::int from public.reward_catalog where kind = 'finish_effect'), 'every finish effect carries a token');
select is((select asset_ref from public.reward_catalog where reward_id = 'path_color_one_step'), 'path:purple',
          'path color uses a palette name');
select is((select count(*)::int from public.reward_catalog where reward_id in ('icon_daily_explorer', 'icon_dice_globe') and asset_ref like '/profile-icons/%.svg'),
          2, 'the two earned icons got their SVGs');

-- ---------------------------------------------------------------------------
-- 3. Structure — CHECKs, equipment, card.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.user_profile_equipment where slot = 'badge'), 0, 'no badge-slot equipment');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'reward_catalog_kind_check')) !~ 'badge',
          'kind CHECK has no badge');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'user_profile_equipment_slot_check')) !~ 'badge',
          'slot CHECK has no badge');
select is(pg_get_constraintdef((select oid from pg_constraint where conname = 'user_profile_equipment_slot_index_check')),
          'CHECK ((slot_index = 1))', 'slot_index is always 1');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-016d-00000000000' || n)::uuid, 'authenticated', 'authenticated', 'br-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 2) n;
insert into public.profiles (id, username, nickname, synthetic_email)
select ('00000000-0000-0000-016d-00000000000' || n)::uuid, 'br-' || n, 'BR ' || n, 'br-' || n || '@local.test'
  from generate_series(1, 2) n;
create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-016d-00000000000' || n)::uuid $$;
insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
values (pg_temp.uid(1), 'badge_first_arrival', 'admin'), (pg_temp.uid(1), 'badge_daily_explorer_1', 'admin'),
       (pg_temp.uid(2), 'badge_daily_explorer_1', 'admin'), (pg_temp.uid(2), 'frame_wide_world_1', 'admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.uid(1)::text, true);
select is(public.equip_profile_reward_v1('badge', 1::smallint, 'badge_first_arrival') ->> 'code', 'SLOT_KIND_MISMATCH',
          'the badge slot is gone for the RPC too');
select is(public.equip_profile_reward_v1('profile_icon', 2::smallint, 'badge_first_arrival') ->> 'code', 'SLOT_INDEX_INVALID',
          'index other than 1: SLOT_INDEX_INVALID');
select is(public.equip_profile_reward_v1('profile_icon', 1::smallint, 'badge_first_arrival') ->> 'ok', 'true',
          'a former badge equips as a profile icon');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'icon' ->> 'assetRef', '/profile-icons/first-arrival.svg',
          'the card shows it as the icon');
select is(public.get_profile_card_v1(pg_temp.uid(1)) -> 'card' -> 'badges', '[]'::jsonb, 'badges is a constant []');

-- ---------------------------------------------------------------------------
-- 4. 준비된 탐험가 — icon + title (condition_version 2).
-- ---------------------------------------------------------------------------
select public.equip_profile_reward_v1('title', 1::smallint, 'badge_daily_explorer_1');
select set_config('request.jwt.claim.sub', pg_temp.uid(2)::text, true);
select public.equip_profile_reward_v1('profile_icon', 1::smallint, 'icon_default_map');
select public.equip_profile_reward_v1('frame', 1::smallint, 'frame_wide_world_1');
set local role postgres;
select is((select condition_version from public.user_achievement_unlocks
            where user_id = pg_temp.uid(1) and achievement_id = 'onboarding_profile_complete'),
          2, 'icon + former-badge title unlocks 준비된 탐험가 under condition_version 2');
select is((select count(*)::int from public.user_achievement_unlocks
            where user_id = pg_temp.uid(2) and achievement_id = 'onboarding_profile_complete'),
          0, 'icon + frame does not (badge no longer counts, frame never did)');
select is((select params -> 'any_of' from public.achievement_definitions where achievement_id = 'onboarding_profile_complete'),
          '["title"]'::jsonb, 'definition any_of = ["title"]');

select * from finish();
rollback;
