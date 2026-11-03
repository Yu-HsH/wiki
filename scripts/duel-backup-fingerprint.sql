begin read only;
set local role postgres;
set local search_path='';
select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'fingerprint',((xpath('/row/v/text()',query_to_xml(format('select count(*)::text||'':''||md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' order by to_jsonb(t)::text),'''')) as v from %I.%I t',schemaname,tablename),false,true,'')))[1])::text) order by schemaname,tablename) from pg_tables where schemaname in ('auth','public','private','storage','supabase_migrations')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'def',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('auth','public','private','storage')),
 'security',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl,'owner',pg_get_userbyid(c.relowner)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','private','storage') and c.relkind='r'),
 'defaults',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl) order by pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
 'role_memberships',(select jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'admin',a.admin_option) order by r.rolname,m.rolname) from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member)
) as fingerprint;
rollback;
