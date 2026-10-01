-- 14c: host selects the shared target; START uses the exact supplied snapshot.
-- Breaking cutover: old bundles must reload after DB + frontend deployment.
-- No one-argument overload, defaults, or cache-based random fallback.
create or replace function public.set_duel_target_v2(
  p_room_id uuid, p_target_title text, p_target_page_id text,
  p_target_revision_id text, p_is_ready boolean
)
returns public.room_players
language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms; v_player public.room_players;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'duel' or v_room.status <> 'waiting' then
    raise exception 'DUEL_ROOM_NOT_WAITING';
  end if;
  -- Authority precedes identity validation, including NULL inputs from guests.
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'DUEL_HOST_ONLY'; end if;
  if nullif(trim(p_target_title), '') is null or nullif(trim(p_target_page_id), '') is null then
    raise exception 'TARGET_IDENTITY_REQUIRED';
  end if;
  update public.room_players set
    target_title = trim(p_target_title), target_page_id = p_target_page_id,
    target_revision_id = p_target_revision_id,
    progress_version = progress_version + 1, updated_at = now()
  where room_id = p_room_id and user_id = auth.uid() and player_status = 'waiting'
  returning * into v_player;
  if not found then raise exception 'DUEL_PLAYER_NOT_WAITING'; end if;
  -- p_is_ready is retained only for wire compatibility; never changes readiness.
  update public.game_rooms set state_version = state_version + 1 where id = p_room_id;
  return v_player;
end;
$$;

drop function public.start_duel_room_v2(uuid);
create function public.start_duel_room_v2(
  p_room_id uuid, p_start_title text, p_start_page_id text, p_start_revision_id text
)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_total integer;
  v_start public.wiki_page_snapshots;
  v_target public.room_players;
  v_target_revision_id text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.mode <> 'duel' or v_room.status <> 'waiting' then raise exception 'DUEL_ROOM_NOT_WAITING'; end if;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'HOST_REQUIRED'; end if;
  select count(*) into v_total from public.room_players where room_id = p_room_id;
  if v_total <> 2 then raise exception 'DUEL_PARTICIPANTS_REQUIRED'; end if;
  select * into v_target from public.room_players
  where room_id = p_room_id and user_id = v_room.host_user_id;
  if not found or nullif(trim(v_target.target_title), '') is null
    or nullif(trim(v_target.target_page_id), '') is null then
    raise exception 'DUEL_HOST_TARGET_REQUIRED';
  end if;
  v_target_revision_id := private.resolve_wiki_revision(v_target.target_page_id, v_target.target_revision_id);
  if v_target_revision_id is null then raise exception 'DUEL_TARGET_SNAPSHOT_REQUIRED'; end if;
  if nullif(trim(p_start_title), '') is null or nullif(trim(p_start_page_id), '') is null
    or nullif(trim(p_start_revision_id), '') is null then
    raise exception 'DUEL_START_IDENTITY_REQUIRED';
  end if;
  select * into v_start from public.wiki_page_snapshots
  where page_id = p_start_page_id and revision_id = p_start_revision_id;
  if not found then raise exception 'DUEL_START_SNAPSHOT_REQUIRED'; end if;
  if v_start.page_id = v_target.target_page_id then raise exception 'DUEL_START_EQUALS_TARGET'; end if;
  -- Every rejection above leaves both projections untouched.
  update public.game_rooms set
    status = 'starting', started_at = now(), game_starts_at = null,
    duel_start_page_id = v_start.page_id, duel_start_revision_id = v_start.revision_id,
    duel_start_title = v_start.canonical_title_snapshot, state_version = state_version + 1
  where id = p_room_id returning * into v_room;
  update public.room_players set
    target_title = v_target.target_title, target_page_id = v_target.target_page_id,
    target_revision_id = v_target_revision_id,
    progress_version = progress_version + 1, updated_at = now()
  where room_id = p_room_id;
  return v_room;
end;
$$;

revoke all on function public.set_duel_target_v2(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.set_duel_target_v2(uuid, text, text, text, boolean) to authenticated, service_role;
revoke all on function public.start_duel_room_v2(uuid, text, text, text) from public, anon;
grant execute on function public.start_duel_room_v2(uuid, text, text, text) to authenticated, service_role;
notify pgrst, 'reload schema';
