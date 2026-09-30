-- Wiki Race 2.0 Track 15c-1: result finalizers pay XP through grant_xp_v1.
-- Forward-only additive migration. Historical migrations stay unchanged.
--
-- Requires 20260929090000_xp_total_v1.sql (the 15b grant_xp_v1). Apply that
-- file first.
--
-- Shape (user decisions, 2026-09-30):
--   No finalizer body is edited. Three AFTER triggers watch the rows every
--   finalizer already writes, so the seven-plus finish paths need no
--   create or replace, no drop, and no change to the frozen group functions
--   (docs/agent/TRACKS.md §2.1 — file freeze kept; the group runtime
--   exception is approved and checked by the full pgTAP suite).
--
--     game_records   AFTER INSERT          -> single  (apply_single_move_v2)
--     match_history  AFTER INSERT          -> duel    (apply_duel_move_v2,
--                                             private.apply_duel_move_internal_v3,
--                                             leave_duel_room_v2,
--                                             finalize_duel_if_expired)
--     game_rooms     AFTER UPDATE OF status -> group  (private.finish_group_room_v13,
--                                             private.finalize_group_room_v13)
--
--   Every `insert ... on conflict do nothing` in those paths writes no row on a
--   repeat, so the trigger does not fire either; xp_ledger_idempotent_uq is the
--   second guard (C2 §4).
--
-- Failure isolation (decision 7 — raise warning only):
--   A grant must never break a match. Each grant_xp_v1 call runs inside its own
--   exception block (a subtransaction), and each trigger wraps its whole
--   computation in another one. A failure rolls back only the XP work, raises a
--   WARNING, and the finish commits. public.grant_result_xp_v1 re-runs the same
--   computation for one result later; it is idempotent.
--
-- Single classification (decision 2 = (가), 3, 4):
--   single_game_runs has no server-decided mode, so random vs target-designated
--   cannot be told apart and a client-declared mode could be forged.
--     today's course (target matches daily_challenges on the KST date of the
--     completion)  -> daily_course_first_finish 25, first of that day only;
--                     never 15 as well (decision 3)
--     otherwise    -> single_target_first_finish 15, first per
--                     (start_page_id, target_page_id) only
--   single_random_finish 20 is not paid yet. Debt: resolved when run_mode is
--   decided by the server.
--   "First" is judged against the ledger under the player's profile row lock,
--   so it means "first paid", and history before this migration is not counted
--   (decision 6 — no retroactive grants).
--
-- Duel decay (decision 5): the same pair's matches on the KST date of this
-- match's finalization, cancelled excluded, forfeits included, this match
-- included. private.duel_decay_v1 is the SQL twin of utils/xpRules.js
-- applyDuelDecay; tests/xpResultGrants.test.js checks both against one table.
--
-- Data-loss DDL in this file: 0. No drop of existing objects, no rename, no type
-- change, no update or delete of existing rows.
--
-- Rollback:
--   drop trigger if exists trg_grant_single_result_xp on public.game_records;
--   drop trigger if exists trg_grant_duel_result_xp on public.match_history;
--   drop trigger if exists trg_grant_group_result_xp on public.game_rooms;
-- The functions can stay; nothing else calls them. Ledger rows already written
-- stay (append-only, C2 §4) and profiles.total_xp stays equal to their sum.

begin;

-- ---------------------------------------------------------------------------
-- 1. private.duel_decay_v1 — same-opponent daily decay (C2 §5, C2 §8-① floor).
-- ---------------------------------------------------------------------------
-- Mirrors applyDuelDecay: a non-finite or < 1 ordinal counts as 1, a negative
-- base counts as 0, 50% is integer division (= floor for non-negative bases),
-- and decay_reason is null whenever the amount did not change (so a base of 0
-- never carries a reason, which the ledger CHECK also requires).
create or replace function private.duel_decay_v1(
  p_base_amount integer,
  p_game_number integer
)
returns table (base_amount integer, amount integer, decay_reason text)
language sql
immutable
set search_path = ''
as $$
  with input as (
    select greatest(coalesce(p_base_amount, 0), 0) as base,
           greatest(coalesce(p_game_number, 1), 1) as n
  ), tiered as (
    select base,
           case when n <= 3 then base
                when n <= 5 then base / 2
                else 0 end as amount,
           case when n <= 3 then null
                when n <= 5 then 'duel_repeat_half'
                else 'duel_repeat_zero' end as reason
      from input
  )
  select base,
         amount,
         case when amount = base then null else reason end
    from tiered;
$$;

revoke all on function private.duel_decay_v1(integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. private.try_grant_xp_v1 — one isolated grant.
-- ---------------------------------------------------------------------------
-- grant_xp_v1 reports domain failures as {ok:false} rather than raising, and
-- anything else (a constraint, a lock error) is caught here. Either way the
-- caller keeps going and the match commits.
create or replace function private.try_grant_xp_v1(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_base_amount integer,
  p_amount integer,
  p_decay_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  begin
    v_result := public.grant_xp_v1(
      p_user_id, p_source_type, p_source_id,
      p_base_amount, p_amount, p_decay_reason
    );
  exception when others then
    v_result := jsonb_build_object(
      'ok', false, 'code', 'XP_GRANT_EXCEPTION',
      'sqlstate', sqlstate, 'message', sqlerrm
    );
  end;

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise warning 'XP_GRANT_FAILED user=% source_type=% source_id=% result=%',
      p_user_id, p_source_type, p_source_id, v_result;
  end if;

  return v_result || jsonb_build_object(
    'user_id', p_user_id,
    'source_type', p_source_type,
    'source_id', p_source_id,
    'base_amount', p_base_amount,
    'amount', p_amount,
    'decay_reason', p_decay_reason
  );
end;
$$;

revoke all on function private.try_grant_xp_v1(uuid, text, uuid, integer, integer, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. private.grant_single_result_xp_v1 — one game_records row.
-- ---------------------------------------------------------------------------
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

  -- Decision 4: the day is the KST date of the completion. game_records.created_at
  -- is written by apply_single_move_v2 in the completing transaction.
  v_day := (v_record.created_at at time zone 'Asia/Seoul')::date;

  select exists (
    select 1
      from public.daily_challenges challenge
     where challenge.challenge_date = v_day
       and private.normalize_wiki_title(challenge.target_title)
           = private.normalize_wiki_title(v_record.target_title)
  ) into v_is_daily;

  if v_is_daily then
    v_source_type := 'daily_course_first_finish';
    select exists (
      select 1
        from public.xp_ledger ledger
        join public.game_records earlier on earlier.id = ledger.source_id
       where ledger.user_id = v_record.user_id
         and ledger.source_type = 'daily_course_first_finish'
         and ledger.source_id <> v_record.id
         and (earlier.created_at at time zone 'Asia/Seoul')::date = v_day
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

  return jsonb_build_array(private.try_grant_xp_v1(
    v_record.user_id,
    v_source_type,
    v_record.id,
    case v_source_type when 'daily_course_first_finish' then 25 else 15 end,
    case v_source_type when 'daily_course_first_finish' then 25 else 15 end,
    null
  ));
end;
$$;

revoke all on function private.grant_single_result_xp_v1(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. private.grant_duel_result_xp_v1 — one match_history row (C4 §3.2).
-- ---------------------------------------------------------------------------
create or replace function private.grant_duel_result_xp_v1(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.match_history;
  v_reason text;
  v_at timestamptz;
  v_game_number integer := 1;
  v_winner_base integer;
  v_loser_base integer;
  v_winner_source text;
  v_loser_source text;
  v_decay record;
  v_results jsonb := jsonb_build_array();
  v_grant record;
begin
  select * into v_match from public.match_history where id = p_match_id;
  if not found then
    return v_results;
  end if;

  -- C4 §3.2: the reason lives on game_rooms.finished_reason, not match_history.
  select finished_reason into v_reason
    from public.game_rooms
   where id = v_match.room_id;

  -- 15 §2: cancelled / void matches are never paid.
  if v_reason = 'cancelled' or v_match.result_status = 'cancelled' then
    return v_results;
  end if;

  if v_reason = 'normal_finish' and v_match.result_status = 'completed' then
    v_winner_source := 'duel_win_normal';  v_winner_base := 50;
    v_loser_source  := 'duel_loss_normal'; v_loser_base  := 25;
  elsif v_reason = 'forfeit' and v_match.result_status = 'forfeit' then
    -- Covers both the direct forfeit (leave_duel_room_v2) and the reconnect
    -- timeout (finalize_duel_if_expired): spec §7.1 pays 0 to either loser.
    v_winner_source := 'duel_win_forfeit';  v_winner_base := 30;
    v_loser_source  := 'duel_loss_forfeit'; v_loser_base  := 0;
  else
    raise warning 'XP_DUEL_REASON_UNMAPPED match=% finished_reason=% result_status=%',
      p_match_id, v_reason, v_match.result_status;
    return v_results;
  end if;

  -- Decision 5: same pair, same KST day, cancelled excluded, this match included.
  v_at := coalesce(v_match.finalized_at, v_match.created_at);
  if v_match.winner_user_id is not null and v_match.loser_user_id is not null then
    select count(*)::integer
      into v_game_number
      from public.match_history other
     where other.result_status <> 'cancelled'
       and least(other.winner_user_id, other.loser_user_id)
           = least(v_match.winner_user_id, v_match.loser_user_id)
       and greatest(other.winner_user_id, other.loser_user_id)
           = greatest(v_match.winner_user_id, v_match.loser_user_id)
       and (coalesce(other.finalized_at, other.created_at) at time zone 'Asia/Seoul')::date
           = (v_at at time zone 'Asia/Seoul')::date
       and (coalesce(other.finalized_at, other.created_at), other.id) <= (v_at, v_match.id);
  end if;

  -- Fixed user_id order keeps profile row locks deadlock-free.
  for v_grant in
    select *
      from (values
        (v_match.winner_user_id, v_winner_source, v_winner_base),
        (v_match.loser_user_id,  v_loser_source,  v_loser_base)
      ) as grants(user_id, source_type, base_amount)
     where grants.user_id is not null
     order by grants.user_id
  loop
    select * into v_decay from private.duel_decay_v1(v_grant.base_amount, v_game_number);
    v_results := v_results || jsonb_build_array(private.try_grant_xp_v1(
      v_grant.user_id, v_grant.source_type, v_match.id,
      v_decay.base_amount, v_decay.amount, v_decay.decay_reason
    ));
  end loop;

  return v_results;
end;
$$;

revoke all on function private.grant_duel_result_xp_v1(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. private.grant_group_result_xp_v1 — every group_match_results row of a room.
-- ---------------------------------------------------------------------------
create or replace function private.grant_group_result_xp_v1(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms;
  v_row public.group_match_results;
  v_source text;
  v_base integer;
  v_results jsonb := jsonb_build_array();
begin
  select * into v_room from public.game_rooms where id = p_room_id;
  if not found
     or v_room.mode <> 'group'
     or v_room.status <> 'finished'
     or v_room.finished_reason is not distinct from 'cancelled' then
    return v_results;
  end if;

  -- A finished player who left afterwards is gone from room_players but keeps
  -- this row, so results — not room_players — are the payout list.
  for v_row in
    select * from public.group_match_results
     where room_id = p_room_id
     order by user_id
  loop
    if v_row.result_status = 'finished' and v_row.rank is not null then
      v_source := case
        when v_row.rank = 1 then 'group_rank_1'
        when v_row.rank = 2 then 'group_rank_2'
        when v_row.rank = 3 then 'group_rank_3'
        else 'group_rank_other'
      end;
      v_base := case v_source
        when 'group_rank_1' then 70
        when 'group_rank_2' then 55
        when 'group_rank_3' then 45
        else 35
      end;
    elsif v_row.result_status = 'retired' then
      -- Every retire_reason pays 0 and still writes its row (C2 §3).
      v_source := 'group_retire';
      v_base := 0;
    else
      raise warning 'XP_GROUP_RESULT_UNMAPPED result=% status=% rank=%',
        v_row.id, v_row.result_status, v_row.rank;
      continue;
    end if;

    v_results := v_results || jsonb_build_array(private.try_grant_xp_v1(
      v_row.user_id, v_source, v_row.id, v_base, v_base, null
    ));
  end loop;

  return v_results;
end;
$$;

revoke all on function private.grant_group_result_xp_v1(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Triggers — the outer isolation layer.
-- ---------------------------------------------------------------------------
-- The inner layer (try_grant_xp_v1) isolates each grant; this one isolates the
-- classification itself, so even a bug in sections 3~5 cannot fail a finish.
create or replace function private.grant_result_xp_on_write_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := tg_argv[0];
  v_id uuid;
begin
  -- game_records.id / match_history.id / game_rooms.id — each scope's result id.
  v_id := new.id;
  begin
    if v_scope = 'single' then
      perform private.grant_single_result_xp_v1(v_id);
    elsif v_scope = 'duel' then
      perform private.grant_duel_result_xp_v1(v_id);
    elsif v_scope = 'group' then
      perform private.grant_group_result_xp_v1(v_id);
    end if;
  exception when others then
    raise warning 'XP_RESULT_GRANT_FAILED scope=% id=% sqlstate=% message=%',
      v_scope, v_id, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.grant_result_xp_on_write_v1()
  from public, anon, authenticated;

drop trigger if exists trg_grant_single_result_xp on public.game_records;
create trigger trg_grant_single_result_xp
after insert on public.game_records
for each row
when (new.user_id is not null and new.result_status = 'completed')
execute function private.grant_result_xp_on_write_v1('single');

drop trigger if exists trg_grant_duel_result_xp on public.match_history;
create trigger trg_grant_duel_result_xp
after insert on public.match_history
for each row
when (new.result_status is distinct from 'cancelled')
execute function private.grant_result_xp_on_write_v1('duel');

-- Named to sort after trg_finalize_group_records (same event). That trigger only
-- writes group_match_history, so the order is not load-bearing.
drop trigger if exists trg_grant_group_result_xp on public.game_rooms;
create trigger trg_grant_group_result_xp
after update of status on public.game_rooms
for each row
when (new.mode = 'group'
      and new.status = 'finished'
      and old.status is distinct from 'finished')
execute function private.grant_result_xp_on_write_v1('group');

-- ---------------------------------------------------------------------------
-- 7. public.grant_result_xp_v1 — idempotent re-grant for one result.
-- ---------------------------------------------------------------------------
-- p_result_id is game_records.id (single), match_history.id (duel) or
-- game_rooms.id (group — one room pays every participant). Returns
-- {ok, scope, result_id, grants:[...]} where each grant is the grant_xp_v1
-- answer plus its inputs; granted:false means the row already existed.
-- service_role only, like grant_xp_v1 (C2 §7): it pays other users.
create or replace function public.grant_result_xp_v1(
  p_scope text,
  p_result_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grants jsonb;
begin
  if p_result_id is null then
    return jsonb_build_object('ok', false, 'code', 'XP_SOURCE_INVALID');
  end if;

  if p_scope = 'single' then
    v_grants := private.grant_single_result_xp_v1(p_result_id);
  elsif p_scope = 'duel' then
    v_grants := private.grant_duel_result_xp_v1(p_result_id);
  elsif p_scope = 'group' then
    v_grants := private.grant_group_result_xp_v1(p_result_id);
  else
    return jsonb_build_object('ok', false, 'code', 'XP_SOURCE_INVALID');
  end if;

  return jsonb_build_object(
    'ok', true,
    'scope', p_scope,
    'result_id', p_result_id,
    'grants', v_grants
  );
end;
$$;

revoke all on function public.grant_result_xp_v1(text, uuid)
  from public, anon, authenticated;
grant execute on function public.grant_result_xp_v1(text, uuid)
  to service_role;

commit;
