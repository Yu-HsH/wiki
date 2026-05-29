create table if not exists public.game_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null,
  start_title text not null,
  target_title text not null,
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  click_count integer not null check (click_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.game_records enable row level security;

create policy "insert own records"
  on public.game_records
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "read all records"
  on public.game_records
  for select
  to authenticated
  using (true);

create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  start_title text,
  start_url text,
  target_title text not null,
  target_url text,
  hint text,
  created_at timestamptz not null default now()
);

alter table public.daily_challenges enable row level security;

create policy "read daily challenges"
  on public.daily_challenges
  for select
  to anon, authenticated
  using (true);

create table if not exists public.daily_challenge_pool (
  sort_order integer primary key,
  start_title text,
  target_title text not null unique,
  hint text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.daily_challenge_pool enable row level security;

insert into public.daily_challenge_pool (sort_order, start_title, target_title, hint)
values
  (1, '대한민국', '서울특별시', '대한민국에서 수도 문서까지 이동해보세요.'),
  (2, '컴퓨터', '인터넷', '컴퓨터에서 인터넷 문서까지 이동해보세요.'),
  (3, '동물', '고양이', '동물에서 익숙한 반려동물 문서까지 이동해보세요.'),
  (4, '동물', '강아지', '동물에서 사람과 가까운 반려동물 문서까지 이동해보세요.'),
  (5, '음식', '김치', '음식에서 한국의 대표 음식 문서까지 이동해보세요.'),
  (6, '스포츠', '축구', '스포츠에서 인기 구기 종목 문서까지 이동해보세요.'),
  (7, '음악', '피아노', '음악에서 건반 악기 문서까지 이동해보세요.'),
  (8, '과학', '지구', '과학에서 우리가 사는 행성 문서까지 이동해보세요.'),
  (9, '학교', '교사', '학교에서 가르치는 사람 문서까지 이동해보세요.'),
  (10, '자동차', '버스', '자동차에서 대중교통 문서까지 이동해보세요.'),
  (11, '바다', '고래', '바다에서 큰 포유류 문서까지 이동해보세요.'),
  (12, '영화', '애니메이션', '영화에서 그림으로 움직이는 장르 문서까지 이동해보세요.'),
  (13, '도서관', '책', '도서관에서 가장 기본적인 자료 문서까지 이동해보세요.'),
  (14, '대한민국', '한글', '대한민국에서 우리 문자 문서까지 이동해보세요.'),
  (15, '계절', '여름', '계절에서 더운 계절 문서까지 이동해보세요.')
on conflict (sort_order) do update set
  start_title = excluded.start_title,
  target_title = excluded.target_title,
  hint = excluded.hint,
  is_active = true;

create or replace function public.ensure_today_daily_challenge()
returns table (
  challenge_date date,
  start_title text,
  target_title text,
  hint text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_kst date := (now() at time zone 'Asia/Seoul')::date;
  v_active_count integer;
  v_picked public.daily_challenge_pool%rowtype;
begin
  select count(*)
  into v_active_count
  from public.daily_challenge_pool
  where is_active = true;

  if v_active_count = 0 then
    raise exception 'No active daily challenge candidates';
  end if;

  select *
    into v_picked
  from public.daily_challenge_pool
  where is_active = true
  order by random()
  limit 1;

  insert into public.daily_challenges (
    challenge_date,
    start_title,
    target_title,
    hint
  )
  select
    v_today_kst,
    v_picked.start_title,
    v_picked.target_title,
    v_picked.hint
  where not exists (
    select 1
    from public.daily_challenges dc
    where dc.challenge_date = v_today_kst
  );

  return query
  select
    dc.challenge_date,
    dc.start_title,
    dc.target_title,
    dc.hint
  from public.daily_challenges dc
  where dc.challenge_date = v_today_kst;
end;
$$;

grant execute on function public.ensure_today_daily_challenge() to anon, authenticated;
