-- Wiki Race 2.0 Track C (packet 14): duel item server authority v3.
-- Forward-only additive migration. Historical migrations stay unchanged (AGENTS.md §4).
--
-- ## What this replaces
--   Today the browser writes item events straight into public.room_events
--   (pages/MultiplayerGamePage.jsx:194) and keeps the inventory in localStorage
--   (`wiki-mp-game:{roomId}:{userId}`). The victim's own client decides whether an
--   attack was blocked. `01-CONFIRMED-SPEC.md` §5.1 requires the opposite: the server
--   settles every use, block, reflect, consumption and expiry.
--
--   This migration builds that server path. It does NOT revoke the client's INSERT
--   privilege on room_events — that is G2-② and belongs to a separate window AFTER
--   the front end ships (docs/agent/TRACKS.md §7.4). Already-loaded old bundles keep
--   working until then.
--
-- ## Precedent followed
--   `send_group_spectator_emoji_v13` (20260814123000:136-165) — a SECURITY DEFINER
--   function inserts into room_events and clients only read. Item events take the
--   same shape, so no `alter publication` and therefore no realtime cutover window
--   is needed (room_events is already in supabase_realtime — baseline:1191).
--
-- ## Decisions carried in from G7 (사용자 확정 2026-09-04)
--   Q1  A new `private.apply_duel_move_internal_v3` applies item-driven moves.
--       `public.apply_duel_move_v2` is NOT modified — deployed bundles call it.
--   Q2  `cleanse_shield` follows spec §5.4: 8s window, blocks the first attack, ends.
--       (The old client behaviour was 10s/7s blanket immunity plus a cleanse.)
--   Q3  `random_teleport` keeps its existing pool — a random valid link on the
--       current document — and only its display name becomes "특수:임의 문서".
--       spec §5.5's true random-document pool is registered debt (data/duelItems.js).
--   Q5  `mini_game` is excluded from the grant. Its definition and the three
--       `mini_game_*` room_events types stay (AGENTS.md §4).
--   Q6  room_events.event_type is the single value 'duel_item_event'; the payload
--       discriminates. room_events.event_type has no CHECK (baseline:643), so a
--       single value is what keeps that column from exploding.
--   Q7  Two tables and three RPCs. Cooldown, live effects and pending defenses are
--       DERIVED from the ledger rather than stored as mutable state — the same
--       "immutable event + projection" shape server authority v2 established.
--
-- ## No new game_move_events.event_type is required
--   The CHECK at 20260814090000:55-58 already lists FORCED_LINK, UNDO,
--   RANDOM_TELEPORT, SWAP and REWIND. Every moving item maps onto one of them:
--   잘못된 링크→FORCED_LINK, 되돌리기→UNDO, 특수:임의 문서→RANDOM_TELEPORT,
--   역사 되감기→REWIND, 문서 맞교환→SWAP (still disabled). So this migration adds
--   no constraint change to an existing table.

begin;

-- ---------------------------------------------------------------------------
-- 1. Server-side item catalog
-- ---------------------------------------------------------------------------
-- The browser copy lives in data/duelItems.js. tests/duelItemAuthority.test.js
-- asserts the two copies agree; neither is generated from the other, because the
-- server must not trust a value the browser sent.
--
-- `slot_role` is the 4-axis role of spec §5.1 (공격/탐색/방어/조커).
-- `blockable`/`reflectable` are the interaction matrix of 14-DUEL-ITEMS.md §4 —
-- jokers can be neither blocked nor reflected nor undone.
create or replace function private.duel_item_catalog_v3()
returns table (
  item_id text,
  slot_role text,
  duration_ms integer,
  charges integer,
  blockable boolean,
  reflectable boolean,
  move_event_type text
)
language sql
immutable
set search_path = ''
as $$
  select *
  from (
    values
      ('blind',            'attack',  4000,  0, true,  true,  null),
      ('random_link_move', 'attack',  0,     0, true,  true,  'FORCED_LINK'),
      ('link_censorship',  'attack',  6000,  0, true,  true,  null),
      ('search_once',      'search',  15000, 0, false, false, null),
      ('link_preview',     'search',  15000, 0, false, false, null),
      ('cleanse_shield',   'defense', 8000,  1, false, false, null),
      ('go_back',          'defense', 0,     0, false, false, 'UNDO'),
      ('backlink_reflect', 'defense', 6000,  1, false, false, null),
      ('random_teleport',  'joker',   0,     0, false, false, 'RANDOM_TELEPORT'),
      ('history_rewind',   'joker',   0,     0, false, false, 'REWIND')
  ) as catalog (
    item_id, slot_role, duration_ms, charges, blockable, reflectable, move_event_type
  );
$$;

-- Common cooldown across every slot after any use (spec §5.1).
create or replace function private.duel_item_cooldown_v3()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '2.5 seconds'; $$;

-- ---------------------------------------------------------------------------
-- 2. duel_item_grants — the per-match inventory snapshot
-- ---------------------------------------------------------------------------
-- 14-DUEL-ITEMS.md §5 first bullet: "경기별 지급 inventory snapshot".
-- Five slots per player, generated once per room. F5 cannot re-roll them because
-- the rows already exist and `ensure_duel_item_grant_v3` is idempotent.
create table if not exists public.duel_item_grants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot_index integer not null,
  slot_role text not null,
  is_wildcard boolean not null default false,
  item_id text not null,
  consumed_at timestamptz,
  consumed_event_id uuid,
  created_at timestamptz not null default now(),

  -- One item per slot, and the five slots are fixed.
  constraint duel_item_grants_slot_uq unique (room_id, user_id, slot_index),

  -- spec §5.1 "한 플레이어에게 같은 아이템을 중복 지급하지 않는다" — enforced by the
  -- database, not only by the picker, so a future picker bug cannot violate it.
  constraint duel_item_grants_item_uq unique (room_id, user_id, item_id),

  constraint duel_item_grants_slot_index_check
    check (slot_index >= 0 and slot_index <= 4),

  constraint duel_item_grants_slot_role_check
    check (slot_role = any (array['attack', 'search', 'defense', 'joker']::text[])),

  constraint duel_item_grants_item_id_check
    check (item_id = any (array[
      'blind',
      'random_link_move',
      'link_censorship',
      'search_once',
      'link_preview',
      'cleanse_shield',
      'go_back',
      'backlink_reflect',
      'random_teleport',
      'history_rewind'
    ]::text[])),

  -- A consumed grant always names the ledger row that consumed it.
  constraint duel_item_grants_consumed_pair_check
    check ((consumed_at is null) = (consumed_event_id is null))
);

create index if not exists duel_item_grants_room_user_idx
  on public.duel_item_grants (room_id, user_id, slot_index);

-- ---------------------------------------------------------------------------
-- 3. duel_item_events — the append-only consumption ledger
-- ---------------------------------------------------------------------------
-- 14-DUEL-ITEMS.md §5: "item use event와 소비 결과". Everything else that packet
-- asks the server to hold — cooldown expiry, live effect expiry, the pending
-- protect/reflect state — is a query over this table rather than a mutable column.
-- A row is never updated after insert.
create table if not exists public.duel_item_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  grant_id uuid not null references public.duel_item_grants(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  result text not null,
  effect_expires_at timestamptz,
  consumed_defense_event_id uuid references public.duel_item_events(id),
  request_id uuid not null,
  correlation_id uuid not null,
  move_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  server_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- spec §5.1 "모든 아이템은 1회용이다" — one ledger row per grant, enforced here.
  constraint duel_item_events_grant_uq unique (grant_id),

  -- Retry safety for the same client request (mirrors game_mutation_requests).
  constraint duel_item_events_request_uq unique (room_id, actor_user_id, request_id),

  constraint duel_item_events_result_check
    check (result = any (array['applied', 'blocked', 'reflected', 'void']::text[])),

  -- A defense is spent at most once, and only by an event that was blocked or
  -- reflected. 'applied' means no defense stood in the way.
  constraint duel_item_events_defense_pair_check
    check (
      consumed_defense_event_id is null
      or result = any (array['blocked', 'reflected']::text[])
    )
);

-- Cooldown lookup: the actor's most recent use in this room.
create index if not exists duel_item_events_actor_recent_idx
  on public.duel_item_events (room_id, actor_user_id, server_timestamp desc);

-- Live effect and pending-defense lookup for one player.
create index if not exists duel_item_events_target_effect_idx
  on public.duel_item_events (room_id, target_user_id, effect_expires_at desc)
  where effect_expires_at is not null;

-- "has this defense already been spent?" — the reverse edge of the pair above.
create index if not exists duel_item_events_consumed_defense_idx
  on public.duel_item_events (consumed_defense_event_id)
  where consumed_defense_event_id is not null;

-- ---------------------------------------------------------------------------
-- 4. RLS — read-only for participants, all writes through the RPCs
-- ---------------------------------------------------------------------------
-- contracts/README: new tables enable RLS, clients never write directly, and the
-- read scope is stated explicitly. Here it is "the two players of that room".
--
-- Note the asymmetry on duel_item_grants: a player may read ONLY their own rows.
-- spec §5.1 "상대의 미사용 아이템은 공개하지 않는다" — if the opponent could select
-- the grants they would see the whole unused hand. What the opponent is allowed to
-- learn is the *use*, and that arrives as a duel_item_events row / room_events row.
alter table public.duel_item_grants enable row level security;
alter table public.duel_item_events enable row level security;

revoke all on table public.duel_item_grants from anon, authenticated;
revoke all on table public.duel_item_events from anon, authenticated;
grant select on table public.duel_item_grants to authenticated;
grant select on table public.duel_item_events to authenticated;

drop policy if exists "Players can read own duel item grants" on public.duel_item_grants;
create policy "Players can read own duel item grants"
on public.duel_item_grants
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Duel players can read item events in their rooms" on public.duel_item_events;
create policy "Duel players can read item events in their rooms"
on public.duel_item_events
for select
to authenticated
using (
  exists (
    select 1
    from public.room_players player
    where player.room_id = duel_item_events.room_id
      and player.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 5. private.apply_duel_move_internal_v3 — item-driven movement (Q1, A안)
-- ---------------------------------------------------------------------------
-- `public.apply_duel_move_v2` binds actor and affected player to auth.uid()
-- (20260814092000:94 · :145). "A forces B to move" therefore cannot be expressed
-- inside A's call, which is why today the victim's own browser applies it
-- (MultiplayerGamePage.jsx:942) and a frozen tab silently eats the attack.
--
-- This helper takes the moving player explicitly. It duplicates part of the move
-- logic on purpose: `apply_duel_move_v2` is what deployed bundles call, and
-- rewriting it to delegate would edit a live contract for no user-visible gain.
--
-- ## LOCKING — the caller owns the locks
-- The caller MUST already hold `public.game_rooms` FOR UPDATE for p_room_id before
-- calling this. That is the repo-wide duel order, verified across every duel RPC:
--     game_rooms (for update)  ->  room_players (for update)
--   apply_duel_move_v2      :90 -> :94        leave_duel_room_v2   :165 -> :171
--   initialize_duel_player  :891 -> :896      heartbeat_duel_v2    :920 -> :922
--   set_duel_target_v2      :816 -> —         start_duel_room_v2   :842 -> —
--   finalize_duel_if_expired:942 -> —         join_duel_room_v2     :40 -> —
--   apply_group_move_v2     :685 -> :690  (same order on the group axis)
--
-- Because the room row is taken exclusively FIRST by every path, two players who
-- attack each other at the same instant serialize on game_rooms before either has
-- touched a room_players row. No cross-wait can form, so there is no deadlock —
-- and that is the reason this helper does not invent its own ordering.
-- The re-lock below is a no-op when the caller already holds the row; it exists so
-- that calling this helper incorrectly still cannot corrupt a projection.
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

  elsif p_event_type in ('FORCED_LINK', 'RANDOM_TELEPORT') then
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

-- ---------------------------------------------------------------------------
-- 6. ensure_duel_item_grant_v3 — the once-per-room 5-slot grant
-- ---------------------------------------------------------------------------
-- spec §5.1 · 14-DUEL-ITEMS.md §3. Both players are granted in ONE transaction so
-- that "양쪽은 역할별 개수가 같다" holds by construction: the slot plan is identical
-- for both, only the drawn items differ.
--
-- Determinism: the picks are seeded from room_id (+ user_id), so a re-entry after
-- F5 that somehow raced past the existence check would still produce the same
-- hand. A rematch is a new room_id and therefore a new combination ("재대결 새 조합").
create or replace function public.ensure_duel_item_grant_v3(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_wildcard_role text;
  v_roll integer;
  v_player_id uuid;
  v_slot integer;
  v_role text;
  v_item text;
  v_grants jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Lock order: game_rooms first. See private.apply_duel_move_internal_v3 §LOCKING.
  select * into v_room
  from public.game_rooms
  where id = p_room_id and mode = 'duel'
  for update;
  if not found then raise exception 'DUEL_ROOM_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = v_user_id
  ) then raise exception 'NOT_A_PARTICIPANT'; end if;

  -- A non-item duel grants nothing. The deployed client never checked this and
  -- handed out an inventory even when the host unchecked "아이템 사용"
  -- (MultiplayerGamePage.jsx:508 has no use_items guard).
  if v_room.use_items is not true then
    return jsonb_build_object('ok', true, 'code', 'ITEMS_DISABLED', 'use_items', false, 'grants', '[]'::jsonb);
  end if;

  if (select count(*) from public.room_players where room_id = p_room_id) <> 2 then
    raise exception 'DUEL_PARTICIPANTS_REQUIRED';
  end if;

  -- Idempotent: if the hand exists, hand it back. This is what makes F5 unable to
  -- re-roll (14-DUEL-ITEMS.md §3 "F5 후 재추첨 금지").
  if not exists (select 1 from public.duel_item_grants where room_id = p_room_id) then
    -- The wildcard role is drawn ONCE for the room, not per player, so that both
    -- players keep identical role counts (spec §5.1). 공격 50 / 탐색 25 / 방어 25,
    -- never a joker.
    v_roll := ('x' || substr(md5(p_room_id::text || ':duel-item-wildcard'), 1, 8))::bit(32)::bigint % 100;
    v_wildcard_role := case
      when v_roll < 50 then 'attack'
      when v_roll < 75 then 'search'
      else 'defense'
    end;

    for v_player_id in
      select user_id from public.room_players where room_id = p_room_id order by user_id
    loop
      v_slot := 0;
      foreach v_role in array array['attack', 'search', 'defense', 'joker', v_wildcard_role]
      loop
        -- Draw from the role pool, skipping anything this player already holds.
        -- "한 사용자 중복 아이템 없음" (spec §5.1) — the unique constraint on the
        -- table is the second line of defense behind this filter.
        select catalog.item_id into v_item
        from private.duel_item_catalog_v3() catalog
        where catalog.slot_role = v_role
          and not exists (
            select 1 from public.duel_item_grants existing
            where existing.room_id = p_room_id
              and existing.user_id = v_player_id
              and existing.item_id = catalog.item_id
          )
        order by md5(p_room_id::text || v_player_id::text || catalog.item_id)
        limit 1;

        if v_item is null then raise exception 'DUEL_ITEM_POOL_EXHAUSTED'; end if;

        insert into public.duel_item_grants(
          room_id, user_id, slot_index, slot_role, is_wildcard, item_id
        ) values (
          p_room_id, v_player_id, v_slot, v_role, v_slot = 4, v_item
        );

        v_slot := v_slot + 1;
      end loop;
    end loop;
  end if;

  select coalesce(jsonb_agg(to_jsonb(grant_row) order by grant_row.slot_index), '[]'::jsonb)
  into v_grants
  from public.duel_item_grants grant_row
  where grant_row.room_id = p_room_id and grant_row.user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'GRANTED',
    'use_items', true,
    'grants', v_grants,
    'server_now', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. get_duel_item_state_v3 — refresh/reconnect recovery
-- ---------------------------------------------------------------------------
-- 14-DUEL-ITEMS.md §5 last bullet: "새로고침 복구". Everything the HUD needs is
-- recomputed from the ledger here, so the browser keeps no item state of its own.
-- Read-only: no locks, no writes.
create or replace function public.get_duel_item_state_v3(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_now timestamptz := clock_timestamp();
  v_grants jsonb;
  v_effects jsonb;
  v_defenses jsonb;
  v_cooldown timestamptz;
  -- clock_timestamp(), not now(). now() is the transaction timestamp and never
  -- advances inside one transaction, so a cooldown or an effect window measured
  -- against it does not measure elapsed time at all. The repo already settled this
  -- for the group spectator rate limit (20260814123000:70 · :106).
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_room from public.game_rooms where id = p_room_id and mode = 'duel';
  if not found then raise exception 'DUEL_ROOM_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = v_user_id
  ) then raise exception 'NOT_A_PARTICIPANT'; end if;

  select coalesce(jsonb_agg(to_jsonb(grant_row) order by grant_row.slot_index), '[]'::jsonb)
  into v_grants
  from public.duel_item_grants grant_row
  where grant_row.room_id = p_room_id and grant_row.user_id = v_user_id;

  -- Cooldown is derived, not stored: the caller's most recent use plus 2.5s.
  select max(ledger.server_timestamp) + private.duel_item_cooldown_v3()
  into v_cooldown
  from public.duel_item_events ledger
  where ledger.room_id = p_room_id and ledger.actor_user_id = v_user_id;

  -- Live effects landing on this player. 'blocked' and 'void' rows never carry an
  -- expiry, so filtering on result keeps a blocked attack from showing as active.
  select coalesce(jsonb_agg(jsonb_build_object(
    'itemEventId', ledger.id,
    'itemId', ledger.item_id,
    'actorUserId', ledger.actor_user_id,
    'expiresAt', ledger.effect_expires_at,
    'metadata', ledger.metadata
  ) order by ledger.effect_expires_at), '[]'::jsonb)
  into v_effects
  from public.duel_item_events ledger
  where ledger.room_id = p_room_id
    and ledger.target_user_id = v_user_id
    and ledger.result in ('applied', 'reflected')
    and ledger.effect_expires_at is not null
    and ledger.effect_expires_at > v_now
    and ledger.item_id not in ('cleanse_shield', 'backlink_reflect');

  -- Pending defenses: still inside their window and not yet spent by a later row.
  select coalesce(jsonb_agg(jsonb_build_object(
    'itemEventId', ledger.id,
    'itemId', ledger.item_id,
    'expiresAt', ledger.effect_expires_at
  ) order by ledger.effect_expires_at), '[]'::jsonb)
  into v_defenses
  from public.duel_item_events ledger
  where ledger.room_id = p_room_id
    and ledger.target_user_id = v_user_id
    and ledger.item_id in ('cleanse_shield', 'backlink_reflect')
    and ledger.result = 'applied'
    and ledger.effect_expires_at > v_now
    and not exists (
      select 1 from public.duel_item_events spent
      where spent.consumed_defense_event_id = ledger.id
    );

  return jsonb_build_object(
    'ok', true,
    'code', 'STATE',
    'use_items', coalesce(v_room.use_items, false),
    'room_status', v_room.status,
    'grants', v_grants,
    'cooldown_until', v_cooldown,
    'active_effects', v_effects,
    'pending_defenses', v_defenses,
    'server_now', v_now
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. use_duel_item_v3 — the single write path for item use
-- ---------------------------------------------------------------------------
-- This is the whole point of the migration: use, block, reflect, consumption and
-- the resulting movement all settle inside one transaction, and the browser is
-- told the outcome rather than deciding it (spec §5.1, 14-DUEL-ITEMS.md §8).
--
-- ## LOCK ORDER
--   1. public.game_rooms   (for update)  <- serializes the whole room
--   2. public.room_players (for update)  <- both rows, ordered by user_id
-- Step 1 is what makes simultaneous mutual attacks safe: the second caller waits
-- on the room row before it has any player row, so no cycle can form. Step 2's
-- ordering is belt-and-braces, since nothing can be between 1 and 2 in another
-- session. This is the same order every existing duel RPC uses.
--
-- ## Defense precedence when both are live — 편집 보호 우선 `[사용자 확정 2026-09-04]`
-- spec §5.4 defines 편집 보호 (block the first attack) and 역링크 (reflect the first
-- attack) separately and never says which wins when both are pending. The call:
--   1. 보호는 "맞지 않는 것"이고 반사는 "맞고 되돌려주는 것"이다. 보호가 먼저 먹으면
--      공격이 성립하지 않으므로 반사할 대상 자체가 없다. 순서가 아니라 인과다.
--   2. 그리고 보호 소진이 반사 소진보다 손해가 작다 — 보호는 한 대를 막아 준 것으로
--      제 값을 했지만, 반사가 헛돌면 되돌려줄 공격이 없는 채로 사라진다.
-- The shield branch is therefore checked first. Flipping this back is one branch.
create or replace function public.use_duel_item_v3(
  p_room_id uuid,
  p_grant_id uuid,
  p_request_id uuid,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    elsif v_catalog.move_event_type in ('UNDO', 'RANDOM_TELEPORT') then
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
      select coalesce(array_agg(ranked.target_title_snapshot), '{}')
      into v_censored
      from (
        select link.target_title_snapshot,
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

      v_metadata := jsonb_build_object('censoredTitles', to_jsonb(coalesce(v_censored, '{}'::text[])));
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
    'opponent', to_jsonb(v_opponent),
    'server_now', v_now
  );

  insert into public.game_mutation_requests(
    scope, game_id, actor_user_id, request_id, operation, response
  ) values ('duel', p_room_id, v_user_id, p_request_id, 'use_duel_item_v3', v_response);

  return v_response;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Permissions
-- ---------------------------------------------------------------------------
-- Duel play is login-only: there is no guest path into a 1:1 room, so none of
-- these get the `anon` exception that ensure_today_daily_challenge needs.
-- The private helper is revoked from `authenticated` as well — it is reachable
-- only from inside the SECURITY DEFINER RPCs above, the same shape as
-- private.resolve_wiki_revision (20260814090000:299).
revoke all on function private.duel_item_catalog_v3() from public, anon, authenticated;
revoke all on function private.duel_item_cooldown_v3() from public, anon, authenticated;
revoke all on function private.apply_duel_move_internal_v3(uuid, uuid, text, uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function public.ensure_duel_item_grant_v3(uuid) from public, anon;
grant execute on function public.ensure_duel_item_grant_v3(uuid) to authenticated, service_role;

revoke all on function public.get_duel_item_state_v3(uuid) from public, anon;
grant execute on function public.get_duel_item_state_v3(uuid) to authenticated, service_role;

revoke all on function public.use_duel_item_v3(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.use_duel_item_v3(uuid, uuid, uuid, uuid) to authenticated, service_role;

commit;
