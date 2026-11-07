-- Read-only, reproducible sample: 13 named focus pages + 37 deterministic hash pages.
-- Source is the current Wiki Race snapshot link graph, NOT all Wikimedia backlinks.
-- This query MUST NOT be stored as a migration or used to mutate production.
with latest as (
  select distinct on (page_id) page_id,id,canonical_title_snapshot
  from public.wiki_page_snapshots
  where nullif(btrim(canonical_title_snapshot),'') is not null
  order by page_id,fetched_at desc,id desc
),
focus(title) as (
  values ('김치'),('메이플스토리'),('훈민정음'),('SQL'),('서울특별시'),
  ('월드 와이드 웹'),('한강'),('화성'),('고래상어'),('GPT (언어 모델)'),
  ('백준 온라인 저지'),('미국의 하늘에 잘린 달 2'),
  ('2010년 FIFA 월드컵 남미 지역 예선')
),
core as (
  select l.*,'focus'::text as cohort
  from latest l join focus f on f.title=l.canonical_title_snapshot
),
rnd as (
  select l.*,'random_snapshot'::text as cohort
  from latest l where not exists(select 1 from core c where c.page_id=l.page_id)
  order by md5(l.page_id) limit 37
),
smp as (select * from core union all select * from rnd),
outlink as (
  select snapshot_id,count(*)::int as outbound_links,
    count(*) filter(where ordinal <=50)::int as outbound_early50
  from public.wiki_snapshot_links
  where snapshot_id in(select id from smp)
  group by snapshot_id
),
inlink as (
  select l.target_page_id,
    count(distinct s.page_id)::int as cached_inbound_sources,
    count(distinct s.page_id) filter(where l.ordinal<=50)::int as cached_inbound_early50
  from public.wiki_snapshot_links l
  join latest s on l.snapshot_id=s.id
  where l.target_page_id in(select page_id from smp)
  group by l.target_page_id
)
select smp.cohort,smp.canonical_title_snapshot as title,smp.page_id,
  coalesce(o.outbound_links,0) as outbound_links,
  coalesce(o.outbound_early50,0) as outbound_early50,
  coalesce(i.cached_inbound_sources,0) as cached_inbound_sources,
  coalesce(i.cached_inbound_early50,0) as cached_inbound_early50
from smp
left join outlink o on o.snapshot_id=smp.id
left join inlink i on i.target_page_id=smp.page_id
order by cohort,title;
