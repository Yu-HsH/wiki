-- Forward-only: existing runs/results/rewards remain untouched.
begin;
create or replace function private.validate_daily_course_identity_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Coordinate course creation/repair with legacy, member and guest INSERTs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('daily-course:' ||
    ((now() at time zone 'Asia/Seoul')::date)::text, 0));
  if new.run_mode = 'daily' and not exists (
    select 1 from public.daily_challenges c
    join public.wiki_pages s on s.page_id = new.start_page_id
    join public.wiki_pages t on t.page_id = new.target_page_id
    join public.wiki_page_snapshots snap on snap.page_id = s.page_id
      and snap.revision_id = new.start_revision_id
    where c.challenge_date = (now() at time zone 'Asia/Seoul')::date
      and new.daily_challenge_date = c.challenge_date
      and private.normalize_wiki_title(s.canonical_title) = private.normalize_wiki_title(c.start_title)
      and private.normalize_wiki_title(snap.canonical_title_snapshot) = private.normalize_wiki_title(c.start_title)
      and private.normalize_wiki_title(new.start_title_snapshot) = private.normalize_wiki_title(c.start_title)
      and private.normalize_wiki_title(t.canonical_title) = private.normalize_wiki_title(c.target_title)
      and private.normalize_wiki_title(new.target_title_snapshot) = private.normalize_wiki_title(c.target_title)
  ) then raise exception 'DAILY_COURSE_MISMATCH'; end if;
  return new;
end;
$$;
revoke all on function private.validate_daily_course_identity_v2() from public, anon, authenticated;
create or replace trigger trg_validate_daily_course_identity_v2 before insert on public.single_game_runs
for each row execute function private.validate_daily_course_identity_v2();

-- wiki_pages is server-only (RLS has no reader policy), so this bounded read
-- needs definer authority. Only authenticated callers may read existing public
-- result fields; never return wiki snapshots or guest hashes. No mutation.
create or replace function private.daily_course_best_records_v2()
returns setof public.game_records language sql stable security definer set search_path = '' as $$
  with eligible as (
    select r.*, row_number() over (partition by r.user_id
      order by r.elapsed_seconds, r.click_count, r.created_at, r.id) as personal_order
    from public.game_records r
    join public.daily_challenges c on c.challenge_date = r.daily_challenge_date
    join public.wiki_pages s on s.page_id = r.start_page_id
    join public.wiki_pages t on t.page_id = r.target_page_id
    where auth.uid() is not null
      and c.challenge_date = (now() at time zone 'Asia/Seoul')::date
      and r.run_mode = 'daily' and r.result_status = 'completed' and r.user_id is not null
      and lower(replace(btrim(s.canonical_title), '_', ' ')) = lower(replace(btrim(c.start_title), '_', ' '))
      and lower(replace(btrim(r.start_title), '_', ' ')) = lower(replace(btrim(c.start_title), '_', ' '))
      and lower(replace(btrim(t.canonical_title), '_', ' ')) = lower(replace(btrim(c.target_title), '_', ' '))
      and lower(replace(btrim(r.target_title), '_', ' ')) = lower(replace(btrim(c.target_title), '_', ' '))
  )
  select r.* from eligible e join public.game_records r on r.id = e.id
  where e.personal_order = 1
  order by r.elapsed_seconds, r.click_count, r.created_at, r.id
;
$$;
revoke all on function private.daily_course_best_records_v2() from public,anon,authenticated;
create or replace function public.get_daily_course_rankings_v2(p_limit integer default 50)
returns setof public.game_records language sql stable security definer set search_path = '' as $$
  select * from private.daily_course_best_records_v2()
  limit greatest(1,least(coalesce(p_limit,50),1000));
$$;
revoke all on function public.get_daily_course_rankings_v2(integer) from public, anon;
grant execute on function public.get_daily_course_rankings_v2(integer) to authenticated, service_role;
-- Validate forward XP eligibility too; never change old ledger entries.
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
      join public.wiki_pages s on s.page_id = v_record.start_page_id
      join public.wiki_pages t on t.page_id = v_record.target_page_id
     where challenge.challenge_date = v_day
       and private.normalize_wiki_title(challenge.start_title) = private.normalize_wiki_title(v_record.start_title)
       and private.normalize_wiki_title(challenge.start_title) = private.normalize_wiki_title(s.canonical_title)
       and private.normalize_wiki_title(challenge.target_title) = private.normalize_wiki_title(t.canonical_title)
       and private.normalize_wiki_title(challenge.target_title)
           = private.normalize_wiki_title(v_record.target_title)
  ) into v_is_daily;

  -- NULL is legacy: preserve the old daily inference without backfill/re-grant.
  if v_record.run_mode is not null then
    v_is_daily := v_is_daily and v_record.run_mode = 'daily';
    if v_record.run_mode = 'daily' and not v_is_daily then
      return jsonb_build_array(); -- Pre-fix mismatched active run: no official daily XP.
    end if;
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
