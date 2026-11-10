-- Wiki Race daily challenge goal-first public pool, 2026-11-09.
-- Created from pinned CLI migration new, staged after PR #47 identity/browser QA and PR #48 isolated SQL validation.
-- Future calendar rows only. Existing courses, runs, XP, history are immutable.
-- Cache reachability is a partial graph witness, NOT a proof of every live WikiViewer click.
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('daily-goal-pool-22-stage-20261109',0));

create temp table wr_daily_goal_pool_22_stage_20261109
  on commit drop as
select v.sort_order, v.target_title, v.hint
from (values
  (200, '커피', '원두를 볶고 추출해 마시는 대표적인 기호 음료'),
  (201, '발효', '미생물의 작용으로 음식과 물질이 변화하는 과정'),
  (202, '전자레인지', '전자기파로 식품을 가열하는 일상 속 조리 기구'),
  (203, '공기청정기', '공기 중 먼지와 오염 물질을 걸러내는 장치'),
  (204, '태풍', '열대 해상에서 발달하는 강력한 저기압'),
  (205, '미세먼지', '공기 중에 떠다니는 아주 작은 입자상 물질'),
  (206, '산호초', '산호가 오랜 시간 쌓아 만든 해양 생태계'),
  (207, '엘니뇨', '태평양 수온 변화로 전 세계 기후에 영향을 주는 현상'),
  (208, '카페인', '커피와 차 등에 들어 있는 각성 작용을 하는 물질'),
  (209, '백신', '감염병에 대한 면역 반응을 준비시키는 의약품'),
  (210, '알레르기', '면역계가 특정 물질에 과민하게 반응하는 현상'),
  (211, '도파민', '운동과 동기 등 여러 기능에 관여하는 신경전달물질'),
  (212, '경복궁', '조선 왕조의 대표적인 궁궐'),
  (213, '비단길', '동서양을 연결했던 오랜 교역로'),
  (214, '인플레이션', '물가 수준이 전반적으로 상승하는 경제 현상'),
  (215, '인공지능', '인간의 지능적 작업을 수행하도록 설계한 기술 분야'),
  (216, '챗GPT', '대화형 생성 인공지능 서비스'),
  (217, '넷플릭스', '영화와 드라마 등을 제공하는 온라인 영상 서비스'),
  (218, 'K-pop', '한국에서 발전한 대중음악과 그 문화'),
  (219, '리그 오브 레전드', '팀이 협력해 상대 진영을 공략하는 온라인 게임'),
  (220, '태권도', '한국에서 발전한 무예이자 국제 스포츠'),
  (221, '웹툰', '인터넷 환경에 맞게 연재되는 디지털 만화')
) as v(sort_order, target_title, hint);

do $$
begin
  if (select count(*) from pg_temp.wr_daily_goal_pool_22_stage_20261109) <> 22 then
    raise exception 'DAILY_GOAL_STAGE_INCOMPLETE_22';
  end if;
  if exists (
    select 1
    from pg_temp.wr_daily_goal_pool_22_stage_20261109 v
    join public.daily_challenge_pool p
      on p.sort_order = v.sort_order or p.target_title = v.target_title
    where p.sort_order is distinct from v.sort_order
       or p.target_title is distinct from v.target_title
  ) then
    raise exception 'DAILY_GOAL_POOL_SORT_OR_TITLE_COLLISION';
  end if;
end $$;

insert into public.daily_challenge_pool
(sort_order,start_title,target_title,hint,is_active,verified_path_titles,verified_at)
select v.sort_order, null, v.target_title, v.hint, true, null, null
from pg_temp.wr_daily_goal_pool_22_stage_20261109 v
where not exists (
  select 1 from public.daily_challenge_pool p where p.target_title=v.target_title
);

do $$
begin
  if (
    select count(*)
    from pg_temp.wr_daily_goal_pool_22_stage_20261109 v
    join public.daily_challenge_pool p
      on p.sort_order=v.sort_order and p.target_title=v.target_title
  ) <> 22 then
    raise exception 'DAILY_GOAL_STAGE_POSTCONDITION_FAILED';
  end if;
end $$;

-- No public table select access: goal pairs are read only by the security-definer daily RPC.
create table public.daily_course_pairs_v2 (
  start_title text not null references public.daily_challenge_pool(target_title),
  target_title text not null references public.daily_challenge_pool(target_title),
  evidence_kind text not null default 'cached_directed_reachability',
  refreshed_at timestamptz not null default now(),
  constraint daily_course_pairs_v2_pkey primary key(start_title,target_title),
  constraint daily_course_pairs_v2_distinct_check check (start_title <> target_title),
  constraint daily_course_pairs_v2_evidence_check check (evidence_kind='cached_directed_reachability')
);
create index daily_course_pairs_v2_goal_idx on public.daily_course_pairs_v2(target_title);
alter table public.daily_course_pairs_v2 enable row level security;
revoke all on public.daily_course_pairs_v2 from public, anon, authenticated;

-- Administrator-only refresh. Proof = a directed walk in the stored latest revisions;
-- no fixed number of moves, hop limit, shortest-path ranking or BFS cost at race time.
create or replace function private.refresh_daily_course_pairs_v2()
returns integer
language plpgsql security invoker set search_path = '' as $refresh$
declare n integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('daily-v2-pair-refresh',0));
 delete from public.daily_course_pairs_v2;
 with recursive latest as materialized (
   select distinct on (page_id) id,page_id,canonical_title_snapshot,fetched_at
   from public.wiki_page_snapshots
   where revision_id ~ '^[0-9]+$'
   order by page_id, revision_id::numeric desc
 ), roots as materialized (
   select snap.page_id,snap.canonical_title_snapshot as title
   from latest snap
   join public.daily_challenge_pool pool on pool.target_title=snap.canonical_title_snapshot
   where pool.is_active and snap.fetched_at >= now() - interval '45 days'
 ), reachable(root_id,page_id) as (
   select roots.page_id,roots.page_id from roots
   union
   select reached.root_id,link.target_page_id
   from reachable reached
   join latest parent on parent.page_id=reached.page_id
   join public.wiki_snapshot_links link on link.snapshot_id=parent.id
   join latest child on child.page_id=link.target_page_id
   where parent.fetched_at >= now()-interval '45 days'
     and child.fetched_at >= now()-interval '45 days'
 )
 insert into public.daily_course_pairs_v2(start_title,target_title)
 select distinct root.title,target.target_title
 from reachable reached
 join roots root on root.page_id=reached.root_id
 join latest parent on parent.page_id=reached.page_id
 join public.wiki_snapshot_links link on link.snapshot_id=parent.id
 join public.daily_challenge_pool target on target.target_title=link.target_title_snapshot
 where target.is_active and root.title<>target.target_title
   and parent.fetched_at >= now()-interval '45 days';
 get diagnostics n = row_count;
 -- Fresh local Supabase stacks have no wiki snapshots yet: use five audited fixed
 -- fallback courses until gameplay caches document links. A populated deployment
 -- must still have a meaningful candidate set (fail closed on cache regression).
 if (select count(*) from public.wiki_page_snapshots) >= 100 and n < 100 then
   raise exception 'DAILY_V2_POPULATED_CACHE_TOO_FEW_PAIRS (%)',n;
 end if;
 if n=0 and not exists (
   select 1 from public.daily_challenge_pool fixed
   where fixed.is_active and fixed.verified_at is not null
     and nullif(pg_catalog.btrim(fixed.start_title),'') is not null
 ) then
   raise exception 'DAILY_V2_NO_PAIRS_AND_NO_VERIFIED_FALLBACK';
 end if;
 return n;
end;
$refresh$;
revoke all on function private.refresh_daily_course_pairs_v2() from public,anon,authenticated;

-- Goal-first, uniform by eligible goal, then choose one valid incoming start.
-- Soft anti-repetition: target 7 days; start 3 days; exact pair 30 days.
-- Fixed audited legacy courses remain the emergency fallback if the cache graph has no entries.
create or replace function private.choose_daily_course_goal_first_v2(p_day date)
returns table(start_title text,target_title text,hint text)
language sql volatile security invoker set search_path = '' as $pick$
with available as (
  select pair.start_title,pair.target_title,
    coalesce(nullif(pg_catalog.btrim(goal.hint),''),'오늘의 위키백과 탐험')::text as hint,
    0 as rank_source
  from public.daily_course_pairs_v2 pair
  join public.daily_challenge_pool starter on starter.target_title=pair.start_title and starter.is_active
  join public.daily_challenge_pool goal on goal.target_title=pair.target_title and goal.is_active
  union all
  select fixed.start_title,fixed.target_title,coalesce(fixed.hint,'검증된 오늘의 탐험 코스')::text,1
  from public.daily_challenge_pool fixed
  where fixed.is_active and fixed.verified_at is not null
    and nullif(pg_catalog.btrim(fixed.start_title),'') is not null
), goals as (
  select a.target_title,min(a.rank_source) as min_source_rank,
    case when exists (
      select 1 from public.daily_challenges recent
      where recent.challenge_date>=p_day-7 and recent.challenge_date<p_day
        and recent.target_title=a.target_title
    ) then 1 else 0 end as target_repeated
  from available a
  group by a.target_title
), chosen_goal as (
  select g.target_title
  from goals g
  order by g.min_source_rank,g.target_repeated,pg_catalog.random()
  limit 1
)
select a.start_title,a.target_title,a.hint
from available a join chosen_goal g on g.target_title=a.target_title
order by
  a.rank_source,
  case when exists (
    select 1 from public.daily_challenges recent
    where recent.challenge_date>=p_day-3 and recent.challenge_date<p_day
      and recent.start_title=a.start_title
  ) then 1 else 0 end,
  case when exists (
    select 1 from public.daily_challenges recent
    where recent.challenge_date>=p_day-30 and recent.challenge_date<p_day
      and recent.start_title=a.start_title and recent.target_title=a.target_title
  ) then 1 else 0 end,
  pg_catalog.random()
limit 1;
$pick$;
revoke all on function private.choose_daily_course_goal_first_v2(date) from public,anon,authenticated;

-- Populate directed candidates with current database snapshots (no external wiki API in RPC).
select private.refresh_daily_course_pairs_v2() as seeded_pairs;

-- The existing public daily RPC retains locking, previously-issued date preservation,
-- old-course repair safeguards, and all authenticated / guest / ranking contracts.
CREATE OR REPLACE FUNCTION public.ensure_today_daily_challenge()
 RETURNS TABLE(challenge_date date, start_title text, target_title text, hint text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_existing public.daily_challenges;
  v_candidate public.daily_challenge_pool;
  v_start_title text;
  v_target_title text;
  v_hint text;
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

  -- Goal-first selection from directed reachability evidence, never shortest-path rank.
  select choice.start_title, choice.target_title, choice.hint
    into v_start_title, v_target_title, v_hint
  from private.choose_daily_course_goal_first_v2(v_day) choice;

  if v_start_title is null or v_target_title is null then
    raise exception 'NO_VERIFIED_DAILY_COURSE';
  end if;
  insert into public.daily_challenges(challenge_date,start_title,target_title,hint)
  values(v_day,v_start_title,v_target_title,v_hint)
  on conflict on constraint daily_challenges_challenge_date_key do nothing;
  return query select c.challenge_date,c.start_title,c.target_title,c.hint
    from public.daily_challenges c where c.challenge_date = v_day;
end;
$function$;

revoke all on function public.ensure_today_daily_challenge() from public;
grant execute on function public.ensure_today_daily_challenge() to anon,authenticated,service_role;

commit;
