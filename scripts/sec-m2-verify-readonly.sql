-- SF-A3 / SF-M2 evidence supplement, 2026-10-06, base e4fb483 + uncommitted work.
-- SELECT only. Does not replace or modify the existing untracked sec-m2-check-prod.sql.
-- Run locally or manually in SQL editor; this session does not connect to production.

-- Effective privileges include PUBLIC/inherited grants, not just explicit ACL rows.
select c.relname, r.role_name,
       has_table_privilege(r.role_name, c.oid, 'SELECT') as can_select,
       has_table_privilege(r.role_name, c.oid, 'INSERT') as can_insert,
       has_any_column_privilege(r.role_name, c.oid, 'UPDATE') as can_update_any_column,
       has_table_privilege(r.role_name, c.oid, 'DELETE') as can_delete
from pg_class c
cross join (values ('anon'), ('authenticated')) r(role_name)
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
order by c.relname, r.role_name;

-- Every overload and internal schema: compare with the client RPC inventory in the report.
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by n.nspname, p.proname, arguments;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
order by tablename, cmd, policyname;

select c.relname, r.role_name,
       has_sequence_privilege(r.role_name, c.oid, 'USAGE') as can_use,
       has_sequence_privilege(r.role_name, c.oid, 'SELECT') as can_select,
       has_sequence_privilege(r.role_name, c.oid, 'UPDATE') as can_update
from pg_class c cross join (values ('anon'), ('authenticated')) r(role_name)
where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
order by c.relname, r.role_name;

select pg_get_userbyid(defaclrole) as owner, defaclobjtype, defaclacl
from pg_default_acl where defaclnamespace = 'public'::regnamespace;

select version from supabase_migrations.schema_migrations order by version;
select pg_get_functiondef(to_regprocedure('public.can_view_room_player_v1(uuid,uuid)'));
select pubname, tablename, attnames, rowfilter
from pg_publication_tables where schemaname = 'public'
order by pubname, tablename;
