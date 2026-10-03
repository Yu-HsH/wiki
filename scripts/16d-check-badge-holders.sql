-- 16d 배지 보유 현황 — 읽기 전용. 운영 Supabase SQL Editor에 그대로 붙인다 (결과는 마지막 select 하나).
--
-- 16d-2 migration 직전에 실행한다 (docs/agent/16-HANDOFF.md §10.3).
--   holders                 = 그 배지를 가진 사용자 수 — kind 갱신(판정 1 (a))으로 보유는 그대로 아이콘·칭호가 된다
--   equipped_users          = 그 배지를 배지 슬롯에 장착한 사용자 수 — 16d-2가 장착을 해제한다(자동 재장착 없음)
--   badge_slot_rows_total   = 해제될 장착 행 전체 수 (모든 행에 같은 값)
-- 16d-2 적용 후에는 kind = 'badge' 행이 없어 0행이 나와야 한다.
select c.reward_id, c.listed,
       count(distinct i.user_id) as holders,
       count(distinct e.user_id) filter (where e.slot = 'badge') as equipped_users,
       (select count(*) from public.user_profile_equipment where slot = 'badge') as badge_slot_rows_total
  from public.reward_catalog c
  left join public.user_reward_inventory i on i.reward_id = c.reward_id
  left join public.user_profile_equipment e on e.reward_id = c.reward_id
 where c.kind = 'badge'
 group by c.reward_id, c.listed
 order by c.reward_id;
