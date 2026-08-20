-- Packet 13 Hardening: single-session contract tests for the JSONB rejection
-- returned after an expired spectator request finalizes the room.

begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0031-000000000001', 'authenticated', 'authenticated', 'atomic-hard-spectator@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0031-000000000002', 'authenticated', 'authenticated', 'atomic-hard-active-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0031-000000000003', 'authenticated', 'authenticated', 'atomic-hard-active-2@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0032-000000000001', 'authenticated', 'authenticated', 'atomic-grace-spectator@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0032-000000000002', 'authenticated', 'authenticated', 'atomic-grace-active-1@local.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0032-000000000003', 'authenticated', 'authenticated', 'atomic-grace-active-2@local.test', '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, nickname, synthetic_email)
values
  ('00000000-0000-0000-0031-000000000001', 'atomic-hard-spectator', 'Atomic Hard Spectator', 'atomic-hard-spectator@local.test'),
  ('00000000-0000-0000-0031-000000000002', 'atomic-hard-active-1', 'Atomic Hard Active One', 'atomic-hard-active-1@local.test'),
  ('00000000-0000-0000-0031-000000000003', 'atomic-hard-active-2', 'Atomic Hard Active Two', 'atomic-hard-active-2@local.test'),
  ('00000000-0000-0000-0032-000000000001', 'atomic-grace-spectator', 'Atomic Grace Spectator', 'atomic-grace-spectator@local.test'),
  ('00000000-0000-0000-0032-000000000002', 'atomic-grace-active-1', 'Atomic Grace Active One', 'atomic-grace-active-1@local.test'),
  ('00000000-0000-0000-0032-000000000003', 'atomic-grace-active-2', 'Atomic Grace Active Two', 'atomic-grace-active-2@local.test')
on conflict (id) do nothing;

insert into public.game_rooms(
  id, room_code, host_user_id, status, mode, min_players, max_players,
  finish_rank_limit, use_items, game_duration_seconds, grace_duration_seconds,
  game_starts_at, game_deadline_at, grace_started_at, grace_ends_at, finished_count
)
values
  (
    '00000000-0000-0000-0030-000000000001', 'ATOMIC-HARD',
    '00000000-0000-0000-0031-000000000001', 'playing', 'group', 3, 3,
    3, false, 1200, 120, now() - interval '20 seconds',
    now() - interval '1 second', null, null, 1
  ),
  (
    '00000000-0000-0000-0030-000000000002', 'ATOMIC-GRACE',
    '00000000-0000-0000-0032-000000000001', 'grace_period', 'group', 3, 3,
    3, false, 1200, 120, now() - interval '20 seconds',
    now() + interval '10 minutes', now() - interval '3 seconds',
    now() - interval '1 second', 1
  );

insert into public.room_players(
  room_id, user_id, role, nickname_snapshot, player_status, has_finished,
  rank, finished_at, start_title, target_title, current_title, path_titles
)
values
  ('00000000-0000-0000-0030-000000000001', '00000000-0000-0000-0031-000000000001', 'host', 'Atomic Hard Spectator', 'finished', true, 1, now(), 'Start', 'Target', 'Target', array['Start','Target']),
  ('00000000-0000-0000-0030-000000000001', '00000000-0000-0000-0031-000000000002', 'guest', 'Atomic Hard Active One', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']),
  ('00000000-0000-0000-0030-000000000001', '00000000-0000-0000-0031-000000000003', 'guest', 'Atomic Hard Active Two', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']),
  ('00000000-0000-0000-0030-000000000002', '00000000-0000-0000-0032-000000000001', 'host', 'Atomic Grace Spectator', 'finished', true, 1, now(), 'Start', 'Target', 'Target', array['Start','Target']),
  ('00000000-0000-0000-0030-000000000002', '00000000-0000-0000-0032-000000000002', 'guest', 'Atomic Grace Active One', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']),
  ('00000000-0000-0000-0030-000000000002', '00000000-0000-0000-0032-000000000003', 'guest', 'Atomic Grace Active Two', 'playing', false, null, null, 'Start', 'Target', 'Start', array['Start']);

insert into public.group_match_results(
  room_id, user_id, nickname_snapshot, result_status, rank, is_winner,
  start_title, target_title, current_title, move_count, path_titles,
  finished_at, finalized_at
)
values
  ('00000000-0000-0000-0030-000000000001', '00000000-0000-0000-0031-000000000001', 'Atomic Hard Spectator', 'finished', 1, true, 'Start', 'Target', 'Target', 1, array['Start','Target'], now(), now()),
  ('00000000-0000-0000-0030-000000000002', '00000000-0000-0000-0032-000000000001', 'Atomic Grace Spectator', 'finished', 1, true, 'Start', 'Target', 'Target', 1, array['Start','Target'], now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0031-000000000001';
select is(
  (public.send_group_spectator_emoji_v13('00000000-0000-0000-0030-000000000001', 'cheer')->>'accepted'),
  'false',
  'expired hard-deadline emoji returns a structured rejection'
);
select is(
  (public.send_group_spectator_emoji_v13('00000000-0000-0000-0030-000000000001', 'cheer')->>'code'),
  'SPECTATOR_ROOM_EXPIRED',
  'hard-deadline rejection has the expired code'
);
select is(
  (public.send_group_spectator_emoji_v13('00000000-0000-0000-0030-000000000001', 'cheer')->>'finalized'),
  'false',
  'repeated hard-deadline rejection is idempotent after the first call'
);

set local role postgres;
select is((select status from public.game_rooms where id = '00000000-0000-0000-0030-000000000001'), 'finished', 'hard-deadline emoji commits room finalization');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0030-000000000001'), 'time_limit', 'hard-deadline emoji uses time_limit finalization');
select is((select count(*)::integer from public.group_match_results where room_id = '00000000-0000-0000-0030-000000000001'), 3, 'hard-deadline finalization preserves and creates results');
select is((select count(*)::integer from public.room_events where room_id = '00000000-0000-0000-0030-000000000001' and event_type = 'game_end'), 1, 'hard-deadline finalization creates one game_end');
select is((select count(*)::integer from public.room_events where room_id = '00000000-0000-0000-0030-000000000001' and event_type = 'group_spectator_emoji'), 0, 'hard-deadline emoji creates no emoji event');
select is((select count(*)::integer from public.group_spectator_emoji_rate_limits where room_id = '00000000-0000-0000-0030-000000000001'), 0, 'hard-deadline emoji consumes no rate ledger');
select is((select count(*)::integer from public.room_events where room_id = '00000000-0000-0000-0030-000000000001' and event_type = 'player_retired'), 2, 'hard-deadline finalization retires both unresolved players once');
select is((select (host_user_id = '00000000-0000-0000-0031-000000000001'::uuid)::integer from public.game_rooms where id = '00000000-0000-0000-0030-000000000001'), 1, 'hard-deadline finalization preserves the finished spectator host');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0032-000000000001';
select is(
  (public.send_group_spectator_emoji_v13('00000000-0000-0000-0030-000000000002', 'cheer')->>'accepted'),
  'false',
  'expired grace-deadline emoji returns a structured rejection'
);
select is(
  (public.send_group_spectator_emoji_v13('00000000-0000-0000-0030-000000000002', 'cheer')->>'code'),
  'SPECTATOR_ROOM_EXPIRED',
  'grace-deadline rejection has the expired code'
);
select is(
  (public.send_group_spectator_emoji_v13('00000000-0000-0000-0030-000000000002', 'cheer')->>'finalized'),
  'false',
  'repeated grace-deadline rejection is idempotent after the first call'
);

set local role postgres;
select is((select status from public.game_rooms where id = '00000000-0000-0000-0030-000000000002'), 'finished', 'grace-deadline emoji commits room finalization');
select is((select finished_reason from public.game_rooms where id = '00000000-0000-0000-0030-000000000002'), 'grace_timeout', 'grace-deadline emoji uses grace_timeout finalization');
select is((select count(*)::integer from public.group_match_results where room_id = '00000000-0000-0000-0030-000000000002'), 3, 'grace-deadline finalization preserves and creates results');
select is((select count(*)::integer from public.room_events where room_id = '00000000-0000-0000-0030-000000000002' and event_type = 'game_end'), 1, 'grace-deadline finalization creates one game_end');
select is((select count(*)::integer from public.room_events where room_id = '00000000-0000-0000-0030-000000000002' and event_type = 'group_spectator_emoji'), 0, 'grace-deadline emoji creates no emoji event');
select is((select count(*)::integer from public.group_spectator_emoji_rate_limits where room_id = '00000000-0000-0000-0030-000000000002'), 0, 'grace-deadline emoji consumes no rate ledger');
select is((select count(*)::integer from public.room_events where room_id = '00000000-0000-0000-0030-000000000002' and event_type = 'player_retired'), 2, 'grace-deadline finalization retires both unresolved players once');
select is((select (host_user_id = '00000000-0000-0000-0032-000000000001'::uuid)::integer from public.game_rooms where id = '00000000-0000-0000-0030-000000000002'), 1, 'grace-deadline finalization preserves the finished spectator host');

select * from finish();
rollback;
