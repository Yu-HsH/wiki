-- Packet 13 SQL/RPC contract tests.
-- Run after the additive migration on a local Supabase database with pgTAP:
--   psql ... -f supabase/tests/group_final_gaps_v13.sql
--
-- The integration fixture for this file is intentionally server-side: callers
-- must set request.jwt.claim.sub and use the RPCs, never direct client writes.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_column(
  'public', 'game_rooms', 'game_duration_seconds',
  'group rooms keep a server hard-limit column'
);
select has_column(
  'public', 'game_rooms', 'grace_duration_seconds',
  'group rooms keep a server grace column'
);
select has_table(
  'public', 'group_spectator_emoji_rate_limits',
  'emoji rate limiting is kept in a dedicated server ledger'
);

select ok(
  (select column_default = '1200'
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'game_rooms'
     and column_name = 'game_duration_seconds'),
  'new group rooms default to a 20 minute hard limit'
);
select ok(
  (select column_default = '120'
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'game_rooms'
     and column_name = 'grace_duration_seconds'),
  'new group rooms default to a 2 minute grace'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'game_rooms_group_limits_v13_check'
      and conrelid = 'public.game_rooms'::regclass
  ),
  'group min/max/no-item constraints exist'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.group_spectator_emoji_rate_limits'::regclass),
  'emoji rate ledger has RLS enabled'
);

select has_function('public', 'create_group_room', array['integer', 'integer', 'integer'],
  'group room creation RPC exists');
select has_function('public', 'join_group_room', array['uuid'],
  'group join RPC exists');
select has_function('public', 'start_group_room_game_v2', array['uuid'],
  'group start RPC exists');
select has_function('public', 'activate_group_room_game', array['uuid'],
  'group activation RPC exists');
select has_function('public', 'apply_group_move_v2', array['uuid', 'uuid', 'uuid', 'bigint', 'text', 'text', 'text', 'text', 'text', 'uuid', 'uuid'],
  'group move RPC exists');
select has_function('public', 'finalize_group_room_if_expired', array['uuid'],
  'group expiry finalizer exists');
select has_function('public', 'leave_group_player', array['uuid', 'text'],
  'group leave RPC exists');
select has_function('public', 'send_group_spectator_emoji_v13', array['uuid', 'text'],
  'preset spectator emoji RPC exists');

select is(
  has_function_privilege('authenticated', 'public.create_group_room(integer,integer,integer)', 'EXECUTE'),
  true,
  'authenticated can create a group room through the RPC'
);
select is(
  has_function_privilege('authenticated', 'public.apply_group_move_v2(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid)', 'EXECUTE'),
  true,
  'authenticated can move only through the V2 RPC'
);
select is(
  has_function_privilege('authenticated', 'public.send_group_spectator_emoji_v13(uuid,text)', 'EXECUTE'),
  true,
  'authenticated can send a preset emoji through the guarded RPC'
);
select is(
  has_function_privilege('anon', 'public.send_group_spectator_emoji_v13(uuid,text)', 'EXECUTE'),
  false,
  'anonymous users cannot call the spectator emoji RPC'
);
select is(
  to_regprocedure('public.update_group_progress(uuid,text,integer,text[],integer)') is null,
  true,
  'legacy direct progress RPC is absent after V2 cutover'
);

select ok(
  position('least(' in lower(regexp_replace(
    pg_get_functiondef('public.apply_group_move_v2(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid)'::regprocedure),
    '\s+', ' ', 'g'
  ))) > 0
  and position('game_deadline_at' in lower(pg_get_functiondef('public.apply_group_move_v2(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid)'::regprocedure))) > 0,
  'move RPC compares the hard deadline and grace deadline before applying a move'
);
select ok(
  position('grace_started_at' in pg_get_functiondef('public.apply_group_move_v2(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid)'::regprocedure)) > 0,
  'third finisher starts a one-time grace period'
);
select ok(
  position('order by created_at asc, id asc' in lower(regexp_replace(
    pg_get_functiondef('private.reconcile_group_host_v13(uuid,uuid)'::regprocedure),
    '\s+', ' ', 'g'
  ))) > 0,
  'host succession uses deterministic join order'
);
select ok(
  position('SPECTATOR_PRESET_INVALID' in pg_get_functiondef('public.send_group_spectator_emoji_v13(uuid,text)'::regprocedure)) > 0,
  'free-form spectator payloads are rejected'
);
select ok(
  position('interval ''3 seconds''' in pg_get_functiondef('public.send_group_spectator_emoji_v13(uuid,text)'::regprocedure)) > 0,
  'spectator emoji rate limit is server-time based'
);

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_rooms'
      and column_name = 'host_user_id'
  ),
  'active group host reference can be cleared when the room has no active member'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'game_rooms_non_group_host_required_v13_check'
      and conrelid = 'public.game_rooms'::regclass
  ),
  'non-group rooms still require a host reference'
);
select ok(
  position('host_user_id=null' in replace(
    pg_get_functiondef('private.reconcile_group_host_v13(uuid,uuid)'::regprocedure),
    ' ', ''
  )) > 0,
  'empty rooms clear the active host reference'
);
select ok(
  position('NOT_A_GROUP' in pg_get_functiondef('public.finalize_group_room_if_expired(uuid)'::regprocedure)) > 0,
  'expiry RPC rejects non-group rooms before finalization'
);
select ok(
  position('private.finalize_group_room_v13' in pg_get_functiondef('public.send_group_spectator_emoji_v13(uuid,text)'::regprocedure)) > 0,
  'spectator emoji expiry uses the authoritative finalizer'
);
select ok(
  pg_get_function_result('public.send_group_spectator_emoji_v13(uuid,text)'::regprocedure) = 'jsonb'
    and position('accepted' in lower(pg_get_functiondef('public.send_group_spectator_emoji_v13(uuid,text)'::regprocedure))) > 0
    and position('SPECTATOR_ROOM_EXPIRED' in pg_get_functiondef('public.send_group_spectator_emoji_v13(uuid,text)'::regprocedure)) > 0,
  'expired spectator emoji requests return a committed structured rejection'
);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_events'
  ),
  'existing room_events publication is reused for spectator events'
);
select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_spectator_emoji_rate_limits'
  ),
  'rate-limit ledger is not exposed through Realtime'
);

-- Concurrent behavioral scenarios require two database sessions and are run
-- by supabase/tests/group_final_gaps_v13_hardening_concurrency.ps1:
-- 3/8 create+start success, 2-player start rejection, 9th join rejection,
-- 19:30 third finish -> 20:00 hard stop, early third finish -> 2:00 grace,
-- duplicate third request, fourth-place persistence, all-resolved early finish,
-- timeout RETIRE/DNF, three host-leave phases, concurrent leave, forged room
-- events, non-preset text, cross-room events, and server-side rate limiting.
-- this single-session pgTAP file intentionally does not claim concurrency.

select * from finish();
rollback;
