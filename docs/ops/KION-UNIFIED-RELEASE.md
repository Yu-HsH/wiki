# Kion unified release verification — Draft only (2026-11-11)

## Contents
- PR #55 Kion 10 approved WebP assets and legacy group spectator compatibility
- PR #56 authenticated send_room_emote_v1 RPC and security/RLS review
- PR #57 duel/group waiting-room player-card speech bubbles
- PR #58 duel/group in-race reactions, separately gated
- PR #59 countdown character animation deliberately EXCLUDED

## Production environment status, read-only inspected
- Production Supabase room_events has RLS, a member-only SELECT policy, and is in supabase_realtime publication. Direct authenticated INSERT/UPDATE/DELETE is already denied. Existing send_group_spectator_emoji_v13 is present.
- Production send_room_emote_v1 **does not exist yet**. No Production migration was run.
- Vercel's Production Vite environment has no VITE_ENABLE_KION_ROOM_EMOTES and no VITE_ENABLE_KION_RACE_EMOTES. Both feature flags currently default OFF.
- GitHub Draft branch pushes DO produce automatic Vercel Preview deployments. These are not Production, but still consume builds. Minimize subsequent pushes.
- Production Postgres image 17.6.1.104 vs disposable CI 17.6.1.158. Both use PostgreSQL 17; verify upgrade and schema compatibility before any Production schema change.

## CLI-generated migration
- Exact filename obtained from an **actual Supabase CLI** run in isolated GitHub Actions at 2026-11-10 23:56:50 UTC: `supabase/migrations/20261110235650_room_emotes_v1.sql`.
- It contains the reviewed PR #56 SQL, including denial of logically expired public waiting rooms, and is now committed for release review. Creation does not mean application; **do not run `supabase db push` on Production before approval**.
- Integration CI replays all existing migrations including this file on a disposable local database.

## Required gates before Production
- [ ] Combined JavaScript tests and npm run build (all flags OFF)
- [ ] Build with both flags ON (in CI ONLY)
- [ ] 1:1 and 3/6 / 6/6 group player-card geometry at 320, 390, 768, 1280px; no bubble/READY/profile overlap, picker 10 assets
- [ ] 1:1 and group in-race simulated link/item clicks remain functional
- [ ] Full disposable local DB replay; pgTAP 22 checks and 3s concurrent sends
- [ ] Real 2-person duel + real 6-person group Realtime fanout, including seventh user's access denial, on disposable local Auth/Realtime
- [ ] Final integrated UI review and real authenticated browser smoke after server migration
- [ ] Decide final rollout flags BEFORE the single Vercel Production build
- [ ] Explicit approval for Production DB migration and later main branch merge

## Rollout and rollback boundaries
1. Pass CI; keep both feature flags OFF in all current Production builds.
2. Review CLI-generated migration, check Supabase migration history and backup, then authorize DB application separately.
3. Verify installed RPC with authenticated members and outsider rejection.
4. Set lobby and race Vite flags before building; if the race HUD layout is not yet approved, enable lobby only and keep race OFF.
5. Merge this all-in-one PR to main ONCE when ready; inspect actual rendered UI and restore previous Production deployment if frontend fails.
6. Reverting a frontend Vite flag requires a new build. Reverting frontend does not revert a DB migration. Plan an independent DB rollback if needed.

## Evidence limits
- Isolated Chromium fixtures reuse real player-card components and CSS but are not screenshots of a signed-in live game.
- Disposable Supabase 6-person group E2E proves server fanout/RLS; real user account Playwright login through Production/Preview remains a separate release gate.
- No Production SQL/DDL, Vercel env mutation, flag activation, or Production deployment was made during this review.

## Additional integration inspection
- Production migration history had **58** versions, while current main contained **57**. The only missing version `20261110080546` belongs to OAuth PR #54 and is already applied remotely.
- This unified release tree includes the exact unchanged blob `supabase/migrations/20261110080546_oauth_profile_onboarding_v1.sql` from PR #54 (SHA e265b8d6fcdca259bdd8db231422002828500eb9). This reconciles existing history, does NOT enable OAuth in this PR, and introduces no remote changes by itself. Coordinate future PR #54 merge to avoid redundant review.
- In six-person races the horizontal reaction strip now displays newest first, so a recent reaction is not initially hidden at the far right on mobile.
