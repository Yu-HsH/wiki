-- Wiki Race 2.0 Track C contract tests for duel item server authority v3.
-- Run after 20260904090000_duel_item_authority_v3.sql on a local Supabase database:
--   docker exec -i <db container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/duel_item_authority_v3.sql
--
-- Every fixture is rolled back; this file never touches a remote database.
-- Scope mirrors TRACKS.md §8-C acceptance conditions and the P2 smoke findings.
--
-- Note on the clock: these tests rely on clock_timestamp() advancing inside one
-- transaction, which it does — that is precisely why the RPC uses it instead of
-- now(). Sequential uses by the SAME actor would still trip the 2.5s cooldown, so
-- scenarios that need an armed defense insert the ledger row directly rather than
-- burning 2.5 seconds of wall time per test.

begin;
create extension if not exists pgtap with schema extensions;
select plan(143);

set local role postgres;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0014-000000000001', 'authenticated', 'authenticated', 'duel-c1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0014-000000000002', 'authenticated', 'authenticated', 'duel-c2@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0014-000000000003', 'authenticated', 'authenticated', 'duel-c3@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-0014-000000000001', 'duel-c1', 'Duel One', 'duel-c1@local.test'),
  ('00000000-0000-0000-0014-000000000002', 'duel-c2', 'Duel Two', 'duel-c2@local.test'),
  ('00000000-0000-0000-0014-000000000003', 'duel-c3', 'Outsider', 'duel-c3@local.test')
on conflict (id) do nothing;

-- Page A links to eight pages; Page B and Page Z have none.
insert into public.wiki_pages (page_id, canonical_title)
values ('pA', 'Page A'), ('pB', 'Page B'), ('pZ', 'Page Z')
on conflict (page_id) do nothing;
insert into public.wiki_pages (page_id, canonical_title)
select 'p' || n, 'Page ' || n from generate_series(1, 8) n
on conflict (page_id) do nothing;

insert into public.wiki_page_snapshots (id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-0014-0000000000a1', 'pA', 'rA', 'Page A'),
  ('00000000-0000-0000-0014-0000000000b2', 'pB', 'rB', 'Page B'),
  ('00000000-0000-0000-0014-0000000000c1', 'pZ', 'rZ', 'Page Z');
insert into public.wiki_page_snapshots (id, page_id, revision_id, canonical_title_snapshot)
select ('00000000-0000-0000-0014-00000000010' || n)::uuid, 'p' || n, 'r' || n, 'Page ' || n
from generate_series(1, 8) n;
insert into public.wiki_snapshot_links (snapshot_id, target_page_id, target_revision_id, target_title_snapshot, ordinal)
select '00000000-0000-0000-0014-0000000000a1', 'p' || n, 'r' || n, 'Page ' || n, n - 1
from generate_series(1, 8) n;

create or replace function pg_temp.mkroom(
  p_room uuid, p_code text, p_use_items boolean default true,
  p_path text[] default array['Page A'], p_pages text[] default array['pA'],
  p_revs text[] default array['rA'], p_target text default 'pZ'
) returns void language sql as $$
  insert into public.game_rooms (id, room_code, host_user_id, status, mode,
    min_players, max_players, use_items, game_starts_at)
  values (p_room, p_code, '00000000-0000-0000-0014-000000000001', 'playing', 'duel',
    2, 2, p_use_items, now());
  insert into public.room_players (room_id, user_id, role, nickname_snapshot, is_ready,
    player_status, current_title, current_page_id, current_revision_id, target_page_id,
    move_count, path_titles, path_page_ids, path_revision_ids)
  select p_room, u.id, u.r, u.n, true, 'playing',
    p_path[array_length(p_path, 1)], p_pages[array_length(p_pages, 1)],
    p_revs[array_length(p_revs, 1)], p_target,
    array_length(p_path, 1) - 1, p_path, p_pages, p_revs
  from (values
    ('00000000-0000-0000-0014-000000000001'::uuid, 'host', 'Duel One'),
    ('00000000-0000-0000-0014-000000000002'::uuid, 'guest', 'Duel Two')
  ) as u(id, r, n);
$$;

create or replace function pg_temp.give(p_room uuid, p_user uuid, p_slot integer, p_role text, p_item text)
returns uuid language sql as $$
  insert into public.duel_item_grants(room_id, user_id, slot_index, slot_role, item_id)
  values (p_room, p_user, p_slot, p_role, p_item) returning id;
$$;

-- Arm a defense without spending 2.5s of cooldown: write the consumed grant and
-- its ledger row directly. The attack resolution is what is under test here.
create or replace function pg_temp.arm(p_room uuid, p_user uuid, p_item text, p_slot integer)
returns uuid language plpgsql as $$
declare v_grant uuid; v_event uuid;
begin
  insert into public.duel_item_grants(room_id, user_id, slot_index, slot_role, item_id)
  values (p_room, p_user, p_slot, 'defense', p_item) returning id into v_grant;
  insert into public.duel_item_events(room_id, grant_id, actor_user_id, target_user_id,
    item_id, result, effect_expires_at, request_id, correlation_id, server_timestamp)
  values (p_room, v_grant, p_user, p_user, p_item, 'applied',
    clock_timestamp() + interval '30 seconds', extensions.gen_random_uuid(),
    extensions.gen_random_uuid(), clock_timestamp() - interval '10 seconds')
  returning id into v_event;
  update public.duel_item_grants set consumed_at = now(), consumed_event_id = v_event
  where id = v_grant;
  return v_event;
end;
$$;

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claim.sub = %L', p_user::text);
end;
$$;

/* ──────────────────────────────────────────────────────────────
 * 1. DDL — two tables, named constraints, indexes, RLS.
 * ────────────────────────────────────────────────────────────── */

select has_table('public', 'duel_item_grants', 'the per-match inventory snapshot table exists');
select has_table('public', 'duel_item_events', 'the append-only consumption ledger exists');

select has_column('public', 'duel_item_grants', 'slot_index', 'the five slots are addressable');
select has_column('public', 'duel_item_grants', 'slot_role', 'each slot carries its 공격/탐색/방어/조커 role');
select has_column('public', 'duel_item_grants', 'is_wildcard', 'the 변칙 slot is distinguishable');
select has_column('public', 'duel_item_grants', 'item_id', 'the drawn item is stored');
select has_column('public', 'duel_item_grants', 'consumed_at', 'consumption is recorded on the grant');
select has_column('public', 'duel_item_grants', 'consumed_event_id', 'the grant names the ledger row that spent it');

select has_column('public', 'duel_item_events', 'grant_id', 'every ledger row names its grant');
select has_column('public', 'duel_item_events', 'actor_user_id', 'the user who spent the item');
select has_column('public', 'duel_item_events', 'target_user_id', 'the user the effect landed on');
select has_column('public', 'duel_item_events', 'result', 'applied/blocked/reflected/void');
select has_column('public', 'duel_item_events', 'effect_expires_at', 'the server owns the effect window');
select has_column('public', 'duel_item_events', 'consumed_defense_event_id', 'a spent defense is linked, not mutated');
select has_column('public', 'duel_item_events', 'move_event_id', 'item-driven movement links to game_move_events');
select has_column('public', 'duel_item_events', 'metadata', 'per-item payload such as the censored link set');
select has_column('public', 'duel_item_events', 'server_timestamp', 'the cooldown is measured from this');

-- contracts/README: "제약에 이름을 붙인다. 이름 없는 제약은 나중에 교체할 수 없다".
select ok(
  (select count(*) from pg_constraint
   where conrelid = 'public.duel_item_grants'::regclass
     and conname = any (array['duel_item_grants_slot_uq', 'duel_item_grants_item_uq',
       'duel_item_grants_slot_index_check', 'duel_item_grants_slot_role_check',
       'duel_item_grants_item_id_check', 'duel_item_grants_consumed_pair_check'])) = 6,
  'all six named constraints on duel_item_grants exist'
);
select ok(
  (select count(*) from pg_constraint
   where conrelid = 'public.duel_item_events'::regclass
     and conname = any (array['duel_item_events_grant_uq', 'duel_item_events_request_uq',
       'duel_item_events_result_check', 'duel_item_events_defense_pair_check'])) = 4,
  'all four named constraints on duel_item_events exist'
);
select ok(
  (select count(*) from pg_indexes where schemaname = 'public'
     and indexname = any (array['duel_item_grants_room_user_idx',
       'duel_item_events_actor_recent_idx', 'duel_item_events_target_effect_idx',
       'duel_item_events_consumed_defense_idx'])) = 4,
  'the four supporting indexes exist'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.duel_item_grants'::regclass),
  'RLS is enabled on duel_item_grants'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.duel_item_events'::regclass),
  'RLS is enabled on duel_item_events'
);

-- contracts/README: new tables must not join the realtime publication — that would
-- be a cutover window. Item events ride room_events, which is already published.
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('duel_item_grants', 'duel_item_events')
  ),
  'neither new table was added to the realtime publication'
);

/* ──────────────────────────────────────────────────────────────
 * 2. Catalog — ten active items in four roles.
 * ────────────────────────────────────────────────────────────── */

select is((select count(*)::integer from private.duel_item_catalog_v3()), 10,
  'the server catalog holds exactly the ten active duel items');
select is((select count(*)::integer from private.duel_item_catalog_v3() where slot_role = 'attack'), 3,
  '공격 pool: 먹물 공격 · 잘못된 링크 · 링크 검열');
select is((select count(*)::integer from private.duel_item_catalog_v3() where slot_role = 'search'), 2,
  '탐색 pool: 문서 내 검색 · 링크 미리보기');
select is((select count(*)::integer from private.duel_item_catalog_v3() where slot_role = 'defense'), 3,
  '방어 pool: 편집 보호 · 되돌리기 · 역링크');
select is((select count(*)::integer from private.duel_item_catalog_v3() where slot_role = 'joker'), 2,
  '조커 pool: 특수:임의 문서 · 역사 되감기 (문서 맞교환은 비활성)');
select ok(
  not exists (
    select 1 from private.duel_item_catalog_v3()
    where move_event_type is not null
      and move_event_type <> all (array['NORMAL_LINK', 'FORCED_LINK', 'UNDO',
        'RANDOM_TELEPORT', 'SWAP', 'REWIND'])
  ),
  'every moving item maps onto the existing game_move_events CHECK — no new event_type'
);
select is(private.duel_item_cooldown_v3(), interval '2.5 seconds',
  'the common cooldown is 2.5 seconds (spec §5.1)');
select is(
  (select duration_ms from private.duel_item_catalog_v3() where item_id = 'cleanse_shield'), 8000,
  '편집 보호 is 8s, not the old client 10s (spec §5.4, 사용자 확정 Q2)');
select is(
  (select charges from private.duel_item_catalog_v3() where item_id = 'cleanse_shield'), 1,
  '편집 보호 absorbs exactly one attack');

/* ──────────────────────────────────────────────────────────────
 * 3. Grant — five slots, symmetric roles, no duplicates, idempotent.
 * ────────────────────────────────────────────────────────────── */

select pg_temp.mkroom('00000000-0000-0000-0014-00000000f001', 'PGT001');
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select ok(
  (public.ensure_duel_item_grant_v3('00000000-0000-0000-0014-00000000f001')->>'ok')::boolean,
  'a participant can trigger the grant'
);
set local role postgres;

select is(
  (select count(*)::integer from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'), 10,
  'both players are granted in one transaction — five slots each');
select is(
  (select count(distinct cnt)::integer from (
     select user_id, count(*) as cnt from public.duel_item_grants
     where room_id = '00000000-0000-0000-0014-00000000f001' group by user_id) t), 1,
  'the two hands are the same size');
select ok(
  not exists (
    select slot_role from public.duel_item_grants
    where room_id = '00000000-0000-0000-0014-00000000f001'
    group by slot_role
    having count(*) filter (where user_id = '00000000-0000-0000-0014-000000000001')
        <> count(*) filter (where user_id = '00000000-0000-0000-0014-000000000002')
  ),
  '양쪽은 역할별 개수가 같다 — the wildcard role is drawn once for the room (spec §5.1)'
);
select ok(
  not exists (
    select 1 from public.duel_item_grants
    where room_id = '00000000-0000-0000-0014-00000000f001'
    group by user_id, item_id having count(*) > 1
  ),
  '한 플레이어에게 같은 아이템을 중복 지급하지 않는다 (spec §5.1)'
);
select ok(
  (select bool_and(slot_index between 0 and 4) from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'),
  'slot indexes stay inside the five-slot plan'
);
select ok(
  (select bool_and(is_wildcard = (slot_index = 4)) from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'),
  'exactly the last slot is the 변칙 slot'
);
select ok(
  not exists (
    select 1 from public.duel_item_grants
    where room_id = '00000000-0000-0000-0014-00000000f001'
      and is_wildcard and slot_role = 'joker'
  ),
  '변칙 슬롯에는 조커가 나오지 않는다 (spec §5.1)'
);
select ok(
  (select count(distinct slot_role)::integer from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'
     and user_id = '00000000-0000-0000-0014-000000000001'
     and not is_wildcard) = 4,
  'the four fixed slots cover 공격·탐색·방어·조커 exactly once each'
);
select ok(
  not exists (
    select 1 from public.duel_item_grants g
    where g.room_id = '00000000-0000-0000-0014-00000000f001'
      and g.item_id not in (select item_id from private.duel_item_catalog_v3())
  ),
  'nothing outside the catalog is ever granted'
);
select ok(
  not exists (
    select 1 from public.duel_item_grants
    where room_id = '00000000-0000-0000-0014-00000000f001'
      and item_id = any (array['mini_game', 'highlight_links', 'translate_current',
        'double_blind', 'swap_current'])
  ),
  '기본 지급에서 빠진 다섯(미니게임 포함)은 한 번도 나오지 않는다'
);

-- F5 re-roll: calling again must return the identical hand, not a new draw.
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.ensure_duel_item_grant_v3('00000000-0000-0000-0014-00000000f001')->'grants',
  public.ensure_duel_item_grant_v3('00000000-0000-0000-0014-00000000f001')->'grants',
  'F5 후 재추첨 금지 — the second call returns the same five slots (14 §3)'
);
set local role postgres;
select is(
  (select count(*)::integer from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'), 10,
  'and it adds no rows');

-- The opponent's call must not produce a second, different hand either.
select is(
  (select count(distinct item_id)::integer from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'
     and user_id = '00000000-0000-0000-0014-000000000002'), 5,
  'the opponent hand is five distinct items');

-- use_items = false: a non-item duel grants nothing.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f002', 'PGT002', false);
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.ensure_duel_item_grant_v3('00000000-0000-0000-0014-00000000f002')->>'code',
  'ITEMS_DISABLED',
  '비아이템전은 지급을 건너뛴다 — the deployed client had no such guard');
select is(
  jsonb_array_length(public.ensure_duel_item_grant_v3('00000000-0000-0000-0014-00000000f002')->'grants'), 0,
  'and hands back an empty inventory');
set local role postgres;
select is(
  (select count(*)::integer from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f002'), 0,
  'no grant rows exist for a non-item duel');

select pg_temp.as_user('00000000-0000-0000-0014-000000000003');
select throws_ok(
  $$select public.ensure_duel_item_grant_v3('00000000-0000-0000-0014-00000000f001')$$,
  'P0001', 'NOT_A_PARTICIPANT',
  'an outsider cannot trigger or read a grant'
);
set local role postgres;

select throws_ok(
  $$insert into public.duel_item_grants(room_id, user_id, slot_index, slot_role, item_id)
    values ('00000000-0000-0000-0014-00000000f002',
            '00000000-0000-0000-0014-000000000001', 0, 'attack', 'mini_game')$$,
  '23514', null,
  'the item_id CHECK refuses an item that is not in the duel catalog'
);
select throws_ok(
  $$insert into public.duel_item_grants(room_id, user_id, slot_index, slot_role, item_id)
    values ('00000000-0000-0000-0014-00000000f002',
            '00000000-0000-0000-0014-000000000001', 0, 'attack', 'swap_current')$$,
  '23514', null,
  'and refuses the disabled 문서 맞교환 as well'
);
select throws_ok(
  $$insert into public.duel_item_grants(room_id, user_id, slot_index, slot_role, item_id)
    values ('00000000-0000-0000-0014-00000000f002',
            '00000000-0000-0000-0014-000000000001', 7, 'attack', 'blind')$$,
  '23514', null,
  'and refuses a sixth slot'
);

/* ──────────────────────────────────────────────────────────────
 * 4. Use — the basic guards.
 * ────────────────────────────────────────────────────────────── */

select pg_temp.mkroom('00000000-0000-0000-0014-00000000f003', 'PGT003');
select pg_temp.give('00000000-0000-0000-0014-00000000f003',
  '00000000-0000-0000-0014-000000000001', 1, 'search', 'search_once') as g \gset s1_
select pg_temp.give('00000000-0000-0000-0014-00000000f003',
  '00000000-0000-0000-0014-000000000001', 2, 'defense', 'cleanse_shield') as g \gset s2_

select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f003', :'s1_g',
    '00000000-0000-0000-0014-00000000e001', null)->>'code',
  'ITEM_USED', 'a self item applies');
set local role postgres;
select is(
  (select result from public.duel_item_events where grant_id = :'s1_g'),
  'applied', 'the ledger records it as applied');
select ok(
  (select consumed_at is not null and consumed_event_id is not null
   from public.duel_item_grants where id = :'s1_g'),
  'the grant is marked consumed and names its ledger row'
);
select is(
  (select count(*)::integer from public.room_events
   where room_id = '00000000-0000-0000-0014-00000000f003'
     and event_type = 'duel_item_event'), 1,
  'exactly one room_events row is broadcast, under the single event_type (Q6)');
select ok(
  (select payload ? 'itemId' and payload ? 'result' and payload ? 'targetUserId'
      and payload ? 'actorUserId' and payload ? 'effectExpiresAt'
      and payload ? 'itemEventId' and payload ? 'serverTimestamp'
   from public.room_events
   where room_id = '00000000-0000-0000-0014-00000000f003'
     and event_type = 'duel_item_event'),
  'the payload carries the discriminating keys PACKET-CONTRACT-GAPS §3.3 listed'
);
select is(
  (select user_id from public.room_events
   where room_id = '00000000-0000-0000-0014-00000000f003' and event_type = 'duel_item_event'),
  '00000000-0000-0000-0014-000000000001'::uuid,
  'the row is attributed to the actor, so the opponent receives it over realtime');

select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f003', :'s1_g',
    '00000000-0000-0000-0014-00000000e001', null)->>'item_event_id',
  (select id::text from public.duel_item_events where grant_id = :'s1_g'),
  'the same request_id replays the stored response instead of acting twice');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f003', :'s2_g',
    '00000000-0000-0000-0014-00000000e002', null)->>'code',
  'ITEM_COOLDOWN', '2.5초 공통 쿨타임이 다음 슬롯까지 막는다 (spec §5.1)');
-- A spent slot reports ITEM_ALREADY_USED rather than ITEM_COOLDOWN: the RPC checks
-- ownership and consumption before the clock, so the client is told the specific
-- reason instead of "wait 2.5s" for a slot that will never come back.
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f003', :'s1_g',
    '00000000-0000-0000-0014-00000000e003', null)->>'code',
  'ITEM_ALREADY_USED', '모든 아이템은 1회용 — a fresh request_id cannot respend a slot');

select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f003', :'s1_g',
    '00000000-0000-0000-0014-00000000e004', null)->>'code',
  'ITEM_NOT_OWNED', 'a player cannot spend the opponent slot');
set local role postgres;
select is(
  (select count(*)::integer from public.duel_item_events where grant_id = :'s1_g'), 1,
  'and the failed attempt wrote nothing');

select pg_temp.mkroom('00000000-0000-0000-0014-00000000f004', 'PGT004');
select pg_temp.give('00000000-0000-0000-0014-00000000f004',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'blind') as g \gset s3_
update public.game_rooms set status = 'finished' where id = '00000000-0000-0000-0014-00000000f004';
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f004', :'s3_g',
    '00000000-0000-0000-0014-00000000e005', null)->>'code',
  'GAME_NOT_ACTIVE', '완주 확정 뒤 도착한 아이템 이벤트는 무효 처리한다 (spec §5.1)');
set local role postgres;
select ok(
  (select consumed_at is null from public.duel_item_grants where id = :'s3_g'),
  'and a late item is not consumed'
);

select pg_temp.mkroom('00000000-0000-0000-0014-00000000f005', 'PGT005', false);
select pg_temp.give('00000000-0000-0000-0014-00000000f005',
  '00000000-0000-0000-0014-000000000001', 0, 'attack', 'blind') as g \gset s4_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f005', :'s4_g',
    '00000000-0000-0000-0014-00000000e006', null)->>'code',
  'ITEMS_DISABLED', 'items cannot be used in a non-item duel at all');
set local role postgres;

/* ──────────────────────────────────────────────────────────────
 * 5. Interaction matrix — block, reflect, and the precedence call.
 * ────────────────────────────────────────────────────────────── */

-- 편집 보호 alone.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f006', 'PGT006');
select pg_temp.arm('00000000-0000-0000-0014-00000000f006',
  '00000000-0000-0000-0014-000000000001', 'cleanse_shield', 2) as e \gset sh_
select pg_temp.give('00000000-0000-0000-0014-00000000f006',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'blind') as g \gset at1_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f006', :'at1_g',
    '00000000-0000-0000-0014-00000000e007', null)->>'result',
  'blocked', '편집 보호가 8초 안의 첫 공격을 차단한다 (spec §5.4)');
set local role postgres;
select is(
  (select consumed_defense_event_id from public.duel_item_events where grant_id = :'at1_g'),
  :'sh_e'::uuid, 'the blocked attack names the shield it spent');
select ok(
  (select effect_expires_at is null from public.duel_item_events where grant_id = :'at1_g'),
  'a blocked attack carries no effect window — nothing landed'
);
select ok(
  (select consumed_at is not null from public.duel_item_grants where id = :'at1_g'),
  '편집 보호로 차단된 공격은 소비된다 — the attacker still loses the item (spec §5.4)'
);

-- 역링크 alone.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f007', 'PGT007');
select pg_temp.arm('00000000-0000-0000-0014-00000000f007',
  '00000000-0000-0000-0014-000000000001', 'backlink_reflect', 2) as e \gset rf_
select pg_temp.give('00000000-0000-0000-0014-00000000f007',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'blind') as g \gset at2_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f007', :'at2_g',
    '00000000-0000-0000-0014-00000000e008', null)->>'result',
  'reflected', '역링크가 첫 공격을 반사한다 (spec §5.4)');
set local role postgres;
select is(
  (select target_user_id from public.duel_item_events where grant_id = :'at2_g'),
  '00000000-0000-0000-0014-000000000002'::uuid,
  'the reflected effect lands on the attacker');
select ok(
  (select effect_expires_at is not null from public.duel_item_events where grant_id = :'at2_g'),
  'and it really applies — the attacker gets the 4s blind window'
);

-- Both live at once. 사용자 확정 2026-09-04: 편집 보호 우선.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f008', 'PGT008');
select pg_temp.arm('00000000-0000-0000-0014-00000000f008',
  '00000000-0000-0000-0014-000000000001', 'cleanse_shield', 2) as e \gset bh_
select pg_temp.arm('00000000-0000-0000-0014-00000000f008',
  '00000000-0000-0000-0014-000000000001', 'backlink_reflect', 3) as e \gset br_
select pg_temp.give('00000000-0000-0000-0014-00000000f008',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'blind') as g \gset at3_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f008', :'at3_g',
    '00000000-0000-0000-0014-00000000e009', null)->>'result',
  'blocked',
  '보호와 반사가 동시에 대기 중이면 보호가 이긴다 — 맞지 않은 공격은 반사할 수 없다 [사용자 확정 2026-09-04]');
set local role postgres;
select is(
  (select consumed_defense_event_id from public.duel_item_events where grant_id = :'at3_g'),
  :'bh_e'::uuid, 'the shield is the defense that was spent');
select ok(
  not exists (
    select 1 from public.duel_item_events where consumed_defense_event_id = :'br_e'::uuid
  ),
  '역링크는 소진되지 않고 남는다 — 보호 소진이 반사 소진보다 손해가 작다'
);

-- Jokers pass through defenses untouched (14 §4).
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f009', 'PGT009');
select pg_temp.arm('00000000-0000-0000-0014-00000000f009',
  '00000000-0000-0000-0014-000000000002', 'cleanse_shield', 2) as e \gset jh_
select pg_temp.give('00000000-0000-0000-0014-00000000f009',
  '00000000-0000-0000-0014-000000000001', 3, 'joker', 'random_teleport') as g \gset jk_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f009', :'jk_g',
    '00000000-0000-0000-0014-00000000e010', null)->>'result',
  'applied', '조커는 편집 보호·되돌리기·역링크로 막거나 취소하지 못한다 (spec §5.5)');
set local role postgres;
select ok(
  not exists (select 1 from public.duel_item_events where consumed_defense_event_id = :'jh_e'::uuid),
  'and a joker does not burn the opponent defense either'
);

/* ──────────────────────────────────────────────────────────────
 * 6. Movement — the private helper under each event type.
 * ────────────────────────────────────────────────────────────── */

select pg_temp.mkroom('00000000-0000-0000-0014-00000000f00a', 'PGT00A', true,
  array['Page A'], array['pA'], array['rA'], 'p1');
select pg_temp.give('00000000-0000-0000-0014-00000000f00a',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'random_link_move') as g \gset fl_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f00a', :'fl_g',
    '00000000-0000-0000-0014-00000000e011', null)->>'result',
  'applied', '잘못된 링크가 상대를 강제 이동시킨다');
set local role postgres;
select is(
  (select move_count from public.room_players
   where room_id = '00000000-0000-0000-0014-00000000f00a'
     and user_id = '00000000-0000-0000-0014-000000000001'), 1,
  'the victim move count goes up by one');
select is(
  (select move_count from public.room_players
   where room_id = '00000000-0000-0000-0014-00000000f00a'
     and user_id = '00000000-0000-0000-0014-000000000002'), 0,
  'the attacker does not move');
select isnt(
  (select current_page_id from public.room_players
   where room_id = '00000000-0000-0000-0014-00000000f00a'
     and user_id = '00000000-0000-0000-0014-000000000001'), 'p1',
  '자기 문서·목표 문서는 제외한다 — the victim is never pushed onto their own target (spec §5.2)');
select ok(
  (select not has_finished from public.room_players
   where room_id = '00000000-0000-0000-0014-00000000f00a'
     and user_id = '00000000-0000-0000-0014-000000000001'),
  'so an attack can never hand the victim the win'
);
select is(
  (select event_type from public.game_move_events
   where game_id = '00000000-0000-0000-0014-00000000f00a'), 'FORCED_LINK',
  'the movement is recorded under the existing FORCED_LINK event type');
select ok(
  (select item_event_id is not null from public.game_move_events
   where game_id = '00000000-0000-0000-0014-00000000f00a'),
  'game_move_events.item_event_id links the move back to its cause (20260814090000:70)'
);

-- A page with no eligible links: the item must survive.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f00b', 'PGT00B', true,
  array['Page B'], array['pB'], array['rB'], 'pZ');
select pg_temp.give('00000000-0000-0000-0014-00000000f00b',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'random_link_move') as g \gset nl_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f00b', :'nl_g',
    '00000000-0000-0000-0014-00000000e012', null)->>'code',
  'NO_ELIGIBLE_LINK', '유효 링크가 없으면 아이템을 소비하지 않는다 (14 §4)');
set local role postgres;
select ok(
  (select consumed_at is null from public.duel_item_grants where id = :'nl_g'),
  'and the grant is still spendable'
);
select is(
  (select count(*)::integer from public.duel_item_events
   where room_id = '00000000-0000-0000-0014-00000000f00b'), 0,
  'no ledger row is written for a rejected use');

-- UNDO deltas: an ordinary step costs a move, a forced one gives it back (14 §4).
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f00c', 'PGT00C', true,
  array['Page B', 'Page A'], array['pB', 'pA'], array['rB', 'rA'], 'pZ');
insert into public.game_move_events
  (scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id, event_type,
   from_page_id, from_revision_id, from_title_snapshot, to_page_id, to_revision_id,
   to_title_snapshot, move_delta, move_count_after, version_before, version_after)
values
  ('duel', '00000000-0000-0000-0014-00000000f00c', '00000000-0000-0000-0014-000000000001',
   '00000000-0000-0000-0014-000000000001', extensions.gen_random_uuid(),
   extensions.gen_random_uuid(), 'NORMAL_LINK', 'pB', 'rB', 'Page B', 'pA', 'rA', 'Page A', 1, 1, 0, 1),
  ('duel', '00000000-0000-0000-0014-00000000f00c', '00000000-0000-0000-0014-000000000002',
   '00000000-0000-0000-0014-000000000002', extensions.gen_random_uuid(),
   extensions.gen_random_uuid(), 'FORCED_LINK', 'pB', 'rB', 'Page B', 'pA', 'rA', 'Page A', 1, 1, 0, 1);
select pg_temp.give('00000000-0000-0000-0014-00000000f00c',
  '00000000-0000-0000-0014-000000000001', 2, 'defense', 'go_back') as g \gset u1_
select pg_temp.give('00000000-0000-0000-0014-00000000f00c',
  '00000000-0000-0000-0014-000000000002', 2, 'defense', 'go_back') as g \gset u2_

select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f00c', :'u1_g',
    '00000000-0000-0000-0014-00000000e013', null)->'player'->>'move_count',
  '2', '일반 상황의 되돌리기는 이동 횟수 +1 (14 §4)');
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f00c', :'u2_g',
    '00000000-0000-0000-0014-00000000e014', null)->'player'->>'move_count',
  '0', '강제 이동 직후 되돌리기는 늘어난 이동 횟수를 취소한다 (14 §4)');
set local role postgres;
select is(
  (select count(*)::integer from public.game_move_events
   where game_id = '00000000-0000-0000-0014-00000000f00c'
     and event_type = 'UNDO' and undone_event_id is not null), 2,
  'each UNDO names the event it undid');

-- 되돌리기 cannot be used on the starting document (spec §5.4).
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f00d', 'PGT00D');
select pg_temp.give('00000000-0000-0000-0014-00000000f00d',
  '00000000-0000-0000-0014-000000000001', 2, 'defense', 'go_back') as g \gset u3_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f00d', :'u3_g',
    '00000000-0000-0000-0014-00000000e015', null)->>'code',
  'UNDO_UNAVAILABLE', '되돌리기는 시작 문서에서 사용할 수 없다 (spec §5.4)');
set local role postgres;
select ok(
  (select consumed_at is null from public.duel_item_grants where id = :'u3_g'),
  'and it is not consumed'
);

-- 역사 되감기, both sides have history.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f00e', 'PGT00E', true,
  array['Page B', 'Page A'], array['pB', 'pA'], array['rB', 'rA'], 'pZ');
select pg_temp.give('00000000-0000-0000-0014-00000000f00e',
  '00000000-0000-0000-0014-000000000001', 3, 'joker', 'history_rewind') as g \gset rw1_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  jsonb_array_length(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f00e', :'rw1_g',
    '00000000-0000-0000-0014-00000000e016', null)->'metadata'->'rewoundUserIds'), 2,
  '양쪽 이력이 있으면 둘 다 직전 문서로 간다 (spec §5.5)');
set local role postgres;
select is(
  (select count(*)::integer from public.game_move_events
   where game_id = '00000000-0000-0000-0014-00000000f00e' and event_type = 'REWIND'), 2,
  'two REWIND rows are written — the CHECK value that was reserved and never used');
select ok(
  (select bool_and(move_delta = 1) from public.game_move_events
   where game_id = '00000000-0000-0000-0014-00000000f00e' and event_type = 'REWIND'),
  '양쪽 이동 +1로 기록한다 — REWIND counts forward, unlike UNDO (spec §5.5)'
);
select ok(
  (select bool_and(move_count = 2) from public.room_players
   where room_id = '00000000-0000-0000-0014-00000000f00e'),
  'and both projections agree'
);

-- 역사 되감기, only one side has history. 사용자 확정 2026-09-04: 가능한 쪽만 이동.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f00f', 'PGT00F');
update public.room_players
set path_titles = array['Page B', 'Page A'], path_page_ids = array['pB', 'pA'],
    path_revision_ids = array['rB', 'rA'], move_count = 1
where room_id = '00000000-0000-0000-0014-00000000f00f'
  and user_id = '00000000-0000-0000-0014-000000000001';
select pg_temp.give('00000000-0000-0000-0014-00000000f00f',
  '00000000-0000-0000-0014-000000000001', 3, 'joker', 'history_rewind') as g \gset rw2_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f00f', :'rw2_g',
    '00000000-0000-0000-0014-00000000e017', null)->>'code',
  'ITEM_USED',
  '한쪽만 이력이 있으면 그쪽만 이동한다 — 미소비 거부는 조커 하나를 통째로 날린다 [사용자 확정 2026-09-04]');
set local role postgres;
select is(
  (select jsonb_array_length(metadata->'rewoundUserIds') from public.duel_item_events
   where grant_id = :'rw2_g'), 1,
  'and the payload says exactly one player moved');
select is(
  (select (payload->'metadata'->'rewoundUserIds')->>0 from public.room_events
   where room_id = '00000000-0000-0000-0014-00000000f00f' and event_type = 'duel_item_event'),
  '00000000-0000-0000-0014-000000000001',
  'room_events names WHO moved, so a one-sided rewind does not read as a bug');
select is(
  (select move_count from public.room_players
   where room_id = '00000000-0000-0000-0014-00000000f00f'
     and user_id = '00000000-0000-0000-0014-000000000002'), 0,
  'the player without history stays put');

-- Neither side can rewind: nothing happened, so nothing is consumed.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f010', 'PGT010');
select pg_temp.give('00000000-0000-0000-0014-00000000f010',
  '00000000-0000-0000-0014-000000000001', 3, 'joker', 'history_rewind') as g \gset rw3_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f010', :'rw3_g',
    '00000000-0000-0000-0014-00000000e018', null)->>'code',
  'REWIND_UNAVAILABLE', 'with no history anywhere the joker is refused');
set local role postgres;
select ok(
  (select consumed_at is null from public.duel_item_grants where id = :'rw3_g'),
  'and survives to be used later'
);

/* ──────────────────────────────────────────────────────────────
 * 7. 링크 검열 — about half, never fewer than two left (spec §5.2).
 * ────────────────────────────────────────────────────────────── */

select pg_temp.mkroom('00000000-0000-0000-0014-00000000f011', 'PGT011');
select pg_temp.give('00000000-0000-0000-0014-00000000f011',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'link_censorship') as g \gset lc_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  jsonb_array_length(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f011', :'lc_g',
    '00000000-0000-0000-0014-00000000e019', null)->'metadata'->'censoredTitles'), 4,
  '8 links: about half are sealed');
set local role postgres;
select ok(
  (select effect_expires_at > clock_timestamp() + interval '5 seconds'
   from public.duel_item_events where grant_id = :'lc_g'),
  'and the seal lasts six seconds'
);
select ok(
  (select 8 - jsonb_array_length(metadata->'censoredTitles') >= 2
   from public.duel_item_events where grant_id = :'lc_g'),
  '최소 2개는 남는다'
);

-- Three links: least(3/2, 3-2) = 1 sealed, 2 left. The floor is what matters.
delete from public.wiki_snapshot_links
where snapshot_id = '00000000-0000-0000-0014-0000000000a1' and ordinal >= 3;
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f012', 'PGT012');
select pg_temp.give('00000000-0000-0000-0014-00000000f012',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'link_censorship') as g \gset lc2_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  jsonb_array_length(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f012', :'lc2_g',
    '00000000-0000-0000-0014-00000000e020', null)->'metadata'->'censoredTitles'), 1,
  '3 links: only one is sealed so two survive the minimum');

-- Two links: nothing may be sealed at all.
set local role postgres;
delete from public.wiki_snapshot_links
where snapshot_id = '00000000-0000-0000-0014-0000000000a1' and ordinal >= 2;
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f013', 'PGT013');
select pg_temp.give('00000000-0000-0000-0014-00000000f013',
  '00000000-0000-0000-0014-000000000002', 0, 'attack', 'link_censorship') as g \gset lc3_
select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  jsonb_array_length(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f013', :'lc3_g',
    '00000000-0000-0000-0014-00000000e021', null)->'metadata'->'censoredTitles'), 0,
  '2 links: nothing is sealed, because two must remain');
set local role postgres;

/* ──────────────────────────────────────────────────────────────
 * 8. Concurrency — the serialization mechanism and its constraints.
 *
 * Real two-session interleaving cannot run inside one pgTAP transaction; that is
 * covered by supabase/tests/duel_item_concurrency_v3.ps1. What is pinned here is
 * the mechanism those two sessions rely on, plus the constraints that make a lost
 * race harmless even if the mechanism were ever weakened.
 * ────────────────────────────────────────────────────────────── */

select ok(
  pg_get_functiondef('public.use_duel_item_v3(uuid, uuid, uuid, uuid)'::regprocedure)
    ~ 'from public\.game_rooms\s+where id = p_room_id and mode = ''duel''\s+for update',
  'use_duel_item_v3 takes the room row FOR UPDATE — the whole room serializes on it'
);
select ok(
  position('public.game_rooms' in
    pg_get_functiondef('public.use_duel_item_v3(uuid, uuid, uuid, uuid)'::regprocedure))
  < position('order by user_id' in
    pg_get_functiondef('public.use_duel_item_v3(uuid, uuid, uuid, uuid)'::regprocedure)),
  'and takes it BEFORE any room_players row — the order every duel RPC already uses'
);
select ok(
  pg_get_functiondef('public.use_duel_item_v3(uuid, uuid, uuid, uuid)'::regprocedure)
    ~ 'order by user_id',
  'the two player rows are locked in a fixed order as a second line of defense'
);
select ok(
  pg_get_functiondef('private.apply_duel_move_internal_v3(uuid, uuid, text, uuid, uuid, uuid)'::regprocedure)
    !~ 'public\.game_rooms[\s\S]{0,80}for update',
  'the private helper never locks game_rooms itself — the caller owns that lock, so the helper cannot invert the order'
);

-- Even if two sessions somehow both reached the write, the ledger refuses it.
select pg_temp.mkroom('00000000-0000-0000-0014-00000000f014', 'PGT014');
select pg_temp.give('00000000-0000-0000-0014-00000000f014',
  '00000000-0000-0000-0014-000000000001', 1, 'search', 'search_once') as g \gset cc_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.use_duel_item_v3('00000000-0000-0000-0014-00000000f014', :'cc_g',
    '00000000-0000-0000-0014-00000000e022', null)->>'code',
  'ITEM_USED', 'the first use of a slot succeeds');
set local role postgres;
select throws_ok(
  format($$insert into public.duel_item_events(room_id, grant_id, actor_user_id,
      target_user_id, item_id, result, request_id, correlation_id)
    values ('00000000-0000-0000-0014-00000000f014', %L,
      '00000000-0000-0000-0014-000000000001', '00000000-0000-0000-0014-000000000001',
      'search_once', 'applied', gen_random_uuid(), gen_random_uuid())$$, :'cc_g'),
  '23505', null,
  'unique(grant_id) makes a double consumption impossible even outside the RPC — 모든 아이템은 1회용'
);
select throws_ok(
  $$insert into public.duel_item_events(room_id, grant_id, actor_user_id, target_user_id,
      item_id, result, request_id, correlation_id)
    select room_id, grant_id, actor_user_id, target_user_id, item_id, 'applied',
      request_id, correlation_id
    from public.duel_item_events limit 1$$,
  '23505', null,
  'and unique(room_id, actor_user_id, request_id) refuses a replayed write'
);
select throws_ok(
  $$insert into public.duel_item_events(room_id, grant_id, actor_user_id, target_user_id,
      item_id, result, request_id, correlation_id, consumed_defense_event_id)
    values ('00000000-0000-0000-0014-00000000f014',
      (select id from public.duel_item_grants
       where room_id = '00000000-0000-0000-0014-00000000f014' limit 1),
      '00000000-0000-0000-0014-000000000001', '00000000-0000-0000-0014-000000000001',
      'blind', 'applied', gen_random_uuid(), gen_random_uuid(),
      (select id from public.duel_item_events limit 1))$$,
  '23514', null,
  'a defense can only be spent by a blocked or reflected row'
);

/* ──────────────────────────────────────────────────────────────
 * 9. RLS and ACL.
 * ────────────────────────────────────────────────────────────── */

select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  (select count(*)::integer from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'), 5,
  '상대의 미사용 아이템은 공개하지 않는다 — a player reads only their own five slots (spec §5.1)');
select is(
  (select count(*)::integer from public.duel_item_grants
   where room_id = '00000000-0000-0000-0014-00000000f001'
     and user_id = '00000000-0000-0000-0014-000000000002'), 0,
  'the opponent hand is invisible even by explicit filter');
select ok(
  (select count(*) from public.duel_item_events
   where room_id = '00000000-0000-0000-0014-00000000f006') > 0,
  'but item USES are visible to both players of the room — that is what they must agree on'
);
select throws_ok(
  $$insert into public.duel_item_grants(room_id, user_id, slot_index, slot_role, item_id)
    values ('00000000-0000-0000-0014-00000000f001',
      '00000000-0000-0000-0014-000000000001', 0, 'attack', 'blind')$$,
  '42501', null, 'a signed-in client cannot forge itself an extra item');
select throws_ok(
  $$update public.duel_item_grants set consumed_at = null$$,
  '42501', null, 'nor un-consume a spent slot');
select throws_ok(
  $$delete from public.duel_item_grants$$,
  '42501', null, 'nor erase the record of what it was given');
select throws_ok(
  $$insert into public.duel_item_events(room_id, grant_id, actor_user_id, target_user_id,
      item_id, result, request_id, correlation_id)
    values ('00000000-0000-0000-0014-00000000f001',
      (select id from public.duel_item_grants limit 1),
      '00000000-0000-0000-0014-000000000001', '00000000-0000-0000-0014-000000000002',
      'blind', 'applied', gen_random_uuid(), gen_random_uuid())$$,
  '42501', null, 'a signed-in client cannot forge an item event');
select throws_ok(
  $$update public.duel_item_events set result = 'blocked'$$,
  '42501', null, 'nor rewrite an outcome the server settled');
select throws_ok(
  $$delete from public.duel_item_events$$,
  '42501', null, 'nor erase the ledger');
select throws_ok(
  $$select private.apply_duel_move_internal_v3(
      '00000000-0000-0000-0014-00000000f001',
      '00000000-0000-0000-0014-000000000002', 'FORCED_LINK',
      gen_random_uuid(), gen_random_uuid(), null)$$,
  '42501', null,
  'a client cannot call the movement helper directly and push the opponent around');
select throws_ok(
  $$select private.duel_item_catalog_v3()$$,
  '42501', null, 'nor read the server catalog function');

set local role postgres;
select ok(
  has_function_privilege('authenticated', 'public.use_duel_item_v3(uuid, uuid, uuid, uuid)', 'execute'),
  'authenticated may call the item RPC'
);
select ok(
  not has_function_privilege('anon', 'public.use_duel_item_v3(uuid, uuid, uuid, uuid)', 'execute'),
  'anon may not — 1:1 has no guest path, so no ensure_today_daily_challenge exception applies'
);
select ok(
  not has_function_privilege('anon', 'public.ensure_duel_item_grant_v3(uuid)', 'execute'),
  'and anon cannot trigger a grant either'
);
select ok(
  not has_function_privilege('anon', 'public.get_duel_item_state_v3(uuid)', 'execute'),
  'nor read duel item state'
);
select ok(
  (select proacl is not null from pg_proc
   where oid = 'public.use_duel_item_v3(uuid, uuid, uuid, uuid)'::regprocedure),
  'the RPC has an explicit ACL — the default PUBLIC EXECUTE was revoked'
);
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
   where oid = any (array[
     'public.use_duel_item_v3(uuid, uuid, uuid, uuid)'::regprocedure,
     'public.ensure_duel_item_grant_v3(uuid)'::regprocedure,
     'public.get_duel_item_state_v3(uuid)'::regprocedure])),
  'all three RPCs are security definer with an empty search_path (contracts/README)'
);
select ok(
  (select bool_and(prorettype = 'jsonb'::regtype) from pg_proc
   where oid = any (array[
     'public.use_duel_item_v3(uuid, uuid, uuid, uuid)'::regprocedure,
     'public.ensure_duel_item_grant_v3(uuid)'::regprocedure,
     'public.get_duel_item_state_v3(uuid)'::regprocedure])),
  'and all three return jsonb'
);

/* ──────────────────────────────────────────────────────────────
 * 10. 문서 맞교환 stays disabled — the v2 stub is untouched.
 * ────────────────────────────────────────────────────────────── */

select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  public.apply_duel_swap_v2('00000000-0000-0000-0014-00000000f001',
    '00000000-0000-0000-0014-00000000e030', '00000000-0000-0000-0014-00000000c030', 0)->>'code',
  'SWAP_DISABLED',
  'apply_duel_swap_v2 still refuses everything — v3 did not re-enable SWAP (G7: 비활성 유지)');
set local role postgres;
select ok(
  not exists (select 1 from private.duel_item_catalog_v3() where item_id = 'swap_current'),
  'and 문서 맞교환 is absent from the v3 catalog, so it can never be granted'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.game_move_events'::regclass
      and pg_get_constraintdef(oid) like '%SWAP%'
  ),
  'the SWAP event type stays reserved in the CHECK for a later packet'
);

/* ──────────────────────────────────────────────────────────────
 * 11. get_duel_item_state_v3 — refresh recovery.
 * ────────────────────────────────────────────────────────────── */

select pg_temp.as_user('00000000-0000-0000-0014-000000000002');
select is(
  jsonb_array_length(
    public.get_duel_item_state_v3('00000000-0000-0000-0014-00000000f006')->'pending_defenses'), 0,
  'a spent shield no longer counts as a pending defense');
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(
  jsonb_array_length(
    public.get_duel_item_state_v3('00000000-0000-0000-0014-00000000f008')->'pending_defenses'), 1,
  'but the reflect that the shield saved is still armed');
select ok(
  (public.get_duel_item_state_v3('00000000-0000-0000-0014-00000000f003')->>'cooldown_until')
    is not null,
  'the cooldown is recomputed from the ledger, so F5 cannot clear it'
);
select is(
  jsonb_array_length(
    public.get_duel_item_state_v3('00000000-0000-0000-0014-00000000f001')->'grants'), 5,
  '새로고침 복구 — the five slots come back from the server, not from localStorage');
select is(
  public.get_duel_item_state_v3('00000000-0000-0000-0014-00000000f002')->>'use_items',
  'false', 'and a non-item duel reports itself as such');

set local role postgres;

select * from finish();
rollback;
