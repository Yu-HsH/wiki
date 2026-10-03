-- Wiki Race 2.0 Track 16b-f: count only server-authoritative 1:1 and group results.
-- Forward-only migration. Historical migrations stay unchanged (R5).
--
-- Requires 20261002100000_achievement_triggers_v1.sql (16b). This file replaces
-- one function, private.achievement_value_v1, with the 16b body plus one
-- condition in each cumulative 1:1/group branch (docs/agent/16-HANDOFF.md §11):
--
--   duel_normal_matches · duel_normal_wins   (맞수와의 만남 · 승부사 · 순수한 승부)
--   duel_defense_successes                   (완벽한 대응, both branches)
--   group_normal_finishes                    (함께하는 탐험)
--
-- The condition: the result's room has at least one game_move_events row of
-- that scope — the same evidence rule as the 16b-r backfill. The single
-- evaluators already exclude legacy rows (run_id is not null, 16b §2); 1:1 and
-- group did not, so a pre-authority match was counted on the player's next game.
--
-- Unchanged: the decay ordinal (achievement_duel_ordinal_v1 keeps 15c's rule),
-- situational and once evaluators (they judge only the result at hand, which is
-- always authoritative), triggers, every other function. No data is touched;
-- unlocks already granted stay (16 §1). tests/achievementAuthorityFilter.test.js
-- pins that the body differs from 16b's only by these conditions.
--
-- Rollback: re-run section 4 of 20261002100000_achievement_triggers_v1.sql
-- (create or replace private.achievement_value_v1 with the 16b body).

begin;

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
                    '') <> all (v_list_2)
       and exists (select 1 from public.game_move_events authority
                    where authority.scope = 'duel' and authority.game_id = counted.room_id);
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
                and mine.result_status <> 'cancelled'
                and exists (select 1 from public.game_move_events authority
                             where authority.scope = 'duel' and authority.game_id = mine.room_id))
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
                and mine.result_status <> 'cancelled'
                and exists (select 1 from public.game_move_events authority
                             where authority.scope = 'duel' and authority.game_id = mine.room_id))
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
       and room.finished_reason is distinct from 'cancelled'
       and exists (select 1 from public.game_move_events authority
                    where authority.scope = 'group' and authority.game_id = room.id);
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

commit;
