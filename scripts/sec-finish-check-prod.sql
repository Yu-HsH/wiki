-- 보안 마무리 트랙 착수 실측 — 읽기 전용 (SELECT만). 운영 SQL editor에서 실행한다.
-- 부채 ④ (A·B·C) · G2-② · O2. 로컬 기준값은 docs/agent/TRACKS.md 보안 마무리 절.
-- 변경 문장 없음: CREATE / ALTER / GRANT / REVOKE / INSERT / UPDATE / DELETE / TRUNCATE 0건.

-- Q1. 대상 4테이블의 정책 (부채 ④-A·C, G2-②)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('room_players', 'game_move_events', 'room_events', 'game_records')
order by tablename, cmd, policyname;

-- Q2. Realtime publication 컬럼 목록 (부채 ④-A) — room_players의 path_* 포함 여부
select tablename, attnames, rowfilter
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- Q3. 1:1 RPC가 상대 행을 통째로 돌려주는가 (부채 ④-B)
select p.proname,
       p.prosrc ~ $re$'opponent',\s*to_jsonb\(v_opponent\)$re$ as returns_full_opponent,
       p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('apply_duel_move_v2', 'use_duel_item_v3')
order by 1;

-- Q4. game_move_events를 읽는 함수가 전부 security definer + 테이블 소유자인가 (부채 ④-C 영향)
select n.nspname, p.proname, p.prosecdef, pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.prosrc ~ 'game_move_events'
order by p.prosecdef, 1, 2;

select relname, pg_get_userbyid(relowner) as owner, relrowsecurity, relforcerowsecurity
from pg_class
where oid in ('public.game_move_events'::regclass, 'public.room_players'::regclass, 'public.room_events'::regclass);

-- Q5. room_events에 INSERT하는 함수가 전부 security definer인가 (G2-②)
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.prosrc ~* 'insert\s+into\s+(public\.)?room_events'
order by p.prosecdef, 1;

-- Q6. room_events event_type 분포 — C 배포(2026-09-28) 이후. 서버 RPC가 만드는 종류 밖의 행이 있는가 (G2-②)
select event_type, count(*) as rows, min(created_at) as first_at, max(created_at) as last_at
from public.room_events
where created_at >= timestamptz '2026-09-28 00:00:00+09'
group by event_type
order by rows desc;

-- Q7. anon·authenticated 테이블 권한 전수 (O2) — 테이블 단위
select table_name, grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privs,
       bool_or(privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')) as has_residue
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- Q8. 컬럼 단위 권한 중 SELECT 외 (O2) — 테이블 REVOKE 뒤에도 남는 REFERENCES 등
select table_name, grantee, privilege_type, count(*) as cols
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type <> 'SELECT'
group by 1, 2, 3
order by 1, 2, 3;

-- Q9. 기본 권한 (O2 원인) — public 스키마에서 새 테이블이 받는 권한
select pg_get_userbyid(defaclrole) as owner_role, defaclobjtype, defaclacl
from pg_default_acl
where defaclnamespace = 'public'::regnamespace
order by 1, 2;

-- Q10. 시퀀스와 anon 실행 가능 함수 (O2 범위 밖 관찰)
select c.relname, c.relacl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'S';

select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
