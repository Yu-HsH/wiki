-- User-approved LOCAL Duel P0 public movement authority, 2026-10-14.
-- Forward-only; no private item movement, censorship, ACL, RLS, balance, or rewards change.

CREATE OR REPLACE FUNCTION public.apply_duel_move_v2(p_room_id uuid, p_request_id uuid, p_correlation_id uuid, p_expected_version bigint, p_to_page_id text DEFAULT NULL::text, p_to_revision_id text DEFAULT NULL::text, p_to_title_snapshot text DEFAULT NULL::text, p_clicked_raw_title text DEFAULT NULL::text, p_event_type text DEFAULT 'NORMAL_LINK'::text, p_item_event_id uuid DEFAULT NULL::uuid, p_undone_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select * into v_player from public.room_players where room_id = p_room_id and user_id = v_user_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  -- Authenticate and lock the caller's participant row BEFORE replaying a cache.
  -- A stored request belongs to this room AND this authenticated actor only.
  select response into v_response from public.game_mutation_requests where scope = 'duel' and game_id = p_room_id and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;

  -- A cached success above is a replay, not a new authorization. Every NEW public
  -- movement must be a normal link. Item movement stays exclusively in
  -- use_duel_item_v3 -> private.apply_duel_move_internal_v3.
  -- IS DISTINCT FROM also rejects NULL, unknown, and differently cased types.
  if p_event_type is distinct from 'NORMAL_LINK' then
    return jsonb_build_object('ok', false, 'code', 'ITEM_RPC_REQUIRED',
      'room', to_jsonb(v_room), 'player', to_jsonb(v_player));
  end if;
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

    -- The normal-link identity comes from the server snapshot, never a client title.
    -- Room/player locks above serialize item application and movement; use the
    -- current wall clock AFTER those locks, not the transaction's now().
    if exists (
      select 1
      from public.duel_item_events effect
      where effect.room_id = p_room_id
        and effect.target_user_id = v_user_id
        and effect.item_id = 'link_censorship'
        and effect.result in ('applied', 'reflected')
        and effect.effect_expires_at > clock_timestamp()
        and case
          when jsonb_typeof(effect.metadata->'censoredPageIds') = 'array'
            then (effect.metadata->'censoredPageIds') ? v_link.target_page_id
          else exists (
            -- Six-second in-flight legacy rows have titles only. Resolve them
            -- through server link/page/snapshot identities without mutating the ledger.
            select 1 from jsonb_array_elements_text(
              case when jsonb_typeof(effect.metadata->'censoredTitles') = 'array'
                then effect.metadata->'censoredTitles' else '[]'::jsonb end
            ) sealed(title)
            where sealed.title = v_link.target_title_snapshot
              or exists (select 1 from public.wiki_pages destination
                where destination.page_id = v_link.target_page_id
                  and destination.canonical_title = sealed.title)
              or exists (select 1 from public.wiki_page_snapshots destination
                where destination.page_id = v_link.target_page_id
                  and destination.canonical_title_snapshot = sealed.title)
          )
        end
    ) then
      -- Rejected requests follow existing rejection semantics: no cache or ledger write.
      return jsonb_build_object('ok', false, 'code', 'LINK_CENSORED',
        'room', to_jsonb(v_room), 'player', to_jsonb(v_player));
    end if;

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
  v_response := jsonb_build_object('ok', true, 'code', 'APPLIED', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player), 'opponent', to_jsonb(v_opponent) - array['path_titles', 'path_page_ids', 'path_revision_ids'], 'event', to_jsonb(v_previous));
  insert into public.game_mutation_requests(scope, game_id, actor_user_id, request_id, operation, response) values ('duel', p_room_id, v_user_id, p_request_id, 'apply_duel_move_v2', v_response);
  return v_response;
end;
$function$
;
