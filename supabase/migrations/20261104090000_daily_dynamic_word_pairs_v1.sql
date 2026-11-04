-- Forward-only candidate pairing: preserve completed runs, XP and today's selected course.
-- No new words; only active existing daily_challenge_pool.target_title values.
-- Production deployment requires a separate approval and local integration verification.
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

  -- Dynamically pair the EXISTING active daily word pool using trusted server
  -- wiki snapshot links (two visible game moves). The pool is not expanded.
  -- Snapshots are supporting evidence, not a guarantee of live Wikipedia links;
  -- expire after 30 days and keep the previously reviewed static courses as fallback.
  -- Exact canonical title comparisons are conservative and avoid a costly scan
  -- of every stored link through regexp title normalization.
  with words as (
    select distinct p.target_title as title from public.daily_challenge_pool p
    where p.is_active and nullif(btrim(p.target_title),'') is not null
  ), linked_pairs as (
    select distinct src_word.title as start_title, dst_word.title as target_title
    from words src_word
    join public.wiki_page_snapshots src on
      src.canonical_title_snapshot = src_word.title
      and src.fetched_at >= now() - interval '30 days'
    join public.wiki_snapshot_links first_link on first_link.snapshot_id = src.id
    join public.wiki_page_snapshots mid on mid.page_id = first_link.target_page_id
      and mid.fetched_at >= now() - interval '30 days'
    join public.wiki_snapshot_links second_link on second_link.snapshot_id = mid.id
    join words dst_word on
      second_link.target_title_snapshot = dst_word.title
    where src_word.title <> dst_word.title
      and mid.canonical_title_snapshot <> src_word.title
      and mid.canonical_title_snapshot <> dst_word.title
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
