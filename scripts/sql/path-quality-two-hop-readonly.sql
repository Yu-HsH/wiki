-- READ ONLY. Six public Wikipedia article pairs, latest cached Wiki Race snapshots.
-- Two-hop witnesses through cached intermediate pages; never claim global shortest paths.
with latest as (
  select distinct on(page_id) page_id,id,canonical_title_snapshot
  from public.wiki_page_snapshots order by page_id,fetched_at desc
),
pairs(start_title,goal_title) as (
  values ('대한민국','훈민정음'),('음식','김치'),('김치','SQL'),('SQL','월드 와이드 웹'),
    ('미국의 하늘에 잘린 달 2','2010년 FIFA 월드컵 남미 지역 예선'),
    ('메이플스토리','GPT (언어 모델)'),
    ('대한민국','한강'),('컴퓨터','월드 와이드 웹'),('훈민정음','한강'),
    ('서울특별시','한강'),('김치','한강')
),
p as (
  select x.start_title,x.goal_title,s.id start_sid,g.page_id goal_id
  from pairs x
  join latest s on s.canonical_title_snapshot=x.start_title
  join latest g on g.canonical_title_snapshot=x.goal_title
),
raw as (
  select p.start_title,p.goal_title,m.canonical_title_snapshot as via,
    min(l1.ordinal)::int as first_ordinal,min(l2.ordinal)::int as second_ordinal,
    p.start_sid,m.id as mid_sid
  from p join public.wiki_snapshot_links l1 on l1.snapshot_id=p.start_sid
  join latest m on m.page_id=l1.target_page_id
  join public.wiki_snapshot_links l2 on l2.snapshot_id=m.id and l2.target_page_id=p.goal_id
  where m.page_id<>p.goal_id group by 1,2,3,6,7
),
ranked as (
  select r.*,row_number() over(partition by start_title,goal_title
    order by first_ordinal+second_ordinal,via) as rn,
    count(*) over(partition by start_title,goal_title) as total_midpoints
  from raw r
),
pick as (
  select r.*,
    (select count(*)::int from public.wiki_snapshot_links where snapshot_id=r.start_sid) as start_links,
    (select count(*)::int from public.wiki_snapshot_links where snapshot_id=r.mid_sid) as mid_links
  from ranked r where rn<=20
)
select p.start_title,p.goal_title,coalesce(x.total_midpoints,0)::int as total_midpoints,
  x.via,x.first_ordinal,x.second_ordinal,x.start_links,x.mid_links
from p left join pick x on x.start_title=p.start_title and x.goal_title=p.goal_title
order by p.start_title,p.goal_title,x.rn;