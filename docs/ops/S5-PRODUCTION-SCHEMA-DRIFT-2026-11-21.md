# S5 운영 스키마 드리프트 — 2026-11-21 (read-only preflight)

> Status: **BLOCK / NO PRODUCTION WRITE**. PR #63 (`bcaef7f0b24d8be7f64e8c21c13bc39b50c6d785`)의 기존 59→64 합성 데이터 리허설은 PASS이지만, 현재 운영 DB는 합성 시작 상태와 다르다.
>
> Evidence: connected Supabase project read-only catalogue/aggregate SQL on 2026-11-21 KST and GitHub candidate migration text. No data rows, credentials, or pg_dump were exported; no production DDL/DML or Edge/Production deployment was performed.

## Actual live baseline

- Supabase project `ACTIVE_HEALTHY`; PostgreSQL 17.6. Applied tracked migrations **59**.
- Approximate total DB size: **265,022,611 bytes** (includes database overhead; not a backup-size forecast).
- Aggregate counts: `auth.users` 204, `public.profiles` 201, `public.xp_ledger` 817; `public.game_rooms` 367, `public.room_players` 674, `public.match_history` 181, `public.group_match_history` 562, `public.single_game_runs` 205.
- `public` has 38 ordinary tables, all RLS enabled, 41 policies and 92 functions.
- Existing **untracked S5 installation**: `ink_product` 42 ordinary tables and `ink_product_engine` 34 ordinary tables, despite the tracked migration list ending at the original 59.
- Existing S5 rows (count only): `ink_product.rooms` 1; `members` 1; `entry_policy_v1` 1 (review channel, admission disabled); `policies` 10; `match_receipts` 0; `worker_schedule_v1` 0; `ink_product_engine.s5_transition_control_v1` 1 (`new_rooms_enabled=false`, revision 0). **Do not discard these rows.**
- Private schema RLS: `ink_product` 42/42 enabled and forced; `ink_product_engine` 33/34 enabled and forced. Its `ink_s5_release_v1` has no RLS but no `anon` or `authenticated` SELECT privilege in the checked database; review access before release.
- Existing public group-item RPCs include `act_group_items_product_room_v1`, `act_group_items_product_v1`, `get_group_items_entry_v1` and multiple getters. Existing S5 owner/worker roles are non-login and without superuser/BYPASSRLS.

## Confirmed collision with candidate SQL

The PR candidate `supabase/migrations/20261120024414_group_items_s5.sql` (blob `83c768985a53e9efe82054e05e8439743e0eb983`) contains **59** literal `CREATE TABLE` statements. Read-only `to_regclass` comparison against the live project found **56 already-existing relations** and only three missing: `ink_product_events.signals_v1`, `ink_product_events.emotes_v1`, `ink_product_events.emote_limits_v1`.

It also uses unconditional `CREATE FUNCTION public.act_group_items_product_room_v1(...)`, `CREATE SCHEMA ink_product` and `CREATE TABLE ink_product.rooms` while those objects already exist. Running this candidate verbatim on the live database will encounter an already-existing object error. A fresh synthetic 59-migration container lacks these objects and cannot prove compatibility with production.

Do **not** infer that the three missing tables are the only source-code/schema differences. The installed versions of existing functions, columns, indexes, constraints, policies, grants, triggers and data must be compared on a complete isolated restore first.

## Release gate

1. Keep S5 production admission disabled and PR #63 Draft. **No production migration, repair-stamping of schema_migrations, DROP/CREATE replacement, Edge promotion, merge or frontend release.**
2. Obtain an encrypted, access-controlled, current production logical/physical backup via an approved Supabase backup channel. The current connector supports catalogue/SQL reads but **not backup download**; no full backup was obtained in this investigation.
3. Restore the production backup into an isolated PostgreSQL 17 environment with appropriate Supabase roles/extensions. Verify **full data + owners/ACL/RLS, functions/triggers/policies**, not just `pg_restore -l`. Do not expose restored Auth/password data in logs or downloadable public CI artifacts.
4. Record pre- and post-restore fingerprints/counts for critical user/profile, room/participant/result, XP, achievement/reward, existing S5 data and access-control objects. Avoid exporting identifiable row values to GitHub.
5. On the restored **actual-schema** baseline, run a deliberate compatibility/diff analysis against S5 candidate. Prepare a *separate reviewed delta/bridge* migration that preserves existing S5 tables and data, adds missing functionality, and incorporates any required function upgrades. Never blindly mark the old untracked objects as an applied migration.
6. On a new isolated copy, execute the reviewed transition with timeout/rollback, run pgTAP 1,672+ and real Auth browser scenarios, and measure locks/elapsed time. Validate failure recovery and repeatability. Re-check current production counts/drift immediately before cutover.
7. Check `game_rooms` statuses and active sessions/drain plan immediately before any maintenance; the read-only preflight observed three `group/playing` rows but could not infer whether users were currently connected.

## Separate synthetic rehearsal

GitHub Actions run [44860853362](https://github.com/Yu-HsH/wiki/actions/runs/44860853362) succeeded: 59→64 on synthetic users/profiles/room/history/XP, SHA-256 stable, pgTAP 36 files / 1,672 assertions PASS. The synthetic archive was generated and its table-of-contents checked, **not fully restored**; the test used no production data. That PASS remains true for its own scope but does not override the production schema-drift BLOCK.
