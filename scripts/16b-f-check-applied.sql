-- 16b-f 적용 확인 — 읽기 전용. 운영 Supabase SQL Editor에 그대로 붙인다 (결과는 마지막 select 하나).
--
-- 이동 이벤트 없는 결과(legacy)를 가진 사용자·업적마다 **실제 판정기** private.achievement_value_v1을 불러
-- 그 값이 이동 이벤트 있는 결과만 센 값(clean)과 같은지 본다. 이 다섯 분기는 select만 한다.
--   16b-f 적용 전: evaluator_value = clean + legacy 쪽 (legacy까지 센다) → matches = false
--   16b-f 적용 후: **모든 행 matches = true** 가 통과 조건 (16-HANDOFF.md §11)
-- 16b-f-check-exposure.sql의 위험 열은 테이블에서 계산한 가정값이라 적용 확인에 쓸 수 없다 — 이 파일을 쓴다.
with duel_rows as (
  select m.id, m.room_id, m.winner_user_id, m.loser_user_id,
         coalesce(r.use_items, true) as use_items,
         coalesce(m.result_reason, '') as reason,
         not exists (select 1 from public.game_move_events e
                      where e.scope = 'duel' and e.game_id = m.room_id) as legacy,
         coalesce((select d.decay_reason
                     from private.duel_decay_v1(2, private.achievement_duel_ordinal_v1(m)) d), '') as decay
    from public.match_history m
    join public.game_rooms r on r.id = m.room_id
   where m.result_status = 'completed'
), group_rows as (
  select res.user_id,
         not exists (select 1 from public.game_move_events e
                      where e.scope = 'group' and e.game_id = room.id) as legacy
    from public.group_match_results res
    join public.game_rooms room on room.id = res.room_id
   where res.result_status = 'finished' and room.mode = 'group'
     and room.status = 'finished' and room.finished_reason is distinct from 'cancelled'
), defense_attack as (
  select defense.actor_user_id as user_id, attack.id,
         not exists (select 1 from public.game_move_events e
                      where e.scope = 'duel' and e.game_id = attack.room_id) as legacy
    from public.duel_item_events attack
    join public.duel_item_events defense on defense.id = attack.consumed_defense_event_id
   where defense.item_id in ('cleanse_shield', 'go_back', 'backlink_reflect')
     and attack.result in ('blocked', 'reflected')
     and exists (select 1 from public.match_history mine
                  where mine.room_id = attack.room_id and mine.result_status <> 'cancelled'
                    and defense.actor_user_id in (mine.winner_user_id, mine.loser_user_id))
), defense_undo as (
  -- 되돌리기 분기는 이동 이벤트를 거치므로 legacy일 수 없다
  select undo_item.actor_user_id as user_id, undo_item.id, false as legacy
    from public.duel_item_events undo_item
    join public.game_move_events undo_move on undo_move.id = undo_item.move_event_id
    join public.game_move_events forced on forced.id = undo_move.undone_event_id
    join public.duel_item_events cause on cause.id = forced.item_event_id
   where undo_item.item_id = 'go_back' and undo_item.result = 'applied'
     and undo_move.event_type = 'UNDO' and forced.event_type = 'FORCED_LINK'
     and cause.actor_user_id <> undo_item.actor_user_id
     and exists (select 1 from public.match_history mine
                  where mine.room_id = undo_item.room_id and mine.result_status <> 'cancelled'
                    and undo_item.actor_user_id in (mine.winner_user_id, mine.loser_user_id))
), counts as (
  select 'duel_normal_matches' as achievement_id, 'duel' as scope, p.user_id, d.legacy, count(*) as n
    from duel_rows d
    cross join lateral (values (d.winner_user_id), (d.loser_user_id)) p(user_id)
   where p.user_id is not null and d.reason <> 'disconnect_forfeit' and d.decay <> 'duel_repeat_zero'
   group by 1, 2, 3, 4
  union all
  select 'duel_wins', 'duel', d.winner_user_id, d.legacy, count(*)
    from duel_rows d where d.decay <> 'duel_repeat_zero' group by 1, 2, 3, 4
  union all
  select 'duel_pure_wins', 'duel', d.winner_user_id, d.legacy, count(*)
    from duel_rows d where d.decay <> 'duel_repeat_zero' and not d.use_items group by 1, 2, 3, 4
  union all
  select 'duel_perfect_defense', 'duel', x.user_id, x.legacy, count(*)
    from (select * from defense_attack union all select * from defense_undo) x group by 1, 2, 3, 4
  union all
  select 'group_normal_finishes', 'group', g.user_id, g.legacy, count(*) from group_rows g group by 1, 2, 3, 4
), per_user as (
  select achievement_id, scope, user_id,
         coalesce(sum(n) filter (where not legacy), 0) as clean,
         coalesce(sum(n) filter (where legacy), 0) as legacy
    from counts group by 1, 2, 3
), probe as (
  -- 판정기를 부를 결과 1개 (누적 판정기는 어느 결과로 불러도 같은 값을 센다)
  select pu.*,
         case pu.scope
           when 'duel' then (select m.id from public.match_history m
                              where m.result_status <> 'cancelled'
                                and pu.user_id in (m.winner_user_id, m.loser_user_id)
                              order by m.finalized_at desc nulls last limit 1)
           else (select room.id from public.group_match_results res
                   join public.game_rooms room on room.id = res.room_id
                  where res.user_id = pu.user_id and room.mode = 'group' and room.status = 'finished'
                    and room.finished_reason is distinct from 'cancelled'
                  order by room.finished_at desc nulls last limit 1)
         end as result_id
    from per_user pu
   where pu.legacy > 0
)
select probe.achievement_id, pr.username, probe.clean, probe.legacy,
       private.achievement_value_v1(definition, probe.user_id, probe.scope, probe.result_id) as evaluator_value,
       private.achievement_value_v1(definition, probe.user_id, probe.scope, probe.result_id) = probe.clean as matches
  from probe
  join public.achievement_definitions definition on definition.achievement_id = probe.achievement_id
  join public.profiles pr on pr.id = probe.user_id
 order by matches, probe.achievement_id, pr.username;
