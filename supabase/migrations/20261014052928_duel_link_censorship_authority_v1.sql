-- Duel P0: authoritative link censorship for NORMAL_LINK (local approval 2026-10-14).
-- Forward-only; replaces only the two existing RPC bodies, preserving signatures,
-- SECURITY DEFINER/search_path/ACLs, item selection/duration and all non-normal moves.
-- No schema, RLS, Edge, reward, search-consumption or preview-quota change.
begin;
CREATE OR REPLACE FUNCTION public.use_duel_item_v3(p_room_id uuid, p_grant_id uuid, p_request_id uuid, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_actor public.room_players;
  v_opponent public.room_players;
  v_grant public.duel_item_grants;
  v_catalog record;
  v_defense public.duel_item_events;
  v_event public.duel_item_events;
  v_room_event public.room_events;
  v_player_id uuid;
  v_response jsonb;
  v_move jsonb;
  v_result text := 'applied';
  v_target_user_id uuid;
  v_effect_expires timestamptz;
  v_move_event_id uuid;
  v_metadata jsonb := '{}'::jsonb;
  v_censored text[];
  v_censored_page_ids text[];
  v_rewound uuid[];
  v_opponent_move jsonb;
  v_actor_move_event_id uuid;
  v_last_use timestamptz;
  -- clock_timestamp(), not now(): the 2.5s cooldown and every effect window
  -- measure elapsed wall time. now() is frozen for the whole transaction and
  -- would make both meaningless. Precedent: the group spectator rate limit
  -- (20260814123000:70 · :106) reaches for clock_timestamp() for the same reason.
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  -- 1. Room lock — see §LOCK ORDER above.
  select * into v_room
  from public.game_rooms
  where id = p_room_id and mode = 'duel'
  for update;
  if not found then raise exception 'DUEL_ROOM_NOT_FOUND'; end if;

  -- Replay of the same request returns the stored answer, exactly like the v2 RPCs.
  select response into v_response
  from public.game_mutation_requests
  where scope = 'duel' and game_id = p_room_id
    and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;

  -- 2. Player locks in a fixed order.
  for v_player_id in
    select user_id from public.room_players where room_id = p_room_id order by user_id
  loop
    perform 1 from public.room_players
    where room_id = p_room_id and user_id = v_player_id
    for update;
  end loop;

  select * into v_actor from public.room_players
  where room_id = p_room_id and user_id = v_user_id;
  if not found then raise exception 'NOT_A_PARTICIPANT'; end if;

  select * into v_opponent from public.room_players
  where room_id = p_room_id and user_id <> v_user_id limit 1;

  if v_room.use_items is not true then
    return jsonb_build_object('ok', false, 'code', 'ITEMS_DISABLED');
  end if;

  -- spec §5.1: no use during countdown, loading, reconnect or after the result is
  -- settled. "완주 확정 뒤 도착한 아이템 이벤트는 무효 처리한다".
  if v_room.status <> 'playing' or v_actor.player_status <> 'playing' then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE',
      'room', to_jsonb(v_room), 'player', to_jsonb(v_actor));
  end if;

  -- Ownership: the grant must be this player's, in this room, and unspent.
  select * into v_grant from public.duel_item_grants
  where id = p_grant_id and room_id = p_room_id and user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ITEM_NOT_OWNED');
  end if;
  if v_grant.consumed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'ITEM_ALREADY_USED');
  end if;

  -- Common 2.5s cooldown, measured on the server clock (spec §5.1).
  select max(ledger.server_timestamp) into v_last_use
  from public.duel_item_events ledger
  where ledger.room_id = p_room_id and ledger.actor_user_id = v_user_id;
  if v_last_use is not null and v_now < v_last_use + private.duel_item_cooldown_v3() then
    return jsonb_build_object('ok', false, 'code', 'ITEM_COOLDOWN',
      'cooldown_until', v_last_use + private.duel_item_cooldown_v3());
  end if;

  select * into v_catalog from private.duel_item_catalog_v3() c where c.item_id = v_grant.item_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ITEM_NOT_IN_CATALOG');
  end if;

  -- 3. Resolve who the effect lands on, and whether a defense intercepts it.
  if v_catalog.slot_role = 'attack' then
    if v_opponent.user_id is null then
      return jsonb_build_object('ok', false, 'code', 'OPPONENT_NOT_FOUND');
    end if;
    v_target_user_id := v_opponent.user_id;

    -- 편집 보호 first, 역링크 second. See the precedence note in the header: a
    -- shield that absorbs the hit means there is no hit left to reflect.
    select * into v_defense from public.duel_item_events ledger
    where ledger.room_id = p_room_id
      and ledger.target_user_id = v_opponent.user_id
      and ledger.item_id = 'cleanse_shield'
      and ledger.result = 'applied'
      and ledger.effect_expires_at > v_now
      and not exists (select 1 from public.duel_item_events spent
                      where spent.consumed_defense_event_id = ledger.id)
    order by ledger.effect_expires_at asc limit 1;

    if found and v_catalog.blockable then
      -- spec §5.4: "편집 보호로 차단된 공격은 소비된다" — the attacker still loses
      -- the item; the effect simply never lands.
      v_result := 'blocked';
    else
      select * into v_defense from public.duel_item_events ledger
      where ledger.room_id = p_room_id
        and ledger.target_user_id = v_opponent.user_id
        and ledger.item_id = 'backlink_reflect'
        and ledger.result = 'applied'
        and ledger.effect_expires_at > v_now
        and not exists (select 1 from public.duel_item_events spent
                        where spent.consumed_defense_event_id = ledger.id)
      order by ledger.effect_expires_at asc limit 1;

      if found and v_catalog.reflectable then
        v_result := 'reflected';
        v_target_user_id := v_user_id;
      else
        v_defense := null;
      end if;
    end if;
  elsif v_grant.item_id = 'history_rewind' then
    -- Jokers cannot be blocked, reflected or undone (14-DUEL-ITEMS.md §4).
    v_target_user_id := v_user_id;
  else
    v_target_user_id := v_user_id;
  end if;

  -- 4. Apply. Movement goes through the helper; timed effects only need an expiry.
  if v_result = 'applied' or v_result = 'reflected' then
    if v_catalog.move_event_type = 'FORCED_LINK' then
      v_move := private.apply_duel_move_internal_v3(
        p_room_id, v_target_user_id, 'FORCED_LINK', p_request_id, p_correlation_id, null);
    elsif v_catalog.move_event_type = 'RANDOM_TELEPORT' then
      -- Preflight has already checked auth, membership, owner, status and cooldown.
      -- No reservation/consumption before the trusted Edge destination arrives.
      if not exists (select 1 from private.duel_random_destinations_v1
        where room_id=p_room_id and user_id=v_user_id and request_id=p_request_id
          and grant_id=p_grant_id and expires_at>clock_timestamp()) then
        return jsonb_build_object('ok',false,'code','RANDOM_DESTINATION_REQUIRED','player',to_jsonb(v_actor));
      end if;
      v_move := private.apply_duel_move_internal_v3(
        p_room_id, v_user_id, 'RANDOM_TELEPORT', p_request_id, p_correlation_id, null);
    elsif v_catalog.move_event_type = 'UNDO' then
      v_move := private.apply_duel_move_internal_v3(
        p_room_id, v_target_user_id, v_catalog.move_event_type, p_request_id, p_correlation_id, null);
    elsif v_catalog.move_event_type = 'REWIND' then
      -- 역사 되감기 — 가능한 쪽만 이동한다 `[사용자 확정 2026-09-04]`
      --
      -- spec §5.5's "두 플레이어를 각각 자신의 직전 문서로 동시에 이동시킨다" describes
      -- the normal case, where both sides have history. It is not an instruction to
      -- refuse the item when one side does not: refusing would burn a whole joker
      -- for nothing, which is a far larger loss than a one-sided rewind.
      --
      -- Because the outcome can be one-sided, the payload names who actually moved.
      -- Without `rewoundUserIds` a player who sees only themselves move reads it as
      -- a bug rather than as the rule.
      v_rewound := '{}'::uuid[];

      if coalesce(array_length(v_actor.path_page_ids, 1), 0) >= 2 then
        v_move := private.apply_duel_move_internal_v3(
          p_room_id, v_user_id, 'REWIND', p_request_id, p_correlation_id, null);
        if (v_move->>'ok')::boolean then
          v_rewound := array_append(v_rewound, v_user_id);
          v_actor_move_event_id := nullif(v_move->>'move_event_id', '')::uuid;
        end if;
      end if;

      if v_opponent.user_id is not null
         and coalesce(array_length(v_opponent.path_page_ids, 1), 0) >= 2 then
        v_opponent_move := private.apply_duel_move_internal_v3(
          p_room_id, v_opponent.user_id, 'REWIND',
          extensions.gen_random_uuid(), p_correlation_id, null);
        if (v_opponent_move->>'ok')::boolean then
          v_rewound := array_append(v_rewound, v_opponent.user_id);
        end if;
      end if;

      -- Nobody could move: nothing happened, so nothing is consumed either.
      if cardinality(v_rewound) = 0 then
        return jsonb_build_object('ok', false, 'code', 'REWIND_UNAVAILABLE');
      end if;

      v_metadata := jsonb_build_object('rewoundUserIds', to_jsonb(v_rewound));
      -- Re-shape as a success for the shared check below; the actor may not have
      -- moved at all, in which case move_event_id is legitimately null.
      v_move := jsonb_build_object('ok', true, 'move_event_id', v_actor_move_event_id);
    end if;

    if v_move is not null and (v_move->>'ok')::boolean is not true then
      -- 14-DUEL-ITEMS.md §4: no valid link means the item is NOT consumed. Nothing
      -- has been written yet, so returning here leaves the grant untouched.
      return jsonb_build_object('ok', false, 'code', coalesce(v_move->>'code', 'ITEM_MOVE_REJECTED'));
    end if;
    v_move_event_id := nullif(v_move->>'move_event_id', '')::uuid;

    if v_catalog.duration_ms > 0 then
      v_effect_expires := v_now + (v_catalog.duration_ms * interval '1 millisecond');
    end if;

    -- 링크 검열: the server picks the sealed set so both clients agree on it.
    -- spec §5.2 — about half the links, never fewer than two left.
    if v_grant.item_id = 'link_censorship' then
      select coalesce(array_agg(ranked.target_title_snapshot), '{}'),
             coalesce(array_agg(ranked.target_page_id), '{}')
      into v_censored, v_censored_page_ids
      from (
        select link.target_title_snapshot, link.target_page_id,
               row_number() over (order by md5(link.target_page_id || p_request_id::text)) as rn,
               count(*) over () as total
        from public.wiki_page_snapshots snapshot
        join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
        join public.room_players victim
          on victim.room_id = p_room_id and victim.user_id = v_target_user_id
        where snapshot.page_id = victim.current_page_id
          and snapshot.revision_id = victim.current_revision_id
      ) ranked
      where ranked.rn <= greatest(0, least(ranked.total / 2, ranked.total - 2));

      -- Keep the existing title set, adding the identities picked by this SAME snapshot.
      v_metadata := jsonb_build_object(
        'censoredTitles', to_jsonb(coalesce(v_censored, '{}'::text[])),
        'censoredPageIds', to_jsonb(coalesce(v_censored_page_ids, '{}'::text[])));
    end if;
  end if;

  -- 5. Consume and record. The ledger row is the source of truth; room_events is
  -- only the notification carrier.
  insert into public.duel_item_events(
    room_id, grant_id, actor_user_id, target_user_id, item_id, result,
    effect_expires_at, consumed_defense_event_id, request_id, correlation_id,
    move_event_id, metadata, server_timestamp
  ) values (
    p_room_id, v_grant.id, v_user_id, v_target_user_id, v_grant.item_id, v_result,
    v_effect_expires,
    case when v_result in ('blocked', 'reflected') then v_defense.id else null end,
    p_request_id, coalesce(p_correlation_id, p_request_id),
    v_move_event_id, v_metadata, v_now
  )
  returning * into v_event;

  update public.duel_item_grants
  set consumed_at = v_now, consumed_event_id = v_event.id
  where id = v_grant.id;

  -- The move event was written before the ledger row existed; close the link now
  -- so game_move_events.item_event_id points at the cause (20260814090000:70).
  if v_move_event_id is not null then
    update public.game_move_events
    set item_event_id = v_event.id
    where id = v_move_event_id;
  end if;

  -- 6. Broadcast. SECURITY DEFINER inserts; the browser only reads
  -- (precedent: send_group_spectator_emoji_v13, 20260814123000:136-145).
  insert into public.room_events(room_id, user_id, event_type, payload)
  values (
    p_room_id,
    v_user_id,
    'duel_item_event',
    jsonb_build_object(
      'itemEventId', v_event.id,
      'itemId', v_grant.item_id,
      'slotRole', v_grant.slot_role,
      'actorUserId', v_user_id,
      'targetUserId', v_target_user_id,
      'result', v_result,
      'effectExpiresAt', v_effect_expires,
      'moveEventId', v_move_event_id,
      'metadata', v_metadata,
      'serverTimestamp', v_now
    )
  )
  returning * into v_room_event;

  select * into v_actor from public.room_players
  where room_id = p_room_id and user_id = v_user_id;
  select * into v_opponent from public.room_players
  where room_id = p_room_id and user_id <> v_user_id limit 1;
  select * into v_room from public.game_rooms where id = p_room_id;

  v_response := jsonb_build_object(
    'ok', true,
    'code', 'ITEM_USED',
    'result', v_result,
    'item_id', v_grant.item_id,
    'target_user_id', v_target_user_id,
    'item_event_id', v_event.id,
    'room_event_id', v_room_event.id,
    'effect_expires_at', v_effect_expires,
    'cooldown_until', v_now + private.duel_item_cooldown_v3(),
    'metadata', v_metadata,
    'room', to_jsonb(v_room),
    'player', to_jsonb(v_actor),
    'opponent', to_jsonb(v_opponent) - array['path_titles', 'path_page_ids', 'path_revision_ids'],
    'server_now', v_now
  );

  insert into public.game_mutation_requests(
    scope, game_id, actor_user_id, request_id, operation, response
  ) values ('duel', p_room_id, v_user_id, p_request_id, 'use_duel_item_v3', v_response);

  return v_response;
end;
$function$
;

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
  if p_event_type = 'RANDOM_TELEPORT' then raise exception 'ITEM_RPC_REQUIRED'; end if;
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
commit;
