-- Wiki Race 2.0 Track 15c-1 contract tests: result finalizers pay XP.
-- Run after 20260930090000_xp_result_grants_v1.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/xp_result_grants_v1.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- Every finish goes through the real RPC of its path; only the decay history
-- (earlier matches of the same pair) is inserted directly, because now() is
-- frozen inside one transaction and earlier timestamps cannot be produced by
-- playing.

begin;
create extension if not exists pgtap with schema extensions;
select plan(100);

set local role postgres;

-- U1..U6 have profiles. U7 is an auth user without a profile (grant_xp_v1
-- answers AUTH_REQUIRED for it).
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-015c-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'xr-' || n || '@local.test', '{}', '{}', now(), now()
  from generate_series(1, 7) as n
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
select ('00000000-0000-0000-015c-00000000000' || n)::uuid, 'xr-' || n, 'XR ' || n, 'xr-' || n || '@local.test'
  from generate_series(1, 6) as n
on conflict (id) do nothing;

insert into public.wiki_pages(page_id, canonical_title)
values ('xr-a', 'XR A'), ('xr-b', 'XR B'), ('xr-c', 'XR C'), ('xr-t', 'XR Target'), ('xr-d', 'XR Daily')
on conflict (page_id) do nothing;

insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-015d-000000000001', 'xr-a', '1', 'XR A'),
  ('00000000-0000-0000-015d-000000000002', 'xr-b', '1', 'XR B'),
  ('00000000-0000-0000-015d-000000000003', 'xr-c', '1', 'XR C'),
  ('00000000-0000-0000-015d-000000000004', 'xr-t', '1', 'XR Target'),
  ('00000000-0000-0000-015d-000000000005', 'xr-d', '1', 'XR Daily')
on conflict (page_id, revision_id) do nothing;

insert into public.wiki_snapshot_links(
  snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal
)
values
  ('00000000-0000-0000-015d-000000000001', 'xr-t', '1', 'XR Target', 'XR Target', 0),
  ('00000000-0000-0000-015d-000000000001', 'xr-d', '1', 'XR Daily', 'XR Daily', 1),
  ('00000000-0000-0000-015d-000000000002', 'xr-t', '1', 'XR Target', 'XR Target', 0),
  ('00000000-0000-0000-015d-000000000002', 'xr-d', '1', 'XR Daily', 'XR Daily', 1),
  ('00000000-0000-0000-015d-000000000003', 'xr-t', '1', 'XR Target', 'XR Target', 0)
on conflict (snapshot_id, target_page_id) do nothing;

-- Today's course (KST) is 'XR Daily'. Any local row for today is replaced
-- inside this rolled-back transaction.
delete from public.daily_challenges
 where challenge_date = (now() at time zone 'Asia/Seoul')::date;
insert into public.daily_challenges (challenge_date, target_title)
values ((now() at time zone 'Asia/Seoul')::date, 'XR Daily');

-- ---------------------------------------------------------------------------
-- Fixture helpers (pg_temp — gone at session end).
-- ---------------------------------------------------------------------------
create function pg_temp.uid(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-015c-00000000000' || n)::uuid $$;

create function pg_temp.act_as(p_user uuid) returns void language sql
as $$ select set_config('request.jwt.claim.sub', p_user::text, true); select null::void $$;

-- One authenticated single run from p_start to p_target, finished in one move.
create function pg_temp.play_single(p_user uuid, p_start text, p_target text)
returns jsonb language plpgsql as $$
declare
  v_run uuid := gen_random_uuid();
  v_start_title text := (select canonical_title from public.wiki_pages where page_id = p_start);
  v_target_title text := (select canonical_title from public.wiki_pages where page_id = p_target);
begin
  insert into public.single_game_runs (
    id, user_id, start_page_id, start_revision_id, start_title_snapshot,
    target_page_id, target_revision_id, target_title_snapshot,
    current_page_id, current_revision_id, current_title_snapshot,
    path_page_ids, path_revision_ids, path_title_snapshots
  ) values (
    v_run, p_user, p_start, '1', v_start_title,
    p_target, '1', v_target_title,
    p_start, '1', v_start_title,
    array[p_start], array['1'], array[v_start_title]
  );
  perform pg_temp.act_as(p_user);
  return public.apply_single_move_v2(v_run, gen_random_uuid(), null, 0, p_target);
end;
$$;

create function pg_temp.record_of(p_response jsonb) returns uuid language sql
as $$ select id from public.game_records where run_id = (p_response->'run'->>'id')::uuid $$;

-- A playing duel room: both players on xr-a, both aiming at xr-t.
create function pg_temp.duel_room(p_a uuid, p_b uuid) returns uuid
language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  insert into public.game_rooms (
    id, room_code, host_user_id, status, mode, min_players, max_players,
    use_items, reconnect_deadline_seconds, game_starts_at
  ) values (
    v_room, 'XR' || substr(replace(v_room::text, '-', ''), 1, 8), p_a, 'playing', 'duel', 2, 2,
    false, 60, now() - interval '5 minutes'
  );
  insert into public.room_players (
    room_id, user_id, role, nickname_snapshot, is_ready, player_status,
    start_title, target_title, current_title, path_titles,
    start_page_id, start_revision_id, target_page_id, target_revision_id,
    current_page_id, current_revision_id, path_page_ids, path_revision_ids, heartbeat_at
  )
  select v_room, player.user_id, player.role, 'XR', true, 'playing',
         'XR A', 'XR Target', 'XR A', array['XR A'],
         'xr-a', '1', 'xr-t', '1', 'xr-a', '1', array['xr-a'], array['1'], now()
    from (values (p_a, 'host'), (p_b, 'guest')) as player(user_id, role);
  return v_room;
end;
$$;

-- An earlier finished match of the same pair, finalized at p_at.
create function pg_temp.prior_match(p_winner uuid, p_loser uuid, p_at timestamptz, p_status text)
returns void language plpgsql as $$
declare
  v_room uuid := gen_random_uuid();
begin
  insert into public.game_rooms (
    id, room_code, host_user_id, status, mode, min_players, max_players,
    use_items, game_starts_at, finished_at, finished_reason
  ) values (
    v_room, 'XP' || substr(replace(v_room::text, '-', ''), 1, 8), p_winner, 'finished', 'duel', 2, 2,
    false, p_at - interval '1 minute', p_at,
    case p_status when 'completed' then 'normal_finish' else p_status end
  );
  insert into public.match_history (
    room_id, winner_user_id, loser_user_id, duration_seconds,
    result_status, result_reason, finalized_at
  ) values (
    -- A cancelled row keeps both ids on purpose: the decay count must exclude
    -- it by result_status, not merely because a null pair never matches.
    v_room, p_winner, p_loser, 60, p_status, 'fixture', p_at
  );
end;
$$;

-- KST midnight of today as an instant. Offsets from it are earlier than now()
-- except in the first milliseconds of a KST day.
create function pg_temp.kst_midnight() returns timestamptz language sql stable
as $$ select date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' $$;

-- A playing group room of the given players (first is host).
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
    v_room, 'XG' || substr(replace(v_room::text, '-', ''), 1, 8), p_users[1], 'playing', 'group', 3, 8,
    false, 3, now() - interval '1 minute', now() + interval '1 hour',
    'xr-a', '1', 'XR A', 'xr-t', '1', 'XR Target'
  );
  insert into public.room_players (
    room_id, user_id, role, nickname_snapshot, is_ready, player_status,
    start_title, target_title, current_title, path_titles,
    start_page_id, start_revision_id, target_page_id, target_revision_id,
    current_page_id, current_revision_id, path_page_ids, path_revision_ids, heartbeat_at
  )
  select v_room, member.user_id,
         case when member.ord = 1 then 'host' else 'guest' end,
         'XR', true, 'playing',
         'XR A', 'XR Target', 'XR A', array['XR A'],
         'xr-a', '1', 'xr-t', '1', 'xr-a', '1', array['xr-a'], array['1'], now()
    from unnest(p_users) with ordinality as member(user_id, ord);
  return v_room;
end;
$$;

create function pg_temp.group_finish(p_room uuid, p_user uuid) returns jsonb
language plpgsql as $$
begin
  perform pg_temp.act_as(p_user);
  return public.apply_group_move_v2(p_room, gen_random_uuid(), null, 0, 'xr-t');
end;
$$;

create function pg_temp.ledger(p_user uuid, p_source uuid) returns public.xp_ledger
language sql as $$
  select * from public.xp_ledger where user_id = p_user and source_id = p_source
$$;

-- Result XP on the total. Since 16b the same finishes also unlock achievements,
-- whose XP (source_type achievement_unlock) lands on the same total_xp.
create function pg_temp.total(p_user uuid) returns bigint language sql
as $$
  select total_xp - coalesce((select sum(amount) from public.xp_ledger
                               where user_id = p_user and source_type = 'achievement_unlock'), 0)
    from public.profiles where id = p_user
$$;

create temp table xr (key text primary key, id uuid, response jsonb);

/* ──────────────────────────────────────────────────────────────
 * 1. Objects and ACL.
 * ────────────────────────────────────────────────────────────── */

select has_function('private', 'duel_decay_v1', array['integer', 'integer'], 'duel decay helper exists');
select has_function('private', 'try_grant_xp_v1', array['uuid', 'text', 'uuid', 'integer', 'integer', 'text'],
  'isolated grant wrapper exists');
select has_function('public', 'grant_result_xp_v1', array['text', 'uuid'], 'the re-grant RPC exists');

select ok(exists (select 1 from pg_trigger where tgname = 'trg_grant_single_result_xp'
                    and tgrelid = 'public.game_records'::regclass and not tgisinternal),
  'game_records carries the single grant trigger');
select ok(exists (select 1 from pg_trigger where tgname = 'trg_grant_duel_result_xp'
                    and tgrelid = 'public.match_history'::regclass and not tgisinternal),
  'match_history carries the duel grant trigger');
select ok(exists (select 1 from pg_trigger where tgname = 'trg_grant_group_result_xp'
                    and tgrelid = 'public.game_rooms'::regclass and not tgisinternal),
  'game_rooms carries the group grant trigger');

select ok(not has_function_privilege('authenticated', 'public.grant_result_xp_v1(text,uuid)', 'EXECUTE'),
  'authenticated cannot re-grant — it pays other users (C2 §7)');
select ok(not has_function_privilege('anon', 'public.grant_result_xp_v1(text,uuid)', 'EXECUTE'),
  'anon cannot re-grant');
select ok(has_function_privilege('service_role', 'public.grant_result_xp_v1(text,uuid)', 'EXECUTE'),
  'service_role can re-grant');
select ok(not has_function_privilege('authenticated', 'private.try_grant_xp_v1(uuid,text,uuid,integer,integer,text)', 'EXECUTE'),
  'authenticated cannot reach the grant wrapper');
select ok(not has_function_privilege('authenticated', 'private.grant_duel_result_xp_v1(uuid)', 'EXECUTE'),
  'authenticated cannot reach the duel classifier');

/* ──────────────────────────────────────────────────────────────
 * 2. Duel decay value table — the JS twin reads this block.
 *    tests/xpResultGrants.test.js parses the rows between the markers and
 *    checks utils/xpRules.js applyDuelDecay against the same table.
 *    Row: (base, game_number, amount, decay_reason)
 * ────────────────────────────────────────────────────────────── */

select is(
  (select row(d.base_amount, d.amount, d.decay_reason)::text
     from private.duel_decay_v1(t.base, t.n) as d),
  row(greatest(coalesce(t.base, 0), 0), t.amount, t.reason)::text,
  format('duel decay base=%s n=%s -> %s %s', t.base, t.n, t.amount, coalesce(t.reason, 'null'))
)
from (values
  -- DUEL_DECAY_TABLE:BEGIN
  (50, 1, 50, null),
  (50, 3, 50, null),
  (50, 4, 25, 'duel_repeat_half'),
  (50, 5, 25, 'duel_repeat_half'),
  (50, 6, 0, 'duel_repeat_zero'),
  (50, 10, 0, 'duel_repeat_zero'),
  (25, 4, 12, 'duel_repeat_half'),
  (25, 6, 0, 'duel_repeat_zero'),
  (30, 4, 15, 'duel_repeat_half'),
  (0, 4, 0, null),
  (0, 6, 0, null),
  (50, 0, 50, null),
  (50, null, 50, null),
  (-5, 4, 0, null)
  -- DUEL_DECAY_TABLE:END
) as t(base, n, amount, reason);

/* ──────────────────────────────────────────────────────────────
 * 3. Single — apply_single_move_v2 completion.
 * ────────────────────────────────────────────────────────────── */

insert into xr (key, response) values ('s1', pg_temp.play_single(pg_temp.uid(1), 'xr-a', 'xr-t'));
update xr set id = pg_temp.record_of(response) where key = 's1';

select is((select response->>'code' from xr where key = 's1'), 'APPLIED', 'single: the finishing move is applied');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 's1'))).source_type,
  'single_target_first_finish', 'single: first A→T completion pays single_target_first_finish');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 's1'))).amount, 15,
  'single: target-designated first completion is 15');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 's1'))).xp_class, 'gameplay',
  'single: the grant is gameplay XP');
select is(pg_temp.total(pg_temp.uid(1)), 15::bigint, 'single: total_xp follows the grant');

insert into xr (key, response) values ('s2', pg_temp.play_single(pg_temp.uid(1), 'xr-a', 'xr-t'));
update xr set id = pg_temp.record_of(response) where key = 's2';
select ok((select id from xr where key = 's2') is not null, 'single: the repeat completion is still recorded');
select is((select count(*)::integer from public.xp_ledger where source_id = (select id from xr where key = 's2')), 0,
  'single: the same start and target pays only once (spec §7.2) — no row');

insert into xr (key, response) values ('s3', pg_temp.play_single(pg_temp.uid(1), 'xr-b', 'xr-t'));
update xr set id = pg_temp.record_of(response) where key = 's3';
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 's3'))).amount, 15,
  'single: a different start with the same target is a new pair and pays 15');

insert into xr (key, response) values ('s4', pg_temp.play_single(pg_temp.uid(1), 'xr-a', 'xr-d'));
update xr set id = pg_temp.record_of(response) where key = 's4';
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 's4'))).source_type,
  'daily_course_first_finish', 'single: completing today''s course pays daily_course_first_finish');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 's4'))).amount, 25,
  'single: today''s course first completion is 25');
select is((select count(*)::integer from public.xp_ledger where source_id = (select id from xr where key = 's4')), 1,
  'single: today''s course pays 25 only — never 15 as well (decision 3)');

insert into xr (key, response) values ('s5', pg_temp.play_single(pg_temp.uid(1), 'xr-b', 'xr-d'));
update xr set id = pg_temp.record_of(response) where key = 's5';
select is((select count(*)::integer from public.xp_ledger where source_id = (select id from xr where key = 's5')), 0,
  'single: a second completion of today''s course pays nothing, even from another start');

select is(pg_temp.total(pg_temp.uid(1)), 55::bigint, 'single: 15 + 15 + 25');

insert into xr (key, response) values ('s6', pg_temp.play_single(pg_temp.uid(2), 'xr-a', 'xr-d'));
update xr set id = pg_temp.record_of(response) where key = 's6';
select is((pg_temp.ledger(pg_temp.uid(2), (select id from xr where key = 's6'))).amount, 25,
  'single: "first of the day" is per player — another player still gets 25');

/* ──────────────────────────────────────────────────────────────
 * 4. Duel — each finish path, each on its own pair.
 * ────────────────────────────────────────────────────────────── */

-- 4.1 normal_finish through apply_duel_move_v2. U1 beats U2.
insert into xr (key, id) values ('d1', pg_temp.duel_room(pg_temp.uid(1), pg_temp.uid(2)));
select pg_temp.act_as(pg_temp.uid(1));
update xr set response = public.apply_duel_move_v2(id, gen_random_uuid(), null, 0, 'xr-t') where key = 'd1';
insert into xr (key, id) select 'd1m', id from public.match_history where room_id = (select id from xr where key = 'd1');

select is((select response->>'code' from xr where key = 'd1'), 'APPLIED', 'duel normal: the finishing move is applied');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'd1m'))).source_type, 'duel_win_normal',
  'duel normal: winner row is duel_win_normal, keyed on match_history.id');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'd1m'))).amount, 50, 'duel normal: win is 50');
select is((pg_temp.ledger(pg_temp.uid(2), (select id from xr where key = 'd1m'))).source_type, 'duel_loss_normal',
  'duel normal: loser row is duel_loss_normal');
select is((pg_temp.ledger(pg_temp.uid(2), (select id from xr where key = 'd1m'))).amount, 25, 'duel normal: loss is 25');
select ok((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'd1m'))).decay_reason is null,
  'duel normal: the first game of the day is not decayed');

-- 4.2 forfeit through leave_duel_room_v2. U3 forfeits to U4.
insert into xr (key, id) values ('d2', pg_temp.duel_room(pg_temp.uid(3), pg_temp.uid(4)));
select pg_temp.act_as(pg_temp.uid(3));
update xr set response = public.leave_duel_room_v2(id, gen_random_uuid()) where key = 'd2';
insert into xr (key, id) select 'd2m', id from public.match_history where room_id = (select id from xr where key = 'd2');

select is((select response->>'code' from xr where key = 'd2'), 'FORFEIT', 'duel forfeit: the leave is a forfeit');
select is((pg_temp.ledger(pg_temp.uid(4), (select id from xr where key = 'd2m'))).source_type, 'duel_win_forfeit',
  'duel forfeit: the remaining player gets duel_win_forfeit');
select is((pg_temp.ledger(pg_temp.uid(4), (select id from xr where key = 'd2m'))).amount, 30, 'duel forfeit: forfeit win is 30');
select is((pg_temp.ledger(pg_temp.uid(3), (select id from xr where key = 'd2m'))).source_type, 'duel_loss_forfeit',
  'duel forfeit: the player who left gets duel_loss_forfeit');
select is((pg_temp.ledger(pg_temp.uid(3), (select id from xr where key = 'd2m'))).amount, 0,
  'duel forfeit: 0 XP still writes its row (C2 §3)');

-- 4.3 reconnect timeout through finalize_duel_if_expired. U3 drops, U1 wins.
insert into xr (key, id) values ('d3', pg_temp.duel_room(pg_temp.uid(1), pg_temp.uid(3)));
update public.room_players set heartbeat_at = now() - interval '1 hour'
 where room_id = (select id from xr where key = 'd3') and user_id = pg_temp.uid(3);
select pg_temp.act_as(pg_temp.uid(1));
update xr set response = to_jsonb(public.finalize_duel_if_expired(id)) where key = 'd3';
insert into xr (key, id) select 'd3m', id from public.match_history where room_id = (select id from xr where key = 'd3');

select is((select response->>'finished_reason' from xr where key = 'd3'), 'forfeit',
  'duel disconnect: the expiry finalizer ends the room as forfeit');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'd3m'))).amount, 30,
  'duel disconnect: the connected player gets the forfeit win 30');
select is((pg_temp.ledger(pg_temp.uid(3), (select id from xr where key = 'd3m'))).amount, 0,
  'duel disconnect: the dropped player gets 0 (spec §7.1 연결 이탈 패배)');

-- 4.4 both dropped -> cancelled through finalize_duel_if_expired.
insert into xr (key, id) values ('d4', pg_temp.duel_room(pg_temp.uid(2), pg_temp.uid(4)));
update public.room_players set heartbeat_at = now() - interval '1 hour'
 where room_id = (select id from xr where key = 'd4');
select pg_temp.act_as(pg_temp.uid(2));
update xr set response = to_jsonb(public.finalize_duel_if_expired(id)) where key = 'd4';
insert into xr (key, id) select 'd4m', id from public.match_history where room_id = (select id from xr where key = 'd4');

select is((select response->>'finished_reason' from xr where key = 'd4'), 'cancelled', 'duel cancelled: the room is void');
select ok((select id from xr where key = 'd4m') is not null, 'duel cancelled: match_history still records the void match');
select is((select count(*)::integer from public.xp_ledger where source_id = (select id from xr where key = 'd4m')), 0,
  'duel cancelled: a void match pays nobody (15 §2)');

-- 4.5 any match_history insert pays — the path private.apply_duel_move_internal_v3
-- takes too (it inserts the same row shape). Direct insert of a finished room.
select pg_temp.prior_match(pg_temp.uid(5), pg_temp.uid(6), pg_temp.kst_midnight() + interval '1 millisecond', 'completed');
insert into xr (key, id)
select 'd5m', history.id from public.match_history history
 where history.winner_user_id = pg_temp.uid(5) and history.loser_user_id = pg_temp.uid(6);
select is((pg_temp.ledger(pg_temp.uid(5), (select id from xr where key = 'd5m'))).amount, 50,
  'duel insert: a normal_finish row pays the winner 50 whichever finalizer wrote it');
select is((pg_temp.ledger(pg_temp.uid(6), (select id from xr where key = 'd5m'))).amount, 25,
  'duel insert: and the loser 25');

/* ──────────────────────────────────────────────────────────────
 * 5. Duel decay — same pair, same KST day (decision 5).
 * ────────────────────────────────────────────────────────────── */

-- 5.1 U1 vs U4: two earlier games today, one cancelled today, one yesterday.
-- Only the two count, so the real match is game 3 — no decay.
select pg_temp.prior_match(pg_temp.uid(1), pg_temp.uid(4), pg_temp.kst_midnight() + interval '1 millisecond', 'completed');
select pg_temp.prior_match(pg_temp.uid(4), pg_temp.uid(1), pg_temp.kst_midnight() + interval '2 millisecond', 'forfeit');
select pg_temp.prior_match(pg_temp.uid(1), pg_temp.uid(4), pg_temp.kst_midnight() + interval '3 millisecond', 'cancelled');
select pg_temp.prior_match(pg_temp.uid(1), pg_temp.uid(4), pg_temp.kst_midnight() - interval '1 hour', 'completed');
insert into xr (key, id) values ('e1', pg_temp.duel_room(pg_temp.uid(1), pg_temp.uid(4)));
select pg_temp.act_as(pg_temp.uid(1));
update xr set response = public.apply_duel_move_v2(id, gen_random_uuid(), null, 0, 'xr-t') where key = 'e1';
insert into xr (key, id) select 'e1m', id from public.match_history where room_id = (select id from xr where key = 'e1');

select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'e1m'))).amount, 50,
  'decay: cancelled and yesterday''s games do not count, forfeits do — game 3 is full 50');
select ok((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'e1m'))).decay_reason is null,
  'decay: game 3 carries no decay reason');

-- 5.2 U1 vs U5: three earlier games today -> the real match is game 4.
-- (U5 vs U6 in 4.5 is another pair and does not count.)
select pg_temp.prior_match(pg_temp.uid(1), pg_temp.uid(5), pg_temp.kst_midnight() + interval '1 millisecond', 'completed');
select pg_temp.prior_match(pg_temp.uid(5), pg_temp.uid(1), pg_temp.kst_midnight() + interval '2 millisecond', 'completed');
select pg_temp.prior_match(pg_temp.uid(1), pg_temp.uid(5), pg_temp.kst_midnight() + interval '3 millisecond', 'forfeit');
insert into xr (key, id) values ('e2', pg_temp.duel_room(pg_temp.uid(1), pg_temp.uid(5)));
select pg_temp.act_as(pg_temp.uid(1));
update xr set response = public.apply_duel_move_v2(id, gen_random_uuid(), null, 0, 'xr-t') where key = 'e2';
insert into xr (key, id) select 'e2m', id from public.match_history where room_id = (select id from xr where key = 'e2');

select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'e2m'))).base_amount, 50,
  'decay game 4: the winner keeps the original 50 as base_amount');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'e2m'))).amount, 25,
  'decay game 4: the winner is paid 50%');
select is((pg_temp.ledger(pg_temp.uid(1), (select id from xr where key = 'e2m'))).decay_reason, 'duel_repeat_half',
  'decay game 4: reason duel_repeat_half');
select is((pg_temp.ledger(pg_temp.uid(5), (select id from xr where key = 'e2m'))).amount, 12,
  'decay game 4: the loser''s 25 halves to 12 — floor (C2 §8-①)');
select is((pg_temp.ledger(pg_temp.uid(5), (select id from xr where key = 'e2m'))).decay_reason, 'duel_repeat_half',
  'decay game 4: the loser row is decayed too');

-- 5.3 U2 vs U3: five earlier games today -> the real forfeit is game 6.
select pg_temp.prior_match(pg_temp.uid(2), pg_temp.uid(3), pg_temp.kst_midnight() + (n || ' millisecond')::interval, 'completed')
  from generate_series(1, 5) as n;
insert into xr (key, id) values ('e3', pg_temp.duel_room(pg_temp.uid(2), pg_temp.uid(3)));
select pg_temp.act_as(pg_temp.uid(3));
update xr set response = public.leave_duel_room_v2(id, gen_random_uuid()) where key = 'e3';
insert into xr (key, id) select 'e3m', id from public.match_history where room_id = (select id from xr where key = 'e3');

select is((pg_temp.ledger(pg_temp.uid(2), (select id from xr where key = 'e3m'))).base_amount, 30,
  'decay game 6: base_amount keeps the forfeit win 30');
select is((pg_temp.ledger(pg_temp.uid(2), (select id from xr where key = 'e3m'))).amount, 0,
  'decay game 6: paid 0');
select is((pg_temp.ledger(pg_temp.uid(2), (select id from xr where key = 'e3m'))).decay_reason, 'duel_repeat_zero',
  'decay game 6: reason duel_repeat_zero — the row is still written');
select ok((pg_temp.ledger(pg_temp.uid(3), (select id from xr where key = 'e3m'))).decay_reason is null,
  'decay game 6: a 0 base stays reason-less (amount did not change)');

/* ──────────────────────────────────────────────────────────────
 * 6. Group — both finalizer routes.
 * ────────────────────────────────────────────────────────────── */

-- 6.1 all_resolved through finish_group_room_v13: U1..U4 finish in order,
-- U5 forfeits last (leave_group_player).
insert into xr (key, id) values ('g1', pg_temp.group_room(array[
  pg_temp.uid(1), pg_temp.uid(2), pg_temp.uid(3), pg_temp.uid(4), pg_temp.uid(5)]));
select pg_temp.group_finish((select id from xr where key = 'g1'), pg_temp.uid(n)) from generate_series(1, 4) as n;

select is((select count(*)::integer from public.xp_ledger ledger
             join public.group_match_results result on result.id = ledger.source_id
            where result.room_id = (select id from xr where key = 'g1')), 0,
  'group: nothing is paid while the room is still running');

select pg_temp.act_as(pg_temp.uid(5));
select public.leave_group_player((select id from xr where key = 'g1'), 'forfeited');

select is((select finished_reason from public.game_rooms where id = (select id from xr where key = 'g1')), 'all_resolved',
  'group: the last forfeit resolves the room');

select is(
  (select array_agg(ledger.source_type || ':' || ledger.amount order by result.user_id)
     from public.group_match_results result
     join public.xp_ledger ledger
       on ledger.source_id = result.id and ledger.user_id = result.user_id
    where result.room_id = (select id from xr where key = 'g1')),
  array['group_rank_1:70', 'group_rank_2:55', 'group_rank_3:45', 'group_rank_other:35', 'group_retire:0'],
  'group all_resolved: 1st 70 · 2nd 55 · 3rd 45 · 4th 35 · RETIRE 0, one row each keyed on group_match_results.id'
);

-- 6.2 time_limit through finalize_group_room_if_expired: U6 finishes, U1 and U2
-- are still playing when the deadline passes.
insert into xr (key, id) values ('g2', pg_temp.group_room(array[pg_temp.uid(6), pg_temp.uid(1), pg_temp.uid(2)]));
select pg_temp.group_finish((select id from xr where key = 'g2'), pg_temp.uid(6));
update public.game_rooms
   set game_starts_at = now() - interval '2 hours', game_deadline_at = now() - interval '1 second'
 where id = (select id from xr where key = 'g2');
select pg_temp.act_as(pg_temp.uid(1));
select public.finalize_group_room_if_expired((select id from xr where key = 'g2'));

select is((select finished_reason from public.game_rooms where id = (select id from xr where key = 'g2')), 'time_limit',
  'group: the expiry finalizer ends the room on time_limit');
select is(
  (select array_agg(result.user_id::text || ':' || ledger.source_type || ':' || ledger.amount order by result.user_id)
     from public.group_match_results result
     join public.xp_ledger ledger
       on ledger.source_id = result.id and ledger.user_id = result.user_id
    where result.room_id = (select id from xr where key = 'g2')),
  array[
    pg_temp.uid(1)::text || ':group_retire:0',
    pg_temp.uid(2)::text || ':group_retire:0',
    pg_temp.uid(6)::text || ':group_rank_1:70'
  ],
  'group time_limit: the finisher gets 70, the timed-out players RETIRE 0'
);

/* ──────────────────────────────────────────────────────────────
 * 7. Idempotency — re-grant through grant_result_xp_v1.
 * ────────────────────────────────────────────────────────────── */

create temp table xr_before as
select (select count(*) from public.xp_ledger) as rows,
       (select sum(total_xp) from public.profiles
         where id in (select pg_temp.uid(n) from generate_series(1, 6) as n)) as total;

-- Called as postgres (the owner); the service_role-only ACL is asserted in section 1.

select is(public.grant_result_xp_v1('single', (select id from xr where key = 's1'))->'grants'->0->>'granted', 'false',
  'idempotent: re-granting a paid single result answers granted:false');
select is(public.grant_result_xp_v1('single', (select id from xr where key = 's2'))->'grants', '[]'::jsonb,
  'idempotent: a non-first single result stays unpaid on re-grant');
select is(
  (select array_agg(g->>'granted') from jsonb_array_elements(
     public.grant_result_xp_v1('duel', (select id from xr where key = 'd1m'))->'grants') as g),
  array['false', 'false'],
  'idempotent: re-granting a duel result pays neither player again');
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.grant_result_xp_v1('group', (select id from xr where key = 'g1'))->'grants') as g
    where g->>'granted' = 'false'),
  5,
  'idempotent: re-granting a group room answers granted:false for all five');
select is(public.grant_result_xp_v1('duel', (select id from xr where key = 'd4m'))->'grants', '[]'::jsonb,
  'idempotent: a cancelled match stays unpaid on re-grant');
select is(public.grant_result_xp_v1('bogus', gen_random_uuid())->>'code', 'XP_SOURCE_INVALID',
  'grant_result_xp_v1 rejects an unknown scope');

set local role postgres;

select is((select count(*) from public.xp_ledger), (select rows from xr_before),
  'idempotent: no ledger row was added by any re-grant');
select is(
  (select sum(total_xp) from public.profiles where id in (select pg_temp.uid(n) from generate_series(1, 6) as n)),
  (select total from xr_before),
  'idempotent: no total_xp moved');

-- Re-grant after the fact must reach the same decision as the trigger did.
select is(
  (select array_agg(g->>'amount' || '/' || coalesce(g->>'decay_reason', 'null')
                    order by g->>'user_id')
     from jsonb_array_elements(public.grant_result_xp_v1('duel', (select id from xr where key = 'e2m'))->'grants') as g),
  array['25/duel_repeat_half', '12/duel_repeat_half'],
  're-grant recomputes the same decayed amounts as the trigger (game 4)'
);

-- Invariant C3 §6 over every fixture player.
select is(
  (select count(*)::integer from public.profiles p
    where p.id in (select pg_temp.uid(n) from generate_series(1, 6) as n)
      and p.total_xp <> (select coalesce(sum(amount), 0) from public.xp_ledger where user_id = p.id)),
  0,
  'every total_xp still equals its ledger sum (C3 §6)'
);

/* ──────────────────────────────────────────────────────────────
 * 8. Isolation — a failed grant never fails the match.
 * ────────────────────────────────────────────────────────────── */

-- 8.1 No profile: grant_xp_v1 answers AUTH_REQUIRED, the run still completes.
insert into xr (key, response) values ('i1', pg_temp.play_single(pg_temp.uid(7), 'xr-a', 'xr-t'));
update xr set id = pg_temp.record_of(response) where key = 'i1';
select is((select response->>'code' from xr where key = 'i1'), 'APPLIED',
  'isolation: a player without a profile still finishes the run');
select ok((select id from xr where key = 'i1') is not null, 'isolation: and the record is written');
select is((select count(*)::integer from public.xp_ledger where source_id = (select id from xr where key = 'i1')), 0,
  'isolation: and no XP is written');

-- 8.2 Inner layer: the grant itself raises (a temporary CHECK rejects U6's rows).
alter table public.xp_ledger
  add constraint xr_block_u6 check (user_id <> '00000000-0000-0000-015c-000000000006') not valid;

create temp table xr_u6 as select pg_temp.total(pg_temp.uid(6)) as total;
insert into xr (key, response) values ('i2', pg_temp.play_single(pg_temp.uid(6), 'xr-c', 'xr-t'));
update xr set id = pg_temp.record_of(response) where key = 'i2';

select is((select response->>'code' from xr where key = 'i2'), 'APPLIED',
  'inner isolation: the finishing move commits although grant_xp_v1 raised');
select is((select status from public.single_game_runs where id = ((select response from xr where key = 'i2')->'run'->>'id')::uuid),
  'completed', 'inner isolation: the run is completed');
select ok((select id from xr where key = 'i2') is not null, 'inner isolation: the game record is written');
select is((select count(*)::integer from public.xp_ledger where source_id = (select id from xr where key = 'i2')), 0,
  'inner isolation: the failed grant left no ledger row');
select is(pg_temp.total(pg_temp.uid(6)), (select total from xr_u6),
  'inner isolation: and profiles.total_xp was rolled back with it');
select is(
  (select count(*)::integer from public.game_mutation_requests
    where scope = 'single' and game_id = ((select response from xr where key = 'i2')->'run'->>'id')::uuid),
  1, 'inner isolation: the idempotency row of the move is committed');

alter table public.xp_ledger drop constraint xr_block_u6;

-- Recovery: once the cause is gone, the re-grant pays exactly once.
-- Called as postgres (the owner); the service_role-only ACL is asserted in section 1.
select is(public.grant_result_xp_v1('single', (select id from xr where key = 'i2'))->'grants'->0->>'granted', 'true',
  'recovery: grant_result_xp_v1 pays the missed result');
select is(public.grant_result_xp_v1('single', (select id from xr where key = 'i2'))->'grants'->0->>'granted', 'false',
  'recovery: and a second re-grant is a no-op');
set local role postgres;
select is(pg_temp.total(pg_temp.uid(6)), (select total from xr_u6) + 15, 'recovery: total_xp moved by 15 once');

-- 8.3 Outer layer: the classifier itself raises. Replaced inside this rolled-back
-- transaction only; kept last so nothing after it depends on the real body.
create or replace function private.grant_duel_result_xp_v1(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin raise exception 'XR_FORCED_FAILURE'; end; $$;

insert into xr (key, id) values ('i3', pg_temp.duel_room(pg_temp.uid(5), pg_temp.uid(6)));
select pg_temp.act_as(pg_temp.uid(5));
update xr set response = public.apply_duel_move_v2(id, gen_random_uuid(), null, 0, 'xr-t') where key = 'i3';
insert into xr (key, id) select 'i3m', id from public.match_history where room_id = (select id from xr where key = 'i3');

select is((select response->>'code' from xr where key = 'i3'), 'APPLIED',
  'outer isolation: the duel finish commits although the classifier raised');
select is((select status from public.game_rooms where id = (select id from xr where key = 'i3')), 'finished',
  'outer isolation: the room is finished');
select ok((select id from xr where key = 'i3m') is not null, 'outer isolation: match_history is written');
select is((select count(*)::integer from public.xp_ledger where source_id = (select id from xr where key = 'i3m')), 0,
  'outer isolation: and no XP is written');

select * from finish();
rollback;
