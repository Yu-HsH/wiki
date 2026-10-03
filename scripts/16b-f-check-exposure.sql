-- 16b-f ③ 노출 확인 — 읽기 전용. 운영 Supabase SQL Editor에 그대로 붙인다 (결과는 마지막 select 하나).
--
-- 이동 이벤트(game_move_events)가 없는 1:1·그룹 결과가 누구의 누적 카운터에 들어가 있는지, 사용자·업적별로 본다.
--   clean        = 이동 이벤트 있는 결과만 센 값 (16b-f 이후 판정기 값)
--   legacy       = 이동 이벤트 없는 결과 수 (16b-f 전 판정기는 이것까지 센다)
--   tiers_opened_by_legacy_next_game = 16b-f 전 판정기로, 다음 한 판에 legacy 때문에 열릴 단계 수. **1 이상이면 위험**
-- 16b-f 적용 후 다시 돌려 위험 단계가 0인지 확인한다 (16-HANDOFF.md §11).
-- 판정기 기준을 그대로 옮겼다: 감쇠 0%(같은 상대 같은 날 6번째부터)는 빼고, 승부사·순수한 승부는 정상 완주 승리만.
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
), defense_rows as (
  -- 완벽한 대응: 공격을 소진시킨 방어. 되돌리기 분기는 이동 이벤트를 거치므로 legacy 방에서는 생길 수 없다.
  select defense.actor_user_id as user_id,
         not exists (select 1 from public.game_move_events e
                      where e.scope = 'duel' and e.game_id = attack.room_id) as legacy
    from public.duel_item_events attack
    join public.duel_item_events defense on defense.id = attack.consumed_defense_event_id
   where defense.item_id in ('cleanse_shield', 'go_back', 'backlink_reflect')
     and attack.result in ('blocked', 'reflected')
     and exists (select 1 from public.match_history mine
                  where mine.room_id = attack.room_id and mine.result_status <> 'cancelled'
                    and defense.actor_user_id in (mine.winner_user_id, mine.loser_user_id))
), counts as (
  select 'duel_normal_matches' as achievement_id, p.user_id, d.legacy, count(*) as n
    from duel_rows d
    cross join lateral (values (d.winner_user_id), (d.loser_user_id)) p(user_id)
   where p.user_id is not null and d.reason <> 'disconnect_forfeit' and d.decay <> 'duel_repeat_zero'
   group by 1, 2, 3
  union all
  select 'duel_wins', d.winner_user_id, d.legacy, count(*)
    from duel_rows d where d.decay <> 'duel_repeat_zero' group by 1, 2, 3
  union all
  select 'duel_pure_wins', d.winner_user_id, d.legacy, count(*)
    from duel_rows d where d.decay <> 'duel_repeat_zero' and not d.use_items group by 1, 2, 3
  union all
  select 'duel_perfect_defense', x.user_id, x.legacy, count(*) from defense_rows x group by 1, 2, 3
  union all
  select 'group_normal_finishes', g.user_id, g.legacy, count(*) from group_rows g group by 1, 2, 3
), per_user as (
  select achievement_id, user_id,
         coalesce(sum(n) filter (where not legacy), 0) as clean,
         coalesce(sum(n) filter (where legacy), 0) as legacy
    from counts group by 1, 2
)
select pu.achievement_id, pr.username, pu.clean, pu.legacy, pu.clean + pu.legacy as with_legacy,
       (select min(t.threshold) from public.achievement_tiers t
         where t.achievement_id = pu.achievement_id and t.threshold > pu.clean) as next_threshold_clean,
       (select coalesce(max(u.tier), 0) from public.user_achievement_unlocks u
         where u.user_id = pu.user_id and u.achievement_id = pu.achievement_id) as unlocked_tier,
       (select count(*) from public.achievement_tiers t
         where t.achievement_id = pu.achievement_id
           and t.threshold <= pu.clean + pu.legacy + 1
           and t.threshold > pu.clean + 1
           and not exists (select 1 from public.user_achievement_unlocks u
                            where u.user_id = pu.user_id and u.achievement_id = t.achievement_id
                              and u.tier = t.tier)) as tiers_opened_by_legacy_next_game
  from per_user pu
  join public.profiles pr on pr.id = pu.user_id
 where pu.legacy > 0
 order by tiers_opened_by_legacy_next_game desc, pu.achievement_id, with_legacy desc;
