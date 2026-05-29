-- MainPage.jsx에 남아 있던 기존 DAILY_POOL 후보를 Supabase daily_challenge_pool에 넣는 SQL입니다.
-- Supabase SQL Editor에서 그대로 실행하면 됩니다.
-- 시작 문서는 현재 앱에서 사용하지 않으므로 start_title은 null로 넣습니다.
-- sort_order 101부터 넣어 기존 자동 후보와 충돌하지 않게 했습니다.

insert into public.daily_challenge_pool (sort_order, start_title, target_title, hint, is_active)
values
  (101, null, '벤치 프레스', '웨이트 트레이닝의 ''Big 3''로 불리는 대표적인 근력 운동 중 하나', true),
  (102, null, '고래상어', '현존 가장 큰 어류', true),
  (103, null, 'GPT (언어 모델)', 'AI 미국의 인공지능 단체 오픈AI가 2018년 선보인 대형 언어 모델', true),
  (104, null, '교황 프란치스코', '아르헨티나 출신으로 제266대 로마 가톨릭교회의 교황', true),
  (105, null, 'SQL', '관계형 데이터베이스 관리 시스템(RDBMS)의 데이터를 조작하고 정의하기 위해 설계된 프로그래밍 언어', true),
  (106, null, '백준 온라인 저지', '알고리즘 문제 풀이 사이트', true),
  (107, null, '생맥주', '전 세계적으로 사랑받는 술', true),
  (108, null, '레드벨벳 (아이돌)', '대한민국의 5인조 걸그룹', true)
on conflict (sort_order) do update set
  start_title = excluded.start_title,
  target_title = excluded.target_title,
  hint = excluded.hint,
  is_active = excluded.is_active;

-- 오늘의 도전을 위 후보 중 하나로 직접 지정하고 싶을 때 예시입니다.
-- target_title과 hint만 원하는 값으로 바꿔서 실행하세요.
-- insert into public.daily_challenges (challenge_date, target_title, hint)
-- values ('2026-05-26', '고래상어', '현존 가장 큰 어류')
-- on conflict (challenge_date) do update set
--   target_title = excluded.target_title,
--   hint = excluded.hint;
