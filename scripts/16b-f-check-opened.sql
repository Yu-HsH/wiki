-- 16b-f ② 이미 열린 해금 확인 — 읽기 전용. 운영 Supabase SQL Editor에 그대로 붙인다 (결과는 마지막 select 하나).
--
-- 16b 이후 열린 1:1·그룹 누적 해금(맞수와의 만남 · 승부사 · 순수한 승부 · 완벽한 대응 · 함께하는 탐험) 중
-- 이동 이벤트(game_move_events)가 없는 결과를 빼면 그 단계 기준값에 못 미치는 것.
-- **목록만 남긴다 — 회수하지 않는다** (16 §1 · 16-HANDOFF.md §11 [사용자 결정, 2026-10-03]).
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
), clean_defense as (
  -- 16b 판정기의 두 분기를 이동 이벤트 있는 방으로 한정해 다시 센다
  select defense.actor_user_id as user_id, attack.id
    from public.duel_item_events attack
    join public.duel_item_events defense on defense.id = attack.consumed_defense_event_id
   where defense.item_id in ('cleanse_shield', 'go_back', 'backlink_reflect')
     and attack.result in ('blocked', 'reflected')
     and exists (select 1 from public.match_history mine
                  where mine.room_id = attack.room_id and mine.result_status <> 'cancelled'
                    and defense.actor_user_id in (mine.winner_user_id, mine.loser_user_id))
     and exists (select 1 from public.game_move_events e where e.scope = 'duel' and e.game_id = attack.room_id)
  union all
  select undo_item.actor_user_id, undo_item.id
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
), clean as (
  select 'duel_normal_matches' as achievement_id, p.user_id, count(*) as n
    from duel_rows d
    cross join lateral (values (d.winner_user_id), (d.loser_user_id)) p(user_id)
   where p.user_id is not null and not d.legacy
     and d.reason <> 'disconnect_forfeit' and d.decay <> 'duel_repeat_zero'
   group by 1, 2
  union all
  select 'duel_wins', d.winner_user_id, count(*)
    from duel_rows d where not d.legacy and d.decay <> 'duel_repeat_zero' group by 1, 2
  union all
  select 'duel_pure_wins', d.winner_user_id, count(*)
    from duel_rows d where not d.legacy and d.decay <> 'duel_repeat_zero' and not d.use_items group by 1, 2
  union all
  select 'duel_perfect_defense', x.user_id, count(*) from clean_defense x group by 1, 2
  union all
  select 'group_normal_finishes', g.user_id, count(*) from group_rows g where not g.legacy group by 1, 2
)
select u.achievement_id, pr.username, u.tier, t.threshold, coalesce(c.n, 0) as clean_value,
       u.source_type, u.unlocked_at
  from public.user_achievement_unlocks u
  join public.achievement_tiers t on t.achievement_id = u.achievement_id and t.tier = u.tier
  join public.profiles pr on pr.id = u.user_id
  left join clean c on c.achievement_id = u.achievement_id and c.user_id = u.user_id
 where u.achievement_id in ('duel_normal_matches', 'duel_wins', 'duel_pure_wins',
                            'duel_perfect_defense', 'group_normal_finishes')
   and coalesce(c.n, 0) < t.threshold
 order by u.unlocked_at, u.achievement_id;
