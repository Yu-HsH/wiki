-- Release validation: restore the resolvable FORCED_LINK filter lost by the
-- random teleport helper replacement. Existing migrations are preserved.
-- Random teleport registration, authority, atomic consumption and ACL stay intact.
begin;
create or replace function private.apply_duel_move_internal_v3(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_request_id uuid,
  p_correlation_id uuid,
  p_item_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players;
  v_link public.wiki_snapshot_links;
  v_destination private.duel_random_destinations_v1;
  v_previous public.game_move_events;
  v_event public.game_move_events;
  v_room public.game_rooms;
  v_from_id text;
  v_from_revision text;
  v_from_title text;
  v_to_id text;
  v_to_revision text;
  v_to_title text;
  v_delta integer := 1;
  v_undone uuid;
  v_version bigint;
  v_move_count integer;
  v_path_length integer;
  v_now timestamptz := now();
  v_finished boolean := false;
begin
  select * into v_player
  from public.room_players
  where room_id = p_room_id and user_id = p_actor_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND');
  end if;

  if v_player.player_status <> 'playing' then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_PLAYING');
  end if;

  v_from_id := v_player.current_page_id;
  v_from_revision := v_player.current_revision_id;
  v_from_title := v_player.current_title;
  v_path_length := coalesce(array_length(v_player.path_page_ids, 1), 0);

  if p_event_type = 'UNDO' then
    -- Same rule as apply_duel_move_v2:101-117. A forced move that is undone gives
    -- its move back (14-DUEL-ITEMS.md §4: "강제 이동으로 늘어난 이동 횟수를 취소한다");
    -- an ordinary step backwards still costs a move.
    select candidate.* into v_previous
    from public.game_move_events candidate
    where candidate.scope = 'duel'
      and candidate.game_id = p_room_id
      and candidate.actor_user_id = p_actor_user_id
      and candidate.event_type <> 'UNDO'
      and not exists (
        select 1 from public.game_move_events undo_event
        where undo_event.scope = 'duel'
          and undo_event.game_id = p_room_id
          and undo_event.actor_user_id = p_actor_user_id
          and undo_event.undone_event_id = candidate.id
      )
    order by candidate.server_timestamp desc, candidate.id desc
    limit 1;
    -- spec §5.4: "되돌리기는 시작 문서에서 사용할 수 없다".
    if not found or v_path_length < 2 then
      return jsonb_build_object('ok', false, 'code', 'UNDO_UNAVAILABLE');
    end if;
    v_to_id := v_previous.from_page_id;
    v_to_revision := v_previous.from_revision_id;
    v_to_title := v_previous.from_title_snapshot;
    v_delta := case when v_previous.event_type = 'FORCED_LINK' then -1 else 1 end;
    v_undone := v_previous.id;

  elsif p_event_type = 'REWIND' then
    -- spec §5.5 역사 되감기: each player goes to their OWN previous document and
    -- both count +1. That is the difference from UNDO, which walks the move log
    -- back; REWIND is a forward move that happens to land on the previous title.
    if v_path_length < 2 then
      return jsonb_build_object('ok', false, 'code', 'REWIND_UNAVAILABLE');
    end if;
    v_to_id := v_player.path_page_ids[v_path_length - 1];
    v_to_title := v_player.path_titles[v_path_length - 1];
    v_to_revision := private.resolve_wiki_revision(v_to_id, null);
    if v_to_revision is null then
      return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING');
    end if;
    v_delta := 1;

  elsif p_event_type = 'RANDOM_TELEPORT' then
    select * into v_destination from private.duel_random_destinations_v1
    where room_id=p_room_id and user_id=p_actor_user_id and request_id=p_request_id;
    if not found or v_destination.expires_at <= clock_timestamp() then
      return jsonb_build_object('ok',false,'code','RANDOM_DOCUMENT_UNAVAILABLE');
    end if;
    if v_destination.expected_version is distinct from v_player.progress_version
      or v_destination.from_page_id is distinct from v_player.current_page_id
      or v_destination.target_page_id is distinct from v_player.target_page_id then
      return jsonb_build_object('ok',false,'code','STATE_VERSION_CONFLICT');
    end if;
    select page_id, revision_id, canonical_title_snapshot
      into v_to_id, v_to_revision, v_to_title from public.wiki_page_snapshots
      where page_id=v_destination.page_id and revision_id=v_destination.revision_id;
    if not found or v_to_id=v_player.current_page_id or v_to_id=v_player.target_page_id then
      return jsonb_build_object('ok',false,'code','RANDOM_DOCUMENT_UNAVAILABLE');
    end if;
    v_delta := 1;
  elsif p_event_type = 'FORCED_LINK' then
    -- The pool is the current document's snapshot links, exactly as
    -- apply_duel_move_v2:124-130 picks it (Q3 keeps that pool).
    --
    -- Two exclusions come straight from the spec and are NOT in the deployed
    -- version: spec §5.2 잘못된 링크 "자기 문서·목표 문서는 제외한다" and
    -- spec §5.5 특수:임의 문서 "목표 직접 도착은 제외". Without them an attack
    -- could hand the victim the win.
    select link.* into v_link
    from public.wiki_page_snapshots snapshot
    join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
    where snapshot.page_id = v_player.current_page_id
      and snapshot.revision_id = v_player.current_revision_id
      and link.target_page_id <> v_player.current_page_id
      and (v_player.target_page_id is null or link.target_page_id <> v_player.target_page_id)
      -- Preserve the deployed 20260904100000 resolvable-link pool.
      and exists (
        select 1 from public.wiki_page_snapshots destination
        where destination.page_id = link.target_page_id
          and (link.target_revision_id is null
               or destination.revision_id = link.target_revision_id)
      )
    order by md5(link.target_page_id || p_request_id::text)
    limit 1;
    -- 14-DUEL-ITEMS.md §4: "유효 링크가 없으면 아이템을 소비하지 않는다".
    -- The caller turns this code into a no-consumption rejection.
    if not found then
      return jsonb_build_object('ok', false, 'code', 'NO_ELIGIBLE_LINK');
    end if;
    v_to_id := v_link.target_page_id;
    v_to_title := v_link.target_title_snapshot;
    v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id);
    if v_to_revision is null then
      return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING');
    end if;
    v_delta := 1;

  else
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_EVENT_TYPE');
  end if;

  v_version := v_player.progress_version + 1;
  v_move_count := greatest(0, v_player.move_count + v_delta);
  v_finished := v_to_id is not distinct from v_player.target_page_id;

  if p_event_type = 'UNDO' then
    v_player.path_page_ids := v_player.path_page_ids[1:greatest(1, v_path_length - 1)];
    v_player.path_revision_ids := v_player.path_revision_ids[1:greatest(1, v_path_length - 1)];
    v_player.path_titles := v_player.path_titles[1:greatest(1, v_path_length - 1)];
  else
    v_player.path_page_ids := array_append(v_player.path_page_ids, v_to_id);
    v_player.path_revision_ids := array_append(v_player.path_revision_ids, coalesce(v_to_revision, ''));
    v_player.path_titles := array_append(v_player.path_titles, v_to_title);
  end if;

  update public.room_players
  set current_page_id = v_to_id,
      current_revision_id = coalesce(v_to_revision, current_revision_id),
      current_title = v_to_title,
      move_count = v_move_count,
      progress_version = v_version,
      path_page_ids = v_player.path_page_ids,
      path_revision_ids = v_player.path_revision_ids,
      path_titles = v_player.path_titles,
      player_status = case when v_finished then 'finished' else 'playing' end,
      has_finished = v_finished,
      finished_at = case when v_finished then v_now else null end,
      rank = case when v_finished then 1 else null end,
      updated_at = v_now,
      last_seen_at = v_now,
      heartbeat_at = v_now
  where id = v_player.id
  returning * into v_player;

  insert into public.game_move_events(
    scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
    event_type, from_page_id, from_revision_id, from_title_snapshot,
    to_page_id, to_revision_id, to_title_snapshot, clicked_raw_title,
    move_delta, move_count_after, version_before, version_after,
    item_event_id, undone_event_id
  ) values (
    'duel', p_room_id, p_actor_user_id, p_actor_user_id, p_request_id,
    coalesce(p_correlation_id, p_request_id), p_event_type,
    v_from_id, v_from_revision, v_from_title,
    v_to_id, v_to_revision, v_to_title, null,
    v_delta, v_move_count, v_version - 1, v_version,
    p_item_event_id, v_undone
  )
  returning * into v_event;

  update public.game_rooms
  set state_version = state_version + 1
  where id = p_room_id
  returning * into v_room;

  -- An item that pushes someone onto their own target still ends the match. The
  -- two exclusions above make this reachable only through 되돌리기/역사 되감기,
  -- never through an attack.
  if v_finished then
    update public.game_rooms
    set status = 'finished',
        finished_at = v_now,
        finished_reason = 'normal_finish',
        winner_user_id = p_actor_user_id,
        winner_user_ids = array[p_actor_user_id],
        state_version = state_version + 1
    where id = p_room_id
    returning * into v_room;

    insert into public.match_history(
      room_id, winner_user_id, loser_user_id, duration_seconds,
      result_status, result_reason, finalized_at
    )
    select p_room_id, p_actor_user_id, opponent.user_id,
           greatest(0, floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer),
           'completed', 'normal_finish', v_now
    from public.room_players opponent
    where opponent.room_id = p_room_id and opponent.user_id <> p_actor_user_id
    limit 1
    on conflict (room_id) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'APPLIED',
    'player', to_jsonb(v_player),
    'room', to_jsonb(v_room),
    'move_event_id', v_event.id,
    'finished', v_finished
  );
end;
$$;

commit;
