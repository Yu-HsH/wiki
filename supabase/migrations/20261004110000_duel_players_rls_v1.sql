-- Wiki Race 2.0 SF-A3: hide the 1:1 opponent row while the match is in progress
-- (TRACKS.md §8-SEC). Forward-only migration. Historical migrations stay unchanged (R5).
--
-- Closes debt 4 (A): until now any room member could read the opponent's
-- path_titles · path_page_ids · path_revision_ids from room_players during the
-- match, over REST and over Realtime (spec §4.1: the full path only after the match).
--
-- The SELECT policy keeps its name and gains one condition through a security
-- definer helper (the is_room_member precedent, so the policy never depends on
-- RLS of another table):
--   member of the room  AND  ( own row  OR  not (1:1 room in starting/playing) )
-- Group rooms are excluded by mode: group spectating reads other participants'
-- path_titles (GroupGamePage, frozen) and keeps working unchanged.
--
-- What replaces the hidden row for the 1:1 front (both already in production):
--   SF-A1 get_duel_room_players_v1 (masked read) + duel_progress signal
--   SF-A2 fetchRoomPlayers through that RPC (main push #14, fadc81d)
--
-- ⚠ Apply only after #14 has been live for a day (2026-10-04 or later). A tab
-- still running the pre-#14 bundle reads the table directly: its opponent panel
-- stops updating and an F5 recovery ends in OPPONENT_LEFT (TRACKS §8-SEC-⑦ ⓑ).
--
-- Rollback (restores today's policy exactly):
--   drop policy "Players can view players in their room" on public.room_players;
--   create policy "Players can view players in their room" on public.room_players
--     for select to authenticated using (public.is_room_member(room_id));
--   drop function public.can_view_room_player_v1(uuid, uuid);

begin;

create or replace function public.can_view_room_player_v1(p_room_id uuid, p_player_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_players me
    where me.room_id = p_room_id and me.user_id = (select auth.uid())
  )
  and (
    p_player_user_id = (select auth.uid())
    or not exists (
      select 1 from public.game_rooms room
      where room.id = p_room_id
        and room.mode = 'duel'
        and room.status in ('starting', 'playing')
    )
  );
$$;

revoke all on function public.can_view_room_player_v1(uuid, uuid) from public, anon;
grant execute on function public.can_view_room_player_v1(uuid, uuid) to authenticated, service_role;

drop policy if exists "Players can view players in their room" on public.room_players;
create policy "Players can view players in their room"
on public.room_players
for select
to authenticated
using (public.can_view_room_player_v1(room_id, user_id));

commit;
