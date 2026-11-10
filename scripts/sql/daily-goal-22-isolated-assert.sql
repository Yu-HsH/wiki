-- Assertions after staging SQL has been applied twice in an isolated PostgreSQL database.
do $$
begin
 if (select count(*) from public.daily_challenge_pool)<>39 then
   raise exception 'EXPECTED_39_GOALS_17_PLUS_22';
 end if;
 if (select count(*) from public.daily_challenge_pool where sort_order between 200 and 221)<>22 then
   raise exception 'EXPECTED_22_NEW_GOALS';
 end if;
 if exists (
   select 1 from public.daily_challenge_pool p where p.sort_order between 200 and 221
     and (p.start_title is not null or p.verified_at is not null or p.verified_path_titles is not null or p.is_active is not true or nullif(btrim(p.hint),'') is null)
 ) then raise exception 'UNSAFE_NEW_GOAL_ROW'; end if;
 if exists (
   (select * from daily_goal_original_pool except select * from public.daily_challenge_pool)
 ) then raise exception 'ORIGINAL_GOAL_POOL_CHANGED'; end if;
 if exists (
   (select * from public.daily_challenges except select * from daily_goal_original_challenge)
   union all
   (select * from daily_goal_original_challenge except select * from public.daily_challenges)
 ) then raise exception 'DAILY_CHALLENGES_CHANGED'; end if;
 raise notice 'DAILY_GOAL_STAGE_SQL_PASS: 17 preserved, 22 new, 39 total, historic challenge unchanged, idempotent twice';
end $$;
