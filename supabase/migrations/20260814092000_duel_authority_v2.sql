-- Duel v2 cutover RPCs. Direct table writes are revoked by the following cutover migration.

begin;

create or replace function public.create_duel_room_v2(p_use_items boolean default true)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_profile public.profiles;
  v_code text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  loop
    v_code := upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.game_rooms where room_code = v_code);
  end loop;
  insert into public.game_rooms(room_code, host_user_id, status, mode, min_players, max_players, use_items)
  values (v_code, auth.uid(), 'waiting', 'duel', 2, 2, coalesce(p_use_items, true)) returning * into v_room;
  insert into public.room_players(room_id, user_id, role, nickname_snapshot, profile_image_snapshot, is_ready, player_status)
  values (v_room.id, auth.uid(), 'host', v_profile.nickname, v_profile.profile_image_url, false, 'waiting');
  return v_room;
end;
$$;

create or replace function public.join_duel_room_v2(p_room_code text)
returns public.room_players
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_profile public.profiles;
  v_player public.room_players;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_room from public.game_rooms where room_code = upper(trim(p_room_code)) and mode = 'duel' and status = 'waiting' for update;
  if not found then raise exception 'DUEL_ROOM_NOT_JOINABLE'; end if;
  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = auth.uid()) then
    select * into v_player from public.room_players where room_id = v_room.id and user_id = auth.uid();
    return v_player;
  end if;
  if (select count(*) from public.room_players where room_id = v_room.id) >= v_room.max_players then raise exception 'DUEL_ROOM_FULL'; end if;
  insert into public.room_players(room_id, user_id, role, nickname_snapshot, profile_image_snapshot, is_ready, player_status)
  values (v_room.id, auth.uid(), 'guest', v_profile.nickname, v_profile.profile_image_url, false, 'waiting') returning * into v_player;
  return v_player;
end;
$$;

create or replace function public.apply_duel_move_v2(
  p_room_id uuid,
  p_request_id uuid,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_to_page_id text default null,
  p_to_revision_id text default null,
  p_to_title_snapshot text default null,
  p_clicked_raw_title text default null,
  p_event_type text default 'NORMAL_LINK',
  p_item_event_id uuid default null,
  p_undone_event_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
  v_opponent public.room_players;
  v_link public.wiki_snapshot_links;
  v_previous public.game_move_events;
  v_response jsonb;
  v_from_id text;
  v_from_revision text;
  v_from_title text;
  v_to_id text := p_to_page_id;
  v_to_revision text := p_to_revision_id;
  v_to_title text := p_to_title_snapshot;
  v_delta integer := 1;
  v_version bigint;
  v_move_count integer;
  v_now timestamptz := now();
  v_finished boolean := false;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id and mode = 'duel' for update;
  if not found then raise exception 'DUEL_ROOM_NOT_FOUND'; end if;
  select response into v_response from public.game_mutation_requests where scope = 'duel' and game_id = p_room_id and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = v_user_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if (select count(*) from public.room_players where room_id = p_room_id) <> 2 then raise exception 'DUEL_PARTICIPANTS_REQUIRED'; end if;
  if v_room.status <> 'playing' or v_player.player_status <> 'playing' then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
  if p_expected_version is distinct from v_player.progress_version then return jsonb_build_object('ok', false, 'code', 'STATE_VERSION_CONFLICT', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
  select * into v_opponent from public.room_players where room_id = p_room_id and user_id <> v_user_id limit 1;
  v_from_id := v_player.current_page_id; v_from_revision := v_player.current_revision_id; v_from_title := v_player.current_title;
  if p_event_type = 'UNDO' then
    select candidate.* into v_previous
    from public.game_move_events candidate
    where candidate.scope = 'duel' and candidate.game_id = p_room_id
      and candidate.actor_user_id = v_user_id
      and candidate.event_type <> 'UNDO'
      and not exists (
        select 1 from public.game_move_events undo_event
        where undo_event.scope = 'duel'
          and undo_event.game_id = p_room_id
          and undo_event.actor_user_id = v_user_id
          and undo_event.undone_event_id = candidate.id
      )
    order by candidate.server_timestamp desc, candidate.id desc limit 1;
    if not found or array_length(v_player.path_page_ids, 1) < 2 then return jsonb_build_object('ok', false, 'code', 'UNDO_UNAVAILABLE', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
    v_to_id := v_previous.from_page_id; v_to_revision := v_previous.from_revision_id; v_to_title := v_previous.from_title_snapshot;
    v_delta := case when v_previous.event_type = 'FORCED_LINK' then -1 else 1 end; p_undone_event_id := v_previous.id;
  elsif p_event_type = 'NORMAL_LINK' then
    select link.* into v_link from public.wiki_page_snapshots snapshot join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
    where snapshot.page_id = v_player.current_page_id and snapshot.revision_id = v_player.current_revision_id and link.target_page_id = p_to_page_id limit 1;
    if not found then return jsonb_build_object('ok', false, 'code', 'LINK_NOT_ALLOWED', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
    v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id);
    if v_to_revision is null then return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
  elsif p_event_type in ('FORCED_LINK', 'RANDOM_TELEPORT') then
    select link.* into v_link from public.wiki_page_snapshots snapshot join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
    where snapshot.page_id = v_player.current_page_id and snapshot.revision_id = v_player.current_revision_id and link.target_page_id <> v_player.current_page_id
    order by md5(link.target_page_id || p_request_id::text) limit 1;
    if not found then return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
    v_to_id := v_link.target_page_id; v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id); v_to_title := v_link.target_title_snapshot;
    if v_to_revision is null then return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
  else raise exception 'UNSUPPORTED_EVENT_TYPE'; end if;
  if p_event_type = 'NORMAL_LINK' then v_to_id := v_link.target_page_id; v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id); v_to_title := v_link.target_title_snapshot; end if;
  v_version := v_player.progress_version + 1; v_move_count := greatest(0, v_player.move_count + v_delta); v_finished := v_to_id = v_player.target_page_id;
  if p_event_type = 'UNDO' then
    v_player.path_page_ids := v_player.path_page_ids[1:greatest(1, array_length(v_player.path_page_ids, 1) - 1)]; v_player.path_revision_ids := v_player.path_revision_ids[1:greatest(1, array_length(v_player.path_revision_ids, 1) - 1)]; v_player.path_titles := v_player.path_titles[1:greatest(1, array_length(v_player.path_titles, 1) - 1)];
  else
    v_player.path_page_ids := array_append(v_player.path_page_ids, v_to_id); v_player.path_revision_ids := array_append(v_player.path_revision_ids, coalesce(v_to_revision, '')); v_player.path_titles := array_append(v_player.path_titles, v_to_title);
  end if;
  update public.room_players set current_page_id = v_to_id, current_revision_id = coalesce(v_to_revision, current_revision_id), current_title = v_to_title,
    move_count = v_move_count, progress_version = v_version, path_page_ids = v_player.path_page_ids, path_revision_ids = v_player.path_revision_ids, path_titles = v_player.path_titles,
    player_status = case when v_finished then 'finished' else 'playing' end, has_finished = v_finished, finished_at = case when v_finished then v_now else null end, rank = case when v_finished then 1 else null end,
    updated_at = v_now, last_seen_at = v_now, heartbeat_at = v_now where id = v_player.id returning * into v_player;
  update public.game_rooms set state_version = state_version + 1 where id = p_room_id returning * into v_room;
  insert into public.game_move_events(scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id, event_type, from_page_id, from_revision_id, from_title_snapshot, to_page_id, to_revision_id, to_title_snapshot, clicked_raw_title, move_delta, move_count_after, version_before, version_after, item_event_id, undone_event_id)
  values ('duel', p_room_id, v_user_id, v_user_id, p_request_id, coalesce(p_correlation_id, p_request_id), p_event_type, v_from_id, v_from_revision, v_from_title, v_to_id, v_to_revision, v_to_title, p_clicked_raw_title, v_delta, v_move_count, v_version - 1, v_version, p_item_event_id, p_undone_event_id) returning * into v_previous;
  if v_finished then
    update public.game_rooms set status = 'finished', finished_at = v_now, finished_reason = 'normal_finish', winner_user_id = v_user_id, winner_user_ids = array[v_user_id], state_version = state_version + 1 where id = p_room_id returning * into v_room;
    insert into public.match_history(room_id, winner_user_id, loser_user_id, winner_start_title, loser_start_title, winner_target_title, loser_target_title, duration_seconds, result_status, result_reason, finalized_at)
    values (p_room_id, v_user_id, v_opponent.user_id, v_player.start_title, v_opponent.start_title, v_player.target_title, v_opponent.target_title, greatest(0, floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer), 'completed', 'normal_finish', v_now) on conflict (room_id) do nothing;
  end if;
  v_response := jsonb_build_object('ok', true, 'code', 'APPLIED', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player), 'opponent', to_jsonb(v_opponent), 'event', to_jsonb(v_previous));
  insert into public.game_mutation_requests(scope, game_id, actor_user_id, request_id, operation, response) values ('duel', p_room_id, v_user_id, p_request_id, 'apply_duel_move_v2', v_response);
  return v_response;
end;
$$;

create or replace function public.leave_duel_room_v2(p_room_id uuid, p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms; v_player public.room_players; v_opponent public.room_players; v_now timestamptz := now(); v_response jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.mode <> 'duel' then raise exception 'DUEL_ROOM_REQUIRED'; end if;
  if v_room.status not in ('waiting', 'starting', 'playing', 'finished') then raise exception 'DUEL_STATUS_INVALID'; end if;
  select response into v_response from public.game_mutation_requests where scope = 'duel' and game_id = p_room_id and actor_user_id = auth.uid() and request_id = p_request_id;
  if v_response is not null then return v_response; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_room.status = 'waiting' then
    delete from public.room_players where id = v_player.id;
    if not exists (select 1 from public.room_players where room_id = p_room_id) then delete from public.game_rooms where id = p_room_id; end if;
    v_response := jsonb_build_object('ok', true, 'code', 'LEFT_WAITING');
  elsif v_room.status = 'finished' or v_player.player_status in ('finished', 'retired') then
    v_response := jsonb_build_object('ok', true, 'code', 'ALREADY_FINISHED', 'room', to_jsonb(v_room));
  else
    select * into v_opponent from public.room_players where room_id = p_room_id and user_id <> auth.uid() limit 1;
    update public.room_players set player_status = 'retired', retired_at = v_now, retire_reason = 'forfeited', progress_version = progress_version + 1, updated_at = v_now where id = v_player.id;
    update public.game_rooms set status = 'finished', finished_at = v_now, finished_reason = 'forfeit', winner_user_id = v_opponent.user_id, winner_user_ids = case when v_opponent.user_id is null then '{}' else array[v_opponent.user_id] end, state_version = state_version + 1 where id = p_room_id returning * into v_room;
    insert into public.match_history(room_id, winner_user_id, loser_user_id, duration_seconds, result_status, result_reason, finalized_at) values (p_room_id, v_opponent.user_id, auth.uid(), greatest(0, floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer), 'forfeit', 'forfeit', v_now) on conflict (room_id) do nothing;
    v_response := jsonb_build_object('ok', true, 'code', 'FORFEIT', 'room', to_jsonb(v_room));
  end if;
  insert into public.game_mutation_requests(scope, game_id, actor_user_id, request_id, operation, response) values ('duel', p_room_id, auth.uid(), p_request_id, 'leave_duel_room_v2', v_response);
  return v_response;
end;
$$;

revoke all on function public.create_duel_room_v2(boolean) from public, anon;
grant execute on function public.create_duel_room_v2(boolean) to authenticated, service_role;
revoke all on function public.join_duel_room_v2(text) from public, anon;
grant execute on function public.join_duel_room_v2(text) to authenticated, service_role;
revoke all on function public.apply_duel_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.apply_duel_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid) to authenticated, service_role;
revoke all on function public.leave_duel_room_v2(uuid, uuid) from public, anon;
grant execute on function public.leave_duel_room_v2(uuid, uuid) to authenticated, service_role;

commit;
