-- LOCAL/STAGING ONLY. Requires public room discovery migration first.
-- All fixture writes are rolled back. Never run this against production.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local role postgres;
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('00000000-0000-0000-0a11-000000000001','authenticated','authenticated','publicrooms-1@local.test','{}','{}',now(),now()),
('00000000-0000-0000-0a11-000000000002','authenticated','authenticated','publicrooms-2@local.test','{}','{}',now(),now()),
('00000000-0000-0000-0a11-000000000003','authenticated','authenticated','publicrooms-3@local.test','{}','{}',now(),now())
on conflict(id) do nothing;
insert into public.profiles(id,username,nickname,synthetic_email)
values
('00000000-0000-0000-0a11-000000000001','pr-a','PR Host','publicrooms-1@local.test'),
('00000000-0000-0000-0a11-000000000002','pr-b','PR Guest','publicrooms-2@local.test'),
('00000000-0000-0000-0a11-000000000003','pr-c','PR Third','publicrooms-3@local.test')
on conflict(id) do nothing;
insert into public.game_rooms(id,room_code,host_user_id,mode,status,min_players,max_players,is_public,use_items)
values
('00000000-0000-0000-0a12-000000000001','P2PRIV','00000000-0000-0000-0a11-000000000001','duel','waiting',2,2,false,false),
('00000000-0000-0000-0a12-000000000002','P2PUBD','00000000-0000-0000-0a11-000000000001','duel','waiting',2,2,true,true),
('00000000-0000-0000-0a12-000000000003','P2PUBG','00000000-0000-0000-0a11-000000000001','group','waiting',3,3,true,false),
('00000000-0000-0000-0a12-000000000004','P2FULL','00000000-0000-0000-0a11-000000000001','duel','waiting',2,2,true,false);
insert into public.room_players(room_id,user_id,role,nickname_snapshot,is_ready)
values
('00000000-0000-0000-0a12-000000000001','00000000-0000-0000-0a11-000000000001','host','PR Host',false),
('00000000-0000-0000-0a12-000000000002','00000000-0000-0000-0a11-000000000001','host','PR Host',false),
('00000000-0000-0000-0a12-000000000003','00000000-0000-0000-0a11-000000000001','host','PR Host',false),
('00000000-0000-0000-0a12-000000000004','00000000-0000-0000-0a11-000000000001','host','PR Host',false),
('00000000-0000-0000-0a12-000000000004','00000000-0000-0000-0a11-000000000002','guest','PR Guest',false);

select ok(not has_function_privilege('anon','public.list_public_waiting_rooms_v1(text)','execute')
       and has_function_privilege('authenticated','public.list_public_waiting_rooms_v1(text)','execute'),
       'only signed-in users can discover public rooms');
select ok(not has_function_privilege('anon','public.join_public_room_v1(uuid)','execute'),
       'anonymous users cannot join public rooms');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0a11-000000000003';
select is((select count(*)::integer from public.game_rooms
           where id in ('00000000-0000-0000-0a12-000000000001'::uuid,
                        '00000000-0000-0000-0a12-000000000002'::uuid)),0,
          'nonmembers cannot read raw waiting rooms including public rooms');

select is((select count(*)::integer from public.list_public_waiting_rooms_v1('duel') r
           where r.room_id in ('00000000-0000-0000-0a12-000000000002'::uuid,
                               '00000000-0000-0000-0a12-000000000004'::uuid)),1,
          'the public duel appears but a full duel is excluded');
select is((select count(*)::integer from public.list_public_waiting_rooms_v1('group') r
           where r.room_id = '00000000-0000-0000-0a12-000000000003'::uuid),1,
          'group room appears in its own category');
select is((select count(*)::integer from public.list_public_waiting_rooms_v1(null) r
           where r.room_id = '00000000-0000-0000-0a12-000000000001'::uuid),0,
          'private room is not listed even without mode filter');

select is(public.find_room_by_code_v1('P2PRIV','duel'),
          '00000000-0000-0000-0a12-000000000001'::uuid,
          'valid private code resolves room ID but not entire row');
select throws_ok($$ select public.find_room_by_code_v1('P2PRIV','group') $$,
                 'P0001','ROOM_NOT_FOUND','incorrect mode cannot discover room');
select throws_ok($$ select public.join_public_room_v1('00000000-0000-0000-0a12-000000000001'::uuid) $$,
                 'P0001','PUBLIC_ROOM_NOT_JOINABLE','private room rejects public join');

select is(public.join_public_room_v1('00000000-0000-0000-0a12-000000000003'::uuid),
          '00000000-0000-0000-0a12-000000000003'::uuid,
          'public group join succeeds using original group join authority');
select is((select count(*)::integer from public.room_players
           where room_id = '00000000-0000-0000-0a12-000000000003'::uuid
             and user_id = auth.uid()),1,'group join inserted exactly one player');
select is(public.join_public_room_v1('00000000-0000-0000-0a12-000000000002'::uuid),
          '00000000-0000-0000-0a12-000000000002'::uuid,
          'public duel join succeeds using original duel join authority');
select throws_ok($$ select public.join_public_room_v1('00000000-0000-0000-0a12-000000000004'::uuid) $$,
                 'P0001','DUEL_ROOM_FULL','full room capacity rechecked on join');

-- Even the room owner must use the audited create RPC for visibility.
-- A joined guest has at most the same direct UPDATE rights, never more.
set local request.jwt.claim.sub = '00000000-0000-0000-0a11-000000000001';
select throws_ok(
  $ update public.game_rooms set is_public = true
     where id = '00000000-0000-0000-0a12-000000000001'::uuid $,
  'P0001','ROOM_VISIBILITY_RPC_REQUIRED',
  'joined room host cannot toggle visibility through direct UPDATE');
select throws_ok(
  $ insert into public.game_rooms(room_code,host_user_id,mode,status,min_players,max_players,is_public)
     values ('P2FORG','00000000-0000-0000-0a11-000000000001'::uuid,
             'duel','waiting',2,2,true) $,
  'P0001','ROOM_VISIBILITY_RPC_REQUIRED',
  'authenticated direct insert cannot forge a public room');

select * from finish();
rollback;
