-- Wiki Race 2.0 Track 16b-f contract tests: 1:1 and group cumulative evaluators count
-- only server-authoritative results (rooms with move events).
-- Run after 20261003090000_achievement_authority_filter_v1.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/achievement_authority_filter_v1.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- History is inserted directly (16b triggers fire on match_history inserts, as in production).
-- "legacy" = a result whose room has no game_move_events row (pre-authority shape).

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-0b1f-0000000000' || lpad(n::text, 2, '0'))::uuid, 'authenticated', 'authenticated',
       'af-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 12) as n
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
select ('00000000-0000-0000-0b1f-0000000000' || lpad(n::text, 2, '0'))::uuid, 'af-' || n, 'AF ' || n, 'af-' || n || '@local.test'
  from generate_series(1, 12) as n
on conflict (id) do nothing;

create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-0b1f-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

create function pg_temp.progress(p_user uuid, p_achievement text) returns bigint language sql
as $$ select coalesce((select current_value from public.user_achievement_progress
                        where user_id = p_user and achievement_id = p_achievement), 0) $$;

create function pg_temp.unlocks(p_user uuid, p_achievement text) returns integer language sql
as $$ select count(*)::integer from public.user_achievement_unlocks
       where user_id = p_user and achievement_id = p_achievement $$;

-- A finished non-item duel at p_at. p_events → one move event (authoritative); otherwise legacy.
create function pg_temp.match(p_winner uuid, p_loser uuid, p_at timestamptz, p_events boolean,
                              p_use_items boolean default false)
returns uuid language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players,
                                 use_items, game_starts_at, finished_at, finished_reason)
  values (v_room, 'AF' || substr(replace(v_room::text, '-', ''), 1, 8), p_winner, 'finished', 'duel', 2, 2,
          p_use_items, p_at - interval '1 minute', p_at, 'normal_finish');
  if p_events then
    insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
                                         event_type, from_page_id, to_page_id, move_delta, version_before, version_after,
                                         server_timestamp)
    values ('duel', v_room, p_winner, p_winner, gen_random_uuid(), gen_random_uuid(),
            'NORMAL_LINK', 'af-start', 'af-target', 1, 0, 1, p_at - interval '30 seconds');
  end if;
  insert into public.match_history (room_id, winner_user_id, loser_user_id, duration_seconds,
                                    result_status, result_reason, finalized_at)
  values (v_room, p_winner, p_loser, 60, 'completed', 'normal_finish', p_at);
  return v_room;
end;
$$;

-- A blocked attack consumed by p_defender's shield in p_room (the 완벽한 대응 attack branch).
create function pg_temp.blocked(p_room uuid, p_defender uuid, p_attacker uuid) returns void
language plpgsql as $$
declare
  v_shield_grant uuid := gen_random_uuid();
  v_attack_grant uuid := gen_random_uuid();
  v_shield uuid := gen_random_uuid();
begin
  insert into public.duel_item_grants (id, room_id, user_id, slot_index, slot_role, item_id)
  values (v_shield_grant, p_room, p_defender, 0,
          (select c.slot_role from private.duel_item_catalog_v3() c where c.item_id = 'cleanse_shield'), 'cleanse_shield'),
         (v_attack_grant, p_room, p_attacker, 0,
          (select c.slot_role from private.duel_item_catalog_v3() c where c.item_id = 'blind'), 'blind');
  insert into public.duel_item_events (id, room_id, grant_id, actor_user_id, target_user_id, item_id, result,
                                       effect_expires_at, request_id, correlation_id)
  values (v_shield, p_room, v_shield_grant, p_defender, p_defender, 'cleanse_shield', 'applied',
          now() + interval '8 seconds', gen_random_uuid(), gen_random_uuid());
  insert into public.duel_item_events (room_id, grant_id, actor_user_id, target_user_id, item_id, result,
                                       consumed_defense_event_id, request_id, correlation_id)
  values (p_room, v_attack_grant, p_attacker, p_defender, 'blind', 'blocked', v_shield,
          gen_random_uuid(), gen_random_uuid());
end;
$$;

-- A finished group room where p_user finished. p_events → one move event per finisher.
create function pg_temp.group_finish(p_user uuid, p_at timestamptz, p_events boolean) returns uuid
language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  insert into public.game_rooms (id, room_code, host_user_id, status, mode, min_players, max_players,
                                 use_items, finish_rank_limit, game_starts_at, finished_at, finished_reason)
  values (v_room, 'AG' || substr(replace(v_room::text, '-', ''), 1, 8), p_user, 'finished', 'group', 3, 8,
          false, 3, p_at - interval '10 minutes', p_at, 'all_resolved');
  insert into public.group_match_results (room_id, user_id, rank, is_winner, move_count, finished_at,
                                          result_status, finalized_at)
  values (v_room, p_user, 1, true, 2, p_at - interval '1 minute', 'finished', p_at);
  if p_events then
    insert into public.game_move_events (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
                                         event_type, from_page_id, to_page_id, move_delta, version_before, version_after,
                                         server_timestamp)
    values ('group', v_room, p_user, p_user, gen_random_uuid(), gen_random_uuid(),
            'NORMAL_LINK', 'af-start', 'af-target', 1, 0, 1, p_at - interval '1 minute');
  end if;
  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The production risk, reversed: 9 legacy wins, then one real win.
-- ---------------------------------------------------------------------------
select pg_temp.match(pg_temp.uid(1), pg_temp.uid(2), now() - interval '100 days' - d * interval '1 day', false)
  from generate_series(1, 9) as d;
select pg_temp.match(pg_temp.uid(1), pg_temp.uid(2), now() - interval '1 hour', true);

select is(pg_temp.progress(pg_temp.uid(1), 'duel_wins'), 1::bigint, 'wins: 9 legacy + 1 real → 1');
select is(pg_temp.progress(pg_temp.uid(1), 'duel_pure_wins'), 1::bigint, 'pure wins: legacy not counted');
select is(pg_temp.progress(pg_temp.uid(2), 'duel_normal_matches'), 1::bigint, 'matches (loser): legacy not counted');
select is(pg_temp.unlocks(pg_temp.uid(1), 'duel_wins') + pg_temp.unlocks(pg_temp.uid(1), 'duel_pure_wins')
          + pg_temp.unlocks(pg_temp.uid(1), 'duel_normal_matches') + pg_temp.unlocks(pg_temp.uid(2), 'duel_normal_matches'),
          0, 'no tier opens from legacy history (the 4 tiers 16b would have opened)');

-- ---------------------------------------------------------------------------
-- 2. Ten real wins still open tier 1 (boundary).
-- ---------------------------------------------------------------------------
select pg_temp.match(pg_temp.uid(3), pg_temp.uid(4), now() - d * interval '1 day', true)
  from generate_series(1, 10) as d;
select is(pg_temp.unlocks(pg_temp.uid(3), 'duel_wins'), 1, 'wins: 10 real → tier 1');
select is(pg_temp.unlocks(pg_temp.uid(3), 'duel_pure_wins'), 1, 'pure wins: 10 real non-item → tier 1');
select is(pg_temp.unlocks(pg_temp.uid(4), 'duel_normal_matches'), 1, 'matches: 10 real losses → tier 1');

-- ---------------------------------------------------------------------------
-- 3. The decay ordinal still counts legacy matches of the day (15c rule, unchanged):
--    five legacy matches today, then a real sixth → 0% → not counted.
-- ---------------------------------------------------------------------------
select pg_temp.match(pg_temp.uid(5), pg_temp.uid(6), now() - interval '1 second' * (10 - n), false)
  from generate_series(1, 5) as n;
select pg_temp.match(pg_temp.uid(5), pg_temp.uid(6), now(), true);
select is((select d.decay_reason from public.match_history m,
             private.duel_decay_v1(2, private.achievement_duel_ordinal_v1(m)) d
            where m.winner_user_id = pg_temp.uid(5) and m.finalized_at = now()),
          'duel_repeat_zero', 'decay: the real sixth match of the day is still 0%');
select is(pg_temp.progress(pg_temp.uid(5), 'duel_wins'), 0::bigint, 'wins: a 0% real match is excluded, legacy not counted');

-- ---------------------------------------------------------------------------
-- 4. 완벽한 대응: blocks in legacy rooms do not count; in real rooms they do.
-- ---------------------------------------------------------------------------
select pg_temp.blocked(r.room, pg_temp.uid(7), pg_temp.uid(8))
  from (select pg_temp.match(pg_temp.uid(7), pg_temp.uid(8), now() - interval '200 days' - d * interval '1 day', false) as room
          from generate_series(1, 10) as d) r;
select pg_temp.blocked(r.room, pg_temp.uid(7), pg_temp.uid(8))
  from (select pg_temp.match(pg_temp.uid(7), pg_temp.uid(8), now() - interval '2 hours', true) as room) r;
select public.evaluate_result_achievements_v1('duel',
         (select id from public.match_history where winner_user_id = pg_temp.uid(7) order by finalized_at desc limit 1));
select is(pg_temp.progress(pg_temp.uid(7), 'duel_perfect_defense'), 1::bigint, 'defense: 10 legacy blocks + 1 real → 1');
select is(pg_temp.unlocks(pg_temp.uid(7), 'duel_perfect_defense'), 0, 'defense: no tier from legacy blocks');

-- ---------------------------------------------------------------------------
-- 5. 함께하는 탐험: legacy group finishes do not count.
-- ---------------------------------------------------------------------------
select pg_temp.group_finish(pg_temp.uid(9), now() - interval '300 days' - d * interval '1 day', false)
  from generate_series(1, 10) as d;
select public.evaluate_result_achievements_v1('group', pg_temp.group_finish(pg_temp.uid(9), now() - interval '3 hours', true));
select is(pg_temp.progress(pg_temp.uid(9), 'group_normal_finishes'), 1::bigint, 'group finishes: 10 legacy + 1 real → 1');
select is(pg_temp.unlocks(pg_temp.uid(9), 'group_normal_finishes'), 0, 'group finishes: no tier from legacy rooms');

-- ---------------------------------------------------------------------------
-- 6. An unlock opened before the filter stays (16 §1 — no revocation).
-- ---------------------------------------------------------------------------
select private.unlock_achievement_v1(pg_temp.uid(10), 'duel_wins', 1::smallint, 'admin', null, now());
select pg_temp.match(pg_temp.uid(10), pg_temp.uid(11), now() - interval '4 hours', true);
select is(pg_temp.progress(pg_temp.uid(10), 'duel_wins'), 1::bigint, 'progress is recounted (1 real win)');
select is(pg_temp.unlocks(pg_temp.uid(10), 'duel_wins'), 1, 'the earlier tier-1 unlock stays');

-- ---------------------------------------------------------------------------
-- 7. Structure: the function is the 16b one plus the filter (text pinned by
--    tests/achievementAuthorityFilter.test.js), and triggers are unchanged.
-- ---------------------------------------------------------------------------
select ok(position('authority.game_id = counted.room_id' in pg_get_functiondef(
            'private.achievement_value_v1(public.achievement_definitions, uuid, text, uuid)'::regprocedure)) > 0,
          'installed body carries the authority filter');
select is((select count(*)::integer from pg_trigger where tgname like 'trg_record_%' and not tgisinternal), 4,
          'the four 16b triggers are unchanged');

select * from finish();
rollback;
