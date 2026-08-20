-- Wiki Race 2.0 V2 local integration tests.
-- Every fixture is rolled back; this file never touches a remote database.

begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0008-000000000001', 'authenticated', 'authenticated', 'v2-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0008-000000000002', 'authenticated', 'authenticated', 'v2-2@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0008-000000000003', 'authenticated', 'authenticated', 'v2-3@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.wiki_pages(page_id, canonical_title)
values ('v2-start', 'V2 Start'), ('v2-middle', 'V2 Middle'), ('v2-target', 'V2 Target')
on conflict (page_id) do nothing;

insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-0009-000000000001', 'v2-start', '100', 'V2 Start'),
  ('00000000-0000-0000-0009-000000000002', 'v2-middle', '200', 'V2 Middle'),
  ('00000000-0000-0000-0009-000000000003', 'v2-target', '300', 'V2 Target')
on conflict (page_id, revision_id) do nothing;

insert into public.wiki_snapshot_links(
  snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal
)
values
  ('00000000-0000-0000-0009-000000000001', 'v2-middle', '200', 'V2 Middle', 'V2 Middle', 0),
  ('00000000-0000-0000-0009-000000000002', 'v2-target', '300', 'V2 Target', 'V2 Target', 0)
on conflict (snapshot_id, target_page_id) do nothing;

insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  use_items, state_version, reconnect_deadline_seconds, game_starts_at
)
values (
  '00000000-0000-0000-000a-000000000001', 'V2DUEL1',
  '00000000-0000-0000-0008-000000000001', 'playing', 'duel', 2, 2,
  true, 7, 60, now() - interval '5 minutes'
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
    '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', true, 'playing',
    'V2 Start', 'V2 Target', 'V2 Start', 4, false,
    array['V2 Start']::text[], now(), 'v2-start', '100',
    'v2-target', '300', 'v2-start', '100', 9,
    array['v2-start']::text[], array['100']::text[], now()
  ),
  (
    '00000000-0000-0000-000b-000000000002', '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', true, 'playing',
    'V2 Start', 'V2 Target', 'V2 Start', 2, false,
    array['V2 Start']::text[], now(), 'v2-start', '100',
    'v2-target', '300', 'v2-start', '100', 4,
    array['v2-start']::text[], array['100']::text[], now()
  );

select has_column('public', 'room_players', 'path_page_ids', 'room_players stores page path array');
select has_column('public', 'room_players', 'path_revision_ids', 'room_players stores revision path array');

select ok(
  has_function_privilege('authenticated', 'public.apply_duel_swap_v2(uuid, uuid, uuid, bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.apply_duel_swap_v2(uuid, uuid, uuid, bigint)', 'EXECUTE'),
  'SWAP keeps authenticated compatibility and blocks public/anon execution'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';

select is(
  public.apply_duel_swap_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000001',
    '00000000-0000-0000-000d-000000000001',
    999
  )->>'code',
  'SWAP_DISABLED',
  'authenticated participant receives SWAP_DISABLED for any expected version'
);
select is(
  public.apply_duel_swap_v2(
    '00000000-0000-0000-000a-000000000001',
    null,
    null,
    null
  )->>'code',
  'SWAP_DISABLED',
  'authenticated SWAP calls remain disabled even without a request id'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000003';
select is(
  public.apply_duel_swap_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000001',
    '00000000-0000-0000-000d-000000000001',
    0
  )->>'code',
  'SWAP_DISABLED',
  'non-participant also receives SWAP_DISABLED without a participant lookup'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select is(
  public.apply_duel_swap_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000001',
    '00000000-0000-0000-000d-000000000001',
    0
  )->>'code',
  'SWAP_DISABLED',
  'repeated SWAP request remains disabled'
);

set local role postgres;
select is((select state_version from public.game_rooms where id = '00000000-0000-0000-000a-000000000001'), 7::bigint, 'SWAP leaves room state_version unchanged');
select is((select current_page_id from public.room_players where id = '00000000-0000-0000-000b-000000000001'), 'v2-start', 'SWAP leaves current page unchanged');
select is((select move_count from public.room_players where id = '00000000-0000-0000-000b-000000000001'), 4, 'SWAP leaves move_count unchanged');
select is((select progress_version from public.room_players where id = '00000000-0000-0000-000b-000000000001'), 9::bigint, 'SWAP leaves progress_version unchanged');
select is((select count(*)::integer from public.game_move_events where game_id = '00000000-0000-0000-000a-000000000001'), 0, 'SWAP creates no move event');
select is((select count(*)::integer from public.game_mutation_requests where game_id = '00000000-0000-0000-000a-000000000001'), 0, 'SWAP creates no idempotency row');
select is((select count(*)::integer from public.match_history where room_id = '00000000-0000-0000-000a-000000000001'), 0, 'SWAP creates no match history');

set local role postgres;
insert into public.single_game_runs(
  id, user_id, start_page_id, start_revision_id, start_title_snapshot,
  target_page_id, target_revision_id, target_title_snapshot, current_page_id,
  current_revision_id, current_title_snapshot, state_version
)
values
  ('00000000-0000-0000-0013-000000000001', '00000000-0000-0000-0008-000000000001', 'v2-start', '100', 'V2 Start', 'v2-target', '300', 'V2 Target', 'v2-start', '100', 'V2 Start', 0),
  ('00000000-0000-0000-0013-000000000002', '00000000-0000-0000-0008-000000000001', 'v2-start', '100', 'V2 Start', 'v2-target', '300', 'V2 Target', 'v2-start', '100', 'V2 Start', 0),
  ('00000000-0000-0000-0013-000000000003', '00000000-0000-0000-0008-000000000001', 'v2-middle', '200', 'V2 Middle', 'v2-target', '300', 'V2 Target', 'v2-middle', '200', 'V2 Middle', 0);

insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  use_items, state_version, game_starts_at
)
values (
  '00000000-0000-0000-0012-000000000001', 'V2GROUP1',
  '00000000-0000-0000-0008-000000000001', 'playing', 'group', 3, 3,
  false, 0, now()
);
insert into public.room_players(
  id, room_id, user_id, role, nickname_snapshot, player_status,
  start_title, target_title, current_title, start_page_id, start_revision_id,
  target_page_id, target_revision_id, current_page_id, current_revision_id,
  path_titles, path_page_ids, path_revision_ids, progress_version
)
values
  ('00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', array['V2 Start']::text[], array['v2-start']::text[], array['100']::text[], 0),
  ('00000000-0000-0000-0012-000000000002', '00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', array['V2 Start']::text[], array['v2-start']::text[], array['100']::text[], 0);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select is(
  (public.apply_single_move_v2('00000000-0000-0000-0013-000000000001', '00000000-0000-0000-0014-000000000001', '00000000-0000-0000-0015-000000000001', 0, 'v2-middle', 'forged', 'Forged', 'V2 Middle', 'NORMAL_LINK', null, null)->'event'->>'to_revision_id'),
  '200',
  'authenticated single normal link uses the cached destination revision'
);
select is(
  (public.apply_single_move_v2('00000000-0000-0000-0013-000000000002', '00000000-0000-0000-0014-000000000002', '00000000-0000-0000-0015-000000000002', 0, 'v2-target', '300', 'V2 Target', 'forged target', 'NORMAL_LINK', null, null)->>'code'),
  'LINK_NOT_ALLOWED',
  'authenticated single forged link is rejected'
);
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000002';
select throws_ok(
  $$select public.apply_single_move_v2('00000000-0000-0000-0013-000000000001', '00000000-0000-0000-0014-000000000003', '00000000-0000-0000-0015-000000000003', 1, 'v2-target', '300', 'V2 Target', 'V2 Target', 'NORMAL_LINK', null, null)$$,
  'P0001', 'RUN_NOT_FOUND',
  'authenticated user cannot access another user single run'
);
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select is(
  (public.apply_single_move_v2('00000000-0000-0000-0013-000000000001', '00000000-0000-0000-0014-000000000004', '00000000-0000-0000-0015-000000000004', 0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'),
  'STATE_VERSION_CONFLICT',
  'authenticated single stale expected_version is rejected'
);
select is(
  (public.apply_single_move_v2('00000000-0000-0000-0013-000000000003', '00000000-0000-0000-0014-000000000005', '00000000-0000-0000-0015-000000000005', 0, 'v2-target', null, null, 'V2 Target', 'NORMAL_LINK', null, null)->>'code'),
  'APPLIED',
  'authenticated single completes through a validated link'
);
select is(
  (public.apply_single_move_v2('00000000-0000-0000-0013-000000000003', '00000000-0000-0000-0014-000000000006', '00000000-0000-0000-0015-000000000006', 1, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'),
  'RUN_NOT_ACTIVE',
  'completed single run cannot move again'
);

select is(
  (public.apply_group_move_v2('00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0016-000000000001', '00000000-0000-0000-0017-000000000001', 0, 'v2-middle', 'forged', 'Forged', 'V2 Middle', 'NORMAL_LINK', null, null)->'event'->>'to_revision_id'),
  '200',
  'group normal link uses the server snapshot revision'
);
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000003';
select throws_ok(
  $$select public.apply_group_move_v2('00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0016-000000000002', '00000000-0000-0000-0017-000000000002', 0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)$$,
  'P0001', 'PLAYER_NOT_FOUND',
  'group movement rejects a user outside the room'
);
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select throws_ok(
  $$select public.apply_duel_move_v2('00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0016-000000000003', '00000000-0000-0000-0017-000000000003', 1, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)$$,
  'P0001', 'DUEL_ROOM_NOT_FOUND',
  'duel RPC rejects a group room ID cross-mode attack'
);
select throws_ok(
  $$select public.apply_group_move_v2('00000000-0000-0000-000a-000000000001', '00000000-0000-0000-0016-000000000004', '00000000-0000-0000-0017-000000000004', 0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)$$,
  'P0001', 'GROUP_ROOM_NOT_FOUND',
  'group RPC rejects a duel room ID cross-mode attack'
);

set local role authenticated;
select throws_ok(
  $$insert into public.game_rooms(room_code, host_user_id, status, mode, min_players, max_players) values ('V2FORGE', auth.uid(), 'waiting', 'duel', 2, 2)$$,
  '42501', null,
  'authenticated cannot directly insert game_rooms'
);
select ok(not has_table_privilege('authenticated', 'public.room_players', 'UPDATE'), 'authenticated cannot directly update room_players');
select ok(not has_table_privilege('authenticated', 'public.game_records', 'INSERT'), 'authenticated cannot directly insert game_records');
select ok(not has_table_privilege('authenticated', 'public.match_history', 'INSERT'), 'authenticated cannot directly insert match_history');

select throws_ok(
  $$select public.set_duel_target_v2('00000000-0000-0000-000a-000000000001', 'Changed', 'v2-middle', '200', true)$$,
  'P0001', 'DUEL_ROOM_NOT_WAITING',
  'set_duel_target_v2 rejects a playing room'
);
select throws_ok(
  $$select public.start_duel_room_v2('00000000-0000-0000-000a-000000000001')$$,
  'P0001', 'DUEL_ROOM_NOT_WAITING',
  'start_duel_room_v2 rejects a playing room'
);
select is(
  (select player_status from public.heartbeat_duel_v2('00000000-0000-0000-000a-000000000001')),
  'playing',
  'heartbeat accepts the active participant only after duel status guard'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000003';
select throws_ok(
  $$select public.heartbeat_duel_v2('00000000-0000-0000-000a-000000000001')$$,
  'P0001', 'PLAYER_NOT_FOUND',
  'non-participant cannot heartbeat a duel room'
);
select throws_ok(
  $$select public.leave_duel_room_v2('00000000-0000-0000-000a-000000000001', '00000000-0000-0000-000c-000000000002')$$,
  'P0001', 'PLAYER_NOT_FOUND',
  'non-participant cannot leave a duel room'
);

set local role postgres;
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  use_items, state_version
)
values (
  '00000000-0000-0000-000a-000000000002', 'V2DUEL2',
  '00000000-0000-0000-0008-000000000001', 'waiting', 'duel', 2, 2, true, 0
);
insert into public.room_players(
  id, room_id, user_id, role, nickname_snapshot, is_ready, player_status,
  target_title, target_page_id, target_revision_id, progress_version
)
values
  ('00000000-0000-0000-000b-000000000003', '00000000-0000-0000-000a-000000000002', '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', true, 'waiting', 'V2 Middle', 'v2-middle', '200', 0),
  ('00000000-0000-0000-000b-000000000004', '00000000-0000-0000-000a-000000000002', '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', true, 'waiting', 'V2 Target', 'v2-target', '300', 0);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select throws_ok(
  $$select public.start_duel_room_v2('00000000-0000-0000-000a-000000000002')$$,
  'P0001', 'DUEL_TARGETS_MUST_MATCH',
  'duel start rejects two different target pages'
);

set local role postgres;
update public.room_players
set target_title = 'V2 Middle', target_page_id = 'v2-middle', target_revision_id = '200'
where id = '00000000-0000-0000-000b-000000000004';
set local role authenticated;
select is(
  (select status from public.start_duel_room_v2('00000000-0000-0000-000a-000000000002')),
  'starting',
  'duel starts after server confirms one common target'
);
select is(
  (select count(*)::integer from public.room_players where room_id = '00000000-0000-0000-000a-000000000002' and target_page_id = 'v2-middle' and target_revision_id = '200'),
  2,
  'server writes the same target identity to both duel participants'
);

set local role postgres;
update public.room_players
set current_page_id = 'v2-start', current_revision_id = '100', current_title = 'V2 Start',
    move_count = 0, progress_version = 0, player_status = 'playing', has_finished = false,
    path_page_ids = array['v2-start']::text[], path_revision_ids = array['100']::text[], path_titles = array['V2 Start']::text[]
where id = '00000000-0000-0000-000b-000000000001';
delete from public.game_move_events where game_id = '00000000-0000-0000-000a-000000000001';
delete from public.game_mutation_requests where game_id = '00000000-0000-0000-000a-000000000001';
set local role authenticated;

select is(
  (public.apply_duel_move_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000010',
    '00000000-0000-0000-000d-000000000010',
    0, 'v2-middle', 'forged-revision', 'Forged title', 'V2 Middle', 'NORMAL_LINK'
  )->'event'->>'to_revision_id'),
  '200',
  'normal movement uses the cached target revision instead of client revision'
);
select is(
  (public.apply_duel_move_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000010',
    '00000000-0000-0000-000d-000000000010',
    0, 'v2-middle', 'forged-revision', 'Forged title', 'V2 Middle', 'NORMAL_LINK'
  )->>'code'),
  'APPLIED',
  'sequential duplicate request reuses the locked idempotent response'
);
select is(
  (public.apply_duel_move_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000011',
    '00000000-0000-0000-000d-000000000011',
    0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK'
  )->>'code'),
  'STATE_VERSION_CONFLICT',
  'stale expected_version is rejected without a second event'
);
select is(
  (public.apply_duel_move_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000012',
    '00000000-0000-0000-000d-000000000012',
    1, null, null, null, 'undo', 'UNDO'
  )->'event'->>'move_delta'),
  '1',
  'normal UNDO counts as a real +1 move'
);
select is(
  (public.apply_duel_move_v2(
    '00000000-0000-0000-000a-000000000001',
    '00000000-0000-0000-000c-000000000013',
    '00000000-0000-0000-000d-000000000013',
    2, null, null, null, 'undo again', 'UNDO'
  )->>'code'),
  'UNDO_UNAVAILABLE',
  'consecutive UNDO cannot undo the previous UNDO event'
);

set local role postgres;
update public.room_players
set current_page_id = 'v2-start', current_revision_id = '100', current_title = 'V2 Start',
    move_count = 0, progress_version = 0, player_status = 'playing', has_finished = false,
    path_page_ids = array['v2-start']::text[], path_revision_ids = array['100']::text[], path_titles = array['V2 Start']::text[]
where id = '00000000-0000-0000-000b-000000000001';
delete from public.game_move_events where game_id = '00000000-0000-0000-000a-000000000001';
delete from public.game_mutation_requests where game_id = '00000000-0000-0000-000a-000000000001';
set local role authenticated;
select is(
  (public.apply_duel_move_v2('00000000-0000-0000-000a-000000000001', '00000000-0000-0000-000c-000000000014', '00000000-0000-0000-000d-000000000014', 0, null, null, null, null, 'FORCED_LINK')->'event'->>'move_count_after'),
  '1',
  'forced movement increments the server move count'
);
select is(
  (public.apply_duel_move_v2('00000000-0000-0000-000a-000000000001', '00000000-0000-0000-000c-000000000015', '00000000-0000-0000-000d-000000000015', 1, null, null, null, null, 'UNDO')->'event'->>'move_delta'),
  '-1',
  'UNDO immediately after forced movement cancels its move count'
);

set local role postgres;
insert into public.single_game_runs(
  id, user_id, guest_token_hash, start_page_id, start_revision_id, start_title_snapshot,
  target_page_id, target_revision_id, target_title_snapshot, current_page_id,
  current_revision_id, current_title_snapshot, path_page_ids, path_revision_ids,
  path_title_snapshots
)
values (
  '00000000-0000-0000-000e-000000000001', null, repeat('a', 64),
  'v2-start', '100', 'V2 Start', 'v2-target', '300', 'V2 Target',
  'v2-start', '100', 'V2 Start', array['v2-start']::text[], array['100']::text[], array['V2 Start']::text[]
);
set local role service_role;
select is(
  (public.apply_guest_single_move_v2('00000000-0000-0000-000e-000000000001', repeat('a', 64), '00000000-0000-0000-000f-000000000001', '00000000-0000-0000-0010-000000000001', 0, 'v2-middle', 'V2 Middle', 'NORMAL_LINK')->>'code'),
  'APPLIED',
  'guest move applies through one hash-authenticated RPC'
);
select is(
  (public.apply_guest_single_move_v2('00000000-0000-0000-000e-000000000001', repeat('a', 64), '00000000-0000-0000-000f-000000000001', '00000000-0000-0000-0010-000000000001', 0, 'v2-middle', 'V2 Middle', 'NORMAL_LINK')->>'code'),
  'ALREADY_APPLIED',
  'guest duplicate request is idempotent after the run lock'
);
select is((select count(*)::integer from public.game_move_events where game_id = '00000000-0000-0000-000e-000000000001'), 1, 'guest duplicate creates one event');
select is((select count(*)::integer from public.game_mutation_requests where game_id = '00000000-0000-0000-000e-000000000001'), 0, 'guest movement does not create an authenticated mutation row');
select is(
  (public.apply_guest_single_move_v2('00000000-0000-0000-000e-000000000001', repeat('a', 64), '00000000-0000-0000-000f-000000000002', '00000000-0000-0000-0010-000000000002', 0, 'v2-target', 'V2 Target', 'NORMAL_LINK')->>'code'),
  'STATE_VERSION_CONFLICT',
  'guest stale expected_version is rejected'
);

set local role postgres;
insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  reconnect_deadline_seconds, game_starts_at
)
values
  ('00000000-0000-0000-0011-000000000001', 'V2TIME1', '00000000-0000-0000-0008-000000000001', 'playing', 'duel', 2, 2, 60, now() - interval '2 minutes'),
  ('00000000-0000-0000-0011-000000000002', 'V2TIME2', '00000000-0000-0000-0008-000000000001', 'playing', 'duel', 2, 2, 60, now() - interval '2 minutes'),
  ('00000000-0000-0000-0011-000000000003', 'V2TIME3', '00000000-0000-0000-0008-000000000001', 'playing', 'duel', 2, 2, 60, now() - interval '2 minutes');

insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, current_page_id,
  current_revision_id, current_title, target_page_id, target_revision_id,
  target_title, heartbeat_at, last_seen_at, progress_version
)
select room_id, user_id, role, nickname_snapshot, 'playing', 'v2-start', '100',
       'V2 Start', 'v2-target', '300', 'V2 Target', heartbeat_at, heartbeat_at, 0
from (
  values
    ('00000000-0000-0000-0011-000000000001'::uuid, '00000000-0000-0000-0008-000000000001'::uuid, 'host'::text, 'V2 One'::text, now() - interval '61 seconds'),
    ('00000000-0000-0000-0011-000000000001'::uuid, '00000000-0000-0000-0008-000000000002'::uuid, 'guest'::text, 'V2 Two'::text, now())
) as players(room_id, user_id, role, nickname_snapshot, heartbeat_at)
where room_id = '00000000-0000-0000-0011-000000000001';

insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, current_page_id,
  current_revision_id, current_title, target_page_id, target_revision_id,
  target_title, heartbeat_at, last_seen_at, progress_version
)
select room_id, user_id, role, nickname_snapshot, 'playing', 'v2-start', '100',
       'V2 Start', 'v2-target', '300', 'V2 Target', heartbeat_at, heartbeat_at, 0
from (
  values
    ('00000000-0000-0000-0011-000000000002'::uuid, '00000000-0000-0000-0008-000000000001'::uuid, 'host'::text, 'V2 One'::text, now() - interval '61 seconds'),
    ('00000000-0000-0000-0011-000000000002'::uuid, '00000000-0000-0000-0008-000000000002'::uuid, 'guest'::text, 'V2 Two'::text, now() - interval '61 seconds')
) as players(room_id, user_id, role, nickname_snapshot, heartbeat_at)
where room_id = '00000000-0000-0000-0011-000000000002';

insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, current_page_id,
  current_revision_id, current_title, target_page_id, target_revision_id,
  target_title, heartbeat_at, last_seen_at, progress_version
)
values
  ('00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', 'disconnected', 'v2-start', '100', 'V2 Start', 'v2-target', '300', 'V2 Target', now() - interval '61 seconds', now() - interval '61 seconds', 4),
  ('00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', 'playing', 'v2-start', '100', 'V2 Start', 'v2-target', '300', 'V2 Target', now(), now(), 4);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select is((select player_status from public.heartbeat_duel_v2('00000000-0000-0000-0011-000000000003')), 'playing', 'a participant returning within the deadline is restored to playing');
select is((select status from public.finalize_duel_if_expired('00000000-0000-0000-0011-000000000003')), 'playing', 'returned participant is not forfeited');
select is((select status from public.finalize_duel_if_expired('00000000-0000-0000-0011-000000000001')), 'finished', 'one expired participant produces a finished duel');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0011-000000000001'), 'forfeit', 'one timeout records FORFEIT');
set local role postgres;
select is((select result_status from public.match_history where room_id = '00000000-0000-0000-0011-000000000001'), 'forfeit', 'one timeout stores a forfeit result');
select is((select status from public.finalize_duel_if_expired('00000000-0000-0000-0011-000000000002')), 'finished', 'two expired participants finish the duel');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0011-000000000002'), 'cancelled', 'two timeouts record CANCELLED');
select is((select result_status from public.match_history where room_id = '00000000-0000-0000-0011-000000000002'), 'cancelled', 'two timeouts store a cancelled result');

-- Group completion lifecycle is exercised through apply_group_move_v2 only.
set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0008-000000000004', 'authenticated', 'authenticated', 'v2-4@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-0008-000000000001', 'v2-1', 'V2 One', 'v2-1@local.test'),
  ('00000000-0000-0000-0008-000000000002', 'v2-2', 'V2 Two', 'v2-2@local.test'),
  ('00000000-0000-0000-0008-000000000003', 'v2-3', 'V2 Three', 'v2-3@local.test'),
  ('00000000-0000-0000-0008-000000000004', 'v2-4', 'V2 Four', 'v2-4@local.test')
on conflict (id) do nothing;

insert into public.game_rooms (
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, game_duration_seconds, grace_duration_seconds, use_items,
  state_version, game_starts_at, game_deadline_at,
  group_start_title, group_start_page_id, group_start_revision_id,
  group_target_title, group_target_page_id, group_target_revision_id
)
values (
  '00000000-0000-0000-0018-000000000001', 'V2GCOMP',
  '00000000-0000-0000-0008-000000000001', 'playing', 'group', 3, 4,
  3, 1200, 120, false, 0, now() - interval '30 seconds', now() + interval '10 minutes',
  'V2 Start', 'v2-start', '100', 'V2 Target', 'v2-target', '300'
);

insert into public.room_players (
  id, room_id, user_id, role, nickname_snapshot, is_ready, player_status,
  start_title, target_title, current_title, start_page_id, start_revision_id,
  target_page_id, target_revision_id, current_page_id, current_revision_id,
  move_count, has_finished, path_titles, path_page_ids, path_revision_ids,
  progress_version, heartbeat_at, last_seen_at
)
values
  ('00000000-0000-0000-0019-000000000001', '00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', true, 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', 0, false, array['V2 Start'], array['v2-start'], array['100'], 0, now(), now()),
  ('00000000-0000-0000-0019-000000000002', '00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', true, 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', 0, false, array['V2 Start'], array['v2-start'], array['100'], 0, now(), now()),
  ('00000000-0000-0000-0019-000000000003', '00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0008-000000000003', 'guest', 'V2 Three', true, 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', 0, false, array['V2 Start'], array['v2-start'], array['100'], 0, now(), now()),
  ('00000000-0000-0000-0019-000000000004', '00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0008-000000000004', 'guest', 'V2 Four', true, 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', 0, false, array['V2 Start'], array['v2-start'], array['100'], 0, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select is(
  (public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000001', '00000000-0000-0000-0021-000000000001', 0, 'v2-middle', 'forged', 'Forged', 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'),
  'APPLIED',
  'group normal move applies through the authoritative V2 RPC'
);
select is(
  (public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000001', '00000000-0000-0000-0021-000000000001', 0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'),
  'APPLIED',
  'sequential duplicate group request reuses the stored response'
);
select is(
  (select count(*)::integer from public.game_move_events where game_id = '00000000-0000-0000-0018-000000000001' and actor_user_id = '00000000-0000-0000-0008-000000000001'),
  1,
  'duplicate group request creates one movement event'
);
select is((select current_revision_id from public.room_players where room_id = '00000000-0000-0000-0018-000000000001' and user_id = '00000000-0000-0000-0008-000000000001'), '200', 'group projection stores the server snapshot revision');
select is((select move_count from public.room_players where room_id = '00000000-0000-0000-0018-000000000001' and user_id = '00000000-0000-0000-0008-000000000001'), 1, 'group projection stores server move_count');
select is((select progress_version from public.room_players where room_id = '00000000-0000-0000-0018-000000000001' and user_id = '00000000-0000-0000-0008-000000000001'), 1::bigint, 'group projection increments progress_version');

set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000002';
select is(
  (public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000002', '00000000-0000-0000-0021-000000000002', 1, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'),
  'STATE_VERSION_CONFLICT',
  'stale group expected_version cannot change completion state'
);
select is(
  (public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000003', '00000000-0000-0000-0021-000000000003', 0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'),
  'APPLIED',
  'second group player reaches the canonical middle snapshot'
);
select is(
  (public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000004', '00000000-0000-0000-0021-000000000004', 0, 'v2-target', null, null, 'V2 Target', 'NORMAL_LINK', null, null)->>'code'),
  'STATE_VERSION_CONFLICT',
  'stale group completion request does not change the player'
);
select is((select current_page_id from public.room_players where room_id = '00000000-0000-0000-0018-000000000001' and user_id = '00000000-0000-0000-0008-000000000002'), 'v2-middle', 'stale completion leaves the current page unchanged');

select is(
  (public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000005', '00000000-0000-0000-0021-000000000005', 1, 'v2-target', 'forged', 'Forged', 'V2 Target', 'NORMAL_LINK', null, null)->>'code'),
  'APPLIED',
  'second group player completes with server target identity'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select is(
  (public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000006', '00000000-0000-0000-0021-000000000006', 1, 'v2-target', null, null, 'V2 Target', 'NORMAL_LINK', null, null)->>'code'),
  'APPLIED',
  'first group player completes after two server-validated moves'
);
select is((select status from public.game_rooms where id = '00000000-0000-0000-0018-000000000001'), 'playing', 'third finisher has not arrived yet, so the room remains playing');
select is((select finished_count from public.game_rooms where id = '00000000-0000-0000-0018-000000000001'), 2, 'finished_count is counted before the third finisher');
select is((select move_count from public.room_players where room_id = '00000000-0000-0000-0018-000000000001' and user_id = '00000000-0000-0000-0008-000000000001'), 2, 'server completion stores the authoritative move_count');
select ok((select elapsed_seconds >= 0 from public.room_players where room_id = '00000000-0000-0000-0018-000000000001' and user_id = '00000000-0000-0000-0008-000000000001'), 'server completion stores non-negative elapsed_seconds');

set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000003';
select is((public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000007', '00000000-0000-0000-0021-000000000007', 0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'), 'APPLIED', 'third player enters grace_period through the V2 RPC');
select is((public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000008', '00000000-0000-0000-0021-000000000008', 1, 'v2-target', null, null, 'V2 Target', 'NORMAL_LINK', null, null)->>'code'), 'APPLIED', 'third player completes during grace_period');

set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000004';
select is((public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000009', '00000000-0000-0000-0021-000000000009', 0, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'), 'APPLIED', 'fourth player enters grace_period through the V2 RPC');
select is((public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000010', '00000000-0000-0000-0021-000000000010', 1, 'v2-target', null, null, 'V2 Target', 'NORMAL_LINK', null, null)->>'code'), 'APPLIED', 'fourth player completes and resolves the room');
select is((select status from public.game_rooms where id = '00000000-0000-0000-0018-000000000001'), 'finished', 'all finished players close the group room');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0018-000000000001'), 'all_resolved', 'all finished players record all_resolved');
select is((select count(*)::integer from public.group_match_results where room_id = '00000000-0000-0000-0018-000000000001'), 4, 'group completion creates one result per player');
select is((select count(distinct rank)::integer from public.group_match_results where room_id = '00000000-0000-0000-0018-000000000001' and result_status = 'finished'), 4, 'sequential completion creates unique ranks');
select ok(
  (select winner_user_ids = array[
    '00000000-0000-0000-0008-000000000002'::uuid,
    '00000000-0000-0000-0008-000000000001'::uuid,
    '00000000-0000-0000-0008-000000000003'::uuid
  ] from public.game_rooms where id = '00000000-0000-0000-0018-000000000001'),
  'winner_user_ids matches the first three server ranks'
);
select ok(
  not exists (
    select 1 from public.group_match_results
    where room_id = '00000000-0000-0000-0018-000000000001'
      and is_winner is distinct from (rank <= 3)
  ),
  'group_match_results winner flags match winner_user_ids ranks'
);
select is((select count(*)::integer from public.game_move_events where game_id = '00000000-0000-0000-0018-000000000001'), 8, 'completion event count matches the eight accepted moves');
select is((public.apply_group_move_v2('00000000-0000-0000-0018-000000000001', '00000000-0000-0000-0020-000000000011', '00000000-0000-0000-0021-000000000011', 2, 'v2-middle', null, null, 'V2 Middle', 'NORMAL_LINK', null, null)->>'code'), 'GAME_NOT_ACTIVE', 'completed group room rejects additional movement');

-- Legacy lifecycle compatibility: RETIRE, grace timeout, and time limit remain server-only.
set local role postgres;
insert into public.game_rooms (
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, game_duration_seconds, grace_duration_seconds,
  use_items, game_starts_at, game_deadline_at, grace_started_at, grace_ends_at,
  group_start_title, group_target_title
)
values
  ('00000000-0000-0000-0018-000000000002', 'V2GTIME', '00000000-0000-0000-0008-000000000001', 'playing', 'group', 3, 3, 3, 1200, 120, false, now() - interval '10 minutes', now() - interval '1 second', null, null, 'V2 Start', 'V2 Target'),
  ('00000000-0000-0000-0018-000000000003', 'V2GGRACE', '00000000-0000-0000-0008-000000000001', 'grace_period', 'group', 3, 3, 3, 1200, 120, false, now() - interval '10 minutes', now() + interval '10 minutes', now() - interval '2 minutes', now() - interval '1 second', 'V2 Start', 'V2 Target'),
  ('00000000-0000-0000-0018-000000000004', 'V2GRETIRE', '00000000-0000-0000-0008-000000000001', 'playing', 'group', 3, 3, 3, 1200, 120, false, now() - interval '1 minute', now() + interval '10 minutes', null, null, 'V2 Start', 'V2 Target');

insert into public.room_players (
  room_id, user_id, role, nickname_snapshot, player_status, start_title, target_title,
  current_title, start_page_id, start_revision_id, target_page_id, target_revision_id,
  current_page_id, current_revision_id, path_titles, path_page_ids, path_revision_ids,
  heartbeat_at, last_seen_at
)
values
  ('00000000-0000-0000-0018-000000000002', '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', array['V2 Start'], array['v2-start'], array['100'], now(), now()),
  ('00000000-0000-0000-0018-000000000002', '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', array['V2 Start'], array['v2-start'], array['100'], now(), now()),
  ('00000000-0000-0000-0018-000000000003', '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', 'playing', 'V2 Start', 'V2 Target', 'V2 Target', 'v2-start', '100', 'v2-target', '300', 'v2-target', '300', array['V2 Start', 'V2 Target'], array['v2-start', 'v2-target'], array['100', '300'], now(), now()),
  ('00000000-0000-0000-0018-000000000003', '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', array['V2 Start'], array['v2-start'], array['100'], now(), now()),
  ('00000000-0000-0000-0018-000000000004', '00000000-0000-0000-0008-000000000001', 'host', 'V2 One', 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', array['V2 Start'], array['v2-start'], array['100'], now(), now()),
  ('00000000-0000-0000-0018-000000000004', '00000000-0000-0000-0008-000000000002', 'guest', 'V2 Two', 'playing', 'V2 Start', 'V2 Target', 'V2 Start', 'v2-start', '100', 'v2-target', '300', 'v2-start', '100', array['V2 Start'], array['v2-start'], array['100'], now(), now());

update public.room_players
set player_status = 'finished', has_finished = true, rank = 1, finished_at = now(), elapsed_seconds = 20
where room_id = '00000000-0000-0000-0018-000000000003'
  and user_id = '00000000-0000-0000-0008-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000001';
select is((select status from public.finalize_group_room_if_expired('00000000-0000-0000-0018-000000000002')), 'finished', 'group time limit closes the room');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0018-000000000002'), 'time_limit', 'group time limit records time_limit');
select is((select count(*)::integer from public.group_match_results where room_id = '00000000-0000-0000-0018-000000000002' and result_status = 'retired'), 2, 'group time limit retires all unresolved players');
select is((select status from public.finalize_group_room_if_expired('00000000-0000-0000-0018-000000000003')), 'finished', 'group grace timeout closes the room');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0018-000000000003'), 'grace_timeout', 'group grace timeout records grace_timeout');
select is((select player_status from public.room_players where room_id = '00000000-0000-0000-0018-000000000003' and user_id = '00000000-0000-0000-0008-000000000002'), 'retired', 'grace timeout retires the unfinished player');
select is((select status from public.leave_group_player('00000000-0000-0000-0018-000000000004', 'left')), 'playing', 'RETIRE preserves an active room while another player remains');
select is((select player_status from public.room_players where room_id = '00000000-0000-0000-0018-000000000004' and user_id = '00000000-0000-0000-0008-000000000001'), 'retired', 'RETIRE writes a retired player projection');
set local request.jwt.claim.sub = '00000000-0000-0000-0008-000000000002';
select is((select status from public.leave_group_player('00000000-0000-0000-0018-000000000004', 'left')), 'finished', 'all RETIRE participants resolve the room');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0018-000000000004'), 'all_resolved', 'all RETIRE participants record all_resolved');

select ok(
  not has_table_privilege('authenticated', 'public.game_rooms', 'INSERT')
  and not has_table_privilege('authenticated', 'public.room_players', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.game_records', 'INSERT')
  and not has_table_privilege('authenticated', 'public.group_match_results', 'INSERT')
  and not has_table_privilege('authenticated', 'public.match_history', 'INSERT'),
  'authenticated direct writes remain blocked for rooms, players, and result tables'
);
select ok(to_regprocedure('public.update_group_progress(uuid,text,integer,text[],integer)') is null, 'update_group_progress is not callable after cutover');
select ok(to_regprocedure('public.finish_group_player(uuid,integer,integer,text,text[])') is null, 'finish_group_player is not callable after cutover');

select * from finish();
rollback;
