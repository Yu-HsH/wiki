-- Isolated PostgreSQL-only fixture (never run on a linked Supabase database).
drop table if exists public.daily_challenges;
drop table if exists public.daily_challenge_pool;
create table public.daily_challenge_pool (
  sort_order integer primary key,
  start_title text,
  target_title text not null unique,
  hint text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  verified_path_titles text[],
  verified_at timestamptz,
  constraint daily_pool_verified_path_v2_check check (
    verified_at is null or (
      verified_path_titles is not null and cardinality(verified_path_titles)>=2
      and verified_path_titles[1]=start_title
      and verified_path_titles[cardinality(verified_path_titles)]=target_title
      and start_title<>target_title
    )
  )
);
create table public.daily_challenges (
  challenge_date date unique not null,
  start_title text,
  target_title text not null,
  hint text
);
insert into public.daily_challenge_pool (sort_order,start_title,target_title,hint,is_active,verified_path_titles,verified_at) values
 (101,null,'벤치 프레스','기존',true,null,null),
 (102,null,'고래상어','기존',true,null,null),
 (103,null,'GPT (언어 모델)','기존',true,null,null),
 (104,null,'교황 프란치스코','기존',true,null,null),
 (105,null,'SQL','기존',true,null,null),
 (106,null,'백준 온라인 저지','기존',true,null,null),
 (107,null,'생맥주','기존',true,null,null),
 (108,null,'레드벨벳 (아이돌)','기존',true,null,null),
 (109,null,'메이플스토리','기존',true,null,null),
 (110,null,'라면','기존',true,null,null),
 (111,null,'카카오톡','기존',true,null,null),
 (112,null,'화성','기존',true,null,null),
 (1000,'대한민국','한강','기존 검증',true,array['대한민국','서울특별시','한강'],'2026-10-09'::timestamptz),
 (1001,'컴퓨터','월드 와이드 웹','기존 검증',true,array['컴퓨터','인터넷','월드 와이드 웹'],'2026-10-09'::timestamptz),
 (1002,'음식','김치','기존 검증',true,array['음식','한국 요리','김치'],'2026-10-09'::timestamptz),
 (1003,'대한민국','훈민정음','기존 검증',true,array['대한민국','한글','훈민정음'],'2026-10-09'::timestamptz),
 (1004,'생물','광합성','기존 검증',true,array['생물','식물','광합성'],'2026-10-09'::timestamptz);
insert into public.daily_challenges(challenge_date,start_title,target_title,hint)
 values ((now() at time zone 'Asia/Seoul')::date,'김치','카카오톡','고정된 오늘의 도전');
create table daily_goal_original_pool as select * from public.daily_challenge_pool;
create table daily_goal_original_challenge as select * from public.daily_challenges;
