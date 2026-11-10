-- Execute AFTER 39-word + goal-first migration. Fully isolated PG only.
do $verify$
declare cnt int;
declare input_date date := (now() at time zone 'Asia/Seoul')::date;
declare chosen record;
declare i integer;
begin
 select count(*) into cnt from public.daily_challenge_pool;
 if cnt<>39 then raise exception 'EXPECTED_39_GOALS_GOT_%',cnt; end if;
 select count(*) into cnt from public.daily_course_pairs_v2;
 if cnt<10 then raise exception 'EXPECTED_10_PLUS_DIRECTIONAL_PAIRS_GOT_%',cnt; end if;
 if not exists(select 1 from public.daily_course_pairs_v2 where start_title='김치' and target_title='카카오톡')
 then raise exception 'UNBOUNDED_DIRECTED_REACHABILITY_FAILED'; end if;
 if exists(select 1 from public.daily_course_pairs_v2 where start_title='카카오톡' and target_title='김치')
 then raise exception 'INVALID_REVERSE_PATH_ASSUMED'; end if;
 if exists(select 1 from public.daily_course_pairs_v2 where start_title=target_title)
 then raise exception 'SELF_PAIR'; end if;
 if exists(select 1 from public.daily_course_pairs_v2 p where not exists (
   select 1 from public.daily_challenge_pool v where v.target_title=p.start_title and v.is_active
 ) or not exists (
   select 1 from public.daily_challenge_pool v where v.target_title=p.target_title and v.is_active
 )) then raise exception 'OUT_OF_POOL_PAIR'; end if;
 -- The pre-existing current day never gets replaced by a migration or RPC.
 if not exists(select 1 from public.daily_challenges where challenge_date=input_date and start_title='김치' and target_title='카카오톡')
 then raise exception 'TODAY_PREEXISTING_COURSE_CHANGED'; end if;
 for i in 1..30 loop
   select * into chosen from private.choose_daily_course_goal_first_v2(input_date+i);
   if chosen.start_title is null or chosen.target_title is null then raise exception 'NO_COURSE_DAY_%',i; end if;
   insert into public.daily_challenges(challenge_date,start_title,target_title,hint)
   values(input_date+i,chosen.start_title,chosen.target_title,chosen.hint);
 end loop;
 if (select count(distinct target_title) from public.daily_challenges where challenge_date>input_date)<3
 then raise exception 'GOAL_FIRST_LACKS_DIVERSITY'; end if;
 raise notice 'DAILY_GOAL_V2_PASS 30 days, non-symmetric directed proof, goal diversity, old course preserved';
end $verify$;
