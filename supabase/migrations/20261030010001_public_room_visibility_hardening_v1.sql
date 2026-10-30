-- Phase 2 of the Wiki Race public-room rollout.
-- Execute ONLY after the new front end is Ready and code-based joins,
-- public listing and participation have passed production smoke checks.
-- Before this migration, old clients rely on the broad waiting-room SELECT.
-- Joined-room/member SELECT policy remains in force.
drop policy if exists "Authenticated users can view waiting or joined rooms"
  on public.game_rooms;
