# Kion PR-2 — room emote authority (Draft; Production untouched)

## Dependency & scope
- Base: main, so this PR can be reviewed while PR #55 (Kion images / shared picker) remains a separate Draft.
- Approved IDs: hello, ready, go, good, wait, hurry, wow, lol, sad, gg.
- PR-2 includes backend RPC SQL **review draft**, a client service adapter, pure event-normalization helpers, and tests.
- PR-3/4 will attach KionEmotePicker and bubble UI to lobbies / duel & group race / result screens after PR #55 is merged. No interactive UI in PR-2.

## Server contract
RPC: public.send_room_emote_v1(p_room_id uuid, p_emote_id text) → jsonb.

Success: {"accepted": true, "code": "ACCEPTED", "event_id": "<uuid>", "event": { room_events row }}.
Domain denials (no event / cooldown consumed): EMOTE_INVALID, ROOM_NOT_AVAILABLE, SENDER_NOT_ACTIVE, ROOM_EXPIRED, EMOTE_RATE_LIMIT. Missing auth: AUTH_REQUIRED exception.

- Caller identity derives only from auth.uid(), never user-supplied userId.
- Permission: existing room_players membership; public room visibility does *not* grant send permission.
- Modes: duel / group. Statuses: waiting, starting, playing, group grace_period; after finish only 2 minutes for GG/result reactions. In that short result window, retired (forfeit/loss) players may also react. Disconnected/retired members cannot send during the match.
- Group's authoritative game/grace deadline is checked, and the function does NOT finalize the room itself.
- Anti-spam: per-room/per-user 3 seconds enforced atomically by an internal RLS-protected private ledger.
- Exactly one server-owned room_events row per accepted send: event_type = room_emote, payload = {"emoteId":"go","serverSentAt":...}.
- Browser has SELECT-only access to room_events, filtered by existing room member RLS. No direct INSERT / arbitrary payload, no extra JWT token, no service role in the client.
- room_events is already in Supabase Realtime publication; PR-3/4 should filter INSERT by room_id and then accept only event_type === "room_emote". Rehydrate via fetchRecentRoomEmotes, clamp 1–40. React only to live/new events or short-lived recent ones, never replay all history as toast notifications.
- Existing send_group_spectator_emoji_v13 and its legacy IDs, rate ledger, result/XP, ranking, moves, matchmaking remain untouched.

## Current implementation gate
The connected environment cannot run a local Supabase CLI or start the repository's isolated DB. Consequently:
1. SQL remains in docs/ops/sql/room_emotes_v1.review.sql and is **not** under supabase/migrations. This prevents automatic Production rollout before DB verification.
2. On the local/Codex checkout run the pinned repo CLI: npx supabase migration new room_emotes_v1. The CLI provides the timestamped migration filename (do not guess/edit historical versions). Copy the review SQL into that new file.
3. Start the isolated Supabase stack, run the full migration reset / diff and test supabase/tests/room_emotes_v1.sql with psql and ON_ERROR_STOP=1. The test contains 20 pgTAP assertions and rolls back its fixture. Also run the existing group_spectator_emoji_atomicity suite and room_events RLS regression.
4. Test simultaneous sends from two tabs of the same user (one success and one cooldown) plus distinct users (both accepted). Test live Realtime delivery to group and duel room members, cross-room denial, and mobile background/foreground reconnect.
5. Run npm test and npm run build. After PR #55 asset UI is approved, perform the two-account browser visual QA before wiring PR-3/4.
6. Get explicit owner approval before applying this migration to Production. PR remains Draft until then.

## Current known verification
- Read-only Production schema inspection on 2026-11-10: room_events has authenticated SELECT but no authenticated INSERT; RLS SELECT restricts to room members; room_events is in the supabase_realtime publication in repository baseline.
- Source review: PR #55 10-id catalogue, legacy spectator v13 behavior & three-second cooldown, current room/player status CHECK definitions.
- SQL execution and two-client Realtime QA: **NOT RUN**; do not mark PASS.
