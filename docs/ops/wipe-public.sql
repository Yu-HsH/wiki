-- ============================================================================
-- CUTOVER-PLAN §6.3 2단계 — 복원 대상 스키마 비우기
-- 실행: §6.3.0의 경로로. psql이 PATH에 없으면 로컬 스택 컨테이너를 쓴다:
--   docker exec -i <db컨테이너> psql "<CONN>" -v ON_ERROR_STOP=1 -f - < docs/ops/wipe-public.sql
-- 주의: 이 파일은 자체 begin;/commit;을 갖는다. 바깥에서 감싸도 롤백되지 않는다 (§6.3.1-0)
-- 전제: 이 SQL 직후에 W2 스키마 덤프 → 데이터 덤프(public 전용)를 복원한다
-- ============================================================================

\set ON_ERROR_STOP on

-- [1] 사전 확인 — 무엇이 사라지는지 눈으로 본 뒤 진행한다
select n.nspname as schema,
       count(*) filter (where c.relkind = 'r') as tables,
       count(*) filter (where c.relkind = 'v') as views
from pg_namespace n left join pg_class c on c.relnamespace = n.oid
where n.nspname in ('public', 'private') group by 1 order by 1;

select n.nspname as schema, count(*) as functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') group by 1 order by 1;

select count(*) as migration_history_rows from supabase_migrations.schema_migrations;

-- [2] 비우기
begin;

-- public: 덤프가 CREATE SCHEMA를 내지 않으므로 여기서 다시 만든다
drop schema if exists public cascade;

-- private: 20260813072952(Phase 2C)가 만드는 스키마다. public을 cascade drop해도
-- public 객체를 참조하지 않는 함수는 살아남는다 (로컬 실측: 10개 중 7개 잔존).
-- 스키마 덤프는 private를 제외 목록에 넣지 않으므로 CREATE SCHEMA IF NOT EXISTS "private"와
-- 함수 전체를 담는다 → 여기서 지우고 덤프가 복원하게 둔다.
drop schema if exists private cascade;

create schema public;
-- 덤프가 담지 않는 스키마 수준 속성 2가지를 여기서 복원한다.
--   owner : 덤프에 ALTER SCHEMA "public" OWNER TO 가 없다
--   PUBLIC 롤 USAGE : 덤프의 GRANT는 postgres/anon/authenticated/service_role 4개뿐이다
-- (COMMENT ON SCHEMA "public"과 ALTER DEFAULT PRIVILEGES 12행은 덤프가 담는다)
alter schema public owner to pg_database_owner;
grant usage on schema public to public;

-- migration 이력: 어느 덤프에도 없다 (§4.2-2). 비워야 복원 후 repair가 baseline 한 행만 남긴다
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations;
  end if;
end
$$;

commit;

-- [3] 사후 확인 — 5개 값이 모두 기대치여야 복원으로 넘어간다
select nspname, pg_get_userbyid(nspowner) as owner, array_to_string(nspacl, ',') as acl
from pg_namespace where nspname in ('public', 'private');
-- 기대: public 1행만. owner = pg_database_owner,
--       acl = pg_database_owner=UC/pg_database_owner,=U/pg_database_owner
--       private 행은 없어야 한다

select count(*) as remaining_objects
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private');            -- 기대 0

select count(*) as remaining_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private');            -- 기대 0

select count(*) as migration_history_rows
from supabase_migrations.schema_migrations;          -- 기대 0

select count(*) as realtime_publication_members
from pg_publication_tables where pubname = 'supabase_realtime';   -- 기대 0 (덤프가 4로 되돌린다)
