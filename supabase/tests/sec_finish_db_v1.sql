-- Wiki Race 2.0 SF-M1 tests (20261004090000_sec_finish_db_v1.sql, TRACKS.md §8-SEC).
-- One block per migration section. Every fixture is rolled back; this file never
-- touches a remote database.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-05f1-000000000001', 'authenticated', 'authenticated', 'sf1-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-05f1-000000000002', 'authenticated', 'authenticated', 'sf1-2@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-05f1-000000000001', 'sf1_one', 'SF1 One', 'sf1-1@local.test'),
  ('00000000-0000-0000-05f1-000000000002', 'sf1_two', 'SF1 Two', 'sf1-2@local.test')
on conflict (id) do nothing;

insert into public.wiki_pages(page_id, canonical_title)
values ('sf1-start', 'SF1 Start'), ('sf1-middle', 'SF1 Middle'), ('sf1-target', 'SF1 Target')
on conflict (page_id) do nothing;

insert into public.wiki_page_snapshots(id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-05f2-000000000001', 'sf1-start', '100', 'SF1 Start'),
  ('00000000-0000-0000-05f2-000000000002', 'sf1-middle', '200', 'SF1 Middle'),
  ('00000000-0000-0000-05f2-000000000003', 'sf1-target', '300', 'SF1 Target')
on conflict (page_id, revision_id) do nothing;

insert into public.wiki_snapshot_links(
  snapshot_id, target_page_id, target_revision_id, target_title_snapshot, link_text, ordinal
)
values
  ('00000000-0000-0000-05f2-000000000001', 'sf1-middle', '200', 'SF1 Middle', 'SF1 Middle', 0),
  ('00000000-0000-0000-05f2-000000000002', 'sf1-target', '300', 'SF1 Target', 'SF1 Target', 0)
on conflict (snapshot_id, target_page_id) do nothing;

insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  use_items, state_version, reconnect_deadline_seconds, game_starts_at
)
values (
  '00000000-0000-0000-05f3-000000000001', 'SF1DUEL',
  '00000000-0000-0000-05f1-000000000001', 'playing', 'duel', 2, 2,
  true, 1, 60, now() - interval '1 minute'
);

-- Player 2 has already walked start → middle; that path is what must not leak.
insert into public.room_players(
  id, room_id, user_id, role, nickname_snapshot, is_ready, player_status,
  start_title, target_title, current_title, move_count, has_finished,
  path_titles, last_seen_at, start_page_id, start_revision_id,
  target_page_id, target_revision_id, current_page_id, current_revision_id,
  progress_version, path_page_ids, path_revision_ids, heartbeat_at
)
values
  (
    '00000000-0000-0000-05f4-000000000001', '00000000-0000-0000-05f3-000000000001',
    '00000000-0000-0000-05f1-000000000001', 'host', 'SF1 One', false, 'playing',
    'SF1 Start', 'SF1 Target', 'SF1 Start', 0, false,
    array['SF1 Start']::text[], now(), 'sf1-start', '100',
    'sf1-target', '300', 'sf1-start', '100', 1,
    array['sf1-start']::text[], array['100']::text[], now()
  ),
  (
    '00000000-0000-0000-05f4-000000000002', '00000000-0000-0000-05f3-000000000001',
    '00000000-0000-0000-05f1-000000000002', 'guest', 'SF1 Two', false, 'playing',
    'SF1 Start', 'SF1 Target', 'SF1 Middle', 1, false,
    array['SF1 Start', 'SF1 Middle']::text[], now(), 'sf1-start', '100',
    'sf1-target', '300', 'sf1-middle', '200', 1,
    array['sf1-start', 'sf1-middle']::text[], array['100', '200']::text[], now()
  );

-- Player 2's earlier move, as the server would have written it.
insert into public.game_move_events(
  scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id, event_type,
  from_page_id, from_revision_id, from_title_snapshot, to_page_id, to_revision_id, to_title_snapshot,
  move_delta, move_count_after, version_before, version_after
)
values (
  'duel', '00000000-0000-0000-05f3-000000000001',
  '00000000-0000-0000-05f1-000000000002', '00000000-0000-0000-05f1-000000000002',
  '00000000-0000-0000-05f5-000000000002', '00000000-0000-0000-05f5-000000000002', 'NORMAL_LINK',
  'sf1-start', '100', 'SF1 Start', 'sf1-middle', '200', 'SF1 Middle', 1, 1, 0, 1
);

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claim.sub = %L', p_user::text);
end;
$$;

/* ──────────────────────────────────────────────────────────────
 * 2. debt 4 (B) — apply_duel_move_v2 returns the opponent without its path
 * ────────────────────────────────────────────────────────────── */

select pg_temp.as_user('00000000-0000-0000-05f1-000000000001');
create temp table sf1_move on commit drop as
select public.apply_duel_move_v2(
  '00000000-0000-0000-05f3-000000000001', '00000000-0000-0000-05f5-000000000001',
  '00000000-0000-0000-05f5-000000000001', 1, 'sf1-middle', null, null, 'SF1 Middle',
  'NORMAL_LINK', null, null
) as response;

select is((select response->>'code' from sf1_move), 'APPLIED', 'player 1 moves through the duel RPC');
select ok(
  (select not (response->'opponent' ?| array['path_titles', 'path_page_ids', 'path_revision_ids']) from sf1_move),
  'the move response carries no opponent path key'
);
select is(
  (select response->'opponent'->>'current_title' from sf1_move), 'SF1 Middle',
  'the opponent current document stays (public during the match, spec §4.1)'
);
select is(
  (select (response->'opponent'->>'move_count')::integer from sf1_move), 1,
  'the opponent move count stays'
);
select is(
  (select jsonb_array_length(response->'player'->'path_titles') from sf1_move), 2,
  'the actor still gets their own path'
);

/* ──────────────────────────────────────────────────────────────
 * 2. debt 4 (B) — use_duel_item_v3 returns the opponent without its path
 * ────────────────────────────────────────────────────────────── */

set local role postgres;
insert into public.duel_item_grants(id, room_id, user_id, slot_index, slot_role, item_id)
values ('00000000-0000-0000-05f6-000000000001', '00000000-0000-0000-05f3-000000000001',
        '00000000-0000-0000-05f1-000000000001', 1, 'search', 'search_once');

select pg_temp.as_user('00000000-0000-0000-05f1-000000000001');
create temp table sf1_item on commit drop as
select public.use_duel_item_v3(
  '00000000-0000-0000-05f3-000000000001', '00000000-0000-0000-05f6-000000000001',
  '00000000-0000-0000-05f5-000000000003', null
) as response;

select is((select response->>'code' from sf1_item), 'ITEM_USED', 'a self item applies');
select ok(
  (select not (response->'opponent' ?| array['path_titles', 'path_page_ids', 'path_revision_ids']) from sf1_item),
  'the item response carries no opponent path key'
);
select is(
  (select response->'opponent'->>'user_id' from sf1_item), '00000000-0000-0000-05f1-000000000002',
  'the item response still names the opponent row'
);
select is(
  (select jsonb_array_length(response->'player'->'path_titles') from sf1_item), 2,
  'the item response keeps the actor path'
);

/* ──────────────────────────────────────────────────────────────
 * 1. debt 4 (C) — a player reads only their own move rows
 * ────────────────────────────────────────────────────────────── */

select pg_temp.as_user('00000000-0000-0000-05f1-000000000001');
select is(
  (select count(*)::integer from public.game_move_events
   where game_id = '00000000-0000-0000-05f3-000000000001'
     and actor_user_id = '00000000-0000-0000-05f1-000000000002'),
  0, 'player 1 cannot read the opponent move rows'
);
select is(
  (select count(*)::integer from public.game_move_events
   where game_id = '00000000-0000-0000-05f3-000000000001'),
  1, 'player 1 reads exactly their own move row'
);

select pg_temp.as_user('00000000-0000-0000-05f1-000000000002');
select is(
  (select count(*)::integer from public.game_move_events
   where game_id = '00000000-0000-0000-05f3-000000000001'),
  1, 'player 2 reads exactly their own move row'
);

set local role postgres;
select is(
  (select count(*)::integer from public.game_move_events
   where game_id = '00000000-0000-0000-05f3-000000000001'),
  2, 'the server still sees both rows'
);
select policies_are(
  'public', 'game_move_events', array['Players can read their own move events'],
  'the member-wide read policy is gone'
);
select ok(
  (select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosrc ~ 'game_move_events'),
  'every reader of game_move_events is security definer owned by postgres, so RLS does not reach it'
);

/* ──────────────────────────────────────────────────────────────
 * 3. G2-② — no client writes to room_events
 * ────────────────────────────────────────────────────────────── */

select is(
  (select count(*)::integer from public.room_events
   where room_id = '00000000-0000-0000-05f3-000000000001' and event_type = 'duel_item_event'),
  1, 'the item RPC still writes its room_events row'
);

select pg_temp.as_user('00000000-0000-0000-05f1-000000000001');
select throws_ok(
  $$insert into public.room_events(room_id, user_id, event_type, payload)
    values ('00000000-0000-0000-05f3-000000000001', auth.uid(), 'duel_item_event', '{}')$$,
  '42501', 'permission denied for table room_events',
  'a duel player can no longer insert a room event'
);
select throws_ok(
  $$update public.room_events set payload = '{}' where room_id = '00000000-0000-0000-05f3-000000000001'$$,
  '42501', 'permission denied for table room_events',
  'a duel player cannot update room events'
);
select throws_ok(
  $$delete from public.room_events where room_id = '00000000-0000-0000-05f3-000000000001'$$,
  '42501', 'permission denied for table room_events',
  'a duel player cannot delete room events'
);
select is(
  (select count(*)::integer from public.room_events
   where room_id = '00000000-0000-0000-05f3-000000000001'),
  1, 'room members still read room events'
);

set local role postgres;
select policies_are(
  'public', 'room_events', array['Players can read events in their rooms'],
  'only the read policy remains on room_events'
);
select ok(
  not has_table_privilege('anon', 'public.room_events', 'SELECT')
  and not has_table_privilege('anon', 'public.room_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.room_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.room_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.room_events', 'DELETE')
  and has_table_privilege('authenticated', 'public.room_events', 'SELECT'),
  'room_events: authenticated keeps SELECT only, anon keeps nothing'
);
select ok(
  (select bool_and(p.prosecdef)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosrc ~* 'insert\s+into\s+(public\.)?room_events'),
  'every room_events writer is security definer'
);

/* ──────────────────────────────────────────────────────────────
 * 4. O2 — no TRUNCATE · REFERENCES · TRIGGER for the API roles
 * ────────────────────────────────────────────────────────────── */

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0, 'no table-level residue privilege is left'
);
select is(
  (select count(*)::integer from information_schema.column_privileges
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
     and privilege_type = 'REFERENCES'),
  0, 'no column-level REFERENCES is left'
);
select ok(
  not has_table_privilege('anon', 'public.game_records', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.game_records', 'TRUNCATE')
  and has_table_privilege('authenticated', 'public.game_records', 'SELECT'),
  'game_records: TRUNCATE gone, SELECT kept'
);

/* ──────────────────────────────────────────────────────────────
 * 5. O2 — a new table and sequence start with nothing for the API roles
 * ────────────────────────────────────────────────────────────── */

create table public.sf1_default_privilege_probe (id bigserial primary key);
select ok(
  not has_table_privilege('anon', 'public.sf1_default_privilege_probe', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sf1_default_privilege_probe', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sf1_default_privilege_probe', 'INSERT'),
  'a new table grants nothing to anon or authenticated by default'
);
select ok(
  not has_sequence_privilege('anon', 'public.sf1_default_privilege_probe_id_seq', 'USAGE')
  and not has_sequence_privilege('authenticated', 'public.sf1_default_privilege_probe_id_seq', 'USAGE'),
  'a new sequence grants nothing to anon or authenticated by default'
);
select ok(
  has_table_privilege('service_role', 'public.sf1_default_privilege_probe', 'SELECT'),
  'service_role keeps its default'
);

select * from finish();
rollback;
