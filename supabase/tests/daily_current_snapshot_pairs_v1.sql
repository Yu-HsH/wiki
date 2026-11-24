-- Independent populated-cache fixture. Production tables and guards stay intact.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE TEMP TABLE daily_fixture_witness AS
 SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS digest
 FROM public.daily_challenges t;

-- LIKE keeps CHECK/UNIQUE/NOT NULL/identity contracts. PostgreSQL LIKE does not
-- copy FKs, so reproduce them with only the fixture dependency names rebound.
DO $fixture$
DECLARE table_name text; item record; definition text;
 names text[]:=ARRAY['daily_challenge_pool','daily_challenges','daily_course_pairs_v2',
                    'wiki_pages','wiki_page_snapshots','wiki_snapshot_links'];
BEGIN
 FOREACH table_name IN ARRAY names LOOP
  EXECUTE format('CREATE TEMP TABLE %I (LIKE public.%I INCLUDING ALL)',table_name,table_name);
  IF (SELECT relrowsecurity FROM pg_class WHERE oid=format('public.%I',table_name)::regclass) THEN
   EXECUTE format('ALTER TABLE pg_temp.%I ENABLE ROW LEVEL SECURITY',table_name);
  END IF;
 END LOOP;
 FOR item IN SELECT c.conrelid::regclass::text AS relation,c.conname,pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c WHERE c.contype='f' AND c.conrelid IN
  (SELECT format('public.%I',n)::regclass FROM unnest(names)n) LOOP
  definition:=item.definition;
  FOREACH table_name IN ARRAY names LOOP
   definition:=replace(definition,'REFERENCES '||table_name||'(','REFERENCES pg_temp.'||table_name||'(');
   definition:=replace(definition,'REFERENCES public.'||table_name||'(','REFERENCES pg_temp.'||table_name||'(');
  END LOOP;
  EXECUTE format('ALTER TABLE pg_temp.%I ADD CONSTRAINT %I %s',
   regexp_replace(item.relation,'^public\.',''),item.conname,definition);
 END LOOP;
 FOR item IN SELECT p.oid,n.nspname,p.proname,pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='private' AND p.proname IN('refresh_daily_course_pairs_v2','choose_daily_course_goal_first_v2'))
     OR (n.nspname='public' AND p.proname='ensure_today_daily_challenge') LOOP
  definition:=item.definition;
  FOREACH table_name IN ARRAY names LOOP definition:=replace(definition,'public.'||table_name,'pg_temp.'||table_name); END LOOP;
  definition:=replace(definition,'private.refresh_daily_course_pairs_v2','pg_temp.refresh_daily_course_pairs_v2');
  definition:=replace(definition,'private.choose_daily_course_goal_first_v2','pg_temp.choose_daily_course_goal_first_v2');
  definition:=replace(definition,'public.ensure_today_daily_challenge','pg_temp.ensure_today_daily_challenge');
  EXECUTE definition;
 END LOOP;
END $fixture$;

INSERT INTO pg_temp.daily_challenge_pool(sort_order,target_title,hint,is_active)
SELECT -30000-g,'R63 filler start '||g,'fixture',true FROM generate_series(1,100)g;
INSERT INTO pg_temp.daily_challenge_pool(sort_order,target_title,hint,is_active,start_title,verified_path_titles,verified_at)
VALUES(-31001,'R63 main','fixture',true,NULL,NULL,NULL),
      (-31002,'R63 goal','fixture',true,NULL,NULL,NULL),
      (-31003,'R63 fallback goal','fallback',true,'R63 fallback start',ARRAY['R63 fallback start','R63 fallback goal'],now());
INSERT INTO pg_temp.wiki_pages(page_id,canonical_title)
SELECT 'r63-filler-'||g,'R63 filler start '||g FROM generate_series(1,100)g;
INSERT INTO pg_temp.wiki_pages(page_id,canonical_title) VALUES('r63-main','R63 main'),('r63-middle','R63 middle');
INSERT INTO pg_temp.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot,fetched_at)
SELECT 'r63-filler-'||g,'100','R63 filler start '||g,now() FROM generate_series(1,100)g;
INSERT INTO pg_temp.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot,fetched_at)
VALUES('r63-main','99','R63 main',now()),('r63-main','100','R63 main',now()-interval '1 day'),
      ('r63-middle','99','R63 middle',now()),('r63-middle','100','R63 middle',now()-interval '1 day');
INSERT INTO pg_temp.wiki_snapshot_links(snapshot_id,target_page_id,target_title_snapshot,ordinal)
SELECT id,'r63-goal','R63 goal',0 FROM pg_temp.wiki_page_snapshots WHERE page_id LIKE 'r63-filler-%'
UNION ALL SELECT id,'r63-middle','R63 middle',0 FROM pg_temp.wiki_page_snapshots WHERE page_id='r63-main' AND revision_id='100'
UNION ALL SELECT id,'r63-goal','R63 goal',0 FROM pg_temp.wiki_page_snapshots WHERE page_id='r63-middle' AND revision_id='100';

SELECT cmp_ok((SELECT count(*) FROM pg_temp.wiki_page_snapshots),'>=',100::bigint,'populated-cache threshold is exercised');
SELECT cmp_ok(pg_temp.refresh_daily_course_pairs_v2(),'>=',101,'at least 100 independent filler candidates plus main');
SELECT ok(EXISTS(SELECT FROM pg_temp.daily_course_pairs_v2 WHERE start_title='R63 main' AND target_title='R63 goal'),
 'latest numeric source and intermediate revisions supply a directed course');
SELECT is((SELECT target_title FROM pg_temp.ensure_today_daily_challenge()),'R63 goal','one eligible dynamic goal wins over fixed fallback');
CREATE TEMP TABLE issued_fixture_course AS SELECT * FROM pg_temp.daily_challenges;
SELECT is((SELECT start_title FROM pg_temp.ensure_today_daily_challenge()),(SELECT start_title FROM issued_fixture_course),'repeated call returns the same issued start');
SELECT is((SELECT count(*) FROM pg_temp.daily_challenges),1::bigint,'only one daily fixture row is issued');
DELETE FROM pg_temp.daily_challenges;

SAVEPOINT newer_source;
INSERT INTO pg_temp.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot) VALUES('r63-main','101','R63 main');
SELECT cmp_ok(pg_temp.refresh_daily_course_pairs_v2(),'>=',100,'filler graph remains populated after a newer source without links');
SELECT ok(NOT EXISTS(SELECT FROM pg_temp.daily_course_pairs_v2 WHERE start_title='R63 main'),'old source links cannot survive newer source');
ROLLBACK TO newer_source;

SAVEPOINT newer_middle;
INSERT INTO pg_temp.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot) VALUES('r63-middle','101','R63 middle');
SELECT cmp_ok(pg_temp.refresh_daily_course_pairs_v2(),'>=',100,'filler graph survives newer intermediate');
SELECT ok(NOT EXISTS(SELECT FROM pg_temp.daily_course_pairs_v2 WHERE start_title='R63 main'),'old intermediate links cannot survive newer intermediate');
ROLLBACK TO newer_middle;

SAVEPOINT stale_hint;
UPDATE pg_temp.wiki_snapshot_links SET target_revision_id='99' WHERE target_page_id='r63-middle';
SELECT pg_temp.refresh_daily_course_pairs_v2();
SELECT ok(EXISTS(SELECT FROM pg_temp.daily_course_pairs_v2 WHERE start_title='R63 main'),'stale target revision hint cannot override current intermediate');
ROLLBACK TO stale_hint;

SAVEPOINT inactive_goal;
UPDATE pg_temp.daily_challenge_pool SET is_active=false WHERE target_title='R63 goal';
SELECT throws_ok('SELECT pg_temp.refresh_daily_course_pairs_v2()','P0001','DAILY_V2_POPULATED_CACHE_TOO_FEW_PAIRS (0)',
 'populated-cache safety guard is preserved when an active goal disappears');
ROLLBACK TO inactive_goal;

SAVEPOINT expired_source;
UPDATE pg_temp.wiki_page_snapshots SET fetched_at=now()-interval '46 days' WHERE page_id='r63-main' AND revision_id='100';
SELECT pg_temp.refresh_daily_course_pairs_v2();
SELECT ok(NOT EXISTS(SELECT FROM pg_temp.daily_course_pairs_v2 WHERE start_title='R63 main'),'expired source evidence is ineligible');
ROLLBACK TO expired_source;

INSERT INTO pg_temp.daily_challenges(challenge_date,start_title,target_title,hint)
SELECT (now() AT TIME ZONE 'Asia/Seoul')::date-7,'R63 main','R63 goal','prior fixture';
INSERT INTO pg_temp.daily_challenge_pool(sort_order,target_title,hint,is_active) VALUES(-31004,'R63 alternate','fixture',true);
INSERT INTO pg_temp.wiki_snapshot_links(snapshot_id,target_page_id,target_title_snapshot,ordinal)
SELECT id,'r63-alt','R63 alternate',1 FROM pg_temp.wiki_page_snapshots WHERE page_id='r63-middle' AND revision_id='100';
SELECT pg_temp.refresh_daily_course_pairs_v2();
SELECT is((SELECT target_title FROM pg_temp.ensure_today_daily_challenge()),'R63 alternate','unused goal beats a goal from seven days ago');
DELETE FROM pg_temp.daily_challenges WHERE challenge_date=(now() AT TIME ZONE 'Asia/Seoul')::date;
UPDATE pg_temp.daily_challenge_pool SET is_active=false WHERE target_title='R63 alternate';
SELECT pg_temp.refresh_daily_course_pairs_v2();
SELECT is((SELECT target_title FROM pg_temp.ensure_today_daily_challenge()),'R63 goal','repeat is allowed when no unused dynamic goal exists');

-- Emergency selection is a distinct contract: do not bypass refresh safety by
-- pretending that a populated but broken cache is an empty fresh database.
DELETE FROM pg_temp.daily_course_pairs_v2;
SELECT is((SELECT target_title FROM pg_temp.choose_daily_course_goal_first_v2((now() AT TIME ZONE 'Asia/Seoul')::date)),
 'R63 fallback goal','audited fixed course is the emergency chooser fallback');
SELECT is((SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.daily_challenges t),
 (SELECT digest FROM daily_fixture_witness),'original daily rows were never deleted or updated');
SELECT * FROM finish();
ROLLBACK;
