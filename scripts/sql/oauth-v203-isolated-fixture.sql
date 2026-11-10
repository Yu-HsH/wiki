-- Disposable PostgreSQL 17 fixture. No connection to Wiki Race production.
create schema if not exists auth;
do $roles$
begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $roles$;
grant usage on schema auth,public to anon,authenticated;
create table auth.users(id uuid primary key);
create table auth.identities(user_id uuid not null references auth.users(id),provider text not null);
create function auth.uid() returns uuid language sql stable set search_path=''
as $$
 select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant execute on function auth.uid() to anon,authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id),
 username text not null unique,
 nickname text not null,
 synthetic_email text not null unique,
 total_xp bigint not null default 0
);
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555');
insert into auth.identities(user_id,provider) values
 ('11111111-1111-4111-8111-111111111111','email'),
 ('22222222-2222-4222-8222-222222222222','google'),
 ('33333333-3333-4333-8333-333333333333','google'),
 ('44444444-4444-4444-8444-444444444444','email'),
 ('55555555-5555-4555-8555-555555555555','kakao');
insert into public.profiles(id,username,nickname,synthetic_email,total_xp)
values ('11111111-1111-4111-8111-111111111111','legacy_player','기존 회원','auth_random@internal.wikigame.local',345);
