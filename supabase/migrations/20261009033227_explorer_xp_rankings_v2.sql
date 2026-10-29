begin;
-- The XP ledger is private per member; aggregate on the server and expose
-- only existing public profile fields. No awards, backfill or client XP input.
create or replace function public.get_explorer_xp_rankings_v2(p_weekly boolean default false,p_limit integer default 50)
returns table(id uuid,nickname text,profile_image_url text,total_xp bigint,profile_level integer,ranking_xp bigint,rank bigint,total_count bigint)
language sql stable security definer set search_path = '' as $$
  with points as (
    select p.id,p.nickname,p.profile_image_url,p.total_xp,public.profile_level(p) as profile_level,p.created_at,
      case when p_weekly then coalesce(w.amount,0) else p.total_xp end::bigint as ranking_xp
    from public.profiles p
    left join lateral (
      select sum(l.amount)::bigint as amount from public.xp_ledger l
      where p_weekly and l.user_id=p.id and l.xp_class='gameplay'
        and l.created_at >= (date_trunc('week',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
        and l.created_at < ((date_trunc('week',now() at time zone 'Asia/Seoul')+interval '1 week') at time zone 'Asia/Seoul')
    ) w on true where auth.uid() is not null
  ), ranked as (
    select p.*,row_number() over(order by p.ranking_xp desc,p.created_at,p.id) as rank,count(*) over() as total_count
    from points p where p.ranking_xp>0
  )
  select r.id,r.nickname,r.profile_image_url,r.total_xp,r.profile_level,r.ranking_xp,r.rank,r.total_count
  from ranked r where r.rank<=greatest(1,least(coalesce(p_limit,50),1000)) or r.id=auth.uid()
  order by r.rank;
$$;
revoke all on function public.get_explorer_xp_rankings_v2(boolean,integer) from public, anon;
grant execute on function public.get_explorer_xp_rankings_v2(boolean,integer) to authenticated,service_role;
create or replace function public.get_my_daily_course_rank_v2()
returns jsonb language sql stable security definer set search_path = '' as $$
  with ranked as (
    select r.user_id,r.id,row_number() over(order by r.elapsed_seconds,r.click_count,r.created_at,r.id) as rank,
      count(*) over() as total_count from private.daily_course_best_records_v2() r
  )
  select coalesce((select jsonb_build_object('rank',r.rank,'totalCount',r.total_count,'bestRecordId',r.id)
    from ranked r where r.user_id=auth.uid()),jsonb_build_object('rank',null,'totalCount',(select count(*) from ranked)));
$$;
revoke all on function public.get_my_daily_course_rank_v2() from public,anon;
grant execute on function public.get_my_daily_course_rank_v2() to authenticated,service_role;
commit;
