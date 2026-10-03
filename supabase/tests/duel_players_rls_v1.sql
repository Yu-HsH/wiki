-- Wiki Race 2.0 SF-A3 tests (20261004110000_duel_players_rls_v1.sql, TRACKS.md §8-SEC).
-- Every fixture is rolled back; this file never touches a remote database.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-05b1-000000000001', 'authenticated', 'authenticated', 'sa3-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-05b1-000000000002', 'authenticated', 'authenticated', 'sa3-2@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-05b1-000000000003', 'authenticated', 'authenticated', 'sa3-3@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-05b1-000000000001', 'sa3_one', 'SA3 One', 'sa3-1@local.test'),
  ('00000000-0000-0000-05b1-000000000002', 'sa3_two', 'SA3 Two', 'sa3-2@local.test'),
  ('00000000-0000-0000-05b1-000000000003', 'sa3_three', 'SA3 Three', 'sa3-3@local.test')
on conflict (id) do nothing;

insert into public.wiki_pages(page_id, canonical_title)
values ('sa3-start', 'SA3 Start'), ('sa3-middle', 'SA3 Middle'), ('sa3-target', 'SA3 Target')
on conflict (page_id) do nothing;
insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-05b2-000000000001', 'sa3-start', '100', 'SA3 Start'),
  ('00000000-0000-0000-05b2-000000000002', 'sa3-middle', '200', 'SA3 Middle'),
  ('00000000-0000-0000-05b2-000000000003', 'sa3-target', '300', 'SA3 Target')
on conflict (page_id, revision_id) do nothing;
insert into public.wiki_snapshot_links(snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal)
values ('00000000-0000-0000-05b2-000000000001', 'sa3-middle', '200', 'SA3 Middle', 'SA3 Middle', 0)
on conflict (snapshot_id, target_page_id) do nothing;

insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  use_items, state_version, reconnect_deadline_seconds, game_starts_at
)
values (
  '00000000-0000-0000-05b3-000000000001', 'SA3DUEL',
  '00000000-0000-0000-05b1-000000000001', 'playing', 'duel', 2, 2,
  false, 1, 60, now() - interval '1 minute'
);
insert into public.room_players(
  id, room_id, user_id, role, nickname_snapshot, is_ready, player_status,
  start_title, target_title, current_title, move_count, has_finished,
  path_titles, last_seen_at, start_page_id, start_revision_id,
  target_page_id, target_revision_id, current_page_id, current_revision_id,
  progress_version, path_page_ids, path_revision_ids, heartbeat_at
)
values
  (
    '00000000-0000-0000-05b4-000000000001', '00000000-0000-0000-05b3-000000000001',
    '00000000-0000-0000-05b1-000000000001', 'host', 'SA3 One', false, 'playing',
    'SA3 Start', 'SA3 Target', 'SA3 Start', 0, false,
    array['SA3 Start']::text[], now(), 'sa3-start', '100',
    'sa3-target', '300', 'sa3-start', '100', 1,
    array['sa3-start']::text[], array['100']::text[], now()
  ),
  (
    '00000000-0000-0000-05b4-000000000002', '00000000-0000-0000-05b3-000000000001',
    '00000000-0000-0000-05b1-000000000002', 'guest', 'SA3 Two', false, 'playing',
    'SA3 Start', 'SA3 Target', 'SA3 Middle', 1, false,
    array['SA3 Start', 'SA3 Middle']::text[], now(), 'sa3-start', '100',
    'sa3-target', '300', 'sa3-middle', '200', 1,
    array['sa3-start', 'sa3-middle']::text[], array['100', '200']::text[], now()
  );

-- A playing group room with players 2 and 3: spectating needs each other's path.
insert into public.game_rooms(id, room_code, host_user_id, status, mode, min_players, max_players, finish_rank_limit, use_items)
values ('00000000-0000-0000-05b3-000000000002', 'SA3GRP', '00000000-0000-0000-05b1-000000000002', 'playing', 'group', 3, 8, 3, false);
insert into public.room_players(id, room_id, user_id, role, nickname_snapshot, player_status, current_title, move_count, path_titles)
values
  ('00000000-0000-0000-05b4-000000000003', '00000000-0000-0000-05b3-000000000002',
   '00000000-0000-0000-05b1-000000000002', 'host', 'SA3 Two', 'playing', 'SA3 Start', 0, array['SA3 Start']::text[]),
  ('00000000-0000-0000-05b4-000000000004', '00000000-0000-0000-05b3-000000000002',
   '00000000-0000-0000-05b1-000000000003', 'guest', 'SA3 Three', 'playing', 'SA3 Middle', 1, array['SA3 Start', 'SA3 Middle']::text[]);

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claim.sub = %L', p_user::text);
end;
$$;
create or replace function pg_temp.visible(p_room uuid) returns text[] language sql as $$
  select coalesce(array_agg(nickname_snapshot order by nickname_snapshot), '{}') from public.room_players where room_id = p_room;
$$;
create or replace function pg_temp.set_status(p_status text) returns void language sql as $$
  update public.game_rooms set status = p_status where id = '00000000-0000-0000-05b3-000000000001';
$$;

/* ── policy shape ── */
select policies_are('public', 'room_players',
  array['Players can view players in their room', 'Authenticated users can join duel room_players',
        'Users can update their own duel player row', 'Users can delete their own duel player row'],
  'room_players keeps the same four policy names');
select is(
  (select qual from pg_policies where tablename = 'room_players' and policyname = 'Players can view players in their room'),
  'can_view_room_player_v1(room_id, user_id)', 'the read policy goes through the helper');
select ok(
  has_function_privilege('authenticated', 'public.can_view_room_player_v1(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.can_view_room_player_v1(uuid, uuid)', 'EXECUTE')
  and (select prosecdef from pg_proc where oid = 'public.can_view_room_player_v1(uuid, uuid)'::regprocedure),
  'the helper is security definer and callable by signed-in users only');

/* ── 1:1 in progress: own row only ── */
select pg_temp.as_user('00000000-0000-0000-05b1-000000000001');
select is(pg_temp.visible('00000000-0000-0000-05b3-000000000001'), array['SA3 One'], 'playing: player 1 sees only their own row');
select is(
  (select count(*)::integer from public.room_players
   where room_id = '00000000-0000-0000-05b3-000000000001' and user_id = '00000000-0000-0000-05b1-000000000002'),
  0, 'playing: an explicit filter on the opponent returns nothing');
select pg_temp.as_user('00000000-0000-0000-05b1-000000000002');
select is(pg_temp.visible('00000000-0000-0000-05b3-000000000001'), array['SA3 Two'], 'playing: player 2 sees only their own row');

set local role postgres; select pg_temp.set_status('starting');
select pg_temp.as_user('00000000-0000-0000-05b1-000000000001');
select is(pg_temp.visible('00000000-0000-0000-05b3-000000000001'), array['SA3 One'], 'starting: own row only');

/* ── 1:1 waiting / finished: both rows ── */
set local role postgres; select pg_temp.set_status('waiting');
select pg_temp.as_user('00000000-0000-0000-05b1-000000000001');
select is(pg_temp.visible('00000000-0000-0000-05b3-000000000001'), array['SA3 One', 'SA3 Two'], 'waiting: both rows (the lobby needs the guest)');

set local role postgres; select pg_temp.set_status('finished');
select pg_temp.as_user('00000000-0000-0000-05b1-000000000001');
select is(
  (select path_titles from public.room_players
   where room_id = '00000000-0000-0000-05b3-000000000001' and user_id = '00000000-0000-0000-05b1-000000000002'),
  array['SA3 Start', 'SA3 Middle'], 'finished: the opponent row and path are readable again');

/* ── group: unchanged ── */
select pg_temp.as_user('00000000-0000-0000-05b1-000000000002');
select is(pg_temp.visible('00000000-0000-0000-05b3-000000000002'), array['SA3 Three', 'SA3 Two'], 'group playing: members see every row');
select is(
  (select path_titles from public.room_players where id = '00000000-0000-0000-05b4-000000000004'),
  array['SA3 Start', 'SA3 Middle'], 'group playing: other participants'' path stays readable (spectating)');

/* ── outsiders ── */
set local role postgres; select pg_temp.set_status('playing');
select pg_temp.as_user('00000000-0000-0000-05b1-000000000003');
select is(pg_temp.visible('00000000-0000-0000-05b3-000000000001'), '{}'::text[], 'a non-member sees no 1:1 row');
set local role anon;
select is(pg_temp.visible('00000000-0000-0000-05b3-000000000001'), '{}'::text[], 'anon sees nothing');

/* ── server paths are unaffected ── */
select pg_temp.as_user('00000000-0000-0000-05b1-000000000001');
select is(
  jsonb_array_length(public.get_duel_room_players_v1('00000000-0000-0000-05b3-000000000001')), 2,
  'the masked read still returns both players');
select ok(
  not (public.get_duel_room_players_v1('00000000-0000-0000-05b3-000000000001')->1 ? 'path_titles'),
  'and still without the opponent path');
create temp table sa3_move on commit drop as
select public.apply_duel_move_v2(
  '00000000-0000-0000-05b3-000000000001', '00000000-0000-0000-05b5-000000000001',
  '00000000-0000-0000-05b5-000000000001', 1, 'sa3-middle', null, null, 'SA3 Middle', 'NORMAL_LINK', null, null
) as response;
select is((select response->>'code' from sa3_move), 'APPLIED', 'the duel move RPC still reads the opponent internally');
select is((select response->'opponent'->>'user_id' from sa3_move), '00000000-0000-0000-05b1-000000000002',
  'and still names the opponent in its response');

select * from finish();
rollback;
