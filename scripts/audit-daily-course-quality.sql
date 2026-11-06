-- Wiki Race daily course quality audit v1: READ ONLY, not a migration.
-- Current 30-day snapshots / two-hop graph. This is not a user difficulty score.
-- ordinal is snapshot link order, not a precise visual position.
with words as (
  select distinct target_title as title
  from public.daily_challenge_pool
  where is_active and nullif(btrim(target_title), '') is not null
), paths as (
  select src_word.title as start_title, goal.title as target_title,
         mid.canonical_title_snapshot as via_title,
         first_link.ordinal as first_ordinal, second_link.ordinal as second_ordinal
  from words src_word
  join public.wiki_pages src_page on src_page.canonical_title=src_word.title
  join lateral (
    select s.id, s.page_id, s.fetched_at, s.canonical_title_snapshot
    from public.wiki_page_snapshots s
    where s.page_id=src_page.page_id and s.revision_id ~ '^[0-9]+$'
    order by s.revision_id::numeric desc limit 1
  ) src on src.canonical_title_snapshot=src_word.title and src.fetched_at>=now()-interval '30 days'
  join public.wiki_snapshot_links first_link on first_link.snapshot_id=src.id
  join lateral (
    select s.id,s.revision_id,s.fetched_at,s.canonical_title_snapshot
    from public.wiki_page_snapshots s
    where s.page_id=first_link.target_page_id and s.revision_id ~ '^[0-9]+$'
    order by s.revision_id::numeric desc limit 1
  ) mid on mid.fetched_at>=now()-interval '30 days'
    and mid.revision_id=coalesce(first_link.target_revision_id,private.resolve_wiki_revision(first_link.target_page_id))
  join public.wiki_snapshot_links second_link on second_link.snapshot_id=mid.id
  join words goal on goal.title=second_link.target_title_snapshot
  where src_word.title<>goal.title
    and mid.canonical_title_snapshot not in (src_word.title,goal.title)
    and first_link.target_page_id<>src.page_id
    and second_link.target_page_id not in (src.page_id,first_link.target_page_id)
), stats as (
  select start_title,target_title,count(distinct via_title)::integer as via_count,
    min(greatest(first_ordinal,second_ordinal)) as best_path_max_ordinal,
    array_agg(distinct via_title order by via_title) as via_titles
  from paths group by 1,2
)
select start_title,target_title,via_count,best_path_max_ordinal,via_titles,
  case
    when via_count=1 and best_path_max_ordinal>=150 then 'REVIEW_SINGLE_AND_DEEP'
    when via_count=1 then 'REVIEW_SINGLE_ROUTE'
    when best_path_max_ordinal>=150 then 'REVIEW_DEEP_LINK'
    else 'BASIC_CHECK_PASSED'
  end as audit_flag
from stats
order by case when via_count=1 or best_path_max_ordinal>=150 then 0 else 1 end,
  via_count,best_path_max_ordinal desc;
