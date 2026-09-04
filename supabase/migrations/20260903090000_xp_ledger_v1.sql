-- Wiki Race 2.0 Track 15a: XP ledger, grant RPC, decay, idempotency.
-- Forward-only additive migration. Historical migrations stay unchanged.
--
-- Scope note (docs/agent/TRACKS.md §6.1 condition C1 · §6.3):
--   This migration deliberately does NOT touch public.profiles beyond an
--   existence check. `profiles.total_xp` and the `update public.profiles`
--   line of C3 §5 belong to 15b, which replaces `grant_xp_v1` with
--   `create or replace` once that column exists. Until then the cumulative
--   total is computed from the ledger itself.
--
--   `get_weekly_xp_ranking_v1` is intentionally absent: C2 §8-⑤ (weekly
--   tie-break) is still undecided and the weekly ranking ships with 15b
--   (§6.4). Wiring the grant into the group/duel/single finalizers is 15c
--   (§6.3).

begin;

-- ---------------------------------------------------------------------------
-- 1. xp_ledger — C2 §1 verbatim.
-- ---------------------------------------------------------------------------
-- Append-only. A cancelled grant is expressed as a negative `admin_adjustment`
-- row, never as a status column on an existing row (C2 §4).
create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  xp_class text not null,
  source_type text not null,
  source_id uuid not null,
  base_amount integer not null,
  amount integer not null,
  decay_reason text,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- "one grant per server result id" (15 §2). user_id is part of the key
  -- because one group result pays out to up to eight players.
  constraint xp_ledger_idempotent_uq
    unique (user_id, source_type, source_id),

  constraint xp_ledger_xp_class_check
    check (xp_class = any (array['gameplay', 'achievement', 'admin']::text[])),

  constraint xp_ledger_source_type_check
    check (source_type = any (array[
      'single_random_finish',
      'single_target_first_finish',
      'daily_course_first_finish',
      'duel_win_normal',
      'duel_loss_normal',
      'duel_win_forfeit',
      'duel_loss_forfeit',
      'group_rank_1',
      'group_rank_2',
      'group_rank_3',
      'group_rank_other',
      'group_retire',
      'achievement_unlock',
      'admin_adjustment'
    ]::text[])),

  constraint xp_ledger_class_source_check
    check (
      (xp_class = 'achievement' and source_type = 'achievement_unlock')
      or (xp_class = 'admin' and source_type = 'admin_adjustment')
      or (xp_class = 'gameplay' and source_type not in ('achievement_unlock', 'admin_adjustment'))
    ),

  constraint xp_ledger_amount_sign_check
    check (xp_class = 'admin' or (amount >= 0 and base_amount >= 0)),

  constraint xp_ledger_decay_range_check
    check (xp_class = 'admin' or amount <= base_amount),

  constraint xp_ledger_decay_reason_check
    check (
      (decay_reason is null and amount = base_amount)
      or (decay_reason is not null and decay_reason = any (array[
        'duel_repeat_half', 'duel_repeat_zero'
      ]::text[]))
    )
);

create index if not exists xp_ledger_user_granted_idx
  on public.xp_ledger (user_id, granted_at desc);

-- Exactly the weekly explorer ranking predicate of C2 §2:
--   where xp_class = 'gameplay' and granted_at >= <monday 00:00 KST>
create index if not exists xp_ledger_weekly_idx
  on public.xp_ledger (granted_at, user_id)
  where xp_class = 'gameplay';

-- ---------------------------------------------------------------------------
-- 2. RLS — C2 §6. Read own rows only, no client write path at all.
-- ---------------------------------------------------------------------------
alter table public.xp_ledger enable row level security;

revoke all on table public.xp_ledger from anon, authenticated;
grant select on table public.xp_ledger to authenticated;

drop policy if exists "Users can read own xp ledger" on public.xp_ledger;
create policy "Users can read own xp ledger"
on public.xp_ledger
for select
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Level functions — C3 §4 verbatim.
-- ---------------------------------------------------------------------------
-- Both are invoker-rights pure functions with no data access, so the
-- `security definer` / `set search_path = ''` pattern that contracts/README
-- prescribes for the jsonb RPCs does not apply here. C3 §4.1: immutable is
-- declared for constant folding only — never build an index or a generated
-- column on these, because the formula may change.
create or replace function public.xp_to_next_level(p_level integer)
returns integer
language sql
immutable
as $$
  select least(100 + 25 * ((greatest(p_level, 1) - 1) / 5), 500);
$$;

create or replace function public.level_from_total_xp(p_total_xp bigint)
returns integer
language plpgsql
immutable
as $$
declare
  v_level integer := 1;
  v_remaining bigint := greatest(coalesce(p_total_xp, 0), 0);
  v_need integer;
begin
  loop
    v_need := public.xp_to_next_level(v_level);
    exit when v_remaining < v_need;
    v_remaining := v_remaining - v_need;
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. private.xp_class_for_source — the one place source_type maps to xp_class.
-- ---------------------------------------------------------------------------
-- C2 §2: source_type alone cannot drive the weekly ranking, so the class axis
-- is stored. Deriving it here keeps the two columns from ever disagreeing.
create or replace function private.xp_class_for_source(p_source_type text)
returns text
language sql
immutable
as $$
  select case p_source_type
    when 'achievement_unlock' then 'achievement'
    when 'admin_adjustment' then 'admin'
    when 'single_random_finish' then 'gameplay'
    when 'single_target_first_finish' then 'gameplay'
    when 'daily_course_first_finish' then 'gameplay'
    when 'duel_win_normal' then 'gameplay'
    when 'duel_loss_normal' then 'gameplay'
    when 'duel_win_forfeit' then 'gameplay'
    when 'duel_loss_forfeit' then 'gameplay'
    when 'group_rank_1' then 'gameplay'
    when 'group_rank_2' then 'gameplay'
    when 'group_rank_3' then 'gameplay'
    when 'group_rank_other' then 'gameplay'
    when 'group_retire' then 'gameplay'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 5. grant_xp_v1 — ledger-only edition (15a). C2 §7.
-- ---------------------------------------------------------------------------
-- Returns {ok, granted, ledger_id, total_xp, level_before, level_after}.
-- `granted: false` is not an error: it means the idempotent unique key already
-- had a row, so a retry / F5 / duplicate finish changed nothing (C2 §7).
--
-- 15b replaces this body with `create or replace` to also maintain
-- profiles.total_xp. This file is not edited then (R5, forward-only).
create or replace function public.grant_xp_v1(
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
  v_xp_class text;
  v_ledger_id uuid;
  v_granted boolean;
  v_total_after bigint;
  v_total_before bigint;
begin
  -- Guests never earn XP (15 §2, §3.4). The profiles FK is the last line of
  -- defence; this check turns it into a domain rejection instead of a 23503.
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if p_source_id is null then
    return jsonb_build_object('ok', false, 'code', 'XP_SOURCE_INVALID');
  end if;

  v_xp_class := private.xp_class_for_source(p_source_type);
  if v_xp_class is null then
    return jsonb_build_object('ok', false, 'code', 'XP_SOURCE_INVALID');
  end if;

  if p_base_amount is null or p_amount is null then
    return jsonb_build_object('ok', false, 'code', 'XP_AMOUNT_INVALID');
  end if;

  -- The table CHECKs are the authority; these mirror them so a bad caller gets
  -- a code instead of a constraint violation. Admin adjustments are the only
  -- rows allowed to be negative (C2 §3, 15 §2).
  if v_xp_class <> 'admin'
     and (p_amount < 0 or p_base_amount < 0 or p_amount > p_base_amount) then
    return jsonb_build_object('ok', false, 'code', 'XP_AMOUNT_INVALID');
  end if;

  if p_decay_reason is null then
    if p_amount <> p_base_amount then
      return jsonb_build_object('ok', false, 'code', 'XP_AMOUNT_INVALID');
    end if;
  else
    if p_decay_reason not in ('duel_repeat_half', 'duel_repeat_zero') then
      return jsonb_build_object('ok', false, 'code', 'XP_AMOUNT_INVALID');
    end if;
  end if;

  insert into public.xp_ledger (
    user_id, xp_class, source_type, source_id,
    base_amount, amount, decay_reason
  )
  values (
    p_user_id, v_xp_class, p_source_type, p_source_id,
    p_base_amount, p_amount, p_decay_reason
  )
  on conflict on constraint xp_ledger_idempotent_uq do nothing
  returning id into v_ledger_id;

  v_granted := v_ledger_id is not null;

  -- 15a computes the cumulative total from the ledger, not from a column
  -- (TRACKS §6.1 condition C1). xp_ledger_user_granted_idx serves this scan.
  select coalesce(sum(amount), 0)
  into v_total_after
  from public.xp_ledger
  where user_id = p_user_id;

  -- Derived from the post-grant total so the pair can never disagree with it.
  v_total_before := v_total_after - (case when v_granted then p_amount else 0 end);

  return jsonb_build_object(
    'ok', true,
    'granted', v_granted,
    'ledger_id', v_ledger_id,
    'total_xp', v_total_after,
    'level_before', public.level_from_total_xp(v_total_before),
    'level_after', public.level_from_total_xp(v_total_after)
  );
end;
$$;

-- C2 §7: this RPC takes p_user_id because one group result pays eight players,
-- so auth.uid() is not enough. That is exactly why `authenticated` must not be
-- able to call it. Precedent: apply_guest_single_move_v2 (20260814091000:979).
revoke all on function public.grant_xp_v1(uuid, text, uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.grant_xp_v1(uuid, text, uuid, integer, integer, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. get_xp_summary_v1 — C2 §7.
-- ---------------------------------------------------------------------------
-- Returns {ok, total_xp, level, next_level_xp, current_level_xp}.
-- `current_level_xp` / `next_level_xp` is the progress pair of 15 §6
-- ("프로필에 현재 레벨·현재/다음 XP 표시").
--
-- No self-only guard: the level and cumulative XP of any explorer are public
-- by design (C3 §2 — the level ranking and group participant rows read other
-- people's levels). The ledger *rows* stay self-only through RLS (C2 §6).
create or replace function public.get_xp_summary_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_progress_total bigint;
  v_level integer;
  v_consumed bigint := 0;
  v_step integer;
begin
  if p_user_id is null
     or not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  end if;

  -- 15a's cumulative XP is the ledger sum itself (TRACKS §6.1). Reported raw so
  -- it matches the C3 §6 invariant query that 15b will run against the column.
  select coalesce(sum(amount), 0)
  into v_total
  from public.xp_ledger
  where user_id = p_user_id;

  -- A negative admin adjustment can push the sum below zero. The level floor of
  -- 1 already comes from level_from_total_xp; clamping here keeps the progress
  -- pair from going negative too.
  v_progress_total := greatest(v_total, 0);
  v_level := public.level_from_total_xp(v_progress_total);

  -- XP consumed by every level below the current one. Reusing the two contract
  -- functions keeps the formula in exactly one place (C3 §4).
  for v_step in 1 .. (v_level - 1) loop
    v_consumed := v_consumed + public.xp_to_next_level(v_step);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'total_xp', v_total,
    'level', v_level,
    'next_level_xp', public.xp_to_next_level(v_level),
    'current_level_xp', v_progress_total - v_consumed
  );
end;
$$;

revoke all on function public.get_xp_summary_v1(uuid) from public, anon;
grant execute on function public.get_xp_summary_v1(uuid) to authenticated, service_role;

commit;
