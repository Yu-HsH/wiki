-- Run on the local database. All fixture changes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table daily_pair_test_day as
select (now() at time zone 'Asia/Seoul')::date as day;

delete from public.daily_challenges
where challenge_date >= (select day - 8 from daily_pair_test_day);
update public.daily_challenge_pool set is_active = false where is_active;
insert into public.daily_challenge_pool
  (sort_order, target_title, start_title, hint, is_active, verified_path_titles, verified_at)
values
  (-20001, 'Daily QA source', null, 'word', true, null, null),
  (-20002, 'Daily QA goal', null, 'word', true, null, null),
  (-20003, 'Daily QA fallback goal', 'Daily QA fallback source', 'fallback', true,
    array['Daily QA fallback source', 'Daily QA fallback goal'], now());

insert into public.wiki_pages (page_id, canonical_title)
values ('daily-qa-source', 'Daily QA source'), ('daily-qa-middle', 'Daily QA middle');
insert into public.wiki_page_snapshots (page_id, revision_id, canonical_title_snapshot, fetched_at)
values
  ('daily-qa-source', '99', 'Daily QA source', now()),
  ('daily-qa-source', '100', 'Daily QA source', now() - interval '1 day'),
  ('daily-qa-middle', '99', 'Daily QA middle', now() - interval '1 day'),
  ('daily-qa-middle', '100', 'Daily QA middle', now());
insert into public.wiki_snapshot_links
  (snapshot_id, target_page_id, target_title_snapshot, ordinal)
select s.id, 'daily-qa-middle', 'Daily QA middle', 0
from public.wiki_page_snapshots s where s.page_id = 'daily-qa-source' and s.revision_id = '100'
union all
select s.id, 'daily-qa-goal', 'Daily QA goal', 0
from public.wiki_page_snapshots s where s.page_id = 'daily-qa-middle' and s.revision_id = '100';

insert into public.daily_challenges (challenge_date, start_title, target_title, hint)
select day - 8, 'Daily QA source', 'Daily QA goal', 'previous' from daily_pair_test_day;
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA goal', 'latest numeric revisions supply a two-link course; eight days ago does not penalize it');
select is((select start_title from public.ensure_today_daily_challenge()),
  'Daily QA source', 'the next caller receives the same course');
select is((select count(*)::integer from public.daily_challenges where challenge_date = (select day from daily_pair_test_day)),
  1, 'a day has exactly one course');
select is((select hint from public.daily_challenges where challenge_date = (select day - 8 from daily_pair_test_day)),
  'previous', 'older course remains unchanged');

delete from public.daily_challenges where challenge_date = (select day from daily_pair_test_day);
savepoint newer_source;
insert into public.wiki_page_snapshots (page_id, revision_id, canonical_title_snapshot)
values ('daily-qa-source', '101', 'Daily QA source');
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA fallback goal', 'an older start revision cannot supply a removed link');
rollback to newer_source;

savepoint newer_middle;
insert into public.wiki_page_snapshots (page_id, revision_id, canonical_title_snapshot)
values ('daily-qa-middle', '101', 'Daily QA middle');
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA fallback goal', 'an older intermediate revision cannot supply a removed link');
rollback to newer_middle;

savepoint pinned_middle;
update public.wiki_snapshot_links set target_revision_id = '99'
where target_page_id = 'daily-qa-middle';
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA fallback goal', 'a move pinned to a different intermediate revision cannot prove the path');
rollback to pinned_middle;

savepoint inactive_goal;
update public.daily_challenge_pool set is_active = false where sort_order = -20002;
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA fallback goal', 'a disabled pool word is ineligible');
rollback to inactive_goal;

savepoint expired_start;
update public.wiki_page_snapshots set fetched_at = now() - interval '31 days'
where page_id = 'daily-qa-source' and revision_id = '100';
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA fallback goal', 'expired source proof falls back to an audited course');
rollback to expired_start;

update public.daily_challenges set challenge_date = (select day - 7 from daily_pair_test_day)
where hint = 'previous' and target_title = 'Daily QA goal';
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA fallback goal', 'a pair used seven days ago loses to an unused alternative');

delete from public.daily_challenges where challenge_date = (select day from daily_pair_test_day);
update public.daily_challenge_pool set is_active = false where sort_order = -20003;
select is((select target_title from public.ensure_today_daily_challenge()),
  'Daily QA goal', 'a repeat is allowed when no unused course is available');

select * from finish();
rollback;
