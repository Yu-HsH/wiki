-- Existing owner and records may not be changed by social signup.
do $test$
begin
 if has_function_privilege('anon','public.complete_oauth_profile(text,text)','execute') then
   raise exception 'ANON_CAN_COMPLETE_OAUTH'; end if;
 if not has_function_privilege('authenticated','public.complete_oauth_profile(text,text)','execute') then
   raise exception 'SOCIAL_COMPLETION_NOT_EXPOSED'; end if;
 if (select total_xp from public.profiles where username='legacy_player')<>345 then
   raise exception 'LEGACY_XP_CHANGED'; end if;
end $test$;
set role authenticated;
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $test$
begin
 begin
   perform public.complete_oauth_profile('email_only','이메일 회원');
   raise exception 'EMAIL_ONLY_COULD_COMPLETE_SOCIAL';
 exception when invalid_authorization_specification then null; end;
end $test$;
reset role;
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.complete_oauth_profile('google_user','구글 회원');
do $test$
begin
 if not exists(select 1 from public.profiles
  where username='google_user' and nickname='구글 회원' and synthetic_email is null)
 then raise exception 'GOOGLE_PROFILE_NOT_INSERTED'; end if;
 begin
  perform public.complete_oauth_profile('malicious_replace','새 계정');
  raise exception 'PROFILE_MUTATION_ALLOWED';
 exception when unique_violation then null; end;
end $test$;
reset role;
set role authenticated;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $test$
begin
 begin
  perform public.complete_oauth_profile('legacy_player','도용 시도');
  raise exception 'USERNAME_COLLISION_ALLOWED';
 exception when unique_violation then null; end;
 if exists(select 1 from public.profiles where id='33333333-3333-4333-8333-333333333333')
 then raise exception 'FAILED_SIGNUP_CREATED_PROFILE'; end if;
end $test$;
reset role;
set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
select public.complete_oauth_profile('kakao_user','카카오 회원');
reset role;
do $test$
begin
 if (select count(*) from public.profiles)<>3 then
   raise exception 'EXPECTED_THREE_PROFILES'; end if;
 if (select total_xp from public.profiles where username='legacy_player')<>345 then
   raise exception 'LEGACY_DATA_CHANGED'; end if;
 if (select synthetic_email from public.profiles where username='legacy_player')<>
  'auth_random@internal.wikigame.local' then
   raise exception 'LEGACY_LOGIN_EMAIL_CHANGED'; end if;
 if (select synthetic_email from public.profiles where username='kakao_user') is not null then
   raise exception 'SOCIAL_EMAIL_FABRICATED'; end if;
 raise notice 'OAUTH_PROFILE_SECURITY_PASS: legacy preserved, Google and Kakao registered, email-only denied, duplicate blocked';
end $test$;
