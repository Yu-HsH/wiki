-- Single exploration mode + server XP, forward-only. No legacy backfill or re-grant.
begin;
alter table public.single_game_runs
  add column run_mode text constraint single_game_runs_run_mode_v1_check check (run_mode in ('random', 'custom', 'daily')),
  add column daily_challenge_date date,
  add constraint single_run_daily_date_v1_check check (
    (run_mode is not distinct from 'daily' and daily_challenge_date is not null)
    or (run_mode is distinct from 'daily' and daily_challenge_date is null));
alter table public.game_records
  add column run_mode text constraint game_records_run_mode_v1_check check (run_mode in ('random', 'custom', 'daily')),
  add column daily_challenge_date date;

-- Keep the seven-argument RPC for old bundles; new clients call this overload.
create or replace function public.create_single_game_run(
  p_run_id uuid,
  p_start_page_id text,
  p_start_revision_id text,
  p_start_title_snapshot text,
  p_target_page_id text,
  p_target_revision_id text,
  p_target_title_snapshot text,
  p_run_mode text
)
returns public.single_game_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.single_game_runs;
  v_daily_date date;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_run_id is null or nullif(p_start_page_id, '') is null or nullif(p_target_page_id, '') is null then
    raise exception 'RUN_IDENTITY_REQUIRED';
  end if;
  -- A duplicate create never rewrites a mode (including a legacy NULL mode).
  select * into v_run from public.single_game_runs where id = p_run_id;
  if found then
    if v_run.user_id is distinct from v_user_id then raise exception 'RUN_ID_IN_USE'; end if;
    return v_run;
  end if;
  if p_run_mode is null or p_run_mode not in ('random', 'custom', 'daily') then
    raise exception 'RUN_MODE_REQUIRED';
  end if;
  if p_run_mode = 'daily' then
    v_daily_date := (now() at time zone 'Asia/Seoul')::date;
    if not exists (
      select 1 from public.daily_challenges c
      where c.challenge_date = v_daily_date
        and private.normalize_wiki_title(c.target_title) = private.normalize_wiki_title(p_target_title_snapshot)
        and exists (select 1 from public.wiki_pages p where p.page_id = p_target_page_id
          and private.normalize_wiki_title(p.canonical_title) = private.normalize_wiki_title(c.target_title))
    ) then raise exception 'DAILY_COURSE_MISMATCH'; end if;
  end if;
  insert into public.single_game_runs (
    id, user_id, run_mode, daily_challenge_date, start_page_id, start_revision_id, start_title_snapshot,
    target_page_id, target_revision_id, target_title_snapshot,
    current_page_id, current_revision_id, current_title_snapshot,
    path_page_ids, path_revision_ids, path_title_snapshots
  ) values (
    p_run_id, v_user_id, p_run_mode, v_daily_date, p_start_page_id, p_start_revision_id, p_start_title_snapshot,
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
revoke all on function public.create_single_game_run(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_single_game_run(uuid,text,text,text,text,text,text,text) to authenticated, service_role;

-- Copy before any AFTER INSERT XP/achievement trigger observes the result.
create or replace function private.copy_single_result_mode_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.run_id is not null then
    select run.run_mode, run.daily_challenge_date
      into new.run_mode, new.daily_challenge_date
      from public.single_game_runs run where run.id = new.run_id;
  else
    new.run_mode := null;
    new.daily_challenge_date := null;
  end if;
  return new;
end;
$$;
revoke all on function private.copy_single_result_mode_v1() from public, anon, authenticated;
create trigger trg_copy_single_result_mode_v1 before insert on public.game_records
for each row execute function private.copy_single_result_mode_v1();

create or replace function private.grant_single_result_xp_v1(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.game_records;
  v_day date;
  v_is_daily boolean;
  v_already boolean;
  v_source_type text;
  v_amount integer;
begin
  select * into v_record from public.game_records where id = p_record_id;
  if not found then
    return jsonb_build_array();
  end if;

  -- Guests never reach game_records; a null user is refused anyway (15 §2).
  if v_record.user_id is null or v_record.result_status <> 'completed' then
    return jsonb_build_array();
  end if;

  -- Serialise this player's "first" checks. grant_xp_v1 takes the same lock
  -- later in this transaction. A missing profile is left to grant_xp_v1, which
  -- answers AUTH_REQUIRED.
  perform 1 from public.profiles where id = v_record.user_id for update;

  -- Explicit daily runs carry their server-validated KST course date across F5
  -- and midnight. Legacy NULL modes retain the old completion-date boundary.
  v_day := coalesce(v_record.daily_challenge_date, (v_record.created_at at time zone 'Asia/Seoul')::date);

  select exists (
    select 1
      from public.daily_challenges challenge
     where challenge.challenge_date = v_day
       and private.normalize_wiki_title(challenge.target_title)
           = private.normalize_wiki_title(v_record.target_title)
  ) into v_is_daily;

  -- NULL is legacy: preserve the old daily inference without backfill/re-grant.
  if v_record.run_mode is not null then
    v_is_daily := v_record.run_mode = 'daily';
  end if;
  if v_record.run_mode = 'random' then
    v_source_type := 'single_random_finish';
    v_already := false; -- Spec restricts repeated custom courses, not random runs.
  elsif v_is_daily then
    v_source_type := 'daily_course_first_finish';
    select exists (
      select 1
        from public.xp_ledger ledger
        join public.game_records earlier on earlier.id = ledger.source_id
       where ledger.user_id = v_record.user_id
         and ledger.source_type = 'daily_course_first_finish'
         and ledger.source_id <> v_record.id
         and coalesce(earlier.daily_challenge_date, (earlier.created_at at time zone 'Asia/Seoul')::date) = v_day
    ) into v_already;
  else
    -- Spec §7.2: the same start and target pays only once.
    v_source_type := 'single_target_first_finish';
    select exists (
      select 1
        from public.xp_ledger ledger
        join public.game_records earlier on earlier.id = ledger.source_id
       where ledger.user_id = v_record.user_id
         and ledger.source_type = 'single_target_first_finish'
         and ledger.source_id <> v_record.id
         and earlier.start_page_id is not distinct from v_record.start_page_id
         and earlier.target_page_id is not distinct from v_record.target_page_id
    ) into v_already;
  end if;

  -- Not first: this completion is not that source at all, so no row (C2 §3 keeps
  -- 0-XP rows only for sources whose value is 0).
  if v_already then
    return jsonb_build_array();
  end if;

  v_amount := case v_source_type
    when 'single_random_finish' then 20
    when 'daily_course_first_finish' then 25
    else 15 end;
  return jsonb_build_array(private.try_grant_xp_v1(
    v_record.user_id,
    v_source_type,
    v_record.id,
    v_amount,
    v_amount,
    null
  ));
end;
$$;
revoke all on function private.grant_single_result_xp_v1(uuid) from public, anon, authenticated;
commit;
