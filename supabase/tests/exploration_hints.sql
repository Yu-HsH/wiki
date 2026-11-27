grant ink_product_owner to postgres with set true;
-- Run with the exploration hints migration in an isolated transaction.
do $qa$
declare
  host_id uuid:=gen_random_uuid();
  guest_id uuid:=gen_random_uuid();
  other_id uuid:=gen_random_uuid();
  r uuid;
  b jsonb;
  target_public uuid;
  now_at timestamptz:=clock_timestamp();
  mode_name text;
  response jsonb;
  second jsonb;
  token uuid;
  round_no integer;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  select a,'authenticated','authenticated',a::text||'@example.invalid','{}','{}',now(),now()
  from unnest(array[host_id,guest_id,other_id]) a;
  insert into public.profiles(id,username,nickname,synthetic_email)
  select a,'hint_'||left(replace(a::text,'-',''),12),'Hint QA',a::text||'@example.invalid'
  from unnest(array[host_id,guest_id,other_id]) a on conflict(id) do nothing;
  insert into public.wiki_pages(page_id,canonical_title) values('99250001','힌트 목표');
  insert into public.wiki_page_snapshots(page_id,revision_id,canonical_title_snapshot)
  values('99250001','99250101','힌트 목표') returning id into target_public;
  select binding into strict b from ink_product.entry_policy_v1 where channel='production';
  foreach mode_name in array array['duel','group','duel_items','group_items'] loop
    perform set_config('request.jwt.claim.sub',host_id::text,true);
    if mode_name in ('duel','group') then
      insert into public.game_rooms(room_code,host_user_id,mode,use_items,min_players,max_players)
      values(upper(left(replace(gen_random_uuid()::text,'-',''),12)),host_id,mode_name,false,
        case when mode_name='group' then 3 else 2 end,case when mode_name='group' then 8 else 2 end)
      returning id into r;
      insert into public.room_players(room_id,user_id,role,nickname_snapshot,target_page_id,target_revision_id,target_title)
      values(r,host_id,'host','Host','99250001','99250101','힌트 목표'),(r,guest_id,'guest','Guest','99250001','99250101','힌트 목표');
    elsif mode_name='duel_items' then
      insert into duel_v4.rooms(host_id,creation_request,target_id) values(host_id,gen_random_uuid(),target_public) returning id into r;
      insert into duel_v4.members(room_id,user_id,seat) values(r,host_id,1),(r,guest_id,2);
    else
      set local role ink_product_owner;
      insert into ink_product.rooms(binding,host_actor) values(b,host_id) returning id into r;
      insert into ink_product.members(room_id,actor_id,name) values(r,host_id,'Host'),(r,guest_id,'Guest');
      reset role;
    end if;
    perform set_config('request.jwt.claim.sub',guest_id::text,true);
    begin
      perform public.configure_exploration_hints_v1(mode_name,r,true);
      assert false,'guest should not configure hints';
    exception when insufficient_privilege then null;
    end;
    perform set_config('request.jwt.claim.sub',host_id::text,true);
    assert public.configure_exploration_hints_v1(mode_name,r,true);
    assert not public.configure_exploration_hints_v1(mode_name,r,false);
    assert (public.read_exploration_hints_v1(mode_name,r,guest_id))->>'claim' is null;
    if mode_name in ('duel','group') then
      update public.game_rooms set status='playing',started_at=now_at-interval '4 minutes',
        game_starts_at=now_at-interval '4 minutes',group_target_page_id='99250001' where id=r;
    elsif mode_name='duel_items' then
      update duel_v4.rooms set started_at=now_at-interval '4 minutes' where id=r;
    else
      set local role ink_product_owner;
      update ink_product.rooms set session_id=gen_random_uuid(),phase='playing',version=version+1 where id=r;
      insert into ink_product.group_lifecycle_v1(room_id,started_at,deadline_at)
      values(r,now_at-interval '4 minutes',now_at+interval '16 minutes');
      reset role;
    end if;
    response:=public.read_exploration_hints_v1(mode_name,r,guest_id);
    assert response->>'enabled'='true' and response->>'claim' is null,mode_name||' before five min '||response::text;
    if mode_name in ('duel','group') then
      update public.game_rooms set started_at=now_at-interval '11 minutes',game_starts_at=now_at-interval '11 minutes' where id=r;
    elsif mode_name='duel_items' then
      update duel_v4.rooms set started_at=now_at-interval '11 minutes' where id=r;
    else
      set local role ink_product_owner;
      update ink_product.group_lifecycle_v1 set started_at=now_at-interval '11 minutes',deadline_at=now_at+interval '9 minutes' where room_id=r;
      reset role;
    end if;
    for round_no in 1..2 loop
      response:=public.read_exploration_hints_v1(mode_name,r,guest_id);
      assert response#>>'{claim,round}'=round_no::text,mode_name||' '||response::text;
      token:=(response#>>'{claim,token}')::uuid;
      second:=public.read_exploration_hints_v1(mode_name,r,host_id);
      assert second->>'claim' is null,'same interval cannot be claimed twice';
      assert public.publish_exploration_hints_v1(mode_name,r,guest_id,token,round_no,response#>>'{claim,targetPageId}',
        case when round_no=1 then '[{"page_id":"91","title":"첫째"},{"page_id":"92","title":"둘째"},{"page_id":"93","title":"셋째"}]'
        else '[{"page_id":"91","title":"첫째"},{"page_id":"94","title":"넷째"},{"page_id":"95","title":"다섯째"},{"page_id":"96","title":"여섯째"}]' end::jsonb);
      response:=public.read_exploration_hints_v1(mode_name,r,guest_id,false);
      second:=public.read_exploration_hints_v1(mode_name,r,host_id,false);
      assert response->'titles'=second->'titles','same hints for all participants';
      assert jsonb_array_length(response->'titles')=round_no*3,'preserve old hints, release three new';
    end loop;
    begin
      perform public.read_exploration_hints_v1(mode_name,r,other_id,false);
      assert false,'outsider read hints';
    exception when insufficient_privilege then null;
    end;
    raise notice 'PASS % first release, common list, cumulative unique titles and private scope',mode_name;
  end loop;
  assert not has_function_privilege('authenticated','public.publish_exploration_hints_v1(text,uuid,uuid,uuid,integer,text,jsonb)','EXECUTE');
end
$qa$;
