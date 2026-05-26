-- Supabase SQL Editor에서 실행하는 analytics_events 조회용 SQL 모음입니다.
-- 아래 쿼리들은 데이터를 수정하지 않고 조회만 합니다.

-- 1. 오늘 접속 수 확인
-- 같은 브라우저에서는 하루 1회만 daily_visit을 기록하도록 앱에서 제한합니다.
select
  count(*) as today_visit_count
from public.analytics_events
where event_name = 'daily_visit'
  and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
  and created_at < (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul';

-- 2. 날짜별 접속 수 확인
select
  (created_at at time zone 'Asia/Seoul')::date as visit_date,
  count(*) as visit_count
from public.analytics_events
where event_name = 'daily_visit'
group by visit_date
order by visit_date desc;

-- 3. 오늘 전체 플레이 시작 횟수 확인
select
  count(*) as today_play_start_count
from public.analytics_events
where event_name = 'play_start'
  and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
  and created_at < (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul';

-- 4. 날짜별 전체 플레이 시작 횟수 확인
select
  (created_at at time zone 'Asia/Seoul')::date as play_date,
  count(*) as play_start_count
from public.analytics_events
where event_name = 'play_start'
group by play_date
order by play_date desc;

-- 5. 오늘 모드별 플레이 시작 횟수 확인
-- mode 값은 single, 1v1, group으로 기록됩니다.
select
  mode,
  count(*) as play_start_count
from public.analytics_events
where event_name = 'play_start'
  and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
  and created_at < (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul'
group by mode
order by play_start_count desc;

-- 6. 날짜별, 모드별 플레이 시작 횟수 확인
select
  (created_at at time zone 'Asia/Seoul')::date as play_date,
  mode,
  count(*) as play_start_count
from public.analytics_events
where event_name = 'play_start'
group by play_date, mode
order by play_date desc, play_start_count desc;

-- 7. 최근 이벤트 원본 확인
-- 실제로 이벤트가 들어오는지 빠르게 볼 때 사용합니다.
select
  created_at,
  event_name,
  user_id,
  guest_id,
  page_path,
  mode,
  room_id,
  target_title,
  metadata
from public.analytics_events
order by created_at desc
limit 50;

-- 8. 최근 7일 요약 확인
select
  (created_at at time zone 'Asia/Seoul')::date as event_date,
  count(*) filter (where event_name = 'daily_visit') as visit_count,
  count(*) filter (where event_name = 'play_start') as play_start_count,
  count(*) filter (where event_name = 'play_start' and mode = 'single') as single_start_count,
  count(*) filter (where event_name = 'play_start' and mode = '1v1') as one_vs_one_start_count,
  count(*) filter (where event_name = 'play_start' and mode = 'group') as group_start_count
from public.analytics_events
where created_at >= now() - interval '7 days'
group by event_date
order by event_date desc;
