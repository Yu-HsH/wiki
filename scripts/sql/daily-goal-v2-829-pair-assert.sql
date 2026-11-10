-- Run only in the isolated 829-pair integration fixture (never linked production).
do $test$
declare
  d date := (now() at time zone 'Asia/Seoul')::date;
  r record;
  i integer;
  distinct_goals integer;
  distinct_starts integer;
begin
  if (select count(*) from public.daily_course_pairs_v2) <> 829 then
    raise exception 'EXPECTED_829_PROVEN_CACHE_PAIRS';
  end if;
  if (select count(distinct target_title) from public.daily_course_pairs_v2) <> 37 then
    raise exception 'EXPECTED_37_ELIGIBLE_TARGETS';
  end if;
  delete from public.daily_challenges where challenge_date > d;
  for i in 1..30 loop
    select * into r from private.choose_daily_course_goal_first_v2(d+i);
    if r.start_title is null or r.target_title is null then raise exception 'EMPTY_DAY_%',i; end if;
    if not exists(select 1 from public.daily_course_pairs_v2
       where start_title=r.start_title and target_title=r.target_title) then
      raise exception 'OUT_OF_VERIFIED_PAIR_DAY_%',i;
    end if;
    insert into public.daily_challenges(challenge_date,start_title,target_title,hint)
      values(d+i,r.start_title,r.target_title,r.hint);
  end loop;
  select count(distinct target_title),count(distinct start_title)
    into distinct_goals,distinct_starts
    from public.daily_challenges where challenge_date>d;
  if distinct_goals<18 or distinct_starts<8 then
    raise exception 'INSUFFICIENT_GOAL_DIVERSITY targets:% starts:%',distinct_goals,distinct_starts;
  end if;
  if exists(
    select 1 from public.daily_challenges a
    join public.daily_challenges b on a.target_title=b.target_title
      and b.challenge_date>a.challenge_date
      and b.challenge_date<=a.challenge_date+7
    where a.challenge_date>d
  ) then raise exception '7_DAY_TARGET_COOLDOWN_NOT_RESPECTED_WITH_37_TARGET_CHOICES'; end if;
  raise notice 'DAILY_GOAL_V2_829_PAIR_30_DAY_PASS: distinct goals %, distinct starts %, no target repeated within 7 days',distinct_goals,distinct_starts;
end $test$;
