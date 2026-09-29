-- Wiki Race 2.0 Track 15b: profiles.total_xp becomes the cumulative XP authority.
-- Forward-only additive migration. Historical migrations stay unchanged.
--
-- What this file does (docs/agent/TRACKS.md §6.1 — the 15b half of the split):
--   1. grant_xp_v1       — create or replace. Same signature, same ACL. It now
--                          adds the granted amount to profiles.total_xp, and only
--                          when the ledger insert actually wrote a row (C3 §5).
--   2. get_xp_summary_v1 — create or replace. The cumulative total is read from
--                          profiles.total_xp instead of summing the ledger.
--   3. profile_level     — new. A PostgREST computed field over profiles, so any
--                          `profiles` select can ask for `profile_level` and other
--                          players' levels need no extra RPC. The formula stays in
--                          level_from_total_xp only (C3 §3·§4 — 15a principle).
--
-- User decisions this file implements (2026-09-29):
--   ① cumulative source = profiles.total_xp; a grant that would take total_xp
--     below 0 returns {ok:false, code:'XP_AMOUNT_INVALID'} and writes no ledger row.
--   ② other players' level = public.profile_level(profiles) computed field.
--
-- Not in this file: the ledger backfill. Production xp_ledger had 0 rows on
-- 2026-09-28 (docs/agent/CURRENT.md), so every total_xp = 0 already equals its
-- ledger sum. Section 0 checks that instead of assuming it.
--
-- Data-loss DDL in this file: 0. No drop, no rename, no type change, no update
-- or delete of existing rows.
--
-- Rollback: re-run sections 5 and 6 of 20260903090000_xp_ledger_v1.sql (the 15a
-- bodies of the two RPCs, then its revoke/grant lines) and
--   drop function if exists public.profile_level(public.profiles);
-- total_xp values accumulated after this file stay in the column; the 15a
-- bodies ignore them and read the ledger again.

begin;

-- ---------------------------------------------------------------------------
-- 0. Guard — refuse to run if any total_xp already disagrees with its ledger.
-- ---------------------------------------------------------------------------
-- This is the C3 §6 invariant query. From here on grant_xp_v1 only adds deltas,
-- so a row that is off before this file stays off forever. Read-only: if it
-- raises, nothing in this file has been applied.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s total_xp=%s ledger=%s', id, total_xp, ledger_total), ', ')
    into v_bad
    from (
      select p.id, p.total_xp, coalesce(sum(l.amount), 0) as ledger_total
        from public.profiles p
        left join public.xp_ledger l on l.user_id = p.id
       group by p.id, p.total_xp
      having p.total_xp <> coalesce(sum(l.amount), 0)
    ) offending;

  if v_bad is not null then
    raise exception 'XP_TOTAL_OUT_OF_SYNC: %', v_bad
      using hint = 'C3 §6 — backfill profiles.total_xp from xp_ledger first. Nothing in this migration has been applied.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. grant_xp_v1 — 15b edition. C2 §7 · C3 §5.
-- ---------------------------------------------------------------------------
-- Returns {ok, granted, ledger_id, total_xp, level_before, level_after} — the
-- same shape as 15a. total_xp is now profiles.total_xp after the call.
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
  v_total_before bigint;
  v_total_after bigint;
begin
  -- Guests never earn XP (15 §2, §3.4).
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  -- The row lock serialises every grant for this player, so the negative guard
  -- below and the increment further down see the same total. A missing profile
  -- is a guest, as in 15a.
  select total_xp
    into v_total_before
    from public.profiles
   where id = p_user_id
     for update;

  if not found then
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

  -- Unchanged from 15a: the table CHECKs are the authority, these mirror them.
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

  -- Decision ① (2026-09-29): a grant may not take total_xp below 0. Refused
  -- before the insert, so no ledger row is written and C3 §6 still holds —
  -- profiles_total_xp_check would otherwise abort the whole call as 23514.
  -- Only a key that is not in the ledger yet is checked: a retry of an
  -- adjustment that was already applied is the idempotent granted:false case,
  -- not an error (C2 §7). Only admin adjustments can be negative.
  if v_total_before + p_amount < 0
     and not exists (
       select 1
         from public.xp_ledger
        where user_id = p_user_id
          and source_type = p_source_type
          and source_id = p_source_id
     ) then
    return jsonb_build_object('ok', false, 'code', 'XP_AMOUNT_INVALID');
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

  -- C3 §5: add only when the insert actually wrote a row. A repeated call
  -- leaves profiles untouched, updated_at included.
  if v_granted then
    update public.profiles
       set total_xp = total_xp + p_amount,
           updated_at = now()
     where id = p_user_id
    returning total_xp into v_total_after;
  else
    v_total_after := v_total_before;
  end if;

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

-- Unchanged from 15a: p_user_id is an argument, so authenticated must not reach it.
revoke all on function public.grant_xp_v1(uuid, text, uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.grant_xp_v1(uuid, text, uuid, integer, integer, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. get_xp_summary_v1 — 15b edition. C2 §7.
-- ---------------------------------------------------------------------------
-- Same signature, same return shape {ok, total_xp, level, next_level_xp,
-- current_level_xp}. Only the source of total_xp changes: the column, not a
-- ledger scan (decision ①).
create or replace function public.get_xp_summary_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_level integer;
  v_consumed bigint := 0;
  v_step integer;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  end if;

  select total_xp
    into v_total
    from public.profiles
   where id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  end if;

  -- profiles_total_xp_check keeps v_total >= 0, so the 15a clamp is gone.
  v_level := public.level_from_total_xp(v_total);

  -- XP consumed by every level below the current one — same two contract
  -- functions as 15a, so the formula stays in one place (C3 §4).
  for v_step in 1 .. (v_level - 1) loop
    v_consumed := v_consumed + public.xp_to_next_level(v_step);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'total_xp', v_total,
    'level', v_level,
    'next_level_xp', public.xp_to_next_level(v_level),
    'current_level_xp', v_total - v_consumed
  );
end;
$$;

revoke all on function public.get_xp_summary_v1(uuid) from public, anon;
grant execute on function public.get_xp_summary_v1(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. profile_level — computed field (decision ②).
-- ---------------------------------------------------------------------------
-- PostgREST treats a function whose only argument is a table row as a virtual
-- column: `from("profiles").select("id, nickname, total_xp, profile_level")`.
-- Ranking rows and the public profile read other players' levels this way (C3 §2)
-- without the level being stored (C3 §3).
--
-- Invoker rights on purpose: it reads nothing but the row it is handed, so the
-- caller's own RLS on profiles already decided which rows it sees.
-- `stable`, not `immutable`: C3 §4.1 keeps the formula changeable, and nothing
-- may index or generate a column from it.
create or replace function public.profile_level(p public.profiles)
returns integer
language sql
stable
as $$
  select public.level_from_total_xp(p.total_xp);
$$;

-- Levels are public by design (C3 §2), and profiles is readable by both roles.
revoke all on function public.profile_level(public.profiles) from public;
grant execute on function public.profile_level(public.profiles)
  to anon, authenticated, service_role;

commit;
