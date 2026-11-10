# Kion PR-4 — 1:1 and group active-race reactions

## Dependencies
- Stacked on PR #57 (lobby), which depends on PR #55 (ten WebPs).
- Runtime authority in PR #56: `public.send_room_emote_v1` server RPC and `room_events` Realtime RLS.
- Until all prerequisites are verified and deliberately released, this PR does not enable or deploy the feature.

## Behavior
- A small **in-flow** reaction strip sits below the duel opponent strip and below the group race HUD, above the wiki document. It never overlays document links, item slots or route controls when closed.
- Same ten approved Kion presets as PR #55: hello/ready/go/good/wait/hurry/wow/lol/sad/gg.
- Sender is derived from room player snapshots, not client input; only ID and room ID go to PR #56's RPC.
- Server owns membership, cooldown and expiry. Client adds a 3-second UI disable after success/rate-limit rejection, but never claims authority.
- Incoming events are filtered to the selected room and type `room_emote`, normalized and deduped by sender, shown only for six seconds.
- F5/reconnect restores the last 30 events, but **older events are not re-animated**.
- A local hide/show toggle lets the racer ignore reactions without impacting other players or changing server state.
- Group spectator's original 5 legacy `send_group_spectator_emoji_v13` buttons are not replaced.
- Result-screen emotes are NOT mounted in this PR; avoid cross-phase side effects and keep PR-4 limited to active gameplay.

## Default-off gate
- `VITE_ENABLE_KION_RACE_EMOTES` must equal literal `true` for runtime components to mount.
- When the RPC is unavailable, the default public build has no selectable emote buttons or requests.
- Active race only: `phase === PLAYING`, room `playing|grace_period`, and current member `player_status === playing`.
- No edits to move authority, XP/leaderboard, match result, game/room lifecycle, or active items.

## Validation
- Static/integration tests: direct mount, route controls preserved, expiry, dedup, mute, no direct room_events writes.
- Browser fixture: duel + group at 320/390/768/1280px, ten-option picker, send mock, ESC, hide/restore, underlying wiki & item button clicks, no image/JS/viewport overflow.
- Real-account two-client Realtime and simultaneous sends remain blocked pending an authorized test backend (PR #56).
- PR remains Draft. No Vercel, no production DB migration or rollout.

## Pre-integration fixes (2026-11-11)
- **Separate flag** `VITE_ENABLE_KION_RACE_EMOTES=true`: turning on validated lobby speech cards must not accidentally activate the still-under-review race reaction bar. Both remain OFF unless explicitly opted in.
- Backfill on SUBSCRIBED, after 4s WAL warmup, and on foreground return; a six-second TTL still filters stale reactions.
- Incoming reaction display is strictly room-scoped; a pending event from a previous room cannot flash in the next race.
- Client double-submit guard blocks duplicate rapid clicks before React rerender. The old duel game event receiver silently ignores `room_emote`, avoiding debug spam and keeping action processing unchanged.
- This PR still diverges from the latest PR #57; perform a clean integration rebase before production.
