-- Local-only pgTAP regression for the v1-style truncated wiki link failure.
-- Run against the pinned LOCAL Docker DB; all changes are rolled back.
-- No migrations, production writes or external API calls.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local role postgres;

select lives_ok(
  $wiki$
    select public.replace_wiki_snapshot_v2(
      'wiki-race-integrity-local-1551',
      '990001',
      'Local Full Graph',
      null::uuid,
      (select jsonb_agg(
        jsonb_build_object(
          'targetPageId', 'wiki-test-' || n,
          'targetTitle', 'Test Page ' || n,
          'linkText', 'Click ' || n
        ) order by n
      ) from generate_series(1, 1551) as gs(n))
    );
  $wiki$,
  'snapshot RPC stores 1,551 distinct links without a limit'
);

select is(
  (select count(*)::integer
     from public.wiki_snapshot_links l
     join public.wiki_page_snapshots s on s.id = l.snapshot_id
    where s.page_id = 'wiki-race-integrity-local-1551'
      and s.revision_id = '990001'),
  1551,
  'all 1,551 links survived the RPC write'
);

select is(
  (select count(*)::integer from (
    select l.target_page_id
      from public.wiki_snapshot_links l
      join public.wiki_page_snapshots s on s.id = l.snapshot_id
     where s.page_id = 'wiki-race-integrity-local-1551'
       and s.revision_id = '990001'
     order by l.ordinal asc
     limit 1000 offset 0
  ) first_page),
  1000,
  'the first PostgREST-compatible 1,000-link page is complete'
);

select is(
  (select count(*)::integer from (
    select l.target_page_id
      from public.wiki_snapshot_links l
      join public.wiki_page_snapshots s on s.id = l.snapshot_id
     where s.page_id = 'wiki-race-integrity-local-1551'
       and s.revision_id = '990001'
     order by l.ordinal asc
     limit 1000 offset 1000
  ) last_page),
  551,
  'the second page preserves all 551 remaining links'
);

select is(
  (select l.target_title_snapshot
     from public.wiki_snapshot_links l
     join public.wiki_page_snapshots s on s.id = l.snapshot_id
    where s.page_id = 'wiki-race-integrity-local-1551'
      and s.revision_id = '990001'
    order by l.ordinal desc
    limit 1),
  'Test Page 1551',
  'the final article link is not silently discarded'
);

select is(
  (select count(distinct l.target_page_id)::integer
     from public.wiki_snapshot_links l
     join public.wiki_page_snapshots s on s.id = l.snapshot_id
    where s.page_id = 'wiki-race-integrity-local-1551'
      and s.revision_id = '990001'),
  1551,
  'all link target page IDs remain distinct'
);

select is(
  (select count(*)::integer
     from public.wiki_snapshot_links l
     join public.wiki_page_snapshots s on s.id = l.snapshot_id
    where s.page_id = 'wiki-race-integrity-local-1551'
      and s.revision_id = '990001'
      and l.ordinal in (0, 775, 1550)),
  3,
  'first, middle, and last playable link positions remain stored'
);

select * from finish();
rollback;
