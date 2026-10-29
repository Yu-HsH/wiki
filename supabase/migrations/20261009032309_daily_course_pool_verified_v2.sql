-- Only audited candidates are eligible. Existing pool and courses are preserved.
begin;
alter table public.daily_challenge_pool
  add column verified_path_titles text[],
  add column verified_at timestamptz,
  add constraint daily_pool_verified_path_v2_check check (
    verified_at is null or (verified_path_titles is not null
      and cardinality(verified_path_titles) >= 2
      and verified_path_titles[1] = start_title
      and verified_path_titles[cardinality(verified_path_titles)] = target_title
      and start_title <> target_title));

create or replace function public.ensure_today_daily_challenge()
returns table(challenge_date date, start_title text, target_title text, hint text)
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_existing public.daily_challenges;
  v_candidate public.daily_challenge_pool;
begin
  -- Serialise all readers before selection or safe repair. INSERT's unique
  -- constraint alone does not protect a concurrent selection's chosen pair.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('daily-course:' || v_day::text, 0));
  select c.* into v_existing from public.daily_challenges c where c.challenge_date = v_day for update;
  if found then
    if nullif(btrim(v_existing.start_title), '') is null then
      -- Never change a used course, including old bundles and guest active runs.
      -- Missing start does NOT imply missing play history. Conservative target
      -- + KST date checks also cover NULL-mode records predating daily dates.
      if not exists (
        select 1 from public.single_game_runs r
        where r.daily_challenge_date = v_day
           or ((r.created_at at time zone 'Asia/Seoul')::date = v_day
             and private.normalize_wiki_title(r.target_title_snapshot) = private.normalize_wiki_title(v_existing.target_title))
      ) and not exists (
        select 1 from public.game_records r
        where r.daily_challenge_date = v_day
           or ((r.created_at at time zone 'Asia/Seoul')::date = v_day
             and private.normalize_wiki_title(r.target_title) = private.normalize_wiki_title(v_existing.target_title))
      ) then
        select p.* into v_candidate from public.daily_challenge_pool p
        where p.is_active and p.verified_at is not null and nullif(btrim(p.start_title), '') is not null
          and p.target_title = v_existing.target_title
        order by p.sort_order limit 1;
        if found then
          -- Keep today's target/hint/date; add only its audited start, before use.
          update public.daily_challenges c set start_title = v_candidate.start_title
          where c.challenge_date = v_day and nullif(btrim(c.start_title), '') is null;
        end if;
      end if;
    end if;
    return query select c.challenge_date,c.start_title,c.target_title,c.hint
      from public.daily_challenges c where c.challenge_date = v_day;
    return;
  end if;

  select p.* into v_candidate from public.daily_challenge_pool p
  where p.is_active and p.verified_at is not null and nullif(btrim(p.start_title),'') is not null
  -- Prefer a different pair from yesterday, without inventing multiple daily courses.
  order by case when exists (select 1 from public.daily_challenges c
    where c.challenge_date = v_day-1 and c.start_title = p.start_title and c.target_title = p.target_title)
    then 1 else 0 end, random() limit 1;
  if not found then raise exception 'NO_VERIFIED_DAILY_COURSE'; end if;
  insert into public.daily_challenges(challenge_date,start_title,target_title,hint)
  values(v_day,v_candidate.start_title,v_candidate.target_title,v_candidate.hint)
  on conflict on constraint daily_challenges_challenge_date_key do nothing;
  return query select c.challenge_date,c.start_title,c.target_title,c.hint
    from public.daily_challenges c where c.challenge_date = v_day;
end;
$$;
revoke all on function public.ensure_today_daily_challenge() from public;
grant execute on function public.ensure_today_daily_challenge() to anon, authenticated, service_role;
-- Verified seeds are appended below from the checked-in API audit.
insert into public.daily_challenge_pool(sort_order,start_title,target_title,hint,is_active,verified_path_titles,verified_at) values
  (1000, '대한민국', '한강', '실제 위키 링크로 연결된 오늘의 공통 코스', true, array['대한민국','서울특별시','한강'], '2026-10-09T03:23:45.308Z'::timestamptz),
  (1001, '컴퓨터', '월드 와이드 웹', '실제 위키 링크로 연결된 오늘의 공통 코스', true, array['컴퓨터','인터넷','월드 와이드 웹'], '2026-10-09T03:23:45.308Z'::timestamptz),
  (1002, '음식', '김치', '실제 위키 링크로 연결된 오늘의 공통 코스', true, array['음식','한국 요리','김치'], '2026-10-09T03:23:45.308Z'::timestamptz),
  (1003, '대한민국', '훈민정음', '실제 위키 링크로 연결된 오늘의 공통 코스', true, array['대한민국','한글','훈민정음'], '2026-10-09T03:23:45.308Z'::timestamptz),
  (1004, '생물', '광합성', '실제 위키 링크로 연결된 오늘의 공통 코스', true, array['생물','식물','광합성'], '2026-10-09T03:23:45.308Z'::timestamptz)
on conflict do nothing;
commit;
