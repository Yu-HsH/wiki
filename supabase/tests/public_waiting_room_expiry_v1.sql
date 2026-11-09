-- LOCAL SUPABASE + pgTAP ONLY. All fixtures roll back.
-- Run after converting docs/ops/sql/public_waiting_room_expiry_v1.sql
-- into a proper locally generated migration. NEVER run on linked production.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local role postgres;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0a31-000000000001','authenticated','authenticated','ttl-host@local.test','{}','{}',now(),now()),
('00000000-0000-0000-0a31-000000000002','authenticated','authenticated','ttl-guest@local.test','{}','{}',now(),now())
on conflict(id) do nothing;
insert into public.profiles(id,username,nickname,synthetic_email)
values
('00000000-0000-0000-0a31-000000000001','ttl-host','TTL Host','ttl-host@local.test'),
('00000000-0000-0000-0a31-000000000002','ttl-guest','TTL Guest','ttl-guest@local.test')
on conflict(id) do nothing;

insert into public.game_rooms
(id,room_code,host_user_id,mode,status,min_players,max_players,
 finish_rank_limit,is_public,use_items)
values
('00000000-0000-0000-0a32-000000000001','TTL001','00000000-0000-0000-0a31-000000000001','duel','waiting',2,2,3,true,false),
('00000000-0000-0000-0a32-000000000002','TTL002','00000000-0000-0000-0a31-000000000001','group','waiting',3,3,3,true,false),
('00000000-0000-0000-0a32-000000000003','TTL003','00000000-0000-0000-0a31-000000000001','duel','waiting',2,2,3,true,false),
('00000000-0000-0000-0a32-000000000004','TTL004','00000000-0000-0000-0a31-000000000001','duel','waiting',2,2,3,false,false),
('00000000-0000-0000-0a32-000000000005','TTL005','00000000-0000-0000-0a31-000000000001','group','playing',3,3,3,true,false),
('00000000-0000-0000-0a32-000000000006','TTL006','00000000-0000-0000-0a31-000000000001','duel','waiting',2,2,3,true,false),
('00000000-0000-0000-0a32-000000000007','TTL007','00000000-0000-0000-0a31-000000000001','group','waiting',3,3,3,true,false),
('00000000-0000-0000-0a32-000000000008','TTL008','00000000-0000-0000-0a31-000000000001','duel','waiting',2,2,3,true,false);

insert into public.room_players(room_id,user_id,role,nickname_snapshot,is_ready)
select id,'00000000-0000-0000-0a31-000000000001','host','TTL Host',false
from public.game_rooms where room_code like 'TTL00%';

-- These rooms became idle 3h ago, regardless of their row creation date.
update public.room_players set last_seen_at=now()-interval '3 hours'
where room_id in (
  '00000000-0000-0000-0a32-000000000001',
  '00000000-0000-0000-0a32-000000000002',
  '00000000-0000-0000-0a32-000000000004',
  '00000000-0000-0000-0a32-000000000005',
  '00000000-0000-0000-0a32-000000000006',
  '00000000-0000-0000-0a32-000000000007'
);

select ok(not private.public_waiting_room_live_v1('00000000-0000-0000-0a32-000000000001'::uuid),
          'stale public duel is not live');
select ok(private.public_waiting_room_live_v1('00000000-0000-0000-0a32-000000000003'::uuid),
          'fresh public duel is live');
select ok(not private.public_waiting_room_live_v1('00000000-0000-0000-0a32-000000000004'::uuid),
          'private lobby is not public-live by definition');
select ok(not has_function_privilege('anon','public.heartbeat_public_waiting_room_v1(uuid)','execute')
       and has_function_privilege('authenticated','public.heartbeat_public_waiting_room_v1(uuid)','execute'),
          'heartbeat execute is authenticated-only');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0a31-000000000002';
select throws_ok(
  $$ select public.join_duel_room_v2('TTL006') $$,
  'P0001','PUBLIC_ROOM_EXPIRED','direct duel code join blocks stale public room');
select throws_ok(
  $$ select public.join_group_room('00000000-0000-0000-0a32-000000000007'::uuid) $$,
  'P0001','PUBLIC_ROOM_EXPIRED','direct group join blocks stale public room');
select throws_ok(
  $$ select public.join_public_room_v1('00000000-0000-0000-0a32-000000000001'::uuid) $$,
  'P0001','PUBLIC_ROOM_EXPIRED','public join blocks stale room under lock');
select throws_ok(
  $$ select public.find_room_by_code_v1('TTL006','duel') $$,
  'P0001','ROOM_NOT_FOUND','stale public code not discoverable to outsiders');
select throws_ok(
  $$ select public.heartbeat_public_waiting_room_v1('00000000-0000-0000-0a32-000000000003'::uuid) $$,
  'P0001','PUBLIC_ROOM_HOST_ONLY','nonhost cannot spoof active public room');

-- The list operation lazily expires stale rows and filters even lock-skipped ones.
select is(
 (select count(*)::integer from public.list_public_waiting_rooms_v1('duel')
  where room_id in (
    '00000000-0000-0000-0a32-000000000001'::uuid,
    '00000000-0000-0000-0a32-000000000003'::uuid,
    '00000000-0000-0000-0a32-000000000006'::uuid,
    '00000000-0000-0000-0a32-000000000008'::uuid)),2,
 'only the two active public duel rooms appear');

set local role postgres;
select is((select status from public.game_rooms where room_code='TTL001'),'expired',
          'list cleanup transitions idle duel to expired');
select is((select status from public.game_rooms where room_code='TTL002'),'expired',
          'list cleanup also transitions group to expired');
select is((select status from public.game_rooms where room_code='TTL004'),'waiting',
          'private waiting room is untouched');
select is((select status from public.game_rooms where room_code='TTL005'),'playing',
          'public playing match is untouched');
select is((select finished_reason from public.game_rooms where room_code='TTL002'),'cancelled',
          'group expiry is cancellation, never a match completion');
select is((select count(*)::integer from public.room_players where room_id=
 '00000000-0000-0000-0a32-000000000001'::uuid),1,
          'expired room preserves participant row for inspection');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0a31-000000000001';
select ok(public.heartbeat_public_waiting_room_v1('00000000-0000-0000-0a32-000000000003'::uuid),
          'host heartbeat renews active room');
set local role postgres;
update public.room_players set last_seen_at=now()-interval '3 hours'
where room_id='00000000-0000-0000-0a32-000000000008'::uuid;
set local role authenticated;
select ok(not public.heartbeat_public_waiting_room_v1('00000000-0000-0000-0a32-000000000008'::uuid),
          'host cannot revive a room already idle past TTL');
set local role postgres;
select is((select status from public.game_rooms where room_code='TTL008'),'expired',
          'failed renewal commits expired state without throwing');

select * from finish();
rollback;
