-- READ ONLY: reproduce 17 actual room-level group course gateway observations.
-- Never select or publish room_id, user_id, nickname, or individual click paths.
-- Latest cached Wiki Race graph is incomplete; no matching inbound != unreachable.

with goals(start_title,goal_title) as (values
  ('강감찬','Shut up'),('영남대학교','곁주머니'),('육회','섹시'),
  ('바람막이','문혁 (배우)'),('셜록 홈즈','포메라니안'),('시우민','다우기술'),
  ('트리케라톱스','맹자'),('협동','실미도'),('MOSFET','카카오 (기업)'),
  ('레킹볼','카리나 (가수)'),('서부저지고릴라','젤다의 전설 시간의 오카리나'),
  ('샹구스','할로윈'),('조성진 (피아니스트)','금산군'),
  ('커피','쿠로바 카이토'),('러스트 (프로그래밍 언어)','김지원 (배우)'),
  ('아르헨티노사우루스','하품'),('레디스','안데르송 시우바')
),
cohorts as (
  select g.start_title,g.goal_title,
    count(r.room_id)::int as players,
    count(*) filter(where r.result_status='finished')::int as finished,
    count(*) filter(where r.result_status='retired')::int as retired,
    round(avg(r.move_count),1)::float as average_moves,
    array_agg(distinct r.retire_reason) filter(where r.retire_reason is not null) as finish_reasons
  from goals g
  left join public.group_match_results r on
    r.start_title=g.start_title and r.target_title=g.goal_title
  group by g.start_title,g.goal_title
),
latest as (
  select distinct on(page_id) page_id,id,canonical_title_snapshot
  from public.wiki_page_snapshots
  order by page_id,fetched_at desc,id desc
),
targets as (
  select c.*,goal.page_id
  from cohorts c left join latest goal on goal.canonical_title_snapshot=c.goal_title
),
source_links as (
  select t.goal_title,src.canonical_title_snapshot as source_title,
    link.ordinal,link.link_text as label,
    row_number() over(partition by t.goal_title
      order by link.ordinal,src.canonical_title_snapshot) as sample_rank,
    (select count(*)::int from public.wiki_snapshot_links z
      where z.snapshot_id=src.id) as source_link_count
  from targets t
  join public.wiki_snapshot_links link on link.target_page_id=t.page_id
  join latest src on src.id=link.snapshot_id
)
select t.start_title,t.goal_title,t.players,t.finished,t.retired,
  t.average_moves,t.finish_reasons,
  count(distinct i.source_title)::int as total_cached_sources,
  count(i.ordinal) filter(where i.ordinal<50)::int as cached_links_in_first50,
  count(i.ordinal) filter(where lower(btrim(i.label))<>lower(btrim(t.goal_title)))::int
    as alias_labeled_links,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'sourceTitle',sample.source_title,'ordinal',sample.ordinal,
      'label',sample.label,'sourceLinkCount',sample.source_link_count
    ) order by sample.ordinal)
    from source_links sample
    where sample.goal_title=t.goal_title and sample.sample_rank<=16
  ),'[]'::jsonb) as incoming_sample
from targets t
left join source_links i on i.goal_title=t.goal_title
group by t.start_title,t.goal_title,t.players,t.finished,t.retired,
  t.average_moves,t.finish_reasons
order by t.finished asc,t.players desc,t.goal_title;
