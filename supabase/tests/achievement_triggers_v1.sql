-- Wiki Race 2.0 Track 16b contract tests: achievement evaluators and triggers.
-- Run after 20261002100000_achievement_triggers_v1.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/achievement_triggers_v1.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- Finishes go through the real move RPCs. History that needs earlier timestamps
-- (now() is frozen inside one transaction) is inserted directly: earlier single
-- completions, earlier matches, item events, and timestamps on move events.
-- Inserting those rows fires the same triggers, which is part of what is tested.

begin;
create extension if not exists pgtap with schema extensions;
select plan(128);

set local role postgres;

-- U1..U22 have profiles.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-016b-0000000000' || lpad(n::text, 2, '0'))::uuid, 'authenticated', 'authenticated',
       'tr-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 22) as n
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
select ('00000000-0000-0000-016b-0000000000' || lpad(n::text, 2, '0'))::uuid, 'tr-' || n, 'TR ' || n, 'tr-' || n || '@local.test'
  from generate_series(1, 22) as n
on conflict (id) do nothing;

-- Page graph. b16-s is the group start (four exits); b16-f is the duel start,
-- whose only non-target link is b16-1, so a forced or random move lands there.
-- b16-1 … b16-6 form a chain, each also linking to the target b16-t.
insert into public.wiki_pages(page_id, canonical_title)
select page_id, 'B16 ' || page_id
  from unnest(array['b16-s', 'b16-f', 'b16-1', 'b16-2', 'b16-3', 'b16-4', 'b16-5', 'b16-6',
                    'b16-t', 'b16-d', 'b16-x', 'b16-y', 'b16-z']) as page_id
on conflict (page_id) do nothing;

insert into public.wiki_page_snapshots(page_id, revision_id, canonical_title_snapshot)
select page_id, '1', 'B16 ' || page_id from public.wiki_pages where page_id like 'b16-%'
on conflict (page_id, revision_id) do nothing;

insert into public.wiki_snapshot_links(snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal)
select snapshot.id, link.to_page, '1', 'B16 ' || link.to_page, 'B16 ' || link.to_page, link.ord
  from (values
    ('b16-s', 'b16-t', 0), ('b16-s', 'b16-1', 1), ('b16-s', 'b16-2', 2), ('b16-s', 'b16-3', 3),
    ('b16-f', 'b16-t', 0), ('b16-f', 'b16-1', 1),
    ('b16-1', 'b16-t', 0), ('b16-1', 'b16-2', 1),
    ('b16-2', 'b16-t', 0), ('b16-2', 'b16-3', 1),
    ('b16-3', 'b16-t', 0), ('b16-3', 'b16-4', 1),
    ('b16-4', 'b16-t', 0), ('b16-4', 'b16-5', 1),
    ('b16-5', 'b16-t', 0), ('b16-5', 'b16-6', 1),
    ('b16-6', 'b16-t', 0)
  ) as link(from_page, to_page, ord)
  join public.wiki_page_snapshots snapshot on snapshot.page_id = link.from_page and snapshot.revision_id = '1'
on conflict (snapshot_id, target_page_id) do nothing;

-- ---------------------------------------------------------------------------
-- Fixture helpers (pg_temp — gone at session end).
-- ---------------------------------------------------------------------------
create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-016b-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

create function pg_temp.act_as(p_user uuid) returns void language sql
as $$ select set_config('request.jwt.claim.sub', p_user::text, true); select null::void $$;

create function pg_temp.unlocks(p_user uuid, p_achievement text) returns integer language sql
as $$ select count(*)::integer from public.user_achievement_unlocks
       where user_id = p_user and achievement_id = p_achievement $$;

create function pg_temp.unlock_of(p_user uuid, p_achievement text, p_tier integer default 1)
returns public.user_achievement_unlocks language sql
as $$ select * from public.user_achievement_unlocks
       where user_id = p_user and achievement_id = p_achievement and tier = p_tier $$;

create function pg_temp.progress(p_user uuid, p_achievement text) returns bigint language sql
as $$ select current_value from public.user_achievement_progress
       where user_id = p_user and achievement_id = p_achievement $$;

create function pg_temp.owns(p_user uuid, p_reward text) returns boolean language sql
as $$ select exists (select 1 from public.user_reward_inventory where user_id = p_user and reward_id = p_reward) $$;

create function pg_temp.ach_xp(p_user uuid) returns bigint language sql
as $$ select coalesce(sum(amount), 0) from public.xp_ledger
       where user_id = p_user and source_type = 'achievement_unlock' $$;

-- A real single run through apply_single_move_v2 along p_pages. Returns the
-- game_records id written by the completing move.
create function pg_temp.play_single(p_user uuid, p_pages text[]) returns uuid
language plpgsql as $$
declare
  v_run uuid := gen_random_uuid();
  v_i integer;
  v_response jsonb;
begin
  insert into public.single_game_runs (
    id, user_id, start_page_id, start_revision_id, start_title_snapshot,
    target_page_id, target_revision_id, target_title_snapshot,
    current_page_id, current_revision_id, current_title_snapshot,
    path_page_ids, path_revision_ids, path_title_snapshots
  ) values (
    v_run, p_user, p_pages[1], '1', 'B16 ' || p_pages[1],
    'b16-t', '1', 'B16 b16-t',
    p_pages[1], '1', 'B16 ' || p_pages[1],
    array[p_pages[1]], array['1'], array['B16 ' || p_pages[1]]
  );
  perform pg_temp.act_as(p_user);
  for v_i in 2 .. cardinality(p_pages) loop
    v_response := public.apply_single_move_v2(v_run, gen_random_uuid(), null, v_i - 2, p_pages[v_i]);
    if (v_response->>'ok')::boolean is not true then
      raise exception 'play_single failed at % : %', p_pages[v_i], v_response;
    end if;
  end loop;
  return (select id from public.game_records where run_id = v_run);
end;
$$;

-- An earlier server-authoritative single completion, inserted directly with its
-- completed run (the insert fires trg_record_single_result_achievements).
create function pg_temp.add_single(p_user uuid, p_target text, p_clicks integer,
                                   p_at timestamptz, p_path text[] default null)
returns uuid language plpgsql as $$
declare
  v_run uuid := gen_random_uuid();
  v_path text[] := coalesce(p_path, array['b16-s', p_target]);
  v_record uuid := gen_random_uuid();
begin
  insert into public.single_game_runs (
    id, user_id, status, start_page_id, start_revision_id, start_title_snapshot,
    target_page_id, target_revision_id, target_title_snapshot,
    current_page_id, current_revision_id, current_title_snapshot,
    move_count, path_page_ids, path_revision_ids, path_title_snapshots,
    started_at, finished_at, created_at
  ) values (
    v_run, p_user, 'completed', v_path[1], '1', 'B16 ' || v_path[1],
    p_target, '1', 'B16 ' || p_target,
    p_target, '1', 'B16 ' || p_target,
    p_clicks, v_path, array_fill('1'::text, array[cardinality(v_path)]),
    array(select 'B16 ' || p from unnest(v_path) p),
    p_at - interval '1 minute', p_at, p_at - interval '1 minute'
  );
  insert into public.game_records (
    id, run_id, user_id, player_name, start_title, target_title, elapsed_seconds,
    click_count, path_titles, start_page_id, target_page_id, start_revision_id,
    target_revision_id, result_status, created_at
  ) values (
    v_record, v_run, p_user, 'TR', 'B16 ' || v_path[1], 'B16 ' || p_target, 60,
    p_clicks, array(select 'B16 ' || p from unnest(v_path) p), v_path[1], p_target, '1',
    '1', 'completed', p_at
  );
  return v_record;
end;
$$;

-- A playing duel room: both players on p_start, both aiming at b16-t.
create function pg_temp.duel_room(p_a uuid, p_b uuid, p_start text default 'b16-f',
                                  p_use_items boolean default true)
returns uuid language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  insert into public.game_rooms (
    id, room_code, host_user_id, status, mode, min_players, max_players,
    use_items, reconnect_deadline_seconds, game_starts_at, started_at,
    duel_start_page_id, duel_start_revision_id, duel_start_title
  ) values (
    v_room, 'TR' || substr(replace(v_room::text, '-', ''), 1, 8), p_a, 'playing', 'duel', 2, 2,
    p_use_items, 60, now() - interval '5 minutes', now() - interval '5 minutes',
    p_start, '1', 'B16 ' || p_start
  );
  insert into public.room_players (
    room_id, user_id, role, nickname_snapshot, is_ready, player_status,
    start_title, target_title, current_title, path_titles,
    start_page_id, start_revision_id, target_page_id, target_revision_id,
    current_page_id, current_revision_id, path_page_ids, path_revision_ids, heartbeat_at
  )
  select v_room, player.user_id, player.role, 'TR', true, 'playing',
         'B16 ' || p_start, 'B16 b16-t', 'B16 ' || p_start, array['B16 ' || p_start],
         p_start, '1', 'b16-t', '1', p_start, '1', array[p_start], array['1'], now()
    from (values (p_a, 'host'), (p_b, 'guest')) as player(user_id, role);
  return v_room;
end;
$$;

-- A normal link move through apply_duel_move_v2 at the player's current version.
create function pg_temp.duel_move(p_room uuid, p_user uuid, p_page text) returns jsonb
language plpgsql as $$
declare
  v_response jsonb;
begin
  perform pg_temp.act_as(p_user);
  v_response := public.apply_duel_move_v2(
    p_room, gen_random_uuid(), null,
    (select progress_version from public.room_players where room_id = p_room and user_id = p_user),
    p_page);
  if (v_response->>'ok')::boolean is not true then
    raise exception 'duel_move failed to % : %', p_page, v_response;
  end if;
  return v_response;
end;
$$;

-- An item-driven move (FORCED_LINK / UNDO / RANDOM_TELEPORT) through the 14
-- helper. Returns the move event id.
create function pg_temp.duel_forced(p_room uuid, p_user uuid, p_type text) returns uuid
language plpgsql as $$
declare
  v_response jsonb := private.apply_duel_move_internal_v3(p_room, p_user, p_type, gen_random_uuid(), null, null);
begin
  if (v_response->>'ok')::boolean is not true then
    raise exception 'duel_forced % failed: %', p_type, v_response;
  end if;
  return (v_response->>'move_event_id')::uuid;
end;
$$;

-- One item-ledger row with its grant. Returns the item event id.
create function pg_temp.item(p_room uuid, p_actor uuid, p_target uuid, p_item text, p_result text,
                             p_defense uuid default null, p_move uuid default null)
returns uuid language plpgsql as $$
declare
  v_grant uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
begin
  insert into public.duel_item_grants (id, room_id, user_id, slot_index, slot_role, item_id)
  values (v_grant, p_room, p_actor,
          (select count(*) from public.duel_item_grants g where g.room_id = p_room and g.user_id = p_actor),
          (select c.slot_role from private.duel_item_catalog_v3() c where c.item_id = p_item), p_item);
  insert into public.duel_item_events (
    id, room_id, grant_id, actor_user_id, target_user_id, item_id, result,
    effect_expires_at, consumed_defense_event_id, request_id, correlation_id, move_event_id
  ) values (
    v_event, p_room, v_grant, p_actor, p_target, p_item, p_result,
    case when p_item in ('cleanse_shield', 'backlink_reflect') then now() + interval '8 seconds' end,
    p_defense, gen_random_uuid(), gen_random_uuid(), p_move
  );
  if p_move is not null then
    update public.game_move_events set item_event_id = v_event where id = p_move;
  end if;
  return v_event;
end;
$$;

create function pg_temp.match_of(p_room uuid) returns uuid language sql
as $$ select id from public.match_history where room_id = p_room $$;

-- An earlier finished duel of the pair at p_at. Returns the room id.
create function pg_temp.prior_room(p_winner uuid, p_loser uuid, p_at timestamptz,
                                   p_status text default 'completed', p_use_items boolean default false)
returns uuid language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  insert into public.game_rooms (
    id, room_code, host_user_id, status, mode, min_players, max_players,
    use_items, game_starts_at, finished_at, finished_reason
  ) values (
    v_room, 'TP' || substr(replace(v_room::text, '-', ''), 1, 8), p_winner, 'finished', 'duel', 2, 2,
    p_use_items, p_at - interval '1 minute', p_at,
    case p_status when 'completed' then 'normal_finish' else p_status end
  );
  insert into public.match_history (
    room_id, winner_user_id, loser_user_id, duration_seconds, result_status, result_reason, finalized_at
  ) values (
    v_room, p_winner, p_loser, 60, p_status,
    case p_status when 'completed' then 'normal_finish' else p_status end, p_at
  );
  return v_room;
end;
$$;

-- Last move event of a player in a game, re-stamped (now() is frozen).
create function pg_temp.stamp_last(p_game uuid, p_user uuid, p_at timestamptz) returns void
language sql as $$
  update public.game_move_events set server_timestamp = p_at
   where id = (select id from public.game_move_events
                where game_id = p_game and actor_user_id = p_user
                order by version_after desc limit 1)
$$;

-- A playing group room (first user is host), start b16-s, target b16-t.
create function pg_temp.group_room(p_users uuid[]) returns uuid
language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  insert into public.game_rooms (
    id, room_code, host_user_id, status, mode, min_players, max_players,
    use_items, finish_rank_limit, game_starts_at, game_deadline_at,
    group_start_page_id, group_start_revision_id, group_start_title,
    group_target_page_id, group_target_revision_id, group_target_title
  ) values (
    v_room, 'TG' || substr(replace(v_room::text, '-', ''), 1, 8), p_users[1], 'playing', 'group', 3, 8,
    false, 3, now() - interval '1 minute', now() + interval '1 hour',
    'b16-s', '1', 'B16 b16-s', 'b16-t', '1', 'B16 b16-t'
  );
  insert into public.room_players (
    room_id, user_id, role, nickname_snapshot, is_ready, player_status,
    start_title, target_title, current_title, path_titles,
    start_page_id, start_revision_id, target_page_id, target_revision_id,
    current_page_id, current_revision_id, path_page_ids, path_revision_ids, heartbeat_at
  )
  select v_room, member.user_id,
         case when member.ord = 1 then 'host' else 'guest' end,
         'TR', true, 'playing',
         'B16 b16-s', 'B16 b16-t', 'B16 b16-s', array['B16 b16-s'],
         'b16-s', '1', 'b16-t', '1', 'b16-s', '1', array['b16-s'], array['1'], now()
    from unnest(p_users) with ordinality as member(user_id, ord);
  return v_room;
end;
$$;

-- Moves along p_pages ('UNDO' undoes) through apply_group_move_v2.
create function pg_temp.group_walk(p_room uuid, p_user uuid, p_pages text[]) returns void
language plpgsql as $$
declare
  v_page text;
  v_response jsonb;
begin
  perform pg_temp.act_as(p_user);
  foreach v_page in array p_pages loop
    v_response := public.apply_group_move_v2(
      p_room, gen_random_uuid(), null,
      (select progress_version from public.room_players where room_id = p_room and user_id = p_user),
      case when v_page = 'UNDO' then null else v_page end,
      null, null, null,
      case when v_page = 'UNDO' then 'UNDO' else 'NORMAL_LINK' end);
    if (v_response->>'ok')::boolean is not true then
      raise exception 'group_walk failed at % : %', v_page, v_response;
    end if;
  end loop;
end;
$$;

create function pg_temp.group_leave(p_room uuid, p_user uuid) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as(p_user);
  perform public.leave_group_player(p_room, 'forfeited');
end;
$$;

-- Ranks 1..3 finished at base, base + d2, base + d3 milliseconds.
create function pg_temp.set_top3_times(p_room uuid, p_d2 integer, p_d3 integer) returns void
language sql as $$
  update public.group_match_results result
     set finished_at = now() - interval '30 seconds'
                       + (case result.rank when 2 then p_d2 when 3 then p_d3 else 0 end) * interval '1 millisecond'
   where result.room_id = p_room and result.rank between 1 and 3
$$;

create temp table t_ids (key text primary key, id uuid);
create temp table t_out (key text primary key, body jsonb);
grant select, insert on t_out to authenticated, service_role;
grant select on t_ids to authenticated, service_role;

/* ──────────────────────────────────────────────────────────────
 * 1. Structure and ACL.
 * ────────────────────────────────────────────────────────────── */
select is((select count(*)::int from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where not t.tgisinternal and t.tgname like 'trg\_record\_%'
              and p.proname = 'record_result_achievements_on_write_v1'),
          4, 'four trg_record_* triggers call the 16b trigger function');
select is((select array_agg(c.relname::text order by c.relname) from pg_trigger t join pg_class c on c.oid = t.tgrelid
            where t.tgname like 'trg\_record\_%'),
          array['game_records', 'game_rooms', 'match_history', 'user_profile_equipment'],
          'they watch the three result tables and equipment');
-- Same-event triggers fire in name order: 16b must follow 15c on every table.
select ok(every(t.tgname > other.tgname),
          'every trg_record_* sorts after the trg_grant_* on the same table')
  from pg_trigger t join pg_trigger other on other.tgrelid = t.tgrelid and other.tgname like 'trg\_grant\_%'
 where t.tgname like 'trg\_record\_%';
select function_privs_are('public', 'evaluate_result_achievements_v1', array['text', 'uuid'], 'anon', array[]::text[],
                          're-run RPC: anon cannot execute');
select function_privs_are('public', 'evaluate_result_achievements_v1', array['text', 'uuid'], 'authenticated', array[]::text[],
                          're-run RPC: authenticated cannot execute');
select function_privs_are('public', 'evaluate_result_achievements_v1', array['text', 'uuid'], 'service_role', array['EXECUTE'],
                          're-run RPC: service_role executes');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private'
              and (p.proname like 'achievement\_%' or p.proname like '%achievements%' or p.proname = 'evaluate_achievement_v1')
              and (has_function_privilege('authenticated', p.oid, 'execute')
                   or has_function_privilege('anon', p.oid, 'execute'))),
          0, 'no private 16b function is executable by authenticated or anon');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.user_achievement_marks'::regclass),
          'user_achievement_marks has RLS on');
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'user_achievement_marks'
              and grantee in ('anon', 'authenticated')),
          0, 'user_achievement_marks grants nothing to anon or authenticated');
-- G5: the evaluators are chosen by definitions.evaluator; no body names a hidden term.
select is((select count(*)::int
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
                  (select achievement_id as term from public.achievement_definitions where hidden
                   union select display_name from public.achievement_definitions where hidden
                   union select condition_text from public.achievement_definitions where hidden
                   union select reward_id from public.reward_catalog where not listed
                   union select display_name from public.reward_catalog where not listed) g
            where n.nspname in ('public', 'private') and strpos(p.prosrc, g.term) > 0),
          0, 'G5: no function body names a hidden achievement or reward');
select is((select count(*)::int from public.achievement_definitions
            where active and cardinality(private.achievement_evaluator_scopes_v1(evaluator)) = 0),
          0, 'every seeded definition has an evaluator that runs');

/* ──────────────────────────────────────────────────────────────
 * 2. Single — the local smoke and the single evaluators.
 * ────────────────────────────────────────────────────────────── */

-- 2.1 Smoke: U2's first real completion (2 moves) → 첫 도착 + 30 XP + badge.
insert into t_ids values ('s_u2', pg_temp.play_single(pg_temp.uid(2), array['b16-s', 'b16-1', 'b16-t']));
select is(pg_temp.unlocks(pg_temp.uid(2), 'onboarding_first_finish'), 1, 'smoke: first completion unlocks 첫 도착');
select is((pg_temp.unlock_of(pg_temp.uid(2), 'onboarding_first_finish')).source_type, 'single', 'smoke: source_type single');
select is((pg_temp.unlock_of(pg_temp.uid(2), 'onboarding_first_finish')).source_id, (select id from t_ids where key = 's_u2'),
          'smoke: source_id is the game_records id');
select ok(pg_temp.owns(pg_temp.uid(2), 'badge_first_arrival'), 'smoke: the badge is in the inventory');
select is((select amount from public.xp_ledger
            where source_type = 'achievement_unlock'
              and source_id = (pg_temp.unlock_of(pg_temp.uid(2), 'onboarding_first_finish')).id), 30,
          'smoke: +30 XP on the ledger for the unlock');
select is((select count(*)::int from public.xp_ledger where source_id = (select id from t_ids where key = 's_u2')), 1,
          'smoke: 15c result XP is still paid once');
select is(pg_temp.unlocks(pg_temp.uid(2), 'hidden_one_move'), 0, 'exact moves: 2 moves is not 1');

-- 2.2 U1: a 1-move completion also reveals the hidden one; the result reader leads with it.
insert into t_ids values ('s_u1', pg_temp.play_single(pg_temp.uid(1), array['b16-s', 'b16-t']));
select is(pg_temp.unlocks(pg_temp.uid(1), 'hidden_one_move'), 1, 'exact moves: 1 move unlocks');
select is((select count(*)::int from public.user_reward_inventory
            where user_id = pg_temp.uid(1) and reward_id in ('title_one_step_enough', 'badge_one_step_enough')), 2,
          'exact moves: both bundle rewards granted');
select pg_temp.act_as(pg_temp.uid(1));
set local role authenticated;
insert into t_out values ('r_u1', public.get_result_achievements_v1('single', (select id from t_ids where key = 's_u1')));
set local role postgres;
select is((select (body->'achievements'->0->>'hidden')::boolean from t_out where key = 'r_u1'), true,
          'result reader: the hidden unlock comes first');
select is((select (body->>'xpTotal')::int from t_out where key = 'r_u1'), 60, 'result reader: 30 + 30 achievement XP');

-- 2.3 Idempotent: a second identical completion unlocks nothing new.
select pg_temp.play_single(pg_temp.uid(1), array['b16-s', 'b16-t']);
select is((select count(*)::int from public.user_achievement_unlocks where user_id = pg_temp.uid(1)), 2,
          'repeat completion: still two unlocks');
select is(pg_temp.ach_xp(pg_temp.uid(1)), 60::bigint, 'repeat completion: no more achievement XP');

-- 2.4 더 나은 길: 10 → 9 → 8 → 7 → 6 is four improvements (8 again would not be one).
select pg_temp.add_single(pg_temp.uid(3), 'b16-t', c, now() - interval '400 days' + i * interval '1 hour')
  from unnest(array[10, 9, 9, 8, 7, 6]) with ordinality as x(c, i);
select is(pg_temp.progress(pg_temp.uid(3), 'explore_better_path'), 4::bigint, 'better path: four improvements counted');
select is(pg_temp.unlocks(pg_temp.uid(3), 'explore_better_path'), 0, 'better path: 4 < 5, nothing unlocked');
insert into t_ids values ('s_u3', pg_temp.play_single(pg_temp.uid(3), array['b16-s', 'b16-t']));
select is(pg_temp.progress(pg_temp.uid(3), 'explore_better_path'), 5::bigint, 'better path: 6 → 1 is the fifth');
select is(pg_temp.unlocks(pg_temp.uid(3), 'explore_better_path'), 1, 'better path: tier 1 at 5');
select ok(pg_temp.owns(pg_temp.uid(3), 'finish_better_path_1'), 'better path: tier 1 reward granted');
select is(pg_temp.unlocks(pg_temp.uid(3), 'hidden_improve_one'), 0, 'improve by one: 6 → 1 is five, not one');
-- Another course does not share the best.
select pg_temp.add_single(pg_temp.uid(3), 'b16-x', 9, now() - interval '30 minutes');
select is(pg_temp.progress(pg_temp.uid(3), 'explore_better_path'), 5::bigint, 'better path: per (start, target)');

-- 2.5 hidden_improve_one, and from_activation: 3 → 2 happened before activation.
select pg_temp.add_single(pg_temp.uid(4), 'b16-t', c, now() - interval '400 days' + i * interval '1 hour')
  from unnest(array[3, 2]) with ordinality as x(c, i);
select is(pg_temp.unlocks(pg_temp.uid(4), 'hidden_improve_one'), 0,
          'from_activation: an improvement by one dated before activation is not judged');
select is(pg_temp.progress(pg_temp.uid(4), 'explore_better_path'), 1::bigint,
          'retroactive counters still count that old improvement');
select pg_temp.play_single(pg_temp.uid(4), array['b16-s', 'b16-t']);
select is(pg_temp.unlocks(pg_temp.uid(4), 'hidden_improve_one'), 1, 'improve by one: 2 → 1 unlocks');

-- 2.6 hidden_disjoint_retry against the previous completion of the same course.
-- The history is dated milliseconds back so it is after activation even right
-- after a db reset (otherwise from_activation would skip it and the negatives
-- below would pass vacuously).
select ok((select created_at from public.achievement_definitions where achievement_id = 'hidden_disjoint_retry')
          < now() - interval '3 millisecond', 'disjoint retry: the fixtures below are after activation');
select pg_temp.add_single(pg_temp.uid(5), 'b16-t', 5, now() - interval '2 millisecond',
                          array['b16-s', 'b16-x', 'b16-y', 'b16-z', 'b16-d', 'b16-t']);
select is(pg_temp.unlocks(pg_temp.uid(5), 'hidden_disjoint_retry'), 0, 'disjoint retry: no previous completion yet');
select pg_temp.add_single(pg_temp.uid(5), 'b16-t', 5, now() - interval '1 millisecond',
                          array['b16-s', 'b16-1', 'b16-2', 'b16-3', 'b16-4', 'b16-t']);
select is(pg_temp.unlocks(pg_temp.uid(5), 'hidden_disjoint_retry'), 1, 'disjoint retry: 5 and 5 moves, no shared middle → unlock');
-- U6: shares one middle document → no; four moves → no.
select pg_temp.add_single(pg_temp.uid(6), 'b16-t', 5, now() - interval '3 millisecond',
                          array['b16-s', 'b16-x', 'b16-y', 'b16-z', 'b16-d', 'b16-t']);
select pg_temp.add_single(pg_temp.uid(6), 'b16-t', 5, now() - interval '2 millisecond',
                          array['b16-s', 'b16-1', 'b16-2', 'b16-z', 'b16-4', 'b16-t']);
select is(pg_temp.unlocks(pg_temp.uid(6), 'hidden_disjoint_retry'), 0, 'disjoint retry: one shared middle document → no');
select pg_temp.add_single(pg_temp.uid(6), 'b16-t', 4, now() - interval '1 millisecond',
                          array['b16-s', 'b16-x', 'b16-y', 'b16-d', 'b16-t']);
select is(pg_temp.unlocks(pg_temp.uid(6), 'hidden_disjoint_retry'), 0, 'disjoint retry: 4 moves is under 5 → no');

-- 2.7 오늘도 탐험 · 이어지는 발걸음: distinct KST days with that day's course.
delete from public.daily_challenges
 where challenge_date between (now() at time zone 'Asia/Seoul')::date - 20 and (now() at time zone 'Asia/Seoul')::date;
insert into public.daily_challenges (challenge_date, target_title)
select (now() at time zone 'Asia/Seoul')::date - d, 'B16 b16-d' from generate_series(0, 20) as d;
-- Days 1..9 back, plus a second completion on day 1 and a non-daily course.
select pg_temp.add_single(pg_temp.uid(7), 'b16-d', 3, now() - d * interval '1 day')
  from generate_series(1, 9) as d;
select pg_temp.add_single(pg_temp.uid(7), 'b16-d', 3, now() - interval '1 day' + interval '1 minute');
select pg_temp.add_single(pg_temp.uid(7), 'b16-t', 3, now() - interval '10 days');
select is(pg_temp.progress(pg_temp.uid(7), 'daily_course_finishes'), 9::bigint, 'daily days: 9 distinct days');
select is(pg_temp.progress(pg_temp.uid(7), 'daily_participation'), 9::bigint, 'daily days: both definitions read the same count');
select is(pg_temp.unlocks(pg_temp.uid(7), 'daily_participation'), 1, 'daily days: participation tier 1 at 7');
select is(pg_temp.unlocks(pg_temp.uid(7), 'daily_course_finishes'), 0, 'daily days: course finishes still under 10');
select pg_temp.add_single(pg_temp.uid(7), 'b16-d', 3, now());
select is(pg_temp.unlocks(pg_temp.uid(7), 'daily_course_finishes'), 1, 'daily days: tier 1 at the tenth day');
select ok(pg_temp.owns(pg_temp.uid(7), 'badge_daily_explorer_1'), 'daily days: its badge granted');

-- 2.8 넓어진 세계: one result crossing 100 and 500 unlocks both tiers at once.
insert into public.user_visited_documents (user_id, page_id, first_source_type)
select pg_temp.uid(8), 'seen-' || n, 'retro' from generate_series(1, 497) as n;
insert into t_ids values ('s_u8', pg_temp.play_single(pg_temp.uid(8), array['b16-s', 'b16-1', 'b16-t']));
select is(pg_temp.progress(pg_temp.uid(8), 'explore_unique_documents'), 500::bigint,
          'unique documents: start, middle and target are added (497 + 3)');
select is(pg_temp.unlocks(pg_temp.uid(8), 'explore_unique_documents'), 2, 'unique documents: tiers 1 and 2 in one result');
select is((select count(*)::int from public.user_achievement_unlocks
            where user_id = pg_temp.uid(8) and achievement_id = 'explore_unique_documents'
              and source_id = (select id from t_ids where key = 's_u8')), 2,
          'unique documents: both tiers carry this result as source');
select is((select sum(ledger.amount)::int from public.xp_ledger ledger
             join public.user_achievement_unlocks unlock on unlock.id = ledger.source_id
            where unlock.user_id = pg_temp.uid(8) and unlock.achievement_id = 'explore_unique_documents'), 90,
          'unique documents: 30 + 60 XP');
select pg_temp.play_single(pg_temp.uid(8), array['b16-s', 'b16-1', 'b16-t']);
select is(pg_temp.progress(pg_temp.uid(8), 'explore_unique_documents'), 500::bigint, 'unique documents: a document counts once');

/* ──────────────────────────────────────────────────────────────
 * 3. Duel — situational evaluators.
 * ────────────────────────────────────────────────────────────── */

-- 3.1 D1: U10 hits U9 with a forced link; U9 wins one move later.
insert into t_ids values ('d1', pg_temp.duel_room(pg_temp.uid(9), pg_temp.uid(10)));
select pg_temp.item((select id from t_ids where key = 'd1'), pg_temp.uid(10), pg_temp.uid(9), 'random_link_move', 'applied',
                    null, pg_temp.duel_forced((select id from t_ids where key = 'd1'), pg_temp.uid(9), 'FORCED_LINK'));
select pg_temp.duel_move((select id from t_ids where key = 'd1'), pg_temp.uid(9), 'b16-t');
select is(pg_temp.unlocks(pg_temp.uid(9), 'hidden_attack_helped'), 1, 'attack helped: win one move after the hit');
select is((pg_temp.unlock_of(pg_temp.uid(9), 'onboarding_first_finish')).source_id,
          pg_temp.match_of((select id from t_ids where key = 'd1')), 'first finish: a duel win, sourced to match_history.id');
select is(pg_temp.unlocks(pg_temp.uid(10), 'onboarding_first_finish'), 0, 'first finish: a duel loss is not a finish');

-- 3.2 D2: three moves after the hit → no.
insert into t_ids values ('d2', pg_temp.duel_room(pg_temp.uid(11), pg_temp.uid(12)));
select pg_temp.item((select id from t_ids where key = 'd2'), pg_temp.uid(12), pg_temp.uid(11), 'random_link_move', 'applied',
                    null, pg_temp.duel_forced((select id from t_ids where key = 'd2'), pg_temp.uid(11), 'FORCED_LINK'));
select pg_temp.duel_move((select id from t_ids where key = 'd2'), pg_temp.uid(11), p)
  from unnest(array['b16-2', 'b16-3', 'b16-t']) as p;
select is(pg_temp.unlocks(pg_temp.uid(11), 'hidden_attack_helped'), 0, 'attack helped: three moves after → no');

-- 3.3 D3: undo after the hit, then one move → no (되돌리기 없이).
insert into t_ids values ('d3', pg_temp.duel_room(pg_temp.uid(11), pg_temp.uid(9)));
select pg_temp.item((select id from t_ids where key = 'd3'), pg_temp.uid(9), pg_temp.uid(11), 'random_link_move', 'applied',
                    null, pg_temp.duel_forced((select id from t_ids where key = 'd3'), pg_temp.uid(11), 'FORCED_LINK'));
select pg_temp.duel_forced((select id from t_ids where key = 'd3'), pg_temp.uid(11), 'UNDO');
select pg_temp.duel_move((select id from t_ids where key = 'd3'), pg_temp.uid(11), 'b16-t');
select is(pg_temp.unlocks(pg_temp.uid(11), 'hidden_attack_helped'), 0, 'attack helped: an UNDO after the hit → no');

-- 3.4 D4: U11's own attack reflected by U12 lands on U11; U11 wins → no.
insert into t_ids values ('d4', pg_temp.duel_room(pg_temp.uid(11), pg_temp.uid(12)));
insert into t_ids values ('d4_shield', pg_temp.item((select id from t_ids where key = 'd4'), pg_temp.uid(12), pg_temp.uid(12),
                                                    'backlink_reflect', 'applied'));
select pg_temp.item((select id from t_ids where key = 'd4'), pg_temp.uid(11), pg_temp.uid(11), 'random_link_move', 'reflected',
                    (select id from t_ids where key = 'd4_shield'),
                    pg_temp.duel_forced((select id from t_ids where key = 'd4'), pg_temp.uid(11), 'FORCED_LINK'));
select pg_temp.duel_move((select id from t_ids where key = 'd4'), pg_temp.uid(11), 'b16-t');
select is(pg_temp.unlocks(pg_temp.uid(11), 'hidden_attack_helped'), 0, 'attack helped: a reflected own attack → no (§1.1)');
select is(pg_temp.unlocks(pg_temp.uid(12), 'hidden_return_to_sender'), 0, 'return to sender: reflected but lost → no');
select is(pg_temp.progress(pg_temp.uid(12), 'duel_perfect_defense'), 1::bigint, 'perfect defense: the reflection counts');

-- 3.5 D5: U10 reflects U9's blind and wins → return to sender.
insert into t_ids values ('d5', pg_temp.duel_room(pg_temp.uid(10), pg_temp.uid(9)));
insert into t_ids values ('d5_shield', pg_temp.item((select id from t_ids where key = 'd5'), pg_temp.uid(10), pg_temp.uid(10),
                                                    'backlink_reflect', 'applied'));
select pg_temp.item((select id from t_ids where key = 'd5'), pg_temp.uid(9), pg_temp.uid(9), 'blind', 'reflected',
                    (select id from t_ids where key = 'd5_shield'));
select pg_temp.duel_move((select id from t_ids where key = 'd5'), pg_temp.uid(10), 'b16-t');
select is(pg_temp.unlocks(pg_temp.uid(10), 'hidden_return_to_sender'), 1, 'return to sender: reflect then win → unlock');
select ok(pg_temp.owns(pg_temp.uid(10), 'frame_backlink_return'), 'return to sender: hidden frame granted');

-- 3.6 D6/D7: random teleport, then 5 direct links → yes; 6 → no.
insert into t_ids values ('d6', pg_temp.duel_room(pg_temp.uid(12), pg_temp.uid(10)));
select pg_temp.item((select id from t_ids where key = 'd6'), pg_temp.uid(12), pg_temp.uid(12), 'random_teleport', 'applied',
                    null, pg_temp.duel_forced((select id from t_ids where key = 'd6'), pg_temp.uid(12), 'RANDOM_TELEPORT'));
select pg_temp.duel_move((select id from t_ids where key = 'd6'), pg_temp.uid(12), p)
  from unnest(array['b16-2', 'b16-3', 'b16-4', 'b16-5', 'b16-t']) as p;
select is(pg_temp.unlocks(pg_temp.uid(12), 'hidden_random_win'), 1, 'random win: five direct links after → unlock');
insert into t_ids values ('d7', pg_temp.duel_room(pg_temp.uid(11), pg_temp.uid(9)));
select pg_temp.item((select id from t_ids where key = 'd7'), pg_temp.uid(11), pg_temp.uid(11), 'random_teleport', 'applied',
                    null, pg_temp.duel_forced((select id from t_ids where key = 'd7'), pg_temp.uid(11), 'RANDOM_TELEPORT'));
select pg_temp.duel_move((select id from t_ids where key = 'd7'), pg_temp.uid(11), p)
  from unnest(array['b16-2', 'b16-3', 'b16-4', 'b16-5', 'b16-6', 'b16-t']) as p;
select is(pg_temp.unlocks(pg_temp.uid(11), 'hidden_random_win'), 0, 'random win: six direct links after → no');

-- 3.7 D8: both stand on b16-2 at overlapping times → both unlock.
insert into t_ids values ('d8', pg_temp.duel_room(pg_temp.uid(9), pg_temp.uid(12)));
select pg_temp.duel_move((select id from t_ids where key = 'd8'), pg_temp.uid(9), 'b16-1');
select pg_temp.stamp_last((select id from t_ids where key = 'd8'), pg_temp.uid(9), now() - interval '50 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd8'), pg_temp.uid(9), 'b16-2');
select pg_temp.stamp_last((select id from t_ids where key = 'd8'), pg_temp.uid(9), now() - interval '40 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd8'), pg_temp.uid(12), 'b16-1');
select pg_temp.stamp_last((select id from t_ids where key = 'd8'), pg_temp.uid(12), now() - interval '30 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd8'), pg_temp.uid(12), 'b16-2');
select pg_temp.stamp_last((select id from t_ids where key = 'd8'), pg_temp.uid(12), now() - interval '20 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd8'), pg_temp.uid(9), 'b16-t');
select is(pg_temp.unlocks(pg_temp.uid(9), 'hidden_same_document'), 1, 'same document: the winner unlocks');
select is(pg_temp.unlocks(pg_temp.uid(12), 'hidden_same_document'), 1, 'same document: the loser unlocks too');

-- 3.8 D9: the same documents at different times → no.
insert into t_ids values ('d9', pg_temp.duel_room(pg_temp.uid(10), pg_temp.uid(11)));
select pg_temp.duel_move((select id from t_ids where key = 'd9'), pg_temp.uid(10), 'b16-1');
select pg_temp.stamp_last((select id from t_ids where key = 'd9'), pg_temp.uid(10), now() - interval '50 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd9'), pg_temp.uid(10), 'b16-2');
select pg_temp.stamp_last((select id from t_ids where key = 'd9'), pg_temp.uid(10), now() - interval '45 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd9'), pg_temp.uid(10), 'b16-3');
select pg_temp.stamp_last((select id from t_ids where key = 'd9'), pg_temp.uid(10), now() - interval '40 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd9'), pg_temp.uid(11), 'b16-1');
select pg_temp.stamp_last((select id from t_ids where key = 'd9'), pg_temp.uid(11), now() - interval '30 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd9'), pg_temp.uid(11), 'b16-2');
select pg_temp.stamp_last((select id from t_ids where key = 'd9'), pg_temp.uid(11), now() - interval '20 seconds');
select pg_temp.duel_move((select id from t_ids where key = 'd9'), pg_temp.uid(10), 'b16-t');
select is(pg_temp.unlocks(pg_temp.uid(10), 'hidden_same_document') + pg_temp.unlocks(pg_temp.uid(11), 'hidden_same_document'), 0,
          'same document: one after the other → no');

/* ──────────────────────────────────────────────────────────────
 * 4. Duel — cumulative evaluators.
 * ────────────────────────────────────────────────────────────── */

-- 4.1 U13 beats U14 nine times on nine earlier days (non-item rooms).
select pg_temp.prior_room(pg_temp.uid(13), pg_temp.uid(14), now() - d * interval '1 day') from generate_series(1, 9) as d;
select is(pg_temp.progress(pg_temp.uid(14), 'duel_normal_matches'), 9::bigint, 'normal matches: losses count');
select is(pg_temp.unlocks(pg_temp.uid(13), 'duel_wins'), 0, 'wins: 9 < 10');
insert into t_ids values ('d10', pg_temp.duel_room(pg_temp.uid(13), pg_temp.uid(14), 'b16-f', false));
select pg_temp.duel_move((select id from t_ids where key = 'd10'), pg_temp.uid(13), 'b16-t');
select is(pg_temp.unlocks(pg_temp.uid(13), 'duel_normal_matches') + pg_temp.unlocks(pg_temp.uid(14), 'duel_normal_matches'), 2,
          'normal matches: both players reach 10');
select is(pg_temp.unlocks(pg_temp.uid(13), 'duel_wins'), 1, 'wins: tier 1 at 10');
select is(pg_temp.unlocks(pg_temp.uid(13), 'duel_pure_wins'), 1, 'pure wins: tier 1 at 10 non-item wins');
select ok(pg_temp.owns(pg_temp.uid(13), 'title_duel_victor_1') and pg_temp.owns(pg_temp.uid(13), 'badge_duel_pure'),
          'wins: both rewards granted');

-- 4.2 A forfeit win and an item-room win.
insert into t_ids values ('d11', pg_temp.duel_room(pg_temp.uid(13), pg_temp.uid(14)));
select pg_temp.act_as(pg_temp.uid(13));
select public.leave_duel_room_v2((select id from t_ids where key = 'd11'), gen_random_uuid());
select is(pg_temp.progress(pg_temp.uid(14), 'duel_wins'), 0::bigint, 'wins: a forfeit win is excluded (§1.1)');
select is(pg_temp.progress(pg_temp.uid(14), 'duel_normal_matches'), 10::bigint, 'normal matches: a forfeit is excluded');
insert into t_ids values ('d12', pg_temp.duel_room(pg_temp.uid(13), pg_temp.uid(14), 'b16-f', true));
select pg_temp.duel_move((select id from t_ids where key = 'd12'), pg_temp.uid(13), 'b16-t');
select is(pg_temp.progress(pg_temp.uid(13), 'duel_wins'), 11::bigint, 'wins: an item-room win counts');
select is(pg_temp.progress(pg_temp.uid(13), 'duel_pure_wins'), 10::bigint, 'pure wins: an item-room win does not');

-- 4.3 Decay: six completed matches of one pair today → the sixth is 0% and excluded.
select pg_temp.prior_room(pg_temp.uid(17), pg_temp.uid(18), now() - interval '1 second' * (7 - n))
  from generate_series(1, 6) as n;
select is(pg_temp.progress(pg_temp.uid(18), 'duel_normal_matches'), 5::bigint, 'normal matches: the 0% repeat is excluded');
select is(pg_temp.progress(pg_temp.uid(17), 'duel_wins'), 5::bigint, 'wins: the 0% repeat is excluded');
-- 4.4 A cancelled match is never evaluated.
insert into t_ids values ('d_cancel', pg_temp.prior_room(pg_temp.uid(17), pg_temp.uid(18), now(), 'cancelled'));
select is(pg_temp.progress(pg_temp.uid(18), 'duel_normal_matches'), 5::bigint, 'cancelled: nothing moves');

-- 4.5 완벽한 대응 for U15: eight earlier shield blocks, one in a cancelled match,
-- one go_back that undid its own move; then a block and a go_back-undid-attack.
select pg_temp.item(r.room, pg_temp.uid(16), pg_temp.uid(15), 'blind', 'blocked',
                    pg_temp.item(r.room, pg_temp.uid(15), pg_temp.uid(15), 'cleanse_shield', 'applied'))
  from (select pg_temp.prior_room(pg_temp.uid(15), pg_temp.uid(16), now() - d * interval '1 day') as room
          from generate_series(1, 8) as d) r;
select pg_temp.item(r.room, pg_temp.uid(16), pg_temp.uid(15), 'blind', 'blocked',
                    pg_temp.item(r.room, pg_temp.uid(15), pg_temp.uid(15), 'cleanse_shield', 'applied'))
  from (select pg_temp.prior_room(pg_temp.uid(15), pg_temp.uid(16), now() - interval '20 days', 'cancelled') as room) r;
insert into t_ids values ('d_own', pg_temp.prior_room(pg_temp.uid(15), pg_temp.uid(16), now() - interval '21 days'));
insert into public.game_move_events (id, scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
                                     event_type, from_page_id, to_page_id, move_delta, version_before, version_after,
                                     undone_event_id)
values
  ('00000000-0000-0000-016b-00000000e001', 'duel', (select id from t_ids where key = 'd_own'), pg_temp.uid(15), pg_temp.uid(15),
   gen_random_uuid(), gen_random_uuid(), 'NORMAL_LINK', 'b16-f', 'b16-1', 1, 0, 1, null),
  ('00000000-0000-0000-016b-00000000e002', 'duel', (select id from t_ids where key = 'd_own'), pg_temp.uid(15), pg_temp.uid(15),
   gen_random_uuid(), gen_random_uuid(), 'UNDO', 'b16-1', 'b16-f', 1, 1, 2, '00000000-0000-0000-016b-00000000e001');
select pg_temp.item((select id from t_ids where key = 'd_own'), pg_temp.uid(15), pg_temp.uid(15), 'go_back', 'applied',
                    null, '00000000-0000-0000-016b-00000000e002');
insert into t_ids values ('d13', pg_temp.duel_room(pg_temp.uid(15), pg_temp.uid(16)));
select pg_temp.item((select id from t_ids where key = 'd13'), pg_temp.uid(16), pg_temp.uid(15), 'blind', 'blocked',
                    pg_temp.item((select id from t_ids where key = 'd13'), pg_temp.uid(15), pg_temp.uid(15), 'cleanse_shield', 'applied'));
select pg_temp.item((select id from t_ids where key = 'd13'), pg_temp.uid(16), pg_temp.uid(15), 'random_link_move', 'applied',
                    null, pg_temp.duel_forced((select id from t_ids where key = 'd13'), pg_temp.uid(15), 'FORCED_LINK'));
select pg_temp.item((select id from t_ids where key = 'd13'), pg_temp.uid(15), pg_temp.uid(15), 'go_back', 'applied',
                    null, pg_temp.duel_forced((select id from t_ids where key = 'd13'), pg_temp.uid(15), 'UNDO'));
select pg_temp.duel_move((select id from t_ids where key = 'd13'), pg_temp.uid(15), 'b16-t');
select is(pg_temp.progress(pg_temp.uid(15), 'duel_perfect_defense'), 10::bigint,
          'perfect defense: 8 + block + undone attack = 10 (cancelled and own-move undo excluded)');
select is(pg_temp.unlocks(pg_temp.uid(15), 'duel_perfect_defense'), 1, 'perfect defense: tier 1 at 10');

/* ──────────────────────────────────────────────────────────────
 * 5. Group.
 * ────────────────────────────────────────────────────────────── */

-- 5.1 Eight players: U1..U7 finish directly, U2 leaves after finishing, U8 forfeits.
-- U1 and U4 finished well before the close; U3 finished in the closing instant.
insert into t_ids values ('g8', pg_temp.group_room(array(select pg_temp.uid(n) from generate_series(1, 8) as n)));
select pg_temp.group_walk((select id from t_ids where key = 'g8'), pg_temp.uid(n), array['b16-t']) from generate_series(1, 7) as n;
select pg_temp.group_leave((select id from t_ids where key = 'g8'), pg_temp.uid(2));
update public.room_players set finished_at = now() - interval '30 seconds'
 where room_id = (select id from t_ids where key = 'g8') and user_id in (pg_temp.uid(1), pg_temp.uid(4));
insert into public.user_achievement_marks (user_id, achievement_id, source_type, source_id)
select pg_temp.uid(1), 'group_until_the_end', 'group', gen_random_uuid() from generate_series(1, 9);
select is(pg_temp.unlocks(pg_temp.uid(1), 'group_party_of_eight'), 0, 'party: nothing before the room closes');
select pg_temp.group_leave((select id from t_ids where key = 'g8'), pg_temp.uid(8));
select is((select status from public.game_rooms where id = (select id from t_ids where key = 'g8')), 'finished',
          'group: the room closed');
select is((select count(*)::int from public.user_achievement_unlocks
            where achievement_id = 'group_party_of_eight' and source_id = (select id from t_ids where key = 'g8')), 7,
          'party: the seven finishers of an eight-row room unlock');
select is(pg_temp.unlocks(pg_temp.uid(8), 'group_party_of_eight'), 0, 'party: the forfeiter does not');
select is(pg_temp.unlocks(pg_temp.uid(2), 'group_party_of_eight'), 1, 'party: a finisher who left still does (result rows)');
select is(pg_temp.progress(pg_temp.uid(1), 'group_normal_finishes'), 1::bigint, 'group finishes: counted');
select is(pg_temp.progress(pg_temp.uid(8), 'group_normal_finishes'), 0::bigint, 'group finishes: a forfeit is not');
select is(pg_temp.unlocks(pg_temp.uid(1), 'group_until_the_end'), 1, 'until the end: the tenth mark unlocks');
select is(pg_temp.progress(pg_temp.uid(4), 'group_until_the_end'), 1::bigint, 'until the end: U4 stayed finished → 1');
select is(pg_temp.progress(pg_temp.uid(2), 'group_until_the_end'), 0::bigint, 'until the end: left the room → 0');
select is(pg_temp.progress(pg_temp.uid(3), 'group_until_the_end'), 0::bigint, 'until the end: finished in the closing instant → 0');
select is((select count(*)::int from public.user_achievement_unlocks
            where achievement_id = 'hidden_same_group_path' and source_id = (select id from t_ids where key = 'g8')), 7,
          'same path: every direct finisher matches another');
select is((select count(*)::int from public.user_achievement_unlocks
            where achievement_id = 'hidden_three_disjoint' and source_id = (select id from t_ids where key = 'g8')), 0,
          'top3 disjoint: no middle documents → no');

-- 5.2 G3: shared middle, rank 3 at +1001 ms → none of the three group hidden ones.
insert into t_ids values ('g3', pg_temp.group_room(array[pg_temp.uid(9), pg_temp.uid(10), pg_temp.uid(11), pg_temp.uid(12)]));
select pg_temp.group_walk((select id from t_ids where key = 'g3'), pg_temp.uid(9), array['b16-1', 'b16-t']);
select pg_temp.group_walk((select id from t_ids where key = 'g3'), pg_temp.uid(10), array['b16-1', 'b16-2', 'b16-t']);
select pg_temp.group_walk((select id from t_ids where key = 'g3'), pg_temp.uid(11), array['b16-3', 'b16-t']);
select pg_temp.set_top3_times((select id from t_ids where key = 'g3'), 500, 1001);
select pg_temp.group_leave((select id from t_ids where key = 'g3'), pg_temp.uid(12));
select is((select count(*)::int from public.user_achievement_unlocks
            where achievement_id in ('hidden_same_group_path', 'hidden_three_disjoint', 'hidden_three_close')
              and user_id in (pg_temp.uid(9), pg_temp.uid(10), pg_temp.uid(11), pg_temp.uid(12))), 0,
          'G3: shared b16-1 and a 1001 ms spread unlock nothing');

-- 5.3 G4: U10 walks 1 → 2, undoes, finishes — its replayed path equals U9's.
insert into t_ids values ('g4', pg_temp.group_room(array[pg_temp.uid(9), pg_temp.uid(10), pg_temp.uid(11), pg_temp.uid(12)]));
select pg_temp.group_walk((select id from t_ids where key = 'g4'), pg_temp.uid(9), array['b16-1', 'b16-t']);
select pg_temp.group_walk((select id from t_ids where key = 'g4'), pg_temp.uid(10), array['b16-1', 'b16-2', 'UNDO', 'b16-t']);
select pg_temp.group_walk((select id from t_ids where key = 'g4'), pg_temp.uid(11), array['b16-3', 'b16-t']);
select pg_temp.set_top3_times((select id from t_ids where key = 'g4'), 500, 2000);
select pg_temp.group_leave((select id from t_ids where key = 'g4'), pg_temp.uid(12));
select is(pg_temp.unlocks(pg_temp.uid(9), 'hidden_same_group_path') + pg_temp.unlocks(pg_temp.uid(10), 'hidden_same_group_path'), 2,
          'same path: the UNDO is replayed — s → 1 → t matches');
select is(pg_temp.unlocks(pg_temp.uid(11), 'hidden_same_group_path'), 0, 'same path: a different path does not');

-- 5.4 G2: disjoint middles, rank 3 at exactly +1000 ms.
insert into t_ids values ('g2', pg_temp.group_room(array[pg_temp.uid(9), pg_temp.uid(10), pg_temp.uid(11), pg_temp.uid(12)]));
select pg_temp.group_walk((select id from t_ids where key = 'g2'), pg_temp.uid(9), array['b16-1', 'b16-t']);
select pg_temp.group_walk((select id from t_ids where key = 'g2'), pg_temp.uid(10), array['b16-2', 'b16-t']);
select pg_temp.group_walk((select id from t_ids where key = 'g2'), pg_temp.uid(11), array['b16-3', 'b16-t']);
select pg_temp.set_top3_times((select id from t_ids where key = 'g2'), 500, 1000);
select pg_temp.group_leave((select id from t_ids where key = 'g2'), pg_temp.uid(12));
select is((select count(*)::int from public.user_achievement_unlocks
            where achievement_id = 'hidden_three_disjoint' and source_id = (select id from t_ids where key = 'g2')), 3,
          'top3 disjoint: ranks 1·2·3 all unlock');
select is((select count(*)::int from public.user_achievement_unlocks
            where achievement_id = 'hidden_three_close' and source_id = (select id from t_ids where key = 'g2')), 3,
          'top3 close: 1000 ms is within the window (inclusive)');
select is(pg_temp.unlocks(pg_temp.uid(12), 'hidden_three_close'), 0, 'top3 close: the forfeiter is not paid');

/* ──────────────────────────────────────────────────────────────
 * 6. Equipment — 준비된 탐험가.
 * ────────────────────────────────────────────────────────────── */
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(1));
insert into t_out values ('e1', public.equip_profile_reward_v1('profile_icon', 1::smallint, 'icon_default_compass'));
set local role postgres;
select is(pg_temp.unlocks(pg_temp.uid(1), 'onboarding_profile_complete'), 0, 'profile: an icon alone is not enough');
set local role authenticated;
insert into t_out values ('e2', public.equip_profile_reward_v1('badge', 1::smallint, 'badge_first_arrival'));
set local role postgres;
select is((select body->>'ok' from t_out where key = 'e2'), 'true', 'profile: the equip itself succeeds');
select is(pg_temp.unlocks(pg_temp.uid(1), 'onboarding_profile_complete'), 1, 'profile: icon + badge unlocks');
select is((pg_temp.unlock_of(pg_temp.uid(1), 'onboarding_profile_complete')).source_type, 'equipment', 'profile: source_type equipment');
select ok((pg_temp.unlock_of(pg_temp.uid(1), 'onboarding_profile_complete')).source_id is null, 'profile: no source_id');
select ok(pg_temp.owns(pg_temp.uid(1), 'frame_ready_explorer'), 'profile: the frame is granted');
-- U2 in the other order: badge first, then the icon.
set local role authenticated;
select pg_temp.act_as(pg_temp.uid(2));
select public.equip_profile_reward_v1('badge', 1::smallint, 'badge_first_arrival');
set local role postgres;
select is(pg_temp.unlocks(pg_temp.uid(2), 'onboarding_profile_complete'), 0, 'profile: a badge alone is not enough');
set local role authenticated;
select public.equip_profile_reward_v1('profile_icon', 1::smallint, 'icon_default_book');
select public.equip_profile_reward_v1('profile_icon', 1::smallint, 'icon_default_compass');
set local role postgres;
select is(pg_temp.unlocks(pg_temp.uid(2), 'onboarding_profile_complete'), 1, 'profile: then the icon unlocks, once');

/* ──────────────────────────────────────────────────────────────
 * 7. Re-run RPC — idempotent.
 * ────────────────────────────────────────────────────────────── */
create temp table t_before as
select (select count(*) from public.user_achievement_unlocks) as unlocks,
       (select count(*) from public.xp_ledger) as ledger,
       (select count(*) from public.user_reward_inventory) as inventory,
       (select count(*) from public.user_achievement_marks) as marks;
set local role service_role;
insert into t_out values ('rr_d10', public.evaluate_result_achievements_v1('duel', pg_temp.match_of((select id from t_ids where key = 'd10'))));
insert into t_out values ('rr_g8', public.evaluate_result_achievements_v1('group', (select id from t_ids where key = 'g8')));
insert into t_out values ('rr_s8', public.evaluate_result_achievements_v1('single', (select id from t_ids where key = 's_u8')));
insert into t_out values ('rr_bad', public.evaluate_result_achievements_v1('nope', gen_random_uuid()));
insert into t_out values ('rr_cancel', public.evaluate_result_achievements_v1('duel', pg_temp.match_of((select id from t_ids where key = 'd_cancel'))));
set local role postgres;
select is((select body->>'ok' from t_out where key = 'rr_g8'), 'true', 're-run: ok');
select is((select (select count(*) from public.user_achievement_unlocks) - unlocks from t_before), 0::bigint, 're-run: no new unlock');
select is((select (select count(*) from public.xp_ledger) - ledger from t_before), 0::bigint, 're-run: no new XP row');
select is((select (select count(*) from public.user_reward_inventory) - inventory from t_before), 0::bigint, 're-run: no new reward');
select is((select (select count(*) from public.user_achievement_marks) - marks from t_before), 0::bigint, 're-run: no new mark');
select is((select array_agg(u->>'user_id' order by ord) from t_out, jsonb_array_elements(body->'users') with ordinality as x(u, ord)
            where key = 'rr_g8'),
          (select array_agg(user_id::text order by user_id) from public.group_match_results
            where room_id = (select id from t_ids where key = 'g8')),
          're-run: every result row, in user_id order (the lock order)');
select ok((select bool_and((unlock->>'unlocked')::boolean = false)
             from t_out, jsonb_array_elements(body->'users') u,
                  jsonb_array_elements(u->'achievements') a,
                  jsonb_array_elements(a->'unlocks') unlock
            where key = 'rr_d10'),
          're-run: every unlock in the answer reports unlocked:false (already held)');
select is((select body->>'code' from t_out where key = 'rr_bad'), 'ACHIEVEMENT_SOURCE_INVALID', 're-run: unknown scope');
select is((select jsonb_array_length(body->'users') from t_out where key = 'rr_cancel'), 0, 're-run: a cancelled match has no players');

/* ──────────────────────────────────────────────────────────────
 * 8. Isolation — a finish always commits.
 * ────────────────────────────────────────────────────────────── */

-- 8.1 One evaluator fails (bad params): the others still unlock.
update public.achievement_definitions set params = '{"moves": "x"}' where achievement_id = 'hidden_one_move';
insert into t_ids values ('iso1', pg_temp.play_single(pg_temp.uid(19), array['b16-s', 'b16-t']));
select ok((select id from t_ids where key = 'iso1') is not null, 'isolation 1: the completion is recorded');
select is(pg_temp.unlocks(pg_temp.uid(19), 'hidden_one_move'), 0, 'isolation 1: the broken evaluator unlocked nothing');
select is(pg_temp.unlocks(pg_temp.uid(19), 'onboarding_first_finish'), 1, 'isolation 1: the other definitions still unlock');
update public.achievement_definitions set params = '{"moves": 1}' where achievement_id = 'hidden_one_move';

-- 8.2 The whole evaluation fails: the finish and its 15c XP still commit.
create temp table t_saved (name text primary key, def text);
insert into t_saved values
  ('record', pg_get_functiondef('private.record_result_achievements_v1(text, uuid)'::regprocedure)),
  ('grant', pg_get_functiondef('public.grant_xp_v1(uuid, text, uuid, integer, integer, text)'::regprocedure));
create or replace function private.record_result_achievements_v1(p_scope text, p_result_id uuid)
returns jsonb language plpgsql as $$ begin raise exception 'INJECTED_16B_FAILURE'; end $$;
insert into t_ids values ('iso2', pg_temp.play_single(pg_temp.uid(20), array['b16-s', 'b16-t']));
select ok((select id from t_ids where key = 'iso2') is not null, 'isolation 2: the completion is recorded');
select is((select count(*)::int from public.xp_ledger where source_id = (select id from t_ids where key = 'iso2')), 1,
          'isolation 2: 15c result XP is paid');
select is((select count(*)::int from public.user_achievement_unlocks where user_id = pg_temp.uid(20)), 0,
          'isolation 2: no unlock');
do $$ begin execute (select def from t_saved where name = 'record'); end $$;

-- 8.3 The XP grant fails: the unlock and its reward stay; the re-run heals the XP.
create or replace function public.grant_xp_v1(p_user_id uuid, p_source_type text, p_source_id uuid,
                                              p_base_amount integer, p_amount integer, p_decay_reason text default null)
returns jsonb language plpgsql as $$ begin raise exception 'INJECTED_XP_FAILURE'; end $$;
insert into t_ids values ('iso3', pg_temp.play_single(pg_temp.uid(21), array['b16-s', 'b16-t']));
select is(pg_temp.unlocks(pg_temp.uid(21), 'onboarding_first_finish'), 1, 'isolation 3: the unlock stays without XP');
select ok(pg_temp.owns(pg_temp.uid(21), 'badge_first_arrival'), 'isolation 3: the reward stays');
select is(pg_temp.ach_xp(pg_temp.uid(21)), 0::bigint, 'isolation 3: no achievement XP yet');
do $$ begin execute (select def from t_saved where name = 'grant'); end $$;
set local role service_role;
select public.evaluate_result_achievements_v1('single', (select id from t_ids where key = 'iso3'));
set local role postgres;
select is(pg_temp.ach_xp(pg_temp.uid(21)), 60::bigint, 'isolation 3: the re-run heals 30 + 30 XP');
select is(pg_temp.unlocks(pg_temp.uid(21), 'onboarding_first_finish'), 1, 'isolation 3: without a second unlock');

-- 8.4 Negative control in place: with the trigger off, the same finish grants nothing.
alter table public.game_records disable trigger trg_record_single_result_achievements;
select pg_temp.play_single(pg_temp.uid(22), array['b16-s', 'b16-t']);
select is((select count(*)::int from public.user_achievement_unlocks where user_id = pg_temp.uid(22)), 0,
          'trigger off: nothing is unlocked — the unlocks above come from the trigger');
alter table public.game_records enable trigger trg_record_single_result_achievements;

select * from finish();
rollback;
