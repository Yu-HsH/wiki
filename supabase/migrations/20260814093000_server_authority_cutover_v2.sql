-- Server-authority cutover.
-- Reads and Realtime subscriptions remain available; client mutation paths do not.

revoke insert, update, delete on table public.game_rooms from anon, authenticated;
revoke insert, update, delete on table public.room_players from anon, authenticated;
revoke insert, update, delete on table public.game_records from anon, authenticated;
revoke insert, update, delete on table public.match_history from anon, authenticated;

grant select on table public.game_rooms to authenticated;
grant select on table public.room_players to authenticated;
grant select on table public.game_records to authenticated;
grant select on table public.match_history to authenticated;

-- Final breaking cutover: every supported frontend must use apply_group_move_v2
-- before this migration. The legacy frontend and these legacy mutation RPCs are
-- unsupported after this point.
revoke execute on function public.update_group_progress(uuid, text, integer, text[], integer)
  from anon, authenticated;
revoke execute on function public.finish_group_player(uuid, integer, integer, text, text[])
  from anon, authenticated;

-- PostgreSQL 17.6 terminates the backend when an authenticated caller invokes
-- these legacy PL/pgSQL functions after EXECUTE is revoked. Remove the legacy
-- functions entirely; the V2 RPCs are the only mutation path. Any recovery is
-- forward-only through a separate compensating migration; do not edit historical
-- migrations or restore authenticated direct-write privileges.
drop function if exists public.update_group_progress(uuid, text, integer, text[], integer);
drop function if exists public.finish_group_player(uuid, integer, integer, text, text[]);

-- Room events are intentionally left writable through the existing item/event
-- policy. They are presentation telemetry; canonical progress is game_move_events.
