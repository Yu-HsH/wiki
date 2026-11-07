-- Wiki Race multiplayer course research — READ-ONLY, 2026-11-07.
-- No player identifiers, room IDs, nicknames, tokens or individual full paths in SELECT outputs.
-- Source: latest cached Wiki Race snapshots; NOT complete Korean Wikipedia graph.

-- 1. Group cohort count and rooms with zero finish.
with rooms as (
select room_id,count(*)::int players,
count(*) filter (where result_status='finished')::int finished,
count(*) filter (where result_status='retired')::int retired
from public.group_match_results group by room_id
)
select count(*)::int rooms,
sum(players)::int result_rows,
sum(finished)::int finished_results,
sum(retired)::int retired_results,
count(*) filter (where finished=0)::int zero_finisher_rooms,
count(*) filter (where finished=0 and players>=3)::int multi_participant_zero_finisher_rooms
from rooms;

-- 2. Selected same-room group courses, aggregate only.
select start_title,target_title,count(*)::int players,
count(*) filter (where result_status='finished')::int finished,
count(*) filter (where result_status='retired')::int retired,
round(avg(move_count),1) as avg_moves,
array_agg(distinct retire_reason) filter (where retire_reason is not null) as end_reasons
from public.group_match_results
where (start_title,target_title) in (
 ('강감찬','Shut up'),('영남대학교','곁주머니'),('육회','섹시'),
 ('셜록 홈즈','포메라니안'),('트리케라톱스','맹자')
) group by start_title,target_title order by players desc;

-- 3. Group retired: last cached article already contains a goal-directed link?
with latest as (
select distinct on(page_id) page_id,id,canonical_title_snapshot
from public.wiki_page_snapshots order by page_id,fetched_at desc,id desc
), trailing as (
select r.result_status,r.retire_reason,r.target_title,
r.path_titles[cardinality(r.path_titles)] as last_title
from public.group_match_results r where cardinality(r.path_titles)>0
), checked as (
select t.*,(select min(l.ordinal) from public.wiki_snapshot_links l
where l.snapshot_id=src.id and l.target_page_id=goal.page_id) goal_ordinal,
src.id is not null as last_cached
from trailing t
left join latest src on src.canonical_title_snapshot=t.last_title
left join latest goal on goal.canonical_title_snapshot=t.target_title
)
select result_status,coalesce(retire_reason,'none') as reason,count(*)::int n,
count(*) filter(where last_cached)::int last_cached,
count(*) filter(where goal_ordinal is not null)::int last_direct_goal_link,
count(*) filter(where goal_ordinal<50)::int early50_last_direct_goal_link
from checked group by result_status,reason order by result_status,reason;

-- 4. 1:1 completed: same course or legacy asymmetric course?
select count(*)::int matches,
count(*) filter(where winner_start_title=loser_start_title and winner_target_title=loser_target_title)::int identical_pairs,
count(*) filter(where winner_start_title<>loser_start_title and winner_target_title=loser_target_title)::int same_goal_only,
count(*) filter(where winner_start_title<>loser_start_title and winner_target_title<>loser_target_title)::int neither
from public.match_history where result_status='completed';

-- 5. Same-course duel losers: last current article offers direct goal link?
with latest as (
select distinct on(page_id) page_id,id,canonical_title_snapshot
from public.wiki_page_snapshots order by page_id,fetched_at desc,id desc
), aligned as (
select m.room_id,m.loser_user_id,m.winner_target_title as target_title
from public.match_history m
where m.result_status='completed'
and m.winner_start_title=m.loser_start_title
and m.winner_target_title=m.loser_target_title
), trailing as (
select a.target_title,p.path_titles[cardinality(p.path_titles)] as last_title,p.move_count
from aligned a join public.room_players p on p.room_id=a.room_id and p.user_id=a.loser_user_id
)
select count(*)::int aligned_losers,
count(*) filter(where exists(
 select 1 from public.wiki_snapshot_links l where l.snapshot_id=src.id and l.target_page_id=goal.page_id
))::int one_click_from_goal,
count(*) filter(where move_count=0)::int zero_move_losers
from trailing t
left join latest src on src.canonical_title_snapshot=t.last_title
left join latest goal on goal.canonical_title_snapshot=t.target_title;

-- 6. Last clicked label vs canonical goal title among group finished results.
with latest as (
select distinct on(page_id) page_id,id,canonical_title_snapshot
from public.wiki_page_snapshots order by page_id,fetched_at desc,id desc
), g as (
select r.target_title,r.path_titles[cardinality(r.path_titles)-1] as previous_title
from public.group_match_results r
where result_status='finished' and cardinality(path_titles)>=2
), observed as (
select g.*,
(select l.link_text from public.wiki_snapshot_links l
where l.snapshot_id=src.id and l.target_page_id=goal.page_id order by ordinal limit 1) label,
(select min(l.ordinal) from public.wiki_snapshot_links l
where l.snapshot_id=src.id and l.target_page_id=goal.page_id) link_ordinal
from g
left join latest src on src.canonical_title_snapshot=g.previous_title
left join latest goal on goal.canonical_title_snapshot=g.target_title
)
select count(*)::int finish_paths,
count(*) filter(where label is null)::int unresolved_links,
count(*) filter(where label is not null and lower(trim(label))<>lower(trim(target_title)))::int nonmatching_link_text,
count(*) filter(where link_ordinal>=50)::int last_link_after_50
from observed;

-- All counts are historical observational facts, not automated course quality labels.
