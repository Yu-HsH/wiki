-- Wiki Race 2.0 SF-A1 tests (20261004100000_duel_players_view_v1.sql, TRACKS.md §8-SEC).
-- Every fixture is rolled back; this file never touches a remote database.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-05a1-000000000001', 'authenticated', 'authenticated', 'sa1-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-05a1-000000000002', 'authenticated', 'authenticated', 'sa1-2@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-05a1-000000000003', 'authenticated', 'authenticated', 'sa1-3@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-05a1-000000000001', 'sa1_one', 'SA1 One', 'sa1-1@local.test'),
  ('00000000-0000-0000-05a1-000000000002', 'sa1_two', 'SA1 Two', 'sa1-2@local.test'),
  ('00000000-0000-0000-05a1-000000000003', 'sa1_three', 'SA1 Three', 'sa1-3@local.test')
on conflict (id) do nothing;

insert into public.wiki_pages(page_id, canonical_title)
values ('sa1-start', 'SA1 Start'), ('sa1-middle', 'SA1 Middle'), ('sa1-target', 'SA1 Target')
on conflict (page_id) do nothing;

insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-05a2-000000000001', 'sa1-start', '100', 'SA1 Start'),
  ('00000000-0000-0000-05a2-000000000002', 'sa1-middle', '200', 'SA1 Middle'),
  ('00000000-0000-0000-05a2-000000000003', 'sa1-target', '300', 'SA1 Target')
on conflict (page_id, revision_id) do nothing;

insert into public.wiki_snapshot_links(
  snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal
)
values
  ('00000000-0000-0000-05a2-000000000001', 'sa1-middle', '200', 'SA1 Middle', 'SA1 Middle', 0),
  ('00000000-0000-0000-05a2-000000000002', 'sa1-target', '300', 'SA1 Target', 'SA1 Target', 0)
on conflict (snapshot_id, target_page_id) do nothing;

insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  use_items, state_version, reconnect_deadline_seconds, game_starts_at
)
values (
  '00000000-0000-0000-05a3-000000000001', 'SA1DUEL',
  '00000000-0000-0000-05a1-000000000001', 'playing', 'duel', 2, 2,
  false, 1, 60, now() - interval '1 minute'
);

insert into public.room_players(
  id, room_id, user_id, role, nickname_snapshot, is_ready, player_status,
  start_title, target_title, current_title, move_count, has_finished,
  path_titles, last_seen_at, start_page_id, start_revision_id,
  target_page_id, target_revision_id, current_page_id, current_revision_id,
  progress_version, path_page_ids, path_revision_ids, heartbeat_at, created_at
)
values
  (
    '00000000-0000-0000-05a4-000000000001', '00000000-0000-0000-05a3-000000000001',
    '00000000-0000-0000-05a1-000000000001', 'host', 'SA1 One', false, 'playing',
    'SA1 Start', 'SA1 Target', 'SA1 Start', 0, false,
    array['SA1 Start']::text[], now(), 'sa1-start', '100',
    'sa1-target', '300', 'sa1-start', '100', 1,
    array['sa1-start']::text[], array['100']::text[], now(), now() - interval '2 minutes'
  ),
  (
    '00000000-0000-0000-05a4-000000000002', '00000000-0000-0000-05a3-000000000001',
    '00000000-0000-0000-05a1-000000000002', 'guest', 'SA1 Two', false, 'playing',
    'SA1 Start', 'SA1 Target', 'SA1 Middle', 1, false,
    array['SA1 Start', 'SA1 Middle']::text[], now(), 'sa1-start', '100',
    'sa1-target', '300', 'sa1-middle', '200', 1,
    array['sa1-start', 'sa1-middle']::text[], array['100', '200']::text[], now(), now() - interval '1 minute'
  );

-- A group room, to show the RPC refuses it and the trigger ignores it.
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players, finish_rank_limit, use_items
)
values (
  '00000000-0000-0000-05a3-000000000002', 'SA1GRP',
  '00000000-0000-0000-05a1-000000000003', 'playing', 'group', 3, 8, 3, false
);
insert into public.room_players(id, room_id, user_id, role, nickname_snapshot, player_status, current_title, move_count)
values ('00000000-0000-0000-05a4-000000000003', '00000000-0000-0000-05a3-000000000002',
        '00000000-0000-0000-05a1-000000000003', 'host', 'SA1 Three', 'playing', 'SA1 Start', 0);

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claim.sub = %L', p_user::text);
end;
$$;

create or replace function pg_temp.signals(p_room uuid) returns integer language sql as $$
  select count(*)::integer from public.room_events where room_id = p_room and event_type = 'duel_progress';
$$;

/* ──────────────────────────────────────────────────────────────
 * 1. get_duel_room_players_v1 — ACL and shape
 * ────────────────────────────────────────────────────────────── */

select ok(
  has_function_privilege('authenticated', 'public.get_duel_room_players_v1(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_duel_room_players_v1(uuid)', 'EXECUTE'),
  'the masked read is for signed-in players only'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.get_duel_room_players_v1(uuid)'::regprocedure),
  'the masked read is security definer'
);

select pg_temp.as_user('00000000-0000-0000-05a1-000000000001');
create temp table sa1_playing on commit drop as
select public.get_duel_room_players_v1('00000000-0000-0000-05a3-000000000001') as rows;

select is((select jsonb_array_length(rows) from sa1_playing), 2, 'both players are returned while playing');
select is(
  (select rows->0->>'user_id' from sa1_playing), '00000000-0000-0000-05a1-000000000001',
  'rows come in join order, like fetchRoomPlayers'
);
select ok(
  (select rows->0 ?& array['path_titles', 'path_page_ids', 'path_revision_ids'] from sa1_playing),
  'my own row keeps its path'
);
select ok(
  (select not (rows->1 ?| array['path_titles', 'path_page_ids', 'path_revision_ids']) from sa1_playing),
  'the opponent row has no path while playing'
);
select ok(
  (select rows->1->>'current_title' = 'SA1 Middle'
      and (rows->1->>'move_count')::integer = 1
      and rows->1->>'player_status' = 'playing'
      and rows->1->>'nickname_snapshot' = 'SA1 Two'
      and (rows->1->>'progress_version')::integer = 1
      and rows->1 ? 'start_title' and rows->1 ? 'has_finished'
   from sa1_playing),
  'the opponent row keeps everything the 1:1 screen and session check read'
);

set local role postgres;
update public.game_rooms set status = 'starting' where id = '00000000-0000-0000-05a3-000000000001';
select pg_temp.as_user('00000000-0000-0000-05a1-000000000001');
select ok(
  not (public.get_duel_room_players_v1('00000000-0000-0000-05a3-000000000001')->1
       ?| array['path_titles', 'path_page_ids', 'path_revision_ids']),
  'the opponent path is hidden while starting too'
);

set local role postgres;
update public.game_rooms set status = 'finished' where id = '00000000-0000-0000-05a3-000000000001';
select pg_temp.as_user('00000000-0000-0000-05a1-000000000001');
select is(
  public.get_duel_room_players_v1('00000000-0000-0000-05a3-000000000001')->1->'path_titles',
  '["SA1 Start", "SA1 Middle"]'::jsonb,
  'the opponent path is revealed once the match is finished'
);

set local role postgres;
update public.game_rooms set status = 'waiting' where id = '00000000-0000-0000-05a3-000000000001';
select pg_temp.as_user('00000000-0000-0000-05a1-000000000001');
select ok(
  public.get_duel_room_players_v1('00000000-0000-0000-05a3-000000000001')->1 ? 'path_titles',
  'the waiting room is not masked (nothing has been walked yet)'
);

set local role postgres;
update public.game_rooms set status = 'playing' where id = '00000000-0000-0000-05a3-000000000001';

select pg_temp.as_user('00000000-0000-0000-05a1-000000000003');
select is(
  public.get_duel_room_players_v1('00000000-0000-0000-05a3-000000000001'), '[]'::jsonb,
  'a non-member reads nothing, as the room_players policy gives today'
);
select is(
  public.get_duel_room_players_v1('00000000-0000-0000-05a3-0000000000ff'), '[]'::jsonb,
  'an unknown room reads as empty'
);
select throws_ok(
  $$select public.get_duel_room_players_v1('00000000-0000-0000-05a3-000000000002')$$,
  'P0001', 'DUEL_ROOM_REQUIRED', 'the group room is refused'
);

set local role postgres;
reset request.jwt.claim.sub;
set local role authenticated;
select throws_ok(
  $$select public.get_duel_room_players_v1('00000000-0000-0000-05a3-000000000001')$$,
  'P0001', 'AUTH_REQUIRED', 'an unauthenticated call is refused'
);

/* ──────────────────────────────────────────────────────────────
 * 2. duel_progress signal
 * ────────────────────────────────────────────────────────────── */

set local role postgres;
select is(pg_temp.signals('00000000-0000-0000-05a3-000000000001'), 0, 'no signal before anything moves (status updates above touched game_rooms only)');

select pg_temp.as_user('00000000-0000-0000-05a1-000000000001');
select is(
  (public.heartbeat_duel_v2('00000000-0000-0000-05a3-000000000001')).progress_version, 2::bigint,
  'the heartbeat raises progress_version without a move (debt D3)'
);
set local role postgres;
select is(pg_temp.signals('00000000-0000-0000-05a3-000000000001'), 0, 'the heartbeat writes no signal');

select pg_temp.as_user('00000000-0000-0000-05a1-000000000001');
select is(
  public.apply_duel_move_v2(
    '00000000-0000-0000-05a3-000000000001', '00000000-0000-0000-05a5-000000000001',
    '00000000-0000-0000-05a5-000000000001', 2, 'sa1-middle', null, null, 'SA1 Middle',
    'NORMAL_LINK', null, null
  )->>'code',
  'APPLIED', 'player 1 moves'
);
set local role postgres;
select is(pg_temp.signals('00000000-0000-0000-05a3-000000000001'), 1, 'the move writes exactly one signal');
select ok(
  (select user_id = '00000000-0000-0000-05a1-000000000001'
      and payload->>'userId' = '00000000-0000-0000-05a1-000000000001'
      and (payload->>'progressVersion')::integer = 3
   from public.room_events
   where room_id = '00000000-0000-0000-05a3-000000000001' and event_type = 'duel_progress'),
  'the signal names the player who moved and their new version'
);
select is(
  (select array_agg(key order by key) from public.room_events, jsonb_object_keys(payload) key
   where room_id = '00000000-0000-0000-05a3-000000000001' and event_type = 'duel_progress'),
  array['progressVersion', 'serverTimestamp', 'userId'],
  'the signal payload carries no path and no page'
);

select pg_temp.as_user('00000000-0000-0000-05a1-000000000002');
select is(
  (select count(*)::integer from public.room_events
   where room_id = '00000000-0000-0000-05a3-000000000001' and event_type = 'duel_progress'
     and user_id = '00000000-0000-0000-05a1-000000000001'),
  1, 'the opponent can read the signal (it reaches them over realtime)'
);

set local role postgres;
update public.room_players set player_status = 'retired', retired_at = now(), retire_reason = 'forfeited'
where id = '00000000-0000-0000-05a4-000000000002';
select is(pg_temp.signals('00000000-0000-0000-05a3-000000000001'), 2, 'a player_status change writes a signal');

update public.room_players set updated_at = now(), last_seen_at = now()
where room_id = '00000000-0000-0000-05a3-000000000001';
select is(pg_temp.signals('00000000-0000-0000-05a3-000000000001'), 2, 'other column updates write none');

update public.room_players set current_title = 'SA1 Middle', current_page_id = 'sa1-middle', move_count = 1
where id = '00000000-0000-0000-05a4-000000000003';
select is(pg_temp.signals('00000000-0000-0000-05a3-000000000002'), 0, 'group rooms get no signal');

-- A player with no profiles row (room_players references auth.users, room_events references profiles).
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-05a1-000000000004', 'authenticated', 'authenticated', 'sa1-4@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;
delete from public.profiles where id = '00000000-0000-0000-05a1-000000000004';
insert into public.game_rooms(id, room_code, host_user_id, status, mode, min_players, max_players, use_items, state_version, reconnect_deadline_seconds, game_starts_at)
values ('00000000-0000-0000-05a3-000000000003', 'SA1NOPR', '00000000-0000-0000-05a1-000000000001', 'playing', 'duel', 2, 2, false, 1, 60, now());
insert into public.room_players(id, room_id, user_id, role, nickname_snapshot, player_status, current_title, current_page_id, move_count)
values ('00000000-0000-0000-05a4-000000000004', '00000000-0000-0000-05a3-000000000003',
        '00000000-0000-0000-05a1-000000000004', 'guest', 'SA1 Four', 'playing', 'SA1 Start', 'sa1-start', 0);
select lives_ok(
  $$update public.room_players set current_page_id = 'sa1-middle', current_title = 'SA1 Middle', move_count = 1
    where id = '00000000-0000-0000-05a4-000000000004'$$,
  'a player without a profile still moves — the signal never blocks the update'
);
select ok(
  (select user_id is null and payload->>'userId' = '00000000-0000-0000-05a1-000000000004'
   from public.room_events
   where room_id = '00000000-0000-0000-05a3-000000000003' and event_type = 'duel_progress'),
  'its signal leaves user_id empty and names the player in the payload'
);

select * from finish();
rollback;
