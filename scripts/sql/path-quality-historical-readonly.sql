-- READ ONLY. Reproduce 15 privacy-minimized completed-play profiles.
-- Do NOT select user IDs, nicknames, rooms, run IDs, precise timestamps or individual paths in final output.
-- Historical paths may refer to revisions not in the latest cached graph.
with solo as (
  select 'single:'||coalesce(run_mode,'legacy') as mode,
    start_title,target_title,path_titles as path,click_count as moves,elapsed_seconds as seconds,
    row_number() over(partition by coalesce(run_mode,'legacy')
      order by md5(coalesce(start_title,'')||'|'||coalesce(target_title,'')||'|'||coalesce(path_titles::text,''))) as sample_rank
  from public.game_records
  where result_status='completed' and cardinality(path_titles) between 3 and 15
    and start_title is not null and target_title is not null and elapsed_seconds>0
),
groupplay as (
  select 'group' as mode,start_title,target_title,path_titles as path,
    move_count as moves,elapsed_seconds as seconds,
    row_number() over(order by md5(coalesce(start_title,'')||'|'||coalesce(target_title,'')||'|'||coalesce(path_titles::text,''))) as sample_rank
  from public.group_match_results
  where result_status='finished' and cardinality(path_titles) between 3 and 15
    and start_title is not null and target_title is not null
),
games as (
  select * from solo where sample_rank<=3
  union all select * from groupplay where sample_rank<=3
),
steps as (
  select g.mode,g.sample_rank,g.path,g.moves,g.seconds,j.ord as step,
    j.title as from_title,g.path[j.ord+1] as to_title
  from games g cross join lateral unnest(g.path) with ordinality as j(title,ord)
  where j.ord<cardinality(g.path)
),
latest as (
  select distinct on(page_id) page_id,id,canonical_title_snapshot
  from public.wiki_page_snapshots order by page_id,fetched_at desc
),
observed as (
  select p.*, snap.id as source_snapshot, matched.ordinal as observed_ordinal,fc.total_links,
    case when matched.ordinal is not null and fc.total_links=1 then 0.0
      when matched.ordinal is not null and fc.total_links>1
      then matched.ordinal::numeric/(fc.total_links-1) end as anchor_ratio
  from steps p
  left join lateral (
    select s.id from latest s
    where s.canonical_title_snapshot=p.from_title limit 1
  ) snap on true
  left join lateral (
    select count(*)::int as total_links from public.wiki_snapshot_links z
    where z.snapshot_id=snap.id
  ) fc on true
  left join lateral (
    select l.ordinal from public.wiki_snapshot_links l
    where l.snapshot_id=snap.id and l.target_title_snapshot=p.to_title
    order by l.ordinal limit 1
  ) matched on true
)
select g.mode,g.sample_rank,g.moves::int as moves,(cardinality(g.path)-1)::int as path_steps,
  case when g.seconds<120 then 'under_2_minutes'
    when g.seconds<300 then '2_to_5_minutes'
    when g.seconds<900 then '5_to_15_minutes'
    else '15_plus_minutes' end as elapsed_bucket,
  (cardinality(g.path)-(select count(distinct x) from unnest(g.path) x))::int as repeated_titles,
  count(*) filter(where o.source_snapshot is not null)::int as cached_step_sources,
  count(*) filter(where o.observed_ordinal is not null)::int as matched_steps,
  count(*) filter(where o.anchor_ratio>=0.75)::int as late_order_steps,
  round(avg(o.anchor_ratio),3) as average_order_ratio,
  round(max(o.anchor_ratio),3) as maximum_order_ratio
from games g join observed o on o.mode=g.mode and o.sample_rank=g.sample_rank
group by g.mode,g.sample_rank,g.path,g.moves,g.seconds
order by g.mode,g.sample_rank;