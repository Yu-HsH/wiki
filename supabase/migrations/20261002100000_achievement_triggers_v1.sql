-- Wiki Race 2.0 Track 16b: achievement evaluators and event wiring.
-- Forward-only additive migration. Historical migrations stay unchanged.
--
-- Requires 20261002090000_achievements_rewards_v1.sql (16a: definitions, tiers,
-- private.apply_achievement_value_v1) and 20260930090000_xp_result_grants_v1.sql
-- (15c: private.duel_decay_v1, the trg_grant_* triggers this file sorts after).
--
-- Shape (docs/agent/16-HANDOFF.md §1·§1.1·§5, TRACKS.md §1.1-e):
--   No finalizer or RPC body is edited. Four AFTER triggers watch the rows the
--   finish paths already write — the same three 15c watches, plus equipment:
--
--     game_records           AFTER INSERT            -> single
--     match_history          AFTER INSERT            -> duel
--     game_rooms             AFTER UPDATE OF status  -> group
--     user_profile_equipment AFTER INSERT OR UPDATE  -> equipment
--
--   Trigger names are trg_record_*, so on the same event they fire after 15c's
--   trg_grant_* (PostgreSQL fires same-event triggers in name order).
--
-- Evaluation:
--   Every result runs, for each of its players in user_id order, every live
--   definition whose evaluator watches that scope. Cumulative evaluators recount
--   from the result tables each time (idempotent, and the same code serves the
--   16b-r backfill); situational ones judge only the result at hand. The value
--   goes through 16a's private.apply_achievement_value_v1, which unlocks every
--   tier it reaches and heals a partial grant on a repeat.
--   from_activation definitions ignore results older than their activation.
--
-- Failure isolation (15c pattern, two layers — a finish never fails):
--   each definition runs in its own exception block, and each trigger wraps the
--   whole evaluation in another. A failure rolls back only that work, raises a
--   WARNING, and the match commits. public.evaluate_result_achievements_v1
--   re-runs one result later; it is idempotent.
--
-- G5: hidden achievement ids, names and conditions appear only as table rows.
-- Nothing below names one; evaluators are chosen by definitions.evaluator.
--
-- Data-loss DDL in this file: 0. One new table; no drop, rename or type change
-- of existing objects; no update or delete of existing rows.
--
-- Rollback:
--   drop trigger if exists trg_record_single_result_achievements on public.game_records;
--   drop trigger if exists trg_record_duel_result_achievements on public.match_history;
--   drop trigger if exists trg_record_group_result_achievements on public.game_rooms;
--   drop trigger if exists trg_record_equipment_achievements on public.user_profile_equipment;
-- The functions and user_achievement_marks can stay; nothing else calls them.
-- Unlocks, rewards and XP already granted stay (records are kept, 16 §1).

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. user_achievement_marks — results already counted by a non-recountable
--    evaluator.
-- ---------------------------------------------------------------------------
-- 끝까지 함께 is judged from room_players at the moment a room closes, which no
-- later query can see again. Each qualifying result is marked once here, and
-- the progress value is the number of marks. Same G5 posture as the 16a tables.
create table if not exists public.user_achievement_marks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievement_definitions(achievement_id),
  source_type text not null,
  source_id uuid not null,
  marked_at timestamptz not null default now(),
  primary key (user_id, achievement_id, source_type, source_id),
  constraint user_achievement_marks_source_type_check
    check (source_type = any (array['single', 'duel', 'group']::text[]))
);

alter table public.user_achievement_marks enable row level security;
revoke all on table public.user_achievement_marks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Small helpers.
-- ---------------------------------------------------------------------------
-- A jsonb string array as text[]; p_default when the key is absent or not an array.
create or replace function private.achievement_text_array_v1(p_value jsonb, p_default text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
           when p_value is null or jsonb_typeof(p_value) <> 'array' then p_default
           else array(select jsonb_array_elements_text(p_value))
         end;
$$;

revoke all on function private.achievement_text_array_v1(jsonb, text[])
  from public, anon, authenticated;

-- Which result scopes each evaluator listens to. An evaluator not listed here is
-- never run (a definition naming it stays inert until a migration adds it —
-- decision 11).
create or replace function private.achievement_evaluator_scopes_v1(p_evaluator text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_evaluator
    when 'first_normal_finish'      then array['single', 'duel', 'group']
    when 'unique_documents'         then array['single', 'duel', 'group']
    when 'profile_card_complete'    then array['equipment']
    when 'course_improvements'      then array['single']
    when 'daily_course_days'        then array['single']
    when 'single_exact_moves'       then array['single']
    when 'course_improvement_exact' then array['single']
    when 'course_disjoint_retry'    then array['single']
    when 'duel_normal_matches'      then array['duel']
    when 'duel_normal_wins'         then array['duel']
    when 'duel_defense_successes'   then array['duel']
    when 'duel_attack_helped'       then array['duel']
    when 'duel_return_to_sender'    then array['duel']
    when 'duel_random_win'          then array['duel']
    when 'duel_same_document'       then array['duel']
    when 'group_normal_finishes'    then array['group']
    when 'group_party_finish'       then array['group']
    when 'group_stay_until_close'   then array['group']
    when 'group_same_path'          then array['group']
    when 'group_top3_disjoint'      then array['group']
    when 'group_top3_close'         then array['group']
    else '{}'::text[]
  end;
$$;

revoke all on function private.achievement_evaluator_scopes_v1(text)
  from public, anon, authenticated;

-- The same pair's matches on the KST day of this match, cancelled excluded,
-- this match included — 15c's ordinal (20260930090000 §4), as a function so a
-- recount can apply it to every past match.
create or replace function private.achievement_duel_ordinal_v1(p_match public.match_history)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_match.winner_user_id is null or p_match.loser_user_id is null then 1
    else (
      select count(*)::integer
        from public.match_history other
       where other.result_status <> 'cancelled'
         and least(other.winner_user_id, other.loser_user_id)
             = least(p_match.winner_user_id, p_match.loser_user_id)
         and greatest(other.winner_user_id, other.loser_user_id)
             = greatest(p_match.winner_user_id, p_match.loser_user_id)
         and (coalesce(other.finalized_at, other.created_at) at time zone 'Asia/Seoul')::date
             = (coalesce(p_match.finalized_at, p_match.created_at) at time zone 'Asia/Seoul')::date
         and (coalesce(other.finalized_at, other.created_at), other.id)
             <= (coalesce(p_match.finalized_at, p_match.created_at), p_match.id)
    )
  end;
$$;

revoke all on function private.achievement_duel_ordinal_v1(public.match_history)
  from public, anon, authenticated;

-- A player's final path in one game, replayed from game_move_events the way the
-- move RPCs build path_page_ids: UNDO pops, every other event appends. Used for
-- group rooms, whose finished players may have left room_players since.
create or replace function private.achievement_game_path_v1(
  p_scope text,
  p_game_id uuid,
  p_user_id uuid,
  p_start_page_id text
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text[] := case when p_start_page_id is null then '{}'::text[] else array[p_start_page_id] end;
  v_event record;
begin
  for v_event in
    select event.event_type, event.from_page_id, event.to_page_id
      from public.game_move_events event
     where event.scope = p_scope
       and event.game_id = p_game_id
       and event.actor_user_id = p_user_id
     order by event.version_after, event.server_timestamp, event.id
  loop
    if cardinality(v_path) = 0 and v_event.from_page_id is not null then
      v_path := array[v_event.from_page_id];
    end if;
    if v_event.event_type = 'UNDO' then
      v_path := v_path[1:greatest(1, cardinality(v_path) - 1)];
    else
      v_path := v_path || v_event.to_page_id;
    end if;
  end loop;
  return v_path;
end;
$$;

revoke all on function private.achievement_game_path_v1(text, uuid, uuid, text)
  from public, anon, authenticated;

-- Finished players of a group room with their replayed paths.
create or replace function private.achievement_group_finishers_v1(p_room_id uuid)
returns table (user_id uuid, rank integer, finished_at timestamptz, path text[])
language sql
stable
security definer
set search_path = ''
as $$
  select result.user_id, result.rank, result.finished_at,
         private.achievement_game_path_v1('group', p_room_id, result.user_id, room.group_start_page_id)
    from public.group_match_results result
    join public.game_rooms room on room.id = result.room_id
   where result.room_id = p_room_id
     and result.result_status = 'finished';
$$;

revoke all on function private.achievement_group_finishers_v1(uuid)
  from public, anon, authenticated;

-- Server-authoritative single completions of one player: a completed
-- game_records row backed by its completed run. Legacy rows without run_id
-- (O1, 0~1 s records) never count (decision 8).
create or replace function private.achievement_single_records_v1(p_user_id uuid)
returns setof public.game_records
language sql
stable
security definer
set search_path = ''
as $$
  select record.*
    from public.game_records record
    join public.single_game_runs run on run.id = record.run_id
   where record.user_id = p_user_id
     and record.result_status = 'completed'
     and run.status = 'completed'
     and run.user_id = record.user_id;
$$;

revoke all on function private.achievement_single_records_v1(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Visited documents (넓어진 세계) — recorded per result, counted by set size.
-- ---------------------------------------------------------------------------
-- Every document the player stood on in that game, start included: both ends of
-- each of their move events. Canonical page ids, one row per (user, page).
create or replace function private.achievement_record_visits_v1(
  p_user_id uuid,
  p_scope text,
  p_result_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_inserted integer;
begin
  if p_scope = 'single' then
    select run_id into v_game_id from public.game_records where id = p_result_id;
  elsif p_scope = 'duel' then
    select room_id into v_game_id from public.match_history where id = p_result_id;
  elsif p_scope = 'group' then
    v_game_id := p_result_id;
  end if;

  if v_game_id is null or p_user_id is null then
    return 0;
  end if;

  insert into public.user_visited_documents (
    user_id, page_id, first_source_type, first_source_id, first_seen_at
  )
  select p_user_id, visit.page_id, p_scope, p_result_id, min(visit.seen_at)
    from (
      select event.from_page_id as page_id, event.server_timestamp as seen_at
        from public.game_move_events event
       where event.scope = p_scope and event.game_id = v_game_id
         and event.actor_user_id = p_user_id
      union all
      select event.to_page_id, event.server_timestamp
        from public.game_move_events event
       where event.scope = p_scope and event.game_id = v_game_id
         and event.actor_user_id = p_user_id
    ) visit
   where nullif(visit.page_id, '') is not null
   group by visit.page_id
  on conflict (user_id, page_id) do nothing;
  get diagnostics v_inserted = row_count;

  return v_inserted;
end;
$$;

revoke all on function private.achievement_record_visits_v1(uuid, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. private.achievement_value_v1 — the evaluators.
-- ---------------------------------------------------------------------------
-- Returns the value to record for one definition, one player and one result, or
-- null when there is nothing to record (the result does not qualify, or a
-- situational condition is not met). Cumulative evaluators recount from the
-- source tables and do not depend on which result triggered them. Defaults for
-- ambiguous conditions are 16-HANDOFF.md §1.1, carried in definitions.params.
create or replace function private.achievement_value_v1(
  p_definition public.achievement_definitions,
  p_user_id uuid,
  p_scope text,
  p_result_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_params jsonb := coalesce(p_definition.params, '{}'::jsonb);
  v_record public.game_records;
  v_previous public.game_records;
  v_match public.match_history;
  v_room public.game_rooms;
  v_normal_win boolean := false;
  v_met boolean := false;
  v_count bigint;
  v_best integer;
  v_path text[];
  v_previous_path text[];
  v_list text[];
  v_list_2 text[];
  v_statuses text[];
  v_start_page text;
  v_targets text[];
  v_end timestamptz;
begin
  -- Load and validate the scope's result for this player.
  if p_scope = 'single' then
    select record.* into v_record
      from private.achievement_single_records_v1(p_user_id) record
     where record.id = p_result_id;
    if not found then return null; end if;
  elsif p_scope = 'duel' then
    select * into v_match
      from public.match_history
     where id = p_result_id
       and result_status <> 'cancelled'
       and p_user_id in (winner_user_id, loser_user_id);
    if not found then return null; end if;
    select * into v_room from public.game_rooms where id = v_match.room_id;
    v_normal_win := v_match.result_status = 'completed' and v_match.winner_user_id = p_user_id;
  elsif p_scope = 'group' then
    select * into v_room
      from public.game_rooms
     where id = p_result_id
       and mode = 'group'
       and status = 'finished'
       and finished_reason is distinct from 'cancelled';
    if not found then return null; end if;
    if not exists (select 1 from public.group_match_results
                    where room_id = p_result_id and user_id = p_user_id) then
      return null;
    end if;
  elsif p_scope = 'equipment' then
    if p_result_id is distinct from p_user_id then return null; end if;
  else
    return null;
  end if;

  case p_definition.evaluator

  -- 첫 도착: this result is the player's normal finish. Single = a completed
  -- run; duel = the normal-finish winner; group = a finished result row.
  when 'first_normal_finish' then
    if not (p_scope = any (private.achievement_text_array_v1(
              v_params->'scopes', array['single', 'duel', 'group']))) then
      return null;
    end if;
    v_met := case p_scope
      when 'single' then true
      when 'duel' then v_normal_win
      when 'group' then exists (
        select 1 from public.group_match_results
         where room_id = p_result_id and user_id = p_user_id and result_status = 'finished')
      else false
    end;

  -- 준비된 탐험가: every `requires` slot equipped and at least one `any_of` slot.
  when 'profile_card_complete' then
    v_list := private.achievement_text_array_v1(v_params->'requires', array['profile_icon']);
    v_list_2 := private.achievement_text_array_v1(v_params->'any_of', array['title', 'badge']);
    v_met := not exists (
               select 1 from unnest(v_list) as required(slot)
                where not exists (
                  select 1 from public.user_profile_equipment equipment
                   where equipment.user_id = p_user_id and equipment.slot = required.slot))
             and exists (
               select 1 from public.user_profile_equipment equipment
                where equipment.user_id = p_user_id and equipment.slot = any (v_list_2));

  -- 넓어진 세계: size of the visited set (filled before evaluation, §3).
  when 'unique_documents' then
    select count(*) into v_count from public.user_visited_documents where user_id = p_user_id;
    return v_count;

  -- 더 나은 길: completions that beat the player's previous best on the same
  -- (start, target), metric moves (§1.1).
  when 'course_improvements' then
    select count(*) into v_count
      from (
        select record.click_count,
               min(record.click_count) over (
                 partition by record.start_page_id, record.target_page_id
                 order by record.created_at, record.id
                 rows between unbounded preceding and 1 preceding
               ) as previous_best
          from private.achievement_single_records_v1(p_user_id) record
      ) ranked
     where ranked.previous_best is not null
       and ranked.click_count < ranked.previous_best;
    return v_count;

  -- 오늘도 탐험 · 이어지는 발걸음: distinct KST days with a completion of that
  -- day's course. Same day/course rule as 15c's daily_course_first_finish.
  when 'daily_course_days' then
    select count(distinct (record.created_at at time zone 'Asia/Seoul')::date) into v_count
      from private.achievement_single_records_v1(p_user_id) record
     where exists (
       select 1 from public.daily_challenges challenge
        where challenge.challenge_date = (record.created_at at time zone 'Asia/Seoul')::date
          and private.normalize_wiki_title(challenge.target_title)
              = private.normalize_wiki_title(record.target_title));
    return v_count;

  -- 맞수와의 만남 · 승부사 · 순수한 승부: normal matches (or wins). Forfeits,
  -- disconnect forfeits and the same-pair 0% repeats are excluded (16 §2.4).
  when 'duel_normal_matches', 'duel_normal_wins' then
    v_list := private.achievement_text_array_v1(v_params->'exclude_result_reasons', '{}'::text[]);
    v_list_2 := private.achievement_text_array_v1(v_params->'exclude_decay_reasons', '{}'::text[]);
    v_statuses := case
      when p_definition.evaluator = 'duel_normal_wins'
       and not coalesce((v_params->>'exclude_forfeit_wins')::boolean, true)
      then array['completed', 'forfeit']
      else array['completed']
    end;
    select count(*) into v_count
      from public.match_history counted
      join public.game_rooms counted_room on counted_room.id = counted.room_id
     where (counted.winner_user_id = p_user_id
            or (p_definition.evaluator = 'duel_normal_matches' and counted.loser_user_id = p_user_id))
       and counted.result_status = any (v_statuses)
       and coalesce(counted.result_reason, '') <> all (v_list)
       and (not (v_params ? 'use_items')
            or coalesce(counted_room.use_items, true) = (v_params->>'use_items')::boolean)
       and coalesce((select decay.decay_reason
                       from private.duel_decay_v1(2, private.achievement_duel_ordinal_v1(counted)) decay),
                    '') <> all (v_list_2);
    return v_count;

  -- 완벽한 대응: defenses that did their job, over all non-cancelled matches.
  -- 편집 보호 / 역링크 = an attack it consumed; 되돌리기 = an UNDO that took back
  -- an opponent's forced move.
  when 'duel_defense_successes' then
    v_list := private.achievement_text_array_v1(
      v_params->'items', array['cleanse_shield', 'go_back', 'backlink_reflect']);
    select count(*) into v_count
      from (
        select attack.id
          from public.duel_item_events attack
          join public.duel_item_events defense on defense.id = attack.consumed_defense_event_id
         where defense.actor_user_id = p_user_id
           and defense.item_id = any (v_list)
           and attack.result in ('blocked', 'reflected')
           and attack.room_id in (
             select mine.room_id from public.match_history mine
              where (mine.winner_user_id = p_user_id or mine.loser_user_id = p_user_id)
                and mine.result_status <> 'cancelled')
        union all
        select undo_item.id
          from public.duel_item_events undo_item
          join public.game_move_events undo_move on undo_move.id = undo_item.move_event_id
          join public.game_move_events forced on forced.id = undo_move.undone_event_id
          join public.duel_item_events cause on cause.id = forced.item_event_id
         where undo_item.actor_user_id = p_user_id
           and undo_item.item_id = 'go_back'
           and 'go_back' = any (v_list)
           and undo_item.result = 'applied'
           and undo_move.event_type = 'UNDO'
           and forced.event_type = 'FORCED_LINK'
           and cause.actor_user_id <> p_user_id
           and undo_item.room_id in (
             select mine.room_id from public.match_history mine
              where (mine.winner_user_id = p_user_id or mine.loser_user_id = p_user_id)
                and mine.result_status <> 'cancelled')
      ) successes;
    return v_count;

  -- 함께하는 탐험: finished result rows in non-cancelled group rooms.
  when 'group_normal_finishes' then
    select count(*) into v_count
      from public.group_match_results result
      join public.game_rooms room on room.id = result.room_id
     where result.user_id = p_user_id
       and result.result_status = 'finished'
       and room.mode = 'group'
       and room.status = 'finished'
       and room.finished_reason is distinct from 'cancelled';
    return v_count;

  -- 여덟 명의 원정대: finished in a room with `participants` result rows (§1.1).
  when 'group_party_finish' then
    v_met := exists (select 1 from public.group_match_results
                      where room_id = p_result_id and user_id = p_user_id
                        and result_status = 'finished')
             and (select count(*) from public.group_match_results where room_id = p_result_id)
                 >= coalesce((v_params->>'participants')::integer, 8);

  -- 끝까지 함께 (approximation, 16-HANDOFF.md §2): still in room_players as
  -- finished when the room closes, having finished before the close. Marked once
  -- per room; the value is the number of marks.
  when 'group_stay_until_close' then
    if exists (
      select 1 from public.room_players player
       where player.room_id = p_result_id
         and player.user_id = p_user_id
         and player.player_status = 'finished'
         and player.has_finished
         and player.finished_at < coalesce(v_room.finished_at, now())
    ) then
      insert into public.user_achievement_marks (user_id, achievement_id, source_type, source_id)
      values (p_user_id, p_definition.achievement_id, 'group', p_result_id)
      on conflict do nothing;
    end if;
    select count(*) into v_count
      from public.user_achievement_marks
     where user_id = p_user_id and achievement_id = p_definition.achievement_id;
    return v_count;

  -- Exactly `moves` moves in a single completion.
  when 'single_exact_moves' then
    v_met := v_record.click_count = coalesce((v_params->>'moves')::integer, 1);

  -- Beat the previous best on the same course by exactly `delta` moves.
  when 'course_improvement_exact' then
    select min(record.click_count) into v_best
      from private.achievement_single_records_v1(p_user_id) record
     where record.start_page_id is not distinct from v_record.start_page_id
       and record.target_page_id is not distinct from v_record.target_page_id
       and (record.created_at, record.id) < (v_record.created_at, v_record.id);
    v_met := v_best is not null
             and v_record.click_count = v_best - coalesce((v_params->>'delta')::integer, 1);

  -- Against the previous completion of the same course (§1.1): both at least
  -- `min_moves` moves, and no intermediate document in common.
  when 'course_disjoint_retry' then
    select record.* into v_previous
      from private.achievement_single_records_v1(p_user_id) record
     where record.start_page_id is not distinct from v_record.start_page_id
       and record.target_page_id is not distinct from v_record.target_page_id
       and (record.created_at, record.id) < (v_record.created_at, v_record.id)
     order by record.created_at desc, record.id desc
     limit 1;
    if not found then return null; end if;
    select run.path_page_ids into v_path from public.single_game_runs run where run.id = v_record.run_id;
    select run.path_page_ids into v_previous_path from public.single_game_runs run where run.id = v_previous.run_id;
    v_met := v_record.click_count >= coalesce((v_params->>'min_moves')::integer, 5)
             and v_previous.click_count >= coalesce((v_params->>'min_moves')::integer, 5)
             and cardinality(v_path) >= 3
             and cardinality(v_previous_path) >= 3
             and not (v_path[2:cardinality(v_path) - 1] && v_previous_path[2:cardinality(v_previous_path) - 1]);

  -- Won normally after an opponent's `item` hit: no UNDO afterwards and at most
  -- `max_moves_after` moves from the hit to the finish. A reflected attack is
  -- the player's own and does not count (§1.1).
  when 'duel_attack_helped' then
    v_met := v_normal_win and exists (
      select 1
        from public.duel_item_events hit
        join public.game_move_events forced on forced.id = hit.move_event_id
       where hit.room_id = v_match.room_id
         and hit.item_id = coalesce(v_params->>'item', 'random_link_move')
         and hit.target_user_id = p_user_id
         and (hit.result = 'applied'
              or (hit.result = 'reflected'
                  and not coalesce((v_params->>'exclude_reflected')::boolean, true)))
         and (hit.actor_user_id <> p_user_id
              or not coalesce((v_params->>'exclude_reflected')::boolean, true))
         and forced.actor_user_id = p_user_id
         and not exists (
           select 1 from public.game_move_events later
            where later.scope = 'duel' and later.game_id = v_match.room_id
              and later.actor_user_id = p_user_id
              and later.version_after > forced.version_after
              and later.event_type = 'UNDO')
         and (select count(*) from public.game_move_events later
               where later.scope = 'duel' and later.game_id = v_match.room_id
                 and later.actor_user_id = p_user_id
                 and later.version_after > forced.version_after)
             between 1 and coalesce((v_params->>'max_moves_after')::integer, 2)
    );

  -- Won normally in a match where the player's `item` reflected an attack.
  when 'duel_return_to_sender' then
    v_met := v_normal_win and exists (
      select 1
        from public.duel_item_events attack
        join public.duel_item_events defense on defense.id = attack.consumed_defense_event_id
       where attack.room_id = v_match.room_id
         and attack.result = 'reflected'
         and defense.actor_user_id = p_user_id
         and defense.item_id = coalesce(v_params->>'item', 'backlink_reflect')
    );

  -- Won normally with only direct links (at most `max_moves_after`) after the
  -- player's own `item` move.
  when 'duel_random_win' then
    v_met := v_normal_win and exists (
      select 1
        from public.duel_item_events used
        join public.game_move_events jump on jump.id = used.move_event_id
       where used.room_id = v_match.room_id
         and used.item_id = coalesce(v_params->>'item', 'random_teleport')
         and used.actor_user_id = p_user_id
         and used.result = 'applied'
         and jump.actor_user_id = p_user_id
         and not exists (
           select 1 from public.game_move_events later
            where later.scope = 'duel' and later.game_id = v_match.room_id
              and later.actor_user_id = p_user_id
              and later.version_after > jump.version_after
              and later.event_type <> 'NORMAL_LINK')
         and (select count(*) from public.game_move_events later
               where later.scope = 'duel' and later.game_id = v_match.room_id
                 and later.actor_user_id = p_user_id
                 and later.version_after > jump.version_after)
             between 1 and coalesce((v_params->>'max_moves_after')::integer, 5)
    );

  -- Normal finish, and both players stood on the same document at the same
  -- time — not the shared start, not either target. Each position holds from its
  -- move until that player's next move (or the end of the match). Both targets
  -- come from room_players; if either row is gone the match is not judged.
  when 'duel_same_document' then
    if v_match.result_status <> 'completed'
       or v_match.winner_user_id is null or v_match.loser_user_id is null then
      return null;
    end if;
    select array_agg(player.target_page_id) into v_targets
      from public.room_players player
     where player.room_id = v_match.room_id
       and player.user_id in (v_match.winner_user_id, v_match.loser_user_id)
       and player.target_page_id is not null;
    if coalesce(cardinality(v_targets), 0) < 2 then return null; end if;
    v_start_page := v_room.duel_start_page_id;
    v_end := coalesce(v_match.finalized_at, v_room.finished_at, now());
    v_met := exists (
      with stay as (
        select event.actor_user_id as user_id,
               event.to_page_id as page_id,
               event.server_timestamp as entered_at,
               coalesce(lead(event.server_timestamp) over (
                          partition by event.actor_user_id
                          order by event.version_after, event.server_timestamp, event.id),
                        v_end) as left_at
          from public.game_move_events event
         where event.scope = 'duel'
           and event.game_id = v_match.room_id
           and event.actor_user_id in (v_match.winner_user_id, v_match.loser_user_id)
      )
      select 1
        from stay mine
        join stay theirs
          on theirs.user_id <> mine.user_id
         and theirs.page_id = mine.page_id
       where mine.user_id = v_match.winner_user_id
         and mine.page_id is distinct from v_start_page
         and mine.page_id <> all (v_targets)
         and mine.entered_at < theirs.left_at
         and theirs.entered_at < mine.left_at
    );

  -- Finished with exactly the same full path as another finisher of the room.
  when 'group_same_path' then
    v_met := exists (
      select 1
        from private.achievement_group_finishers_v1(p_result_id) mine
        join private.achievement_group_finishers_v1(p_result_id) other
          on other.user_id <> mine.user_id
         and other.path = mine.path
       where mine.user_id = p_user_id
    );

  -- Ranks 1·2·3 all finished, the player is one of them, each has at least one
  -- intermediate document and no intermediate document is shared.
  when 'group_top3_disjoint' then
    v_met := exists (
      with top as (
        select finisher.user_id, finisher.path[2:cardinality(finisher.path) - 1] as middle
          from private.achievement_group_finishers_v1(p_result_id) finisher
         where finisher.rank between 1 and 3
      ), pages as (
        select distinct top.user_id, page.page_id
          from top cross join lateral unnest(top.middle) as page(page_id)
      )
      select 1
       where (select count(*) from top) = 3
         and exists (select 1 from top where top.user_id = p_user_id)
         and not exists (select 1 from top where coalesce(cardinality(top.middle), 0) = 0)
         and (select count(*) from pages) = (select count(distinct page_id) from pages)
    );

  -- Ranks 1 → 3 within `window_ms` by finished_at (§1.1), the player among them.
  when 'group_top3_close' then
    v_met := exists (
      select 1
        from public.group_match_results top
       where top.room_id = p_result_id
         and top.result_status = 'finished'
         and top.rank between 1 and 3
       having count(*) = 3
          and bool_or(top.user_id = p_user_id)
          and max(top.finished_at) - min(top.finished_at)
              <= coalesce((v_params->>'window_ms')::integer, 1000) * interval '1 millisecond'
    );

  else
    return null;
  end case;

  return case when v_met then 1 else null end;
end;
$$;

revoke all on function private.achievement_value_v1(public.achievement_definitions, uuid, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. One definition, one player, one result.
-- ---------------------------------------------------------------------------
-- null = nothing recorded. Otherwise the apply_achievement_value_v1 answer.
create or replace function private.evaluate_achievement_v1(
  p_definition public.achievement_definitions,
  p_user_id uuid,
  p_scope text,
  p_result_id uuid,
  p_result_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  -- 16 §1: situational achievements start at activation — an older result is
  -- not judged, even through the re-run RPC.
  if p_definition.retro_policy = 'from_activation'
     and p_result_at < coalesce(p_definition.starts_at, p_definition.created_at) then
    return null;
  end if;

  v_value := private.achievement_value_v1(p_definition, p_user_id, p_scope, p_result_id);
  if v_value is null
     or (p_definition.display_policy = 'once' and v_value < 1) then
    return null;
  end if;

  return private.apply_achievement_value_v1(
    p_user_id,
    p_definition.achievement_id,
    v_value,
    jsonb_build_object('last_scope', p_scope, 'last_source_id', p_result_id),
    p_scope,
    case when p_scope = 'equipment' then null else p_result_id end,
    now()
  );
end;
$$;

revoke all on function private.evaluate_achievement_v1(public.achievement_definitions, uuid, text, uuid, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Every live definition for one player — the inner isolation layer.
-- ---------------------------------------------------------------------------
create or replace function private.record_user_achievements_v1(
  p_user_id uuid,
  p_scope text,
  p_result_id uuid,
  p_result_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_definition public.achievement_definitions;
  v_result jsonb;
  v_results jsonb := jsonb_build_array();
begin
  -- The visited set feeds a counter but is a fact about the game, not about a
  -- definition, so it is recorded even while that definition is inactive.
  if p_scope in ('single', 'duel', 'group') then
    begin
      perform private.achievement_record_visits_v1(p_user_id, p_scope, p_result_id);
    exception when others then
      raise warning 'ACHIEVEMENT_VISITS_FAILED user=% scope=% id=% sqlstate=% message=%',
        p_user_id, p_scope, p_result_id, sqlstate, sqlerrm;
    end;
  end if;

  for v_definition in
    select definition.*
      from public.achievement_definitions definition
     where p_scope = any (private.achievement_evaluator_scopes_v1(definition.evaluator))
       and private.achievement_is_live_v1(definition, now())
     order by definition.sort_order, definition.achievement_id
  loop
    begin
      v_result := private.evaluate_achievement_v1(
        v_definition, p_user_id, p_scope, p_result_id, p_result_at);
    exception when others then
      v_result := jsonb_build_object(
        'ok', false, 'code', 'ACHIEVEMENT_EVAL_EXCEPTION',
        'achievement_id', v_definition.achievement_id,
        'sqlstate', sqlstate, 'message', sqlerrm
      );
    end;

    if v_result is null then
      continue;
    end if;

    if coalesce((v_result->>'ok')::boolean, false) is not true then
      raise warning 'ACHIEVEMENT_EVAL_FAILED user=% achievement=% scope=% id=% result=%',
        p_user_id, v_definition.achievement_id, p_scope, p_result_id, v_result;
      v_result := v_result || jsonb_build_object('achievement_id', v_definition.achievement_id);
    end if;

    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return v_results;
end;
$$;

revoke all on function private.record_user_achievements_v1(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. One result — every participant, profile locks in user_id order.
-- ---------------------------------------------------------------------------
-- p_result_id is game_records.id (single), match_history.id (duel),
-- game_rooms.id (group) or the player's own id (equipment).
create or replace function private.record_result_achievements_v1(
  p_scope text,
  p_result_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users uuid[] := '{}'::uuid[];
  v_at timestamptz := now();
  v_user_id uuid;
  v_record public.game_records;
  v_match public.match_history;
  v_room public.game_rooms;
  v_results jsonb := jsonb_build_array();
begin
  if p_result_id is null
     or p_scope is null
     or p_scope not in ('single', 'duel', 'group', 'equipment') then
    return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_SOURCE_INVALID');
  end if;

  if p_scope = 'single' then
    select * into v_record from public.game_records where id = p_result_id;
    if found and v_record.user_id is not null and v_record.run_id is not null
       and v_record.result_status = 'completed' then
      v_users := array[v_record.user_id];
      v_at := v_record.created_at;
    end if;
  elsif p_scope = 'duel' then
    select * into v_match from public.match_history where id = p_result_id;
    if found and v_match.result_status <> 'cancelled' then
      v_users := array(
        select distinct player.user_id
          from unnest(array[v_match.winner_user_id, v_match.loser_user_id]) as player(user_id)
         where player.user_id is not null
      );
      v_at := coalesce(v_match.finalized_at, v_match.created_at);
    end if;
  elsif p_scope = 'group' then
    select * into v_room from public.game_rooms where id = p_result_id;
    if found and v_room.mode = 'group' and v_room.status = 'finished'
       and v_room.finished_reason is distinct from 'cancelled' then
      -- Result rows, not room_players: a finisher who left is still a participant.
      v_users := array(
        select result.user_id from public.group_match_results result
         where result.room_id = p_result_id
      );
      v_at := coalesce(v_room.finished_at, now());
    end if;
  else
    v_users := array[p_result_id];
  end if;

  -- Only players with a profile (guests never get achievements, 16 §8).
  v_users := array(
    select profile.id from public.profiles profile
     where profile.id = any (v_users)
     order by profile.id
  );

  -- Lock every participant's profile first, in user_id order — the same order
  -- 15c's grants and the item RPCs use, so up to eight players never deadlock.
  foreach v_user_id in array v_users loop
    perform 1 from public.profiles where id = v_user_id for update;
  end loop;

  foreach v_user_id in array v_users loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', v_user_id,
      'achievements', private.record_user_achievements_v1(v_user_id, p_scope, p_result_id, v_at)
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'scope', p_scope,
    'result_id', p_result_id,
    'users', v_results
  );
end;
$$;

revoke all on function private.record_result_achievements_v1(text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. public.evaluate_result_achievements_v1 — idempotent re-run for one result.
-- ---------------------------------------------------------------------------
-- service_role only, like grant_result_xp_v1: it grants to other users.
create or replace function public.evaluate_result_achievements_v1(
  p_scope text,
  p_result_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.record_result_achievements_v1(p_scope, p_result_id);
end;
$$;

revoke all on function public.evaluate_result_achievements_v1(text, uuid)
  from public, anon, authenticated;
grant execute on function public.evaluate_result_achievements_v1(text, uuid)
  to service_role;

commit;
