-- Read-only supplement to course-quality-50-readonly.sql.
-- Hub proxy: target has >=20 or >=50 distinct LATEST cached source pages linking to it.
-- Do NOT interpret hubs as semantic route relevance or certain game reachability.
with latest as (
  select distinct on (page_id) page_id,id,canonical_title_snapshot
  from public.wiki_page_snapshots
  order by page_id,fetched_at desc,id desc
),
focus(title) as (
  values ('김치'),('메이플스토리'),('훈민정음'),('SQL'),('서울특별시'),
  ('월드 와이드 웹'),('한강'),('화성'),('고래상어'),('GPT (언어 모델)'),
  ('백준 온라인 저지'),('미국의 하늘에 잘린 달 2'),
  ('2010년 FIFA 월드컵 남미 지역 예선')
),
core as (
  select l.* from latest l join focus f
  on f.title=l.canonical_title_snapshot
),
rnd as (
  select l.* from latest l
  where not exists(select 1 from core c where c.page_id=l.page_id)
  order by md5(l.page_id) limit 37
),
sample as (select * from core union all select * from rnd),
popularity as (
  select l.target_page_id,count(distinct s.page_id)::int as inbound_source_count
  from public.wiki_snapshot_links l
  join latest s on l.snapshot_id=s.id
  group by l.target_page_id
)
select s.page_id,s.canonical_title_snapshot as title,
  count(l.target_page_id) filter(where p.inbound_source_count >=20)::int as observed_hub_exits_20,
  count(l.target_page_id) filter(where p.inbound_source_count >=50)::int as observed_hub_exits_50
from sample s
left join public.wiki_snapshot_links l on l.snapshot_id=s.id
left join popularity p on p.target_page_id=l.target_page_id
group by s.page_id,s.canonical_title_snapshot
order by title;
