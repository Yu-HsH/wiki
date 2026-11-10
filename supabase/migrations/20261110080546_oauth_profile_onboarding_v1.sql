-- Wiki Race 2.0.3 OAuth registration. Legacy username/password accounts remain unchanged.
-- Created with pinned Supabase CLI: migration new oauth_profile_onboarding_v1.
begin;

-- Existing users keep non-null synthetic login emails. Social-only users have no synthetic
-- username/password email; never fabricate one or overwrite a legacy identity.
alter table public.profiles alter column synthetic_email drop not null;

-- Server-authoritative, one-time social account setup. No profile merging, existing
-- profile editing, XP changes, or client-supplied user_id.
create or replace function public.complete_oauth_profile(
  p_username text,
  p_nickname text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_username text := pg_catalog.lower(pg_catalog.btrim(p_username));
  v_nickname text := pg_catalog.btrim(p_nickname);
begin
  if v_uid is null then
    raise exception 'OAUTH_SIGN_IN_REQUIRED' using errcode = '28000';
  end if;
  if v_username is null or v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'OAUTH_INVALID_USERNAME' using errcode = '22023';
  end if;
  if v_nickname is null or pg_catalog.char_length(v_nickname) < 2
    or pg_catalog.char_length(v_nickname) > 20 then
    raise exception 'OAUTH_INVALID_NICKNAME' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.identities i
    where i.user_id = v_uid and i.provider in ('google', 'kakao')
  ) then
    raise exception 'OAUTH_PROVIDER_REQUIRED' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'OAUTH_PROFILE_ALREADY_EXISTS' using errcode = '23505';
  end if;

  begin
    insert into public.profiles(id,username,nickname,synthetic_email)
      values (v_uid,v_username,v_nickname,null);
  exception when unique_violation then
    raise exception 'OAUTH_USERNAME_UNAVAILABLE' using errcode = '23505';
  end;
  return pg_catalog.jsonb_build_object('username',v_username,'nickname',v_nickname);
end;
$fn$;

revoke all on function public.complete_oauth_profile(text,text)
  from public,anon,authenticated;
grant execute on function public.complete_oauth_profile(text,text)
  to authenticated,service_role;

commit;
