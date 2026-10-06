-- Wiki Race 2.0 Track C contract tests for duel item server authority v3.
-- Run after 20260904090000_duel_item_authority_v3.sql (and, since 14b,
-- 20260930100000_duel_item_link_index_v3.sql) on a local Supabase database:
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
select no_plan();

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

-- ⚠ Page A above is 100% RESOLVABLE — every target has a wiki_page_snapshots row
-- and a matching target_revision_id. **That is exactly how LINK_SNAPSHOT_MISSING
-- escaped into a smoke run** `[2026-09-06]`: the fixture's destination universe was
-- fully snapshotted, real data's is not. Measured on a local stack, one snapshot had
-- 1399 links and 1 resolvable destination, and every one of 3,166 link rows carried
-- target_revision_id null (`supabase/functions/wiki-snapshot` stopped fetching them
-- on 2026-08-29). So the fixture below reproduces the shape reality actually has.
--
-- Page U — links exist and NONE can be resolved. Two different ways to be
-- unresolvable, one per branch of private.resolve_wiki_revision's WHERE clause:
--   'gone1'/'gone2'  no wiki_page_snapshots row at all, target_revision_id null
--   'p1' + 'rWRONG'  the page has a snapshot, but not at that revision
-- Page M — mixed. Exactly one resolvable target ('p2') among four links, so a
-- forced move there has precisely one legal answer and the pool can be asserted.
insert into public.wiki_pages (page_id, canonical_title)
values ('pU', 'Page U'), ('pM', 'Page M')
on conflict (page_id) do nothing;
insert into public.wiki_page_snapshots (id, page_id, revision_id, canonical_title_snapshot)
values
  ('00000000-0000-0000-0014-0000000000d1', 'pU', 'rU', 'Page U'),
  ('00000000-0000-0000-0014-0000000000d2', 'pM', 'rM', 'Page M');
insert into public.wiki_snapshot_links (snapshot_id, target_page_id, target_revision_id, target_title_snapshot, ordinal)
values
  ('00000000-0000-0000-0014-0000000000d1', 'gone1', null,     'Gone One', 0),
  ('00000000-0000-0000-0014-0000000000d1', 'gone2', null,     'Gone Two', 1),
  ('00000000-0000-0000-0014-0000000000d1', 'p1',    'rWRONG', 'Page 1',   2),
  ('00000000-0000-0000-0014-0000000000d2', 'gone3', null,     'Gone Three', 0),
  ('00000000-0000-0000-0014-0000000000d2', 'gone4', null,     'Gone Four',  1),
  ('00000000-0000-0000-0014-0000000000d2', 'p1',    'rWRONG', 'Page 1',     2),
  ('00000000-0000-0000-0014-0000000000d2', 'p2',    null,     'Page 2',     3);

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


select pg_temp.mkroom('00000000-0000-0000-0014-00000000f099','PGT099');
select pg_temp.give('00000000-0000-0000-0014-00000000f099','00000000-0000-0000-0014-000000000001',3,'joker','random_teleport') as g \gset rt_
insert into public.wiki_pages(page_id,canonical_title) values('pRandom','Random Document');
insert into public.wiki_page_snapshots(id,page_id,revision_id,canonical_title_snapshot)
values('00000000-0000-0000-0014-000000000099','pRandom','rRandom','Random Document');
insert into public.wiki_snapshot_links(snapshot_id,target_page_id,target_revision_id,target_title_snapshot,ordinal)
values('00000000-0000-0000-0014-000000000099','p2','r2','Page 2',0);
select ok(not has_function_privilege('authenticated','public.register_duel_random_destination_v1(uuid,uuid,uuid,uuid,bigint,text,text,integer)','execute'),'clients cannot register destinations');
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f099', :'rt_g','00000000-0000-0000-0014-00000000e099',null)->>'code','RANDOM_DESTINATION_REQUIRED','unprepared item is not consumed');
set local role postgres;
select ok((select consumed_at is null from public.duel_item_grants where id=:'rt_g'),'preflight keeps grant');
select is(public.register_duel_random_destination_v1('00000000-0000-0000-0014-00000000f099','00000000-0000-0000-0014-000000000001','00000000-0000-0000-0014-00000000e099',:'rt_g',0,'pRandom','rRandom',14)->>'code','RANDOM_DOCUMENT_UNAVAILABLE','invalid/current/target rejected');
select is(public.register_duel_random_destination_v1('00000000-0000-0000-0014-00000000f099','00000000-0000-0000-0014-000000000001','00000000-0000-0000-0014-00000000e099',:'rt_g',0,'pA','rA',0)->>'code','RANDOM_DOCUMENT_UNAVAILABLE','invalid/current/target rejected');
select is(public.register_duel_random_destination_v1('00000000-0000-0000-0014-00000000f099','00000000-0000-0000-0014-000000000001','00000000-0000-0000-0014-00000000e099',:'rt_g',0,'pZ','rZ',0)->>'code','RANDOM_DOCUMENT_UNAVAILABLE','invalid/current/target rejected');
select is(public.register_duel_random_destination_v1('00000000-0000-0000-0014-00000000f099','00000000-0000-0000-0014-000000000001','00000000-0000-0000-0014-00000000e099',:'rt_g',0,'pRandom','rRandom',0)->>'ok','true','trusted unrelated document prepared');
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f099', :'rt_g','00000000-0000-0000-0014-00000000e099',null)->>'result','applied','teleport applied');
select is(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f099', :'rt_g','00000000-0000-0000-0014-00000000e099',null)->>'result','applied','duplicate request replays');
set local role postgres;
select is((select current_page_id from public.room_players where room_id='00000000-0000-0000-0014-00000000f099' and user_id='00000000-0000-0000-0014-000000000001'),'pRandom','destination projected');
select is((select path_page_ids from public.room_players where room_id='00000000-0000-0000-0014-00000000f099' and user_id='00000000-0000-0000-0014-000000000001'),array['pA','pRandom'],'history preserves previous page');
select is((select progress_version from public.room_players where room_id='00000000-0000-0000-0014-00000000f099' and user_id='00000000-0000-0000-0014-000000000001'),1::bigint,'version increments once');
select is((select move_count from public.room_players where room_id='00000000-0000-0000-0014-00000000f099' and user_id='00000000-0000-0000-0014-000000000001'),1,'move count increments once');
select ok((select consumed_at is not null from public.duel_item_grants where id=:'rt_g'),'success consumes grant');
select is((select count(*) from public.duel_item_events where grant_id=:'rt_g'),1::bigint,'single consumption event');
update public.duel_item_events set server_timestamp=clock_timestamp()-interval '10 seconds' where grant_id=:'rt_g';
select pg_temp.give('00000000-0000-0000-0014-00000000f099','00000000-0000-0000-0014-000000000001',2,'defense','go_back') as g \gset back_
select pg_temp.as_user('00000000-0000-0000-0014-000000000001');
select is(public.use_duel_item_v3('00000000-0000-0000-0014-00000000f099',:'back_g','00000000-0000-0000-0014-00000000e098',null)->>'result','applied','go_back can undo teleport');
set local role postgres;
select is((select path_page_ids from public.room_players where room_id='00000000-0000-0000-0014-00000000f099' and user_id='00000000-0000-0000-0014-000000000001'),array['pA'],'undo restores prior document');
select * from finish();
rollback;
