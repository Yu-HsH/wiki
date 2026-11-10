-- Run only AFTER copying docs/ops/sql/room_emotes_v1.review.sql into
-- a CLI-generated migration and resetting an isolated Supabase database.
-- One transaction, test fixtures rolled back; never run against Production.
begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0055-000000000001','authenticated','authenticated','emotes-a@local.test','{}','{}',now(),now()),
 ('00000000-0000-0000-0055-000000000002','authenticated','authenticated','emotes-b@local.test','{}','{}',now(),now()),
 ('00000000-0000-0000-0055-000000000003','authenticated','authenticated','emotes-c@local.test','{}','{}',now(),now()),
 ('00000000-0000-0000-0055-000000000004','authenticated','authenticated','emotes-outsider@local.test','{}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(id,username,nickname,synthetic_email)
values
 ('00000000-0000-0000-0055-000000000001','emote_a_local','Emote A','emotes-a@local.test'),
 ('00000000-0000-0000-0055-000000000002','emote_b_local','Emote B','emotes-b@local.test'),
 ('00000000-0000-0000-0055-000000000003','emote_c_local','Emote C','emotes-c@local.test'),
 ('00000000-0000-0000-0055-000000000004','emote_outsider_local','Emote Outsider','emotes-outsider@local.test')
on conflict (id) do nothing;

insert into public.game_rooms(
 id,room_code,host_user_id,status,mode,min_players,max_players,
 finish_rank_limit,use_items,game_starts_at,game_deadline_at
)
values
 ('00000000-0000-0000-0055-000000000101','E2G101',
  '00000000-0000-0000-0055-000000000001','playing','group',3,3,3,false,
  now()-interval '20 seconds',now()+interval '10 minutes'),
 ('00000000-0000-0000-0055-000000000102','E2D101',
  '00000000-0000-0000-0055-000000000002','waiting','duel',2,2,3,true,null,null);

insert into public.room_players(
 room_id,user_id,role,nickname_snapshot,player_status,has_finished,finished_at
)
values
 ('00000000-0000-0000-0055-000000000101','00000000-0000-0000-0055-000000000001','host','Emote A','finished',true,now()),
 ('00000000-0000-0000-0055-000000000101','00000000-0000-0000-0055-000000000002','guest','Emote B','playing',false,null),
 ('00000000-0000-0000-0055-000000000101','00000000-0000-0000-0055-000000000003','guest','Emote C','playing',false,null),
 ('00000000-0000-0000-0055-000000000102','00000000-0000-0000-0055-000000000002','host','Emote B','waiting',false,null),
 ('00000000-0000-0000-0055-000000000102','00000000-0000-0000-0055-000000000003','guest','Emote C','waiting',false,null);

select ok(has_function_privilege('authenticated',
  'public.send_room_emote_v1(uuid,text)','EXECUTE'), 'authenticated can execute RPC');
select ok(not has_function_privilege('anon',
  'public.send_room_emote_v1(uuid,text)','EXECUTE'), 'anon cannot execute RPC');
select ok(not has_table_privilege('authenticated','public.room_events','INSERT'),
  'client direct room event insert remains revoked');
select ok(not has_table_privilege('authenticated','private.room_emote_rate_limits','SELECT'),
  'internal ledger cannot be selected by client');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0055-000000000004';
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000009999','go')->>'code',
 'ROOM_NOT_AVAILABLE', 'nonexistent room is rejected with same safe code');
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000101','go')->>'code',
 'ROOM_NOT_AVAILABLE', 'outsider cannot send');

set local request.jwt.claim.sub = '00000000-0000-0000-0055-000000000001';
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000101','cheer')->>'code',
 'EMOTE_INVALID', 'old spectator IDs are not valid common emotes');
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000101','go')->>'code',
 'ACCEPTED', 'finished group player can react while race is running');
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000101','go')->>'code',
 'EMOTE_RATE_LIMIT', 'same user repeated send is throttled atomically');

set local role postgres;
select is((select user_id::text from public.room_events
 where room_id='00000000-0000-0000-0055-000000000101'
 and event_type='room_emote' limit 1),
 '00000000-0000-0000-0055-000000000001', 'event actor comes from auth.uid');
select is((select payload->>'emoteId' from public.room_events
 where room_id='00000000-0000-0000-0055-000000000101'
 and event_type='room_emote' limit 1),
 'go', 'payload is server-owned ID');
select is((select count(*)::int from public.room_events
 where room_id='00000000-0000-0000-0055-000000000101'
 and event_type='room_emote'), 1, 'blocked send writes no extra event');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0055-000000000002';
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000101','hello')->>'code',
 'ACCEPTED', 'another joined player sends independently');
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000102','ready')->>'code',
 'ACCEPTED', 'duel waiting room uses the same API');

set local role postgres;
update public.game_rooms set game_deadline_at=now()-interval '1 second'
where id='00000000-0000-0000-0055-000000000101';
update public.game_rooms set status='finished',finished_at=now()-interval '30 seconds'
where id='00000000-0000-0000-0055-000000000102';
update private.room_emote_rate_limits set last_sent_at=now()-interval '10 seconds'
where room_id='00000000-0000-0000-0055-000000000102';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0055-000000000002';
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000101','good')->>'code',
 'ROOM_EXPIRED', 'group emote cannot outlive game deadline');
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000102','gg')->>'code',
 'ACCEPTED', 'duel results allow brief GG reactions');

set local role postgres;
update public.room_players
set player_status='retired',has_finished=false,rank=null,
    retired_at=now(),retire_reason='forfeited'
where room_id='00000000-0000-0000-0055-000000000102'
  and user_id='00000000-0000-0000-0055-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0055-000000000003';
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000102','gg')->>'code',
 'ACCEPTED', 'recently retired opponent can send sportsmanlike GG');

set local role postgres;
update public.game_rooms set finished_at=now()-interval '3 minutes'
where id='00000000-0000-0000-0055-000000000102';
set local role authenticated;
select is(public.send_room_emote_v1(
 '00000000-0000-0000-0055-000000000102','gg')->>'code',
 'ROOM_EXPIRED', 'old finished rooms cannot be spammed');

set local request.jwt.claim.sub = '00000000-0000-0000-0055-000000000004';
select is((select count(*)::int from public.room_events
 where room_id='00000000-0000-0000-0055-000000000101'
 and event_type='room_emote'),0, 'room events RLS hides reactions from outsiders');

select * from finish();
rollback;
