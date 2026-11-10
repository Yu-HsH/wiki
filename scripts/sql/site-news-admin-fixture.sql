-- Disposable PostgreSQL-only fixture. No connection to production.
create schema if not exists private;
create schema if not exists auth;
do $roles$
begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $roles$;
grant usage on schema public,auth to anon,authenticated;
grant usage on schema private to service_role;
create table auth.users(id uuid primary key);
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
create function auth.uid() returns uuid language sql stable set search_path=''
as $$
 select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
grant execute on function auth.uid() to anon,authenticated,service_role;
