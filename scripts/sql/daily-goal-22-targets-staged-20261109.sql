-- REVIEW-ONLY STAGING SQL. Not a Supabase migration; do not apply to production.
-- Based on PR #47 official MediaWiki main namespace + non-disambiguation identity audit.
-- No existing target, daily_challenges row, XP/record, selection RPC, or wiki snapshot is changed.
-- Selection availability still depends on ensure_today_daily_challenge(); insertion alone does not guarantee rotation.
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('daily-goal-pool-22-stage-20261109',0));

create temp table wr_daily_goal_pool_22_stage_20261109
  on commit drop as
select v.sort_order, v.target_title, v.hint
from (values
  (200, '커피', '원두를 볶고 추출해 마시는 대표적인 기호 음료'),
  (201, '발효', '미생물의 작용으로 음식과 물질이 변화하는 과정'),
  (202, '전자레인지', '전자기파로 식품을 가열하는 일상 속 조리 기구'),
  (203, '공기청정기', '공기 중 먼지와 오염 물질을 걸러내는 장치'),
  (204, '태풍', '열대 해상에서 발달하는 강력한 저기압'),
  (205, '미세먼지', '공기 중에 떠다니는 아주 작은 입자상 물질'),
  (206, '산호초', '산호가 오랜 시간 쌓아 만든 해양 생태계'),
  (207, '엘니뇨', '태평양 수온 변화로 전 세계 기후에 영향을 주는 현상'),
  (208, '카페인', '커피와 차 등에 들어 있는 각성 작용을 하는 물질'),
  (209, '백신', '감염병에 대한 면역 반응을 준비시키는 의약품'),
  (210, '알레르기', '면역계가 특정 물질에 과민하게 반응하는 현상'),
  (211, '도파민', '운동과 동기 등 여러 기능에 관여하는 신경전달물질'),
  (212, '경복궁', '조선 왕조의 대표적인 궁궐'),
  (213, '비단길', '동서양을 연결했던 오랜 교역로'),
  (214, '인플레이션', '물가 수준이 전반적으로 상승하는 경제 현상'),
  (215, '인공지능', '인간의 지능적 작업을 수행하도록 설계한 기술 분야'),
  (216, '챗GPT', '대화형 생성 인공지능 서비스'),
  (217, '넷플릭스', '영화와 드라마 등을 제공하는 온라인 영상 서비스'),
  (218, 'K-pop', '한국에서 발전한 대중음악과 그 문화'),
  (219, '리그 오브 레전드', '팀이 협력해 상대 진영을 공략하는 온라인 게임'),
  (220, '태권도', '한국에서 발전한 무예이자 국제 스포츠'),
  (221, '웹툰', '인터넷 환경에 맞게 연재되는 디지털 만화')
) as v(sort_order, target_title, hint);

do $$
begin
  if (select count(*) from pg_temp.wr_daily_goal_pool_22_stage_20261109) <> 22 then
    raise exception 'DAILY_GOAL_STAGE_INCOMPLETE_22';
  end if;
  if exists (
    select 1
    from pg_temp.wr_daily_goal_pool_22_stage_20261109 v
    join public.daily_challenge_pool p
      on p.sort_order = v.sort_order or p.target_title = v.target_title
    where p.sort_order is distinct from v.sort_order
       or p.target_title is distinct from v.target_title
  ) then
    raise exception 'DAILY_GOAL_POOL_SORT_OR_TITLE_COLLISION';
  end if;
end $$;

insert into public.daily_challenge_pool
(sort_order,start_title,target_title,hint,is_active,verified_path_titles,verified_at)
select v.sort_order, null, v.target_title, v.hint, true, null, null
from pg_temp.wr_daily_goal_pool_22_stage_20261109 v
where not exists (
  select 1 from public.daily_challenge_pool p where p.target_title=v.target_title
);

do $$
begin
  if (
    select count(*)
    from pg_temp.wr_daily_goal_pool_22_stage_20261109 v
    join public.daily_challenge_pool p
      on p.sort_order=v.sort_order and p.target_title=v.target_title
  ) <> 22 then
    raise exception 'DAILY_GOAL_STAGE_POSTCONDITION_FAILED';
  end if;
end $$;
commit;
