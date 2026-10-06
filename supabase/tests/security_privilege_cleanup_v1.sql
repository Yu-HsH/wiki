-- Local only; fixtures and all writes roll back. Run alongside duel_players_* and sec_finish_db_v1.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not has_table_privilege(r, 'public.profiles', p), r || ' profiles ' || p || ' denied')
from unnest(array['anon','authenticated']) r cross join unnest(array['INSERT','DELETE']) p;
select ok(not has_table_privilege(r, 'public.analytics_events', p), r || ' analytics ' || p || ' denied')
from unnest(array['anon','authenticated']) r cross join unnest(array['UPDATE','DELETE']) p;
select ok(not has_table_privilege(r, 'public.' || t, p), r || ' ' || t || ' ' || p || ' denied')
from unnest(array['anon','authenticated']) r
cross join unnest(array['target_candidates','daily_challenges','daily_challenge_pool','picked']) t
cross join unnest(array['INSERT','UPDATE','DELETE']) p;
select ok(not has_sequence_privilege(r, 'public.target_candidates_id_seq', p), r || ' sequence ' || p || ' denied')
from unnest(array['anon','authenticated']) r cross join unnest(array['USAGE','SELECT','UPDATE']) p;
select ok(has_table_privilege(r, 'public.analytics_events', 'INSERT'), r || ' analytics collection retained')
from unnest(array['anon','authenticated']) r;
select ok(has_table_privilege(r, 'public.daily_challenges', 'SELECT'), r || ' daily fallback retained')
from unnest(array['anon','authenticated']) r;
select ok(has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE'), 'profile editable ' || c)
from unnest(array['nickname','profile_image_url','updated_at']) c;
select ok(not has_column_privilege('authenticated','public.profiles','total_xp','UPDATE'), 'client XP update denied');
select ok(has_table_privilege('authenticated','public.room_players','SELECT'), 'A3 reads retained');
select ok(has_table_privilege('authenticated','public.room_events','SELECT'), 'duel progress retained');
select ok(has_function_privilege('authenticated','public.get_duel_room_players_v1(uuid)','EXECUTE'), 'masked progress RPC retained');
select ok(has_function_privilege('authenticated','public.apply_group_move_v2(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,uuid)','EXECUTE'), 'group move retained');

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-06a0-000000000001','authenticated','authenticated','m2@local.test','{}','{}');
insert into public.profiles(id, username, nickname, synthetic_email)
values ('00000000-0000-0000-06a0-000000000001','m2-test','Before','m2@local.test') on conflict(id) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-06a0-000000000001',true);
select lives_ok($$update public.profiles set nickname='After', updated_at=now()
  where id='00000000-0000-0000-06a0-000000000001'$$, 'own profile edit succeeds');
select is((select nickname from public.profiles where id=auth.uid()), 'After', 'edit affects own row');
select throws_ok($$delete from public.profiles where id=auth.uid()$$, '42501', 'permission denied for table profiles', 'profile delete denied');
select throws_ok($$update public.analytics_events set event_name='tamper'$$, '42501', 'permission denied for table analytics_events', 'analytics update denied');
select throws_ok($$delete from public.target_candidates$$, '42501', 'permission denied for table target_candidates', 'candidate delete denied');
select * from finish();
rollback;
