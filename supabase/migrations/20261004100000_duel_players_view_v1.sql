-- Wiki Race 2.0 SF-A1: a masked read of 1:1 players and a progress signal (TRACKS.md §8-SEC).
-- Forward-only migration. Historical migrations stay unchanged (R5).
--
-- Additive only. Nothing existing changes: no policy, no function body, no grant
-- on an existing object. The deployed front keeps reading room_players directly
-- and logs the new room_events type as unhandled (MultiplayerGamePage default
-- branch), so this file is safe before SF-A2.
--
--   1. public.get_duel_room_players_v1(p_room_id)
--      What SF-A2's fetchRoomPlayers will call. The caller's own row is whole;
--      while the room is starting or playing, the opponent row comes without
--      path_titles · path_page_ids · path_revision_ids (spec §4.1: the opponent's
--      current document and move count are public, the full path only after the
--      match). A non-member sees [] — the same as the room_players policy today.
--
--   2. private.signal_duel_progress_v1 + trigger on room_players
--      Once SF-A3 hides the opponent row, the opponent's room_players realtime
--      events stop reaching this client. This writes one room_events row
--      ('duel_progress', payload.userId = the player whose row changed) so the client
--      knows to re-read through (1). It fires only when current_page_id,
--      move_count or player_status changes — NOT on progress_version, which the
--      heartbeat raises every 10 seconds without a move (debt D3,
--      CURRENT.md §5). The payload carries no path.
--
-- Rollback: drop trigger trg_signal_duel_progress on public.room_players;
--           drop function private.signal_duel_progress_v1();
--           drop function public.get_duel_room_players_v1(uuid);

begin;

-- ---------------------------------------------------------------------------
-- 1. Masked read
-- ---------------------------------------------------------------------------
create or replace function public.get_duel_room_players_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_hide boolean;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_room from public.game_rooms where id = p_room_id;
  if not found then return '[]'::jsonb; end if;
  if v_room.mode <> 'duel' then raise exception 'DUEL_ROOM_REQUIRED'; end if;

  if not exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = v_user_id
  ) then
    return '[]'::jsonb;
  end if;

  v_hide := v_room.status in ('starting', 'playing');

  return coalesce((
    select jsonb_agg(
      case
        when player.user_id = v_user_id or not v_hide then to_jsonb(player)
        else to_jsonb(player) - array['path_titles', 'path_page_ids', 'path_revision_ids']
      end
      order by player.created_at, player.id
    )
    from public.room_players player
    where player.room_id = p_room_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_duel_room_players_v1(uuid) from public, anon;
grant execute on function public.get_duel_room_players_v1(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Progress signal
-- ---------------------------------------------------------------------------
create or replace function private.signal_duel_progress_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.game_rooms room
    where room.id = new.room_id and room.mode = 'duel'
  ) then
    return null;
  end if;

  -- room_events.user_id references profiles, room_players.user_id references
  -- auth.users. A player without a profile row must not make the move itself
  -- fail, so the column is set only when the profile exists; payload.userId
  -- always names the player.
  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    new.room_id,
    (select profile.id from public.profiles profile where profile.id = new.user_id),
    'duel_progress',
    jsonb_build_object(
      'userId', new.user_id,
      'progressVersion', new.progress_version,
      'serverTimestamp', now()
    )
  );
  return null;
end;
$$;

revoke all on function private.signal_duel_progress_v1() from public, anon, authenticated;

create trigger trg_signal_duel_progress
after update on public.room_players
for each row
when (
  old.current_page_id is distinct from new.current_page_id
  or old.move_count is distinct from new.move_count
  or old.player_status is distinct from new.player_status
)
execute function private.signal_duel_progress_v1();

commit;
