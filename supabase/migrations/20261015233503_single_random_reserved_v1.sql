-- Append-only: extend the proven Single reservation contract to Wikipedia random.
-- Legacy runs/times/XP/other modes are preserved. No candidate/daily pool changes.
begin;
alter table public.single_game_runs drop constraint single_reserved_time_v1_check,
  add constraint single_reserved_time_v1_check check (timing_contract is null or (
    run_mode in ('random','custom','daily') and assigned_at is not null and prepare_expires_at=assigned_at+interval '60 seconds'
    and (scheduled_start_at is null or (scene_starts_at is not null and scheduled_start_at=scene_starts_at+interval '8.6 seconds'))
    and (started_at is null or started_at=scheduled_start_at)
    and (status not in ('active','completed') or (started_at is not null and scheduled_start_at is not null))));
alter table private.single_start_allocations_v1 drop constraint single_start_allocations_v1_run_mode_check,
  add constraint single_start_allocations_v1_run_mode_check check (run_mode in ('random','custom','daily'));

create or replace function public.claim_single_course_v1(p_request_id uuid,p_user_id uuid,p_guest_hash text,p_mode text,p_target text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.single_start_allocations_v1; root private.single_start_allocations_v1;
  r public.single_game_runs; k text; t timestamptz:=clock_timestamp();
begin
  if p_request_id is null or ((p_user_id is null)=(p_guest_hash is null))
    or (p_guest_hash is not null and p_guest_hash !~ '^[0-9a-f]{64}$') then raise exception 'OWNER_REQUIRED'; end if;
  k:=coalesce(p_user_id::text,p_guest_hash);
  perform pg_advisory_xact_lock(hashtextextended('single-start:'||k,0));
  select * into a from private.single_start_allocations_v1 where id=p_request_id;
  if found then
    if a.owner_key<>k then raise exception 'REQUEST_ID_IN_USE'; end if;
    select * into root from private.single_start_allocations_v1 where id=a.root_id;
  else
    -- One live allocation per owner; aliases retain idempotency after response loss.
    for a in select * from private.single_start_allocations_v1 where owner_key=k and id=root_id order by created_at desc loop
      if a.run_id is not null then
        r:=private.resolve_single_start_v1(a.run_id);
        if r.status in ('prepared','scheduled','active') then root:=a; exit; end if;
      elsif clock_timestamp()<a.lease_expires_at then root:=a; exit;
      end if;
    end loop;
    if root.id is not null then
      insert into private.single_start_allocations_v1(id,root_id,owner_key,user_id,guest_token_hash,run_mode,custom_target,lease_expires_at)
        values(p_request_id,root.id,k,p_user_id,p_guest_hash,root.run_mode,root.custom_target,root.lease_expires_at);
    else
      if p_mode not in ('random','custom','daily') or (p_mode='custom' and nullif(btrim(p_target),'') is null) then raise exception 'RUN_MODE_REQUIRED'; end if;
      if (select count(*) from private.single_start_allocations_v1 allocation left join public.single_game_runs g on g.id=allocation.run_id
        where allocation.owner_key=k and allocation.id=allocation.root_id and allocation.created_at>clock_timestamp()-interval '5 minutes'
          and coalesce(g.status,'')<>'completed')>=3 then return jsonb_build_object('ok',false,'code','COURSE_ALLOCATION_LIMIT'); end if;
      insert into private.single_start_allocations_v1(id,root_id,owner_key,user_id,guest_token_hash,run_mode,custom_target,lease_expires_at)
        values(p_request_id,p_request_id,k,p_user_id,p_guest_hash,p_mode,p_target,clock_timestamp()+interval '30 seconds') returning * into root;
      return jsonb_build_object('ok',true,'code','SELECT_COURSE','allocationId',root.id,'mode',root.run_mode,'target',root.custom_target);
    end if;
  end if;
  if root.run_id is not null then
    r:=private.resolve_single_start_v1(root.run_id);
    return jsonb_build_object('ok',true,'code','ALLOCATED','allocationId',root.id,'run',to_jsonb(r)-'guest_token_hash','server_now',clock_timestamp());
  end if;
  return jsonb_build_object('ok',clock_timestamp()<root.lease_expires_at,'code',case when clock_timestamp()<root.lease_expires_at then 'ALLOCATION_PENDING' else 'ALLOCATION_EXPIRED' end,'allocationId',root.id);
end; $$;

create or replace function public.commit_single_course_v1(p_allocation_id uuid,p_user_id uuid,p_guest_hash text,p_start jsonb,p_goal jsonb,p_daily_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.single_start_allocations_v1; r public.single_game_runs; t timestamptz; k text;
begin
  k:=coalesce(p_user_id::text,p_guest_hash);
  perform pg_advisory_xact_lock(hashtextextended('single-start:'||k,0));
  select * into a from private.single_start_allocations_v1 where id=p_allocation_id and id=root_id and owner_key=k for update;
  if not found then raise exception 'ALLOCATION_NOT_FOUND'; end if;
  if a.run_id is not null then
    r:=private.resolve_single_start_v1(a.run_id);
    return jsonb_build_object('ok',true,'code','ALLOCATED','run',to_jsonb(r)-'guest_token_hash','server_now',clock_timestamp());
  end if;
  t:=clock_timestamp();
  if t>=a.lease_expires_at then return jsonb_build_object('ok',false,'code','ALLOCATION_EXPIRED'); end if;
  if p_start->>'pageId'=p_goal->>'pageId' or not exists(select 1 from public.wiki_page_snapshots
    where page_id=p_start->>'pageId' and revision_id=p_start->>'revisionId' and canonical_title_snapshot=p_start->>'canonicalTitle')
    or not exists(select 1 from public.wiki_pages where page_id=p_goal->>'pageId' and canonical_title=p_goal->>'canonicalTitle') then raise exception 'COURSE_IDENTITY_REQUIRED'; end if;
  if a.run_mode='random' and (
    p_start->>'namespace' is distinct from '0' or p_goal->>'namespace' is distinct from '0'
    or not exists(select 1 from public.wiki_page_snapshots s where s.id::text=p_start->>'snapshotId'
      and s.page_id=p_start->>'pageId' and s.revision_id=p_start->>'revisionId' and s.canonical_title_snapshot=p_start->>'canonicalTitle')
    or not exists(select 1 from public.wiki_page_snapshots s where s.id::text=p_goal->>'snapshotId'
      and s.page_id=p_goal->>'pageId' and s.revision_id=p_goal->>'revisionId' and s.canonical_title_snapshot=p_goal->>'canonicalTitle')
  ) then raise exception 'COURSE_IDENTITY_REQUIRED'; end if;
  if a.run_mode='daily' and not private.single_start_daily_date_valid_v1(p_daily_date,t) then
    return jsonb_build_object('ok',false,'code','DAILY_ROLLOVER_REQUIRED'); end if;
  insert into public.single_game_runs(id,user_id,guest_token_hash,run_mode,daily_challenge_date,status,started_at,
    timing_contract,assigned_at,prepare_expires_at,start_page_id,start_revision_id,start_title_snapshot,
    target_page_id,target_revision_id,target_title_snapshot,current_page_id,current_revision_id,current_title_snapshot,
    path_page_ids,path_revision_ids,path_title_snapshots)
  values(gen_random_uuid(),a.user_id,a.guest_token_hash,a.run_mode,p_daily_date,'prepared',null,
    'single_reserved_prefetch_v1',t,t+interval '60 seconds',p_start->>'pageId',p_start->>'revisionId',p_start->>'canonicalTitle',
    p_goal->>'pageId',p_goal->>'revisionId',p_goal->>'canonicalTitle',p_start->>'pageId',p_start->>'revisionId',p_start->>'canonicalTitle',
    array[p_start->>'pageId'],array[p_start->>'revisionId'],array[p_start->>'canonicalTitle']) returning * into r;
  update private.single_start_allocations_v1 set run_id=r.id where id=a.id;
  return jsonb_build_object('ok',true,'code','ALLOCATED','run',to_jsonb(r)-'guest_token_hash','server_now',clock_timestamp());
end; $$;

revoke all on function public.claim_single_course_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.commit_single_course_v1(uuid,uuid,text,jsonb,jsonb,date) from public,anon,authenticated;
grant execute on function public.claim_single_course_v1(uuid,uuid,text,text,text) to service_role;
grant execute on function public.commit_single_course_v1(uuid,uuid,text,jsonb,jsonb,date) to service_role;
commit;
