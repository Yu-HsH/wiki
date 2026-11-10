-- This file runs only against the disposable fixture.
do $test$
begin
 if (select count(*) from public.site_news_posts)<>4 then raise exception 'EXPECTED_FOUR_RELEASE_NOTICES'; end if;
 if (select count(*) from private.site_news_admins)<>0 then raise exception 'MIGRATION_MUST_NOT_ASSIGN_ADMIN'; end if;
 if not (select relrowsecurity from pg_class where oid='public.site_news_posts'::regclass) then raise exception 'PUBLIC_RLS_DISABLED'; end if;
 if not (select relrowsecurity from pg_class where oid='private.site_news_admins'::regclass) then raise exception 'ADMIN_RLS_DISABLED'; end if;
end $test$;
set role anon;
do $test$
begin
 if (select count(*) from public.site_news_posts)<>4 then raise exception 'GUEST_CANNOT_READ_RELEASES'; end if;
 if has_function_privilege('anon','public.is_site_news_admin()','execute') then raise exception 'ANON_CAN_PROBE_ADMIN'; end if;
 begin
  insert into public.site_news_posts(title,summary,details)
   values('intruder','intruder',array['intruder']);
  raise exception 'ANON_WRITE_SUCCEEDED';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $test$
begin
 if public.is_site_news_admin() then raise exception 'NORMAL_USER_HAS_ADMIN'; end if;
 if (select count(*) from public.site_news_posts)<>4 then raise exception 'NORMAL_USER_PUBLIC_READ_FAILED'; end if;
 begin
  insert into public.site_news_posts(title,summary,details)
   values('normal user','not allowed',array['blocked']);
  raise exception 'NORMAL_USER_INSERT_SUCCEEDED';
 exception when insufficient_privilege then null; end;
 begin
  update public.site_news_posts set title='tampered';
  if found then raise exception 'NORMAL_USER_EDIT_SUCCEEDED'; end if;
 exception when insufficient_privilege then null; end;
 begin
  insert into private.site_news_admins(slot,user_id) values (1,'22222222-2222-4222-8222-222222222222');
  raise exception 'NORMAL_USER_ROLE_ESCALATION_SUCCEEDED';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;

insert into private.site_news_admins(slot,user_id)
values (1,'11111111-1111-4111-8111-111111111111');
do $test$
begin
 begin
  insert into private.site_news_admins(slot,user_id)
  values (2,'22222222-2222-4222-8222-222222222222');
  raise exception 'SECOND_ADMIN_SUCCEEDED';
 exception when check_violation then null; end;
end $test$;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $test$
begin
 if not public.is_site_news_admin() then raise exception 'REAL_ADMIN_NOT_AUTHORIZED'; end if;
 insert into public.site_news_posts(title,summary,details,status)
  values('새 공지','임시 저장',array['서버에서 저장'],'draft');
 if (select count(*) from public.site_news_posts)<>5 then raise exception 'ADMIN_CANNOT_READ_DRAFT'; end if;
 update public.site_news_posts
  set status='published',published_at=now()
  where title='새 공지';
 if (select count(*) from public.site_news_posts where status='published')<>5 then raise exception 'ADMIN_CANNOT_PUBLISH'; end if;
 update public.site_news_posts set status='draft',published_at=null where title='새 공지';
 if (select count(*) from public.site_news_posts where status='draft')<>1 then raise exception 'ADMIN_CANNOT_HIDE'; end if;
end $test$;
reset role;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $test$
begin
 if (select count(*) from public.site_news_posts)<>4 then raise exception 'DRAFT_LEAK_TO_USER'; end if;
 if exists(select 1 from public.site_news_posts where title='새 공지') then raise exception 'DRAFT_CONTENT_LEAK'; end if;
end $test$;
reset role;
do $test$
begin
 raise notice 'SITE_NEWS_ADMIN_SECURITY_PASS: 4 public, one admin, draft hidden, admin CRUD, role escalation blocked';
end $test$;
