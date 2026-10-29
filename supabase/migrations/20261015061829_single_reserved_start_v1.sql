-- Single START: server allocation -> prefetch -> immutable scheduled start.
-- random remains on the legacy contract until target-level source is recovered.
begin;

alter table public.single_game_runs
  drop constraint single_game_runs_status_check,
  add constraint single_game_runs_status_check check (status in ('prepared','scheduled','active','completed','abandoned','expired')),
  alter column started_at drop not null,
  add column timing_contract text check (timing_contract is null or timing_contract='single_reserved_prefetch_v1'),
  add column assigned_at timestamptz,
  add column prepare_expires_at timestamptz,
  add column scene_starts_at timestamptz,
  add column scheduled_start_at timestamptz,
  add constraint single_reserved_time_v1_check check (timing_contract is null or (
    run_mode in ('custom','daily') and assigned_at is not null and prepare_expires_at=assigned_at+interval '60 seconds'
    and (scheduled_start_at is null or (scene_starts_at is not null and scheduled_start_at=scene_starts_at+interval '8.6 seconds'))
    and (started_at is null or started_at=scheduled_start_at)
    and (status not in ('active','completed') or (started_at is not null and scheduled_start_at is not null))));
alter table public.game_records add column timing_contract text
  check (timing_contract is null or timing_contract='single_reserved_prefetch_v1');

create index single_reserved_owner_v1_idx on public.single_game_runs(user_id,guest_token_hash,status)
  where timing_contract='single_reserved_prefetch_v1';

-- Server-only claims include aliases for lost responses with different request IDs.
create table private.single_start_allocations_v1 (
  id uuid primary key,
  root_id uuid not null,
  owner_key text not null,
  user_id uuid,
  guest_token_hash text,
  run_mode text not null check (run_mode in ('custom','daily')),
  custom_target text,
  created_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz not null,
  run_id uuid references public.single_game_runs(id),
  check ((user_id is null) <> (guest_token_hash is null))
);
alter table private.single_start_allocations_v1 enable row level security;
revoke all on private.single_start_allocations_v1 from public,anon,authenticated;
grant select,insert,update on private.single_start_allocations_v1 to service_role;
create index single_start_allocation_owner_v1_idx on private.single_start_allocations_v1(owner_key,created_at);

create function private.resolve_single_start_v1(p_run_id uuid)
returns public.single_game_runs language plpgsql security definer set search_path='' as $$
declare r public.single_game_runs; t timestamptz;
begin
  select * into r from public.single_game_runs where id=p_run_id for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  t:=clock_timestamp();
  if r.timing_contract='single_reserved_prefetch_v1' then
    if r.status='prepared' and t>=r.prepare_expires_at then
      update public.single_game_runs set status='expired',updated_at=t where id=r.id returning * into r;
    elsif r.status='scheduled' and t>=r.scheduled_start_at then
      -- TTL intentionally applies ONLY before successful reservation.
      update public.single_game_runs set status='active',started_at=r.scheduled_start_at,updated_at=t
        where id=r.id returning * into r;
    end if;
    if r.status='active' and t>=r.expires_at then
      update public.single_game_runs set status='expired',updated_at=t where id=r.id returning * into r;
    end if;
  end if;
  return r;
end; $$;
revoke all on function private.resolve_single_start_v1(uuid) from public,anon,authenticated;

create function private.guard_single_reserved_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.timing_contract='single_reserved_prefetch_v1' then
    if (new.start_page_id,new.start_revision_id,new.start_title_snapshot,new.target_page_id,new.target_revision_id,
      new.target_title_snapshot,new.run_mode,new.daily_challenge_date,new.user_id,new.guest_token_hash,new.timing_contract)
      is distinct from (old.start_page_id,old.start_revision_id,old.start_title_snapshot,old.target_page_id,old.target_revision_id,
      old.target_title_snapshot,old.run_mode,old.daily_challenge_date,old.user_id,old.guest_token_hash,old.timing_contract)
      or (old.scheduled_start_at is not null and (new.scheduled_start_at,new.scene_starts_at) is distinct from (old.scheduled_start_at,old.scene_starts_at))
      or (old.started_at is not null and new.started_at is distinct from old.started_at) then
      raise exception 'SINGLE_START_IDENTITY_IMMUTABLE';
    end if;
    if old.status in ('completed','abandoned','expired') and new.status is distinct from old.status then
      raise exception 'RUN_TERMINAL';
    end if;
    if new.status in ('active','completed') and (new.scheduled_start_at is null or clock_timestamp()<new.scheduled_start_at
      or new.started_at is distinct from new.scheduled_start_at) then raise exception 'RUN_NOT_STARTED'; end if;
    if (new.current_page_id,new.current_revision_id,new.move_count,new.path_page_ids) is distinct from
      (old.current_page_id,old.current_revision_id,old.move_count,old.path_page_ids) and old.status<>'active' then
      raise exception 'RUN_NOT_STARTED';
    end if;
    if new.status='completed' and old.status<>'active' then raise exception 'RUN_NOT_STARTED'; end if;
  end if;
  return new;
end; $$;
revoke all on function private.guard_single_reserved_v1() from public,anon,authenticated;
create trigger trg_guard_single_reserved_v1 before update on public.single_game_runs
for each row execute function private.guard_single_reserved_v1();

create function public.claim_single_course_v1(p_request_id uuid,p_user_id uuid,p_guest_hash text,p_mode text,p_target text default null)
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
      if p_mode='random' then return jsonb_build_object('ok',false,'code','RANDOM_CONTRACT_DEFERRED'); end if;
      if p_mode not in ('custom','daily') or (p_mode='custom' and nullif(btrim(p_target),'') is null) then raise exception 'RUN_MODE_REQUIRED'; end if;
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
revoke all on function public.claim_single_course_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_single_course_v1(uuid,uuid,text,text,text) to service_role;

create function private.single_start_daily_date_valid_v1(p_course_date date,p_server_now timestamptz)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_course_date=(p_server_now at time zone 'Asia/Seoul')::date
    and p_course_date=((p_server_now+interval '9.1 seconds') at time zone 'Asia/Seoul')::date,false);
$$;
revoke all on function private.single_start_daily_date_valid_v1(date,timestamptz) from public,anon,authenticated;

create function public.commit_single_course_v1(p_allocation_id uuid,p_user_id uuid,p_guest_hash text,p_start jsonb,p_goal jsonb,p_daily_date date default null)
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
revoke all on function public.commit_single_course_v1(uuid,uuid,text,jsonb,jsonb,date) from public,anon,authenticated;
grant execute on function public.commit_single_course_v1(uuid,uuid,text,jsonb,jsonb,date) to service_role;

create function public.control_single_start_v1(p_run_id uuid,p_user_id uuid,p_guest_hash text,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.single_game_runs; t timestamptz;
begin
  select * into r from public.single_game_runs where id=p_run_id
    and ((p_user_id is not null and user_id=p_user_id and p_guest_hash is null)
      or (p_user_id is null and user_id is null and guest_token_hash=p_guest_hash)) for update;
  if not found or r.timing_contract is distinct from 'single_reserved_prefetch_v1' then raise exception 'RUN_NOT_FOUND'; end if;
  r:=private.resolve_single_start_v1(r.id);t:=clock_timestamp();
  if p_action='reserve' and r.status='prepared' then
    if r.run_mode='daily' and not private.single_start_daily_date_valid_v1(r.daily_challenge_date,t) then
      update public.single_game_runs set status='expired',updated_at=t where id=r.id returning * into r;
      return jsonb_build_object('ok',false,'code','DAILY_ROLLOVER_REQUIRED','run',to_jsonb(r)-'guest_token_hash','server_now',t);
    end if;
    update public.single_game_runs set status='scheduled',scene_starts_at=t+interval '.5 seconds',
      scheduled_start_at=t+interval '9.1 seconds',expires_at=t+interval '9.1 seconds 24 hours',updated_at=t
      where id=r.id returning * into r;
  elsif p_action='leave' and r.status in ('prepared','scheduled','active') then
    update public.single_game_runs set status='abandoned',finished_at=t,updated_at=t where id=r.id returning * into r;
  elsif p_action not in ('reserve','snapshot','start','leave') then raise exception 'UNSUPPORTED_ACTION';
  end if;
  return jsonb_build_object('ok',true,'code',case when r.status='prepared' and p_action='start' then 'RUN_NOT_STARTED' else upper(r.status) end,
    'run',to_jsonb(r)-'guest_token_hash','server_now',clock_timestamp());
end; $$;
revoke all on function public.control_single_start_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.control_single_start_v1(uuid,uuid,text,text) to service_role;

create function private.copy_single_timing_contract_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select timing_contract into new.timing_contract from public.single_game_runs where id=new.run_id;
  return new;
end; $$;
revoke all on function private.copy_single_timing_contract_v1() from public,anon,authenticated;
create trigger trg_copy_single_timing_contract_v1 before insert on public.game_records
for each row execute function private.copy_single_timing_contract_v1();

-- Existing mutation bodies are reproduced below, with only reserved-start guards
-- and the new-contract server clock changed. Legacy API signatures stay intact.

create or replace function public.get_single_game_run(p_run_id uuid)
returns public.single_game_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.single_game_runs;
begin
  select * into v_run from public.single_game_runs
  where id = p_run_id and user_id = auth.uid();
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if v_run.timing_contract='single_reserved_prefetch_v1' then
    v_run:=private.resolve_single_start_v1(v_run.id);
  end if;
  if v_run.expires_at <= now() and v_run.status = 'active' then
    update public.single_game_runs set status = 'expired', updated_at = now() where id = v_run.id returning * into v_run;
  end if;
  return v_run;
end;
$$;

create or replace function public.apply_single_move_v2(
  p_run_id uuid,
  p_request_id uuid,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_to_page_id text default null,
  p_to_revision_id text default null,
  p_to_title_snapshot text default null,
  p_clicked_raw_title text default null,
  p_event_type text default 'NORMAL_LINK',
  p_item_event_id uuid default null,
  p_undone_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.single_game_runs;
  v_event public.game_move_events;
  v_link public.wiki_snapshot_links;
  v_previous public.game_move_events;
  v_response jsonb;
  v_from_id text;
  v_from_revision text;
  v_from_title text;
  v_to_id text := p_to_page_id;
  v_to_revision text := p_to_revision_id;
  v_to_title text := p_to_title_snapshot;
  v_delta integer := 1;
  v_move_count integer;
  v_version bigint;
  v_status text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select * into v_run from public.single_game_runs
  where id = p_run_id and user_id = v_user_id for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if v_run.timing_contract='single_reserved_prefetch_v1' then
    v_run:=private.resolve_single_start_v1(v_run.id);
  end if;

  -- The run lock must be acquired before the idempotency read. Two
  -- concurrent deliveries with the same request_id then serialize and the
  -- second delivery reuses the committed response instead of racing INSERT.
  select response into v_response from public.game_mutation_requests
  where scope = 'single' and game_id = p_run_id and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;
  if v_run.expires_at <= now() and v_run.status = 'active' then
    update public.single_game_runs set status = 'expired', updated_at = now() where id = v_run.id returning * into v_run;
  end if;
  if v_run.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_ACTIVE', 'run', to_jsonb(v_run));
  end if;
  if p_expected_version is distinct from v_run.state_version then
    return jsonb_build_object('ok', false, 'code', 'STATE_VERSION_CONFLICT', 'run', to_jsonb(v_run));
  end if;

  v_from_id := v_run.current_page_id;
  v_from_revision := v_run.current_revision_id;
  v_from_title := v_run.current_title_snapshot;

  if p_event_type = 'UNDO' then
    select candidate.* into v_previous from public.game_move_events candidate
    where candidate.scope = 'single' and candidate.game_id = p_run_id
      and candidate.actor_user_id = v_user_id
      and candidate.event_type <> 'UNDO'
      and not exists (
        select 1 from public.game_move_events undo_event
        where undo_event.scope = 'single'
          and undo_event.game_id = p_run_id
          and undo_event.actor_user_id = v_user_id
          and undo_event.undone_event_id = candidate.id
      )
    order by candidate.server_timestamp desc, candidate.id desc limit 1;
    if not found or array_length(v_run.path_page_ids, 1) < 2 then
      return jsonb_build_object('ok', false, 'code', 'UNDO_UNAVAILABLE', 'run', to_jsonb(v_run));
    end if;
    v_to_id := v_previous.from_page_id;
    v_to_revision := v_previous.from_revision_id;
    v_to_title := v_previous.from_title_snapshot;
    v_delta := case when v_previous.event_type = 'FORCED_LINK' then -1 else 1 end;
    p_undone_event_id := v_previous.id;
  elsif p_event_type in ('NORMAL_LINK', 'FORCED_LINK', 'RANDOM_TELEPORT') then
    if p_event_type = 'NORMAL_LINK' then
      select link.* into v_link
      from public.wiki_page_snapshots snapshot
      join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
      where snapshot.page_id = v_run.current_page_id
        and snapshot.revision_id = v_run.current_revision_id
        and link.target_page_id = p_to_page_id
      limit 1;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'LINK_NOT_ALLOWED', 'run', to_jsonb(v_run));
      end if;
      v_to_id := v_link.target_page_id;
      v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id);
      v_to_title := v_link.target_title_snapshot;
      if v_to_revision is null then
        return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'run', to_jsonb(v_run));
      end if;
    else
      select link.* into v_link
      from public.wiki_page_snapshots snapshot
      join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
      where snapshot.page_id = v_run.current_page_id
        and snapshot.revision_id = v_run.current_revision_id
        and link.target_page_id not in (v_run.current_page_id, v_run.target_page_id)
      order by md5(link.target_page_id || p_request_id::text)
      limit 1;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'run', to_jsonb(v_run));
      end if;
      v_to_id := v_link.target_page_id;
      v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id);
      v_to_title := v_link.target_title_snapshot;
      if v_to_revision is null then
        return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'run', to_jsonb(v_run));
      end if;
    end if;
    if v_to_id = v_run.target_page_id and p_event_type <> 'NORMAL_LINK' then
      return jsonb_build_object('ok', false, 'code', 'TARGET_DIRECT_MOVE_BLOCKED', 'run', to_jsonb(v_run));
    end if;
  else
    raise exception 'UNSUPPORTED_EVENT_TYPE';
  end if;

  if nullif(v_to_id, '') is null or nullif(v_to_title, '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOVE_TARGET_REQUIRED', 'run', to_jsonb(v_run));
  end if;

  v_version := v_run.state_version + 1;
  v_move_count := greatest(0, v_run.move_count + v_delta);
  v_status := case when v_to_id = v_run.target_page_id then 'completed' else 'active' end;

  if p_event_type = 'UNDO' then
    v_run.path_page_ids := v_run.path_page_ids[1:greatest(1, array_length(v_run.path_page_ids, 1) - 1)];
    v_run.path_revision_ids := v_run.path_revision_ids[1:greatest(1, array_length(v_run.path_revision_ids, 1) - 1)];
    v_run.path_title_snapshots := v_run.path_title_snapshots[1:greatest(1, array_length(v_run.path_title_snapshots, 1) - 1)];
  else
    v_run.path_page_ids := array_append(v_run.path_page_ids, v_to_id);
    v_run.path_revision_ids := array_append(v_run.path_revision_ids, coalesce(v_to_revision, ''));
    v_run.path_title_snapshots := array_append(v_run.path_title_snapshots, v_to_title);
  end if;

  update public.single_game_runs set
    status = v_status,
    current_page_id = v_to_id,
    current_revision_id = coalesce(v_to_revision, current_revision_id),
    current_title_snapshot = v_to_title,
    move_count = v_move_count,
    state_version = v_version,
    path_page_ids = v_run.path_page_ids,
    path_revision_ids = v_run.path_revision_ids,
    path_title_snapshots = v_run.path_title_snapshots,
    finished_at = case when v_status = 'completed' then (case when v_run.timing_contract='single_reserved_prefetch_v1' then clock_timestamp() else now() end) else null end,
    last_seen_at = now(), updated_at = now()
  where id = v_run.id returning * into v_run;

  insert into public.game_move_events (
    scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id, event_type,
    from_page_id, from_revision_id, from_title_snapshot, to_page_id, to_revision_id,
    to_title_snapshot, clicked_raw_title, move_delta, move_count_after, version_before,
    version_after, item_event_id, undone_event_id, metadata
  ) values (
    'single', p_run_id, v_user_id, v_user_id, p_request_id, coalesce(p_correlation_id, p_request_id), p_event_type,
    v_from_id, v_from_revision, v_from_title, v_to_id, v_to_revision, v_to_title,
    p_clicked_raw_title, v_delta, v_move_count, v_version - 1, v_version,
    p_item_event_id, p_undone_event_id, jsonb_build_object('status', v_status)
  ) returning * into v_event;

  if v_status = 'completed' then
    insert into public.game_records (
      run_id, user_id, player_name, start_title, target_title, elapsed_seconds,
      click_count, path_titles, start_page_id, target_page_id, start_revision_id,
      target_revision_id, result_status
    ) values (
      p_run_id, v_user_id, coalesce((select nickname from public.profiles where id = v_user_id), 'Player'),
      v_run.start_title_snapshot, v_run.target_title_snapshot,
      greatest(0, floor(extract(epoch from ((case when v_run.timing_contract='single_reserved_prefetch_v1' then clock_timestamp() else now() end) - v_run.started_at)))::integer),
      v_move_count, v_run.path_title_snapshots, v_run.start_page_id, v_run.target_page_id,
      v_run.start_revision_id, v_run.target_revision_id, 'completed'
    ) on conflict (run_id) where run_id is not null do nothing;
  end if;

  v_response := private.single_run_response(true, 'APPLIED', v_run, v_event);
  insert into public.game_mutation_requests(scope, game_id, actor_user_id, request_id, operation, response)
  values ('single', p_run_id, v_user_id, p_request_id, 'apply_single_move_v2', v_response);
  return v_response;
end;
$$;

create or replace function public.apply_guest_single_move_v2(
  p_run_id uuid,
  p_guest_token_hash text,
  p_request_id uuid,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_to_page_id text default null,
  p_clicked_raw_title text default null,
  p_event_type text default 'NORMAL_LINK'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.single_game_runs;
  v_event public.game_move_events;
  v_link public.wiki_snapshot_links;
  v_previous public.game_move_events;
  v_from_id text;
  v_from_revision text;
  v_from_title text;
  v_to_id text := p_to_page_id;
  v_to_revision text;
  v_to_title text;
  v_delta integer := 1;
  v_move_count integer;
  v_version bigint;
  v_status text;
  v_undone_event_id uuid;
begin
  if p_run_id is null or p_request_id is null
    or p_guest_token_hash is null
    or p_guest_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'GUEST_RUN_IDENTITY_REQUIRED';
  end if;

  select * into v_run
  from public.single_game_runs
  where id = p_run_id
    and user_id is null
    and guest_token_hash = p_guest_token_hash
  for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if v_run.timing_contract='single_reserved_prefetch_v1' then
    v_run:=private.resolve_single_start_v1(v_run.id);
  end if;

  -- The run lock is deliberately before this read so concurrent duplicate
  -- request_id calls cannot both pass idempotency and race the event insert.
  select * into v_event
  from public.game_move_events
  where scope = 'single' and game_id = p_run_id
    and actor_user_id is null and request_id = p_request_id
  limit 1;
  if found then return private.single_run_response(true, 'ALREADY_APPLIED', v_run, v_event); end if;

  if v_run.expires_at <= now() and v_run.status = 'active' then
    update public.single_game_runs
    set status = 'expired', updated_at = now()
    where id = v_run.id returning * into v_run;
  end if;
  if v_run.status <> 'active' then
    return private.single_run_response(false, 'RUN_NOT_ACTIVE', v_run);
  end if;
  if p_expected_version is distinct from v_run.state_version then
    return private.single_run_response(false, 'STATE_VERSION_CONFLICT', v_run);
  end if;

  v_from_id := v_run.current_page_id;
  v_from_revision := v_run.current_revision_id;
  v_from_title := v_run.current_title_snapshot;

  if p_event_type = 'UNDO' then
    select candidate.* into v_previous
    from public.game_move_events candidate
    where candidate.scope = 'single' and candidate.game_id = p_run_id
      and candidate.actor_user_id is null
      and candidate.event_type <> 'UNDO'
      and not exists (
        select 1 from public.game_move_events undo_event
        where undo_event.scope = 'single'
          and undo_event.game_id = p_run_id
          and undo_event.actor_user_id is null
          and undo_event.undone_event_id = candidate.id
      )
    order by candidate.server_timestamp desc, candidate.id desc limit 1;
    if not found or array_length(v_run.path_page_ids, 1) < 2 then
      return private.single_run_response(false, 'UNDO_UNAVAILABLE', v_run);
    end if;
    v_to_id := v_previous.from_page_id;
    v_to_revision := v_previous.from_revision_id;
    v_to_title := v_previous.from_title_snapshot;
    v_delta := case when v_previous.event_type = 'FORCED_LINK' then -1 else 1 end;
    v_undone_event_id := v_previous.id;
  elsif p_event_type in ('NORMAL_LINK', 'FORCED_LINK', 'RANDOM_TELEPORT') then
    if p_event_type = 'NORMAL_LINK' then
      select link.* into v_link
      from public.wiki_page_snapshots snapshot
      join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
      where snapshot.page_id = v_run.current_page_id
        and snapshot.revision_id = v_run.current_revision_id
        and link.target_page_id = p_to_page_id
      limit 1;
      if not found then return private.single_run_response(false, 'LINK_NOT_ALLOWED', v_run); end if;
    else
      select link.* into v_link
      from public.wiki_page_snapshots snapshot
      join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
      where snapshot.page_id = v_run.current_page_id
        and snapshot.revision_id = v_run.current_revision_id
        and link.target_page_id not in (v_run.current_page_id, v_run.target_page_id)
      order by md5(link.target_page_id || p_request_id::text)
      limit 1;
      if not found then return private.single_run_response(false, 'LINK_SNAPSHOT_MISSING', v_run); end if;
    end if;
    v_to_id := v_link.target_page_id;
    v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id);
    v_to_title := v_link.target_title_snapshot;
    if v_to_revision is null then return private.single_run_response(false, 'LINK_SNAPSHOT_MISSING', v_run); end if;
    if v_to_id = v_run.target_page_id and p_event_type <> 'NORMAL_LINK' then
      return private.single_run_response(false, 'TARGET_DIRECT_MOVE_BLOCKED', v_run);
    end if;
  else
    raise exception 'UNSUPPORTED_EVENT_TYPE';
  end if;

  if nullif(v_to_id, '') is null or nullif(v_to_title, '') is null then
    return private.single_run_response(false, 'MOVE_TARGET_REQUIRED', v_run);
  end if;

  v_version := v_run.state_version + 1;
  v_move_count := greatest(0, v_run.move_count + v_delta);
  v_status := case when v_to_id = v_run.target_page_id then 'completed' else 'active' end;
  if p_event_type = 'UNDO' then
    v_run.path_page_ids := v_run.path_page_ids[1:greatest(1, array_length(v_run.path_page_ids, 1) - 1)];
    v_run.path_revision_ids := v_run.path_revision_ids[1:greatest(1, array_length(v_run.path_revision_ids, 1) - 1)];
    v_run.path_title_snapshots := v_run.path_title_snapshots[1:greatest(1, array_length(v_run.path_title_snapshots, 1) - 1)];
  else
    v_run.path_page_ids := array_append(v_run.path_page_ids, v_to_id);
    v_run.path_revision_ids := array_append(v_run.path_revision_ids, coalesce(v_to_revision, ''));
    v_run.path_title_snapshots := array_append(v_run.path_title_snapshots, v_to_title);
  end if;

  update public.single_game_runs set
    status = v_status,
    current_page_id = v_to_id,
    current_revision_id = coalesce(v_to_revision, current_revision_id),
    current_title_snapshot = v_to_title,
    move_count = v_move_count,
    state_version = v_version,
    path_page_ids = v_run.path_page_ids,
    path_revision_ids = v_run.path_revision_ids,
    path_title_snapshots = v_run.path_title_snapshots,
    finished_at = case when v_status = 'completed' then (case when v_run.timing_contract='single_reserved_prefetch_v1' then clock_timestamp() else now() end) else null end,
    last_seen_at = now(), updated_at = now()
  where id = v_run.id returning * into v_run;

  insert into public.game_move_events(
    scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id,
    event_type, from_page_id, from_revision_id, from_title_snapshot,
    to_page_id, to_revision_id, to_title_snapshot, clicked_raw_title,
    move_delta, move_count_after, version_before, version_after, undone_event_id, metadata
  ) values (
    'single', p_run_id, null, null, p_request_id,
    coalesce(p_correlation_id, p_request_id), p_event_type,
    v_from_id, v_from_revision, v_from_title, v_to_id, v_to_revision, v_to_title,
    p_clicked_raw_title, v_delta, v_move_count, v_version - 1, v_version,
    v_undone_event_id, jsonb_build_object('status', v_status)
  ) returning * into v_event;

  return private.single_run_response(true, 'APPLIED', v_run, v_event);
end;
$$;

create or replace function public.leave_single_game_run(p_run_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.single_game_runs;
  v_response jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_run from public.single_game_runs where id = p_run_id and user_id = v_user_id for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if v_run.timing_contract='single_reserved_prefetch_v1' then
    v_run:=private.resolve_single_start_v1(v_run.id);
  end if;
  select response into v_response from public.game_mutation_requests
  where scope = 'single' and game_id = p_run_id and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;
  if v_run.timing_contract='single_reserved_prefetch_v1' and v_run.status in ('prepared','scheduled') then
    update public.single_game_runs set status='abandoned',finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_run.id returning * into v_run;
  end if;
  if v_run.status = 'active' then
    update public.single_game_runs set status = 'abandoned', finished_at = now(), updated_at = now()
    where id = p_run_id returning * into v_run;
  end if;
  v_response := jsonb_build_object('ok', true, 'code', 'ABANDONED', 'run', to_jsonb(v_run));
  insert into public.game_mutation_requests(scope, game_id, actor_user_id, request_id, operation, response)
  values ('single', p_run_id, v_user_id, p_request_id, 'leave_single_game_run', v_response);
  return v_response;
end;
$$;

commit;
