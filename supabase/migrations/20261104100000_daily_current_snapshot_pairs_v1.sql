-- Keep daily pair selection aligned with the newest observed wiki revisions.
begin;
create or replace function public.ensure_today_daily_challenge()
returns table(challenge_date date, start_title text, target_title text, hint text)
language plpgsql security definer set search_path = '' as $$
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

  -- Use the highest observed MediaWiki revision ID for each source and
  -- intermediate page. A fresh fetch of an old revision must not revive a link.
  -- The live wiki can still change after the latest stored observation.
  with words as (
    select p.target_title as title from public.daily_challenge_pool p
    where p.is_active and nullif(btrim(p.target_title), '') is not null
  ), linked_pairs as (
    select distinct src_word.title as start_title, dst_word.title as target_title
    from words src_word
    join public.wiki_pages src_page on src_page.canonical_title = src_word.title
    join lateral (
      select s.id, s.page_id, s.fetched_at, s.canonical_title_snapshot
      from public.wiki_page_snapshots s
      where s.page_id = src_page.page_id and s.revision_id ~ '^[0-9]+$'
      order by s.revision_id::numeric desc
      limit 1
    ) src on src.canonical_title_snapshot = src_word.title
      and src.fetched_at >= now() - interval '30 days'
    join public.wiki_snapshot_links first_link on first_link.snapshot_id = src.id
    join lateral (
      select s.id, s.revision_id, s.fetched_at, s.canonical_title_snapshot
      from public.wiki_page_snapshots s
      where s.page_id = first_link.target_page_id and s.revision_id ~ '^[0-9]+$'
      order by s.revision_id::numeric desc
      limit 1
    ) mid on mid.fetched_at >= now() - interval '30 days'
      and mid.revision_id = coalesce(first_link.target_revision_id,
        private.resolve_wiki_revision(first_link.target_page_id))
    join public.wiki_snapshot_links second_link on second_link.snapshot_id = mid.id
    join words dst_word on dst_word.title = second_link.target_title_snapshot
    where src_word.title <> dst_word.title
      and mid.canonical_title_snapshot <> src_word.title
      and mid.canonical_title_snapshot <> dst_word.title
      and first_link.target_page_id <> src.page_id
      and second_link.target_page_id not in (src.page_id, first_link.target_page_id)
  ), available as (
    select lp.start_title, lp.target_title,
      '오늘의 단어에서 만든 탐험 코스'::text as hint, 0 as source_rank
    from linked_pairs lp
    union all
    select p.start_title,p.target_title,p.hint,1 as source_rank
    from public.daily_challenge_pool p
    where p.is_active and p.verified_at is not null and nullif(btrim(p.start_title),'') is not null
  ), ranked as (
    select a.*,
      case when exists (
        select 1 from public.daily_challenges previous
        where previous.challenge_date >= v_day - 7 and previous.challenge_date < v_day
          and previous.start_title = a.start_title and previous.target_title = a.target_title
      ) then 1 else 0 end as recently_used
    from available a
  )
  select c.start_title,c.target_title,c.hint
    into v_start_title,v_target_title,v_hint
  from ranked c
  order by c.recently_used, c.source_rank, random()
  limit 1;

  if v_start_title is null or v_target_title is null then
    raise exception 'NO_VERIFIED_DAILY_COURSE';
  end if;
  insert into public.daily_challenges(challenge_date,start_title,target_title,hint)
  values(v_day,v_start_title,v_target_title,v_hint)
  on conflict on constraint daily_challenges_challenge_date_key do nothing;
  return query select c.challenge_date,c.start_title,c.target_title,c.hint
    from public.daily_challenges c where c.challenge_date = v_day;
end;
$$;
revoke all on function public.ensure_today_daily_challenge() from public;
grant execute on function public.ensure_today_daily_challenge() to anon, authenticated, service_role;
commit;
