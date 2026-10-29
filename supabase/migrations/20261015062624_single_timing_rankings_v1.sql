-- Additive ranking contract. Historical elapsed values and XP eligibility stay untouched.
begin;
create function private.daily_course_best_contract_v1(p_contract text)
returns setof public.game_records language sql stable security definer set search_path='' as $$
  with eligible as (
    select r.*, row_number() over(partition by r.user_id order by r.elapsed_seconds,r.click_count,r.created_at,r.id) personal_order
    from public.game_records r
    join public.daily_challenges c on c.challenge_date=r.daily_challenge_date
    join public.wiki_pages s on s.page_id=r.start_page_id
    join public.wiki_pages t on t.page_id=r.target_page_id
    where auth.uid() is not null and c.challenge_date=(now() at time zone 'Asia/Seoul')::date
      and r.run_mode='daily' and r.result_status='completed' and r.user_id is not null
      and r.timing_contract is not distinct from p_contract
      and (p_contract is null or p_contract='single_reserved_prefetch_v1')
      and private.normalize_wiki_title(s.canonical_title)=private.normalize_wiki_title(c.start_title)
      and private.normalize_wiki_title(r.start_title)=private.normalize_wiki_title(c.start_title)
      and private.normalize_wiki_title(t.canonical_title)=private.normalize_wiki_title(c.target_title)
      and private.normalize_wiki_title(r.target_title)=private.normalize_wiki_title(c.target_title)
  ) select r.* from eligible e join public.game_records r on r.id=e.id where e.personal_order=1
    order by r.elapsed_seconds,r.click_count,r.created_at,r.id;
$$;
revoke all on function private.daily_course_best_contract_v1(text) from public,anon,authenticated;
-- Old daily RPCs continue to expose only the previous measurement cohort.
create or replace function private.daily_course_best_records_v2()
returns setof public.game_records language sql stable security definer set search_path='' as $$
  select * from private.daily_course_best_contract_v1(null);
$$;
create function public.get_daily_course_rankings_contract_v1(p_contract text default 'single_reserved_prefetch_v1',p_limit integer default 50)
returns setof public.game_records language sql stable security definer set search_path='' as $$
  select * from private.daily_course_best_contract_v1(p_contract) limit greatest(1,least(coalesce(p_limit,50),1000));
$$;
revoke all on function public.get_daily_course_rankings_contract_v1(text,integer) from public,anon;
grant execute on function public.get_daily_course_rankings_contract_v1(text,integer) to authenticated,service_role;
create function public.get_my_daily_course_rank_contract_v1(p_contract text default 'single_reserved_prefetch_v1')
returns jsonb language sql stable security definer set search_path='' as $$
  with ranked as (select r.id,r.user_id,row_number() over(order by r.elapsed_seconds,r.click_count,r.created_at,r.id) rank,
    count(*) over() total_count from private.daily_course_best_contract_v1(p_contract) r)
  select coalesce((select jsonb_build_object('rank',rank,'totalCount',total_count,'bestRecordId',id) from ranked where user_id=auth.uid()),
    jsonb_build_object('rank',null,'totalCount',(select count(*) from ranked)));
$$;
revoke all on function public.get_my_daily_course_rank_contract_v1(text) from public,anon;
grant execute on function public.get_my_daily_course_rank_contract_v1(text) to authenticated,service_role;
create index game_records_timing_rank_v1_idx on public.game_records(timing_contract,elapsed_seconds,created_at);
commit;
