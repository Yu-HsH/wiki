-- Wiki Race 2.0 Track 16a contract tests: achievements and reward bundles.
-- Run after 20261002090000_achievements_rewards_v1.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/achievements_rewards_v1.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- Section 6 is the G5 negative suite: as `authenticated`, a hidden achievement
-- the reader has not unlocked must not surface by id, name, condition, reward or
-- count through any table, RPC, catalog row or function body.

begin;
create extension if not exists pgtap with schema extensions;
select plan(145);

set local role postgres;

-- U1..U3 have profiles. U4 is an auth user without a profile (guest boundary).
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-016a-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'ach-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 4) as n
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email, total_xp)
select ('00000000-0000-0000-016a-00000000000' || n)::uuid, 'ach-' || n, 'ACH ' || n, 'ach-' || n || '@local.test', 0
  from generate_series(1, 3) as n
on conflict (id) do nothing;

create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-016a-00000000000' || n)::uuid $$;

create function pg_temp.act_as(p_user uuid) returns void language sql
as $$ select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true); select null::void $$;

-- Result ids used as unlock sources.
create function pg_temp.src(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-016a-0000000000a' || n)::uuid $$;

-- Shared scratch for the role switches below (temp tables are owned by postgres).
create temporary table t_out (label text primary key, body jsonb);
grant select, insert, update on t_out to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Structure and ACL.
-- ---------------------------------------------------------------------------
select has_table('public', t, t || ' exists')
  from unnest(array['reward_bundles', 'reward_bundle_items', 'achievement_definitions', 'achievement_tiers',
                    'user_achievement_progress', 'user_achievement_unlocks', 'reward_grants',
                    'user_visited_documents']) as t;

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = any (array['reward_bundles', 'reward_bundle_items', 'achievement_definitions',
                                         'achievement_tiers', 'user_achievement_progress', 'user_achievement_unlocks',
                                         'reward_grants', 'user_visited_documents'])
              and c.relrowsecurity),
          8, 'RLS is on for all eight new tables');

select is((select count(*)::int from pg_policies
            where schemaname = 'public'
              and tablename = any (array['reward_bundles', 'reward_bundle_items', 'achievement_definitions',
                                         'achievement_tiers', 'user_achievement_progress', 'user_achievement_unlocks',
                                         'reward_grants', 'user_visited_documents'])),
          0, 'no policy on the new tables — reads are RPC-only (G5)');

select table_privs_are('public', t, 'authenticated', array[]::text[], t || ': authenticated has no privilege')
  from unnest(array['reward_bundles', 'reward_bundle_items', 'achievement_definitions', 'achievement_tiers',
                    'user_achievement_progress', 'user_achievement_unlocks', 'reward_grants',
                    'user_visited_documents']) as t;

select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and grantee = 'anon'
              and table_name = any (array['reward_bundles', 'reward_bundle_items', 'achievement_definitions',
                                          'achievement_tiers', 'user_achievement_progress', 'user_achievement_unlocks',
                                          'reward_grants', 'user_visited_documents'])),
          0, 'anon has no privilege on the new tables');

select col_is_pk('public', 'achievement_tiers', array['achievement_id', 'tier'], 'tiers PK is (achievement_id, tier)');
select col_is_pk('public', 'user_achievement_progress', array['user_id', 'achievement_id'], 'progress PK is (user_id, achievement_id)');
select col_is_pk('public', 'reward_bundle_items', array['reward_bundle_id', 'reward_id'], 'bundle items PK');
select col_is_pk('public', 'user_visited_documents', array['user_id', 'page_id'], 'visited PK is (user_id, page_id)');
select col_is_unique('public', 'user_achievement_unlocks', array['user_id', 'achievement_id', 'tier'], 'one unlock per (user, achievement, tier)');
select col_is_unique('public', 'reward_grants', array['user_id', 'reward_bundle_id', 'unlock_id'], 'one bundle grant per unlock');
select fk_ok('public', 'reward_grants', array['unlock_id', 'user_id'],
             'public', 'user_achievement_unlocks', array['id', 'user_id'],
             'a bundle grant belongs to its unlock''s own user');

-- C1 amendment (decision 1).
select has_column('public', 'reward_catalog', 'listed', 'reward_catalog.listed exists');
select col_default_is('public', 'reward_catalog', 'listed', 'true', 'listed defaults to true');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'reward_catalog'),
          1, 'reward_catalog keeps exactly one policy');
select ok((select qual from pg_policies where schemaname = 'public' and tablename = 'reward_catalog') ~ 'listed'
          and (select qual from pg_policies where schemaname = 'public' and tablename = 'reward_catalog') ~ 'user_reward_inventory',
          'catalog policy is retired=false and (listed or own inventory)');
select table_privs_are('public', 'reward_catalog', 'authenticated', array['SELECT'], 'catalog ACL unchanged: authenticated SELECT only');

-- RPC ACL.
select function_privs_are('public', 'get_my_achievements_v1', array[]::text[], 'anon', array[]::text[], 'get_my_achievements: anon cannot execute');
select function_privs_are('public', 'get_result_achievements_v1', array['text', 'uuid'], 'anon', array[]::text[], 'get_result_achievements: anon cannot execute');
select function_privs_are('public', 'mark_achievements_seen_v1', array['uuid[]'], 'anon', array[]::text[], 'mark_seen: anon cannot execute');
select function_privs_are('public', 'get_my_achievements_v1', array[]::text[], 'authenticated', array['EXECUTE'], 'get_my_achievements: authenticated executes');
select function_privs_are('public', 'get_result_achievements_v1', array['text', 'uuid'], 'authenticated', array['EXECUTE'], 'get_result_achievements: authenticated executes');
select function_privs_are('public', 'mark_achievements_seen_v1', array['uuid[]'], 'authenticated', array['EXECUTE'], 'mark_seen: authenticated executes');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('get_my_achievements_v1', 'get_result_achievements_v1', 'mark_achievements_seen_v1')
              and p.prosecdef and p.proconfig @> array['search_path=""']),
          3, 'the three readers are security definer with empty search_path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private'
              and p.proname in ('unlock_achievement_v1', 'apply_achievement_value_v1', 'achievement_card_v1',
                                'achievement_tier_rewards_v1', 'achievement_is_live_v1')
              and (has_function_privilege('authenticated', p.oid, 'execute')
                   or has_function_privilege('anon', p.oid, 'execute'))),
          0, 'private pipeline functions are not executable by authenticated or anon');
-- 16a itself is inert; since 16b the only callers are its four trg_record_* triggers.
select is((select count(*)::int from pg_trigger t
             join pg_proc p on p.oid = t.tgfoid
            where not t.tgisinternal
              and p.proname ~ 'achievement'
              and not (t.tgname like 'trg\_record\_%'
                       and p.proname = 'record_result_achievements_on_write_v1')),
          0, '16a is inert — no trigger other than 16b''s trg_record_* calls an achievement function');

-- ---------------------------------------------------------------------------
-- 2. Seed (16-HANDOFF.md §2·§3).
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.achievement_definitions), 23, '23 achievements seeded');
select is((select count(*)::int from public.achievement_definitions where not hidden), 13, '13 general');
select is((select count(*)::int from public.achievement_definitions where hidden), 10, '10 hidden');
select is((select count(*)::int from public.achievement_tiers), 39, '39 tiers');
select is((select count(*)::int from public.achievement_definitions where not active or retired), 0, 'every seeded achievement is live');
select is((select count(*)::int from public.achievement_definitions
            where achievement_id = any (array[
              'explore_random_finishes', 'explore_target_finishes', 'onboarding_all_modes', 'onboarding_tutorial',
              'hidden_redirect', 'hidden_swap_win', 'hidden_daily_same_moves', 'daily_all_clear',
              'onboarding_full_avatar'])),
          0, 'held, excluded and full_avatar ids are not seeded');
select is((select count(*)::int from public.achievement_tiers where reward_bundle_id is null), 0, 'every tier has a bundle');
select is((select count(*)::int from public.reward_bundles b
            where not exists (select 1 from public.reward_bundle_items i where i.reward_bundle_id = b.reward_bundle_id)),
          0, 'no empty bundle');
select is((select count(*)::int from public.reward_bundle_items), 44, '44 bundle items');
select is((select count(*)::int from public.reward_catalog where not listed), 15, '15 unlisted (hidden) rewards');
select is((select count(*)::int from public.reward_catalog where reward_id like 'icon_default_%' and listed), 6,
          'the six default icons stay listed');

-- Every reward of a hidden achievement is unlisted, and no unlisted reward sits in a general bundle.
select is((select count(*)::int
             from public.achievement_definitions d
             join public.achievement_tiers t using (achievement_id)
             join public.reward_bundle_items i on i.reward_bundle_id = t.reward_bundle_id
             join public.reward_catalog c on c.reward_id = i.reward_id
            where d.hidden and c.listed),
          0, 'hidden-achievement rewards are all unlisted');
select is((select count(*)::int
             from public.achievement_definitions d
             join public.achievement_tiers t using (achievement_id)
             join public.reward_bundle_items i on i.reward_bundle_id = t.reward_bundle_id
             join public.reward_catalog c on c.reward_id = i.reward_id
            where not d.hidden and not c.listed),
          0, 'general-achievement rewards are all listed');

-- XP rules: hidden kind fun/discovery/challenge = 30/60/120; tiered 30/60/120; single tier 30.
select is((select count(*)::int
             from public.achievement_definitions d join public.achievement_tiers t using (achievement_id)
            where d.hidden
              and t.xp <> case d.hidden_kind when 'fun' then 30 when 'discovery' then 60 else 120 end),
          0, 'hidden XP follows its kind');
select is((select count(*)::int from public.achievement_tiers t
            join public.achievement_definitions d using (achievement_id)
           where not d.hidden and t.xp <> (array[30, 60, 120])[t.tier]),
          0, 'general tiers pay 30 / 60 / 120 (single tier 30)');
select is((select count(*)::int from public.achievement_tiers a
            join public.achievement_tiers b on b.achievement_id = a.achievement_id and b.tier = a.tier + 1
           where b.threshold <= a.threshold),
          0, 'thresholds strictly increase per tier');
select is((select count(*)::int from public.achievement_definitions where hidden and retro_policy <> 'from_activation'),
          0, 'no hidden achievement is backfilled');
select is((select retro_policy from public.achievement_definitions where achievement_id = 'group_until_the_end'),
          'from_activation', 'until-the-end has no past evidence — not backfilled');

-- ---------------------------------------------------------------------------
-- 3. Grant pipeline.
-- ---------------------------------------------------------------------------
-- A jump to 600 crosses tiers 1 and 2 in one call (16 §8).
insert into t_out values ('apply_600',
  private.apply_achievement_value_v1(pg_temp.uid(1), 'explore_unique_documents', 600, null, 'single', pg_temp.src(1)));

select is((select (body->>'ok')::boolean from t_out where label = 'apply_600'), true, 'apply 600 ok');
select is((select jsonb_array_length(body->'unlocks') from t_out where label = 'apply_600'), 2, 'two tiers reached at once');
select is((select count(*)::int from public.user_achievement_unlocks
            where user_id = pg_temp.uid(1) and achievement_id = 'explore_unique_documents'),
          2, 'two unlock rows');
select is((select current_value from public.user_achievement_progress
            where user_id = pg_temp.uid(1) and achievement_id = 'explore_unique_documents'),
          600::bigint, 'progress holds the recounted value');
select is((select array_agg(reward_id order by reward_id) from public.user_reward_inventory
            where user_id = pg_temp.uid(1) and grant_source_type = 'reward_bundle'),
          array['frame_wide_world_1', 'frame_wide_world_2'], 'tier rewards are in the inventory');
select is((select count(*)::int from public.user_reward_inventory i
             join public.reward_grants g on g.id = i.grant_source_id
            where i.user_id = pg_temp.uid(1) and g.user_id = pg_temp.uid(1)),
          2, 'inventory grant_source_id points at the bundle grant');
select is((select array_agg(amount order by amount) from public.xp_ledger
            where user_id = pg_temp.uid(1) and source_type = 'achievement_unlock'),
          array[30, 60], 'XP 30 + 60 written to the ledger');
select is((select count(*)::int from public.xp_ledger
            where user_id = pg_temp.uid(1) and source_type = 'achievement_unlock' and xp_class <> 'achievement'),
          0, 'achievement XP is xp_class achievement — outside the weekly gameplay rule (C2 §2)');
select is((select count(*)::int from public.xp_ledger l
            where l.user_id = pg_temp.uid(1) and l.source_type = 'achievement_unlock'
              and not exists (select 1 from public.user_achievement_unlocks u where u.id = l.source_id)),
          0, 'ledger source_id is the unlock id');
select is((select total_xp from public.profiles where id = pg_temp.uid(1)), 90::bigint,
          'achievement XP counts toward total_xp (level)');

-- Replay: nothing new.
insert into t_out values ('apply_600_again',
  private.apply_achievement_value_v1(pg_temp.uid(1), 'explore_unique_documents', 600, null, 'single', pg_temp.src(1)));
select is((select count(*)::int from jsonb_array_elements((select body->'unlocks' from t_out where label = 'apply_600_again')) e
            where (e->>'unlocked')::boolean),
          0, 'replay unlocks nothing new');
select is((select count(*)::int from public.user_achievement_unlocks where user_id = pg_temp.uid(1)), 2, 'replay: still 2 unlocks');
select is((select count(*)::int from public.reward_grants where user_id = pg_temp.uid(1)), 2, 'replay: still 2 bundle grants');
select is((select count(*)::int from public.xp_ledger where user_id = pg_temp.uid(1)), 2, 'replay: still 2 ledger rows');
select is((select total_xp from public.profiles where id = pg_temp.uid(1)), 90::bigint, 'replay: total_xp unchanged');

-- Heal: a lost inventory row of an existing unlock comes back on the next call.
delete from public.user_reward_inventory where user_id = pg_temp.uid(1) and reward_id = 'frame_wide_world_1';
insert into t_out values ('heal',
  private.unlock_achievement_v1(pg_temp.uid(1), 'explore_unique_documents', 1::smallint, 'single', pg_temp.src(1)));
select is((select body->>'unlocked' from t_out where label = 'heal'), 'false', 'heal: not a new unlock');
select is((select body->'rewards_granted' from t_out where label = 'heal'), '["frame_wide_world_1"]'::jsonb,
          'heal: the missing reward is granted again');

-- Later tier from a different result.
insert into t_out values ('apply_2000',
  private.apply_achievement_value_v1(pg_temp.uid(1), 'explore_unique_documents', 2000, null, 'single', pg_temp.src(2)));
select is((select count(*)::int from public.user_achievement_unlocks
            where user_id = pg_temp.uid(1) and achievement_id = 'explore_unique_documents'), 3, 'tier 3 unlocked');
select is((select total_xp from public.profiles where id = pg_temp.uid(1)), 210::bigint, 'total 30 + 60 + 120');

-- Refusals.
select is(private.unlock_achievement_v1(pg_temp.uid(4), 'onboarding_first_finish', 1::smallint, 'single', pg_temp.src(3))->>'code',
          'AUTH_REQUIRED', 'guest (no profile) cannot unlock');
select is(private.apply_achievement_value_v1(null, 'onboarding_first_finish', 1, null, 'single', pg_temp.src(3))->>'code',
          'AUTH_REQUIRED', 'null user cannot unlock');
select is((select count(*)::int from public.user_achievement_unlocks where user_id = pg_temp.uid(4)), 0, 'no guest unlock row');
select is(private.unlock_achievement_v1(pg_temp.uid(2), 'no_such_achievement', 1::smallint, 'single', pg_temp.src(3))->>'code',
          'ACHIEVEMENT_NOT_FOUND', 'unknown achievement');
select is(private.unlock_achievement_v1(pg_temp.uid(2), 'onboarding_first_finish', 2::smallint, 'single', pg_temp.src(3))->>'code',
          'ACHIEVEMENT_TIER_INVALID', 'unknown tier');
select is(private.unlock_achievement_v1(pg_temp.uid(2), 'onboarding_first_finish', 1::smallint, 'single', null)->>'code',
          'ACHIEVEMENT_SOURCE_INVALID', 'a result scope needs a result id');
select is(private.unlock_achievement_v1(pg_temp.uid(2), 'onboarding_first_finish', 1::smallint, 'lobby', pg_temp.src(3))->>'code',
          'ACHIEVEMENT_SOURCE_INVALID', 'unknown source type');
select is(private.apply_achievement_value_v1(pg_temp.uid(2), 'explore_better_path', -1, null, 'single', pg_temp.src(3))->>'code',
          'ACHIEVEMENT_VALUE_INVALID', 'negative value refused');

-- active / retired / window (16 §8).
update public.achievement_definitions set active = false where achievement_id = 'duel_normal_matches';
select is(private.apply_achievement_value_v1(pg_temp.uid(2), 'duel_normal_matches', 10, null, 'duel', pg_temp.src(3))->>'code',
          'ACHIEVEMENT_INACTIVE', 'inactive achievement does not progress');
select is((select count(*)::int from public.user_achievement_progress where achievement_id = 'duel_normal_matches'), 0,
          'inactive: no progress row written');
update public.achievement_definitions set active = true, ends_at = now() - interval '1 minute',
                                          starts_at = now() - interval '1 day'
 where achievement_id = 'duel_normal_matches';
select is(private.unlock_achievement_v1(pg_temp.uid(2), 'duel_normal_matches', 1::smallint, 'duel', pg_temp.src(3))->>'code',
          'ACHIEVEMENT_INACTIVE', 'outside its window: refused');
update public.achievement_definitions set ends_at = null, starts_at = null where achievement_id = 'duel_normal_matches';

-- An already-earned unlock survives its definition going inactive.
update public.achievement_definitions set active = false where achievement_id = 'explore_unique_documents';
select is(private.unlock_achievement_v1(pg_temp.uid(1), 'explore_unique_documents', 1::smallint, 'single', pg_temp.src(1))->>'ok',
          'true', 'existing unlock still answers ok after deactivation');

-- A retired reward in a bundle is skipped; the rest of the bundle is granted.
update public.reward_catalog set retired = true where reward_id = 'badge_one_step_enough';
insert into t_out values ('hidden_u1',
  private.unlock_achievement_v1(pg_temp.uid(1), 'hidden_one_move', 1::smallint, 'single', pg_temp.src(1)));
select is((select body->'rewards_granted' from t_out where label = 'hidden_u1'), '["title_one_step_enough"]'::jsonb,
          'retired reward skipped, the other granted');
update public.reward_catalog set retired = false where reward_id = 'badge_one_step_enough';
insert into t_out values ('hidden_u1_heal',
  private.unlock_achievement_v1(pg_temp.uid(1), 'hidden_one_move', 1::smallint, 'single', pg_temp.src(1)));
select is((select body->'rewards_granted' from t_out where label = 'hidden_u1_heal'), '["badge_one_step_enough"]'::jsonb,
          'un-retired reward is granted on the next call');

-- U1 also discovers a second hidden achievement from another result.
select is(private.unlock_achievement_v1(pg_temp.uid(1), 'hidden_improve_one', 1::smallint, 'single', pg_temp.src(2))->>'unlocked',
          'true', 'second hidden unlock');

-- Direct writes are impossible for players.
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(2));
select throws_ok($$ insert into public.user_achievement_unlocks (user_id, achievement_id, tier, condition_version, source_type)
                    values (pg_temp.uid(2), 'onboarding_first_finish', 1, 1, 'admin') $$,
                 '42501', null, 'players cannot insert an unlock');
select throws_ok($$ insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
                    values (pg_temp.uid(2), 'title_one_step_enough', 'admin') $$,
                 '42501', null, 'players cannot grant themselves a hidden reward');
set local role postgres;

-- ---------------------------------------------------------------------------
-- 4. get_my_achievements_v1.
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(null);
select is(public.get_my_achievements_v1()->>'code', 'AUTH_REQUIRED', 'no session: AUTH_REQUIRED');
select pg_temp.act_as(pg_temp.uid(4));
select is(public.get_my_achievements_v1()->>'code', 'AUTH_REQUIRED', 'guest without profile: AUTH_REQUIRED');

select pg_temp.act_as(pg_temp.uid(1));
insert into t_out values ('my_u1', public.get_my_achievements_v1());
set local role postgres;

-- explore_unique_documents went inactive above but U1 earned it, so it still shows.
select is((select jsonb_array_length(body->'achievements') from t_out where label = 'my_u1'), 13,
          'U1 sees 13 general achievements (inactive but earned one included)');
select is((select e->>'unlockedTier' from t_out, jsonb_array_elements(body->'achievements') e
            where label = 'my_u1' and e->>'achievementId' = 'explore_unique_documents'),
          '3', 'unlocked tier 3');
select is((select e->>'current' from t_out, jsonb_array_elements(body->'achievements') e
            where label = 'my_u1' and e->>'achievementId' = 'explore_unique_documents'),
          '2000', 'current value shown');
select is((select e->'nextThreshold' from t_out, jsonb_array_elements(body->'achievements') e
            where label = 'my_u1' and e->>'achievementId' = 'explore_unique_documents'),
          'null'::jsonb, 'no next threshold after the last tier');
select is((select body->'hidden'->>'discovered' from t_out where label = 'my_u1'), '2', 'U1 discovered 2 hidden');
select is((select array_agg(e->>'achievementId' order by e->>'achievementId')
             from t_out, jsonb_array_elements(body->'hidden'->'achievements') e where label = 'my_u1'),
          array['hidden_improve_one', 'hidden_one_move'], 'U1 sees exactly its two hidden achievements');
select is((select (body->>'unseenCount')::int from t_out where label = 'my_u1'), 5, 'five unseen unlocks');
select is((select e->'tiers'->0->'rewards'->0->>'rewardId' from t_out, jsonb_array_elements(body->'achievements') e
            where label = 'my_u1' and e->>'achievementId' = 'onboarding_first_finish'),
          'badge_first_arrival', 'general achievements show their reward before it is earned');

-- An inactive achievement nobody earned is not listed.
update public.achievement_definitions set active = false where achievement_id = 'duel_normal_matches';
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(2));
insert into t_out values ('my_u2_inactive', public.get_my_achievements_v1());
set local role postgres;
select is((select count(*)::int from t_out, jsonb_array_elements(body->'achievements') e
            where label = 'my_u2_inactive' and e->>'achievementId' in ('duel_normal_matches', 'explore_unique_documents')),
          0, 'inactive and unearned: not listed');
update public.achievement_definitions set active = true where achievement_id in ('duel_normal_matches', 'explore_unique_documents');

-- ---------------------------------------------------------------------------
-- 5. get_result_achievements_v1 · mark_achievements_seen_v1 (G9).
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(1));
insert into t_out values ('result_src1', public.get_result_achievements_v1('single', pg_temp.src(1)));
insert into t_out values ('result_scope', public.get_result_achievements_v1('lobby', pg_temp.src(1)));
insert into t_out values ('result_null', public.get_result_achievements_v1('single', null));
insert into t_out values ('result_wrong_scope', public.get_result_achievements_v1('duel', pg_temp.src(1)));
select pg_temp.act_as(pg_temp.uid(2));
insert into t_out values ('result_src1_u2', public.get_result_achievements_v1('single', pg_temp.src(1)));
set local role postgres;

select is((select jsonb_array_length(body->'achievements') from t_out where label = 'result_src1'), 2,
          'result src1: two achievements (one hidden, one general)');
select is((select body->'achievements'->0->>'achievementId' from t_out where label = 'result_src1'), 'hidden_one_move',
          'hidden reveal comes first');
select is((select jsonb_array_length(body->'achievements'->1->'tiers') from t_out where label = 'result_src1'), 2,
          'tiers 1 and 2 of one achievement are grouped');
select is((select body->'achievements'->1->>'xpTotal' from t_out where label = 'result_src1'), '90',
          'grouped XP 30 + 60');
select is((select body->>'xpTotal' from t_out where label = 'result_src1'), '120', 'result XP total 30 + 60 + 30');
select is((select body->'achievements'->1->'tiers'->0->'xp'->>'amount' from t_out where label = 'result_src1'), '30',
          'tier XP is the ledger amount');
select is((select body->>'code' from t_out where label = 'result_scope'), 'RESULT_SCOPE_INVALID', 'unknown scope');
select is((select body->>'code' from t_out where label = 'result_null'), 'RESULT_ID_REQUIRED', 'null result id');
select is((select jsonb_array_length(body->'achievements') from t_out where label = 'result_wrong_scope'), 0,
          'same id under another scope returns nothing');
select is((select jsonb_array_length(body->'achievements') from t_out where label = 'result_src1_u2'), 0,
          'another user sees nothing of U1''s result');

-- U2 is handed U1's unlock ids (it could not read them itself).
insert into t_out values ('u1_unlock_ids',
  (select jsonb_agg(id) from public.user_achievement_unlocks where user_id = pg_temp.uid(1)));
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(2));
select is((public.mark_achievements_seen_v1(
            (select array_agg(e::uuid) from t_out, jsonb_array_elements_text(body) e where label = 'u1_unlock_ids')))->>'marked',
          '0', 'U2 cannot mark U1''s unlocks');
select pg_temp.act_as(pg_temp.uid(1));
select is((public.mark_achievements_seen_v1(array[
            ((select body->'achievements'->0->'tiers'->0->>'unlockId' from t_out where label = 'result_src1'))::uuid
          ]))->>'marked', '1', 'mark one unlock seen');
select is((public.mark_achievements_seen_v1())->>'marked', '4', 'mark the remaining four');
select is((public.get_my_achievements_v1())->>'unseenCount', '0', 'nothing unseen');
set local role postgres;

-- ---------------------------------------------------------------------------
-- 6. G5 — hidden achievements do not leak (decision 5, spec §9.2, 16 §7·§8).
-- ---------------------------------------------------------------------------
-- Every string that would identify a hidden achievement: ids, names, condition
-- texts, its reward ids and reward names.
create temporary table g5_terms (term text primary key);
insert into g5_terms
select achievement_id from public.achievement_definitions where hidden
union select display_name from public.achievement_definitions where hidden
union select condition_text from public.achievement_definitions where hidden
union select c.reward_id from public.reward_catalog c where not c.listed
union select c.display_name from public.reward_catalog c where not c.listed;
grant select on g5_terms to authenticated, anon;

-- Terms of the eight hidden achievements U1 has NOT unlocked (U1's own view).
create temporary table g5_terms_u1 (term text primary key);
insert into g5_terms_u1
select achievement_id from public.achievement_definitions
 where hidden and achievement_id not in ('hidden_one_move', 'hidden_improve_one')
union select display_name from public.achievement_definitions
 where hidden and achievement_id not in ('hidden_one_move', 'hidden_improve_one')
union select c.reward_id from public.reward_catalog c
  join public.reward_bundle_items i on i.reward_id = c.reward_id
  join public.achievement_tiers t on t.reward_bundle_id = i.reward_bundle_id
 where not c.listed and t.achievement_id not in ('hidden_one_move', 'hidden_improve_one');
grant select on g5_terms_u1 to authenticated;

-- 6.1 U2 has unlocked nothing hidden.
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(2));

select throws_ok(format('select * from public.%I', t), '42501', null, 'G5: ' || t || ' is not readable')
  from unnest(array['reward_bundles', 'reward_bundle_items', 'achievement_definitions', 'achievement_tiers',
                    'user_achievement_progress', 'user_achievement_unlocks', 'reward_grants',
                    'user_visited_documents']) as t;

select is((select count(*)::int from public.reward_catalog c where not c.listed), 0,
          'G5: no unlisted reward is visible in the catalog');
select is((select count(*)::int from public.reward_catalog c
            where exists (select 1 from g5_terms g where g.term in (c.reward_id, c.display_name))),
          0, 'G5: no catalog row carries a hidden term');
select is((select count(*)::int from public.user_reward_inventory), 6, 'G5: U2 reads only its own six default icons');

insert into t_out values ('g5_my', public.get_my_achievements_v1());
insert into t_out values ('g5_result', public.get_result_achievements_v1('single', pg_temp.src(1)));
insert into t_out values ('g5_card_self', public.get_profile_card_v1(pg_temp.uid(2)));
insert into t_out values ('g5_card_u1', public.get_profile_card_v1(pg_temp.uid(1)));
insert into t_out values ('g5_equip_hidden', public.equip_profile_reward_v1('title', 1::smallint, 'title_one_step_enough'));
insert into t_out values ('g5_equip_bogus', public.equip_profile_reward_v1('title', 1::smallint, 'title_no_such_reward'));

select is((select count(*)::int from t_out o, g5_terms g
            where o.label in ('g5_my', 'g5_result', 'g5_card_self', 'g5_card_u1') and strpos(o.body::text, g.term) > 0),
          0, 'G5: no hidden term in any reader output');
select is((select array_agg(k order by k) from t_out, jsonb_object_keys(body->'hidden') k where label = 'g5_my'),
          array['achievements', 'discovered'], 'G5: the hidden block has no total of any kind');
select is((select body->'hidden' from t_out where label = 'g5_my'), '{"discovered": 0, "achievements": []}'::jsonb,
          'G5: nothing discovered, nothing listed');
select is((select count(*)::int from t_out, jsonb_array_elements(body->'achievements') e
            where label = 'g5_my' and (e->>'hidden')::boolean),
          0, 'G5: no hidden card in the general list');
select is((select body->>'code' from t_out where label = 'g5_equip_hidden'),
          (select body->>'code' from t_out where label = 'g5_equip_bogus'),
          'G5: equipping an unowned hidden reward answers exactly like a nonexistent one');

-- anon cannot reach any of it.
set local role anon;
select throws_ok('select public.get_my_achievements_v1()', '42501', null, 'G5: anon cannot call the reader');
select throws_ok('select * from public.reward_catalog', '42501', null, 'G5: anon cannot read the catalog');

-- 6.2 U1 discovered two: it sees those, and still nothing of the other eight.
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(1));
insert into t_out values ('g5_my_u1', public.get_my_achievements_v1());
select is((select count(*)::int from public.reward_catalog c where not c.listed), 4,
          'G5: U1 sees exactly its four owned hidden rewards');
select is((select count(*)::int from t_out o, g5_terms_u1 g
            where o.label = 'g5_my_u1' and strpos(o.body::text, g.term) > 0),
          0, 'G5: U1''s view names none of the eight undiscovered hidden achievements');
select is((select count(*)::int from public.reward_catalog c
            where exists (select 1 from g5_terms_u1 g where g.term = c.reward_id)),
          0, 'G5: U1''s catalog shows no reward of an undiscovered hidden achievement');
set local role postgres;

-- 6.3 Nothing in the schema text carries a hidden term: function bodies,
-- comments, policies, column defaults.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace, g5_terms g
            where n.nspname in ('public', 'private') and strpos(p.prosrc, g.term) > 0),
          0, 'G5: no function body contains a hidden term');
select is((select count(*)::int from pg_description d, g5_terms g where strpos(d.description, g.term) > 0),
          0, 'G5: no object comment contains a hidden term');
select is((select count(*)::int from pg_policies p, g5_terms g
            where strpos(coalesce(p.qual, '') || coalesce(p.with_check, ''), g.term) > 0),
          0, 'G5: no policy contains a hidden term');
select is((select count(*)::int from pg_attrdef a, g5_terms g where strpos(pg_get_expr(a.adbin, a.adrelid), g.term) > 0),
          0, 'G5: no column default contains a hidden term');

-- 6.4 Equipping an earned hidden reward is allowed and intentionally public
-- afterwards (C1 §3.2: what you wear is display information).
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(1));
select is((public.equip_profile_reward_v1('title', 1::smallint, 'title_one_step_enough'))->>'ok', 'true',
          'the owner can equip an earned hidden title');
set local role postgres;

select * from finish();
rollback;
