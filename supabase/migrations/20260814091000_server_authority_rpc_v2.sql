-- Wiki Race 2.0 authoritative mutation RPCs.
-- This migration is additive and leaves the existing group lifecycle functions intact.

begin;

-- The pre-V2 group lifecycle constraint did not include the duel-only
-- disconnect outcome. Extend it here without modifying the legacy migration.
alter table public.game_rooms drop constraint if exists game_rooms_finished_reason_check;
alter table public.game_rooms
  add constraint game_rooms_finished_reason_check
  check (finished_reason is null or finished_reason = any (
    array['all_resolved', 'time_limit', 'grace_timeout', 'cancelled', 'forfeit', 'normal_finish']::text[]
  ));

create table if not exists public.single_game_runs (
  id uuid primary key,
  user_id uuid,
  guest_token_hash text,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned', 'expired')),
  start_page_id text not null,
  start_revision_id text not null,
  start_title_snapshot text not null,
  target_page_id text not null,
  target_revision_id text,
  target_title_snapshot text not null,
  current_page_id text not null,
  current_revision_id text not null,
  current_title_snapshot text not null,
  move_count integer not null default 0 check (move_count >= 0),
  state_version bigint not null default 0 check (state_version >= 0),
  path_page_ids text[] not null default '{}',
  path_revision_ids text[] not null default '{}',
  path_title_snapshots text[] not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is null) <> (guest_token_hash is null))
);

create index if not exists single_game_runs_user_status_idx
  on public.single_game_runs (user_id, status, updated_at desc);
create index if not exists single_game_runs_guest_hash_idx
  on public.single_game_runs (guest_token_hash, status, expires_at);

alter table public.room_players
  add column if not exists submitted_target_page_id text,
  add column if not exists submitted_target_revision_id text;

alter table public.game_rooms
  add column if not exists winner_user_id uuid;

alter table public.single_game_runs enable row level security;
revoke all on table public.single_game_runs from anon, authenticated;
grant select on table public.single_game_runs to authenticated;
drop policy if exists "Users can read own single runs" on public.single_game_runs;
create policy "Users can read own single runs"
on public.single_game_runs
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.single_run_response(
  p_ok boolean,
  p_code text,
  p_run public.single_game_runs,
  p_event public.game_move_events default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'ok', p_ok,
    'code', p_code,
    'run', case when p_run is null then null else to_jsonb(p_run) end,
    'event', case when p_event is null then null else to_jsonb(p_event) end
  );
end;
$$;

create or replace function public.create_single_game_run(
  p_run_id uuid,
  p_start_page_id text,
  p_start_revision_id text,
  p_start_title_snapshot text,
  p_target_page_id text,
  p_target_revision_id text,
  p_target_title_snapshot text
)
returns public.single_game_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.single_game_runs;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_run_id is null or nullif(p_start_page_id, '') is null or nullif(p_target_page_id, '') is null then
    raise exception 'RUN_IDENTITY_REQUIRED';
  end if;
  insert into public.single_game_runs (
    id, user_id, start_page_id, start_revision_id, start_title_snapshot,
    target_page_id, target_revision_id, target_title_snapshot,
    current_page_id, current_revision_id, current_title_snapshot,
    path_page_ids, path_revision_ids, path_title_snapshots
  ) values (
    p_run_id, v_user_id, p_start_page_id, p_start_revision_id, p_start_title_snapshot,
    p_target_page_id, p_target_revision_id, p_target_title_snapshot,
    p_start_page_id, p_start_revision_id, p_start_title_snapshot,
    array[p_start_page_id], array[p_start_revision_id], array[p_start_title_snapshot]
  )
  on conflict (id) do nothing
  returning * into v_run;
  if not found then
    select * into v_run from public.single_game_runs
    where id = p_run_id and user_id = v_user_id;
    if not found then raise exception 'RUN_ID_IN_USE'; end if;
  end if;
  return v_run;
end;
$$;

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
    finished_at = case when v_status = 'completed' then now() else null end,
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
      greatest(0, floor(extract(epoch from (now() - v_run.started_at)))::integer),
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

-- Guest movement uses the token hash as the only identity and performs
-- validation, projection, event append, and completion in this one DB
-- transaction. The raw token never reaches Postgres or event metadata.
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
    finished_at = case when v_status = 'completed' then now() else null end,
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
  select response into v_response from public.game_mutation_requests
  where scope = 'single' and game_id = p_run_id and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;
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

-- Group target identity is submitted with the title so the selected canonical page is stored once.
create or replace function public.submit_group_target_v2(
  p_room_id uuid,
  p_submitted_keyword text,
  p_submitted_target_title text,
  p_submitted_target_page_id text,
  p_submitted_target_revision_id text
)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_player public.room_players;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(p_submitted_target_title), '') is null or nullif(p_submitted_target_page_id, '') is null then
    raise exception 'TARGET_IDENTITY_REQUIRED';
  end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'group' or v_room.status <> 'waiting' then
    raise exception 'GROUP_ROOM_NOT_WAITING';
  end if;
  update public.room_players set
    submitted_keyword = coalesce(nullif(trim(p_submitted_keyword), ''), trim(p_submitted_target_title)),
    submitted_target_title = trim(p_submitted_target_title),
    submitted_target_page_id = p_submitted_target_page_id,
    submitted_target_revision_id = p_submitted_target_revision_id,
    progress_version = progress_version + 1,
    updated_at = now()
  where room_id = p_room_id and user_id = v_user_id and player_status = 'waiting'
  returning * into v_player;
  if not found then raise exception 'WAITING_PLAYER_NOT_FOUND'; end if;
  update public.game_rooms set state_version = state_version + 1 where id = p_room_id;
  return v_player;
end;
$$;

-- Replace only the group start projection to carry canonical identities forward.
create or replace function public.start_group_room_game_v2(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_start public.room_players;
  v_target public.room_players;
  v_count integer;
  v_total integer;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'HOST_REQUIRED'; end if;
  if v_room.mode <> 'group' or v_room.status <> 'waiting' then raise exception 'GROUP_ROOM_NOT_WAITING'; end if;
  select count(*) into v_total from public.room_players where room_id = p_room_id;
  if v_total < v_room.min_players then raise exception 'GROUP_PLAYERS_NOT_READY'; end if;
  select count(*) into v_count from public.room_players where room_id = p_room_id and is_ready and submitted_target_page_id is not null;
  if v_count < v_room.min_players then raise exception 'GROUP_PLAYERS_NOT_READY'; end if;
  if v_count <> (select count(*) from public.room_players where room_id = p_room_id) then
    raise exception 'GROUP_ALL_PLAYERS_NOT_READY';
  end if;
  select * into v_start from public.room_players where room_id = p_room_id and submitted_target_page_id is not null order by random() limit 1;
  select * into v_target from public.room_players where room_id = p_room_id and submitted_target_page_id is not null and submitted_target_page_id <> v_start.submitted_target_page_id order by random() limit 1;
  if v_target.id is null then raise exception 'GROUP_TARGETS_NOT_DISTINCT'; end if;
  update public.game_rooms set
    status = 'starting', group_start_title = v_start.submitted_target_title, group_target_title = v_target.submitted_target_title,
    group_start_page_id = v_start.submitted_target_page_id, group_start_revision_id = v_start.submitted_target_revision_id,
    group_target_page_id = v_target.submitted_target_page_id, group_target_revision_id = v_target.submitted_target_revision_id,
    started_at = now(), game_starts_at = null, game_deadline_at = null, finished_at = null,
    finished_count = 0, winner_user_ids = '{}', finished_reason = null, state_version = state_version + 1
  where id = p_room_id returning * into v_room;
  update public.room_players set
    start_title = v_room.group_start_title, target_title = v_room.group_target_title,
    start_page_id = v_room.group_start_page_id, start_revision_id = v_room.group_start_revision_id,
    target_page_id = v_room.group_target_page_id, target_revision_id = v_room.group_target_revision_id,
    current_title = v_room.group_start_title, current_page_id = v_room.group_start_page_id,
    current_revision_id = v_room.group_start_revision_id, move_count = 0, progress_version = 1,
    has_finished = false, finished_at = null, rank = null, elapsed_seconds = null,
    path_titles = array[v_room.group_start_title], path_page_ids = array[v_room.group_start_page_id],
    path_revision_ids = array[v_room.group_start_revision_id], player_status = 'waiting',
    retired_at = null, retire_reason = null, disconnected_at = null, updated_at = now()
  where room_id = p_room_id;
  return v_room;
end;
$$;

-- The typo-safe wrapper is kept separate so old clients can continue using the old start RPC.
create or replace function public.start_group_room_game_v2_safe(p_room_id uuid)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$ begin return public.start_group_room_game_v2(p_room_id); end; $$;

create or replace function public.apply_group_move_v2(
  p_room_id uuid,
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
  v_room public.game_rooms;
  v_player public.room_players;
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
  v_version bigint;
  v_move_count integer;
  v_status text := 'playing';
  v_rank integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id and mode = 'group' for update;
  if not found then raise exception 'GROUP_ROOM_NOT_FOUND'; end if;
  select response into v_response from public.game_mutation_requests
  where scope = 'group' and game_id = p_room_id and actor_user_id = v_user_id and request_id = p_request_id;
  if v_response is not null then return v_response; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = v_user_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_room.status not in ('playing', 'grace_period') or v_player.player_status <> 'playing' then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player));
  end if;
  if p_expected_version is distinct from v_player.progress_version then
    return jsonb_build_object('ok', false, 'code', 'STATE_VERSION_CONFLICT', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player));
  end if;
  v_from_id := v_player.current_page_id;
  v_from_revision := v_player.current_revision_id;
  v_from_title := v_player.current_title;
  if p_event_type = 'UNDO' then
    select candidate.* into v_previous
    from public.game_move_events candidate
    where candidate.scope = 'group' and candidate.game_id = p_room_id
      and candidate.actor_user_id = v_user_id
      and candidate.event_type <> 'UNDO'
      and not exists (
        select 1 from public.game_move_events undo_event
        where undo_event.scope = 'group'
          and undo_event.game_id = p_room_id
          and undo_event.actor_user_id = v_user_id
          and undo_event.undone_event_id = candidate.id
      )
    order by candidate.server_timestamp desc, candidate.id desc limit 1;
    if not found or array_length(v_player.path_page_ids, 1) < 2 then
      return jsonb_build_object('ok', false, 'code', 'UNDO_UNAVAILABLE', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player));
    end if;
    v_to_id := v_previous.from_page_id; v_to_revision := v_previous.from_revision_id; v_to_title := v_previous.from_title_snapshot;
    v_delta := case when v_previous.event_type = 'FORCED_LINK' then -1 else 1 end;
    p_undone_event_id := v_previous.id;
  elsif p_event_type in ('NORMAL_LINK', 'FORCED_LINK', 'RANDOM_TELEPORT') then
    if p_event_type = 'NORMAL_LINK' then
      select link.* into v_link from public.wiki_page_snapshots snapshot join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
      where snapshot.page_id = v_player.current_page_id and snapshot.revision_id = v_player.current_revision_id and link.target_page_id = p_to_page_id limit 1;
      if not found then return jsonb_build_object('ok', false, 'code', 'LINK_NOT_ALLOWED', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
      v_to_id := v_link.target_page_id;
      v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id);
      v_to_title := v_link.target_title_snapshot;
      if v_to_revision is null then return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
    else
      select link.* into v_link from public.wiki_page_snapshots snapshot join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
      where snapshot.page_id = v_player.current_page_id and snapshot.revision_id = v_player.current_revision_id
        and link.target_page_id not in (v_player.current_page_id, v_player.target_page_id)
      order by md5(link.target_page_id || p_request_id::text) limit 1;
      if not found then return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
      v_to_id := v_link.target_page_id; v_to_revision := private.resolve_wiki_revision(v_link.target_page_id, v_link.target_revision_id); v_to_title := v_link.target_title_snapshot;
      if v_to_revision is null then return jsonb_build_object('ok', false, 'code', 'LINK_SNAPSHOT_MISSING', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player)); end if;
    end if;
  else raise exception 'UNSUPPORTED_EVENT_TYPE'; end if;
  if nullif(v_to_id, '') is null or nullif(v_to_title, '') is null then raise exception 'MOVE_TARGET_REQUIRED'; end if;
  v_version := v_player.progress_version + 1;
  v_move_count := greatest(0, v_player.move_count + v_delta);
  if p_event_type = 'UNDO' then
    v_player.path_page_ids := v_player.path_page_ids[1:greatest(1, array_length(v_player.path_page_ids, 1) - 1)];
    v_player.path_revision_ids := v_player.path_revision_ids[1:greatest(1, array_length(v_player.path_revision_ids, 1) - 1)];
    v_player.path_titles := v_player.path_titles[1:greatest(1, array_length(v_player.path_titles, 1) - 1)];
  else
    v_player.path_page_ids := array_append(v_player.path_page_ids, v_to_id);
    v_player.path_revision_ids := array_append(v_player.path_revision_ids, coalesce(v_to_revision, ''));
    v_player.path_titles := array_append(v_player.path_titles, v_to_title);
  end if;
  if v_to_id = v_player.target_page_id then
    select count(*) + 1 into v_rank from public.room_players where room_id = p_room_id and player_status = 'finished';
    v_status := 'finished';
  end if;
  update public.room_players set
    current_page_id = v_to_id, current_revision_id = coalesce(v_to_revision, current_revision_id), current_title = v_to_title,
    move_count = v_move_count, progress_version = v_version, path_page_ids = v_player.path_page_ids,
    path_revision_ids = v_player.path_revision_ids, path_titles = v_player.path_titles,
    player_status = v_status, has_finished = (v_status = 'finished'), finished_at = case when v_status = 'finished' then v_now else null end,
    rank = case when v_status = 'finished' then v_rank else null end, elapsed_seconds = case when v_status = 'finished' then greatest(0, floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer) else null end,
    updated_at = v_now, last_seen_at = v_now, heartbeat_at = v_now
  where id = v_player.id returning * into v_player;
  update public.game_rooms set state_version = state_version + 1, finished_count = (select count(*) from public.room_players where room_id = p_room_id and player_status = 'finished') where id = p_room_id returning * into v_room;
  insert into public.game_move_events (
    scope, game_id, actor_user_id, affected_user_id, request_id, correlation_id, event_type, from_page_id, from_revision_id, from_title_snapshot,
    to_page_id, to_revision_id, to_title_snapshot, clicked_raw_title, move_delta, move_count_after, version_before, version_after, item_event_id, undone_event_id,
    metadata
  ) values (
    'group', p_room_id, v_user_id, v_user_id, p_request_id, coalesce(p_correlation_id, p_request_id), p_event_type, v_from_id, v_from_revision, v_from_title,
    v_to_id, v_to_revision, v_to_title, p_clicked_raw_title, v_delta, v_move_count, v_version - 1, v_version, p_item_event_id, p_undone_event_id,
    jsonb_build_object('room_state_version', v_room.state_version, 'status', v_status)
  ) returning * into v_previous;
  if v_status = 'finished' then
    insert into public.group_match_results (
      room_id, user_id, nickname_snapshot, profile_image_snapshot, result_status, rank, is_winner, start_title, target_title, current_title,
      move_count, elapsed_seconds, path_titles, finished_at, finalized_at
    ) values (
      p_room_id, v_user_id, v_player.nickname_snapshot, v_player.profile_image_snapshot, 'finished', v_rank,
      v_rank <= v_room.finish_rank_limit, v_player.start_title, v_player.target_title, v_player.current_title, v_player.move_count,
      v_player.elapsed_seconds, v_player.path_titles, v_now, v_now
    ) on conflict (room_id, user_id) do update set result_status = 'finished', rank = excluded.rank, is_winner = excluded.is_winner,
      current_title = excluded.current_title, move_count = excluded.move_count, elapsed_seconds = excluded.elapsed_seconds,
      path_titles = excluded.path_titles, finished_at = excluded.finished_at, finalized_at = excluded.finalized_at
      where public.group_match_results.result_status <> 'finished';
    if v_rank = v_room.finish_rank_limit and v_room.status = 'playing' then
      update public.game_rooms set status = 'grace_period', grace_started_at = v_now,
        grace_ends_at = least(v_now + (grace_duration_seconds * interval '1 second'), game_deadline_at), state_version = state_version + 1
      where id = p_room_id returning * into v_room;
    end if;
  end if;
  if not exists (select 1 from public.room_players where room_id = p_room_id and player_status not in ('finished', 'retired')) then
    update public.game_rooms set status = 'finished', finished_at = v_now, finished_reason = 'all_resolved', state_version = state_version + 1,
      winner_user_ids = (select coalesce(array_agg(user_id order by rank) filter (where rank <= finish_rank_limit), '{}') from public.room_players where room_id = p_room_id)
    where id = p_room_id returning * into v_room;
    perform private.sync_group_records(p_room_id);
  end if;
  v_response := jsonb_build_object('ok', true, 'code', 'APPLIED', 'room', to_jsonb(v_room), 'player', to_jsonb(v_player), 'event', to_jsonb(v_previous));
  insert into public.game_mutation_requests(scope, game_id, actor_user_id, request_id, operation, response)
  values ('group', p_room_id, v_user_id, p_request_id, 'apply_group_move_v2', v_response);
  return v_response;
end;
$$;

-- Duel target/start/progress lifecycle. Existing lobby rows remain readable during cutover.
create or replace function public.set_duel_target_v2(p_room_id uuid, p_target_title text, p_target_page_id text, p_target_revision_id text, p_is_ready boolean)
returns public.room_players
language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms; v_player public.room_players;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(p_target_title), '') is null or nullif(p_target_page_id, '') is null then
    raise exception 'TARGET_IDENTITY_REQUIRED';
  end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'duel' or v_room.status <> 'waiting' then
    raise exception 'DUEL_ROOM_NOT_WAITING';
  end if;
  update public.room_players set target_title = nullif(trim(p_target_title), ''), target_page_id = p_target_page_id,
    target_revision_id = p_target_revision_id, is_ready = p_is_ready,
    progress_version = progress_version + 1, updated_at = now()
  where room_id = p_room_id and user_id = auth.uid() and player_status = 'waiting' returning * into v_player;
  if not found then raise exception 'DUEL_PLAYER_NOT_WAITING'; end if;
  update public.game_rooms set state_version = state_version + 1 where id = p_room_id;
  return v_player;
end;
$$;

create or replace function public.start_duel_room_v2(p_room_id uuid)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_count integer;
  v_total integer;
  v_start public.wiki_page_snapshots;
  v_target public.room_players;
  v_target_revision_id text;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.mode <> 'duel' or v_room.status <> 'waiting' then raise exception 'DUEL_ROOM_NOT_WAITING'; end if;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'HOST_REQUIRED'; end if;
  select count(*) into v_total from public.room_players where room_id = p_room_id;
  if v_total <> 2 then raise exception 'DUEL_PARTICIPANTS_REQUIRED'; end if;
  select count(*) into v_count from public.room_players where room_id = p_room_id and is_ready and target_page_id is not null;
  if v_count <> 2 then raise exception 'DUEL_PLAYERS_NOT_READY'; end if;
  if (select count(distinct target_page_id) from public.room_players where room_id = p_room_id) <> 1 then
    raise exception 'DUEL_TARGETS_MUST_MATCH';
  end if;
  select * into v_target
  from public.room_players
  where room_id = p_room_id
  order by user_id
  limit 1;
  v_target_revision_id := private.resolve_wiki_revision(v_target.target_page_id, v_target.target_revision_id);
  if v_target_revision_id is null then raise exception 'DUEL_TARGET_SNAPSHOT_REQUIRED'; end if;
  select snapshot.* into v_start
  from public.wiki_page_snapshots snapshot
  where snapshot.page_id not in (
    select target_page_id from public.room_players where room_id = p_room_id
  )
  order by md5(snapshot.page_id || p_room_id::text)
  limit 1;
  if not found then raise exception 'DUEL_START_SNAPSHOT_REQUIRED'; end if;
  update public.game_rooms set
    status = 'starting', started_at = now(), game_starts_at = null,
    duel_start_page_id = v_start.page_id, duel_start_revision_id = v_start.revision_id,
    duel_start_title = v_start.canonical_title_snapshot, state_version = state_version + 1
  where id = p_room_id returning * into v_room;
  update public.room_players set
    target_title = v_target.target_title,
    target_page_id = v_target.target_page_id,
    target_revision_id = v_target_revision_id,
    progress_version = progress_version + 1,
    updated_at = now()
  where room_id = p_room_id;
  return v_room;
end;
$$;

create or replace function public.initialize_duel_player_v2(p_room_id uuid, p_start_title text, p_start_page_id text, p_start_revision_id text)
returns public.room_players
language plpgsql security definer set search_path = ''
as $$
declare v_player public.room_players; v_room public.game_rooms; v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'duel' or v_room.status not in ('starting', 'playing') then raise exception 'DUEL_NOT_STARTING'; end if;
  if nullif(v_room.duel_start_page_id, '') is null or nullif(v_room.duel_start_revision_id, '') is null then
    raise exception 'DUEL_START_SNAPSHOT_REQUIRED';
  end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_player.start_page_id is not null and v_player.current_page_id is not null
    and v_player.player_status in ('playing', 'finished') then
    return v_player;
  end if;
  update public.room_players set start_title = v_room.duel_start_title, start_page_id = v_room.duel_start_page_id, start_revision_id = v_room.duel_start_revision_id,
    current_title = v_room.duel_start_title, current_page_id = v_room.duel_start_page_id, current_revision_id = v_room.duel_start_revision_id,
    move_count = 0, progress_version = progress_version + 1, path_titles = array[v_room.duel_start_title], path_page_ids = array[v_room.duel_start_page_id], path_revision_ids = array[v_room.duel_start_revision_id],
    player_status = 'playing', heartbeat_at = now(), last_seen_at = now(), updated_at = now()
  where id = v_player.id returning * into v_player;
  select count(*) into v_count from public.room_players where room_id = p_room_id and start_page_id is not null;
  if v_count = 2 then update public.game_rooms set status = 'playing', game_starts_at = coalesce(game_starts_at, now()), state_version = state_version + 1 where id = p_room_id returning * into v_room; end if;
  return v_player;
end;
$$;

create or replace function public.heartbeat_duel_v2(p_room_id uuid)
returns public.room_players
language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms; v_player public.room_players;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.mode <> 'duel' or v_room.status <> 'playing' then raise exception 'DUEL_NOT_PLAYING'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_player.player_status not in ('playing', 'disconnected') then raise exception 'DUEL_PLAYER_NOT_ACTIVE'; end if;
  update public.room_players set
    heartbeat_at = now(), last_seen_at = now(), disconnected_at = null,
    player_status = case when player_status = 'disconnected' then 'playing' else player_status end,
    progress_version = progress_version + 1,
    updated_at = now()
  where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;

create or replace function public.finalize_duel_if_expired(p_room_id uuid)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare v_room public.game_rooms; v_expired uuid[]; v_live uuid[]; v_now timestamptz := now(); v_winner uuid;
begin
  if auth.uid() is null and auth.role() <> 'service_role' then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.game_rooms where id = p_room_id and mode = 'duel' for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.room_players where room_id = p_room_id and user_id = auth.uid()
  ) then raise exception 'NOT_A_PARTICIPANT'; end if;
  if v_room.status = 'finished' then return v_room; end if;
  if v_room.status <> 'playing' then raise exception 'DUEL_NOT_PLAYING'; end if;
  if (select count(*) from public.room_players where room_id = p_room_id) <> 2 then
    raise exception 'DUEL_PARTICIPANTS_REQUIRED';
  end if;
  select coalesce(array_agg(user_id) filter (where heartbeat_at is null or heartbeat_at < v_now - (v_room.reconnect_deadline_seconds * interval '1 second')), '{}') into v_expired from public.room_players where room_id = p_room_id and player_status in ('playing','disconnected');
  select coalesce(array_agg(user_id) filter (where not (user_id = any(v_expired))), '{}') into v_live from public.room_players where room_id = p_room_id and player_status in ('playing','disconnected');
  if cardinality(v_expired) = 0 then return v_room; end if;
  if cardinality(v_expired) = 1 and cardinality(v_live) = 1 then
    v_winner := v_live[1];
    update public.room_players set player_status = 'retired', retired_at = v_now, retire_reason = 'disconnected_timeout', progress_version = progress_version + 1, updated_at = v_now where room_id = p_room_id and user_id = any(v_expired);
    update public.game_rooms set status = 'finished', finished_at = v_now, finished_reason = 'forfeit', winner_user_id = v_winner, state_version = state_version + 1 where id = p_room_id returning * into v_room;
    insert into public.match_history(room_id, winner_user_id, loser_user_id, duration_seconds, result_status, result_reason, finalized_at)
    values (p_room_id, v_winner, v_expired[1], greatest(0, floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer), 'forfeit', 'disconnect_forfeit', v_now) on conflict (room_id) do nothing;
  elsif cardinality(v_expired) >= 2 then
    update public.room_players set player_status = 'retired', retired_at = v_now, retire_reason = 'disconnected_timeout', progress_version = progress_version + 1, updated_at = v_now where room_id = p_room_id and user_id = any(v_expired);
    update public.game_rooms set status = 'finished', finished_at = v_now, finished_reason = 'cancelled', state_version = state_version + 1 where id = p_room_id returning * into v_room;
    insert into public.match_history(room_id, duration_seconds, result_status, result_reason, finalized_at)
    values (p_room_id, greatest(0, floor(extract(epoch from (v_now - v_room.game_starts_at)))::integer), 'cancelled', 'disconnect_cancelled', v_now) on conflict (room_id) do nothing;
  end if;
  return v_room;
end;
$$;

-- Permissions: browser writes are routed through SECURITY DEFINER RPCs.
revoke all on function public.create_single_game_run(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_single_game_run(uuid, text, text, text, text, text, text) to authenticated, service_role;
revoke all on function public.get_single_game_run(uuid) from public, anon;
grant execute on function public.get_single_game_run(uuid) to authenticated, service_role;
revoke all on function public.apply_single_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.apply_single_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid) to authenticated, service_role;
revoke all on function public.apply_guest_single_move_v2(uuid, text, uuid, uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_guest_single_move_v2(uuid, text, uuid, uuid, bigint, text, text, text) to service_role;
revoke all on function public.leave_single_game_run(uuid, uuid) from public, anon;
grant execute on function public.leave_single_game_run(uuid, uuid) to authenticated, service_role;
revoke all on function public.submit_group_target_v2(uuid, text, text, text, text) from public, anon;
grant execute on function public.submit_group_target_v2(uuid, text, text, text, text) to authenticated, service_role;
revoke all on function public.start_group_room_game_v2(uuid) from public, anon;
grant execute on function public.start_group_room_game_v2(uuid) to authenticated, service_role;
revoke all on function public.start_group_room_game_v2_safe(uuid) from public, anon;
grant execute on function public.start_group_room_game_v2_safe(uuid) to authenticated, service_role;
revoke all on function public.apply_group_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.apply_group_move_v2(uuid, uuid, uuid, bigint, text, text, text, text, text, uuid, uuid) to authenticated, service_role;
revoke all on function public.set_duel_target_v2(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.set_duel_target_v2(uuid, text, text, text, boolean) to authenticated, service_role;
revoke all on function public.start_duel_room_v2(uuid) from public, anon;
grant execute on function public.start_duel_room_v2(uuid) to authenticated, service_role;
revoke all on function public.initialize_duel_player_v2(uuid, text, text, text) from public, anon;
grant execute on function public.initialize_duel_player_v2(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.heartbeat_duel_v2(uuid) from public, anon;
grant execute on function public.heartbeat_duel_v2(uuid) to authenticated, service_role;
revoke all on function public.finalize_duel_if_expired(uuid) from public, anon;
grant execute on function public.finalize_duel_if_expired(uuid) to authenticated, service_role;

commit;
