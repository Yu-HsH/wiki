-- Wiki Race 2.0: the three DB-only items left after the 3-course scope cut.
-- Forward-only additive migration. Historical migrations stay unchanged.
--
-- 2026-09-28 — 01-CONFIRMED-SPEC §3.3 "매일 세 개의 코스" was taken out of scope
-- [사용자 결정]. The "3코스 창" that these three items were attached to is gone
-- with it. None of them touches daily_challenges, an RPC signature, an anon ACL
-- or the guest path, so they need no window, no rehearsal and no maintenance
-- gate — an ordinary `db push`, the same procedure as the 2026-09-28 C/15a push.
-- The front end is unaffected: the only client writes to profiles send exactly
-- the three columns granted in ③ (checked below).
--
-- Order is ③ → ④ → ② (docs/contracts/C3-LEVEL-STORAGE.md §5.1 "적용 순서"):
-- a table-level UPDATE grant also covers columns added later, so the table-level
-- grant has to be gone *before* total_xp exists. Reversing ③ and ④ would open a
-- window in which a client could write its own XP.
--
-- Data-loss DDL in this file: 0. No drop, no rename, no type change, no update
-- or delete of existing rows. Every step is revoke/grant, add column with a
-- constant default, add constraint, or create index.
--
-- Rollback (reverse order ② → ④ → ③; each item carries its own statements):
--   rolling ③ back while ④ is still in place re-opens UPDATE on total_xp, so ④
--   must be rolled back first or the table-level grant must not be restored.

begin;

-- ---------------------------------------------------------------------------
-- 0. Guard for ② — refuse to run if existing rows would fail the CHECK.
-- ---------------------------------------------------------------------------
-- Placed first on purpose: it only reads, and if it raises nothing in this file
-- has been applied yet. Locally game_records had 0 rows on 2026-09-28, which
-- proves nothing about production (C4 §4.1 "운영 데이터는 확인하지 않았다"), so
-- the production check happens here, inside the push, with a readable message.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s×%s', coalesce(result_status, '<null>'), n), ', ')
    into v_bad
    from (
      select result_status, count(*) as n
        from public.game_records
       where result_status is null
          or result_status <> all (array['completed', 'abandoned', 'expired']::text[])
       group by result_status
    ) offending;

  if v_bad is not null then
    raise exception 'GAME_RECORDS_RESULT_STATUS_OUT_OF_SET: %', v_bad
      using hint = 'C4 §4.1 — report these rows before adding the CHECK. Nothing in this migration has been applied.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- ③ profiles: column-level UPDATE — C3 §5.1 (C3-①, 3 columns).
-- ---------------------------------------------------------------------------
-- Before (local stack, 2026-09-28, from baseline:1467-1468 `GRANT ALL`):
--   anon          table: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   authenticated table: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   column UPDATE (both roles): created_at, id, nickname, profile_image_url,
--                               synthetic_email, updated_at, username
--   RLS on; policies: 3 SELECT, 2 UPDATE (`auth.uid() = id`), no INSERT policy.
--
-- After: authenticated may UPDATE nickname, profile_image_url, updated_at only;
-- anon may UPDATE nothing. SELECT/INSERT/DELETE grants and all RLS policies are
-- untouched — C3 §5.1 "RLS 정책은 건드리지 않는다".
--
-- Why these three: the only client writes to profiles are
--   pages/ProfilePage.jsx:97-98   update({ nickname, updated_at })
--   pages/ProfilePage.jsx:160-161 update({ profile_image_url, updated_at })
-- (C3 cites :86/:149 — the lines moved, the calls did not. Full client search
-- 2026-09-28: 2 update paths, no insert/upsert; other `from("profiles")` hits
-- are selects.) Dropping updated_at would make both fail with 42501 (C3 §0).
-- Server-side writers are unaffected: username-signup inserts with the service
-- role, and grant_xp_v1 is security definer.
--
-- anon is revoked as well, as C3 §5.1 specifies: anon can never satisfy
-- `auth.uid() = id`, so behaviour does not change, and the GRANT ALL has no
-- reason to stay.
--
-- Rollback ③ (only after ④ is rolled back — see header):
--   revoke update (nickname, profile_image_url, updated_at)
--     on table public.profiles from authenticated;
--   grant update on table public.profiles to anon, authenticated;
revoke update on table public.profiles from anon, authenticated;

grant update (nickname, profile_image_url, updated_at)
  on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- ④ profiles.total_xp — C3 §1 verbatim (15b prerequisite).
-- ---------------------------------------------------------------------------
-- Added after ③, so no role holds UPDATE on it: the only writer will be
-- grant_xp_v1 (security definer) once 15b replaces it (C3 §5). SELECT follows
-- the existing table-level grant, which is what the ranking needs (C3 §2).
-- The constant default makes this a metadata-only change on PG ≥ 11 — no table
-- rewrite. Every existing row reads 0, which equals its ledger sum only if the
-- ledger is empty; 15b owns the backfill and C3 §6's invariant query.
--
-- Rollback ④ (loses accumulated XP totals — safe only while 15b has not shipped,
-- i.e. while every total_xp is still 0; the ledger itself is not affected):
--   drop index if exists public.profiles_total_xp_idx;
--   alter table public.profiles drop constraint if exists profiles_total_xp_check;
--   alter table public.profiles drop column if exists total_xp;
alter table public.profiles
  add column if not exists total_xp bigint not null default 0;

alter table public.profiles
  add constraint profiles_total_xp_check check (total_xp >= 0);

create index if not exists profiles_total_xp_idx
  on public.profiles (total_xp desc);

-- ---------------------------------------------------------------------------
-- ② game_records.result_status CHECK — C4 §4.1.
-- ---------------------------------------------------------------------------
-- The value set is single_game_runs.status minus `active` (a record exists only
-- after a run has ended). Today only 'completed' is written
-- (apply_single_move_v2:322); the other two are the contract's reserve.
-- game_rooms.match_end_reason gets no CHECK — it is a dead column, kept as is
-- (C4 §4.2, AGENTS.md §4).
--
-- Rollback ②:
--   alter table public.game_records drop constraint if exists game_records_result_status_check;
alter table public.game_records
  add constraint game_records_result_status_check
  check (result_status = any (array['completed', 'abandoned', 'expired']::text[]));

commit;
